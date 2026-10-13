import type { Database } from 'sql.js';
import type { CardUsage, CardUsageRow } from '../../shared/cardUsage';
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
  SUM(CASE WHEN measure <> 'none' THEN COALESCE(cache_write_tokens,0) ELSE 0 END) AS cache_write`;

const rowOf = (phase: string, r: Row): CardUsageRow => {
  const measured = num(r.measured);
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
  };
};

/** Junta linhas numa só (o total, ou as sub-tarefas). */
function sumRows(phase: string, rows: CardUsageRow[]): CardUsageRow {
  const measured = rows.filter((r) => r.tokens);
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
