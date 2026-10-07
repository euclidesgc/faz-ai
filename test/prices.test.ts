import { describe, expect, it } from 'vitest';
import { BUILTIN_PRICES, PRICE_STALE_DAYS, PRICE_URLS, builtinPrice, priceIsStale } from '../src/shared/prices';
import { builtinIds, modelsFor } from '../src/extension/models';
import { hasVariablePrice } from '../src/shared/models';

/** Ids da lista embutida que precisam ter preço na tabela (os de preço fixo com página oficial de preço por token). */
const REQUIRED = [
  'claude:fable',
  'claude:opus',
  'claude:sonnet',
  'claude:haiku',
  'codex:gpt-6.1-sol',
  'codex:gpt-6-astra',
  'codex:gpt-6-luna',
  'cursor:composer-2.5',
  'kimi:kimi-code/k3',
];

describe('tabela de preços embutida', () => {
  it('toda entrada tem os quatro números, a data de conferência e a página oficial', () => {
    const entries = Object.entries(BUILTIN_PRICES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, p] of entries) {
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
        expect(Number.isFinite(p[key]) && p[key] >= 0, `${id}.${key}`).toBe(true);
      }
      expect(p.checkedAt, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.url, id).toMatch(/^https:\/\//);
    }
  });

  it('toda chave é um id da lista embutida', () => {
    const ids = new Set(builtinIds());
    for (const id of Object.keys(BUILTIN_PRICES)) expect(ids.has(id), id).toBe(true);
  });

  it('os modelos de preço fixo têm entrada; os de preço variável não', () => {
    for (const id of REQUIRED) expect(builtinPrice(id), id).not.toBeNull();
    expect(builtinPrice('cursor:auto')).toBeNull();
    for (const id of builtinIds().filter((x) => x.startsWith('copilot:'))) expect(builtinPrice(id), id).toBeNull();
    // plano de assinatura, sem preço por token na página oficial
    expect(builtinPrice('kimi:kimi-code/kimi-for-coding')).toBeNull();
  });

  it('cada ferramenta tem a página oficial de preços', () => {
    for (const tool of ['claude', 'codex', 'cursor', 'kimi', 'copilot'] as const) expect(PRICE_URLS[tool]).toMatch(/^https:\/\//);
  });
});

describe('priceIsStale', () => {
  const checked = '2026-01-01';
  const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 12));
  it(`${PRICE_STALE_DAYS} dias não é velho; um a mais é`, () => {
    expect(priceIsStale(checked, day(PRICE_STALE_DAYS))).toBe(false);
    expect(priceIsStale(checked, day(PRICE_STALE_DAYS + 1))).toBe(true);
  });
  it('data inválida ou ausente conta como velha', () => {
    expect(priceIsStale('ontem', day(0))).toBe(true);
    expect(priceIsStale('', day(0))).toBe(true);
  });
});

describe('Copilot na lista embutida', () => {
  it('nasce com preço variável: cobra por pedido premium, não por token', () => {
    const copilot = modelsFor('copilot', '');
    expect(copilot.length).toBeGreaterThan(0);
    for (const o of copilot) expect(hasVariablePrice(o), o.id).toBe(true);
  });
});
