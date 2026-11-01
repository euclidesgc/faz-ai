import type { AiRunConsumption } from './log';
import type { ModelOption } from './models';

/** Os quatro buckets de token que têm preço próprio. */
export type CostBucket = 'input' | 'output' | 'cacheRead' | 'cacheWrite';
export const COST_BUCKETS: readonly CostBucket[] = ['input', 'output', 'cacheRead', 'cacheWrite'];

/** US$ por milhão de tokens; bucket ausente = sem preço (nunca 0 por falta de preço). */
export type ModelPricing = Partial<Record<CostBucket, number>>;

/** Custo em US$ de cada bucket; null = o bucket não tem preço. */
export type CostBuckets = Record<CostBucket, number | null>;

/** Os tokens da execução que correspondem a cada bucket de preço. */
function tokensOf(c: AiRunConsumption, bucket: CostBucket): number {
  switch (bucket) {
    case 'input':
      return c.inputTokens;
    case 'output':
      return c.outputTokens;
    case 'cacheRead':
      return c.cacheReadTokens;
    case 'cacheWrite':
      return c.cacheWriteTokens;
  }
}

/**
 * Lê o preço gravado ou vindo do MCP: só números finitos >= 0 entram; o resto sai (o bucket fica sem preço).
 * Sem nenhum bucket válido, devolve null.
 */
export function parsePricing(raw: unknown): ModelPricing | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const out: ModelPricing = {};
  for (const bucket of COST_BUCKETS) {
    const v = source[bucket];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[bucket] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** O preço do modelo do catálogo, ou null quando ele não existe ou nenhum bucket tem preço. */
export function pricingOf(option: ModelOption | undefined): ModelPricing | null {
  return option ? parsePricing(option.pricing) : null;
}

/**
 * Completa o consumo com o custo pelo preço do catálogo:
 * - sem `pricing`: devolve `c` como veio (custo informado pela ferramenta ou nada);
 * - `costBuckets[b] = tokens(b) * pricing[b] / 1e6` nos buckets com preço; null nos outros;
 * - com `c.costUsd` informado: o total fica o informado (precedência), sem marca de estimativa;
 * - sem custo informado: total = soma dos buckets e `costEstimated: true`, SÓ se houver tokens e todo bucket
 *   com tokens > 0 tiver preço; senão o total fica null (os buckets com preço continuam gravados), para uma
 *   soma parcial não passar por custo completo.
 */
export function priceRun(c: AiRunConsumption, pricing: ModelPricing | null): AiRunConsumption {
  if (!pricing) return c;
  const costBuckets = {} as CostBuckets;
  let complete = true;
  let anyTokens = false;
  let sum = 0;
  for (const bucket of COST_BUCKETS) {
    const tokens = tokensOf(c, bucket);
    const price = pricing[bucket];
    costBuckets[bucket] = price === undefined ? null : (tokens * price) / 1e6;
    if (tokens > 0) {
      anyTokens = true;
      if (price === undefined) complete = false;
    }
    sum += costBuckets[bucket] ?? 0;
  }
  if (c.costUsd != null) return { ...c, costBuckets };
  if (anyTokens && complete) return { ...c, costBuckets, costUsd: sum, costEstimated: true };
  return { ...c, costBuckets };
}
