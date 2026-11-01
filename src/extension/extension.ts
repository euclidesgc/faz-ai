import * as vscode from 'vscode';
import type { AiRunMode } from '../shared/runner';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { bindBranchRenamePrompt } from './branchRenamePrompt';
import { createBoardHost, type BoardHost } from './host/boardHost';
import { SERVED_ELSEWHERE, startMcpServer, startMcpServerWhenFree, watchBoardRelease } from './mcp/server';
import { readBridgeVersion, socketPath, stableBridgePath, workspaceKey, writeBridgeVersion } from './mcp/socketPath';
import { registerCursorProject } from './mcp/clientConfig';
import { installCursorHook } from './mcp/cursorHooks';
import { baseInfo, type AiTool } from '../shared/harness';
import { ensureUserServers } from './mcp/reinstall';
import { resolveCommand } from './cliResolve';
import { loginShellPath } from './spawn';
import { BoardPanel } from './panel/BoardPanel';
import type { MessageRouter } from './panel/messageRouter';
import { SECTION, importIdeSettingsOnce } from './settings/ideSettings';
import type { HostToWebview } from '../shared/messages';
import { toSettingsTab } from '../shared/settingsTab';
import { BoardTreeProvider } from './sidebar/BoardTreeProvider';
import { ChatViewProvider } from './sidebar/ChatViewProvider';
import { FiltersViewProvider } from './sidebar/FiltersViewProvider';
import { ViewStateStore } from './viewState';
import { PrefsStore } from './prefs';
import type { AiRunner } from './runner';
import { Autopilot } from './autopilot';
import type { Heartbeat } from './heartbeat';
import { revealInSystem } from './web/osOpen';
import { preferredPort, startWebServer, type WebServer } from './web/webServer';
import { exportNotice, importNotice } from './host/hostBridge';
import { parseExportFile } from './db/boardExport';
import { cardRef } from '../shared/model';
import { humanQueueStatuses, turnsPassedToHuman } from '../shared/pending';

let host: BoardHost | null = null;
let stopMcp: (() => void) | null = null;
let runner: AiRunner | null = null;
let heartbeat: Heartbeat | null = null;
let autopilot: Autopilot | null = null;
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
        // UTF-8 (chcp 65001): o cmd.exe lê o .cmd na página de código do sistema, e um nome com acento
        // na pasta do usuário viraria outro caminho; `%` é dobrado para não ser lido como variável
        `@echo off\r\nchcp 65001 >nul\r\nif not defined FAZAI_DATA set "FAZAI_DATA=${storage.replace(/%/g, '%%')}"\r\nnode "${cli.replace(/%/g, '%%')}" %*\r\n`,
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
  // o board decide na criação se esta janela é a dona (`ownsBoard`): espera a subida do servidor MCP terminar
  let mcpStarting: Promise<unknown> = Promise.resolve();
  const viewState = new ViewStateStore(context.workspaceState);
  // por pessoa, não por pasta: um aviso dispensado aqui não volta em outro projeto
  const prefs = new PrefsStore(context.globalState);
  const bridgePath = stableBridgePath();
  const windowStartedAt = Date.now();
  // o Cursor é um VS Code com outro nome: o chat dele lê o ~/.cursor/mcp.json e só carrega o que mudou ao recarregar
  const editorName = /cursor/i.test(vscode.env.appName) ? 'cursor' : 'vscode';
  installLauncher(context.extensionPath, storage);

  const folder = () => vscode.workspace.workspaceFolders?.[0];

  const getRouter = (): Promise<MessageRouter | undefined> => {
    const f = folder();
    if (!f) return Promise.resolve(undefined);
    routerPromise ??= (async () => {
      await mcpStarting;
      const log = (line: string) => output.appendLine(`${new Date().toLocaleTimeString()} ${line}`);
      host = await createBoardHost({
        storageDir: storage,
        wasmDir,
        folderPath: f.uri.fsPath,
        folderName: f.name,
        bridgePath,
        log,
        version: String((context.extension.packageJSON as { version?: string }).version ?? '0'),
        ownsBoard: () => !!stopMcp,
        runInTerminal: (name, command, cwd) => {
          const terminal = vscode.window.createTerminal({ name, cwd });
          terminal.show();
          terminal.sendText(command);
        },
        // o login de um agente em Conectar agentes: o terminal roda o próprio processo do login (não um shell), e o
        // código de saída dele chega quando o terminal fecha; 0 é sucesso, como o protocolo do ACP pede
        runTerminal: (spec) =>
          new Promise((resolve) => {
            const terminal = vscode.window.createTerminal({
              name: spec.name,
              shellPath: spec.command,
              shellArgs: spec.args,
              env: spec.env,
              cwd: spec.cwd,
            });
            const closed = vscode.window.onDidCloseTerminal((t) => {
              if (t !== terminal) return;
              closed.dispose();
              resolve(t.exitStatus?.code ?? null);
            });
            context.subscriptions.push(closed);
            terminal.show();
          }),
        editor: {
          name: editorName,
          startedAt: windowStartedAt,
        },
      });
      const router = host.router;
      // a ferramenta do board aberto também recebe o servidor no usuário, sem a pessoa pedir
      ensureUserInstall(context, f.uri.fsPath, bridgePath, output, [router.snapshot().board.aiTool]);
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
            .then((choice) => choice && openBoard({ type: 'ui.openCard', cardId: card.id }));
        }
      };
      router.onDidChange(onBoardChange);
      onBoardChange();
      // mudar o nome da principal ou da develop pergunta se renomeia a branch também no origin (#466)
      context.subscriptions.push(
        bindBranchRenamePrompt(router, {
          warn: (message, modal, ...items) => vscode.window.showWarningMessage(message, { modal }, ...items),
          info: (message, ...items) => vscode.window.showInformationMessage(message, ...items),
          error: (message, ...items) => vscode.window.showErrorMessage(message, ...items),
          copy: (text) => vscode.env.clipboard.writeText(text),
        }),
      );
      // traz uma vez os valores fazai.* que a pessoa gravou no Settings do editor para o board
      importIdeSettingsOnce(vscode.workspace.getConfiguration(SECTION, f.uri), router, log);
      runner = host.runner;
      heartbeat = host.heartbeat;
      autopilot = host.autopilot;
      heartbeat.onDidChange(updateStatusBar);
      router.onDidChange(updateStatusBar);
      // lembra, por pasta, se o heartbeat está ligado: só nesse caso o board é carregado ao abrir o editor
      const rememberHeartbeat = () => void context.workspaceState.update(HEARTBEAT_KEY, router.snapshot().board.runner.heartbeat);
      router.onDidChange(rememberHeartbeat);
      rememberHeartbeat();
      updateStatusBar();
      // só a janela que serve o board desta pasta (dona do servidor MCP) roda o heartbeat, para duas janelas não chamarem a IA em dobro
      heartbeatTimer = setInterval(() => {
        if (stopMcp) {
          host?.sweepStaleRuns();
          heartbeat?.tick();
        }
      }, 60_000);
      void offerBoardUpgrade(context, router);
      return router;
    })().catch((e: unknown) => {
      // a falha não fica guardada: a próxima tentativa de abrir o board tenta de novo, sem recarregar a janela
      routerPromise = undefined;
      const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
      output.appendLine(`${new Date().toLocaleTimeString()} Não foi possível abrir o board: ${detail}`);
      throw e;
    });
    return routerPromise;
  };

  const output = vscode.window.createOutputChannel('Faz AI');
  /** Chama ou interrompe a IA num card; erros (ferramenta sem suporte, card já em execução) aparecem como aviso. */
  // vindo do board (`fromBoard`), o erro volta para ele e vira aviso na própria tela: o Cursor guarda as
  // notificações do editor na central, sem mostrar, e a pessoa clicava em Chamar IA sem ver nada acontecer
  const aiCommand = (action: 'start' | 'stop') => async (cardId: string, opts?: { fromBoard?: boolean; mode?: AiRunMode }) => {
    if (!(await getRouter()) || !runner) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
    try {
      if (action === 'start') await host?.runAi(cardId, opts?.mode);
      else if (host) host.stopAi(cardId);
      else runner.stop(cardId);
    } catch (e) {
      if (opts?.fromBoard) throw e;
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

  const openBoard = async (pending?: HostToWebview) => {
    const f = folder();
    const router = await getRouter();
    if (!f || !router) {
      vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
      return;
    }
    BoardPanel.show(context, router, viewState, prefs, f.name, pending);
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
        prefs,
        port: preferredPort(workspaceKey(f.uri.fsPath)),
        tokenFile: path.join(os.homedir(), '.faz-ai', 'web-token'),
        iconFile: path.join(context.extensionPath, 'media', 'icon.png'),
        env: {
          connectAI: async (target) => (await h.connectAI(target)).message,
          fixProjectMcp: (file) => h.fixProjectServer(file),
          runAi: (cardId, mode) => h.runAi(cardId, mode),
          stopAi: (cardId) => h.stopAi(cardId),
          pauseAutopilot: () => vscode.commands.executeCommand('fazai.autopilot.pause'),
          resumeAutopilot: () => vscode.commands.executeCommand('fazai.autopilot.resume'),
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

  /** Exporta o board da pasta atual para um arquivo, pela paleta de comandos (sem precisar abrir o board). */
  const exportBoard = async () => {
    const router = await getRouter();
    if (!router) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
    const { text, name, warnings } = router.exportBoardFile();
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(os.homedir(), name)),
      filters: { 'Export do Faz AI': ['json'] },
      title: 'Exportar board',
    });
    if (!uri) return;
    await fs.promises.writeFile(uri.fsPath, text, 'utf8');
    const choice = await vscode.window.showInformationMessage(exportNotice(uri.fsPath, warnings), 'Abrir pasta');
    if (choice === 'Abrir pasta') revealInSystem(uri.fsPath);
  };

  /** Importa um arquivo de export para o board da pasta atual, pela paleta de comandos (sem precisar abrir o board). */
  const importBoard = async () => {
    const router = await getRouter();
    if (!router) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Export do Faz AI': ['json'] },
      title: 'Importar board',
    });
    const uri = uris?.[0];
    if (!uri) return;
    try {
      const text = await fs.promises.readFile(uri.fsPath, 'utf8');
      const parsed = parseExportFile(text);
      const { token, summary } = router.parkImport(parsed, Buffer.byteLength(text));
      const boardName = folder()?.name ?? 'atual';
      const choice = await vscode.window.showWarningMessage(
        `Importar "${summary.boardName}" vai substituir o board "${boardName}" por ${summary.cards} card(s) e ${summary.attachments} anexo(s). Uma cópia de segurança (.bak) do board atual é feita antes.`,
        { modal: true },
        'Importar',
      );
      if (choice !== 'Importar') {
        router.discardImport(token);
        return;
      }
      const result = router.applyImport(token);
      vscode.window.showInformationMessage(importNotice(result));
    } catch (e) {
      vscode.window.showErrorMessage(`Faz AI: não foi possível importar o board: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  context.subscriptions.push(
    treeView,
    vscode.window.registerWebviewViewProvider('fazai.filters', new FiltersViewProvider(context, getRouter, viewState, prefs), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider('fazai.chat', new ChatViewProvider(context, getRouter, viewState, prefs), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    // clicar no ícone da barra lateral já abre o board
    treeView.onDidChangeVisibility((e) => {
      if (e.visible && folder()) void openBoard();
    }),
    // só para quem desenvolve: o scripts/dev-install.sh instala a VSIX nova e abre vscode://euclidesgc.faz-ai/reload,
    // que esta versão (a antiga, ainda carregada) atende recarregando a janela, que volta já com a nova
    vscode.window.registerUriHandler({
      handleUri: (uri) => {
        if (uri.path === '/reload') void vscode.commands.executeCommand('workbench.action.reloadWindow');
      },
    }),
    vscode.commands.registerCommand('fazai.openBoard', () => openBoard()),
    vscode.commands.registerCommand('fazai.openCard', (cardId: string) => openBoard({ type: 'ui.openCard', cardId })),
    vscode.commands.registerCommand('fazai.openBoardSettings', (args?: { tab?: unknown; section?: string }) =>
      openBoard({ type: 'ui.openSettings', tab: toSettingsTab(args?.tab), section: args?.section }),
    ),
    vscode.commands.registerCommand('fazai.openEnvironment', () => openBoard({ type: 'ui.openView', view: 'environment' })),
    vscode.commands.registerCommand('fazai.refreshSidebar', () => tree.refresh()),
    vscode.commands.registerCommand('fazai.openInBrowser', openInBrowser),
    // o rastreio do dia: cada ação da tela, mudança, ferramenta MCP e execução, para investigar um defeito
    vscode.commands.registerCommand('fazai.openTrace', async () => {
      const file = (await getRouter())?.trace.file();
      if (!file || !fs.existsSync(file)) return void vscode.window.showInformationMessage('Ainda não há rastreio do board hoje.');
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
    }),
    vscode.commands.registerCommand('fazai.exportBoard', exportBoard),
    vscode.commands.registerCommand('fazai.importBoard', importBoard),
    vscode.commands.registerCommand('fazai.connectAI', (target?: Parameters<BoardHost['connectAI']>[0], opts?: { fromBoard?: boolean }) =>
      connectAI(getRouter, target, opts),
    ),
    // vindo do aviso de requisitos do board: o resultado e o erro voltam para a tela
    vscode.commands.registerCommand('fazai.fixProjectMcp', async (file: string) => {
      if (!(await getRouter()) || !host) throw new Error('Abra uma pasta para conectar uma IA ao board.');
      return host.fixProjectServer(file);
    }),
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
    // parar interrompe também o autopiloto: sem isso ele chamaria a IA de novo na hora
    vscode.commands.registerCommand('fazai.heartbeat.stop', () => {
      autopilot?.pause();
      heartbeat?.stop();
    }),
    vscode.commands.registerCommand('fazai.autopilot.pause', () => autopilot?.pause()),
    vscode.commands.registerCommand('fazai.autopilot.resume', async () => {
      if (!(await getRouter()) || !autopilot) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
      // sem ser a dona do board, esta janela não pode tocar a fila: avisa em vez de parecer que o botão não fez nada
      if (!autopilot.resume()) void vscode.window.showWarningMessage(`Faz AI: ${Autopilot.NOT_OWNER_NOTE}`);
    }),
    vscode.commands.registerCommand('fazai.upgradeBoard', async () => {
      const router = await getRouter();
      if (!router) return void vscode.window.showWarningMessage('Abra uma pasta para usar o board do Faz AI.');
      if (!router.snapshot().pendingUpgrade.length) return void vscode.window.showInformationMessage('Este board já está no padrão atual.');
      await offerBoardUpgrade(context, router, true);
    }),
  );

  // servidor MCP: deixa uma IA consultar e editar o board desta pasta (o banco só é aberto no primeiro uso)
  const f = folder();
  if (f) {
    const address = socketPath(f.uri.fsPath);
    const mcpOptions = {
      getRouter,
      getRunner: async () => {
        await getRouter();
        return runner ?? undefined;
      },
      workspaceDir: f.uri.fsPath,
      version: String((context.extension.packageJSON as { version?: string }).version ?? '0'),
    };
    try {
      fs.mkdirSync(path.dirname(bridgePath), { recursive: true });
      fs.copyFileSync(path.join(context.extensionPath, 'dist', 'mcp-bridge.js'), bridgePath);
      // no Cursor, o servidor do board é registrado no projeto assim que a pasta abre, antes de o board
      // ser aberto: o chat do editor enxerga o board sem a pessoa instalar nada (o global não funciona
      // no Cursor; veja registerCursorProject)
      if (editorName === 'cursor') void registerInCursor(f.uri.fsPath, bridgePath, output);
      // o hook garante a execução pelo cursor-agent, que roda também fora do editor Cursor (o board no VS Code
      // com o perfil Cursor): no Cursor sempre; nos outros editores, quando a CLI existe no PATH do terminal
      void installBoardCursorHook(context, bridgePath, output, editorName !== 'cursor');
      // em segundo plano: a CLI da ferramenta pode demorar, e o servidor do board não depende dela
      ensureUserInstall(context, f.uri.fsPath, bridgePath, output, []);
      const starting = startMcpServerWhenFree(address, mcpOptions);
      mcpStarting = starting.catch(() => undefined);
      stopMcp = await starting;
    } catch (e) {
      servedElsewhere = e instanceof Error && e.message === SERVED_ELSEWHERE;
      console.warn(`Faz AI: servidor MCP não iniciado: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (servedElsewhere) {
      const stopWatching = watchBoardRelease(address, {
        // com o board ainda não carregado nesta janela, não há nada desatualizado: ela passa a servir sozinha
        canTakeOver: () => !routerPromise,
        takeOver: async () => {
          const starting = startMcpServer(address, mcpOptions);
          mcpStarting = starting.catch(() => undefined);
          stopMcp = await starting;
          servedElsewhere = false;
          output.appendLine(
            `${new Date().toLocaleTimeString()} O outro lugar que atendia o board desta pasta fechou: esta janela passou a atendê-lo.`,
          );
        },
        // o board carregado aqui pode não ter o que a outra janela gravou: assumir sem recarregar sobrescreveria
        released: () =>
          void vscode.window
            .showWarningMessage(
              'Faz AI: o outro lugar que atendia o board desta pasta fechou. Recarregue esta janela para ela passar a atender o board; até lá, a IA não roda por aqui.',
              'Recarregar janela',
            )
            .then((choice) => choice && vscode.commands.executeCommand('workbench.action.reloadWindow')),
      });
      context.subscriptions.push({ dispose: stopWatching });
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

/** As instalações rodam uma de cada vez: duas CLIs ao mesmo tempo escreveriam o mesmo arquivo global. */
let ensuring: Promise<void> = Promise.resolve();
/** Num workspace com várias pastas só a primeira instala: o registro é global. */
let ensureFolder: string | undefined;

/**
 * Instala ou atualiza, em silêncio, o MCP do board no escopo do usuário (e a skill do fluxo, se ela não
 * existe), nas ferramentas já registradas e em `wanted` (a do board aberto). A versão da extensão só é
 * gravada ao lado da ponte quando tudo deu certo; sucesso não mostra nada. Falha vira aviso com o
 * caminho para instalar com um clique (a faixa do board tem o botão). Registro de projeto é ignorado.
 */
function ensureUserInstall(
  context: vscode.ExtensionContext,
  folderPath: string,
  bridgePath: string,
  output: vscode.OutputChannel,
  wanted: AiTool[],
): void {
  if (ensureFolder !== undefined && ensureFolder !== folderPath) return;
  ensureFolder = folderPath;
  ensuring = ensuring.then(async () => {
    const version = String(context.extension.packageJSON.version);
    try {
      const homeDir = os.homedir();
      const pathEnv = (await loginShellPath()) ?? process.env.PATH;
      const nodeCommand = resolveCommand('node', pathEnv, homeDir) ?? undefined;
      const installedVersion = readBridgeVersion(homeDir);
      const { done, failed } = await ensureUserServers({
        bridgePath,
        workspaceDir: folderPath,
        homeDir,
        nodeCommand,
        pathEnv,
        installedVersion,
        currentVersion: version,
        wanted,
      });
      if (done.length) output.appendLine(`Faz AI ${version}: servidor do board instalado no usuário em ${done.join(', ')}.`);
      if (!failed.length) {
        if (installedVersion !== version) writeBridgeVersion(version, homeDir);
        return;
      }
      for (const f of failed)
        output.appendLine(`Faz AI: não foi possível instalar o servidor do board no ${baseInfo(f.tool).label}: ${f.message}`);
      const open = 'Abrir o board';
      const choice = await vscode.window.showWarningMessage(
        `Faz AI: não foi possível instalar o servidor MCP do board no ${failed.map((f) => baseInfo(f.tool).label).join(', ')}. Abra o board e use "Instalar" na faixa de avisos.`,
        open,
      );
      if (choice === open) void vscode.commands.executeCommand('fazai.openBoard');
    } catch (e) {
      output.appendLine(`Faz AI: não foi possível instalar o servidor do board: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

/** O registro do board no `.cursor/mcp.json` do projeto, com o node achado no PATH do terminal. */
async function registerInCursor(folderPath: string, bridgePath: string, output: vscode.OutputChannel): Promise<void> {
  const homeDir = os.homedir();
  try {
    const node = resolveCommand('node', (await loginShellPath()) ?? process.env.PATH, homeDir) ?? undefined;
    registerCursorProject({ bridgePath, workspaceDir: folderPath, homeDir, nodeCommand: node });
  } catch (e) {
    output.appendLine(`Não foi possível registrar o servidor do board no Cursor: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Registra o servidor MCP do board numa ferramenta de IA. Pela paleta de comandos, sem argumento, é a
 * instalação padrão: a ferramenta do projeto, no escopo global. Vindo do board (`fromBoard`), o
 * resultado volta como texto e o erro é relançado, para virarem aviso na própria tela: o Cursor guarda
 * as notificações do editor na central sem mostrá-las, e a instalação parecia não fazer nada.
 */
async function connectAI(
  getRouter: () => Promise<MessageRouter | undefined>,
  target?: Parameters<BoardHost['connectAI']>[0],
  opts?: { fromBoard?: boolean },
): Promise<string | undefined> {
  if (!(await getRouter()) || !host) {
    const message = 'Abra uma pasta para conectar uma IA ao board.';
    if (opts?.fromBoard) throw new Error(message);
    vscode.window.showWarningMessage(message);
    return;
  }
  let done: Awaited<ReturnType<BoardHost['connectAI']>>;
  try {
    done = await host.connectAI(target);
  } catch (e) {
    if (opts?.fromBoard) throw e;
    vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    return;
  }
  if (opts?.fromBoard) return done.message;
  void vscode.window.showInformationMessage(done.message);
}

export async function deactivate(): Promise<void> {
  clearInterval(heartbeatTimer);
  web?.close();
  web = null;
  heartbeat = null;
  autopilot = null;
  runner = null;
  stopMcp?.();
  stopMcp = null;
  await host?.dispose();
  host = null;
}

/**
 * Copia o script do hook ao lado da ponte e o registra no ~/.cursor/hooks.json global; sem efeito fora de uma
 * execução do board. Com `onlyWithCli`, só mexe na home de quem tem o `cursor-agent` instalado.
 */
async function installBoardCursorHook(
  context: vscode.ExtensionContext,
  bridgePath: string,
  output: vscode.OutputChannel,
  onlyWithCli = false,
): Promise<void> {
  try {
    const homeDir = os.homedir();
    const pathEnv = (await loginShellPath()) ?? process.env.PATH;
    if (onlyWithCli && !resolveCommand('cursor-agent', pathEnv, homeDir)) return;
    const scriptPath = path.join(path.dirname(bridgePath), 'cursor-hook.js');
    fs.copyFileSync(path.join(context.extensionPath, 'dist', 'cursor-hook.js'), scriptPath);
    const nodeCommand = resolveCommand('node', pathEnv, homeDir) ?? undefined;
    const r = installCursorHook({ homeDir, scriptPath, nodeCommand });
    if (r === 'invalid') output.appendLine('[hook] ~/.cursor/hooks.json não é um JSON válido; o hook do board não foi registrado.');
  } catch (e) {
    output.appendLine(`[hook] não foi possível registrar o hook do Cursor: ${e instanceof Error ? e.message : String(e)}`);
  }
}
