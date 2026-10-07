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

// ---------- #251: origem do preço, aplicação da tabela e regras de edição ----------

import { applyBuiltinPrices, priceSourceOf, restoreBuiltinPrice } from '../src/shared/prices';
import { withPrice, type ModelOption } from '../src/shared/models';

const opt = (id: string, extra: Partial<ModelOption> = {}): ModelOption => {
  const [tool, model] = id.split(':') as [ModelOption['tool'], string];
  return { id, tool, model, label: model, efforts: [], defaultEffort: null, ...extra };
};
const TABLE = builtinPrice('codex:gpt-6-luna')!;
const quatro = { input: TABLE.input, output: TABLE.output, cacheRead: TABLE.cacheRead, cacheWrite: TABLE.cacheWrite };

describe('priceSourceOf', () => {
  it('sem preço → null; preço sem origem → manual (catálogo antigo); explícito → ele', () => {
    expect(priceSourceOf(opt('codex:gpt-6-luna'))).toBeNull();
    expect(priceSourceOf(opt('codex:gpt-6-luna', { price: { input: 1 } }))).toBe('manual');
    expect(priceSourceOf(opt('codex:gpt-6-luna', { price: quatro, priceSource: 'builtin' }))).toBe('builtin');
    expect(priceSourceOf(opt('codex:gpt-6-luna', { price: quatro, priceSource: 'manual' }))).toBe('manual');
  });
});

describe('restoreBuiltinPrice', () => {
  it('devolve a tabela com origem, data e URL e preserva variablePrice', () => {
    const r = restoreBuiltinPrice(opt('codex:gpt-6-luna', { price: { input: 99 }, variablePrice: true }));
    expect(r.price).toEqual(quatro);
    expect(r.priceSource).toBe('builtin');
    expect(r.priceCheckedAt).toBe(TABLE.checkedAt);
    expect(r.priceUrl).toBe(TABLE.url);
    expect(r.variablePrice).toBe(true);
  });
});

describe('applyBuiltinPrices', () => {
  it('(a) modelo sem preço com id na tabela recebe o embutido com data e URL (RF-08)', () => {
    const [r] = applyBuiltinPrices([opt('codex:gpt-6-luna')]);
    expect(r!.price).toEqual(quatro);
    expect(r!.priceSource).toBe('builtin');
    expect(r!.priceCheckedAt).toBe(TABLE.checkedAt);
    expect(r!.priceUrl).toBe(TABLE.url);
  });
  it('id fora da tabela e sem preço fica como está', () => {
    const o = opt('cursor:qualquer-coisa');
    expect(applyBuiltinPrices([o])[0]).toBe(o);
  });
  it('(b) manual explícito não muda (RF-06)', () => {
    const o = opt('codex:gpt-6-luna', { price: { ...quatro, input: 123 }, priceSource: 'manual' });
    expect(applyBuiltinPrices([o])[0]).toBe(o);
  });
  it('(c) preço sem origem não muda e não ganha priceSource (RF-07); parcial idem', () => {
    const o = opt('codex:gpt-6-luna', { price: { ...quatro, input: 123 } });
    const p = opt('codex:gpt-6-luna', { price: { input: 1 } });
    const [r1, r2] = applyBuiltinPrices([o, p]);
    expect(r1).toBe(o);
    expect(r2).toBe(p);
    expect(r1!.priceSource).toBeUndefined();
  });
  it('(d) builtin com números antigos recebe os da tabela (RF-09); id que saiu da tabela mantém', () => {
    const velho = opt('codex:gpt-6-luna', {
      price: { ...quatro, input: quatro.input + 1 },
      priceSource: 'builtin',
      priceCheckedAt: '2020-01-01',
      priceUrl: 'https://old',
    });
    const [r] = applyBuiltinPrices([velho]);
    expect(r!.price).toEqual(quatro);
    expect(r!.priceCheckedAt).toBe(TABLE.checkedAt);
    expect(r!.priceUrl).toBe(TABLE.url);
    const sumiu = opt('codex:aposentado', { price: quatro, priceSource: 'builtin', priceCheckedAt: '2020-01-01', priceUrl: 'https://old' });
    expect(applyBuiltinPrices([sumiu])[0]).toBe(sumiu);
  });
  it('(e) Copilot sem variablePrice e sem os quatro preços vira variável; com os quatro fica como está', () => {
    const sem = opt('copilot:gpt-5-mini');
    const parcial = opt('copilot:gpt-5-mini', { price: { input: 1 } });
    const cheio = opt('copilot:gpt-5-mini', { price: quatro });
    const desligado = opt('copilot:gpt-5-mini', { variablePrice: false });
    const [r1, r2, r3, r4] = applyBuiltinPrices([sem, parcial, cheio, desligado]);
    expect(r1!.variablePrice).toBe(true);
    expect(r2!.variablePrice).toBe(true);
    expect(r3).toBe(cheio);
    expect(r4).toBe(desligado);
  });
  it('(f) idempotente: apply(apply(c)) = apply(c), e sincronizado devolve deep-equal (mesma referência)', () => {
    const c = [opt('codex:gpt-6-luna'), opt('claude:opus', { price: { input: 1 } }), opt('copilot:gpt-5-mini'), opt('cursor:auto')];
    const once = applyBuiltinPrices(c);
    const twice = applyBuiltinPrices(once);
    expect(twice).toEqual(once);
    twice.forEach((o, i) => expect(o).toBe(once[i]));
  });
  it('(g) ordem preservada e nada removido', () => {
    const c = [opt('cursor:auto'), opt('codex:gpt-6-luna'), opt('kimi:kimi-code/k3'), opt('claude:haiku')];
    expect(applyBuiltinPrices(c).map((o) => o.id)).toEqual(c.map((o) => o.id));
  });
});

describe('withPrice com origem', () => {
  const embutido = restoreBuiltinPrice(opt('codex:gpt-6-luna'));
  it('alterar um campo de builtin → manual sem data/URL (mesmo valor igual ao embutido)', () => {
    const r = withPrice(embutido, { input: quatro.input });
    expect(r.priceSource).toBe('manual');
    expect(r.priceCheckedAt).toBeUndefined();
    expect(r.priceUrl).toBeUndefined();
    expect(r.price).toEqual(quatro);
  });
  it('patch vazio não mexe em nada', () => {
    expect(withPrice(embutido, {})).toBe(embutido);
    expect(withPrice(embutido, { input: undefined })).toBe(embutido);
  });
  it('apagar os quatro de um modelo com embutido volta ao embutido (RF-10)', () => {
    const manual = withPrice(embutido, { input: 5 });
    const r = withPrice(manual, { input: null, output: null, cacheRead: null, cacheWrite: null });
    expect(r.price).toEqual(quatro);
    expect(r.priceSource).toBe('builtin');
    expect(r.priceCheckedAt).toBe(TABLE.checkedAt);
  });
  it('apagar os quatro de um modelo sem embutido → sem price nem origem', () => {
    const o = opt('cursor:outro', { price: { input: 1, output: 2 }, priceSource: 'manual' });
    const r = withPrice(o, { input: null, output: null });
    expect(r.price).toBeUndefined();
    expect(r.priceSource).toBeUndefined();
    expect(r.priceCheckedAt).toBeUndefined();
    expect(r.priceUrl).toBeUndefined();
  });
});
