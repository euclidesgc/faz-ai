import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { openFile, type DbHandle } from './db/database';
import { BoardPanel } from './panel/BoardPanel';
import { MessageRouter } from './panel/messageRouter';
import { BoardTreeProvider } from './sidebar/BoardTreeProvider';
import { FiltersViewProvider } from './sidebar/FiltersViewProvider';
import { ViewStateStore } from './viewState';

let handle: DbHandle | null = null;

function gitUserName(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['config', 'user.name'], { cwd, timeout: 3000 }, (err, stdout) => {
      const name = err ? '' : stdout.trim();
      resolve(name || os.userInfo().username || 'Eu');
    });
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storage = context.globalStorageUri.fsPath;
  const wasmDir = path.join(context.extensionPath, 'dist');
  let routerPromise: Promise<MessageRouter> | undefined;
  const viewState = new ViewStateStore(context.workspaceState);

  const folder = () => vscode.workspace.workspaceFolders?.[0];

  const getRouter = (): Promise<MessageRouter | undefined> => {
    const f = folder();
    if (!f) return Promise.resolve(undefined);
    routerPromise ??= (async () => {
      handle ??= await openFile(path.join(storage, 'fazai.db'), wasmDir);
      const router = new MessageRouter(handle, {
        workspaceKey: createHash('sha1').update(f.uri.fsPath).digest('hex'),
        folderName: f.name,
        author: await gitUserName(f.uri.fsPath),
        attachmentsDir: path.join(storage, 'attachments'),
      });
      router.onDidChange(() => tree.refresh());
      return router;
    })();
    return routerPromise;
  };

  const tree = new BoardTreeProvider(getRouter);
  const treeView = vscode.window.createTreeView('fazai.sidebar', { treeDataProvider: tree, showCollapseAll: true });

  const openBoard = async (cardId?: string) => {
    const f = folder();
    const router = await getRouter();
    if (!f || !router) {
      vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
      return;
    }
    BoardPanel.show(context, router, viewState, f.name, cardId);
  };

  context.subscriptions.push(
    treeView,
    vscode.window.registerWebviewViewProvider('fazai.filters', new FiltersViewProvider(context, getRouter, viewState), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    // clicar no ícone da barra lateral já abre o board
    treeView.onDidChangeVisibility((e) => {
      if (e.visible && folder()) void openBoard();
    }),
    vscode.commands.registerCommand('fazai.openBoard', () => openBoard()),
    vscode.commands.registerCommand('fazai.openCard', (cardId: string) => openBoard(cardId)),
    vscode.commands.registerCommand('fazai.refreshSidebar', () => tree.refresh()),
  );
}

export async function deactivate(): Promise<void> {
  await handle?.close();
  handle = null;
}
