// O custo por entrega do painel e do get_metrics: quanto custou cada história concluída no período, por
// tipo × "Esforço da atividade", e a visão cruzada tipo × modelo e tipo × agente. O indicador principal é o
// custo em US$ (o informado pela CLI ou, sem ele, o estimado pelo preço do catálogo, marcado); os tokens
// seguem na tabela e são o único indicador das histórias com execução de um modelo sem preço no catálogo.
// `deliveryOf` é puro (as contas); `panelDelivery` só faz as consultas. O período e o workflow escolhem
// as histórias (pelo evento `done`); o custo de cada uma soma TODAS as execuções dela e das sub-tarefas.
import type { Database } from 'sql.js';
import { EFFORT_FIELD } from '../../shared/models';
import {
  EMPTY_DELIVERY,
  METRICS_ROW_CAP,
  type MetricsDelivery,
  type MetricsDeliveryCross,
  type MetricsDeliveryGroup,
} from '../../shared/metrics';
import { all, num, str } from '../db/query';
import { doneStories, reviewEventRows, reworkOf, type ReworkPeriod } from './rework';
import { mean, median } from './times';

export interface DeliveryStory {
  id: string;
  number: number;
  type: string;
  /** o valor atual do "Esforço da atividade"; '' = não definido */
  effort: string;
}
export interface DeliveryRunRow {
  storyId: string;
  model: string;
  agent: string;
  /** `measure <> 'none'` */
  measured: boolean;
  /** os quatro contadores somados */
  tokens: number;
  /** leitura e criação de cache, à parte: a troca entre os dois explica custo subindo com tokens caindo */
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** o custo gravado (informado pela CLI ou estimado pelo catálogo); null = execução sem custo */
  costUsd: number | null;
  /** true = `costUsd` veio do preço do catálogo */
  costEstimated: boolean;
}
export interface DeliveryAdjustRow {
  storyId: string;
  model: string;
  agent: string;
}

/** O que uma história (ou um par história × modelo/agente) somou das execuções. */
interface StoryUsage {
  measured: boolean;
  tokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  costEstimated: number;
  /** execuções com custo */
  costedRuns: number;
  /** execuções com tokens e sem custo: o modelo não tem preço no catálogo */
  unpricedRuns: number;
}

const emptyUsage = (): StoryUsage => ({
  measured: false,
  tokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  costEstimated: 0,
  costedRuns: 0,
  unpricedRuns: 0,
});

function addRun(u: StoryUsage, r: DeliveryRunRow): void {
  if (!r.measured) return;
  u.measured = true;
  u.tokens += r.tokens;
  u.cacheRead += r.cacheReadTokens;
  u.cacheWrite += r.cacheWriteTokens;
  if (r.costUsd != null) {
    u.cost += r.costUsd;
    if (r.costEstimated) u.costEstimated += r.costUsd;
    u.costedRuns++;
  } else if (r.tokens > 0) u.unpricedRuns++;
}

/** A história tem custo quando toda execução com tokens tem custo: uma soma parcial não passa por custo completo. */
const costed = (u: StoryUsage): boolean => u.costedRuns > 0 && u.unpricedRuns === 0;

const sumOrNull = (values: number[]): number | null => (values.length ? values.reduce((a, b) => a + b, 0) : null);

/** Custo desc (null por último), depois tokens desc (null por último), depois histórias desc. */
function byCost<T extends { costUsd: number | null; tokens: number | null; stories: number }>(a: T, b: T): number {
  if ((a.costUsd === null) !== (b.costUsd === null)) return a.costUsd === null ? 1 : -1;
  if ((a.costUsd ?? 0) !== (b.costUsd ?? 0)) return (b.costUsd ?? 0) - (a.costUsd ?? 0);
  if ((a.tokens === null) !== (b.tokens === null)) return a.tokens === null ? 1 : -1;
  return (b.tokens ?? 0) - (a.tokens ?? 0) || b.stories - a.stories;
}

/** Corta a lista em `cap` e conta o resto. */
function capped<T>(rows: T[], cap: number): { rows: T[]; omitted: number } {
  return { rows: rows.slice(0, cap), omitted: Math.max(0, rows.length - cap) };
}

/** Os totais de um conjunto de histórias: tokens e cache das medidas, custo das com custo. */
function totalsOf(usages: StoryUsage[]) {
  const measured = usages.filter((u) => u.measured);
  const priced = usages.filter(costed);
  return {
    measured: measured.length,
    tokens: sumOrNull(measured.map((u) => u.tokens)),
    cacheReadTokens: sumOrNull(measured.map((u) => u.cacheRead)),
    cacheWriteTokens: sumOrNull(measured.map((u) => u.cacheWrite)),
    costed: priced.length,
    costUsd: sumOrNull(priced.map((u) => u.cost)),
    costEstimatedUsd: sumOrNull(priced.map((u) => u.costEstimated)),
  };
}

/** As contas da entrega (RF1–RF4, RF9–RF10, RF13). */
export function deliveryOf(
  stories: DeliveryStory[],
  runs: DeliveryRunRow[],
  adjustments: DeliveryAdjustRow[],
  cap = METRICS_ROW_CAP,
): MetricsDelivery {
  if (!stories.length) return EMPTY_DELIVERY;
  const ids = new Set(stories.map((s) => s.id));
  const own = runs.filter((r) => ids.has(r.storyId));
  const usageOf = new Map<string, StoryUsage>();
  for (const r of own) addRun(usageOf.get(r.storyId) ?? usageOf.set(r.storyId, emptyUsage()).get(r.storyId)!, r);
  const usage = (storyId: string): StoryUsage => usageOf.get(storyId) ?? emptyUsage();

  const groupMap = new Map<string, { type: string; effort: string; stories: number; usages: StoryUsage[] }>();
  for (const s of stories) {
    const key = `${s.type}\u0000${s.effort}`;
    const g = groupMap.get(key) ?? groupMap.set(key, { type: s.type, effort: s.effort, stories: 0, usages: [] }).get(key)!;
    g.stories++;
    g.usages.push(usage(s.id));
  }
  const groups: MetricsDeliveryGroup[] = [...groupMap.values()]
    .map((g) => {
      const tokens = g.usages.filter((u) => u.measured).map((u) => u.tokens);
      const costs = g.usages.filter(costed).map((u) => u.cost);
      return {
        type: g.type,
        effort: g.effort,
        stories: g.stories,
        ...totalsOf(g.usages),
        meanTokens: mean(tokens),
        medianTokens: median(tokens),
        meanCostUsd: mean(costs),
        medianCostUsd: median(costs),
      };
    })
    .sort(byCost);

  const typeOf = new Map(stories.map((s) => [s.id, s.type]));
  const cross = (key: 'model' | 'agent'): MetricsDeliveryCross[] => {
    const map = new Map<string, { type: string; value: string; usages: Map<string, StoryUsage>; adjusted: number }>();
    const entry = (storyId: string, value: string) => {
      const type = typeOf.get(storyId)!;
      const k = `${type}\u0000${value}`;
      return map.get(k) ?? map.set(k, { type, value, usages: new Map(), adjusted: 0 }).get(k)!;
    };
    for (const r of own) {
      const e = entry(r.storyId, r[key]);
      addRun(e.usages.get(r.storyId) ?? e.usages.set(r.storyId, emptyUsage()).get(r.storyId)!, r);
    }
    for (const a of adjustments) {
      if (!ids.has(a.storyId)) continue;
      const e = entry(a.storyId, a[key]);
      if (e.usages.has(a.storyId)) e.adjusted++;
    }
    return [...map.values()]
      .filter((e) => e.usages.size > 0)
      .map((e) => {
        const totals = totalsOf([...e.usages.values()]);
        return {
          type: e.type,
          value: e.value,
          stories: e.usages.size,
          ...totals,
          tokensPerStory: totals.tokens === null ? null : totals.tokens / totals.measured,
          costPerStory: totals.costUsd === null ? null : totals.costUsd / totals.costed,
          adjusted: e.adjusted,
        };
      })
      .sort(byCost);
  };

  const g = capped(groups, cap);
  const m = capped(cross('model'), cap);
  const a = capped(cross('agent'), cap);
  return {
    stories: stories.length,
    ...totalsOf(stories.map((s) => usage(s.id))),
    groups: g.rows,
    byModel: m.rows,
    byAgent: a.rows,
    omitted: { groups: g.omitted, byModel: m.omitted, byAgent: a.omitted },
  };
}

/** As consultas da entrega do período, no recorte de workflow ('' = todos) do evento `done` das histórias. */
export function panelDelivery(db: Database, boardId: string, period: ReworkPeriod, workflow: string): MetricsDelivery {
  const done = doneStories(db, boardId, period, workflow);
  if (!done.length) return EMPTY_DELIVERY;
  const ids = done.map((s) => s.id);
  const marks = ids.map(() => '?').join(',');

  const effortOf = new Map<string, string>();
  for (const r of all(
    db,
    `SELECT fv.card_id AS card_id, fv.value_json AS value_json FROM field_values fv JOIN field_defs f ON f.id = fv.field_id
     WHERE f.board_id = ? AND lower(f.name) = lower(?) AND fv.card_id IN (${marks})`,
    [boardId, EFFORT_FIELD, ...ids],
  )) {
    let value: unknown = '';
    try {
      value = JSON.parse(str(r.value_json));
    } catch {
      value = '';
    }
    effortOf.set(str(r.card_id), typeof value === 'string' ? value : '');
  }
  const stories: DeliveryStory[] = done.map((s) => ({ id: s.id, number: s.number, type: s.type, effort: effortOf.get(s.id) ?? '' }));

  const runs: DeliveryRunRow[] = all(
    db,
    `SELECT COALESCE(c.parent_id, r.card_id) AS story_id, r.model AS model, r.agent AS agent, r.measure AS measure,
            COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)+COALESCE(r.cache_read_tokens,0)+COALESCE(r.cache_write_tokens,0) AS tokens,
            COALESCE(r.cache_read_tokens,0) AS cache_read, COALESCE(r.cache_write_tokens,0) AS cache_write,
            r.cost_usd AS cost_usd, r.cost_estimated AS cost_estimated
     FROM ai_runs r LEFT JOIN cards c ON c.id = r.card_id
     WHERE r.board_id = ? AND COALESCE(c.parent_id, r.card_id) IN (${marks})`,
    [boardId, ...ids],
  ).map((r) => ({
    storyId: str(r.story_id),
    model: str(r.model),
    agent: str(r.agent),
    measured: str(r.measure) !== 'none',
    tokens: num(r.tokens),
    cacheReadTokens: num(r.cache_read),
    cacheWriteTokens: num(r.cache_write),
    costUsd: r.cost_usd == null ? null : num(r.cost_usd),
    // custo gravado sem a marca (linha anterior à marca) conta como estimado, como em `cardUsage`
    costEstimated: r.cost_usd != null && (r.cost_estimated == null || num(r.cost_estimated) !== 0),
  }));

  const storyOfNumber = new Map<number, string>();
  for (const r of all(db, `SELECT number, id, parent_id FROM cards WHERE board_id = ? AND (id IN (${marks}) OR parent_id IN (${marks}))`, [
    boardId,
    ...ids,
    ...ids,
  ]))
    storyOfNumber.set(num(r.number), str(r.parent_id) || str(r.id));
  const adjustments: DeliveryAdjustRow[] = [];
  for (const a of reworkOf(reviewEventRows(db, boardId, period.end, ''), period).adjustments) {
    const storyId = storyOfNumber.get(a.cardNumber);
    if (storyId) adjustments.push({ storyId, model: a.model, agent: a.agent });
  }
  return deliveryOf(stories, runs, adjustments);
}
