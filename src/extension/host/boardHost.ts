import { collectClaudeEnvironment } from '../ai/environmentEvidence';
import { defaultManifestDir } from '../ai/cursorManifest';
import { cursorHookStatus } from '../mcp/cursorHooks';
import { CommitTrailers } from '../commitTrailers';
import {
  BUILTIN_PROFILES,
  PROFILE_CAPABILITIES,
  catalogTool,
  isAcpProfile,
  profileIsolation,
  profileLabel,
  verifiableProfile,
  type AiProfile,
  isReadyAcp,
  isReadyCli,
} from '../../shared/aiProfiles';
import { AiProfileRepo } from '../repositories/aiProfileRepo';
import { createAiProfileRuntime } from '../panel/handlers/aiProfiles';
import { profileCanProbe, profileSignedIn, profileVersion } from '../cliProbe';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { Verifications } from '../ai/verifications';
import * as path from 'node:path';
import { openFile, type DbHandle } from '../db/database';
import { dayOf } from '../../shared/log';
import { pricingOf } from '../../shared/cost';
import { Autopilot } from '../autopilot';
import { Orchestrator } from '../orchestrator';
import { orchestratesStory, effectiveLimits, LIVE_WORK_STATES, sameAsLastNote } from '../../shared/orchestration';
import { terminateProcessGroup } from '../processIdentity';
import { CommentRepo } from '../repositories/commentRepo';
import { cardRef, type AiActivity } from '../../shared/model';
import { admissionRegimeOf, type AiRunMode } from '../../shared/runner';
import { columnOf } from '../../shared/selectors';
import { Heartbeat } from '../heartbeat';
import { AiGateway } from '../ai/gateway';
import { RunArtifactSnapshots } from '../runArtifactSnapshot';
import { ArtifactRepo } from '../repositories/artifactRepo';
import { createRunLog } from '../log/runLog';
import { createTrace, tracedRunLog } from '../log/trace';
import { consolidate } from '../log/rollup';
import { BoardRepo } from '../repositories/boardRepo';
import { removeProjectServer } from '../mcp/clientConfig';
import { registerClients } from '../mcp/boardServer';
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
import { AiRunner, NOT_SERVING_BOARD, REPLY_BUSY } from '../runner';
import { BOARD_AUTHOR } from '../../shared/gitflow';
import { recoverAfterRestart, sweepStaleRuns } from '../staleRuns';
import { driverFor, driverOf } from '../ai/drivers';
import { baseInfo, type AiTool } from '../../shared/harness';
import { checkRequirements, profileInstallUrl } from '../requirements';
import { checkEnvironment, linuxFamily } from '../environment';
import { isPendingReview, probeProfiles } from '../profileProbe';
import { evidenceCapabilities, evidenceCurrent, profileHealth, profilesInUse, type ProfileHealth } from '../../shared/profileHealth';
import { profilesInUse as queuedProfiles } from '../../shared/runTarget';
import { editorMcpFiles, pinEditorCommands } from '../mcp/pinCommands';
import { harnessIssues } from '../../shared/harnessStatus';
import { findFlowSkillCopies } from '../flowSkillCopies';
import type { WebviewToHost } from '../../shared/messages';
import { commandNotFound, profileCommand, resolveCommand, resolveProfileCommand } from '../cliResolve';
import { acpAgent } from '../ai/acp/agents';
import { acpSessionModels } from '../ai/acp/models';
import { fastBaseId, isFastVariant, onlyBuiltin, rememberModels } from '../models';
import { cleanStaleTemp } from '../aiOutput/measured';
import { ExecutionAdmission, admissionTransport } from '../ai/admission';
import { CapabilityEvidenceStore } from '../ai/capabilityEvidence';
import { verifyExecutor, type VerifierResult } from '../ai/capabilityVerifier';
import { Connector } from '../ai/connect';
import { acpSignIn } from '../ai/acp/signIn';
import type { AcpAuth } from '../ai/acp/provider';
import { ToolKeys } from '../toolKeys';
import { profileApiKey } from '../ai/apiKey';
import { credentialsFor } from '../credentials';
import { recoverProjectServers } from '../mcp/projectServerLease';
import { loginShellPath, spawnAcpProcess, spawnHeadless } from '../spawn';
import { AgentConnectService, type TerminalSpec } from '../agentConnect/service';

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
  /**
   * roda um processo num terminal do editor e devolve o código de saída quando ele fecha (o login de um agente, em
   * Conectar agentes: o board verifica a conta de novo sozinho); ausente fora do editor
   */
  runTerminal?: (spec: TerminalSpec) => Promise<number | null>;
}

/** O board de uma pasta em funcionamento: banco, roteador, executor da IA e heartbeat. Não depende da API do VSCode. */
export interface BoardHost {
  router: MessageRouter;
  runner: AiRunner;
  heartbeat: Heartbeat;
  /** "Chamar IA": numa história que o board conduz, passa pelo orquestrador; nas demais, pelo executor */
  runAi(cardId: string, mode?: AiRunMode): Promise<void> | void;
  /** "Parar" do card: interrompe a execução dele (numa história, também a da sub-tarefa em curso) ou libera o card preso */
  stopAi(cardId: string): void;
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
  /**
   * Verifica as capacidades de um perfil ligado (a CLI do Claude numa fixture, contra uma API local, ou o
   * handshake de um agente ACP numa pasta descartável) e grava os recibos assinados no vínculo dele. Só o
   * host chama: não há caminho de escrita pela tela nem pelo MCP. Devolve o resumo do resultado.
   */
  verifyExecutor(profileId: string): Promise<string>;
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

export async function createBoardHost(opts: BoardHostOptions): Promise<BoardHost> {
  // o rastreio do board: ações da tela, mudanças, ferramentas MCP e execuções, um arquivo por dia.
  // `FAZAI_TRACE=1` repete cada linha no canal de log, legível
  const trace = createTrace(path.join(opts.storageDir, 'trace', workspaceKey(opts.folderPath)), opts.log, process.env.FAZAI_TRACE === '1');
  // tudo o que o host já escreve no canal de log também entra no rastreio, na ordem em que aconteceu
  const o: BoardHostOptions = {
    ...opts,
    log: (line) => {
      opts.log(line);
      trace.write({ src: 'host', ev: 'log', data: line });
    },
  };
  o.log(`Rastreio do board em ${trace.file()}`);
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
    trace,
    extensionVersion: o.version,
    // os agentes de fábrica nascem na pasta global da ferramenta na primeira abertura
    seedAgents: true,
    // a renomeação de branches (#466) usa o PATH do shell de login, como o `gh` das rotinas de fundo
    gh: ghProcess(() => ({ ...process.env, ...(pathEnv ? { PATH: pathEnv } : {}) })),
  });
  const runLog = tracedRunLog(createRunLog(handle.db, o.log), trace);
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
  // a chave de API de cada ferramenta (o Gemini entra por ela), no cofre local: o mesmo cofre do banco, para a
  // ocultação das credenciais (`redactCredentials`) conhecê-la. O índice fica na pasta de dados, fora do banco
  const toolKeys = new ToolKeys(credentialsFor(handle.db), path.join(o.storageDir, 'tool-keys.json'));
  /** A chave do cofre para o agente do perfil que entra por chave, no formato do `authenticate`; undefined nos outros. */
  const acpAuthOf = (profile: AiProfile): AcpAuth | undefined => {
    const auth = driverOf(profile)?.auth;
    const apiKey = profileApiKey(toolKeys, profile);
    // só o agente ACP tem `methodId`: no modo API a chave não vai a agente nenhum (ver `profileApiKey`)
    return auth?.kind === 'api-key' && auth.methodId && apiKey ? { methodId: auth.methodId, apiKey } : undefined;
  };
  // a única porta para chamar a IA: o executor de cards e o chat passam por ela, e é ela que escreve o log de uso
  const evidenceStore = new CapabilityEvidenceStore(path.join(o.storageDir, 'capability-evidence'));
  const admission = new ExecutionAdmission({
    pathEnv: () => pathEnv,
    homeDir,
    evidence: evidenceStore,
    environmentEvidence: () => collectClaudeEnvironment(),
    // o vínculo do modo API leva o digest da chave do cofre (a mesma da execução)
    apiKey: (profile) => profileApiKey(toolKeys, profile),
  });
  const gateway = new AiGateway({
    // o modelo que a ferramenta recusou para a conta sai do catálogo: o seletor não o oferece de novo
    onModelUnavailable: (profile, model) => {
      router.retireModel(profile.id, model);
      o.log(`Modelo ${model} recusado pelo ${profile.name} para esta conta: saiu da lista de modelos.`);
    },
    // o preço do catálogo para o modelo da execução, achado como o limitChoice acha o modelo (o catálogo do perfil de origem)
    priceOf: (profile, model) =>
      model === null
        ? null
        : pricingOf(router.snapshot().board.modelCatalog.find((o) => o.tool === catalogTool(profile) && o.model === model)),
    resolveProfile: (id) => new AiProfileRepo(handle.db).resolveProfile(router.boardId, id),
    profile: (id) => router.snapshot().board.aiProfiles.find((p) => p.id === id) ?? null,
    boardId: router.boardId,
    runLog,
    sessions: router.executions,
    redact: (text) => router.redactCredentials(text),
    snapshots: new RunArtifactSnapshots(path.join(o.storageDir, 'run-artifacts'), new ArtifactRepo(handle.db), router.boardId),
    admission,
    // lê a versão do git na primeira run de card e guarda; o git que não serve desliga os trailers com um aviso
    commitTrailers: new CommitTrailers({
      gitVersion: () => {
        try {
          return execFileSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 });
        } catch {
          return null;
        }
      },
    }),
    cursorHook: {
      dir: defaultManifestDir(homeDir),
      status: () => cursorHookStatus({ homeDir, scriptPath: path.join(path.dirname(o.bridgePath), 'cursor-hook.js') }),
    },
    spawn: (command, cwd, out, control) => spawnHeadless(command, cwd, out, pathEnv, control),
    spawnAcp: (command, cwd, out) => spawnAcpProcess({ ...command, format: 'text' }, cwd, out, pathEnv),
    // a chave do cofre para o driver que entra por chave: o agente ACP (no `authenticate`) e o modo API
    apiKey: (profile) => profileApiKey(toolKeys, profile),
    // a ciência do perfil no Conectar vale para ele; sem ela, o regime do board
    regimeOf: (profileId) => admissionRegimeOf(router.snapshot().board.runner, profileId),
  });
  router.setAiProfileRuntime(
    createAiProfileRuntime({
      repo: new AiProfileRepo(handle.db),
      gateway,
      boardId: () => router.boardId,
      cwd: o.folderPath,
      homeDir,
      pathEnv: () => pathEnv,
      runner: () => router.snapshot().board.runner,
      hasApiKey: (tool) => toolKeys.has(tool),
      contextVersion: (id) => router.savedConnections()[id]?.version ?? null,
      contextExtra: (id) => router.contextExtra()[id] ?? [],
      log: o.log,
    }),
  );
  /** Abre o agente ACP numa pasta descartável (`fazai-<o quê>-`), roda `fn` e apaga a pasta. */
  const inScratch = async <T>(what: string, fn: (dir: string) => Promise<T>): Promise<T> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `fazai-${what}-`));
    try {
      return await fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  // os modelos de um agente ACP vêm da sessão que ele abre (`session/new`), lidos numa pasta descartável
  // para não tocar o projeto; a lista fica guardada para o "Detectar modelos" juntar ao catálogo
  const readAcpModels = async (profile: AiProfile): Promise<number> => {
    const agent = acpAgent(String(profile.config.acpAgent));
    if (!agent) throw new Error(`Agente ACP desconhecido: ${String(profile.config.acpAgent)}.`);
    const executable = resolveProfileCommand(profile, pathEnv, homeDir);
    if (!executable) throw new Error(commandNotFound(profileCommand(profile)));
    return inScratch('acp-models', async (dir) => {
      const found = await acpSessionModels(agent, profile.id, dir, {
        executable,
        spawn: (command, cwd, out) => spawnAcpProcess({ ...command, env: profile.config.env, format: 'text' }, cwd, out, pathEnv),
        auth: acpAuthOf(profile),
      });
      if (!found.options.length)
        throw new Error(
          `${agent.label} não anunciou modelos na sessão; cadastre-os à mão na aba Modelos do agente, em Conectar agentes, ou use "Outro modelo…" no card.`,
        );
      rememberModels(profile.id, found.options);
      o.log(
        `${agent.label}: ${found.options.length} modelo(s) lidos da sessão (${found.source === 'models' ? 'forma anterior do protocolo' : 'opções da sessão'}).`,
      );
      return found.options.length;
    });
  };
  router.onAcpModels(async (profile) => void (await readAcpModels(profile)));
  // o Conectar (história 7): do binário a "Conectada", pelo driver do perfil. O estado de cada passo vai para
  // a tela pelo `connections` do board; a chave colada vai só para o cofre (`toolKeys`)
  const connector: Connector = new Connector({
    profile: (id) => router.snapshot().board.aiProfiles.find((p) => p.id === id) ?? null,
    enable: (id) => void router.handle({ type: 'settings.aiProfiles.setEnabled', id, enabled: true }),
    resolve: (id) => new AiProfileRepo(handle.db).resolveProfile(router.boardId, id),
    locate: (profile) => resolveProfileCommand(profile, pathEnv, homeDir),
    version: (profile, exe) => profileVersion(profile, exe, { pathEnv }),
    signedIn: (profile, exe) => profileSignedIn(profile, exe, homeDir, { pathEnv, hasApiKey: (tool) => toolKeys.has(tool) }),
    keys: toolKeys,
    authenticate: (profile, executable, auth) => {
      const agent = acpAgent(String(profile.config.acpAgent));
      if (!agent) return Promise.reject(new Error(`Agente ACP desconhecido: ${String(profile.config.acpAgent)}.`));
      return inScratch('acp-signin', (cwd) =>
        acpSignIn(agent, auth, {
          executable,
          cwd,
          spawn: (command, dir, out) => spawnAcpProcess({ ...command, format: 'text' }, dir, out, pathEnv),
        }),
      );
    },
    // o modo API confere a chave na hora, pela lista de modelos da conta (não gasta a conta)
    checkApiKey: async (profile, apiKey) => {
      const driver = driverOf(profile);
      if (!driver?.apiModels) throw new Error(`${profile.name}: o modo não confere a chave pela API.`);
      return (await driver.apiModels(apiKey)).length;
    },
    setMode: (id, mode) => router.setProfileMode(id, mode),
    verify: async (profileId) => (await verifyDetailed(profileId)).result,
    reviewOf: (id) => router.snapshot().board.runner.compatibilityReviews[id] ?? null,
    recordReview: (id) => router.recordCompatibilityReview(id),
    revokeReview: (id) => router.revokeCompatibilityReview(id),
    // os modelos entram no catálogo do board, como o "Detectar modelos": ficam em todo campo de modelo
    listModels: async (profile, exe) => {
      // a chave do catálogo de modelos: o id do agente ACP; na CLI, a ferramenta (a da base, numa cópia)
      const tool = catalogTool(profile);
      let count: number;
      if (isAcpProfile(profile)) count = await readAcpModels(profile);
      else if (driverOf(profile)?.apiModels) {
        // pela API, com a chave do cofre (a mesma que o login acabou de conferir): o modo API e o Gemini pela
        // CLI, que não tem comando que liste os modelos
        const driver = driverOf(profile)!;
        const apiKey = profileApiKey(toolKeys, profile);
        if (!apiKey) return null;
        // só os que a conta pode chamar: a lista da API traz também os fechados para contas novas
        const found = await (driver.availableModels ?? driver.apiModels)!(apiKey);
        rememberModels(tool, found);
        count = found.length;
      } else {
        const driver = driverOf(profile);
        if (!driver?.listModels) return null;
        const found = await driver.listModels(exe, pathEnv);
        // sem lista (o Claude Code sem rede para a documentação): o catálogo fica com a embutida, e o resumo diz isso
        if (!found.length) {
          router.handle({ type: 'settings.models.detect', tool });
          return null;
        }
        rememberModels(tool, found);
        count = found.length;
      }
      router.handle({ type: 'settings.models.detect', tool });
      return count;
    },
    save: (id, summary) => router.saveConnection(id, summary),
    saved: (id) => router.savedConnections()[id] ?? null,
    publish: () => router.setConnections(connector.snapshot(router.snapshot().board.aiProfiles.map((p) => p.id))),
    redact: (text) => router.redactCredentials(text),
    log: o.log,
  });
  // "Detectar modelos" de uma CLI que tem de onde ler a lista (o Claude Code pela documentação, o Cursor e o Kimi
  // Code pelo comando): lê de novo antes de juntar ao catálogo, e não só a última leitura do Conectar
  router.onReadToolModels(async (profile) => {
    const driver = driverOf(profile);
    if (isAcpProfile(profile)) return;
    // o modo API lê a lista da conta pela chave do cofre: é o "Atualizar modelos" dele
    if (driver?.apiModels) {
      const apiKey = profileApiKey(toolKeys, profile);
      if (apiKey) rememberModels(catalogTool(profile), await (driver.availableModels ?? driver.apiModels)(apiKey));
      return;
    }
    if (!driver?.listModels) return;
    const exe = resolveProfileCommand(profile, pathEnv, homeDir);
    if (!exe) return;
    rememberModels(catalogTool(profile), await driver.listModels(exe, pathEnv));
  });
  // o fim do Conectar muda o login, a prova e os modelos do perfil: a faixa de requisitos confere de novo
  router.onConnect((id, input) =>
    connector
      .connect(id, input)
      .finally(() => void checkNow())
      .then(() => {
        // conectado numa versão sem teste do contexto (o primeiro Conectar ou uma versão nova): o teste roda sozinho,
        // em segundo plano; ele gasta pedidos da conta, mas é o que diz à pessoa o que o agente lê além do card
        const saved = router.savedConnections()[id];
        const tested = router.savedContextScopes()[id];
        const mode = router.snapshot().board.aiProfiles.find((p) => p.id === id)?.mode;
        // no modo API não há o que testar: o contexto é fechado por construção
        if (saved && mode !== 'api' && (!tested || tested.version !== (saved.version ?? null)))
          void router.runContextScope(id).catch((e) => o.log(`[contexto] ${e instanceof Error ? e.message : String(e)}`));
      }),
  );
  router.setConnections(connector.snapshot(router.snapshot().board.aiProfiles.map((p) => p.id)));
  // Conectar agentes: a lista do registro, a conta de cada agente, o login e o logout. O log do protocolo fica na
  // pasta do rastreio do board, ao lado dele
  router.setAgentConnect(
    new AgentConnectService({
      storageDir: o.storageDir,
      logDir: path.join(o.storageDir, 'trace', workspaceKey(o.folderPath)),
      homeDir,
      pathEnv: async (fresh) => (fresh ? (pathEnv = (await loginShellPath(true)) ?? pathEnv) : pathEnv),
      profiles: () => router.snapshot().board.aiProfiles,
      privateProfile: (id) => {
        try {
          return new AiProfileRepo(handle.db).resolveProfile(router.boardId, id);
        } catch (e) {
          // o perfil desligado: o pronto tem a configuração no código (o agente ACP, a página oficial), sem segredo, e é
          // com ela que a tela diz se a ferramenta está instalada e verifica a conta; o do cofre espera ser ligado
          const profile = router.snapshot().board.aiProfiles.find((p) => p.id === id);
          const builtin = BUILTIN_PROFILES.find((p) => p.id === id);
          if (profile && builtin) return { ...profile, config: structuredClone(builtin.config) };
          throw e;
        }
      },
      acpAuth: acpAuthOf,
      hasApiKey: (tool) => toolKeys.has(tool),
      ...(o.runTerminal ? { runTerminal: o.runTerminal } : {}),
      connection: (id) => router.snapshot().connections?.[id],
      resumeConnect: (id) => router.connectProfile(id, {}),
      log: o.log,
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
  /**
   * A ferramenta em uso, quando a CLI dela lista os modelos: as que têm `listModels` no driver (hoje: Cursor
   * e Kimi Code). O id é o do perfil pronto, que é o da ferramenta; uma cópia não lê a lista.
   */
  const modelReaderOf = (tool: string): string | null => (driverFor(tool, 'cli')?.listModels ? tool : null);
  const readToolModels = async (tool: string) => {
    const driver = driverFor(tool, 'cli');
    const exe = driver?.locate(pathEnv, homeDir);
    if (!exe || !driver?.listModels) return;
    const found = await driver.listModels(exe, pathEnv);
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
  const refreshToolModels = (tool: string) => {
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
    // a chave do cofre (só a presença) também prende o cache: guardar ou trocar a chave no Conectar vale na hora
    const hasApiKey = (tool: string) => toolKeys.has(tool);
    const binding = JSON.stringify([exe, profile.credentials?.secretRef || 'builtin', hasApiKey(driverOf(profile)?.tool ?? '')]);
    const cached = !force && signinCache.get(profile.id);
    if (cached && cached.binding === binding && Date.now() - cached.at < SIGNIN_CACHE_MS) return cached.value;
    const value = await profileSignedIn(profile, exe, homeDir, { pathEnv, hasApiKey });
    signinCache.set(profile.id, { at: Date.now(), value, binding });
    return value;
  };
  /** O que falta no banco de artefatos; undefined sem a biblioteca carregada (a pasta do projeto não existe). */
  const harnessIssuesNow = (): ReturnType<typeof harnessIssues> | undefined => {
    const s = router.snapshot();
    return s.harness.library ? harnessIssues(s) : undefined;
  };
  /** O perfil com a configuração privada, para resolver o comando e os probes; a pública traz `config` vazio. */
  const resolvedProfile = (meta: AiProfile): AiProfile => {
    if (isReadyCli(meta) || isReadyAcp(meta) || !profileCanProbe(meta)) return meta;
    try {
      return new AiProfileRepo(handle.db).resolveProfile(router.boardId, meta.id);
    } catch {
      return { ...meta, credentials: { ...meta.credentials!, available: false } };
    }
  };
  /**
   * As capacidades que o Diagnóstico mostra: as provas gravadas no vínculo de isolamento do próprio perfil.
   * Só o perfil verificável e liberado para rodar comando tem vínculo; os outros ficam como vieram.
   */
  const evidenceOf = (
    meta: AiProfile,
    profile: AiProfile,
  ): { capabilities: ProfileHealth['capabilities']; invalidated?: ProfileHealth['evidenceInvalidated'] } => {
    const declared = PROFILE_CAPABILITIES.map((c) => meta.capabilities?.[c] ?? 'unknown');
    if (!verifiableProfile(meta) || !profileCanProbe(profile)) return { capabilities: declared };
    try {
      const bound = admission.isolationBinding(profile, profile.id, 'board');
      const capabilities = evidenceCapabilities(bound.binding, evidenceStore.load(bound.binding), Date.now(), admissionTransport(profile));
      // a última prova foi feita noutro vínculo: o binário, o ambiente relevante ou o formato do vínculo mudou
      const last = evidenceStore.lastBinding(profile.id);
      if (!meta.enabled || !last || last === bound.binding) return { capabilities };
      return { capabilities, invalidated: isAcpProfile(profile) ? 'automatic' : 'command' };
    } catch {
      // sem o executável não há vínculo: nada foi provado
      return { capabilities: declared };
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
        const evidence = evidenceOf(meta, resolved.get(meta.id)!);
        return profileHealth({
          profile: meta,
          isDefault: meta.id === board.aiTool,
          pendingReview: isPendingReview(meta),
          probe: probes.get(meta.id) ?? null,
          authExpired: s.authExpired.includes(meta.id),
          // sem verificador de capacidades na base, a validação ainda não é requisito (ver profileHealth)
          validationRequired: false,
          credentials: meta.credentials ? [{ name: meta.credentials.secretRef, filled: meta.credentials.available }] : [],
          capabilities: evidence.capabilities,
          admission: null,
          isolation: profileIsolation(resolved.get(meta.id)!),
          evidence: { state: 'never' },
          install: url ? { url } : null,
          verifiable: verifiableProfile(meta),
          ...(evidence.invalidated ? { evidenceInvalidated: evidence.invalidated } : {}),
        });
      })
      .sort((a, b) => rank(a) - rank(b));
  };
  /** O vínculo em que o board já mandou provar cada agente ACP nesta sessão. */
  const attempted = new Map<string, string>();
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
    if (!hadNode && nodePath && (!meta || (isReadyCli(meta) && profileCanProbe(meta)))) pinMcp();
    lastCheckError = null;
    checking = computeHealth(false, forceSigninCheck)
      .then((health) => ({ health, list: checkRequirements({ nodePath, health, harnessIssues: harnessIssuesNow() }) }))
      .then(({ health, list }) => {
        // a conferência (com o probe de login, que chama a CLI) pode terminar depois do encerramento
        if (disposed) return;
        // a CLI da ferramenta que lista modelos (Cursor, Kimi Code) acabou de ficar pronta (instalada,
        // com login): só agora dá para ler os modelos da conta
        const modelReader = modelReaderOf(board.aiTool);
        const own = health.find((h) => h.id === board.aiTool);
        const blocked = !!modelReader && (own?.problem === 'cli' || own?.problem === 'signin');
        if (modelsBlocked && !blocked && modelReader && router.snapshot().board.aiTool === modelReader) refreshToolModels(modelReader);
        modelsBlocked = blocked;
        router.setRequirements(list);
        // agente ACP ligado sem prova em vigor (perdeu a validade porque o vínculo mudou, ou nunca foi
        // provado neste formato): o board refaz sozinho, uma vez por vínculo, para uma verificação que falha
        // antes de gravar não repetir a cada conferência
        for (const meta of router.snapshot().board.aiProfiles)
          if (meta.enabled && isAcpProfile(meta))
            verifyOncePerBinding(
              meta.id,
              health.find((h) => h.id === meta.id),
            );
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
    // é também o clique depois de entrar na conta do agente ACP: a prova que falhou sem login (authRequired
    // no handshake) é refeita; a que está em vigor continua pulada (hasCurrentEvidence)
    attempted.clear();
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
          // os das regras e dos agentes, mais os dos cards na fila da IA: um card com o modelo de outro agente conta
          profilesInUse: [...new Set([...profilesInUse(s.board), ...queuedProfiles(s).map((p) => p.id)])],
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
          // o regime do perfil padrão: a ciência dele no Conectar, ou o regime do board
          regime: () => {
            const { board } = router.snapshot();
            return admissionRegimeOf(board.runner, board.aiTool).regime;
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
          flowSkillCopies: findFlowSkillCopies({ projectDir: o.folderPath, homeDir }),
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
  if (modelReaderOf(toolInUse)) refreshToolModels(toolInUse);
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
    if (toolChanged && modelReaderOf(board.aiTool)) refreshToolModels(board.aiTool);
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
    usageHold: (cardId) => runner.usageHold(cardId),
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
    // o resultado igual à última mensagem da conversa não se repete: a tentativa aponta para a que já está lá
    comment: (work, _outcome, body) => {
      const target = work.storyId ?? work.cardId!;
      return sameAsLastNote(router.snapshot(), target, body) ?? new CommentRepo(handle.db).add(target, 'Faz AI', body, 'ai');
    },
    publish: () => publishOrchestrations(),
    note: (storyId, body) => {
      new CommentRepo(handle.db).add(storyId, 'Faz AI', body, 'ai');
    },
    block: (storyId, reason, quiet) =>
      router.handle(
        { type: 'card.status.set', cardId: storyId, status: 'blocked', note: reason, ...(quiet ? { quiet } : {}) },
        { author: 'Faz AI', source: 'ai' },
      ),
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
            ...(card ? { label: cardRef(card) } : {}),
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

  /** A verificação de um perfil: recusa com uma mensagem clara o que não está ligado ou não tem sonda. */
  const verifyProfile = async (profileId: string): Promise<{ message: string; result: VerifierResult }> => {
    const meta = router.snapshot().board.aiProfiles.find((p) => p.id === profileId);
    if (!meta) throw new Error(`Perfil indisponível neste board: ${profileId}.`);
    if (!verifiableProfile(meta))
      throw new Error(`${meta.name}: a verificação de capacidades só existe para a CLI do Claude, o Gemini pela CLI e os agentes ACP.`);
    const profile = new AiProfileRepo(handle.db).resolveProfile(router.boardId, profileId);
    if (!profileCanProbe(profile))
      throw new Error(`${meta.name} está desligado ou espera revisão: ligue e revise o perfil antes de verificar.`);
    const result = await verifyExecutor({
      executor: profile,
      profileId: profile.id,
      admission,
      store: evidenceStore,
      pathEnv,
      spawn: (command, cwd, out) => spawnHeadless(command, cwd, out, pathEnv),
      spawnAgent: (command, cwd, out) => spawnAcpProcess({ ...command, format: 'text' }, cwd, out, pathEnv),
      // o agente que entra por chave (o Gemini) só abre a sessão com ela: a do cofre vai em cada handshake
      acpAuth: acpAuthOf(profile),
    });
    if (result.indexError) o.log(`${meta.name}: ${result.indexError}`);
    const failed = result.evidence.flatMap((e) => e.checks.filter((c) => c.outcome !== 'passed').map((c) => `${e.capability}/${c.id}`));
    if (result.verified) return { result, message: `${meta.name}: isolamento verificado; as cinco capacidades têm recibos válidos.` };
    // no ACP os arquivos de contexto do agente ficam sem prova de propósito: o perfil vale no regime compatível
    if (isAcpProfile(profile) && failed.join(',') === 'artifacts/own-context-files')
      return {
        result,
        message: `${meta.name}: handshake do agente verificado. Os arquivos de contexto que ele lê por conta própria não têm prova: o perfil é admissível só no regime compatível.`,
      };
    return { result, message: `${meta.name}: isolamento não verificado. Pendentes: ${failed.join(', ') || 'checks ausentes'}.` };
  };
  /** A prova gravada ainda vale para o vínculo atual do perfil (o digest do binário fica em cache na admissão). */
  const hasCurrentEvidence = (profileId: string): boolean => {
    try {
      const profile = new AiProfileRepo(handle.db).resolveProfile(router.boardId, profileId);
      const bound = admission.isolationBinding(profile, profile.id, 'board');
      return evidenceCurrent(bound.binding, evidenceStore.load(bound.binding), Date.now(), admissionTransport(profile));
    } catch {
      return false;
    }
  };
  /** O estado da chave do cofre com que a verificação do perfil roda: o digest dela, ou `''` sem chave. */
  const keyStateOf = (profileId: string): string => {
    try {
      const apiKey = acpAuthOf(new AiProfileRepo(handle.db).resolveProfile(router.boardId, profileId))?.apiKey;
      return apiKey ? createHash('sha256').update(apiKey).digest('hex') : '';
    } catch {
      return '';
    }
  };
  // a verificação por perfil (uma de cada vez por estado da chave) e a automática em segundo plano, que não
  // corre por cima do Conectar (ver `ai/verifications.ts`)
  const verifications = new Verifications<{ message: string; result: VerifierResult }>({
    profile: (id) => router.snapshot().board.aiProfiles.find((p) => p.id === id) ?? null,
    run: verifyProfile,
    keyState: keyStateOf,
    current: hasCurrentEvidence,
    busy: (id) => connector.active(id),
    message: (r) => r.message,
    log: o.log,
    // o Diagnóstico mostra as capacidades lidas das provas: confere de novo com as novas
    done: () => void checkNow(),
    disposed: () => disposed,
  });
  const verifyDetailed = (profileId: string) => verifications.detailed(profileId);
  const verifyInBackground = (profileId: string, why: string): void => verifications.inBackground(profileId, why);
  /** Prova o agente ACP no vínculo atual se ainda não tentou nele; sem executável (CLI ausente), nada a provar. */
  const verifyOncePerBinding = (profileId: string, health: ProfileHealth | undefined): void => {
    // sem login (ou com o login vencido) a tentativa deste vínculo fica esquecida: quando o login voltar,
    // a prova (que pode ter falhado por falta dele, como o authRequired do handshake) é refeita
    if (health?.problem === 'signin' || health?.authExpired) attempted.delete(profileId);
    if (health?.problem || health?.authExpired) return;
    let binding: string;
    try {
      const profile = new AiProfileRepo(handle.db).resolveProfile(router.boardId, profileId);
      binding = admission.isolationBinding(profile, profile.id, 'board').binding;
    } catch {
      return;
    }
    if (attempted.get(profileId) === binding) return;
    attempted.set(profileId, binding);
    verifyInBackground(profileId, health?.evidenceInvalidated ? 'a prova anterior perdeu a validade' : 'perfil sem prova em vigor');
  };
  // ligar um agente ACP já prova o handshake dele: sem isso o perfil ficaria com as capacidades sem prova
  router.onProfileEnabled((profileId) => verifyInBackground(profileId, 'perfil ligado'));
  // "Verificar capacidades" em Conectar agentes (história 13): o perfil verificável sem Conectar (a cópia do
  // Claude Code, o personalizado ACP) refaz as provas por aqui, no lugar do comando que saiu da paleta
  router.onVerify((profileId) => verifyDetailed(profileId).then((r) => r.message));

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
      if (!ownsNow()) throw new Error(NOT_SERVING_BOARD);
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
      // a resposta à pessoa roda por fora da fila (a história pode estar parada), mas nunca junto de outra
      // execução da mesma história: as duas escreveriam na mesma pasta
      if (mode === 'reply' && story) {
        const family = new Set([story.id, ...s.cards.filter((c) => c.parentId === story.id).map((c) => c.id)]);
        const busy = runner.running.some((id) => family.has(id)) || router.work.live().some((w) => family.has(w.cardId ?? ''));
        if (busy) throw new Error(REPLY_BUSY);
      }
      runner.start(cardId, 'manual', mode);
    },
    stopAi(cardId: string) {
      const s = router.snapshot();
      const card = s.cards.find((c) => c.id === cardId);
      if (!card) return;
      // na história, o Parar interrompe também a sub-tarefa que o board executa por ela: é o que a pessoa vê rodando
      const targets = card.parentId ? [card.id] : [card.id, ...s.cards.filter((c) => c.parentId === card.id).map((c) => c.id)];
      const running = targets.filter((id) => runner.running.includes(id));
      for (const id of running) runner.stop(id);
      if (running.length) return;
      // "Em execução" sem nenhuma execução da IA (o fim de uma execução não foi aplicado): o card passa para a
      // pessoa, e a mensagem dela na conversa devolve a vez à IA
      const live = new Set(router.work.live().map((w) => w.cardId));
      for (const c of s.cards.filter((k) => targets.includes(k.id) && k.status === 'running' && !live.has(k.id)))
        router.handle(
          {
            type: 'card.status.set',
            cardId: c.id,
            status: 'blocked',
            note: 'Parado pela pessoa: o card estava "Em execução" sem nenhuma execução da IA. Escreva na conversa para a IA seguir.',
          },
          { author: BOARD_AUTHOR, source: 'ai' },
        );
      runner.republish();
    },
    heartbeat,
    mergeWatcher,
    chat,
    autopilot,
    verifyExecutor(profileId) {
      // a mesma verificação pedida duas vezes (ligar o perfil e o comando, por exemplo) roda uma vez só
      return verifyDetailed(profileId).then((r) => r.message);
    },
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
      // conectar a ferramenta de um agente ACP também prova o handshake dele (o Claude verifica no Conectar)
      verifyInBackground(tool, 'ferramenta conectada');
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
