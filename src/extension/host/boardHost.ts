import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openFile, type DbHandle } from '../db/database';
import { dayOf } from '../../shared/log';
import { Autopilot } from '../autopilot';
import { Heartbeat } from '../heartbeat';
import { AiGateway } from '../ai/gateway';
import { createRunLog } from '../log/runLog';
import { consolidate } from '../log/rollup';
import { BoardRepo } from '../repositories/boardRepo';
import { registerClients, removeProjectServer } from '../mcp/clientConfig';
import { workspaceKey } from '../mcp/socketPath';
import { AutoMerger, MergeWatcher } from '../merge';
import { ReleaseWatcher } from '../release';
import { removeWorktree } from '../git';
import { MessageRouter } from '../panel/messageRouter';
import { ChatSession } from '../chat';
import { AiRunner } from '../runner';
import { claudeSignedIn, cursorModels, cursorSignedIn, runCli } from '../cliProbe';
import { aiToolInfo, type AiTool, type InstallScope } from '../../shared/harness';
import { checkRequirements } from '../requirements';
import { headlessCommand } from '../headless';
import type { BoardRequirement } from '../../shared/requirements';
import { checkEnvironment } from '../environment';
import { detectOs } from '../installers';
import { installPlan, installScript, parseInstallResult } from '../../shared/installPlan';
import { editorMcpFiles, pinEditorCommands, registeredIn, unreachableServers } from '../mcp/pinCommands';
import { FLOW_SKILL_NAME } from '../../shared/harnessProject';
import { selectedItems } from '../../shared/harnessSelection';
import { resolveCommand } from '../cliResolve';
import { fastBaseId, isFastVariant, onlyBuiltin, rememberModels } from '../models';
import { cleanStaleTemp } from '../aiOutput/measured';
import { loginShellPath, spawnHeadless } from '../spawn';

/** Complemento do nome na mensagem de "comando não encontrado", para não piorar o que a pessoa já lê no log. */
const COMMAND_HINT: Record<string, string> = { gh: ' (GitHub CLI)' };

export interface BoardHostOptions {
  /** pasta de dados do Faz AI (bancos e anexos) */
  storageDir: string;
  /** pasta com o sql-wasm.wasm */
  wasmDir: string;
  /** pasta do projeto */
  folderPath: string;
  folderName: string;
  /** caminho estável do bridge.js, entregue à ferramenta de IA para ela falar com o board */
  bridgePath: string;
  log(line: string): void;
  /** versão da extensão (vai no cabeçalho do arquivo exportado) */
  version?: string;
  /** esta janela é a dona do board (serve o MCP), a única que roda o autopiloto; padrão: sempre */
  ownsBoard?: () => boolean;
  /** o editor em que o board está aberto; ausente fora do editor (o `faz-ai` no terminal) */
  editor?: {
    name: 'vscode' | 'cursor';
    /** quando a janela abriu: o registro gravado depois disso pede para recarregar */
    startedAt: number;
  };
  /**
   * roda um comando num terminal novo do editor, à vista da pessoa (o "Instalar tudo" do Diagnóstico);
   * ausente fora do editor, onde a tela mostra o script para copiar
   */
  runInTerminal?: (name: string, command: string, cwd: string) => void;
}

/** O board de uma pasta em funcionamento: banco, roteador, executor da IA e heartbeat. Não depende da API do VSCode. */
export interface BoardHost {
  router: MessageRouter;
  runner: AiRunner;
  heartbeat: Heartbeat;
  mergeWatcher: MergeWatcher;
  chat: ChatSession;
  /** toca sozinho as histórias em modo autônomo (YOLO) */
  autopilot: Autopilot;
  /**
   * Registra o servidor MCP do board numa ferramenta de IA (padrão: a do projeto) e devolve o resumo do
   * que foi feito. `user` (o padrão) instala na configuração global da ferramenta; `project`, só aqui.
   */
  connectAI(target?: { tool?: AiTool; scope?: InstallScope }): Promise<{ message: string; toIgnore: string[] }>;
  /**
   * Tira o registro quebrado do board do arquivo do projeto (que vale sobre o global na ferramenta) e
   * refaz o global com os caminhos atuais. Devolve o resumo do que foi feito.
   */
  fixProjectServer(file: string): Promise<string>;
  addToGitignore(lines: string[]): void;
  dispose(): Promise<void>;
}

function gitUserName(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['config', 'user.name'], { cwd, timeout: 3000 }, (err, stdout) => {
      const name = err ? '' : stdout.trim();
      resolve(name || os.userInfo().username || 'Eu');
    });
  });
}

/**
 * Arquivo do banco de uma pasta. Cada pasta tem o seu, para duas janelas (ou o editor e o navegador)
 * em projetos diferentes não gravarem uma por cima da outra. Na primeira vez, parte de uma cópia do
 * banco único das versões anteriores, que fica intacto.
 */
export function boardDbFile(storageDir: string, folderPath: string): string {
  const file = path.join(storageDir, 'boards', `${workspaceKey(folderPath)}.db`);
  const legacy = path.join(storageDir, 'fazai.db');
  if (!fs.existsSync(file) && fs.existsSync(legacy)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(legacy, file);
  }
  return file;
}

export async function createBoardHost(o: BoardHostOptions): Promise<BoardHost> {
  const handle: DbHandle = await openFile(boardDbFile(o.storageDir, o.folderPath), o.wasmDir);
  const homeDir = os.homedir();
  const router = new MessageRouter(handle, {
    workspaceKey: workspaceKey(o.folderPath),
    folderName: o.folderName,
    author: await gitUserName(o.folderPath),
    attachmentsDir: path.join(o.storageDir, 'attachments'),
    workspaceDir: o.folderPath,
    homeDir,
    log: o.log,
    extensionVersion: o.version,
    // os agentes de fábrica nascem na pasta global da ferramenta na primeira abertura
    seedAgents: true,
  });
  const runLog = createRunLog(handle.db, o.log);
  // execuções que a sessão anterior não fechou (a janela caiu, a máquina desligou) viram 'unknown' em
  // vez de ficarem abertas para sempre. Só a janela dona do board faz isso: duas janelas na mesma
  // pasta compartilham o arquivo do banco, e a segunda a abrir marcaria como inconclusiva uma
  // execução viva da primeira. É a mesma ambiguidade que o `ownsBoard` existe para conter.
  const ownsBoard = !o.ownsBoard || o.ownsBoard();
  if (ownsBoard) runLog.closeOpen(Date.now());
  // a retenção: fora da janela, o detalhe do mês vira total em `log_months`. Roda aqui, na abertura,
  // no máximo uma vez por dia — nunca durante uma mutação do board, para não entrar no custo de uma
  // operação comum da pessoa mesmo que fique lenta.
  const boardRepo = new BoardRepo(handle.db);
  const opened = boardRepo.openedNow(router.boardId, Date.now());
  if (ownsBoard && opened.rollupDay !== dayOf(Date.now()))
    consolidate(handle.db, router.boardId, Date.now(), boardRepo.retentionMonths(router.boardId));
  if (ownsBoard) cleanStaleTemp();
  let pathEnv = await loginShellPath();
  // o node do PATH do terminal, com caminho absoluto: é ele que a ferramenta usa para iniciar o servidor do board.
  // Procurado de novo a cada conferência dos requisitos: a pessoa pode instalar o node com o board aberto
  let nodePath = resolveCommand('node', pathEnv, homeDir) ?? undefined;
  // a única porta para chamar a IA: o executor de cards e o chat passam por ela, e é ela que escreve o log de uso
  const gateway = new AiGateway({
    boardId: router.boardId,
    runLog,
    spawn: (command, cwd, out) => spawnHeadless(command, cwd, out, pathEnv),
  });
  const runner = new AiRunner(router, {
    gateway,
    cwd: o.folderPath,
    homeDir,
    bridgePath: o.bridgePath,
    get nodePath() {
      return nodePath;
    },
    log: o.log,
  });
  // o log do board liga cada evento à execução em curso no card (`run_id`); sem execução, fica nulo
  router.setRunResolver((cardId) => runner.runIdOf(cardId));
  // os comandos externos das rotinas periódicas: resolvem com a saída padrão, rejeitam com a mensagem
  // do comando (é ela que vai para o log). `git` aqui é assíncrono de propósito — o `src/extension/git.ts`
  // é síncrono, feito para o que a pessoa dispara, e travaria o processo da extensão numa rodada de fundo.
  const run = (cmd: string) => (args: string[], cwd: string) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        cmd,
        args,
        { cwd, timeout: 120_000, env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}) } },
        (err, stdout, stderr) =>
          err
            ? reject(
                new Error(
                  (err as NodeJS.ErrnoException).code === 'ENOENT'
                    ? `o comando "${cmd}"${COMMAND_HINT[cmd] ?? ''} não foi encontrado.`
                    : stderr.trim() || err.message,
                ),
              )
            : resolve(stdout),
      );
    });
  const gh = run('gh');
  const git = run('git');
  new AutoMerger(router, {
    cwd: o.folderPath,
    log: o.log,
    gh,
    removeWorktree,
  });
  const chat = new ChatSession(router, {
    gateway,
    cwd: o.folderPath,
    homeDir,
    bridgePath: o.bridgePath,
    get nodePath() {
      return nodePath;
    },
    log: o.log,
    file: path.join(o.storageDir, 'chat', `${workspaceKey(o.folderPath)}.json`),
  });
  // os modelos do Cursor são os da conta, e só a CLI diz quais são: lidos ao abrir o board e ao passar
  // a usar o Cursor, só na janela dona do board (é ela que mexe no catálogo). A primeira lista real
  // substitui a embutida sozinha; depois, só pelo "Detectar modelos", para não trazer de volta um
  // modelo que a pessoa tirou do catálogo. Uma leitura de cada vez.
  let readingModels: Promise<void> | null = null;
  const readCursorModels = async () => {
    const exe = resolveCommand('cursor-agent', pathEnv, homeDir);
    if (!exe) return;
    const found = await cursorModels(exe, pathEnv);
    if (!found.length) return;
    rememberModels('cursor', found);
    const { board } = router.snapshot();
    if (board.aiTool !== 'cursor') return;
    if (onlyBuiltin('cursor', board.modelCatalog)) return void router.handle({ type: 'settings.models.detect', tool: 'cursor' });
    // a pessoa ligou os modos rápidos antes de a lista ser lida (o "Detectar" daquele momento só tinha
    // a lista embutida): entram só as versões rápidas dos modelos que estão no catálogo
    const has = (id: string) => board.modelCatalog.some((o) => o.id === id);
    const fastMissing = board.rules.includeFastModels && found.some((m) => isFastVariant(m, found) && !has(m.id) && has(fastBaseId(m)));
    if (fastMissing) router.handle({ type: 'settings.models.detect', tool: 'cursor', fastOnly: true });
  };
  const refreshCursorModels = () => {
    if (!ownsBoard || readingModels) return;
    readingModels = readCursorModels()
      .catch((e) => o.log(`Não foi possível ler os modelos do Cursor: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => (readingModels = null));
  };
  // o que falta para o board trabalhar com a ferramenta (CLI, login, servidor MCP, permissão): vira a
  // faixa de aviso da interface, que fica enquanto faltar alguma coisa. Confere ao abrir, quando a
  // ferramenta ou a permissão mudam, depois de conectar, a cada poucos minutos (a pessoa instala a
  // CLI ou entra na conta fora do board) e quando ela pede "Verificar de novo".
  // a skill do fluxo pronta para as execuções do board: existe para a ferramenta do projeto E está
  // marcada como "incluir em todo contexto" (as execuções partem de contexto vazio: instalada e não
  // marcada, ela não entra); undefined enquanto o inventário do harness não foi lido
  const flowSkillInstalled = (): boolean | undefined => {
    const s = router.snapshot();
    const tool = s.harness.inventory.find((t) => t.tool === s.board.aiTool);
    return tool ? selectedItems(s, 'skill', 'always').some((i) => i.name === FLOW_SKILL_NAME) : undefined;
  };
  let checking: Promise<void> | null = null;
  let cursorBlocked = false;
  let enableTimer: NodeJS.Timeout | null = null;
  let checkAgain = false;
  let forceSigninCheck = false;
  /** o host encerrou: nenhuma conferência nova começa e a que estava em andamento não mexe mais no board */
  let disposed = false;
  const SIGNIN_CACHE_MS = 3 * 60_000;
  const signinCache = new Map<AiTool, { at: number; value: boolean | null }>();
  // dispatch por ferramenta: `cursor` e `claude` têm probe; quando o probe não sabe dizer (`null`), vale
  // só o sinal reativo de falha na execução
  const probeSignedIn = async (tool: AiTool, exe: string, force: boolean): Promise<boolean | null> => {
    const cached = !force && signinCache.get(tool);
    if (cached && Date.now() - cached.at < SIGNIN_CACHE_MS) return cached.value;
    const value = await (tool === 'cursor' ? cursorSignedIn(exe, pathEnv) : claudeSignedIn(exe, pathEnv));
    signinCache.set(tool, { at: Date.now(), value });
    return value;
  };
  const checkNow = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (checking) {
      checkAgain = true;
      return checking;
    }
    const { board } = router.snapshot();
    // a pessoa pode ter instalado o node com o board aberto: o registro do MCP no editor, gravado sem
    // ele, passa a ter o caminho completo (o editor não o acha no PATH de quando abriu)
    const hadNode = !!nodePath;
    nodePath = resolveCommand('node', pathEnv, homeDir) ?? undefined;
    if (!hadNode && nodePath) pinMcp();
    checking = checkRequirements({
      tool: board.aiTool,
      permission: board.runner.permission,
      workspaceDir: o.folderPath,
      homeDir,
      bridgePath: o.bridgePath,
      nodePath,
      resolve: (command) => resolveCommand(command, pathEnv, homeDir),
      signedIn: (tool, exe) => probeSignedIn(tool, exe, forceSigninCheck),
      editor: o.editor?.name,
      windowStartedAt: o.editor?.startedAt,
      editorPath: o.editor ? (process.env.PATH ?? '') : undefined,
      skillInstalled: flowSkillInstalled(),
    })
      .then((list) => {
        // a conferência (com o probe de login, que chama a CLI) pode terminar depois do encerramento
        if (disposed) return;
        // a CLI do Cursor acabou de ficar pronta (instalada, com login): só agora dá para ler os modelos da conta
        const blocked = board.aiTool === 'cursor' && list.some((r) => r.id === 'cli' || r.id === 'signin');
        if (cursorBlocked && !blocked && router.snapshot().board.aiTool === 'cursor') refreshCursorModels();
        cursorBlocked = blocked;
        router.setRequirements(list);
        // o sinal reativo (RF6) limpa quando o probe da própria ferramenta volta a confirmar o login —
        // a essa altura `signinCache` já tem o valor fresco desta conferência (lido pelo `signedIn` acima);
        // cobre Claude e Cursor, que têm probe (quando o probe não sabe dizer, só se recupera por uma execução
        // manual que dá certo, em `runner.ts`). Ao trocar de ferramenta o sinal já foi limpo incondicionalmente
        const expired = router.snapshot().authExpired;
        if (expired && signinCache.get(expired)?.value === true && router.setAuthExpired(null))
          o.log(`Login do ${aiToolInfo(expired).label} de volta: execuções retomadas.`);
        // ligar o MCP no Cursor é com a pessoa, fora do board: enquanto falta, confere a cada 10 s, para
        // o aviso sumir logo depois que ela liga (a conferência lê só uma pasta). O login (`signin`) entra
        // no mesmo timer: a ferramenta com probe (Claude, Cursor) retoma em até 10 s, sem esperar
        // os 5 minutos do ciclo normal
        if (list.some((r) => r.id === 'mcp-enable' || r.id === 'signin')) {
          enableTimer ??= setInterval(() => void checkNow(), 10_000);
          enableTimer.unref?.();
        } else if (enableTimer) {
          clearInterval(enableTimer);
          enableTimer = null;
        }
      })
      .catch((e) => o.log(`Não foi possível conferir os requisitos do board: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => {
        checking = null;
        forceSigninCheck = false;
        if (checkAgain) {
          checkAgain = false;
          void checkNow();
        }
      });
    return checking;
  };
  // o "Verificar de novo" relê também o PATH do terminal, para achar o que acabou de ser instalado, e
  // pula o cache do login: é o clique da pessoa depois de entrar na conta, não pode esperar o TTL de 3 min
  router.onRequirementsCheck(() => {
    forceSigninCheck = true;
    void loginShellPath(true)
      .then((fresh) => (pathEnv = fresh ?? pathEnv))
      .finally(() => void checkNow());
  });
  // "Abrir no terminal" do aviso de login: o board só abre o terminal, a pessoa faz o login nele
  router.onOpenTerminal((command) => o.runInTerminal?.('Faz AI: login', command, o.folderPath));
  // o Diagnóstico do ambiente: os requisitos acima e o que o board usa quando existe (skill do fluxo,
  // git, GitHub CLI, Code Review Graph). Roda só quando a tela pede: alguns comandos demoram
  const probeCommand = (command: string, args: string[], cwd?: string) =>
    new Promise<string | null>((resolve) =>
      execFile(
        command,
        args,
        { cwd: cwd ?? o.folderPath, timeout: 20_000, env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}) } },
        (err, stdout) => resolve(err ? null : stdout),
      ),
    );
  const readOsRelease = () => {
    try {
      return fs.readFileSync('/etc/os-release', 'utf8');
    } catch {
      return null;
    }
  };
  // os MCPs que o chat do editor inicia (o do board e o do Code Review Graph): o editor os procura no
  // PATH de quando abriu, e o que foi instalado depois só aparece nele com o caminho completo
  const editorFiles = o.editor?.name === 'cursor' ? editorMcpFiles(o.folderPath, homeDir) : null;
  const editorPath = () => process.env.PATH ?? '';
  const resolveHere = (command: string) => resolveCommand(command, pathEnv, homeDir);
  const crgMcpState = (tool: AiTool) => {
    if (!editorFiles || tool !== 'cursor') return undefined;
    if (!registeredIn(editorFiles, 'code-review-graph')) return 'unregistered' as const;
    const broken = unreachableServers(editorFiles, editorPath(), resolveHere).filter((u) => u.server === 'code-review-graph');
    if (!broken.length) return 'ok' as const;
    return broken.every((u) => u.tracked) ? ('tracked' as const) : ('unreachable' as const);
  };
  const pinMcp = () => {
    if (!editorFiles) return;
    try {
      for (const u of pinEditorCommands(editorFiles, editorPath(), resolveHere))
        o.log(`MCP "${u.server}" em ${u.file}: "${u.command}" virou "${u.fullPath}" (o editor não o achava no PATH dele).`);
    } catch (e) {
      o.log(`Não foi possível gravar o caminho completo dos MCPs: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  let diagnosing: Promise<void> | null = null;
  const diagnose = () => {
    diagnosing ??= (async () => {
      pathEnv = (await loginShellPath(true)) ?? pathEnv;
      await checkNow();
      const s = router.snapshot();
      const tool = s.board.aiTool;
      const skillInstalled = selectedItems(s, 'skill', 'always').some((i) => i.name === FLOW_SKILL_NAME);
      // o sinal reativo (RF6) também vira o item "signin" do Diagnóstico quando o probe não soube dizer
      // (`null`): sem isso, `s.requirements` não teria `signin` para um login que venceu no meio da execução
      const built = headlessCommand(tool, { prompt: '', permission: 'full' });
      const cliName = 'unsupported' in built ? null : built.command;
      const syntheticSignin: BoardRequirement | null =
        s.authExpired === tool && cliName && !s.requirements.some((r) => r.id === 'signin')
          ? { id: 'signin', tool, cli: cliName, action: { kind: 'command', command: `${cliName} login`, terminal: true } }
          : null;
      router.setEnvironment(
        await checkEnvironment({
          tool,
          requirements: syntheticSignin ? [...s.requirements, syntheticSignin] : s.requirements,
          workspaceDir: o.folderPath,
          os: detectOs(process.platform, readOsRelease()),
          pathDirs: (pathEnv ?? process.env.PATH ?? '').split(path.delimiter),
          homeDir,
          skillInstalled,
          crgMcp: crgMcpState(tool),
          resolve: (command) => resolveCommand(command, pathEnv, homeDir),
          run: probeCommand,
          firstLine: (file) => {
            try {
              return fs.readFileSync(file, 'utf8').slice(0, 300).split('\n')[0] ?? null;
            } catch {
              return null;
            }
          },
          exists: (file) => fs.existsSync(file),
        }),
      );
    })()
      .catch((e) => o.log(`Não foi possível rodar o Diagnóstico do ambiente: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => (diagnosing = null));
  };
  // a tela abre sozinha uma vez por máquina (a marca fica na pasta de dados da extensão, fora do board)
  const seenFile = path.join(o.storageDir, 'environment-seen');
  // "Instalar tudo": o plano sai do último Diagnóstico, vira um script e roda num terminal do editor.
  // O script cria um arquivo ao terminar; enquanto ele não aparece, a tela mostra que está instalando
  const installDir = path.join(o.storageDir, 'install');
  let installTimer: NodeJS.Timeout | null = null;
  const install = (level: 'required' | 'recommended') => {
    const s = router.snapshot();
    const plan = s.environment && installPlan(s.environment, level);
    if (!plan || !o.runInTerminal || installTimer) return;
    if (plan.installSkill) router.handle({ type: 'harness.flowSkill.install', tool: s.board.aiTool, scope: 'user' });
    if (!plan.steps.length) return void diagnose();
    const stamp = Date.now();
    const result = path.join(installDir, `${level}-${stamp}.result`);
    const file = path.join(installDir, `${level}-${stamp}.${plan.shell === 'powershell' ? 'ps1' : 'sh'}`);
    try {
      fs.mkdirSync(installDir, { recursive: true });
      fs.writeFileSync(file, installScript(plan, result), { mode: 0o700 });
    } catch (e) {
      o.log(`Não foi possível gravar o script de instalação: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    o.runInTerminal(
      'Faz AI: instalação',
      plan.shell === 'powershell'
        ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${file}"`
        : `bash '${file.replace(/'/g, `'\\''`)}'`,
      o.folderPath,
    );
    router.setEnvironmentInstall({ level, startedAt: stamp });
    const read = (f: string) => {
      try {
        return fs.readFileSync(f, 'utf8');
      } catch {
        return null;
      }
    };
    // o resultado de cada passo (e o erro dos que falharam) vira o relatório da tela
    const finish = () => {
      if (installTimer) clearInterval(installTimer);
      installTimer = null;
      const { steps } = parseInstallResult(read(result) ?? '', (id) => read(`${result}.${id}.err`));
      router.setEnvironmentInstall(null);
      router.setEnvironmentInstallResult({ level, steps, finishedAt: Date.now() });
      // o que acabou de ser instalado não está no PATH do editor: os MCPs ficam com o caminho completo
      pinMcp();
      for (const f of fs.readdirSync(installDir))
        if (f.startsWith(`${level}-${stamp}.`)) fs.rmSync(path.join(installDir, f), { force: true });
      void diagnose();
    };
    // até 3 horas: depois disso, a pessoa confere pelo "Verificar de novo"
    installTimer = setInterval(() => {
      if (parseInstallResult(read(result) ?? '', () => null).done || Date.now() - stamp > 3 * 3600_000) finish();
    }, 2000);
    installTimer.unref?.();
  };
  router.onEnvironment(
    {
      check: () => void diagnose(),
      pinMcp: () => {
        pinMcp();
        void diagnose();
      },
      install: o.runInTerminal ? install : undefined,
      seen: () => {
        try {
          fs.mkdirSync(o.storageDir, { recursive: true });
          fs.writeFileSync(seenFile, new Date().toISOString());
        } catch (e) {
          o.log(`Não foi possível gravar ${seenFile}: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    },
    !fs.existsSync(seenFile),
  );
  const requirementsTimer = setInterval(() => void checkNow(), 5 * 60_000);
  requirementsTimer.unref?.();
  void checkNow();

  let toolInUse = router.snapshot().board.aiTool;
  let permissionInUse = router.snapshot().board.runner.permission;
  if (toolInUse === 'cursor') refreshCursorModels();
  // a skill do fluxo instalada ou apagada (pelo Diagnóstico, pelo Harness de IA, à mão) muda o aviso
  let skillInUse = flowSkillInstalled();
  router.onDidChange(() => {
    const skill = flowSkillInstalled();
    if (skill !== skillInUse) {
      skillInUse = skill;
      void checkNow();
    }
    const { board } = router.snapshot();
    if (board.aiTool === toolInUse && board.runner.permission === permissionInUse) return;
    const toolChanged = board.aiTool !== toolInUse;
    toolInUse = board.aiTool;
    permissionInUse = board.runner.permission;
    // o sinal reativo só vale para a ferramenta que falhou; trocando de ferramenta, ele não diz nada sobre a nova
    if (toolChanged) router.setAuthExpired(null);
    void checkNow();
    if (toolChanged && board.aiTool === 'cursor') refreshCursorModels();
  });
  const autopilot = new Autopilot(router, runner, { log: o.log, canRun: o.ownsBoard });
  const heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => Date.now(), log: o.log });
  // publica a próxima rodada agendada; a guarda em `setHeartbeat` (só notifica se mudou) evita o laço
  // router.onDidChange → publishHeartbeat → setHeartbeat → notify
  const publishHeartbeat = () => router.setHeartbeat({ nextRoundAt: heartbeat.nextRoundAt });
  heartbeat.onDidChange(publishHeartbeat);
  router.onDidChange(publishHeartbeat);
  publishHeartbeat();
  // sem timer próprio: o arquivamento das histórias publicadas acontece no fim da rodada de merges,
  // com o mesmo liga/desliga, o mesmo intervalo e a mesma janela dona
  const releaseWatcher = new ReleaseWatcher(router, { cwd: o.folderPath, log: o.log, gh, git });
  const mergeWatcher = new MergeWatcher(router, {
    cwd: o.folderPath,
    log: o.log,
    gh,
    removeWorktree,
    now: () => Date.now(),
    canRun: o.ownsBoard,
    afterRound: () => releaseWatcher.sweep(),
  });

  const gitignore = path.join(o.folderPath, '.gitignore');
  const api: BoardHost = {
    router,
    runner,
    heartbeat,
    mergeWatcher,
    chat,
    autopilot,
    async connectAI(target = {}) {
      const tool = target.tool ?? router.snapshot().board.aiTool;
      const scope = target.scope ?? 'user';
      const done = registerClients([tool], {
        bridgePath: o.bridgePath,
        workspaceDir: o.folderPath,
        homeDir,
        nodeCommand: nodePath,
        scope,
      });
      for (const step of done.flatMap((d) => d.run ?? [])) {
        const exe = resolveCommand(step.command, pathEnv, homeDir);
        const manual = `${step.command} ${step.args.map((a) => (/[\s"{}]/.test(a) ? `'${a}'` : a)).join(' ')}`;
        if (!exe) {
          if (step.mayFail) continue;
          throw new Error(`A linha de comando "${step.command}" não foi encontrada. Rode no terminal: ${manual}`);
        }
        const r = await runCli(exe, step.args, pathEnv);
        if (r.code !== 0 && !step.mayFail)
          throw new Error(
            `"${step.command}" não conseguiu registrar o servidor (${(r.stderr || r.stdout).trim()}). Rode no terminal: ${manual}`,
          );
      }
      router.handle({ type: 'harness.refresh' });
      // arquivos do projeto guardam caminhos desta máquina, então normalmente não devem ir para o repositório
      const ignored = fs.existsSync(gitignore)
        ? fs
            .readFileSync(gitignore, 'utf8')
            .split(/\r?\n/)
            .map((l) => l.trim())
        : [];
      const toIgnore = [
        ...new Set(done.flatMap((d) => (d.projectFile && !d.excluded && !ignored.includes(d.projectFile) ? [d.projectFile] : []))),
      ];
      const files = done.map((d) => d.projectFile ?? d.file.replace(homeDir, '~')).join(', ');
      void checkNow();
      return { message: `Servidor "faz-ai" registrado em: ${files}. ${[...new Set(done.map((d) => d.next))].join(' ')}`, toIgnore };
    },
    async fixProjectServer(file) {
      // só os arquivos do projeto que o próprio board grava; nada fora da pasta
      if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error(`Arquivo inválido: ${file}`);
      removeProjectServer(o.folderPath, file);
      const { message } = await api.connectAI({ scope: 'user' });
      return `Registro do board tirado de ${file}, que valia no lugar do global. ${message}`;
    },
    addToGitignore(lines) {
      const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : '';
      fs.writeFileSync(gitignore, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${lines.join('\n')}\n`);
    },
    async dispose() {
      disposed = true;
      clearInterval(requirementsTimer);
      if (enableTimer) clearInterval(enableTimer);
      // espera a conferência em andamento: sem isso ela pode gravar o board depois de o banco fechar
      await checking;
      autopilot.stop(); // fechar o editor não é uma pausa da pessoa: na reabertura a fila retoma
      heartbeat.stop();
      runner.dispose();
      chat.dispose();
      await handle.close();
    },
  };
  return api;
}
