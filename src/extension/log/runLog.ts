// A interface fina que o executor e o chat usam para registrar uma execução de IA: abre a linha
// (`start`), completa a configuração depois do plano (`describe`), grava o consumo medido (`measure`) e o desfecho
// (`finish`).
// A regra de "o que gravar" é de `AiRunRepo`; aqui é só engolir falha.
//
// No legado, falha no log escreve no canal e não derruba a execução. No contrato v1,
// describeRequired é bloqueante: não há inferência sem a decisão de admissão gravada.
// `start` devolve `''` quando não conseguiu gravar, e os demais não fazem nada com um id vazio — quem
// chama não precisa saber se o log está funcionando.
import type { Database } from 'sql.js';
import type { FailureClass } from '../../shared/failureClass';
import type { AiRunConfig, AiRunOutcome, AiRunStart, RunReport } from '../../shared/log';
import type { RunCheck } from '../../shared/runCheck';
import { AiRunRepo } from './aiRunRepo';

export interface RunLog {
  /** Abre a linha da execução com o contexto do momento da chamada. Devolve o id (`''` se não deu). */
  start(meta: AiRunStart): string;
  /** Completa modelo, esforço, perfil, subagente, permissão, skills e servidores MCP depois do plano. */
  describe(id: string, config: AiRunConfig): void;
  /** Contrato v1: falha de auditoria é bloqueante, antes de iniciar inferência. */
  describeRequired?(id: string, config: AiRunConfig): void;
  /** Fecha a linha com o desfecho e o código de saída, quando houver. */
  finish(id: string, outcome: AiRunOutcome, exitCode?: number | null, failureClass?: FailureClass | null): void;
  /** Grava o consumo e o inventário medidos, de uma vez, junto do desfecho. `measure: 'none'` grava só "não medido". */
  measure(id: string, report: RunReport, check?: RunCheck): void;
  /**
   * Marca como `unknown` as execuções que a sessão anterior não chegou a fechar e devolve os cards
   * delas. Chamada na abertura do board, só pela janela dona dele.
   */
  closeOpen(at: number): string[];
}

/** O `RunLog` que grava em `ai_runs`. `log` é o canal onde as falhas do próprio log aparecem. */
export function createRunLog(db: Database, log?: (line: string) => void): RunLog {
  const runs = new AiRunRepo(db);
  const fail = (e: unknown): void => {
    const message = e instanceof Error ? e.message : String(e);
    (log ?? console.error)(`[fazai] falha ao registrar a execução de IA: ${message}`);
  };
  const guard = (fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      fail(e);
    }
  };
  return {
    start(meta) {
      try {
        return runs.start(meta);
      } catch (e) {
        fail(e);
        return '';
      }
    },
    describe(id, config) {
      if (!id) return;
      guard(() => runs.describe(id, config));
    },
    describeRequired(id, config) {
      if (!id) throw new Error('A execução não pôde ser registrada para admissão.');
      runs.describe(id, config);
    },
    finish(id, outcome, exitCode, failureClass) {
      if (!id) return;
      guard(() => runs.finish(id, outcome, exitCode, failureClass));
    },
    measure(id, report, check) {
      if (!id) return;
      guard(() => runs.measure(id, report, check));
    },
    closeOpen(at) {
      try {
        return runs.closeOpen(at);
      } catch (e) {
        fail(e);
        return [];
      }
    },
  };
}
