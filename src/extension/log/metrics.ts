// Consulta agregada do log, para quem só precisa de números já somados (a ferramenta MCP `get_metrics`
// hoje; o painel de métricas quando existir). Função pura sobre o banco, sem depender do `MessageRouter`
// nem do VSCode — mesmo padrão de `rollup.ts`.
//
// `log_months` (o arquivo dos meses consolidados) só guarda totais de contagem e duração, por
// `phase`/`card_type`/`model`/`tool` (ver RUN_DIMS em rollup.ts) — nunca tokens, nunca custo, e nunca
// as dimensões `card`, `agent` nem `skill`. Por isso um mês consolidado só entra na agregação quando a
// consulta pede uma dessas quatro dimensões (ou nenhuma) e não tem outro filtro além de período/card:
// qualquer outra combinação não tem como ser montada a partir de um total já fundido, e o mês fica de
// fora dos números — mas sempre listado em `archivedMonths`, para a resposta nunca fingir silêncio.
import type { Database } from 'sql.js';
import { all, num, str } from '../db/query';
import { splitMcpName, type InventoryKind } from '../../shared/log';
import { detailMonths } from './rollup';

/**
 * `tool` é a ferramenta de IA da execução (claude, codex), coluna de `ai_runs`. `used_tool` é outra coisa:
 * uma ferramenta que a execução USOU (Read, Bash), do inventário em `ai_run_usage`. Por isso o nome
 * não se repete — a mesma palavra significaria duas coisas em dois lugares.
 */
export type MetricsDim = 'phase' | 'card_type' | 'model' | 'tool' | 'card' | 'agent' | 'skill' | 'used_tool' | 'mcp_tool';

/** As quatro dimensões de inventário e o `kind` de `ai_run_usage` que cada uma lê (o CHECK da tabela). */
const INVENTORY_KIND: Partial<Record<MetricsDim, InventoryKind>> = {
  used_tool: 'tool',
  mcp_tool: 'mcp_tool',
  agent: 'agent',
  skill: 'skill',
};

/** As quatro dimensões que `log_months` também guarda (ver RUN_DIMS de rollup.ts). As outras três — `card`, `agent`, `skill` — só existem no detalhe. */
const ARCHIVE_DIMS = new Set<MetricsDim>(['phase', 'card_type', 'model', 'tool']);

/** Coluna de `ai_runs` por dimensão, para as que vêm direto de lá (não de `ai_run_usage`). */
const RUN_COLUMN: Record<'phase' | 'card_type' | 'model' | 'tool', string> = {
  phase: 'phase',
  card_type: 'card_type',
  model: 'model',
  tool: 'tool',
};

export interface MetricsQuery {
  groupBy?: MetricsDim;
  /** 'AAAA-MM-DD', inclusive */
  startDate?: string;
  /** 'AAAA-MM-DD', inclusive */
  endDate?: string;
  card?: number;
  phase?: string;
  cardType?: string;
  model?: string;
  tool?: string;
  /** padrão 20 */
  limit?: number;
}

export interface MetricsRow {
  /** valor do agrupamento, ou 'total' sem `groupBy` */
  label: string;
  runs: number;
  /** soma em ms; nunca null (execução sem duração entra na contagem sem inflar o tempo, não é "não medido") */
  durationMs: number;
  /** null = nenhuma execução do grupo tem consumo medido ainda; undefined = dimensão de inventário, não aplicável */
  tokens: number | null | undefined;
  /** null = nenhuma execução do grupo tem custo medido ainda; undefined = dimensão de inventário, não aplicável */
  costUsd: number | null | undefined;
  /** só nas dimensões de inventário (used_tool/mcp_tool/agent/skill): soma de usos, pode ser > runs */
  calls?: number;
  /** só nas linhas de `mcp_tool`: o servidor do nome; '' = o registro não trouxe o servidor (RF-26) */
  server?: string;
}

export interface MetricsResult {
  rows: MetricsRow[];
  /** quantos grupos foram somados na linha "outros" (0 = nenhum, resposta completa) */
  othersCount: number;
  /** 'AAAA-MM-DD' do início da série do board; '' quando o board não tem nenhum log ainda */
  logSince: string;
  /** meses do recorte que só têm total mensal (sem detalhe por execução) */
  archivedMonths: string[];
  /** entre `archivedMonths`, os que o recorte de datas não cobre por inteiro (o valor devolvido é do mês inteiro) */
  partialMonths: string[];
  /** true quando algum grupo tem execução sem custo medido (inclusive por vir de mês arquivado) */
  costPartial: boolean;
}

const DEFAULT_LIMIT = 20;

function dayBoundary(date: string, end: boolean): number {
  const [y, m, d] = date.split('-').map(Number);
  const base = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  return end ? base.getTime() + 24 * 60 * 60 * 1000 : base.getTime();
}

function monthOfDay(date: string): string {
  return date.slice(0, 7);
}

/** Primeiro e último dia (inclusive) do mês 'AAAA-MM'. */
function monthSpan(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y!, m!, 0).getDate();
  return [`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`];
}

interface Accumulator {
  runs: number;
  measuredRuns: number;
  durationMs: number;
  tokens: number;
  costUsd: number;
  calls: number;
}

function newAcc(): Accumulator {
  return { runs: 0, measuredRuns: 0, durationMs: 0, tokens: 0, costUsd: 0, calls: 0 };
}

function bump(map: Map<string, Accumulator>, label: string, patch: Partial<Accumulator>): void {
  const acc = map.get(label) ?? newAcc();
  acc.runs += patch.runs ?? 0;
  acc.measuredRuns += patch.measuredRuns ?? 0;
  acc.durationMs += patch.durationMs ?? 0;
  acc.tokens += patch.tokens ?? 0;
  acc.costUsd += patch.costUsd ?? 0;
  acc.calls += patch.calls ?? 0;
  map.set(label, acc);
}

/**
 * Lê `getMetrics`: condições e parâmetros comuns a `ai_runs` (período, card, e os filtros que não são
 * a dimensão pedida). `prefix` qualifica as colunas quando a consulta junta outra tabela (inventário).
 */
function runsWhere(boardId: string, q: MetricsQuery, prefix = ''): { sql: string; params: (string | number)[] } {
  const clauses = [`${prefix}board_id = ?`];
  const params: (string | number)[] = [boardId];
  if (q.startDate) {
    clauses.push(`${prefix}started_at >= ?`);
    params.push(dayBoundary(q.startDate, false));
  }
  if (q.endDate) {
    clauses.push(`${prefix}started_at < ?`);
    params.push(dayBoundary(q.endDate, true));
  }
  if (q.card !== undefined) {
    clauses.push(`${prefix}card_number = ?`);
    params.push(q.card);
  }
  if (q.phase) {
    clauses.push(`${prefix}phase = ?`);
    params.push(q.phase);
  }
  if (q.cardType) {
    clauses.push(`${prefix}card_type = ?`);
    params.push(q.cardType);
  }
  if (q.model) {
    clauses.push(`${prefix}model = ?`);
    params.push(q.model);
  }
  if (q.tool) {
    clauses.push(`${prefix}tool = ?`);
    params.push(q.tool);
  }
  return { sql: clauses.join(' AND '), params };
}

/** As dimensões em que a consulta tem algum filtro além de período/card (RF-05: trava o uso do arquivo). */
function hasDimensionFilter(q: MetricsQuery): boolean {
  return !!(q.phase || q.cardType || q.model || q.tool);
}

/** Linhas do detalhe (meses ainda em `ai_runs`), agrupadas por `phase`/`card_type`/`model`/`tool`, ou um total só. */
function detailByRunColumn(db: Database, boardId: string, q: MetricsQuery, column: string | null): Map<string, Accumulator> {
  const { sql: where, params } = runsWhere(boardId, q);
  const select = column
    ? `SELECT ${column} AS label, COUNT(*) AS n, SUM(COALESCE(duration_ms,0)) AS ms,
              SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS measured,
              SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)+COALESCE(cache_read_tokens,0)+COALESCE(cache_write_tokens,0)) AS tok,
              SUM(COALESCE(cost_usd,0)) AS cost
       FROM ai_runs WHERE ${where} GROUP BY ${column}`
    : `SELECT COUNT(*) AS n, SUM(COALESCE(duration_ms,0)) AS ms,
              SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS measured,
              SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)+COALESCE(cache_read_tokens,0)+COALESCE(cache_write_tokens,0)) AS tok,
              SUM(COALESCE(cost_usd,0)) AS cost
       FROM ai_runs WHERE ${where}`;
  const map = new Map<string, Accumulator>();
  for (const r of all(db, select, params)) {
    const label = column ? str(r.label) : 'total';
    const n = num(r.n);
    if (n === 0) continue;
    bump(map, label, { runs: n, measuredRuns: num(r.measured), durationMs: num(r.ms), tokens: num(r.tok), costUsd: num(r.cost) });
  }
  return map;
}

/**
 * Rótulo da linha das execuções sem card (RF-20). Fica à parte das linhas '#N título' — nunca '#0' — e
 * o contrato do painel decide como ela viaja (`value: ''`).
 */
export const NO_CARD_LABEL = 'sem card';

/**
 * Linhas por card (só detalhe: `card` não existe em `log_months`). Uma linha por número de card: o
 * título é o da execução mais recente (RF-19), porque `card_title` é coluna simples num `GROUP BY` com
 * um único `MAX()` — o SQLite devolve nela o valor da linha que deu o máximo. `card_number` nulo agrupa
 * junto e vira a linha "sem card" (RF-20), em vez de ser descartado.
 */
function detailByCard(db: Database, boardId: string, q: MetricsQuery): Map<string, Accumulator> {
  const { sql: where, params } = runsWhere(boardId, q);
  const rows = all(
    db,
    `SELECT card_number, MAX(started_at) AS last, card_title, COUNT(*) AS n, SUM(COALESCE(duration_ms,0)) AS ms,
            SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS measured,
            SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)+COALESCE(cache_read_tokens,0)+COALESCE(cache_write_tokens,0)) AS tok,
            SUM(COALESCE(cost_usd,0)) AS cost
     FROM ai_runs WHERE ${where} GROUP BY card_number`,
    params,
  );
  const map = new Map<string, Accumulator>();
  for (const r of rows) {
    const label = r.card_number == null ? NO_CARD_LABEL : `#${num(r.card_number)} ${str(r.card_title)}`.trim();
    bump(map, label, {
      runs: num(r.n),
      measuredRuns: num(r.measured),
      durationMs: num(r.ms),
      tokens: num(r.tok),
      costUsd: num(r.cost),
    });
  }
  return map;
}

/** Linhas de inventário (used_tool/mcp_tool/agent/skill): só contagem de execuções e de usos, nunca tokens/custo (RF-03). */
function detailByInventory(db: Database, boardId: string, q: MetricsQuery, kind: InventoryKind): Map<string, Accumulator> {
  const { sql: where, params } = runsWhere(boardId, q, 'r.');
  const rows = all(
    db,
    `SELECT u.name AS name, COUNT(DISTINCT u.run_id) AS n, SUM(u.calls) AS calls
     FROM ai_run_usage u JOIN ai_runs r ON r.id = u.run_id
     WHERE u.kind = ? AND ${where}
     GROUP BY u.name`,
    [kind, ...params],
  );
  const map = new Map<string, Accumulator>();
  for (const r of rows) bump(map, str(r.name), { runs: num(r.n), calls: num(r.calls) });
  return map;
}

/** Totais de um mês arquivado para uma das quatro dimensões que `log_months` guarda (ou '' = total). */
function archiveByDim(db: Database, boardId: string, month: string, dim: string): Map<string, Accumulator> {
  const rows = all(db, `SELECT value, n, total FROM log_months WHERE board_id = ? AND month = ? AND metric = 'runs' AND dim = ?`, [
    boardId,
    month,
    dim,
  ]);
  const map = new Map<string, Accumulator>();
  for (const r of rows) {
    const label = dim ? str(r.value) : 'total';
    bump(map, label, { runs: num(r.n), durationMs: num(r.total) });
  }
  return map;
}

function merge(into: Map<string, Accumulator>, from: Map<string, Accumulator>): void {
  for (const [label, acc] of from) bump(into, label, acc);
}

/** Meses 'AAAA-MM' entre dois outros, inclusive, em ordem crescente. */
function monthRange(from: string, to: string): string[] {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  const out: string[] = [];
  let y = y1!;
  let m = m1!;
  while (y < y2! || (y === y2 && m <= m2!)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * Agregação do log por dimensão e período. `group_by` omitido devolve um total só; nas dimensões de
 * inventário (`used_tool`/`mcp_tool`/`agent`/`skill`) as linhas não têm `tokens`/`costUsd` — ver cabeçalho do arquivo.
 */
export function getMetrics(db: Database, boardId: string, query: MetricsQuery = {}): MetricsResult {
  if (query.startDate && query.endDate && query.startDate > query.endDate) throw new Error('end_date anterior a start_date.');

  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_LIMIT, 100));
  const dim = query.groupBy;
  // um mês que voltou a ter detalhe (evento atrasado após a consolidação) vale pelo detalhe, não pelo
  // arquivo (mesma regra de `rollup.ts`) — por isso sai de `archivedMonths` mesmo tendo totais ali
  const detailSet = new Set(detailMonths(db, boardId));
  const archivedAll = [...new Set(all(db, 'SELECT DISTINCT month FROM log_months WHERE board_id = ?', [boardId]).map((r) => str(r.month)))]
    .filter((m) => !detailSet.has(m))
    .sort();

  // meses arquivados dentro do recorte pedido (ou todos, sem recorte)
  const rangeMonths =
    query.startDate || query.endDate
      ? monthRange(
          query.startDate ? monthOfDay(query.startDate) : (archivedAll[0] ?? monthOfDay(query.endDate!)),
          query.endDate ? monthOfDay(query.endDate) : monthOfDay(query.startDate!),
        )
      : null;
  const archivedMonths = (rangeMonths ? archivedAll.filter((m) => rangeMonths.includes(m)) : archivedAll).sort();

  const partialMonths = archivedMonths.filter((m) => {
    if (!query.startDate && !query.endDate) return false;
    const [first, last] = monthSpan(m);
    return (!!query.startDate && query.startDate > first) || (!!query.endDate && query.endDate < last);
  });

  const inventoryKind = dim ? INVENTORY_KIND[dim] : undefined;
  let acc: Map<string, Accumulator>;
  if (dim === 'card') acc = detailByCard(db, boardId, query);
  else if (inventoryKind) acc = detailByInventory(db, boardId, query, inventoryKind);
  else {
    // aqui `dim` já não é `card` nem de inventário: sobram as quatro colunas de `ai_runs`
    const column = dim ? RUN_COLUMN[dim as keyof typeof RUN_COLUMN] : null;
    acc = detailByRunColumn(db, boardId, query, column);
    // meses arquivados só entram quando a dimensão existe em log_months e não há outro filtro (RF-05)
    const canUseArchive = (dim === undefined || ARCHIVE_DIMS.has(dim)) && !hasDimensionFilter(query) && query.card === undefined;
    if (canUseArchive) for (const month of archivedMonths) merge(acc, archiveByDim(db, boardId, month, dim ?? ''));
  }

  const isInventory = !!inventoryKind;
  const sorted = [...acc.entries()].sort(
    (a, b) => (isInventory ? b[1].calls - a[1].calls : b[1].runs - a[1].runs) || a[0].localeCompare(b[0]),
  );
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);

  const toRow = (label: string, a: Accumulator): MetricsRow =>
    isInventory
      ? {
          label,
          runs: a.runs,
          durationMs: a.durationMs,
          tokens: undefined,
          costUsd: undefined,
          calls: a.calls,
          // a linha "outros" soma vários servidores: não tem um
          ...(dim === 'mcp_tool' && label !== 'outros' ? { server: splitMcpName(label).server } : {}),
        }
      : {
          label,
          runs: a.runs,
          durationMs: a.durationMs,
          tokens: a.measuredRuns > 0 ? a.tokens : null,
          costUsd: a.measuredRuns > 0 ? a.costUsd : null,
        };
  const rows = head.map(([label, a]) => toRow(label, a));
  const allGroups = [...acc.values()];
  if (tail.length) {
    const other = newAcc();
    for (const [, a] of tail) {
      other.runs += a.runs;
      other.measuredRuns += a.measuredRuns;
      other.durationMs += a.durationMs;
      other.tokens += a.tokens;
      other.costUsd += a.costUsd;
      other.calls += a.calls;
    }
    rows.push(toRow('outros', other));
  }

  const boardRow = all(db, 'SELECT log_since FROM boards WHERE id = ?', [boardId])[0];
  const logSinceMs = boardRow ? num(boardRow.log_since) : 0;
  // parcial quando alguma execução do recorte entrou na contagem sem ter custo medido — inclusive as
  // que vieram de mês arquivado, que nunca têm (ver cabeçalho do arquivo)
  const costPartial = !isInventory && allGroups.some((a) => a.runs > a.measuredRuns);

  return {
    rows,
    othersCount: tail.length,
    logSince: logSinceMs ? new Date(logSinceMs).toISOString().slice(0, 10) : '',
    archivedMonths,
    partialMonths,
    costPartial,
  };
}
