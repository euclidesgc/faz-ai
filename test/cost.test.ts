import { describe, expect, it } from 'vitest';
import { parsePricing, priceRun, pricingOf } from '../src/shared/cost';
import type { AiRunConsumption } from '../src/shared/log';
import type { ModelOption } from '../src/shared/models';

const base = (over: Partial<AiRunConsumption> = {}): AiRunConsumption => ({
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cacheReadTokens: 2_000_000,
  cacheWriteTokens: 100_000,
  turns: 3,
  sessionId: null,
  costUsd: null,
  ...over,
});

const full = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

describe('priceRun', () => {
  it('sem preço devolve o consumo como veio', () => {
    const c = base();
    expect(priceRun(c, null)).toBe(c);
    const informed = base({ costUsd: 1.5 });
    expect(priceRun(informed, null)).toBe(informed);
  });

  it('com preço em todos os buckets estima o total e marca como estimado', () => {
    const r = priceRun(base(), full);
    expect(r.costBuckets).toEqual({ input: 3, output: 7.5, cacheRead: 0.6, cacheWrite: 0.375 });
    expect(r.costUsd).toBeCloseTo(11.475, 10);
    expect(r.costEstimated).toBe(true);
  });

  it('o custo informado tem precedência e os buckets seguem estimados', () => {
    const r = priceRun(base({ costUsd: 9 }), full);
    expect(r.costUsd).toBe(9);
    expect(r.costEstimated).toBeUndefined();
    expect(r.costBuckets?.input).toBe(3);
  });

  it('bucket com tokens e sem preço anula o total, mas grava os buckets com preço', () => {
    const r = priceRun(base(), { input: 3, output: 15 });
    expect(r.costUsd).toBeNull();
    expect(r.costEstimated).toBeUndefined();
    expect(r.costBuckets).toEqual({ input: 3, output: 7.5, cacheRead: null, cacheWrite: null });
  });

  it('bucket sem tokens e sem preço não impede a estimativa', () => {
    const r = priceRun(base({ cacheReadTokens: 0, cacheWriteTokens: 0 }), { input: 3, output: 15 });
    expect(r.costUsd).toBeCloseTo(10.5, 10);
    expect(r.costEstimated).toBe(true);
    expect(r.costBuckets).toEqual({ input: 3, output: 7.5, cacheRead: null, cacheWrite: null });
  });

  it('preço 0 é preço: o bucket custa 0', () => {
    const r = priceRun(base(), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(r.costUsd).toBe(0);
    expect(r.costEstimated).toBe(true);
  });

  it('sem nenhum token não inventa custo estimado', () => {
    const r = priceRun(base({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }), full);
    expect(r.costUsd).toBeNull();
  });
});

describe('parsePricing', () => {
  it('mantém só números finitos >= 0', () => {
    expect(parsePricing({ input: 3, output: -1, cacheRead: NaN, cacheWrite: '2' })).toEqual({ input: 3 });
    expect(parsePricing({ input: Infinity, output: 0 })).toEqual({ output: 0 });
  });

  it('vazio, texto e fora de forma viram null', () => {
    expect(parsePricing({})).toBeNull();
    expect(parsePricing({ input: 'x' })).toBeNull();
    expect(parsePricing('3')).toBeNull();
    expect(parsePricing(null)).toBeNull();
    expect(parsePricing([1, 2])).toBeNull();
    expect(parsePricing({ outro: 1 })).toBeNull();
  });
});

describe('pricingOf', () => {
  const option = (pricing?: unknown): ModelOption =>
    ({ id: 'claude:sonnet', tool: 'claude', model: 'sonnet', label: 'S', efforts: [], defaultEffort: null, pricing }) as ModelOption;

  it('lê o preço do modelo e devolve null sem modelo ou sem preço', () => {
    expect(pricingOf(option({ input: 3 }))).toEqual({ input: 3 });
    expect(pricingOf(option())).toBeNull();
    expect(pricingOf(undefined)).toBeNull();
    expect(pricingOf(option({ input: -1 }))).toBeNull();
  });
});
