// Consulta agregada do log, para quem só precisa de números já somados (a ferramenta MCP `get_metrics`
// hoje; o painel de métricas quando existir). Função pura sobre o banco, sem depender do `MessageRouter`
// nem do VSCode — mesmo padrão de `rollup.ts`.
//
// `log_months` (o arquivo dos meses consolidados) guarda, por mês, contagem e duração (`runs`), tokens
// (`tokens`) e custo (`cost`), cada um no total e por `phase`/`card_type`/`model`/`tool`/`effort`/
// `profile` (ver RUN_DIMS em rollup.ts) — mas nunca as dimensões `card`, `agent`, `skill`, `used_tool`
// nem `mcp_tool`. Em `tokens` e `cost` o `n` é quantas execuções tinham o número, não quantas houve: é
// daí que sai `measuredRuns` de um mês arquivado, e um mês sem nenhuma medição continua "não medido"
// (null), nunca zero.
//
// O arquivo guarda marginais, não cruzamentos: existe "custo por modelo" e "custo por workflow", mas não
// "custo por modelo dentro de um workflow". Por isso ele serve a UMA dimensão por consulta (RF-10): um mês
// consolidado só entra na agregação quando a consulta pede uma dessas seis dimensões (ou nenhuma) e não
// tem outro filtro além de período/card — workflow incluído. Qualquer outra combinação não tem como ser
// montada a partir de um total já fundido, e o mês fica de fora dos números — mas sempre listado em
// `archivedMonths`, para a resposta nunca fingir silêncio.
import type { Database } from 'sql.js';
import { monthRange, monthSpan } from '../../shared/log';
import { all, num, str } from '../db/query';
import { splitMcpName, type InventoryKind } from '../../shared/log';
import { detailMonths } from './rollup';
import { dayOf, monthOf } from '../../shared/log';
import type { MetricsMonth, MetricsPanelQuery, MetricsPanelResult, MetricsTokens } from '../../shared/metrics';
import { parseRules } from '../../shared/rules';

/**
 * `tool` é a ferramenta de IA da execução (claude, codex), coluna de `ai_runs`. `used_tool` é outra coisa:
 * uma ferramenta que a execução USOU (Read, Bash), do inventário em `ai_run_usage`. Por isso o nome
 * não se repete — a mesma palavra significaria duas coisas em dois lugares.
 */
export type MetricsDim =
  'phase' | 'card_type' | 'model' | 'tool' | 'effort' | 'profile' | 'card' | 'agent' | 'skill' | 'used_tool' | 'mcp_tool';

/** As quatro dimensões de inventário e o `kind` de `ai_run_usage` que cada uma lê (o CHECK da tabela). */
const INVENTORY_KIND: Partial<Record<MetricsDim, InventoryKind>> = {
  used_tool: 'tool',
  mcp_tool: 'mcp_tool',
  agent: 'agent',
  skill: 'skill',
};

/**
 * As seis dimensões que `log_months` também guarda (ver RUN_DIMS de rollup.ts), em `runs`, `tokens` e
 * `cost`. As outras — `card` e as quatro de inventário — só existem no detalhe.
 */
const ARCHIVE_DIMS = new Set<MetricsDim>(['phase', 'card_type', 'model', 'tool', 'effort', 'profile']);

/** Coluna de `ai_runs` por dimensão, para as que vêm direto de lá (não de `ai_run_usage`). */
const RUN_COLUMN: Record<'phase' | 'card_type' | 'model' | 'tool' | 'effort' | 'profile', string> = {
  phase: 'phase',
  card_type: 'card_type',
  model: 'model',
  tool: 'tool',
  effort: 'effort',
  profile: 'profile',
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
  /** nome do workflow, como o log o guardou */
  workflow?: string;
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
  if (q.workflow) {
    clauses.push(`${prefix}workflow = ?`);
    params.push(q.workflow);
  }
  return { sql: clauses.join(' AND '), params };
}

/**
 * As dimensões em que a consulta tem algum filtro além de período/card (RF-05: trava o uso do arquivo).
 * `workflow` conta como as outras: `log_months` tem `dim='workflow'`, mas não o cruzamento com a
 * dimensão pedida — somar o arquivo com um workflow escolhido daria o número de todos os workflows com
 * cara de ser o de um só (RF-10).
 */
function hasDimensionFilter(q: MetricsQuery): boolean {
  return !!(q.phase || q.cardType || q.model || q.tool || q.workflow);
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

/**
 * Totais de um mês arquivado para uma das seis dimensões que `log_months` guarda (ou '' = total): as
 * três métricas numa consulta só. `runs` dá a contagem e a duração; `tokens` e `cost`, as somas.
 *
 * `measuredRuns` sai do `n` de `cost` (execuções com custo), o mesmo critério do detalhe
 * (`cost_usd IS NOT NULL` em `detailByRunColumn`): é o que faz o número ser o mesmo antes e depois de
 * consolidar (RF-08). Valor sem linha de `cost` fica com `measuredRuns` 0 e sai como "não medido"
 * (null) em `toRow`, nunca como zero (RF-09, RF-30) — inclusive o mês consolidado antes de #71, que só
 * tem `runs`.
 */
function archiveByDim(db: Database, boardId: string, month: string, dim: string): Map<string, Accumulator> {
  const rows = all(
    db,
    `SELECT metric, value, n, total FROM log_months
     WHERE board_id = ? AND month = ? AND dim = ? AND metric IN ('runs', 'tokens', 'cost')`,
    [boardId, month, dim],
  );
  const map = new Map<string, Accumulator>();
  for (const r of rows) {
    const label = dim ? str(r.value) : 'total';
    const metric = str(r.metric);
    if (metric === 'runs') bump(map, label, { runs: num(r.n), durationMs: num(r.total) });
    else if (metric === 'tokens') bump(map, label, { tokens: num(r.total) });
    else bump(map, label, { measuredRuns: num(r.n), costUsd: num(r.total) });
  }
  return map;
}

function merge(into: Map<string, Accumulator>, from: Map<string, Accumulator>): void {
  for (const [label, acc] of from) bump(into, label, acc);
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
    // no fuso da máquina, como `month` e o resto do log (nunca UTC: à noite no Brasil o dia UTC já é o seguinte)
    logSince: logSinceMs ? dayOf(logSinceMs) : '',
    archivedMonths,
    partialMonths,
    costPartial,
  };
}

// ---------------------------------------------------------------------------------------------------
// O painel de métricas (#71): uma série por mês e os totais do período, no mesmo recorte de
// período/workflow. Os números do detalhe saem de `runsWhere` e das mesmas expressões de
// `totalsFromDetail` (rollup.ts) — é o que garante que consolidar um mês não muda o número que o
// painel mostrava dele (RF-14). Os totais são a soma da série, calculada em memória: o total e o
// gráfico não têm como discordar.
// ---------------------------------------------------------------------------------------------------

/** Os números de um mês (ou do período inteiro), sem os marcadores de presença/arquivo/parcial. */
type PanelNumbers = MetricsPanelResult['totals'];

function emptyPanelNumbers(): PanelNumbers {
  return {
    cardsDone: 0,
    runs: 0,
    runsOpen: 0,
    durationMs: 0,
    measuredRuns: 0,
    tokens: null,
    costUsd: null,
    costEstimatedUsd: null,
    costInformedUsd: null,
  };
}

/** Soma dois valores que podem não ter sido medidos: só um medido vale por ele; nenhum continua null (nunca zero). */
function addMeasured(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

function addTokens(a: MetricsTokens | null, b: MetricsTokens | null): MetricsTokens | null {
  if (a === null) return b && { ...b };
  if (b === null) return { ...a };
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    total: a.total + b.total,
  };
}

function addPanelNumbers(into: PanelNumbers, from: PanelNumbers): void {
  into.cardsDone += from.cardsDone;
  into.runs += from.runs;
  into.runsOpen += from.runsOpen;
  into.durationMs += from.durationMs;
  into.measuredRuns += from.measuredRuns;
  into.tokens = addTokens(into.tokens, from.tokens);
  into.costUsd = addMeasured(into.costUsd, from.costUsd);
  into.costEstimatedUsd = addMeasured(into.costEstimatedUsd, from.costEstimatedUsd);
  into.costInformedUsd = addMeasured(into.costInformedUsd, from.costInformedUsd);
}

/**
 * Execuções do detalhe por mês (agregação 1 da Spec). As somas de token só olham a execução medida
 * (`measure <> 'none'`) e as de custo a que tem custo, com `cost_estimated = 0` como "informado" — as
 * mesmas expressões de `totalsFromDetail`. A faixa de `month` não muda o resultado (o mês é derivado de
 * `started_at`); está ali para o `idx_ai_runs_month` estreitar a leitura.
 */
function panelRunsByMonth(db: Database, boardId: string, q: MetricsQuery, months: [string, string]): Map<string, PanelNumbers> {
  const { sql: where, params } = runsWhere(boardId, q);
  const rows = all(
    db,
    `SELECT month, COUNT(*) AS n, SUM(COALESCE(duration_ms, 0)) AS ms,
            SUM(CASE WHEN outcome IS NULL THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN measure <> 'none' THEN 1 ELSE 0 END) AS measured,
            SUM(CASE WHEN measure <> 'none' THEN COALESCE(input_tokens, 0) ELSE 0 END) AS input,
            SUM(CASE WHEN measure <> 'none' THEN COALESCE(output_tokens, 0) ELSE 0 END) AS output,
            SUM(CASE WHEN measure <> 'none' THEN COALESCE(cache_read_tokens, 0) ELSE 0 END) AS cache_read,
            SUM(CASE WHEN measure <> 'none' THEN COALESCE(cache_write_tokens, 0) ELSE 0 END) AS cache_write,
            SUM(CASE WHEN cost_usd IS NOT NULL AND cost_estimated = 0 THEN 1 ELSE 0 END) AS informed_n,
            SUM(CASE WHEN cost_usd IS NOT NULL AND cost_estimated = 0 THEN cost_usd ELSE 0 END) AS informed,
            SUM(CASE WHEN cost_usd IS NOT NULL AND COALESCE(cost_estimated, 1) <> 0 THEN 1 ELSE 0 END) AS estimated_n,
            SUM(CASE WHEN cost_usd IS NOT NULL AND COALESCE(cost_estimated, 1) <> 0 THEN cost_usd ELSE 0 END) AS estimated
     FROM ai_runs WHERE ${where} AND month BETWEEN ? AND ?
     GROUP BY month`,
    [...params, ...months],
  );
  const out = new Map<string, PanelNumbers>();
  for (const r of rows) {
    const measured = num(r.measured);
    const estimatedN = num(r.estimated_n);
    const informedN = num(r.informed_n);
    const tokens: MetricsTokens | null =
      measured > 0
        ? {
            input: num(r.input),
            output: num(r.output),
            cacheRead: num(r.cache_read),
            cacheWrite: num(r.cache_write),
            total: num(r.input) + num(r.output) + num(r.cache_read) + num(r.cache_write),
          }
        : null;
    out.set(str(r.month), {
      ...emptyPanelNumbers(),
      runs: num(r.n),
      runsOpen: num(r.open),
      durationMs: num(r.ms),
      measuredRuns: measured,
      tokens,
      // a origem sem execução fica null: "nenhum custo informado" não é "custo informado zero"
      costUsd: estimatedN + informedN > 0 ? num(r.estimated) + num(r.informed) : null,
      costEstimatedUsd: estimatedN > 0 ? num(r.estimated) : null,
      costInformedUsd: informedN > 0 ? num(r.informed) : null,
    });
  }
  return out;
}

/**
 * Eventos do detalhe por mês (agregação 2 da Spec): quantos houve — é o que diz que o mês tem dado
 * mesmo sem execução nenhuma — e quantos são `done`. `done` é evento próprio justamente para contar
 * conclusão sem saber que categoria uma coluna tinha num mês antigo (ver `totalsFromDetail`).
 */
function panelEventsByMonth(
  db: Database,
  boardId: string,
  range: { startDate: string; endDate: string },
  workflow: string,
  months: [string, string],
): Map<string, { events: number; done: number }> {
  const clauses = ['board_id = ?', 'at >= ?', 'at < ?', 'month BETWEEN ? AND ?'];
  const params: (string | number)[] = [boardId, dayBoundary(range.startDate, false), dayBoundary(range.endDate, true), ...months];
  if (workflow) {
    clauses.push('workflow = ?');
    params.push(workflow);
  }
  const rows = all(
    db,
    `SELECT month, COUNT(*) AS n, SUM(CASE WHEN kind = 'done' THEN 1 ELSE 0 END) AS done
     FROM card_events WHERE ${clauses.join(' AND ')} GROUP BY month`,
    params,
  );
  return new Map(rows.map((r) => [str(r.month), { events: num(r.n), done: num(r.done) }]));
}

const TOKEN_KIND: Record<string, keyof Omit<MetricsTokens, 'total'>> = {
  input: 'input',
  output: 'output',
  cache_read: 'cacheRead',
  cache_write: 'cacheWrite',
};

/**
 * Os meses arquivados do recorte (agregação 3 da Spec), num `SELECT` só. Com "Todos", lê o total
 * (`dim=''`), a quebra dos tokens (`dim='kind'`) e a origem do custo (`dim='source'`). Com um workflow,
 * lê `dim='workflow'` — e aí só contagem, duração e conclusões: o arquivo guarda marginais, e "tokens
 * por tipo dentro de um workflow" ou "custo estimado dentro de um workflow" não existem nele. Em vez de
 * inventar a quebra (ou mostrar um total sem ela), o consumo desse mês fica "não medido no recorte"
 * (`measuredRuns: 0`), o que a tela já sinaliza como parcial. Mês sem linha nenhuma no recorte não
 * entra no mapa: é lacuna, não zero.
 */
function panelArchiveByMonth(db: Database, boardId: string, months: string[], workflow: string): Map<string, PanelNumbers> {
  const out = new Map<string, PanelNumbers>();
  if (!months.length) return out;
  const marks = months.map(() => '?').join(',');
  const dimClause = workflow ? `dim = 'workflow' AND value = ?` : `dim IN ('', 'kind', 'source')`;
  const rows = all(
    db,
    `SELECT month, metric, dim, value, n, total FROM log_months
     WHERE board_id = ? AND month IN (${marks}) AND metric IN ('events', 'runs', 'cards_done', 'tokens', 'cost') AND ${dimClause}`,
    [boardId, ...months, ...(workflow ? [workflow] : [])],
  );
  // a quebra por tipo chega em linhas à parte, em qualquer ordem: junta-se ao total depois do laço
  const kinds = new Map<string, Omit<MetricsTokens, 'total'>>();
  for (const r of rows) {
    const month = str(r.month);
    const acc = out.get(month) ?? emptyPanelNumbers();
    out.set(month, acc);
    const key = `${str(r.metric)}/${str(r.dim)}`;
    const value = str(r.value);
    const n = num(r.n);
    const total = num(r.total);
    // a execução em andamento não chega ao arquivo como tal (a consolidação é de mês fechado): `runsOpen` fica 0
    if (key === 'runs/' || key === 'runs/workflow') {
      acc.runs = n;
      acc.durationMs = total;
    } else if (key === 'cards_done/' || key === 'cards_done/workflow') acc.cardsDone = n;
    else if (key === 'tokens/') {
      acc.measuredRuns = n;
      acc.tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total };
    } else if (key === 'tokens/kind' && TOKEN_KIND[value]) {
      const byKind = kinds.get(month) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      byKind[TOKEN_KIND[value]!] = total;
      kinds.set(month, byKind);
    } else if (key === 'cost/') acc.costUsd = total;
    else if (key === 'cost/source' && value === 'estimated') acc.costEstimatedUsd = total;
    else if (key === 'cost/source' && value === 'informed') acc.costInformedUsd = total;
    // `tokens/workflow` e `cost/workflow` ficam de fora de propósito: ver o comentário da função
  }
  for (const [month, byKind] of kinds) {
    const acc = out.get(month)!;
    if (acc.tokens) acc.tokens = { ...byKind, total: acc.tokens.total };
  }
  return out;
}

/**
 * Os workflows com log no recorte (agregação 4 da Spec), sem o filtro de workflow — a lista de opções
 * não encolhe quando uma é escolhida. Nome renomeado aparece duas vezes, de propósito: o log guarda
 * nome, e fundir seria adivinhar. `''` (execução sem card) não é um workflow e fica de fora.
 */
function panelWorkflows(db: Database, boardId: string, range: { startDate: string; endDate: string }, archived: string[]): string[] {
  const from = dayBoundary(range.startDate, false);
  const to = dayBoundary(range.endDate, true);
  const names = new Set(
    all(
      db,
      `SELECT DISTINCT workflow FROM card_events WHERE board_id = ? AND at >= ? AND at < ?
       UNION
       SELECT DISTINCT workflow FROM ai_runs WHERE board_id = ? AND started_at >= ? AND started_at < ?`,
      [boardId, from, to, boardId, from, to],
    ).map((r) => str(r.workflow)),
  );
  if (archived.length)
    for (const r of all(
      db,
      `SELECT DISTINCT value FROM log_months WHERE board_id = ? AND dim = 'workflow' AND month IN (${archived.map(() => '?').join(',')})`,
      [boardId, ...archived],
    ))
      names.add(str(r.value));
  names.delete('');
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Linhas de detalhe guardadas (agregação 5 da Spec), para o preço da janela (RF-25). Todo detalhe que existe está dentro da janela: o de fora a consolidação já descartou. */
function panelDetailRows(db: Database, boardId: string): number {
  const r = all(
    db,
    `SELECT (SELECT COUNT(*) FROM card_events WHERE board_id = ?) AS events,
            (SELECT COUNT(*) FROM ai_runs WHERE board_id = ?) AS runs,
            (SELECT COUNT(*) FROM ai_run_usage u JOIN ai_runs r ON r.id = u.run_id WHERE r.board_id = ?) AS usage`,
    [boardId, boardId, boardId],
  )[0];
  return r ? num(r.events) + num(r.runs) + num(r.usage) : 0;
}

/**
 * A consulta do painel de métricas: a espinha completa de meses do recorte, os totais (a soma dela), os
 * workflows com log, o início da série e o horizonte do detalhe. Só lê; `now` existe para os testes.
 *
 * Bordas, uma por uma:
 * - data final antes da inicial lança, como `getMetrics`;
 * - o recorte é cortado em `logSince` (`clamped: true` quando o pedido começava antes); sem data
 *   inicial, começa em `logSince`; sem data final, termina hoje;
 * - mês sem dado nenhum no recorte volta `present: false` com zeros e nulos — a tela decide o texto,
 *   nunca escreve "0" nele; mês com dado e valor zero volta zero com `present: true`;
 * - mês com detalhe vale pelo detalhe e o arquivo dele é ignorado (mesma regra de `monthlyTotals`);
 * - `partial` no mês corrente, no primeiro da série e no mês que o recorte não cobre inteiro.
 */
export function getPanelMetrics(db: Database, boardId: string, query: MetricsPanelQuery = {}, now = Date.now()): MetricsPanelResult {
  if (query.startDate && query.endDate && query.startDate > query.endDate) throw new Error('end_date anterior a start_date.');

  const boardRow = all(db, 'SELECT log_since, rules_json FROM boards WHERE id = ?', [boardId])[0];
  const logSinceMs = boardRow ? num(boardRow.log_since) : 0;
  const logSince = logSinceMs ? dayOf(logSinceMs) : '';
  const retentionMonths = parseRules(boardRow ? str(boardRow.rules_json) : '').logRetentionMonths;
  const workflow = query.workflow ?? '';

  const detail = detailMonths(db, boardId);
  const detailSet = new Set(detail);
  const archivedAll = all(db, 'SELECT DISTINCT month FROM log_months WHERE board_id = ? ORDER BY month', [boardId])
    .map((r) => str(r.month))
    .filter((m) => !detailSet.has(m));

  const endDate = query.endDate ?? dayOf(now);
  const clamped = !!(logSince && query.startDate && query.startDate < logSince);
  // sem início da série (board sem log nenhum), o recorte aberto começa no primeiro mês que tiver dado
  const firstData = [...detail, ...archivedAll].sort()[0];
  const startDate = clamped ? logSince : (query.startDate ?? (logSince || (firstData ? `${firstData}-01` : endDate)));
  const range = { startDate, endDate };

  // o recorte pode ficar vazio depois do corte (pediu só dias anteriores ao início da série): espinha vazia
  const spine = startDate <= endDate ? monthRange(monthOfDay(startDate), monthOfDay(endDate)) : [];
  const monthBounds: [string, string] = [spine[0] ?? '', spine[spine.length - 1] ?? ''];
  const spineSet = new Set(spine);
  const archivedMonths = archivedAll.filter((m) => spineSet.has(m));

  const runsByMonth = spine.length
    ? panelRunsByMonth(db, boardId, { startDate, endDate, workflow }, monthBounds)
    : new Map<string, PanelNumbers>();
  const eventsByMonth = spine.length
    ? panelEventsByMonth(db, boardId, range, workflow, monthBounds)
    : new Map<string, { events: number; done: number }>();
  const archiveByMonth = panelArchiveByMonth(db, boardId, archivedMonths, workflow);

  const currentMonth = monthOf(now);
  const firstSeriesMonth = logSince ? monthOfDay(logSince) : '';
  const archivedSet = new Set(archivedMonths);
  const totals = emptyPanelNumbers();
  const months: MetricsMonth[] = spine.map((month) => {
    let numbers: PanelNumbers | undefined;
    let present: boolean;
    if (archivedSet.has(month)) {
      numbers = archiveByMonth.get(month);
      present = !!numbers;
    } else {
      const runsRow = runsByMonth.get(month);
      const eventsRow = eventsByMonth.get(month);
      present = !!runsRow || !!eventsRow;
      if (present) numbers = { ...(runsRow ?? emptyPanelNumbers()), cardsDone: eventsRow?.done ?? 0 };
    }
    const values = numbers ?? emptyPanelNumbers();
    addPanelNumbers(totals, values);
    const [first, last] = monthSpan(month);
    return {
      month,
      present,
      archived: archivedSet.has(month),
      partial: month === currentMonth || month === firstSeriesMonth || startDate > first || endDate < last,
      ...values,
    };
  });

  return {
    range,
    clamped,
    totals,
    months,
    workflows: spine.length ? panelWorkflows(db, boardId, range, archivedMonths) : [],
    logSince,
    detailFrom: detail[0] ?? '',
    archivedMonths,
    retention: { months: retentionMonths, detailMonths: detail.length, detailRows: panelDetailRows(db, boardId) },
  };
}
