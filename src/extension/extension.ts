import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { createBoardHost, type BoardHost } from './host/boardHost';
import { startMcpServer } from './mcp/server';
import { socketPath, workspaceKey } from './mcp/socketPath';
import { BoardPanel } from './panel/BoardPanel';
import type { MessageRouter } from './panel/messageRouter';
import { BoardTreeProvider } from './sidebar/BoardTreeProvider';
import { FiltersViewProvider } from './sidebar/FiltersViewProvider';
import { ViewStateStore } from './viewState';
import type { AiRunner } from './runner';
import type { Heartbeat } from './heartbeat';
import { revealInSystem } from './web/osOpen';
import { preferredPort, startWebServer, type WebServer } from './web/webServer';
import { cardRef } from '../shared/model';
import { humanQueueStatuses, turnsPassedToHuman } from '../shared/pending';

let host: BoardHost | null = null;
let stopMcp: (() => void) | null = null;
let runner: AiRunner | null = null;
let heartbeat: Heartbeat | null = null;
let heartbeatTimer: NodeJS.Timeout | undefined;
let web: WebServer | null = null;
/** outra janela do editor (ou o faz-ai do terminal) já serve o board desta pasta */
let servedElsewhere = false;
const HEARTBEAT_KEY = 'fazai.heartbeatEnabled';

/**
 * Deixa em ~/.faz-ai/bin um atalho para abrir o board fora do editor (`faz-ai [pasta]`), apontando
 * para esta versão da extensão e para os mesmos dados.
 */
function installLauncher(extensionPath: string, storage: string): void {
  try {
    const bin = path.join(os.homedir(), '.faz-ai', 'bin');
    const cli = path.join(extensionPath, 'dist', 'cli.js');
    fs.mkdirSync(bin, { recursive: true });
    if (process.platform === 'win32') {
      fs.writeFileSync(
        path.join(bin, 'faz-ai.cmd'),
        `@echo off\r\nif not defined FAZAI_DATA set "FAZAI_DATA=${storage}"\r\nnode "${cli}" %*\r\n`,
      );
    } else {
      const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
      fs.writeFileSync(
        path.join(bin, 'faz-ai'),
        `#!/bin/sh\n# Gerado pela extensão Faz AI: abre o board de uma pasta no navegador, sem o editor.\nFAZAI_DATA="\${FAZAI_DATA:-${storage.replace(/(["$`\\])/g, '\\$1')}}" exec node ${quote(cli)} "$@"\n`,
        { mode: 0o755 },
      );
    }
  } catch (e) {
    console.warn(`Faz AI: atalho de terminal não instalado: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storage = context.globalStorageUri.fsPath;
  const wasmDir = path.join(context.extensionPath, 'dist');
  let routerPromise: Promise<MessageRouter> | undefined;
  const viewState = new ViewStateStore(context.workspaceState);
  const bridgePath = path.join(storage, 'mcp', 'bridge.js');
  installLauncher(context.extensionPath, storage);

  const folder = () => vscode.workspace.workspaceFolders?.[0];

  const getRouter = (): Promise<MessageRouter | undefined> => {
    const f = folder();
    if (!f) return Promise.resolve(undefined);
    routerPromise ??= (async () => {
      const log = (line: string) => output.appendLine(`${new Date().toLocaleTimeString()} ${line}`);
      host = await createBoardHost({ storageDir: storage, wasmDir, folderPath: f.uri.fsPath, folderName: f.name, bridgePath, log });
      const router = host.router;
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
          void vscode.window
            .showInformationMessage(`${cardRef(card)} ${card.title}: ${label}`, 'Abrir card')
            .then((choice) => choice && openBoard(card.id));
        }
      };
      router.onDidChange(onBoardChange);
      onBoardChange();
      runner = host.runner;
      heartbeat = host.heartbeat;
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
      statusBar.text = running.length
        ? `$(sync~spin) Faz AI: ${running.join(', ')}${heartbeat!.queued ? ` +${heartbeat!.queued}` : ''}`
        : '$(pulse) Faz AI';
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
    if (servedElsewhere) {
      servedElsewhere = false; // avisa uma vez
      void vscode.window.showWarningMessage(
        'O board desta pasta já está aberto em outro lugar (outra janela do editor ou o comando faz-ai no terminal). Use só um deles por vez: o que for alterado aqui pode ser sobrescrito pelo outro.',
      );
    }
  };

  /** Serve o board desta janela numa página local e a abre no navegador; o editor continua sendo quem guarda o board. */
  const openInBrowser = async () => {
    const f = folder();
    const router = await getRouter();
    if (!f || !router || !host) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
    const h = host;
    try {
      web ??= await startWebServer({
        webviewDir: path.join(context.extensionPath, 'dist', 'webview'),
        router,
        viewState,
        port: preferredPort(workspaceKey(f.uri.fsPath)),
        tokenFile: path.join(os.homedir(), '.faz-ai', 'web-token'),
        iconFile: path.join(context.extensionPath, 'media', 'icon.png'),
        env: {
          connectAI() {
            const { message, toIgnore } = h.connectAI();
            return toIgnore.length
              ? `${message} Esses arquivos guardam caminhos desta máquina: considere colocar no .gitignore: ${toIgnore.join(', ')}.`
              : message;
          },
          runAi: (cardId) => h.runner.start(cardId),
          stopAi: (cardId) => h.runner.stop(cardId),
          runHeartbeat: () => vscode.commands.executeCommand('fazai.heartbeat.runNow'),
          openFolder: (dir) => vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir), { forceNewWindow: true }),
          openFile: (file) => vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file)),
          openExternal: (file) => vscode.env.openExternal(vscode.Uri.file(file)),
          revealFile: revealInSystem,
        },
      });
      await vscode.env.openExternal(vscode.Uri.parse(web.url));
    } catch (e) {
      vscode.window.showErrorMessage(`Faz AI: não foi possível abrir o board no navegador: ${e instanceof Error ? e.message : String(e)}`);
    }
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
    vscode.commands.registerCommand('fazai.openInBrowser', openInBrowser),
    vscode.commands.registerCommand('fazai.connectAI', () => connectAI(getRouter)),
    output,
    vscode.commands.registerCommand('fazai.ai.run', aiCommand('start')),
    vscode.commands.registerCommand('fazai.ai.stop', aiCommand('stop')),
    statusBar,
    vscode.commands.registerCommand('fazai.showLog', () => output.show(true)),
    vscode.commands.registerCommand('fazai.heartbeat.runNow', async () => {
      if (!(await getRouter()) || !heartbeat) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
      const n = heartbeat.runNow();
      vscode.window.showInformationMessage(
        n
          ? `Faz AI: a IA vai tratar ${n} história(s) com pendência. O andamento aparece nos cards e em Saída → Faz AI.`
          : 'Faz AI: nada pendente com a IA.',
      );
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
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        wf,
        '{CLAUDE.md,CLAUDE.local.md,AGENTS.md,AGENTS.override.md,.mcp.json,.vscode/mcp.json,.claude/**,.agents/**,.codex/**,.cursor/**,.kimi/**,.kimi-code/**,.github/{skills*,agents,instructions,prompts,hooks,copilot}/**,.github/copilot-instructions.md,.github/mcp.json}',
      ),
    );
    let timer: NodeJS.Timeout | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void routerPromise?.then((r) => r.refreshHarness()), 300);
    };
    context.subscriptions.push(watcher, watcher.onDidCreate(refresh), watcher.onDidChange(refresh), watcher.onDidDelete(refresh));
  }

  // servidor MCP: deixa uma IA consultar e editar o board desta pasta (o banco só é aberto no primeiro uso)
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
      servedElsewhere = e instanceof Error && e.message.startsWith('Já existe');
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
async function connectAI(getRouter: () => Promise<MessageRouter | undefined>): Promise<void> {
  if (!(await getRouter()) || !host) {
    vscode.window.showWarningMessage('Abra uma pasta para conectar uma IA ao board.');
    return;
  }
  let done: ReturnType<BoardHost['connectAI']>;
  try {
    done = host.connectAI();
  } catch (e) {
    vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    return;
  }
  const choice = await vscode.window.showInformationMessage(done.message, ...(done.toIgnore.length ? ['Adicionar ao .gitignore'] : []));
  if (choice === 'Adicionar ao .gitignore') host.addToGitignore(done.toIgnore);
}

export async function deactivate(): Promise<void> {
  clearInterval(heartbeatTimer);
  web?.close();
  web = null;
  heartbeat = null;
  runner = null;
  stopMcp?.();
  stopMcp = null;
  await host?.dispose();
  host = null;
}
