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
import { spawnMeasured, type SpawnFn } from '../aiOutput/measured';
import type { OutputFormat } from '../aiOutput/reader';
import { headlessUnsupported, type HeadlessCommand, type HeadlessInput } from '../headless';
import type { RunLog } from '../log/runLog';

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
  /** cada linha legível que a ferramenta produziu, mais os recados do board sobre a execução */
  log(line: string): void;
  /** a cada processo aberto: o primeiro e, na volta para texto, o segundo */
  onAttempt?(command: HeadlessCommand): void;
}

/** Como a execução terminou, já com o desfecho que o log gravou. */
export interface AiRunEnd {
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
}

export interface AiExecution {
  /** o id da linha em `ai_runs`; `''` quando o log não conseguiu gravar */
  readonly runId: string;
  /** interrompe a execução; o desfecho gravado é `stopped` */
  stop(): void;
  /** chamado uma vez, DEPOIS de o desfecho e o consumo irem para o log */
  onExit(listener: (end: AiRunEnd) => void): void;
}

export interface AiGatewayDeps {
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

  /**
   * Abre a linha do log, confere se a ferramenta roda com a permissão pedida, inicia o processo e
   * devolve a execução. Lança erro se não for possível começar — e, nesse caso, a linha do log já
   * fechou como `unsupported`.
   */
  run(call: AiCall): AiExecution {
    const { runLog, boardId } = this.deps;
    // o id da ferramenta, não o rótulo: o rótulo muda e levaria as séries antigas com ele
    const runId = runLog.start({ ...call.context, boardId, startedAt: Date.now(), origin: call.origin, tool: call.tool });

    let measured: ReturnType<typeof spawnMeasured>;
    let attempts = 0;
    let format: OutputFormat = 'text';
    try {
      const { input, config } = call.prepare();
      // a ferramenta sem suporte para esta permissão nem começa: confere antes de gravar a configuração
      const unsupported = headlessUnsupported(call.tool, input.permission);
      if (unsupported) throw new Error(unsupported);
      runLog.describe(runId, { ...config, permission: input.permission });
      call.beforeSpawn?.();
      measured = spawnMeasured(call.tool, input, call.cwd, {
        spawn: (command, cwd, out) => {
          attempts++;
          format = command.format;
          call.onAttempt?.(command);
          return this.deps.spawn(command, cwd, out);
        },
        log: call.log,
      });
    } catch (e) {
      // nem chegou a existir processo (ferramenta sem suporte, plano impossível, spawn que falhou)
      runLog.finish(runId, 'unsupported');
      throw e;
    }

    let stopped = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      measured.proc.kill();
    }, call.timeoutMinutes * 60_000);
    const listeners: ((end: AiRunEnd) => void)[] = [];

    measured.proc.onExit((code, error) => {
      clearTimeout(timer);
      const outcome = outcomeOf({ stopped, timedOut, code, error });
      runLog.finish(runId, outcome, code);
      const report = measured.report();
      runLog.measure(runId, report);
      const end: AiRunEnd = { code, error, outcome, stopped, timedOut, report, attempts, format };
      for (const fn of listeners) fn(end);
    });

    return {
      runId,
      stop: () => {
        stopped = true;
        measured.proc.kill();
      },
      onExit: (fn) => listeners.push(fn),
    };
  }
}
