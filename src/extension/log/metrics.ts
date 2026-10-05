// Consulta agregada do log, para quem só precisa de números já somados (a ferramenta MCP `get_metrics`
// hoje; o painel de métricas quando existir). Função pura sobre o banco, sem depender do `MessageRouter`
// nem do VSCode — mesmo padrão de `rollup.ts`.
//
// `log_months` (o arquivo dos meses consolidados) guarda, por mês, contagem e duração (`runs`), tokens
// (`tokens`) e custo (`cost`), cada um no total e por `phase`/`card_type`/`model`/`tool`/`effort`/
// `profile` (ver RUN_DIMS em rollup.ts) — mas nunca as dimensões `card`, `agent`, `skill`, `used_tool`
// nem `mcp_tool`. Em `tokens` e `cost` o `n` é quantas execuções tinham o número, não quantas houve: é
// daí que saem `measuredRuns` (de `tokens`) e `costedRuns` (de `cost`) de um mês arquivado, e uma
// métrica sem nenhuma medição continua "não medido" (null), nunca zero.
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
// #172: os tempos e o inventário do painel
import type { CardEventKind } from '../../shared/log';
import {
  METRICS_ROW_CAP,
  type MetricsDwell,
  type MetricsInventory,
  type MetricsLead,
  type MetricsPanelSections,
  type MetricsUsage,
} from '../../shared/metrics';
import { DWELL_EVENT_KINDS, leadTimes, phaseDwell, type TimesEventRow, type TimesPeriod } from './times';
// #171: os seis cortes e o ranking por card (METRICS_ROW_CAP e MetricsPanelSections vêm do import de #172)
import {
  METRICS_BREAKDOWN_DIMS,
  type MetricsBreakdown,
  type MetricsBreakdownDim,
  type MetricsCell,
  type MetricsRanking,
} from '../../shared/metrics';

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
  /** true quando algum grupo tem execução sem custo (`cost_usd` nulo, inclusive no arquivo mensal) */
  costPartial: boolean;
  /** true quando algum grupo tem execução sem tokens medidos (`measure = 'none'`) */
  tokensPartial: boolean;
}

const DEFAULT_LIMIT = 20;

function dayBoundary(date: string, end: boolean): number {
  const [y, m, d] = date.split('-').map(Number);
  // fim = meia-noite do dia seguinte, não meia-noite + 24h: no dia em que o horário de verão começa ou
  // termina o dia tem 23 ou 25 horas
  return new Date(y!, (m ?? 1) - 1, (d ?? 1) + (end ? 1 : 0), 0, 0, 0, 0).getTime();
}

function monthOfDay(date: string): string {
  return date.slice(0, 7);
}

function laterMonth(a: string, b: string): string {
  return a > b ? a : b;
}

interface Accumulator {
  runs: number;
  /** execuções medidas (`measure <> 'none'`): é delas que `tokens` vem; 0 = tokens "não medido" */
  measuredRuns: number;
  /** execuções com `cost_usd`: é delas que `costUsd` vem; 0 = custo "não medido" (ver MEASURED_SUMS) */
  costedRuns: number;
  durationMs: number;
  tokens: number;
  costUsd: number;
  calls: number;
  /** a parte estimada de `costUsd` e quantas execuções a tiveram (o painel marca a linha estimada, RF-31) */
  estimatedRuns: number;
  costEstimatedUsd: number;
}

function newAcc(): Accumulator {
  return { runs: 0, measuredRuns: 0, costedRuns: 0, durationMs: 0, tokens: 0, costUsd: 0, calls: 0, estimatedRuns: 0, costEstimatedUsd: 0 };
}

function bump(map: Map<string, Accumulator>, label: string, patch: Partial<Accumulator>): void {
  const acc = map.get(label) ?? newAcc();
  acc.runs += patch.runs ?? 0;
  acc.measuredRuns += patch.measuredRuns ?? 0;
  acc.costedRuns += patch.costedRuns ?? 0;
  acc.durationMs += patch.durationMs ?? 0;
  acc.tokens += patch.tokens ?? 0;
  acc.costUsd += patch.costUsd ?? 0;
  acc.calls += patch.calls ?? 0;
  acc.estimatedRuns += patch.estimatedRuns ?? 0;
  acc.costEstimatedUsd += patch.costEstimatedUsd ?? 0;
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

/**
 * Medida e custo são critérios separados, os mesmos de `totalsFromDetail` (rollup.ts) e do arquivo
 * mensal: a execução é medida quando `measure <> 'none'` (os tokens dela contam) e tem custo quando
 * `cost_usd` não é nulo. Os dois divergem de verdade: o preço por milhão nasce vazio no catálogo, então
 * uma execução medida costuma ter tokens e custo nulo — e os tokens dela não podem sumir por isso.
 */
const MEASURED_SUMS = `SUM(CASE WHEN measure <> 'none' THEN 1 ELSE 0 END) AS measured,
            SUM(CASE WHEN cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS costed`;
const TOKENS_SUM = `SUM(CASE WHEN measure <> 'none'
              THEN COALESCE(input_tokens,0)+COALESCE(output_tokens,0)+COALESCE(cache_read_tokens,0)+COALESCE(cache_write_tokens,0)
              ELSE 0 END)`;

/** Linhas do detalhe (meses ainda em `ai_runs`), agrupadas por uma das seis colunas de `ai_runs`, ou um total só. */
function detailByRunColumn(db: Database, boardId: string, q: MetricsQuery, column: string | null): Map<string, Accumulator> {
  const { sql: where, params } = runsWhere(boardId, q);
  const select = column
    ? `SELECT ${column} AS label, COUNT(*) AS n, SUM(COALESCE(duration_ms,0)) AS ms,
              ${MEASURED_SUMS},
              ${TOKENS_SUM} AS tok,
              SUM(COALESCE(cost_usd,0)) AS cost
       FROM ai_runs WHERE ${where} GROUP BY ${column}`
    : `SELECT COUNT(*) AS n, SUM(COALESCE(duration_ms,0)) AS ms,
              ${MEASURED_SUMS},
              ${TOKENS_SUM} AS tok,
              SUM(COALESCE(cost_usd,0)) AS cost
       FROM ai_runs WHERE ${where}`;
  const map = new Map<string, Accumulator>();
  for (const r of all(db, select, params)) {
    const label = column ? str(r.label) : 'total';
    const n = num(r.n);
    if (n === 0) continue;
    bump(map, label, {
      runs: n,
      measuredRuns: num(r.measured),
      costedRuns: num(r.costed),
      durationMs: num(r.ms),
      tokens: num(r.tok),
      costUsd: num(r.cost),
    });
  }
  return map;
}

/**
 * Rótulo da linha das execuções sem card (RF-20). Fica à parte das linhas '#N título' — nunca '#0' — e
 * o contrato do painel decide como ela viaja (`value: ''`).
 */
export const NO_CARD_LABEL = 'sem card';

/**
 * A parte estimada do custo, com o critério de `totalsFromDetail` (rollup.ts): só `cost_estimated = 0`
 * é "informado"; na dúvida, "estimado" é a afirmação mais fraca. `getMetrics` não a devolve; o painel
 * a usa para marcar a linha (RF-31).
 */
const ESTIMATED_SUMS = `SUM(CASE WHEN cost_usd IS NOT NULL AND COALESCE(cost_estimated, 1) <> 0 THEN 1 ELSE 0 END) AS est_n,
            SUM(CASE WHEN cost_usd IS NOT NULL AND COALESCE(cost_estimated, 1) <> 0 THEN cost_usd ELSE 0 END) AS est`;

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
            ${MEASURED_SUMS},
            ${TOKENS_SUM} AS tok,
            SUM(COALESCE(cost_usd,0)) AS cost, ${ESTIMATED_SUMS}
     FROM ai_runs WHERE ${where} GROUP BY card_number`,
    params,
  );
  const map = new Map<string, Accumulator>();
  for (const r of rows) {
    const label = r.card_number == null ? NO_CARD_LABEL : `#${num(r.card_number)} ${str(r.card_title)}`.trim();
    bump(map, label, {
      runs: num(r.n),
      measuredRuns: num(r.measured),
      costedRuns: num(r.costed),
      durationMs: num(r.ms),
      tokens: num(r.tok),
      costUsd: num(r.cost),
      estimatedRuns: num(r.est_n),
      costEstimatedUsd: num(r.est),
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
 * Cada métrica leva o seu `n`: `measuredRuns` sai do `n` de `tokens` (execuções medidas) e `costedRuns`
 * do `n` de `cost` (execuções com custo) — os mesmos critérios do detalhe (MEASURED_SUMS), que é o que
 * faz o número ser o mesmo antes e depois de consolidar (RF-08). Métrica sem linha no arquivo fica com
 * o seu `n` em 0 e sai como "não medido" (null) em `toRow`, nunca como zero (RF-09, RF-30) — inclusive
 * o mês consolidado antes de #71, que só tem `runs`, e o mês medido sem preço no catálogo, que tem
 * `tokens` e não tem `cost`.
 */
function archiveByDim(db: Database, boardId: string, month: string, dim: string): Map<string, Accumulator> {
  const rows = all(
    db,
    `SELECT metric, value, n, total FROM log_months
     WHERE board_id = ? AND month = ? AND dim = ? AND metric IN ('runs', 'tokens', 'cost')`,
    [boardId, month, dim],
  );
  const map = new Map<string, Accumulator>();
  for (const r of rows) bumpArchiveRow(map, dim ? str(r.value) : 'total', str(r.metric), num(r.n), num(r.total));
  return map;
}

/**
 * Uma linha `runs`/`tokens`/`cost` de `log_months` no acumulador. Única leitura do arquivo por dimensão:
 * `getMetrics` e os cortes do painel (#171) passam por aqui, e é isso que os faz responder o mesmo número.
 */
function bumpArchiveRow(map: Map<string, Accumulator>, label: string, metric: string, n: number, total: number): void {
  if (metric === 'runs') bump(map, label, { runs: n, durationMs: total });
  else if (metric === 'tokens') bump(map, label, { measuredRuns: n, tokens: total });
  else bump(map, label, { costedRuns: n, costUsd: total });
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
          // sem data final o recorte vai até hoje: os meses arquivados depois do inicial também entram
          query.endDate ? monthOfDay(query.endDate) : laterMonth(monthOfDay(query.startDate!), monthOf(Date.now())),
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
    // aqui `dim` já não é `card` nem de inventário: sobram as seis colunas de `ai_runs` (RUN_COLUMN), ou o total
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
          costUsd: a.costedRuns > 0 ? a.costUsd : null,
        };
  const rows = head.map(([label, a]) => toRow(label, a));
  const allGroups = [...acc.values()];
  if (tail.length) {
    const other = newAcc();
    for (const [, a] of tail) {
      other.runs += a.runs;
      other.measuredRuns += a.measuredRuns;
      other.costedRuns += a.costedRuns;
      other.durationMs += a.durationMs;
      other.tokens += a.tokens;
      other.costUsd += a.costUsd;
      other.calls += a.calls;
    }
    rows.push(toRow('outros', other));
  }

  const boardRow = all(db, 'SELECT log_since FROM boards WHERE id = ?', [boardId])[0];
  const logSinceMs = boardRow ? num(boardRow.log_since) : 0;
  // parcial quando alguma execução do recorte entrou na contagem sem custo (sem preço no catálogo, sem
  // medição, ou mês consolidado antes de #71) — e, à parte, sem tokens (sem medição)
  const costPartial = !isInventory && allGroups.some((a) => a.runs > a.costedRuns);
  const tokensPartial = !isInventory && allGroups.some((a) => a.runs > a.measuredRuns);

  return {
    rows,
    othersCount: tail.length,
    // no fuso da máquina, como `month` e o resto do log (nunca UTC: à noite no Brasil o dia UTC já é o seguinte)
    logSince: logSinceMs ? dayOf(logSinceMs) : '',
    archivedMonths,
    partialMonths,
    costPartial,
    tokensPartial,
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
    costedRuns: 0,
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
  into.costedRuns = (into.costedRuns ?? 0) + (from.costedRuns ?? 0);
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
      costedRuns: estimatedN + informedN,
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
    } else if (key === 'cost/') {
      acc.costedRuns = n;
      acc.costUsd = total;
    } else if (key === 'cost/source' && value === 'estimated') acc.costEstimatedUsd = total;
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
  // pedido inteiro antes do início da série: nada a consultar. O recorte volta vazio ('' nos dois lados),
  // nunca invertido (início da série depois do fim pedido); `clamped` continua dizendo que foi cortado
  const range = startDate <= endDate ? { startDate, endDate } : { startDate: '', endDate: '' };

  // o recorte pode ficar vazio depois do corte (pediu só dias anteriores ao início da série): espinha vazia
  const spine = range.startDate ? monthRange(monthOfDay(startDate), monthOfDay(endDate)) : [];
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

  // As quatro seções. #172 monta os tempos e o inventário; #171 acrescenta `breakdowns` e `cards`.
  const sections: MetricsPanelSections = {
    ...panelCutSections(db, boardId, range, workflow, archivedMonths, spine.length === 0),
    ...panelTimesSections(db, boardId, range, workflow, spine.length === 0),
  };

  return {
    range,
    clamped,
    totals,
    months,
    sections,
    workflows: spine.length ? panelWorkflows(db, boardId, range, archivedMonths) : [],
    logSince,
    detailFrom: detail[0] ?? '',
    archivedMonths,
    retention: { months: retentionMonths, detailMonths: detail.length, detailRows: panelDetailRows(db, boardId) },
  };
}

// ---------------------------------------------------------------------------------------------------
// #172: os tempos (permanência por fase e lead time) e o inventário do painel (#105). Aqui só as três
// consultas e a montagem: as regras dos tempos são `phaseDwell` e `leadTimes` (times.ts), puras.
//
// Os tempos varrem `card_events` do INÍCIO DO HORIZONTE DO DETALHE até o fim do período, não do início
// do período (RF-14): a entrada numa fase pode ser anterior ao período e ainda ser conhecida. Como a
// consolidação já apagou o detalhe de fora do horizonte, "do início do horizonte" é simplesmente sem
// limite inferior. O único filtro é o de workflow que o painel já tem (RF-34): `card_events` guarda o
// workflow, e é ele que separa o lead time das histórias do das sub-tarefas.
// ---------------------------------------------------------------------------------------------------

/** O workflow escolhido, como cláusula extra sobre `card_events`; '' = todos. */
function eventsWorkflowClause(workflow: string): { sql: string; params: string[] } {
  return workflow ? { sql: ' AND workflow = ?', params: [workflow] } : { sql: '', params: [] };
}

/**
 * As movimentações para `phaseDwell`. Sem `ORDER BY`, de propósito: ordenar em JavaScript (`phaseDwell`
 * já ordena por card) mediu mais rápido que no SQLite (44 contra 49 ms) — nenhum índice serve ao
 * `kind IN (...)` e a `card_number, at` ao mesmo tempo. Não "melhore" isto com `LEAD()`: perde a mediana.
 */
function panelDwell(db: Database, boardId: string, period: TimesPeriod, workflow: string): MetricsDwell[] {
  const wf = eventsWorkflowClause(workflow);
  const rows: TimesEventRow[] = [];
  for (const r of all(
    db,
    `SELECT card_number, at, kind, from_value, to_value FROM card_events
     WHERE board_id = ? AND kind IN (${DWELL_EVENT_KINDS.map(() => '?').join(',')}) AND at < ?${wf.sql}`,
    [boardId, ...DWELL_EVENT_KINDS, period.end, ...wf.params],
  )) {
    if (r.card_number == null) continue;
    rows.push({
      cardNumber: num(r.card_number),
      at: num(r.at),
      kind: str(r.kind) as CardEventKind,
      fromValue: str(r.from_value),
      toValue: str(r.to_value),
      cardTitle: '',
    });
  }
  return phaseDwell(rows, period);
}

/**
 * O lead time: uma linha agregada por card sobre todo o horizonte. `MIN(done)` é a PRIMEIRA conclusão
 * (RF-17); `card_title` ao lado de um único `MAX(at)` vem da linha mais recente (comportamento do SQLite,
 * o mesmo de `detailByCard`). A linha vira até dois eventos sintéticos para `leadTimes` — quem decide
 * desconhecido, período e teto é ela, não esta consulta.
 */
function panelLead(db: Database, boardId: string, period: TimesPeriod, workflow: string): MetricsLead {
  const wf = eventsWorkflowClause(workflow);
  const rows: TimesEventRow[] = [];
  for (const r of all(
    db,
    `SELECT card_number, MIN(CASE WHEN kind = 'created' THEN at END) AS created_at,
            MIN(CASE WHEN kind = 'done' THEN at END) AS done_at, MAX(at) AS last, card_title
     FROM card_events WHERE board_id = ? AND kind IN ('created','done')${wf.sql} GROUP BY card_number`,
    [boardId, ...wf.params],
  )) {
    if (r.card_number == null || r.done_at == null) continue;
    const base = { cardNumber: num(r.card_number), fromValue: '', toValue: '', cardTitle: str(r.card_title) };
    if (r.created_at != null) rows.push({ ...base, at: num(r.created_at), kind: 'created' });
    rows.push({ ...base, at: num(r.done_at), kind: 'done' });
  }
  return leadTimes(rows, period, METRICS_ROW_CAP);
}

const INVENTORY_GROUP: Record<InventoryKind, keyof Omit<MetricsInventory, 'measured'>> = {
  tool: 'tools',
  mcp_tool: 'mcpTools',
  agent: 'agents',
  skill: 'skills',
};

/**
 * O inventário do período: o `JOIN` com `ai_runs` é o único caminho de `ai_run_usage` até o board e o
 * período (a tabela não tem `board_id` nem `month`). Nas ferramentas de MCP o nome é separado em servidor
 * e ferramenta por `splitMcpName`; dois nomes crus que dão o mesmo par (as duas grafias) somam numa linha.
 *
 * `measured` é "o board já teve alguma linha de inventário", não um sinalizador: nunca teve ⇒ "ainda
 * não medido"; já teve ⇒ período vazio é "nenhum registro no período" (RF-27).
 *
 * Sem teto de linhas: `MetricsInventory` não tem onde contar o que ficasse de fora, e cortar calado
 * esconderia uso (RF-33). Ordem: mais usos primeiro, depois nome.
 */
function inventoryMeasured(db: Database, boardId: string): boolean {
  return all(db, 'SELECT 1 AS x FROM ai_run_usage u JOIN ai_runs r ON r.id = u.run_id WHERE r.board_id = ? LIMIT 1', [boardId]).length > 0;
}

function panelInventory(db: Database, boardId: string, q: MetricsQuery): MetricsInventory {
  const measured = inventoryMeasured(db, boardId);
  const inventory: MetricsInventory = { measured, tools: [], mcpTools: [], agents: [], skills: [] };
  if (!measured) return inventory;

  const { sql: where, params } = runsWhere(boardId, q, 'r.');
  const byKey = new Map<string, { group: keyof Omit<MetricsInventory, 'measured'>; usage: MetricsUsage }>();
  for (const r of all(
    db,
    `SELECT u.kind AS kind, u.name AS name, COUNT(DISTINCT u.run_id) AS n, SUM(u.calls) AS calls
     FROM ai_run_usage u JOIN ai_runs r ON r.id = u.run_id
     WHERE ${where} GROUP BY u.kind, u.name`,
    params,
  )) {
    const kind = str(r.kind) as InventoryKind;
    const group = INVENTORY_GROUP[kind];
    if (!group) continue;
    const split = kind === 'mcp_tool' ? splitMcpName(str(r.name)) : { server: '', tool: str(r.name) };
    const key = `${kind}\u0000${split.server}\u0000${split.tool}`;
    const found = byKey.get(key);
    if (found) {
      // a mesma ferramenta nas duas grafias: cada execução registra uma grafia só, então somar não conta
      // a mesma execução duas vezes
      found.usage.runs += num(r.n);
      found.usage.calls += num(r.calls);
    } else byKey.set(key, { group, usage: { name: split.tool, server: split.server, runs: num(r.n), calls: num(r.calls) } });
  }
  for (const { group, usage } of byKey.values()) inventory[group].push(usage);
  for (const group of Object.values(INVENTORY_GROUP))
    inventory[group].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name) || a.server.localeCompare(b.server));
  return inventory;
}

/** As três seções de #172 para o recorte já resolvido por `getPanelMetrics`. Recorte vazio ⇒ seções vazias, sem zeros inventados (RF-32). */
function panelTimesSections(
  db: Database,
  boardId: string,
  range: { startDate: string; endDate: string },
  workflow: string,
  empty: boolean,
): Pick<MetricsPanelSections, 'dwell' | 'lead' | 'inventory'> {
  if (empty)
    return {
      dwell: [],
      lead: { medianMs: null, meanMs: null, counted: 0, unknown: 0, rows: [], omitted: 0 },
      inventory: { measured: inventoryMeasured(db, boardId), tools: [], mcpTools: [], agents: [], skills: [] },
    };
  const period: TimesPeriod = { start: dayBoundary(range.startDate, false), end: dayBoundary(range.endDate, true) };
  return {
    dwell: panelDwell(db, boardId, period, workflow),
    lead: panelLead(db, boardId, period, workflow),
    inventory: panelInventory(db, boardId, { startDate: range.startDate, endDate: range.endDate, ...(workflow ? { workflow } : {}) }),
  };
}

// ---------------------------------------------------------------------------------------------------
// #171: os seis cortes por dimensão e o ranking por card do painel (#105).
//
// Os seis cortes saem de UMA consulta agrupada pelas sete colunas (workflow + as seis dimensões), com as
// somas de consumo de `detailByRunColumn`; as marginais se somam em memória. Não troque por uma consulta
// por dimensão: medido na Spec, 40 ms contra ~110 ms, porque cada consulta varreria `ai_runs` de novo.
// `workflow` entra no agrupamento só para achar as fases de nome igual em workflows diferentes (RF-07).
//
// NULL e '' caem na mesma categoria '' = "não definido" (RF-04): `str()` funde os dois no rótulo do
// `Map`, como o arquivo mensal já funde na consolidação.
//
// O ranking de fases NÃO tem consulta própria: é o corte por fase, e quem ordena é a tela (RF-23). Uma
// segunda consulta poderia divergir dele — e a RF-23 manda justamente poder conferi-los lado a lado.
//
// A resposta leva todas as categorias com as quatro medidas e o total coberto: ordenar, cortar em 10 e
// calcular "outros" é do cliente — zero consulta por clique.
// ---------------------------------------------------------------------------------------------------

const PANEL_DIMS = METRICS_BREAKDOWN_DIMS;

/**
 * Uma categoria no formato do contrato. "Não medido" fica null, nunca 0 (RF-30). A parte estimada de um
 * mês arquivado conta como estimada (ver `panelArchiveDims`).
 */
function panelCell(value: string, a: Accumulator): MetricsCell {
  return {
    value,
    runs: a.runs,
    measuredRuns: a.measuredRuns,
    costedRuns: a.costedRuns,
    durationMs: a.durationMs,
    tokens: a.measuredRuns > 0 ? a.tokens : null,
    costUsd: a.costedRuns > 0 ? a.costUsd : null,
    costEstimatedUsd: a.estimatedRuns > 0 ? a.costEstimatedUsd : null,
  };
}

/** O total do que um bloco cobre: a soma de todas as categorias, inclusive as que não vão em `cells` (RF-33). */
function panelCovered(groups: Iterable<Accumulator>): Omit<MetricsCell, 'value'> {
  const sum = new Map<string, Accumulator>();
  for (const a of groups) bump(sum, '', a);
  const { value: _value, ...covered } = panelCell('', sum.get('') ?? newAcc());
  return covered;
}

/** Mais execuções primeiro, depois o rótulo: ordem estável para o teto e para os testes. A tela reordena. */
function byRunsThenLabel(a: [string, Accumulator], b: [string, Accumulator]): number {
  return b[1].runs - a[1].runs || a[0].localeCompare(b[0]);
}

/**
 * Os meses arquivados para as seis dimensões, numa consulta só, lidos por `bumpArchiveRow` — a mesma
 * leitura de `archiveByDim`, que é o que mantém o corte do painel igual a `getMetrics` antes e depois de
 * consolidar (RF-08). O arquivo não guarda a origem do custo por dimensão (só no total, `dim='source'`):
 * o custo de um mês arquivado entra como estimado, que é a afirmação mais fraca — o mesmo critério de
 * `totalsFromDetail` na dúvida.
 */
function panelArchiveDims(db: Database, boardId: string, months: string[]): Map<MetricsBreakdownDim, Map<string, Accumulator>> {
  const out = new Map<MetricsBreakdownDim, Map<string, Accumulator>>(PANEL_DIMS.map((d) => [d, new Map()]));
  if (!months.length) return out;
  const rows = all(
    db,
    `SELECT dim, metric, value, n, total FROM log_months
     WHERE board_id = ? AND month IN (${months.map(() => '?').join(',')})
       AND dim IN (${PANEL_DIMS.map(() => '?').join(',')}) AND metric IN ('runs', 'tokens', 'cost')`,
    [boardId, ...months, ...PANEL_DIMS],
  );
  for (const r of rows) {
    const map = out.get(str(r.dim) as MetricsBreakdownDim);
    if (map) bumpArchiveRow(map, str(r.value), str(r.metric), num(r.n), num(r.total));
  }
  for (const map of out.values())
    for (const a of map.values()) {
      a.estimatedRuns = a.costedRuns;
      a.costEstimatedUsd = a.costUsd;
    }
  return out;
}

/**
 * Os seis cortes. Com workflow em "Todos", os meses arquivados do recorte entram (RF-08); com um workflow
 * escolhido eles saem e vão para `excludedMonths`, porque o arquivo guarda marginais e não o cruzamento
 * dimensão × workflow (RF-10). `ambiguous` só olha o detalhe: o arquivo também não cruza fase × workflow.
 * Os nomes ambíguos continuam somados — separá-los só nos meses com detalhe daria um corte que muda de
 * significado no meio do período.
 */
function panelBreakdowns(db: Database, boardId: string, q: MetricsQuery, archivedMonths: string[]): MetricsBreakdown[] {
  const { sql: where, params } = runsWhere(boardId, q);
  const byDim = new Map<MetricsBreakdownDim, Map<string, Accumulator>>(PANEL_DIMS.map((d) => [d, new Map()]));
  const workflowsByPhase = new Map<string, Set<string>>();
  for (const r of all(
    db,
    `SELECT workflow, phase, card_type, model, tool, effort, profile,
            COUNT(*) AS n, SUM(COALESCE(duration_ms,0)) AS ms,
            ${MEASURED_SUMS},
            ${TOKENS_SUM} AS tok,
            SUM(COALESCE(cost_usd,0)) AS cost, ${ESTIMATED_SUMS}
     FROM ai_runs WHERE ${where}
     GROUP BY workflow, phase, card_type, model, tool, effort, profile`,
    params,
  )) {
    const patch: Partial<Accumulator> = {
      runs: num(r.n),
      measuredRuns: num(r.measured),
      costedRuns: num(r.costed),
      durationMs: num(r.ms),
      tokens: num(r.tok),
      costUsd: num(r.cost),
      estimatedRuns: num(r.est_n),
      costEstimatedUsd: num(r.est),
    };
    for (const dim of PANEL_DIMS) bump(byDim.get(dim)!, str(r[RUN_COLUMN[dim]]), patch);
    const phase = str(r.phase);
    if (phase) {
      const set = workflowsByPhase.get(phase) ?? new Set<string>();
      set.add(str(r.workflow));
      workflowsByPhase.set(phase, set);
    }
  }

  const includesArchive = !q.workflow && archivedMonths.length > 0;
  if (includesArchive) for (const [dim, map] of panelArchiveDims(db, boardId, archivedMonths)) merge(byDim.get(dim)!, map);
  const excludedMonths = q.workflow ? [...archivedMonths] : [];
  const ambiguous = [...workflowsByPhase]
    .filter(([, set]) => set.size > 1)
    .map(([phase]) => phase)
    .sort((a, b) => a.localeCompare(b));

  return PANEL_DIMS.map((dim) => {
    const map = byDim.get(dim)!;
    return {
      dim,
      cells: [...map.entries()].sort(byRunsThenLabel).map(([value, a]) => panelCell(value, a)),
      covered: panelCovered(map.values()),
      includesArchive,
      excludedMonths,
      ambiguous: dim === 'phase' ? ambiguous : [],
    };
  });
}

/**
 * O ranking por card: `detailByCard` (um grupo por número, título da execução mais recente, linha "sem
 * card"), só detalhe — `card` não é arquivado. Até `METRICS_ROW_CAP` linhas, as de mais execuções; o
 * resto fica somado em `covered` e contado em `omitted` (RF-33). A linha "sem card" viaja como `value: ''`.
 */
function panelCardRanking(db: Database, boardId: string, q: MetricsQuery): MetricsRanking {
  const map = detailByCard(db, boardId, q);
  const sorted = [...map.entries()].sort(byRunsThenLabel);
  return {
    cells: sorted.slice(0, METRICS_ROW_CAP).map(([label, a]) => panelCell(label === NO_CARD_LABEL ? '' : label, a)),
    covered: panelCovered(map.values()),
    omitted: Math.max(0, sorted.length - METRICS_ROW_CAP),
  };
}

/** As duas seções de #171 para o recorte já resolvido por `getPanelMetrics`. Recorte vazio ⇒ seções vazias (RF-34). */
function panelCutSections(
  db: Database,
  boardId: string,
  range: { startDate: string; endDate: string },
  workflow: string,
  archivedMonths: string[],
  empty: boolean,
): Pick<MetricsPanelSections, 'breakdowns' | 'cards'> {
  const q: MetricsQuery = { startDate: range.startDate, endDate: range.endDate, ...(workflow ? { workflow } : {}) };
  if (empty) {
    const covered = panelCovered([]);
    return {
      breakdowns: PANEL_DIMS.map((dim) => ({ dim, cells: [], covered, includesArchive: false, excludedMonths: [], ambiguous: [] })),
      cards: { cells: [], covered, omitted: 0 },
    };
  }
  return { breakdowns: panelBreakdowns(db, boardId, q, archivedMonths), cards: panelCardRanking(db, boardId, q) };
}
