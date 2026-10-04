// Totais por mês e a retenção do detalhe.
//
// Os totais são uma CONSULTA, não uma tabela mantida: para os meses que ainda têm detalhe eles são
// calculados na hora, e `log_months` guarda só os meses cujo detalhe já foi descartado. Por isso os
// números batem com o detalhe por construção (RF-21), não há duas verdades para sincronizar, e
// nenhuma escrita a mais entra nas mutações do board — que é o requisito de desempenho.
//
// A tabela de totais é longa (`metric`/`dim`/`value`), não larga: a #70 acrescentou tokens, custo e o
// inventário de uso (`tokens`, `cost`, `usage`) sem migration, e a #71 vai querer cortes novos; no
// formato largo cada métrica ou corte novo seria uma migration.
//
// Arquivar tokens, custo e inventário aqui é o que mantém a pergunta "quanto custou março" respondível
// depois que o detalhe de março é descartado: um comentário desatualizado se corrige, um número
// descartado não volta.
import type { Database } from 'sql.js';
import type { LogMetric } from '../../shared/log';
import { dayOf, monthOf } from '../../shared/log';
import { all, num, run, str, transaction } from '../db/query';

/**
 * Meses completos de detalhe guardados além do mês corrente (RF-32). Fixo e documentado, não
 * configurável nesta entrega: mexer nisto pede tela de configuração, que é assunto do painel (#71).
 *
 * São 6 e não 12 porque 12 estouravam o teto de 10 MB do arquivo do board: a medição deu 11,8 a
 * 14,2 MB em 12 meses com a linha pesada (a que inclui o inventário cheio, que a #70 passa a gravar).
 * E não é só disco: o `sql.js` reescreve o arquivo inteiro a cada gravação, então um arquivo grande
 * deixa toda operação do board mais lenta.
 *
 * Os totais por mês, em `log_months`, nunca expiram: a comparação ano a ano continua existindo, só
 * deixa de existir no nível do detalhe.
 */
export const RETENTION_MONTHS = 6;

/** As dimensões de `runs`: o nome na tabela de totais e a coluna de `ai_runs` de onde o valor sai. */
const RUN_DIMS: [dim: string, column: string][] = [
  ['outcome', 'outcome'],
  ['phase', 'phase'],
  ['card_type', 'card_type'],
  ['model', 'model'],
  ['tool', 'tool'],
  ['effort', 'effort'],
  ['profile', 'profile'],
];

/**
 * Os meses que conservam o detalhe: o corrente e os `RETENTION_MONTHS` anteriores.
 * Anda de mês em mês pelo dia 1 de propósito: partir do dia de hoje faria 31 de março voltar para
 * "31 de fevereiro", que o `Date` empurra para março de novo, e um mês escaparia do descarte.
 */
export function keepMonths(now: number): string[] {
  const d = new Date(now);
  const out: string[] = [];
  for (let i = 0; i <= RETENTION_MONTHS; i++) out.push(monthOf(new Date(d.getFullYear(), d.getMonth() - i, 1).getTime()));
  return out;
}

/** Meses que ainda têm detalhe gravado (evento ou execução), em ordem crescente. */
export function detailMonths(db: Database, boardId: string): string[] {
  const rows = all(
    db,
    `SELECT month FROM card_events WHERE board_id = ?
     UNION
     SELECT month FROM ai_runs WHERE board_id = ?
     ORDER BY month`,
    [boardId, boardId],
  );
  return rows.map((r) => str(r.month));
}

/** As dimensões de `usage` são os tipos do inventário; o `value` é o nome do item. */
const USAGE_KINDS = ['tool', 'mcp_tool', 'agent', 'skill'];

/** Soma de uma métrica num mês; a chave é `metric`/`dim`/`value`. */
type Totals = Map<string, { metric: LogMetric['metric']; dim: string; value: string; n: number; total: number }>;

function bump(totals: Totals, metric: LogMetric['metric'], dim: string, value: string, n: number, total: number): void {
  const key = `${metric}\u0000${dim}\u0000${value}`;
  const found = totals.get(key);
  if (found) {
    found.n += n;
    found.total += total;
  } else totals.set(key, { metric, dim, value, n, total });
}

/**
 * Totais de um mês calculados do detalhe. Três consultas agrupadas (eventos, execuções e inventário
 * de uso); os cortes saem delas em memória, em vez de uma consulta por dimensão.
 * O valor `''` numa dimensão é o "não definido" da coluna (execução sem modelo, sem esforço, sem
 * perfil) — e não zero: continua sendo uma execução contada.
 *
 * `tokens` e `cost` só contam as execuções que têm o número: `n` é a contagem MEDIDA (ou com custo),
 * não a de execuções, para que uma média por mês arquivado não divida o custo por execuções que nem
 * foram medidas. "Não medido" não é zero (RF-14): a execução sem medida não gera linha nenhuma.
 */
function totalsFromDetail(db: Database, boardId: string, month: string): LogMetric[] {
  const totals: Totals = new Map();

  for (const r of all(
    db,
    `SELECT kind, column_name, card_type, COUNT(*) AS n FROM card_events
     WHERE board_id = ? AND month = ? GROUP BY kind, column_name, card_type`,
    [boardId, month],
  )) {
    const n = num(r.n);
    const phase = str(r.column_name);
    const cardType = str(r.card_type);
    bump(totals, 'events', '', '', n, n);
    bump(totals, 'events', 'kind', str(r.kind), n, n);
    bump(totals, 'events', 'phase', phase, n, n);
    bump(totals, 'events', 'card_type', cardType, n, n);
    // `done` é evento próprio justamente para isto: contar atividades concluídas sem precisar saber
    // que categoria uma coluna tinha num mês cujo detalhe já foi descartado
    if (str(r.kind) === 'done') {
      bump(totals, 'cards_done', '', '', n, n);
      bump(totals, 'cards_done', 'phase', phase, n, n);
      bump(totals, 'cards_done', 'card_type', cardType, n, n);
    }
  }

  for (const r of all(
    db,
    `SELECT outcome, phase, card_type, model, tool, effort, profile,
            COUNT(*) AS n, SUM(COALESCE(duration_ms, 0)) AS ms,
            SUM(CASE WHEN measure <> 'none' THEN 1 ELSE 0 END) AS measured,
            SUM(CASE WHEN measure <> 'none'
                THEN COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) + COALESCE(cache_read_tokens, 0) + COALESCE(cache_write_tokens, 0)
                ELSE 0 END) AS tokens,
            SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS costed,
            SUM(COALESCE(cost_usd, 0)) AS cost
     FROM ai_runs
     WHERE board_id = ? AND month = ?
     GROUP BY outcome, phase, card_type, model, tool, effort, profile`,
    [boardId, month],
  )) {
    const n = num(r.n);
    // a unidade de `runs` é o tempo: `total` soma a duração, e a execução sem duração (inconclusiva)
    // entra na contagem sem inflar o tempo
    const ms = num(r.ms);
    bump(totals, 'runs', '', '', n, ms);
    for (const [dim, column] of RUN_DIMS) bump(totals, 'runs', dim, str(r[column]), n, ms);

    const measured = num(r.measured);
    if (measured > 0) {
      const tokens = num(r.tokens);
      bump(totals, 'tokens', '', '', measured, tokens);
      for (const [dim, column] of RUN_DIMS) bump(totals, 'tokens', dim, str(r[column]), measured, tokens);
    }
    const costed = num(r.costed);
    if (costed > 0) {
      const cost = num(r.cost);
      bump(totals, 'cost', '', '', costed, cost);
      for (const [dim, column] of RUN_DIMS) bump(totals, 'cost', dim, str(r[column]), costed, cost);
    }
  }

  // inventário: `n` são as execuções que usaram o item, `total` a soma das chamadas
  for (const r of all(
    db,
    `SELECT u.kind, u.name, COUNT(*) AS n, SUM(u.calls) AS calls FROM ai_run_usage u
     JOIN ai_runs r ON r.id = u.run_id
     WHERE r.board_id = ? AND r.month = ?
     GROUP BY u.kind, u.name`,
    [boardId, month],
  )) {
    const kind = str(r.kind);
    if (USAGE_KINDS.includes(kind)) bump(totals, 'usage', kind, str(r.name), num(r.n), num(r.calls));
  }

  return [...totals.values()]
    .map((t) => ({ boardId, month, ...t }))
    .sort((a, b) => a.metric.localeCompare(b.metric) || a.dim.localeCompare(b.dim) || a.value.localeCompare(b.value));
}

/** Totais de um mês já arquivado, lidos de `log_months`. */
function totalsFromArchive(db: Database, boardId: string, month: string): LogMetric[] {
  return all(db, 'SELECT * FROM log_months WHERE board_id = ? AND month = ? ORDER BY metric, dim, value', [boardId, month]).map((r) => ({
    boardId,
    month: str(r.month),
    metric: str(r.metric) as LogMetric['metric'],
    dim: str(r.dim),
    value: str(r.value),
    n: num(r.n),
    total: num(r.total),
  }));
}

/**
 * Totais por mês do board, em ordem crescente de mês. Sem `months`, devolve todos os meses que têm
 * detalhe ou totais arquivados.
 *
 * O mês que tem detalhe é calculado na hora e o arquivo dele é ignorado: se um evento atrasado cair
 * num mês já consolidado, o detalhe é que vale — somar os dois contaria duas vezes.
 */
export function monthlyTotals(db: Database, boardId: string, months?: string[]): LogMetric[] {
  const detail = new Set(detailMonths(db, boardId));
  const archived = all(db, 'SELECT DISTINCT month FROM log_months WHERE board_id = ? ORDER BY month', [boardId]).map((r) => str(r.month));
  const wanted = months ?? [...new Set([...detail, ...archived])].sort();
  return wanted.flatMap((month) => (detail.has(month) ? totalsFromDetail(db, boardId, month) : totalsFromArchive(db, boardId, month)));
}

/**
 * Arquiva os totais dos meses que saíram da janela de retenção e descarta o detalhe deles. Devolve
 * os meses consolidados. Chamada na abertura do board, no máximo uma vez por dia e nunca durante
 * uma mutação: é isso que protege o desempenho da gravação mesmo se a consolidação ficar lenta.
 */
export function consolidate(db: Database, boardId: string, now: number): string[] {
  const keep = new Set(keepMonths(now));
  const months = detailMonths(db, boardId).filter((m) => !keep.has(m));
  for (const month of months)
    // uma transação por mês: um mês arquivado pela metade mentiria para sempre
    transaction(db, () => {
      for (const t of totalsFromDetail(db, boardId, month))
        run(db, 'INSERT OR REPLACE INTO log_months(board_id, month, metric, dim, value, n, total) VALUES (?,?,?,?,?,?,?)', [
          t.boardId,
          t.month,
          t.metric,
          t.dim,
          t.value,
          t.n,
          t.total,
        ]);
      run(db, 'DELETE FROM card_events WHERE board_id = ? AND month = ?', [boardId, month]);
      // o inventário (`ai_run_usage`) vai por cascata da chave estrangeira
      run(db, 'DELETE FROM ai_runs WHERE board_id = ? AND month = ?', [boardId, month]);
    });
  run(db, 'UPDATE boards SET log_rollup_day = ? WHERE id = ?', [dayOf(now), boardId]);
  return months;
}
