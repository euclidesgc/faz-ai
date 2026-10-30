import type { AcpSpawnFn } from './acp/provider';
import { executorOf, type Executor } from './drivers';
import { executorProfile } from './providers';
import { redactCredentialValues } from '../credentials';
import { authFailed } from './profileAuth';
import { profileInstallUrl } from '../requirements';
import { isAcpProfile, isGeminiCli, isReadyCli, profileBase, type AiProfile, type ProfileMode } from '../../shared/aiProfiles';
import { cursorToolNames, type CursorManifest } from './cursorManifest';
// A única porta por onde o board chama uma ferramenta de IA. Toda execução — de um card (a pessoa, o
// heartbeat ou o autopiloto) ou do chat — passa por `AiGateway.run`, e é aqui que o log de uso é
// escrito: abre a linha (`start`), grava a configuração (`describe`), fecha o desfecho (`finish`) e
// grava o consumo medido (`measure`). Quem chama não escreve no log, e por isso não tem como esquecer.
//
// Por que existe: antes, o executor de cards e o chat tinham cada um a sua cópia desse ciclo, e o log
// era opcional (`runLog?.`). Uma terceira forma de chamar a IA nasceria sem registro nenhum e ninguém
// perceberia — o painel só mostraria menos do que foi gasto. Agora o log é obrigatório no construtor, e o
// teste `aiGateway.test.ts` falha se algum arquivo fora daqui chamar o transporte medido.
//
// O custo gravado é o que a CLI informa, nunca um cálculo do board: ver `aiOutput/claude.ts`.
import type { AiTool } from '../../shared/harness';
import { priceRun, type ModelPricing } from '../../shared/cost';
import type { AiRunConfig, AiRunOrigin, AiRunOutcome, AiRunStart, RunReport } from '../../shared/log';
import type { MeasureError } from '../aiOutput/errors';
import type { Measured, SpawnFn } from '../aiOutput/measured';
import type { OutputFormat } from '../aiOutput/reader';
import { headlessUnsupported, type HeadlessCommand, type HeadlessInput } from '../headless';
import type { RunLog } from '../log/runLog';
import { checkRun, type RunCheck, type RunCheckManifest } from '../../shared/runCheck';
import type { StrictExecutionRequest } from '../../shared/executionAdmission';
import { AdmissionBlockedError, type ExecutionAdmission, type AdmittedExecution } from './admission';
import type { RunArtifactRequest, RunArtifactSnapshots } from '../runArtifactSnapshot';
import type { RunMcpSessions } from '../mcp/runSessions';
import { SpawnNotStartedError, type ProcessIdentity } from '../processIdentity';
import type { CommitTrailers, CommitTrailerKit } from '../commitTrailers';

/** Só acrescenta um link público revisado ao erro de executável ausente do perfil personalizado. */
/**
 * O modo que vai para o log: o do transporte que de fato roda (o gateway escolhe o ACP pelo agente do perfil),
 * não só o declarado, para o Consumo nunca atribuir a um modo uma execução que rodou em outro.
 */
const runMode = (profile: AiProfile): ProfileMode => (profile.mode === 'api' ? 'api' : isAcpProfile(profile) ? 'acp' : 'cli');
export function missingProfileCommand(error: Error, profile: AiProfile | undefined): Error {
  if (!(error instanceof SpawnNotStartedError) || !error.message.startsWith('comando "') || profile?.kind !== 'custom') return error;
  const installUrl = profileInstallUrl(profile);
  if (installUrl) error.message += ` Instalação do perfil: ${installUrl}`;
  return error;
}

/** O contexto da execução que o log congela na hora da chamada: a IA move o card durante o trabalho. */
export type AiRunContext = Omit<AiRunStart, 'boardId' | 'startedAt' | 'origin' | 'tool'>;

/** Contexto de uma execução sem card, como a do chat. */
export const NO_CARD: AiRunContext = {
  cardId: null,
  cardNumber: null,
  cardTitle: '',
  cardType: '',
  workflow: '',
  columnName: '',
  phase: '',
};

/** O que a execução precisa depois que a linha do log já abriu. */
export interface AiPrepared {
  work?: { id: string; token: string };
  artifacts?: RunArtifactRequest;
  /** Contrato preparado pelo host; não aceita evidência ou selo de verificação do cliente. */
  strict?: { profileId: string; request: StrictExecutionRequest };
  /** O que o card liberou, para a conferência no fim; sem ele (chat) a execução fica "não conferida". */
  conference?: { manifest: RunCheckManifest; boardServer: string };
  input: HeadlessInput;
  /** a configuração que o log guarda; a permissão sai de `input.permission`, e o modo, do perfil */
  config: Omit<AiRunConfig, 'permission' | 'mode'>;
}

export interface AiCall {
  origin: AiRunOrigin;
  tool: AiTool;
  /** Perfil escolhido; o host substitui a configuração pública pelos valores do cofre. */
  profile?: AiProfile;
  context: AiRunContext;
  cwd: string;
  /** tempo máximo da execução, em minutos */
  timeoutMinutes: number;
  /** minutos sem saída até encerrar; ausente ou 0 = sem watchdog. Só o runner informa (chat e testes ficam só com o tempo limite) */
  idleMinutes?: number;
  /**
   * Monta o pedido e a configuração. Roda DEPOIS de abrir a linha do log: o plano de execução pode
   * lançar, e a execução que nem começou também é informação (fica como `unsupported`).
   */
  prepare(): AiPrepared;
  /**
   * Roda depois de tudo conferido e gravado no log, imediatamente antes de o processo abrir: é o
   * ponto em que quem chama pode começar a mostrar a execução (o chat põe aqui a pergunta da pessoa).
   */
  beforeSpawn?(): void;
  /** Persiste a identidade e aguarda o flush antes de o launcher receber o comando. Somente host. */
  beforeStart?(identity: ProcessIdentity): void | Promise<void>;
  /** cada linha legível que a ferramenta produziu, mais os recados do board sobre a execução */
  log(line: string): void;
  /** a cada processo aberto: o primeiro e, na volta para texto, o segundo */
  onAttempt?(command: HeadlessCommand): void;
  /**
   * Só a execução de um card preenche: os commits feitos nela levam os trailers de rastreio. `phase` é a coluna
   * da história (não a do próprio card, que numa sub-tarefa é "Em andamento"); o `runId` o gateway já tem.
   */
  commitTrailers?: { card: number; phase: string };
}

/** Como a execução terminou, já com o desfecho que o log gravou. */
export interface AiRunEnd {
  /** Classificado no host antes da ocultação das frases privadas. */
  authExpired?: boolean;
  process?: { identity?: ProcessIdentity; terminationConfirmed: boolean };
  code: number | null;
  error?: Error;
  outcome: AiRunOutcome;
  stopped: boolean;
  timedOut: boolean;
  /** o relógio que encerrou foi o da falta de atividade; implica `timedOut` */
  stalled: boolean;
  /** o consumo e o inventário medidos, os mesmos que foram para o log */
  report: RunReport;
  /** a conferência do inventário contra o que o card liberou, a mesma que foi para o log */
  check: RunCheck;
  /** quantos processos a execução abriu (2 = a CLI recusou a saída estruturada e rodou em texto) */
  attempts: number;
  /** o formato do último processo */
  format: OutputFormat;
  /**
   * por que a medição não aconteceu, para quem chamou explicar a falha pela classe (`instanceof`),
   * nunca pela frase; null quando foi medida
   */
  measureError: MeasureError | null;
}

export interface AiExecution {
  readonly identity?: ProcessIdentity;
  terminationConfirmed?(): boolean;
  /** o id da linha em `ai_runs`; `''` quando o log não conseguiu gravar */
  readonly runId: string;
  /** o mesmo valor passado a `runLog.start`: sem segundo relógio */
  readonly startedAt: number;
  /** interrompe a execução; o desfecho gravado é `stopped` */
  stop(): void;
  /** chamado uma vez, DEPOIS de o desfecho e o consumo irem para o log */
  onExit(listener: (end: AiRunEnd) => void): void;
}

export interface AiGatewayDeps {
  /** Inicia um agente ACP com a entrada aberta (só o host inicia processos de IA). */
  spawnAcp?: AcpSpawnFn;
  /**
   * Quem executa cada perfil; o registro dos drivers por padrão. O cenário do modo API troca pelo driver
   * apontado para o servidor HTTP falso, o mesmo que entrega à admissão (`ExecutionAdmission`).
   */
  executorOf?(profile: AiProfile): Executor;
  /** O host confere também perfis importados no caminho legado antes de preparar arquivos. */
  profile?(id: string): AiProfile | null;
  resolveProfile?(id: string): AiProfile;
  redact?(text: string): string;
  sessions?: RunMcpSessions;
  snapshots?: Pick<RunArtifactSnapshots, 'capture'>;
  admission?: ExecutionAdmission;
  leaseCoordinationDir?: string;
  /**
   * Garantia do Cursor por hook: a pasta dos manifestos e a leitura do estado do hook (null = pronto; senão o
   * motivo). Sem ele, ou com o hook ausente ou desatualizado, o manifesto não é gravado e a garantia é parcial.
   */
  cursorHook?: { dir: string; status(): string | null };
  boardId: string;
  /** obrigatório: sem ele a execução não teria onde ser registrada */
  runLog: RunLog;
  /**
   * A chave de API do cofre para o perfil cujo driver entra por chave (o Gemini pelo ACP, história 7); null
   * sem chave. Ela vai ao driver e é mascarada em toda linha do log, em toda mensagem de erro e no `ai_runs`.
   */
  apiKey?(profile: AiProfile): string | null;
  /**
   * O regime do pedido de admissão para o perfil que vai rodar: a ciência do perfil no Conectar, ou o regime
   * do board (`admissionRegimeOf`). Quem monta o pedido não sabe o perfil final em todo caminho (o chat, o
   * teste do perfil, o runner legado); o gateway sabe, e aplica aqui, num lugar só.
   */
  regimeOf?(profileId: string): Pick<StrictExecutionRequest, 'regime' | 'compatibilityReview'>;
  /** a ferramenta recusou o modelo como inexistente para a conta (`modelUnavailable`): o host o tira do catálogo */
  onModelUnavailable?(profile: AiProfile, model: string): void;
  /**
   * O preço cadastrado no catálogo para o modelo da execução (null = sem preço ou modelo fora do catálogo). O
   * gateway completa com ele o consumo de toda execução (`priceRun`), antes de gravar no log e de entregar o
   * relatório; uma falha aqui não derruba a execução.
   */
  priceOf?(profile: AiProfile, model: string | null): ModelPricing | null;
  /** inicia o comando da CLI; é o único lugar que recebe um */
  spawn: SpawnFn;
  /** os trailers de rastreio dos commits da run; sem ele, nenhuma run recebe o kit */
  commitTrailers?: Pick<CommitTrailers, 'prepare'>;
}

/** Como o log classifica o fim da execução. Quem interrompe e o tempo limite vencem o código de saída: matar o processo também o deixa diferente de zero. */
export function outcomeOf(end: { stopped: boolean; timedOut: boolean; code: number | null; error?: Error }): AiRunOutcome {
  if (end.stopped) return 'stopped';
  if (end.timedOut) return 'timeout';
  if (end.error || end.code !== 0) return 'failed';
  return 'done';
}

export class AiGateway {
  constructor(private deps: AiGatewayDeps) {}

  /** O manifesto do card para o hook do Cursor; null fora do Cursor, sem a conferência do card ou com o hook indisponível. */
  private cursorManifestFor(
    profile: AiProfile,
    runId: string,
    conference: AiPrepared['conference'],
    log: (line: string) => void,
  ): { dir: string; manifest: CursorManifest } | undefined {
    if (profileBase(profile) !== 'cursor' || !conference || !this.deps.cursorHook) return undefined;
    const reason = this.deps.cursorHook.status();
    if (reason) {
      log(`Garantia do Cursor parcial: ${reason}. MCP, subagentes e ferramentas seguem como orientação nesta execução.`);
      return undefined;
    }
    const m = conference.manifest;
    const allowed = cursorToolNames(m.tools);
    // sem equivalente no Cursor para alguma ferramenta: só as negadas valem, `tools` fica como orientação
    if (!allowed.complete)
      log('Garantia do Cursor parcial: há ferramentas do card sem equivalente no Cursor; a lista de ferramentas segue como orientação.');
    return {
      dir: this.deps.cursorHook.dir,
      manifest: {
        runId,
        mcpServers: [conference.boardServer, ...m.mcpServers],
        subagents: [],
        tools: allowed.complete ? allowed.names : [],
        deniedTools: cursorToolNames(m.deniedTools).names,
        skills: m.skills,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /** O hook do Cursor está instalado e atual: só então MCP e ferramentas são impostos no Cursor. */
  cursorHookReady(): boolean {
    return !!this.deps.cursorHook && this.deps.cursorHook.status() === null;
  }

  get supportsSnapshots(): boolean {
    return !!this.deps.snapshots;
  }

  /**
   * Abre a linha do log, confere se a ferramenta roda com a permissão pedida, inicia o processo e
   * devolve a execução. Lança erro se não for possível começar — e, nesse caso, a linha do log já
   * fechou como `unsupported`.
   */
  run(call: AiCall): AiExecution {
    const { runLog, boardId } = this.deps;
    const startedAt = Date.now();
    // o id da ferramenta, não o rótulo: o rótulo muda e levaria as séries antigas com ele
    const runId = runLog.start({ ...call.context, boardId, startedAt, origin: call.origin, tool: call.tool });

    let measured: Measured;
    let attempts = 0;
    let format: OutputFormat = 'text';
    let workToken: string | undefined;
    let profile: AiProfile | undefined;
    /** o modelo do plano (o mesmo que o log grava em `ai_runs.model`); fora do `try` para o preço no fim */
    let runModel: string | null = null;
    let privateAuthFailed = false;
    let timedOut = false;
    /** o processo atual tem stream (CLI com format !== 'text', ou ACP); o formato sozinho não diz, o ACP grava 'text' */
    let streaming = false;
    let stalled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;
    const idleMs = (call.idleMinutes ?? 0) * 60_000;
    let conference: AiPrepared['conference'];
    /** a pasta dos hooks desta run, apagada no fim ou na falha ao começar */
    let kit: CommitTrailerKit | null = null;
    const authTails = { stdout: '', stderr: '' };
    /** a chave do cofre desta execução: mascarada aqui mesmo, sem depender de o cofre já a conhecer */
    let apiKey: string | undefined;
    const redact = (text: string) => {
      const masked = apiKey ? text.split(apiKey).join('[credencial local]') : text;
      const safe = redactCredentialValues(masked, profile?.config);
      return this.deps.redact?.(this.deps.sessions?.redact(safe) ?? safe) ?? this.deps.sessions?.redact(safe) ?? safe;
    };
    const revoke = () => {
      if (workToken === undefined) return;
      try {
        this.deps.sessions?.revoke(workToken);
      } catch (e) {
        call.log(
          redact(
            `Não foi possível persistir a revogação; a sessão permanece recusada e exige reconciliação: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      }
    };
    const arm = () => {
      clearTimeout(idleTimer);
      if (ended || !streaming || idleMs <= 0) return;
      idleTimer = setTimeout(() => {
        stalled = true;
        timedOut = true;
        revoke();
        measured.proc.kill();
      }, idleMs);
    };
    try {
      if (this.deps.profile) {
        const profile = this.deps.profile(call.tool);
        if (!profile || !profile.enabled || profile.credentials?.review === 'pending')
          throw new Error('Perfil desativado ou pendente de revisão.');
      }
      profile = structuredClone(this.deps.resolveProfile?.(call.tool) ?? call.profile ?? executorProfile(call.tool));
      if (profile.id !== call.tool) throw new Error('O perfil resolvido não corresponde ao alvo solicitado.');
      if (
        !profile.enabled ||
        profile.credentials?.review === 'pending' ||
        (!isReadyCli(profile) && (profile.credentials?.review !== 'reviewed' || !profile.credentials.available))
      )
        throw new Error('Perfil desativado ou pendente de revisão.');
      const prepared = call.prepare();
      if (!isReadyCli(profile) && !prepared.strict) throw new Error('Perfis configuráveis exigem contrato e admissão por capacidades.');
      if (!isReadyCli(profile) && prepared.strict?.profileId !== profile.id)
        throw new Error('A admissão não corresponde ao perfil solicitado.');
      const { config } = prepared;
      runModel = config.model;
      conference = prepared.conference;
      let input = prepared.input;
      if (prepared.work) {
        if (!this.deps.sessions || !this.deps.snapshots) throw new Error('Identidade MCP e snapshot obrigatórios indisponíveis.');
        this.deps.sessions.bind(prepared.work.token, prepared.work.id, runId);
        workToken = prepared.work.token;
        if (!prepared.artifacts) throw new Error('A unidade precisa declarar os artefatos do snapshot, inclusive quando não há arquivos.');
        input = this.deps.sessions.injectToken(workToken, input);
      }
      if (prepared.artifacts && !this.deps.snapshots) throw new Error('Snapshot de artefatos indisponível; execução bloqueada.');
      const { admission: _admission, ...resolved } = config;
      const snapshot = this.deps.snapshots?.capture(runId, prepared.artifacts, resolved);
      if (snapshot) input = snapshot.rewrite(input);
      let admitted: AdmittedExecution | undefined;
      if (prepared.strict) {
        if (!this.deps.admission) throw new Error('Admissão por capacidades indisponível; execução v1 bloqueada.');
        const { regime: _regime, compatibilityReview: _review, ...request } = prepared.strict.request;
        const strict = this.deps.regimeOf ? { ...request, ...this.deps.regimeOf(prepared.strict.profileId) } : prepared.strict.request;
        try {
          admitted = this.deps.admission.prepare(profile, prepared.strict.profileId, input, call.cwd, strict);
        } catch (e) {
          if (e instanceof AdmissionBlockedError)
            runLog.describe(runId, { ...config, permission: input.permission, mode: runMode(profile), admission: e.decision });
          throw e;
        }
        input = admitted.input;
      }
      // a ferramenta sem suporte para esta permissão nem começa: confere antes de gravar a configuração
      const executor = (this.deps.executorOf ?? executorOf)(profile);
      if (executor.transport === 'acp') {
        if (!this.deps.spawnAcp) throw new Error('Transporte ACP indisponível neste host.');
        // a admissão vinculou o comando do agente, não o de uma CLI: o validador certo é o do transporte
        if (admitted && admitted.transport !== 'acp') throw new Error('A admissão não é do transporte ACP; o perfil não roda.');
      } else if (executor.transport === 'api') {
        // no modo API quem executa cada chamada é o board: sem a decisão admitida não há o que declarar ao modelo
        if (!admitted) throw new Error('O modo API exige a admissão por capacidades; o perfil não roda sem ela.');
        if (admitted.transport !== 'api') throw new Error('A admissão não é do modo API; o perfil não roda.');
      } else if (admitted && admitted.transport !== 'cli') throw new Error('A admissão é de outro transporte; o perfil não roda pela CLI.');
      const unsupported = admitted || executor.transport === 'acp' ? null : headlessUnsupported(profile, input.permission);
      if (unsupported) throw new Error(unsupported);
      if (admitted) {
        if (!runLog.describeRequired) throw new Error('Registro obrigatório da admissão indisponível.');
        runLog.describeRequired(runId, { ...config, permission: input.permission, mode: runMode(profile), admission: admitted.decision });
      } else runLog.describe(runId, { ...config, permission: input.permission, mode: runMode(profile) });
      if (workToken !== undefined && snapshot) this.deps.sessions!.register(runId, snapshot, input);
      call.beforeSpawn?.();
      snapshot?.validate();
      if (call.commitTrailers && runId && this.deps.commitTrailers)
        kit = this.deps.commitTrailers.prepare({ ...call.commitTrailers, runId }, (l) => call.log(redact(l)));
      const trailerKit = kit;
      // as variáveis entram DEPOIS da conferência da admissão (o `env` do comando é comparado com o esperado)
      // e não fazem parte do vínculo: o `env()` é recalculado a cada processo, sobre o ambiente que ele recebe
      const withTrailers = <C extends { env?: Record<string, string> }>(c: C): C =>
        trailerKit ? { ...c, env: { ...c.env, ...trailerKit.env({ ...process.env, ...c.env }) } } : c;
      const watch = (text: string, stream: 'stdout' | 'stderr') => {
        arm();
        if (!isReadyCli(profile!) && profile!.config.authPatterns?.length) {
          authTails[stream] = (authTails[stream] + text).slice(-200000);
          privateAuthFailed ||= authFailed(profile!, Object.values(authTails), false);
        }
      };
      // o driver é a única diferença: o ciclo do log, a admissão e o cancelamento seguem iguais. Os dois
      // `spawn` levam as conferências do gateway; o driver usa o do transporte dele
      const spawnProcess = this.deps.spawnAcp;
      apiKey = this.deps.apiKey?.(profile) ?? undefined;
      // o modo API não abre processo: é uma execução, e as conferências dos `spawn` rodam antes de cada pedido
      if (executor.transport === 'api') attempts = 1;
      measured = executor.run(input, {
        profile,
        cwd: call.cwd,
        ...(apiKey ? { apiKey } : {}),
        beforeRequest: () => {
          if (workToken !== undefined) this.deps.sessions!.assert(workToken);
          snapshot?.validate();
          admitted?.api();
        },
        spawnAcp:
          spawnProcess &&
          ((command, cwd, out) => {
            attempts++;
            format = 'text';
            streaming = true;
            arm();
            snapshot?.validate();
            if (workToken !== undefined) this.deps.sessions!.assert(workToken);
            // o comando e os argumentos do agente são os admitidos; o executável é o do vínculo
            const checked = admitted?.acpCommand(command) ?? command;
            return spawnProcess(withTrailers(checked), cwd, (text, stream) => {
              watch(text, stream);
              out(text, stream);
            });
          }),
        spawn: (command, cwd, out, control) => {
          attempts++;
          format = command.format;
          streaming = command.format !== 'text';
          arm();
          call.onAttempt?.(command);
          snapshot?.validate();
          const checked = admitted?.command(command) ?? command;
          const validate = () => {
            if (workToken !== undefined) this.deps.sessions!.assert(workToken);
            snapshot?.validate();
            admitted?.command(checked);
          };
          return this.deps.spawn(
            withTrailers(checked),
            cwd,
            (text, stream) => {
              watch(text, stream);
              out(text, stream);
            },
            control && (admitted || snapshot || call.beforeStart)
              ? {
                  beforePreparation: () => {
                    validate();
                    control.beforePreparation();
                  },
                  beforeStart: (identity) => {
                    validate();
                    const previous = control.beforeStart(identity);
                    const record = () => call.beforeStart?.(identity);
                    const ready = previous ? previous.then(record) : record();
                    if (ready) return ready.then(validate);
                    validate();
                  },
                }
              : control,
          );
        },
        log: (line) => call.log(redact(line)),
        runId,
        leaseCoordinationDir: this.deps.leaseCoordinationDir,
        ...(trailerKit ? { commitEnv: (base) => trailerKit.env(base) } : {}),
        // o manifesto do hook só existe no Cursor; o executor de ACP não o lê
        execManifest: executor.transport === 'cli' ? this.cursorManifestFor(profile, runId, conference, call.log) : undefined,
      });
    } catch (e) {
      ended = true;
      clearTimeout(idleTimer);
      revoke();
      kit?.dispose();
      if (e instanceof Error) {
        missingProfileCommand(e, profile);
        e.message = redact(e.message);
        if (e.stack) e.stack = redact(e.stack);
      }
      // nem chegou a existir processo (ferramenta sem suporte, plano impossível, spawn que falhou)
      runLog.finish(runId, 'unsupported');
      throw e;
    }

    let stopped = false;
    const timer = setTimeout(() => {
      timedOut = true;
      revoke();
      measured.proc.kill();
    }, call.timeoutMinutes * 60_000);
    const listeners: ((end: AiRunEnd) => void)[] = [];

    measured.proc.onExit((code, error) => {
      ended = true;
      clearTimeout(timer);
      clearTimeout(idleTimer);
      revoke();
      kit?.dispose();
      if (error) {
        error.message = redact(error.message);
        if (error.stack) error.stack = redact(error.stack);
      }
      const outcome = outcomeOf({ stopped, timedOut, code, error });
      runLog.finish(runId, outcome, code);
      const rawReport = measured.report();
      const safeReport = {
        ...rawReport,
        answer: redact(rawReport.answer),
        reason: rawReport.reason === null ? null : redact(rawReport.reason),
        inventory: rawReport.inventory.map((item) => ({ ...item, name: redact(item.name) })),
        ...(rawReport.bashCommands
          ? { bashCommands: rawReport.bashCommands.map((item) => ({ ...item, command: redact(item.command) })) }
          : {}),
      };
      const sanitized = this.deps.sessions?.sanitize(safeReport) ?? safeReport;
      // o custo pelo preço do catálogo nunca derruba a execução: se falhar, segue sem estimativa
      let report = sanitized;
      try {
        if (profile && sanitized.measure !== 'none' && sanitized.consumption) {
          const pricing = this.deps.priceOf?.(profile, runModel) ?? null;
          if (pricing) report = { ...sanitized, consumption: priceRun(sanitized.consumption, pricing) };
        }
      } catch (e) {
        call.log(redact(`Custo da execução indisponível: ${e instanceof Error ? e.message : String(e)}`));
      }
      // a conferência nunca derruba a execução: se falhar, grava "não conferida" e segue
      let check: RunCheck = { status: 'unchecked', reason: report.measure === 'none' ? 'not_measured' : 'no_inventory' };
      try {
        // o inventário do Gemini pela CLI está nos nomes dele: a conferência os lê pela tabela do Gemini
        if (conference)
          check = checkRun(report, conference.manifest, conference.boardServer, profile && isGeminiCli(profile) ? 'gemini' : undefined);
      } catch (e) {
        call.log(redact(`Conferência da execução indisponível: ${e instanceof Error ? e.message : String(e)}`));
      }
      runLog.measure(runId, report, check);
      if (report.modelUnavailable && profile) this.deps.onModelUnavailable?.(profile, report.modelUnavailable);
      const end: AiRunEnd = {
        ...(privateAuthFailed ? { authExpired: true } : {}),
        code,
        error,
        outcome,
        stopped,
        timedOut,
        stalled,
        report,
        check,
        attempts,
        format,
        measureError: measured.failure(),
        process: { identity: measured.proc.identity, terminationConfirmed: measured.proc.terminationConfirmed?.() === true },
      };
      for (const fn of listeners) fn(end);
    });

    return {
      get identity() {
        return measured.proc.identity;
      },
      terminationConfirmed: () => measured.proc.terminationConfirmed?.() === true,
      runId,
      startedAt,
      stop: () => {
        stopped = true;
        revoke();
        measured.proc.kill();
      },
      onExit: (fn) => listeners.push(fn),
    };
  }
}
