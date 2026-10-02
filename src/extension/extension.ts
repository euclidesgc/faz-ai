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
import { AiRunner } from './runner';
import { Heartbeat } from './heartbeat';
import { AutoMerger } from './merge';
import { loginShellPath, spawnHeadless } from './spawn';
import { cardRef } from '../shared/model';
import { humanQueueStatuses, turnsPassedToHuman } from '../shared/pending';

let handle: DbHandle | null = null;
let stopMcp: (() => void) | null = null;
let runner: AiRunner | null = null;
let heartbeat: Heartbeat | null = null;
let heartbeatTimer: NodeJS.Timeout | undefined;
const HEARTBEAT_KEY = 'fazai.heartbeatEnabled';

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
      // o que já estava com a pessoa ao abrir não gera aviso; só o que a IA passar daqui em diante
      let withHuman = humanQueueStatuses(router.snapshot());
      const onBoardChange = () => {
        tree.refresh();
        const state = router.snapshot();
        const passed = turnsPassedToHuman(withHuman, state);
        withHuman = humanQueueStatuses(state);
        treeView.badge = withHuman.size ? { value: withHuman.size, tooltip: `${withHuman.size} card(s) esperando por você` } : undefined;
        for (const card of passed) {
          const label = state.board.appearance.statuses[card.status!].label;
          void vscode.window.showInformationMessage(`${cardRef(card)} ${card.title}: ${label}`, 'Abrir card').then((choice) => choice && openBoard(card.id));
        }
      };
      router.onDidChange(onBoardChange);
      onBoardChange();
      const pathEnv = await loginShellPath();
      runner = new AiRunner(router, {
        cwd: f.uri.fsPath,
        homeDir: os.homedir(),
        log: (line) => output.appendLine(`${new Date().toLocaleTimeString()} ${line}`),
        spawn: (command, cwd, log) => spawnHeadless(command, cwd, log, pathEnv),
      });
      new AutoMerger(router, {
        cwd: f.uri.fsPath,
        log: (line) => output.appendLine(`${new Date().toLocaleTimeString()} ${line}`),
        gh: (args, cwd) =>
          new Promise((resolve, reject) => {
            execFile('gh', args, { cwd, timeout: 120_000, env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}) } }, (err, stdout, stderr) =>
              err ? reject(new Error((err as NodeJS.ErrnoException).code === 'ENOENT' ? 'o comando "gh" (GitHub CLI) não foi encontrado.' : stderr.trim() || err.message)) : resolve(stdout),
            );
          }),
      });
      heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => Date.now(), log: (line) => output.appendLine(`${new Date().toLocaleTimeString()} ${line}`) });
      heartbeat.onDidChange(updateStatusBar);
      router.onDidChange(updateStatusBar);
      // lembra, por pasta, se o heartbeat está ligado: só nesse caso o board é carregado ao abrir o editor
      const rememberHeartbeat = () => void context.workspaceState.update(HEARTBEAT_KEY, router.snapshot().board.runner.heartbeat);
      router.onDidChange(rememberHeartbeat);
      rememberHeartbeat();
      updateStatusBar();
      // só a janela que serve o board desta pasta (dona do servidor MCP) roda o heartbeat, para duas janelas não chamarem a IA em dobro
      heartbeatTimer = setInterval(() => stopMcp && heartbeat?.tick(), 60_000);
      void offerBoardUpgrade(context, router);
      return router;
    })();
    return routerPromise;
  };

  const output = vscode.window.createOutputChannel('Faz AI');
  /** Chama ou interrompe a IA num card; erros (ferramenta sem suporte, card já em execução) aparecem como aviso. */
  const aiCommand = (action: 'start' | 'stop') => async (cardId: string) => {
    if (!(await getRouter()) || !runner) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
    try {
      runner[action](cardId);
    } catch (e) {
      vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.command = 'fazai.showLog';
  /** Mostra na barra de status o heartbeat ligado e as execuções em andamento. */
  const updateStatusBar = () => {
    if (!routerPromise || !heartbeat || !runner) return statusBar.hide();
    void routerPromise.then((router) => {
      const s = router.snapshot();
      const running = s.cards.filter((c) => s.aiRuns.includes(c.id)).map(cardRef);
      const next = heartbeat?.nextRoundAt;
      if (!running.length && !next) return statusBar.hide();
      statusBar.text = running.length ? `$(sync~spin) Faz AI: ${running.join(', ')}${heartbeat!.queued ? ` +${heartbeat!.queued}` : ''}` : '$(pulse) Faz AI';
      statusBar.tooltip = [
        running.length ? `A IA está trabalhando em ${running.join(', ')}.` : 'Nenhuma execução em andamento.',
        next ? `Heartbeat ligado: próxima rodada às ${new Date(next).toLocaleTimeString()}.` : 'Heartbeat desligado.',
        'Clique para ver o log.',
      ].join('\n');
      statusBar.show();
    });
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
    output,
    vscode.commands.registerCommand('fazai.ai.run', aiCommand('start')),
    vscode.commands.registerCommand('fazai.ai.stop', aiCommand('stop')),
    statusBar,
    vscode.commands.registerCommand('fazai.showLog', () => output.show(true)),
    vscode.commands.registerCommand('fazai.heartbeat.runNow', async () => {
      if (!(await getRouter()) || !heartbeat) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
      const n = heartbeat.runNow();
      vscode.window.showInformationMessage(n ? `Faz AI: a IA vai tratar ${n} história(s) com pendência. O andamento aparece nos cards e em Saída → Faz AI.` : 'Faz AI: nada pendente com a IA.');
    }),
    vscode.commands.registerCommand('fazai.heartbeat.stop', () => heartbeat?.stop()),
    vscode.commands.registerCommand('fazai.upgradeBoard', async () => {
      const router = await getRouter();
      if (!router) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
      if (!router.snapshot().pendingUpgrade.length) return void vscode.window.showInformationMessage('Este board já está no padrão atual.');
      await offerBoardUpgrade(context, router, true);
    }),
  );

  // regras e skills editadas por fora (editor, IA, git) aparecem no board
  const wf = folder();
  if (wf) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(wf, '{CLAUDE.md,CLAUDE.local.md,AGENTS.md,AGENTS.override.md,.mcp.json,.vscode/mcp.json,.claude/**,.agents/**,.codex/**,.cursor/**,.kimi/**,.kimi-code/**,.github/{skills*,agents,instructions,prompts,hooks,copilot}/**,.github/copilot-instructions.md,.github/mcp.json}'));
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
    // com o heartbeat ligado nesta pasta, o board precisa estar carregado para a rotina rodar sem ninguém abri-lo
    if (context.workspaceState.get<boolean>(HEARTBEAT_KEY)) void getRouter();
  }
}

/**
 * Board criado por uma versão anterior: pergunta se a pessoa quer levá-lo ao padrão atual. A
 * atualização só acrescenta e completa (nenhum card sai do lugar). "Agora não" vale até a próxima
 * versão da extensão; `force` pergunta de novo mesmo assim (comando manual).
 */
async function offerBoardUpgrade(context: vscode.ExtensionContext, router: MessageRouter, force = false): Promise<void> {
  const { board, pendingUpgrade } = router.snapshot();
  if (!pendingUpgrade.length) return;
  const key = `fazai.upgradeDismissed.${board.id}`;
  const version = String(context.extension.packageJSON.version);
  if (!force && context.globalState.get<string>(key) === version) return;
  const choice = await vscode.window.showInformationMessage(
    `O board padrão do Faz AI mudou. Atualizar o board "${board.name}"? Nenhum card sai do lugar e o que você personalizou é mantido.`,
    { modal: true, detail: pendingUpgrade.join('\n') },
    'Atualizar board',
    'Agora não',
  );
  if (choice === 'Atualizar board') router.handle({ type: 'settings.board.upgrade' });
  else await context.globalState.update(key, version);
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
  clearInterval(heartbeatTimer);
  heartbeat?.stop();
  heartbeat = null;
  runner?.dispose();
  runner = null;
  stopMcp?.();
  stopMcp = null;
  await handle?.close();
  handle = null;
}
