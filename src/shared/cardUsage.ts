/**
 * O que um card já gastou, medido pela ferramenta de IA no fim de cada execução. É histórico: só cresce.
 * Apagar mensagens ou mudar o que está marcado diminui a estimativa das próximas execuções, nunca isto.
 */

import type { CostBuckets } from './cost';

/** Os quatro contadores de token somados, e o total deles. */
export interface UsageTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface CardUsageRow {
  /** a fase em que a execução rodou, como o log a guardou (a coluna naquele momento); '' = sem fase */
  phase: string;
  runs: number;
  /** execuções ainda rodando: o consumo delas entra quando terminam */
  open: number;
  /** execuções com consumo medido; é delas que `tokens` vem */
  measuredRuns: number;
  durationMs: number;
  /** null = nenhuma execução da linha tem consumo medido (nunca 0 por falta de medição) */
  tokens: UsageTokens | null;
  /** execuções da linha com custo (`cost_usd` gravado); 0 => `cost` null */
  costedRuns: number;
  /** null = nenhuma execução da linha tem custo (nunca 0 por falta de preço) */
  cost: { totalUsd: number; estimatedUsd: number; buckets: CostBuckets } | null;
}

export interface CardUsage {
  /** as execuções do próprio card, uma linha por fase, na ordem das colunas do workflow */
  phases: CardUsageRow[];
  /** numa história, as execuções das sub-tarefas somadas; null quando não há nenhuma */
  subtasks: CardUsageRow | null;
  /** o card e as sub-tarefas; `phase` vazio */
  total: CardUsageRow;
  /**
   * o último mês que só ficou no total mensal do board (o detalhe por execução passou da retenção): as
   * execuções do card até ali não entram aqui; '' quando nenhum mês foi arquivado
   */
  archivedUntil: string;
}
