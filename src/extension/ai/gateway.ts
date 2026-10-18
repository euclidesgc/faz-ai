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
import type { AiRunConfig, AiRunOrigin, AiRunOutcome, AiRunStart, RunReport } from '../../shared/log';
import type { MeasureError } from '../aiOutput/errors';
import { spawnMeasured, type SpawnFn } from '../aiOutput/measured';
import type { OutputFormat } from '../aiOutput/reader';
import { headlessUnsupported, type HeadlessCommand, type HeadlessInput } from '../headless';
import type { RunLog } from '../log/runLog';
import type { StrictExecutionRequest } from '../../shared/executionAdmission';
import { AdmissionBlockedError, type ExecutionAdmission, type AdmittedExecution } from './admission';
import type { RunArtifactRequest, RunArtifactSnapshots } from '../runArtifactSnapshot';
import type { RunMcpSessions } from '../mcp/runSessions';
import type { ProcessIdentity } from '../processIdentity';

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
  /** Contrato v1 preparado pelo host; não aceita evidência ou selo de verificação do cliente. */
  strict?: { profileId: string; request: StrictExecutionRequest };
  input: HeadlessInput;
  /** a configuração que o log guarda; a permissão sai de `input.permission` */
  config: Omit<AiRunConfig, 'permission'>;
}

export interface AiCall {
  origin: AiRunOrigin;
  tool: AiTool;
  context: AiRunContext;
  cwd: string;
  /** tempo máximo da execução, em minutos */
  timeoutMinutes: number;
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
}

/** Como a execução terminou, já com o desfecho que o log gravou. */
export interface AiRunEnd {
  process?: { identity?: ProcessIdentity; terminationConfirmed: boolean };
  code: number | null;
  error?: Error;
  outcome: AiRunOutcome;
  stopped: boolean;
  timedOut: boolean;
  /** o consumo e o inventário medidos, os mesmos que foram para o log */
  report: RunReport;
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
  redact?(text: string): string;
  sessions?: RunMcpSessions;
  snapshots?: Pick<RunArtifactSnapshots, 'capture'>;
  admission?: ExecutionAdmission;
  leaseCoordinationDir?: string;
  boardId: string;
  /** obrigatório: sem ele a execução não teria onde ser registrada */
  runLog: RunLog;
  /** inicia o comando da CLI; é o único lugar que recebe um */
  spawn: SpawnFn;
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

    let measured: ReturnType<typeof spawnMeasured>;
    let attempts = 0;
    let format: OutputFormat = 'text';
    let workToken: string | undefined;
    const redact = (text: string) =>
      this.deps.redact?.(this.deps.sessions?.redact(text) ?? text) ?? this.deps.sessions?.redact(text) ?? text;
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
    try {
      const prepared = call.prepare();
      const { config } = prepared;
      let input = prepared.input;
      if (prepared.work) {
        if (!this.deps.sessions || !this.deps.snapshots) throw new Error('Identidade MCP e snapshot obrigatórios indisponíveis.');
        this.deps.sessions.bind(prepared.work.token, prepared.work.id, runId);
        workToken = prepared.work.token;
        if (!prepared.artifacts) throw new Error('A unidade precisa declarar os artefatos do snapshot, inclusive quando não há arquivos.');
        input = this.deps.sessions.injectToken(workToken, input);
      }
      if (prepared.artifacts && !this.deps.snapshots) throw new Error('Snapshot de artefatos indisponível; execução bloqueada.');
      const snapshot = this.deps.snapshots?.capture(runId, prepared.artifacts);
      if (snapshot) input = snapshot.rewrite(input);
      let admitted: AdmittedExecution | undefined;
      if (prepared.strict) {
        if (!this.deps.admission) throw new Error('Admissão por capacidades indisponível; execução v1 bloqueada.');
        try {
          admitted = this.deps.admission.prepare(call.tool, prepared.strict.profileId, input, call.cwd, prepared.strict.request);
        } catch (e) {
          if (e instanceof AdmissionBlockedError)
            runLog.describe(runId, { ...config, permission: input.permission, admission: e.decision });
          throw e;
        }
        input = admitted.input;
      }
      // a ferramenta sem suporte para esta permissão nem começa: confere antes de gravar a configuração
      const unsupported = admitted ? null : headlessUnsupported(call.tool, input.permission);
      if (unsupported) throw new Error(unsupported);
      if (admitted) {
        if (!runLog.describeRequired) throw new Error('Registro obrigatório da admissão indisponível.');
        runLog.describeRequired(runId, { ...config, permission: input.permission, admission: admitted.decision });
      } else runLog.describe(runId, { ...config, permission: input.permission });
      if (workToken !== undefined && snapshot) this.deps.sessions!.register(runId, snapshot, input);
      call.beforeSpawn?.();
      snapshot?.validate();
      measured = spawnMeasured(call.tool, input, call.cwd, {
        spawn: (command, cwd, out, control) => {
          attempts++;
          format = command.format;
          call.onAttempt?.(command);
          snapshot?.validate();
          const checked = admitted?.command(command) ?? command;
          const validate = () => {
            if (workToken !== undefined) this.deps.sessions!.assert(workToken);
            snapshot?.validate();
            admitted?.command(checked);
          };
          return this.deps.spawn(
            checked,
            cwd,
            out,
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
      });
    } catch (e) {
      revoke();
      if (e instanceof Error) {
        e.message = redact(e.message);
        if (e.stack) e.stack = redact(e.stack);
      }
      // nem chegou a existir processo (ferramenta sem suporte, plano impossível, spawn que falhou)
      runLog.finish(runId, 'unsupported');
      throw e;
    }

    let stopped = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      revoke();
      measured.proc.kill();
    }, call.timeoutMinutes * 60_000);
    const listeners: ((end: AiRunEnd) => void)[] = [];

    measured.proc.onExit((code, error) => {
      clearTimeout(timer);
      revoke();
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
      const report = this.deps.sessions?.sanitize(safeReport) ?? safeReport;
      runLog.measure(runId, report);
      const end: AiRunEnd = {
        code,
        error,
        outcome,
        stopped,
        timedOut,
        report,
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
