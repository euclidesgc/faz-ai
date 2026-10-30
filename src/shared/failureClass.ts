/**
 * Classe de falha de uma execução de IA (#1099). Função pura: o gateway a calcula uma vez no fim da
 * execução, grava em `ai_runs.failure_class` e a entrega em `AiRunEnd.failureClass`; quem decide repetir
 * é o runner (cards) ou o orquestrador (unidades da Implementação).
 */
export const FAILURE_CLASSES = ['transient', 'deterministic', 'budget', 'canceled'] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

export interface FailureSignals {
  stopped: boolean;
  timedOut: boolean;
  stalled: boolean;
  code: number | null;
  /** erro ao iniciar ou ler o processo */
  hasError: boolean;
  usageLimitReached: boolean;
  transientFailure: boolean;
  /** o fim da saída (últimas linhas) */
  tail: readonly string[];
}

/** Padrões de texto de falha de rede/serviço que costuma passar sozinha. */
export const TRANSIENT_TEXT =
  /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|overloaded_error|overloaded|rate limit|service unavailable|bad gateway|gateway timeout|UNAVAILABLE|RESOURCE_EXHAUSTED|API Error: 5\d\d|status:? ?5\d\d|HTTP 5\d\d|529)\b/i;

/** Quantas linhas do fim da saída o fallback de texto olha. */
const TAIL_LINES = 20;

/** `null` = a execução terminou bem. */
export function classifyFailure(s: FailureSignals): FailureClass | null {
  if (s.stopped) return 'canceled';
  if (s.usageLimitReached) return 'budget';
  if (s.code === 0 && !s.hasError && !s.timedOut) return null;
  if (s.stalled || s.timedOut) return 'deterministic';
  if (s.transientFailure) return 'transient';
  if (s.code === 143 || s.code === 137) return 'transient';
  if ((s.hasError || s.code !== 0) && s.tail.slice(-TAIL_LINES).some((line) => TRANSIENT_TEXT.test(line))) return 'transient';
  return 'deterministic';
}

export const MAX_TRANSIENT_RETRIES = 3;
/** Espera antes de cada retentativa: 30 s, 2 min, 5 min. */
export const RETRY_DELAYS_MS: readonly number[] = [30_000, 120_000, 300_000];

/** A espera antes da retentativa `retry` (1..3); fora da faixa vale o primeiro/último. */
export function retryDelay(retry: number): number {
  const i = Math.min(Math.max(Math.trunc(retry), 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[i]!;
}
