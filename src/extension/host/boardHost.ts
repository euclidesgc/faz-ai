import { PROFILE_CAPABILITIES, profileIsolation, profileLabel, type AiProfile } from '../../shared/aiProfiles';
import { AiProfileRepo } from '../repositories/aiProfileRepo';
import { createAiProfileRuntime } from '../panel/handlers/aiProfiles';
import { profileCanProbe, profileSignedIn, profileVersion } from '../cliProbe';
import { baseValue } from '../../shared/harness';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openFile, type DbHandle } from '../db/database';
import { dayOf } from '../../shared/log';
import { Autopilot } from '../autopilot';
import { Orchestrator } from '../orchestrator';
import { orchestratesStory, effectiveLimits, LIVE_WORK_STATES } from '../../shared/orchestration';
import { terminateProcessGroup } from '../processIdentity';
import { CommentRepo } from '../repositories/commentRepo';
import type { AiActivity } from '../../shared/model';
import type { AiRunMode } from '../../shared/runner';
import { columnOf } from '../../shared/selectors';
import { Heartbeat } from '../heartbeat';
import { AiGateway } from '../ai/gateway';
import { RunArtifactSnapshots } from '../runArtifactSnapshot';
import { ArtifactRepo } from '../repositories/artifactRepo';
import { createRunLog } from '../log/runLog';
import { consolidate } from '../log/rollup';
import { BoardRepo } from '../repositories/boardRepo';
import { registerClients, removeProjectServer } from '../mcp/clientConfig';
import { runRegistrationSteps } from '../mcp/reinstall';
import { workspaceKey } from '../mcp/socketPath';
import { AutoMerger, MergeWatcher } from '../merge';
import { ReleaseWatcher } from '../release';
import { CommandError, deleteBranch, detectMainBranch, removeWorktree } from '../git';
import { OrphanSweeper } from '../orphans';
import { BranchSyncer } from '../branchSync';
import { Maintenance } from '../maintenance';
import { BaseConflictChecker } from '../baseConflict';
import { ghProcess } from '../branchRename';
import { MessageRouter } from '../panel/messageRouter';
import { ChatSession } from '../chat';
import { AiRunner } from '../runner';
import { recoverAfterRestart, sweepStaleRuns } from '../staleRuns';
import { cursorModels, kimiModels, runCli } from '../cliProbe';
import { baseInfo, type AiTool } from '../../shared/harness';
import { checkRequirements, profileInstallUrl } from '../requirements';
import { CLI_COMMAND } from '../../shared/requirements';
import { checkEnvironment, linuxFamily } from '../environment';
import { isPendingReview, probeProfiles } from '../profileProbe';
import { profileHealth, profilesInUse, type ProfileHealth } from '../../shared/profileHealth';
import { editorMcpFiles, pinEditorCommands } from '../mcp/pinCommands';
import { harnessIssues } from '../../shared/harnessStatus';
import type { WebviewToHost } from '../../shared/messages';
import { resolveCommand, resolveProfileCommand } from '../cliResolve';
import { fastBaseId, isFastVariant, onlyBuiltin, rememberModels } from '../models';
import { cleanStaleTemp } from '../aiOutput/measured';
import { ExecutionAdmission } from '../ai/admission';
import { CapabilityEvidenceStore } from '../ai/capabilityEvidence';
import { recoverProjectServers } from '../mcp/projectServerLease';
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
   * roda um comando num terminal novo do editor, à vista da pessoa (o login, pelo "Abrir no terminal" do aviso);
   * ausente fora do editor, onde fica só o comando para copiar
   */
  runInTerminal?: (name: string, command: string, cwd: string) => void;
}

/** O board de uma pasta em funcionamento: banco, roteador, executor da IA e heartbeat. Não depende da API do VSCode. */
export interface BoardHost {
  router: MessageRouter;
  runner: AiRunner;
  heartbeat: Heartbeat;
  /** "Chamar IA": numa história que o board conduz, passa pelo orquestrador; nas demais, pelo executor */
  runAi(cardId: string, mode?: AiRunMode): Promise<void> | void;
  mergeWatcher: MergeWatcher;
  chat: ChatSession;
  /** toca sozinho as histórias em modo autônomo (YOLO) */
  autopilot: Autopilot;
  /**
   * Devolve para a IA os cards presos em "Em execução" sem nenhuma execução em curso (a sessão que os
   * marcou acabou sem passar a vez). Chamada a cada minuto pela janela dona do board.
   */
  sweepStaleRuns(): void;
  /**
   * Registra o servidor MCP do board na configuração global de uma ferramenta de IA (padrão: a do
   * projeto) e devolve o resumo do que foi feito. Nada entra na pasta do projeto (o Cursor é a exceção;
   * veja `registerClients`).
   */
  connectAI(target?: { tool?: AiTool }): Promise<{ message: string }>;
  /**
   * Tira o registro quebrado do board do arquivo do projeto (que vale sobre o global na ferramenta) e
   * refaz o global com os caminhos atuais. Devolve o resumo do que foi feito.
   */
  fixProjectServer(file: string): Promise<string>;
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
    libraryDir: fs.existsSync(path.join(o.storageDir, 'artifacts', workspaceKey(o.folderPath)))
      ? path.join(o.storageDir, 'artifacts', workspaceKey(o.folderPath))
      : undefined,
    workspaceDir: o.folderPath,
    homeDir,
    log: o.log,
    extensionVersion: o.version,
    // os agentes de fábrica nascem na pasta global da ferramenta na primeira abertura
    seedAgents: true,
    // a renomeação de branches (#466) usa o PATH do shell de login, como o `gh` das rotinas de fundo
    gh: ghProcess(() => ({ ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}) })),
  });
  const runLog = createRunLog(handle.db, o.log);
  // execuções que a sessão anterior não fechou (a janela caiu, a máquina desligou) viram 'unknown' em
  // vez de ficarem abertas para sempre. Só a janela dona do board faz isso: duas janelas na mesma
  // pasta compartilham o arquivo do banco, e a segunda a abrir marcaria como inconclusiva uma
  // execução viva da primeira. É a mesma ambiguidade que o `ownsBoard` existe para conter.
  const ownsBoard = !o.ownsBoard || o.ownsBoard();
  // a manutenção da abertura (fechar execuções abertas, consolidar o log) não pode impedir o board de
  // abrir: se falhar, o motivo vai para o log e a pessoa trabalha normalmente
  const maintain = (what: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      o.log(`Não foi possível ${what} ao abrir o board: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  // os cards dessas execuções ficaram "Em execução" sem execução: voltam para a IA na hora
  if (ownsBoard)
    maintain('fechar as execuções de IA que ficaram abertas', () =>
      recoverAfterRestart(
        router,
        runLog.closeOpen(Date.now()),
        o.log,
        // o que o orquestrador reconcilia na abertura não volta para a IA por aqui
        new Set(router.work.live().flatMap((w) => [w.cardId, w.storyId].filter((id): id is string => !!id))),
      ),
    );
  // a retenção: fora da janela, o detalhe do mês vira total em `log_months`. Roda aqui, na abertura,
  // no máximo uma vez por dia — nunca durante uma mutação do board, para não entrar no custo de uma
  // operação comum da pessoa mesmo que fique lenta.
  const boardRepo = new BoardRepo(handle.db);
  maintain('consolidar o log de uso', () => {
    const opened = boardRepo.openedNow(router.boardId, Date.now());
    if (ownsBoard && opened.rollupDay !== dayOf(Date.now()))
      consolidate(handle.db, router.boardId, Date.now(), boardRepo.retentionMonths(router.boardId));
  });
  if (ownsBoard) {
    cleanStaleTemp();
    maintain('reconciliar preparações de MCP interrompidas', () => recoverProjectServers({ log: o.log }));
  }
  let pathEnv = await loginShellPath();
  // o node do PATH do terminal, com caminho absoluto: é ele que a ferramenta usa para iniciar o servidor do board.
  // Procurado de novo a cada conferência dos requisitos: a pessoa pode instalar o node com o board aberto
  let nodePath = resolveCommand('node', pathEnv, homeDir) ?? undefined;
  // a única porta para chamar a IA: o executor de cards e o chat passam por ela, e é ela que escreve o log de uso
  const gateway = new AiGateway({
    resolveProfile: (id) => new AiProfileRepo(handle.db).resolveProfile(router.boardId, id),
    profile: (id) => router.snapshot().board.aiProfiles.find((p) => p.id === id) ?? null,
    boardId: router.boardId,
    runLog,
    sessions: router.executions,
    redact: (text) => router.redactCredentials(text),
    snapshots: new RunArtifactSnapshots(path.join(o.storageDir, 'run-artifacts'), new ArtifactRepo(handle.db), router.boardId),
    admission: new ExecutionAdmission({
      pathEnv: () => pathEnv,
      homeDir,
      evidence: new CapabilityEvidenceStore(path.join(o.storageDir, 'capability-evidence')),
      environmentEvidence: () => ({ state: 'unknown' }),
    }),
    spawn: (command, cwd, out, control) => spawnHeadless(command, cwd, out, pathEnv, control),
  });
  router.setAiProfileRuntime(
    createAiProfileRuntime({
      repo: new AiProfileRepo(handle.db),
      gateway,
      boardId: () => router.boardId,
      cwd: o.folderPath,
      homeDir,
      pathEnv: () => pathEnv,
    }),
  );
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
  // os plugins do Claude Code: a lista de instalados e as ações sobre eles passam pela CLI, na pasta do projeto
  router.setClaudeCli((args) => {
    const exe = resolveCommand('claude', pathEnv, homeDir);
    return exe ? runCli(exe, args, pathEnv, 60_000, o.folderPath) : Promise.resolve({ code: null, stdout: '', stderr: '' });
  });
  // os comandos externos das rotinas periódicas: resolvem com a saída padrão, rejeitam com `CommandError`,
  // que traz a mensagem do comando (é ela que vai para o log), o código de saída e a saída padrão (o
  // `merge-tree` da conferência com a base sai com 1 no conflito, #747). `git` aqui é assíncrono de propósito — o `src/extension/git.ts`
  // é síncrono, feito para o que a pessoa dispara, e travaria o processo da extensão numa rodada de fundo.
  // o git de fundo roda sem terminal (`GIT_TERMINAL_PROMPT=0`): um pedido de senha falha na hora, em vez
  // de prender o comando até o tempo-limite; o `gh` fica com o ambiente de sempre
  const run =
    (cmd: string, extraEnv: NodeJS.ProcessEnv = {}) =>
    (args: string[], cwd: string) =>
      new Promise<string>((resolve, reject) => {
        execFile(
          cmd,
          args,
          { cwd, timeout: 120_000, env: { ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}), ...extraEnv } },
          (err, stdout, stderr) =>
            err
              ? reject(
                  new CommandError(
                    err.code === 'ENOENT'
                      ? `o comando "${cmd}"${COMMAND_HINT[cmd] ?? ''} não foi encontrado.`
                      : stderr.trim() || err.message,
                    typeof err.code === 'number' ? err.code : null,
                    stdout,
                  ),
                )
              : resolve(stdout),
        );
      });
  const gh = run('gh');
  const git = run('git', { GIT_TERMINAL_PROMPT: '0' });
  // o `git` e a principal são da limpeza da história depois do merge (#464)
  // a principal fixada nas configurações vale (a mesma que a tela e o PR usam); sem ela, a detectada
  const mainBranch = (repo: string) => router.mainBranchName() || (detectMainBranch(repo)?.name ?? '');
  new AutoMerger(router, {
    cwd: o.folderPath,
    log: o.log,
    gh,
    git,
    removeWorktree,
    mainBranch,
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
  // os modelos do Cursor são os da conta, e só a CLI diz quais são; os do Kimi Code vêm do
  // `kimi provider list --json`. Lidos ao abrir o board e ao passar a usar a ferramenta, só na janela
  // dona do board (é ela que mexe no catálogo). A primeira lista real substitui a embutida sozinha;
  // depois, só pelo "Detectar modelos", para não trazer de volta um modelo que a pessoa tirou do
  // catálogo. Uma leitura de cada vez.
  let readingModels: Promise<void> | null = null;
  /** as ferramentas cuja CLI lista os modelos (hoje: Cursor e Kimi Code) */
  const readToolModels = async (tool: 'cursor' | 'kimi') => {
    const exe = resolveCommand(baseValue(CLI_COMMAND, tool) ?? '', pathEnv, homeDir);
    if (!exe) return;
    const found = await (tool === 'cursor' ? cursorModels(exe, pathEnv) : kimiModels(exe, pathEnv));
    if (!found.length) return;
    rememberModels(tool, found);
    const { board } = router.snapshot();
    if (board.aiTool !== tool) return;
    if (onlyBuiltin(tool, board.modelCatalog)) return void router.handle({ type: 'settings.models.detect', tool });
    if (tool !== 'cursor') return;
    // a pessoa ligou os modos rápidos antes de a lista ser lida (o "Detectar" daquele momento só tinha
    // a lista embutida): entram só as versões rápidas dos modelos que estão no catálogo
    const has = (id: string) => board.modelCatalog.some((o) => o.id === id);
    const fastMissing = board.rules.includeFastModels && found.some((m) => isFastVariant(m, found) && !has(m.id) && has(fastBaseId(m)));
    if (fastMissing) router.handle({ type: 'settings.models.detect', tool, fastOnly: true });
  };
  const refreshToolModels = (tool: 'cursor' | 'kimi') => {
    if (!ownsBoard || readingModels) return;
    readingModels = readToolModels(tool)
      .catch((e) => o.log(`Não foi possível ler os modelos do ${baseInfo(tool).label}: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => (readingModels = null));
  };
  // o que falta para o board trabalhar com a ferramenta (CLI, login, servidor MCP, permissão): vira a
  // faixa de aviso da interface, que fica enquanto faltar alguma coisa. Confere ao abrir, quando a
  // ferramenta ou a permissão mudam, depois de conectar, a cada poucos minutos (a pessoa instala a
  // CLI ou entra na conta fora do board) e quando ela pede "Verificar de novo".
  let checking: Promise<void> | null = null;
  let modelsBlocked = false;
  let enableTimer: NodeJS.Timeout | null = null;
  let checkAgain = false;
  let forceSigninCheck = false;
  /** a última conferência dos requisitos falhou com este erro (null quando deu certo) */
  let lastCheckError: string | null = null;
  /** a conferência em curso foi pedida pela tela: o erro volta pelo `done`, não pelo aviso solto */
  let requestedCheck = false;
  /** o host encerrou: nenhuma conferência nova começa e a que estava em andamento não mexe mais no board */
  let disposed = false;
  const SIGNIN_CACHE_MS = 3 * 60_000;
  const signinCache = new Map<AiTool, { at: number; value: boolean | null; binding: string }>();
  // o probe de login é o do perfil (o do Kimi Code não usa o executável: lê a pasta de credenciais);
  // quando ele não sabe dizer (`null`), vale só o sinal reativo de falha na execução
  const probeSignedIn = async (exe: string, force: boolean, profile: AiProfile): Promise<boolean | null> => {
    const binding = JSON.stringify([exe, profile.credentials?.secretRef || 'builtin']);
    const cached = !force && signinCache.get(profile.id);
    if (cached && cached.binding === binding && Date.now() - cached.at < SIGNIN_CACHE_MS) return cached.value;
    const value = await profileSignedIn(profile, exe, homeDir, { pathEnv });
    signinCache.set(profile.id, { at: Date.now(), value, binding });
    return value;
  };
  /** O que falta no banco de artefatos; undefined sem o inventário lido (a pasta do projeto não existe). */
  const harnessIssuesNow = (): ReturnType<typeof harnessIssues> | undefined => {
    const s = router.snapshot();
    return s.harness.inventory.some((t) => t.tool === s.board.aiTool) ? harnessIssues(s) : undefined;
  };
  /** O perfil com a configuração privada, para resolver o comando e os probes; a pública traz `config` vazio. */
  const resolvedProfile = (meta: AiProfile): AiProfile => {
    if (meta.kind === 'builtin' || !profileCanProbe(meta)) return meta;
    try {
      return new AiProfileRepo(handle.db).resolveProfile(router.boardId, meta.id);
    } catch {
      return { ...meta, credentials: { ...meta.credentials!, available: false } };
    }
  };
  /**
   * A saúde de cada perfil de CLI, com o padrão primeiro, depois os ligados e por fim os desligados e
   * pendentes. Sem `all`, só os ligados rodam os probes (o aviso do topo roda a cada 5 minutos); o
   * Diagnóstico roda todos. O perfil pendente de revisão nunca roda nada. Nada aqui chama a IA.
   */
  const computeHealth = async (all: boolean, force: boolean): Promise<ProfileHealth[]> => {
    const s = router.snapshot();
    const { board } = s;
    const resolved = new Map(board.aiProfiles.map((p) => [p.id, resolvedProfile(p)]));
    const probes = await probeProfiles(
      board.aiProfiles.filter((p) => all || p.enabled).map((p) => resolved.get(p.id)!),
      {
        resolve: (p) => resolveProfileCommand(p, pathEnv, homeDir),
        version: (p, exe) => profileVersion(p, exe, { pathEnv }),
        signedIn: (p, exe) => probeSignedIn(exe, force, p),
      },
    );
    const rank = (h: ProfileHealth) => (h.isDefault ? 0 : h.registration === 'enabled' ? 1 : 2);
    return board.aiProfiles
      .map((meta) => {
        const url = profileInstallUrl(resolved.get(meta.id)!);
        return profileHealth({
          profile: meta,
          isDefault: meta.id === board.aiTool,
          pendingReview: isPendingReview(meta),
          probe: probes.get(meta.id) ?? null,
          authExpired: s.authExpired.includes(meta.id),
          // sem verificador de capacidades na base, a validação ainda não é requisito (ver profileHealth)
          validationRequired: false,
          credentials: meta.credentials ? [{ name: meta.credentials.secretRef, filled: meta.credentials.available }] : [],
          capabilities: PROFILE_CAPABILITIES.map((c) => meta.capabilities?.[c] ?? 'unknown'),
          admission: null,
          isolation: profileIsolation(resolved.get(meta.id)!),
          evidence: { state: 'never' },
          install: url ? { url } : null,
        });
      })
      .sort((a, b) => rank(a) - rank(b));
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
    const meta = board.aiProfiles.find((p) => p.id === board.aiTool);
    if (!hadNode && nodePath && (!meta || (meta.kind === 'builtin' && profileCanProbe(meta)))) pinMcp();
    lastCheckError = null;
    checking = computeHealth(false, forceSigninCheck)
      .then((health) => ({ health, list: checkRequirements({ nodePath, health, harnessIssues: harnessIssuesNow() }) }))
      .then(({ health, list }) => {
        // a conferência (com o probe de login, que chama a CLI) pode terminar depois do encerramento
        if (disposed) return;
        // a CLI da ferramenta que lista modelos (Cursor, Kimi Code) acabou de ficar pronta (instalada,
        // com login): só agora dá para ler os modelos da conta
        const modelReader = board.aiTool === 'cursor' || board.aiTool === 'kimi' ? board.aiTool : null;
        const own = health.find((h) => h.id === board.aiTool);
        const blocked = !!modelReader && (own?.problem === 'cli' || own?.problem === 'signin');
        if (modelsBlocked && !blocked && modelReader && router.snapshot().board.aiTool === modelReader) refreshToolModels(modelReader);
        modelsBlocked = blocked;
        router.setRequirements(list);
        // o sinal reativo (RF6) limpa, por perfil, quando o probe do próprio perfil volta a confirmar o login —
        // a essa altura `signinCache` já tem o valor fresco desta conferência; quando o probe não sabe
        // dizer, só se recupera por uma execução manual que dá certo (em `runner.ts`)
        for (const expired of router.snapshot().authExpired)
          if (signinCache.get(expired)?.value === true && router.setAuthExpired(expired, false))
            o.log(`Login do ${profileLabel(router.snapshot().board, expired)} de volta: execuções retomadas.`);
        // o login (`profile` com `signin`) entra num timer: o perfil com probe retoma em até 10 s depois
        // de a pessoa entrar na conta, sem esperar os 5 minutos do ciclo normal
        if (list.some((r) => r.id === 'profile' && r.problem === 'signin')) {
          enableTimer ??= setInterval(() => void checkNow(), 10_000);
          enableTimer.unref?.();
        } else if (enableTimer) {
          clearInterval(enableTimer);
          enableTimer = null;
        }
      })
      .catch((e) => {
        lastCheckError = `Não foi possível conferir os requisitos do board: ${e instanceof Error ? e.message : String(e)}`;
        o.log(lastCheckError);
        // sem isto a falha ficava só no log e a tela esperava a conferência para sempre
        if (!requestedCheck) router.reportError(lastCheckError);
      })
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
  router.onRequirementsCheck(async () => {
    forceSigninCheck = true;
    requestedCheck = true;
    try {
      pathEnv = (await loginShellPath(true)) ?? pathEnv;
      await checkNow();
    } finally {
      requestedCheck = false;
    }
    if (lastCheckError) throw new Error(lastCheckError);
  });
  // "Abrir no terminal" do aviso de login: o board só abre o terminal, a pessoa faz o login nele
  router.onOpenTerminal((command) => o.runInTerminal?.('Faz AI: login', command, o.folderPath));
  // o Diagnóstico do ambiente: os requisitos acima e o que o board usa quando existe (a outra ferramenta
  // de IA, git, GitHub CLI, Code Review Graph). Roda só quando a tela pede: alguns comandos demoram
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
  // os MCPs que o chat do editor inicia: o editor os procura no PATH de quando abriu, e o que foi
  // instalado depois só aparece nele com o caminho completo
  const editorFiles = o.editor?.name === 'cursor' ? editorMcpFiles(o.folderPath, homeDir) : null;
  const editorPath = () => process.env.PATH ?? '';
  const resolveHere = (command: string) => resolveCommand(command, pathEnv, homeDir);
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
  /** o último Diagnóstico falhou com este erro (null quando deu certo) */
  let lastDiagnoseError: string | null = null;
  const diagnose = () => {
    diagnosing ??= (async () => {
      lastDiagnoseError = null;
      pathEnv = (await loginShellPath(true)) ?? pathEnv;
      await checkNow();
      const s = router.snapshot();
      router.setEnvironment(
        await checkEnvironment({
          requirements: s.requirements,
          // o Diagnóstico confere também os perfis desligados, para a pessoa ver antes de ligar
          health: await computeHealth(true, true),
          workspaceDir: o.folderPath,
          profilesInUse: profilesInUse(s.board),
          // o simulador e os limites são os da base (#620, #621); nada aqui chama a IA nem recalcula regra
          simulateNextRun: (available) => {
            try {
              return router.simulateExecutionPolicy({
                draft: null,
                sourceValue: '',
                defaultProfileId: s.board.aiTool,
                explicit: false,
                context: { action: 'work', agentId: null, phaseId: null, cardTypeId: null, origin: 'manual' },
                failure: available ? 'unknown' : 'unavailable',
                effects: 'none',
                eligibility: available ? 'admitted' : 'unavailable',
                elapsedMs: 0,
                runningGlobal: 0,
                runningByProfile: {},
              });
            } catch {
              return null;
            }
          },
          effectiveLimits: () => {
            try {
              return effectiveLimits(s.board.runner, s.board.git.mode);
            } catch {
              return null;
            }
          },
          harnessIssues: harnessIssuesNow() ?? null,
          branchRenames: s.branchRenames,
          platform: process.platform,
          homeDir,
          pathDirs: (pathEnv ?? process.env.PATH ?? '').split(path.delimiter),
          linux: process.platform === 'linux' ? linuxFamily(readOsRelease()) : null,
          resolve: resolveHere,
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
      .catch((e) => {
        lastDiagnoseError = `Não foi possível rodar o Diagnóstico do ambiente: ${e instanceof Error ? e.message : String(e)}`;
        o.log(lastDiagnoseError);
      })
      .finally(() => (diagnosing = null));
  };
  /** O Diagnóstico pela tela: a falha volta pelo `done` da mensagem, e a tela sai do "Conferindo…". */
  const diagnoseForScreen = async () => {
    await diagnose();
    if (lastDiagnoseError) throw new Error(lastDiagnoseError);
  };
  // a tela abre sozinha uma vez por máquina (a marca fica na pasta de dados da extensão, fora do board)
  const seenFile = path.join(o.storageDir, 'environment-seen');
  router.onEnvironment(
    {
      check: diagnoseForScreen,
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
  if (toolInUse === 'cursor' || toolInUse === 'kimi') refreshToolModels(toolInUse);
  // o login que venceu (ou voltou) numa execução muda o aviso do perfil: confere já, sem esperar o ciclo
  let authExpiredInUse = router.snapshot().authExpired;
  router.onDidChange(() => {
    const expired = router.snapshot().authExpired;
    // por conteúdo: a lista é nova a cada mudança
    if (expired.length !== authExpiredInUse.length || expired.some((id) => !authExpiredInUse.includes(id))) {
      authExpiredInUse = expired;
      void checkNow();
    }
    const { board } = router.snapshot();
    if (board.aiTool === toolInUse && board.runner.permission === permissionInUse) return;
    const toolChanged = board.aiTool !== toolInUse;
    toolInUse = board.aiTool;
    permissionInUse = board.runner.permission;
    void checkNow();
    if (toolChanged && (board.aiTool === 'cursor' || board.aiTool === 'kimi')) refreshToolModels(board.aiTool);
  });
  // o orquestrador (#621): o board executa as sub-tarefas da fase de código, uma execução da CLI por unidade.
  // Existe em toda janela, mas só a dona age (`ownsBoard` é conferido a cada chamada, e a posse pode mudar);
  // a reconciliação da abertura roda antes de qualquer gatilho (`ensureOrchestrator`)
  const ownsNow = () => !o.ownsBoard || o.ownsBoard();
  const storyOf = (unitStoryId: string | null) => router.snapshot().cards.find((c) => c.id === unitStoryId);
  const orchestrator = new Orchestrator({
    repo: () => router.work,
    state: () => router.snapshot(),
    sessions: router.executions,
    starter: runner,
    ownsBoard: ownsNow,
    flush: () => handle.flush(),
    // a pasta da história: a worktree dela ou, sem worktree, a pasta do projeto
    workspace: async (unit) => storyOf(unit.storyId)?.worktreePath || o.folderPath,
    // estado dos arquivos da pasta (status e HEAD): desconhecido (null) não autoriza repetir a unidade
    fingerprint: async (folder) => {
      try {
        const status = await git(['status', '--porcelain'], folder);
        const head = await git(['rev-parse', 'HEAD'], folder).catch(() => '');
        return `${head.trim()}\n${status}`;
      } catch {
        return null;
      }
    },
    terminate: terminateProcessGroup,
    comment: (work, _outcome, body) => new CommentRepo(handle.db).add(work.storyId ?? work.cardId!, 'Faz AI', body, 'ai'),
    publish: () => publishOrchestrations(),
    block: (storyId, reason) =>
      router.handle({ type: 'card.status.set', cardId: storyId, status: 'blocked', note: reason }, { author: 'Faz AI', source: 'ai' }),
    log: o.log,
    gitMode: () => router.snapshot().board.git.mode,
    // as execuções do runner fora das unidades (chat de fase, refinar, resumir) também ocupam a pasta e o teto
    otherProcesses: () => {
      const unitCards = new Set(router.work.live().flatMap((w) => [w.cardId, w.storyId]));
      return runner.running
        .filter((id) => !unitCards.has(id))
        .map((id) => {
          const s = router.snapshot();
          const card = s.cards.find((c) => c.id === id);
          const story = card?.parentId ? s.cards.find((c) => c.id === card.parentId) : card;
          const dir = story?.worktreePath || o.folderPath;
          return {
            activity: 'branch' as const,
            profile: s.board.aiTool,
            workspace: fs.existsSync(dir) ? fs.realpathSync(dir) : dir,
            writer: true,
          };
        });
    },
  });
  /** As histórias conduzidas agora aparecem "Em execução" também entre uma rodada e outra. */
  function publishOrchestrations(): void {
    const s = router.snapshot();
    const seen = new Set<string>();
    const runs: AiActivity[] = [];
    for (const w of router.work.live().filter((x) => LIVE_WORK_STATES.includes(x.state))) {
      const story = s.cards.find((c) => c.id === w.storyId);
      if (!story || seen.has(story.id)) continue;
      seen.add(story.id);
      runs.push({
        cardId: story.id,
        runId: '',
        mode: 'phase',
        origin: 'manual',
        phase: columnOf(s, story)?.name ?? '',
        model: null,
        tool: s.board.aiTool,
        startedAt: w.createdAt,
      });
    }
    router.setOrchestrations(runs);
  }
  // cancelar a história (ou uma sub-tarefa) interrompe as unidades dela e confirma o fim antes de liberar a pasta
  router.onCardsCancelled((ids) => {
    if (ownsNow() && ready)
      void orchestrator.onCardsCancelled(ids).catch((e: unknown) => o.log(`Orquestrador: ${e instanceof Error ? e.message : String(e)}`));
  });
  let ready: Promise<void> | null = null;
  let reconciledOnce = false;
  /** Reconcilia o que a sessão anterior deixou, uma vez, antes de ligar autopiloto e heartbeat. */
  const ensureOrchestrator = (): Promise<void> => {
    if (!ownsNow()) return Promise.reject(new Error(Autopilot.NOT_OWNER_NOTE));
    ready ??= orchestrator.reconcileOnOpen().then(() => {
      reconciledOnce = true;
    });
    return ready;
  };
  if (ownsBoard) void ensureOrchestrator().catch((e: unknown) => o.log(`Orquestrador: ${e instanceof Error ? e.message : String(e)}`));
  const driver = {
    drive: async (storyId: string, origin: 'manual' | 'autopilot' | 'heartbeat') => {
      await ensureOrchestrator();
      return orchestrator.drive(storyId, origin);
    },
  };
  const autopilot = new Autopilot(router, runner, { log: o.log, canRun: () => ownsNow(), driver });
  // sem timers próprios: a detecção de merges, a sincronização das branches, as órfãs e o arquivamento
  // das histórias publicadas acontecem na manutenção de cada rodada do heartbeat
  const releaseWatcher = new ReleaseWatcher(router, { cwd: o.folderPath, log: o.log, gh, git });
  const mergeWatcher = new MergeWatcher(router, {
    cwd: o.folderPath,
    log: o.log,
    gh,
    git,
    removeWorktree,
    mainBranch,
  });
  // as branches e worktrees órfãs (#465): o varredor mede e remove; o roteador só guarda o relatório e
  // entrega à tela os três pedidos da pessoa. Sem timer próprio: roda na rodada do heartbeat e na abertura.
  const orphanSweeper = new OrphanSweeper({
    cwd: o.folderPath,
    log: o.log,
    git,
    removeWorktree,
    deleteBranch,
    snapshot: () => router.snapshot(),
    publish: (report) => router.setOrphans(report),
    clearWorkspace: (cardId) => router.handle({ type: 'card.workspace.clear', cardId }),
  });
  router.onOrphans({
    scan: async () => {
      await orphanSweeper.scan();
    },
    clean: (id, acceptLoss) => orphanSweeper.clean(id, acceptLoss),
    cleanSafe: () => orphanSweeper.cleanSafe(),
  });
  const branchSyncer = new BranchSyncer({ git, log: o.log, cwd: o.folderPath, snapshot: () => router.snapshot(), mainBranch });
  // a ordem da manutenção é da `Maintenance` (#722): um fetch, os merges (a história mesclada perde a
  // branch, então vêm antes da sincronização; as órfãs, depois, porque uma recém-mesclada ainda seria
  // "decisão"), a sincronização e, por fim, órfãs e versões; a fila da IA espera até a sincronização
  // a conferência do conflito com a base das histórias sem PR (#747): só lê, e avisa na conversa em nome do board
  const act = (msg: WebviewToHost) => router.handle(msg, { author: 'Faz AI', source: 'ai' });
  const baseConflicts = new BaseConflictChecker({ git, log: o.log, cwd: o.folderPath, snapshot: () => router.snapshot(), act });
  const maintenance = new Maintenance({
    git,
    log: o.log,
    cwd: o.folderPath,
    snapshot: () => router.snapshot(),
    merges: () => mergeWatcher.runNow(),
    sync: () => branchSyncer.sync(),
    baseConflicts: () => baseConflicts.runNow(),
    orphans: () => orphanSweeper.sweep(),
    releases: () => releaseWatcher.sweep(),
  });
  const heartbeat = new Heartbeat(runner, {
    driver,
    snapshot: () => router.snapshot(),
    now: () => Date.now(),
    log: o.log,
    // como o heartbeat e o autopiloto, só a janela dona do board faz a manutenção: duas janelas
    // concluiriam em dobro e mexeriam nas mesmas branches. Nas outras, a fila da IA não espera nada
    onRound: () => (!o.ownsBoard || o.ownsBoard() ? maintenance.run() : undefined),
    act,
    // os conflitos de PR ainda sem tentativa da IA entram no começo da fila como execuções de conflito (#747)
    conflicts: () => mergeWatcher.pendingConflicts(),
  });
  // a tentativa de resolver o conflito conta no fim da execução, salvo quando o limite de uso a interrompeu
  // (`usageLimited` é gravado antes de os ouvintes do fim serem chamados)
  runner.onDidFinish((cardId, mode) => mergeWatcher.onRunFinished(cardId, mode, runner.usageLimited));
  // publica a próxima rodada agendada; a guarda em `setHeartbeat` (só notifica se mudou) evita o laço
  // router.onDidChange → publishHeartbeat → setHeartbeat → notify
  const publishHeartbeat = () => router.setHeartbeat({ nextRoundAt: heartbeat.nextRoundAt });
  heartbeat.onDidChange(publishHeartbeat);
  // aprovar uma história já a leva para a próxima coluna, em "Pronto"; com o heartbeat ligado o trabalho da
  // fase começa na rodada seguinte, se houver vaga. Desligado, a aprovação chama a IA na hora: sem isso o
  // card aprovado ficaria parado até alguém clicar em "Trabalhar na fase"
  router.onDidApprove((cardId) => {
    if (!o.ownsBoard || o.ownsBoard()) {
      if (router.snapshot().board.runner.heartbeat)
        o.log(`[${cardId}] Aprovado: o trabalho da próxima fase começa na próxima rodada do heartbeat.`);
      else heartbeat.enqueue(cardId);
    }
  });
  router.onDidChange(publishHeartbeat);
  publishHeartbeat();

  // a varredura da abertura: só a janela dona limpa sozinha (o botão da tela age onde foi clicado)
  if (ownsBoard) void orphanSweeper.sweep();

  const api: BoardHost = {
    router,
    runner,
    sweepStaleRuns: () => {
      if (!o.ownsBoard || o.ownsBoard()) {
        sweepStaleRuns(router, runner.running, Date.now(), o.log);
        if (reconciledOnce)
          void orchestrator.sweep().catch((e: unknown) => o.log(`Orquestrador: ${e instanceof Error ? e.message : String(e)}`));
      }
    },
    async runAi(cardId: string, mode?: AiRunMode) {
      const s = router.snapshot();
      const card = s.cards.find((c) => c.id === cardId);
      const story = card?.parentId ? s.cards.find((c) => c.id === card.parentId) : card;
      // numa história conduzida pelo board (ou numa sub-tarefa dela), "Chamar IA" segue o orquestrador: um escritor só na pasta
      if (story && (mode === undefined || mode === 'phase') && orchestratesStory(s, story)) {
        await ensureOrchestrator();
        const result = await orchestrator.drive(story.id, 'manual');
        if (result.kind === 'paused' || result.kind === 'wait') throw new Error(result.reason ?? 'O board não tem o que executar agora.');
        return;
      }
      runner.start(cardId, 'manual', mode);
    },
    heartbeat,
    mergeWatcher,
    chat,
    autopilot,
    async connectAI(target = {}) {
      const tool = target.tool ?? router.snapshot().board.aiTool;
      const done = registerClients([tool], {
        bridgePath: o.bridgePath,
        workspaceDir: o.folderPath,
        homeDir,
        nodeCommand: nodePath,
      });
      await runRegistrationSteps(done, pathEnv, homeDir);
      router.handle({ type: 'harness.refresh' });
      const files = done.map((d) => d.projectFile ?? d.file.replace(homeDir, '~')).join(', ');
      void checkNow();
      return { message: `Servidor "faz-ai" registrado em: ${files}. ${[...new Set(done.map((d) => d.next))].join(' ')}` };
    },
    async fixProjectServer(file) {
      // só os arquivos do projeto que o próprio board grava; nada fora da pasta
      if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error(`Arquivo inválido: ${file}`);
      removeProjectServer(o.folderPath, file);
      const { message } = await api.connectAI();
      return `Registro do board tirado de ${file}, que valia no lugar do global. ${message}`;
    },
    async dispose() {
      disposed = true;
      router.setClaudeCli(null);
      clearInterval(requirementsTimer);
      if (enableTimer) clearInterval(enableTimer);
      // espera a conferência em andamento: sem isso ela pode gravar o board depois de o banco fechar
      await checking;
      await orphanSweeper.idle();
      autopilot.stop(); // fechar o editor não é uma pausa da pessoa: na reabertura a fila retoma
      heartbeat.stop();
      runner.dispose();
      chat.dispose();
      await handle.close();
    },
  };
  return api;
}
