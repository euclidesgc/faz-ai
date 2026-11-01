import type { Database } from 'sql.js';
import type { CardUsage, CardUsageRow } from '../../shared/cardUsage';
import { COST_BUCKETS, type CostBuckets } from '../../shared/cost';
import { FAILURE_CLASSES, type FailureClass } from '../../shared/failureClass';
import { all, num, str, type Row } from '../db/query';
import { detailMonths } from './rollup';

/**
 * Soma das execuções por fase. Os tokens vêm só das execuções medidas (`measure <> 'none'`), como no
 * painel de métricas: uma execução sem medição conta nas execuções, nunca como consumo zero.
 */
const SUMS = `COUNT(*) AS n,
  SUM(CASE WHEN outcome IS NULL THEN 1 ELSE 0 END) AS open,
  SUM(CASE WHEN measure <> 'none' THEN 1 ELSE 0 END) AS measured,
  SUM(COALESCE(duration_ms,0)) AS ms,
  SUM(CASE WHEN measure <> 'none' THEN COALESCE(input_tokens,0) ELSE 0 END) AS input,
  SUM(CASE WHEN measure <> 'none' THEN COALESCE(output_tokens,0) ELSE 0 END) AS output,
  SUM(CASE WHEN measure <> 'none' THEN COALESCE(cache_read_tokens,0) ELSE 0 END) AS cache_read,
  SUM(CASE WHEN measure <> 'none' THEN COALESCE(cache_write_tokens,0) ELSE 0 END) AS cache_write,
  SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS costed,
  SUM(COALESCE(cost_usd,0)) AS cost,
  SUM(CASE WHEN cost_usd IS NOT NULL AND COALESCE(cost_estimated, 1) <> 0 THEN cost_usd ELSE 0 END) AS cost_est,
  SUM(COALESCE(cost_input_usd,0)) AS b_input,
  SUM(COALESCE(cost_output_usd,0)) AS b_output,
  SUM(COALESCE(cost_cache_read_usd,0)) AS b_cacheRead,
  SUM(COALESCE(cost_cache_write_usd,0)) AS b_cacheWrite,
${FAILURE_CLASSES.map((c) => `  SUM(CASE WHEN failure_class = '${c}' THEN 1 ELSE 0 END) AS f_${c}`).join(',\n')}`;

/** Só as classes com ao menos uma execução; sem nenhuma falha, o campo nem existe. */
const failuresOf = (r: Row): CardUsageRow['failures'] => {
  const out: Partial<Record<FailureClass, number>> = {};
  for (const c of FAILURE_CLASSES) if (num(r[`f_${c}`]) > 0) out[c] = num(r[`f_${c}`]);
  return Object.keys(out).length ? out : undefined;
};

const rowOf = (phase: string, r: Row): CardUsageRow => {
  const measured = num(r.measured);
  const costed = num(r.costed);
  const input = num(r.input);
  const output = num(r.output);
  const cacheRead = num(r.cache_read);
  const cacheWrite = num(r.cache_write);
  return {
    phase,
    runs: num(r.n),
    open: num(r.open),
    measuredRuns: measured,
    durationMs: num(r.ms),
    tokens: measured ? { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite } : null,
    costedRuns: costed,
    ...(failuresOf(r) ? { failures: failuresOf(r) } : {}),
    cost: costed
      ? {
          totalUsd: num(r.cost),
          estimatedUsd: num(r.cost_est),
          buckets: { input: num(r.b_input), output: num(r.b_output), cacheRead: num(r.b_cacheRead), cacheWrite: num(r.b_cacheWrite) },
        }
      : null,
  };
};

/** Soma as falhas por classe das linhas; sem nenhuma, não devolve o campo. */
function sumFailures(rows: CardUsageRow[]): { failures?: CardUsageRow['failures'] } {
  const out: Partial<Record<FailureClass, number>> = {};
  for (const r of rows) for (const c of FAILURE_CLASSES) if (r.failures?.[c]) out[c] = (out[c] ?? 0) + r.failures[c]!;
  return Object.keys(out).length ? { failures: out } : {};
}

/** Junta linhas numa só (o total, ou as sub-tarefas). */
function sumRows(phase: string, rows: CardUsageRow[]): CardUsageRow {
  const measured = rows.filter((r) => r.tokens);
  const costed = rows.filter((r) => r.cost);
  const add = (pick: (t: NonNullable<CardUsageRow['tokens']>) => number) => measured.reduce((n, r) => n + pick(r.tokens!), 0);
  return {
    phase,
    runs: rows.reduce((n, r) => n + r.runs, 0),
    open: rows.reduce((n, r) => n + r.open, 0),
    measuredRuns: rows.reduce((n, r) => n + r.measuredRuns, 0),
    durationMs: rows.reduce((n, r) => n + r.durationMs, 0),
    tokens: measured.length
      ? {
          input: add((t) => t.input),
          output: add((t) => t.output),
          cacheRead: add((t) => t.cacheRead),
          cacheWrite: add((t) => t.cacheWrite),
          total: add((t) => t.total),
        }
      : null,
    costedRuns: rows.reduce((n, r) => n + r.costedRuns, 0),
    ...sumFailures(rows),
    cost: costed.length
      ? {
          totalUsd: costed.reduce((n, r) => n + r.cost!.totalUsd, 0),
          estimatedUsd: costed.reduce((n, r) => n + r.cost!.estimatedUsd, 0),
          buckets: Object.fromEntries(
            COST_BUCKETS.map((b) => [b, costed.reduce((n, r) => n + (r.cost!.buckets[b] ?? 0), 0)]),
          ) as CostBuckets,
        }
      : null,
  };
}

/**
 * O que um card gastou até agora, por fase, lido das execuções gravadas no log (pelo número do card,
 * que nunca é reaproveitado). `phaseOrder` são as colunas do workflow do card, na ordem do board: as
 * fases fora dela (uma coluna renomeada ou apagada) vêm depois, e a execução sem fase por último.
 * `subtaskNumbers`: numa história, os números das sub-tarefas, somadas numa linha à parte.
 */
export function cardUsage(
  db: Database,
  boardId: string,
  cardNumber: number,
  phaseOrder: string[],
  subtaskNumbers: number[] = [],
): CardUsage {
  const own = all(db, `SELECT phase, ${SUMS} FROM ai_runs WHERE board_id = ? AND card_number = ? GROUP BY phase`, [boardId, cardNumber]);
  const rank = (phase: string) =>
    phase === '' ? Number.MAX_SAFE_INTEGER : phaseOrder.indexOf(phase) >= 0 ? phaseOrder.indexOf(phase) : phaseOrder.length;
  const phases = own.map((r) => rowOf(str(r.phase), r)).sort((a, b) => rank(a.phase) - rank(b.phase) || a.phase.localeCompare(b.phase));
  const subRow = subtaskNumbers.length
    ? all(db, `SELECT ${SUMS} FROM ai_runs WHERE board_id = ? AND card_number IN (${subtaskNumbers.map(() => '?').join(',')})`, [
        boardId,
        ...subtaskNumbers,
      ])[0]
    : undefined;
  const subtasks = subRow && num(subRow.n) ? rowOf('', subRow) : null;
  // os meses que só têm o total mensal (o detalhe passou da retenção) não sabem de qual card era cada execução
  const detail = new Set(detailMonths(db, boardId));
  const archived = all(db, 'SELECT DISTINCT month FROM log_months WHERE board_id = ?', [boardId])
    .map((r) => str(r.month))
    .filter((m) => !detail.has(m))
    .sort();
  return {
    phases,
    subtasks,
    total: sumRows('', [...phases, ...(subtasks ? [subtasks] : [])]),
    archivedUntil: archived.at(-1) ?? '',
  };
}
