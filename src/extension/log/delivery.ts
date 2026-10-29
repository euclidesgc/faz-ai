// O custo por entrega do painel e do get_metrics: quantos tokens custou cada história concluída no
// período, por tipo × "Esforço da atividade", e a visão cruzada tipo × modelo e tipo × agente.
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
  tokens: number;
}
export interface DeliveryAdjustRow {
  storyId: string;
  model: string;
  agent: string;
}

/** Tokens desc (null por último), depois histórias desc. */
function byTokens<T extends { tokens: number | null; stories: number }>(a: T, b: T): number {
  if ((a.tokens === null) !== (b.tokens === null)) return a.tokens === null ? 1 : -1;
  return (b.tokens ?? 0) - (a.tokens ?? 0) || b.stories - a.stories;
}

/** Corta a lista em `cap` e conta o resto. */
function capped<T>(rows: T[], cap: number): { rows: T[]; omitted: number } {
  return { rows: rows.slice(0, cap), omitted: Math.max(0, rows.length - cap) };
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
  const tokensOf = new Map<string, number>();
  const measuredStories = new Set<string>();
  for (const r of own) {
    if (!r.measured) continue;
    measuredStories.add(r.storyId);
    tokensOf.set(r.storyId, (tokensOf.get(r.storyId) ?? 0) + r.tokens);
  }

  const groupMap = new Map<string, { type: string; effort: string; stories: number; tokens: number[] }>();
  for (const s of stories) {
    const key = `${s.type}\u0000${s.effort}`;
    const g = groupMap.get(key) ?? groupMap.set(key, { type: s.type, effort: s.effort, stories: 0, tokens: [] }).get(key)!;
    g.stories++;
    if (measuredStories.has(s.id)) g.tokens.push(tokensOf.get(s.id) ?? 0);
  }
  const groups: MetricsDeliveryGroup[] = [...groupMap.values()]
    .map((g) => ({
      type: g.type,
      effort: g.effort,
      stories: g.stories,
      measured: g.tokens.length,
      tokens: g.tokens.length ? g.tokens.reduce((a, b) => a + b, 0) : null,
      meanTokens: mean(g.tokens),
      medianTokens: median(g.tokens),
    }))
    .sort(byTokens);

  const typeOf = new Map(stories.map((s) => [s.id, s.type]));
  const cross = (key: 'model' | 'agent'): MetricsDeliveryCross[] => {
    const map = new Map<
      string,
      { type: string; value: string; stories: Set<string>; measured: Set<string>; tokens: number; adjusted: number }
    >();
    const entry = (storyId: string, value: string) => {
      const type = typeOf.get(storyId)!;
      const k = `${type}\u0000${value}`;
      return map.get(k) ?? map.set(k, { type, value, stories: new Set(), measured: new Set(), tokens: 0, adjusted: 0 }).get(k)!;
    };
    for (const r of own) {
      const e = entry(r.storyId, r[key]);
      e.stories.add(r.storyId);
      if (r.measured) {
        e.measured.add(r.storyId);
        e.tokens += r.tokens;
      }
    }
    for (const a of adjustments) {
      if (!ids.has(a.storyId)) continue;
      const e = entry(a.storyId, a[key]);
      if (e.stories.has(a.storyId)) e.adjusted++;
    }
    return [...map.values()]
      .filter((e) => e.stories.size > 0)
      .map((e) => ({
        type: e.type,
        value: e.value,
        stories: e.stories.size,
        measured: e.measured.size,
        tokens: e.measured.size ? e.tokens : null,
        tokensPerStory: e.measured.size ? e.tokens / e.measured.size : null,
        adjusted: e.adjusted,
      }))
      .sort(byTokens);
  };

  const g = capped(groups, cap);
  const m = capped(cross('model'), cap);
  const a = capped(cross('agent'), cap);
  return {
    stories: stories.length,
    measured: measuredStories.size,
    tokens: measuredStories.size ? [...tokensOf.values()].reduce((x, y) => x + y, 0) : null,
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
            COALESCE(r.input_tokens,0)+COALESCE(r.output_tokens,0)+COALESCE(r.cache_read_tokens,0)+COALESCE(r.cache_write_tokens,0) AS tokens
     FROM ai_runs r LEFT JOIN cards c ON c.id = r.card_id
     WHERE r.board_id = ? AND COALESCE(c.parent_id, r.card_id) IN (${marks})`,
    [boardId, ...ids],
  ).map((r) => ({
    storyId: str(r.story_id),
    model: str(r.model),
    agent: str(r.agent),
    measured: str(r.measure) !== 'none',
    tokens: num(r.tokens),
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
