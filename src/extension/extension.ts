import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { openFile, type DbHandle } from './db/database';
import { registerClients, type Registration } from './mcp/clientConfig';
import { startMcpServer } from './mcp/server';
import { socketPath, workspaceKey } from './mcp/socketPath';
import { BoardPanel } from './panel/BoardPanel';
import { MessageRouter } from './panel/messageRouter';
import { BoardTreeProvider } from './sidebar/BoardTreeProvider';
import { FiltersViewProvider } from './sidebar/FiltersViewProvider';
import { ViewStateStore } from './viewState';

let handle: DbHandle | null = null;
let stopMcp: (() => void) | null = null;

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
        workspaceKey: workspaceKey(f.uri.fsPath),
        folderName: f.name,
        author: await gitUserName(f.uri.fsPath),
        attachmentsDir: path.join(storage, 'attachments'),
        workspaceDir: f.uri.fsPath,
        homeDir: os.homedir(),
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
    vscode.commands.registerCommand('fazai.connectAI', () => connectAI(bridgePath, getRouter)),
  );

  // regras e skills editadas por fora (editor, IA, git) aparecem no board
  const wf = folder();
  if (wf) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(wf, '{CLAUDE.md,AGENTS.md,.claude/skills*/**,.agents/skills*/**,.cursor/skills*/**,.kimi/skills*/**,.github/skills*/**}'));
    let timer: NodeJS.Timeout | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void routerPromise?.then((r) => r.refreshHarness()), 300);
    };
    context.subscriptions.push(watcher, watcher.onDidCreate(refresh), watcher.onDidChange(refresh), watcher.onDidDelete(refresh));
  }

  // servidor MCP: deixa uma IA consultar e editar o board desta pasta (o banco só é aberto no primeiro uso)
  const bridgePath = path.join(storage, 'mcp', 'bridge.js');
  const f = folder();
  if (f) {
    try {
      fs.mkdirSync(path.dirname(bridgePath), { recursive: true });
      fs.copyFileSync(path.join(context.extensionPath, 'dist', 'mcp-bridge.js'), bridgePath);
      stopMcp = await startMcpServer(socketPath(f.uri.fsPath), {
        getRouter,
        workspaceDir: f.uri.fsPath,
        version: String((context.extension.packageJSON as { version?: string }).version ?? '0'),
      });
    } catch (e) {
      console.warn(`Faz AI: servidor MCP não iniciado: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** Registra o servidor MCP do board na configuração da ferramenta de IA em uso no projeto. */
async function connectAI(bridgePath: string, getRouter: () => Promise<MessageRouter | undefined>): Promise<void> {
  const f = vscode.workspace.workspaceFolders?.[0];
  const router = await getRouter();
  if (!f || !router) {
    vscode.window.showWarningMessage('Abra uma pasta para conectar uma IA ao board.');
    return;
  }
  const tool = router.snapshot().board.aiTool;

  let done: Registration[];
  try {
    done = registerClients([tool], { bridgePath, workspaceDir: f.uri.fsPath, homeDir: os.homedir() });
  } catch (e) {
    vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    return;
  }

  // arquivos do projeto guardam caminhos desta máquina, então normalmente não devem ir para o repositório
  const gitignore = path.join(f.uri.fsPath, '.gitignore');
  const ignoredLines = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8').split(/\r?\n/).map((l) => l.trim()) : [];
  const toIgnore = done.flatMap((d) => (d.projectFile && !ignoredLines.includes(d.projectFile) ? [d.projectFile] : []));
  const summary = [...new Set(done.map((d) => d.next))].join(' ');
  const files = done.map((d) => d.projectFile ?? d.file.replace(os.homedir(), '~')).join(', ');
  const choice = await vscode.window.showInformationMessage(
    `Servidor "faz-ai" registrado em: ${files}. ${summary}`,
    ...(toIgnore.length ? ['Adicionar ao .gitignore'] : []),
  );
  if (choice === 'Adicionar ao .gitignore') {
    const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
    fs.writeFileSync(gitignore, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${toIgnore.join('\n')}\n`);
  }
}

export async function deactivate(): Promise<void> {
  stopMcp?.();
  stopMcp = null;
  await handle?.close();
  handle = null;
}
