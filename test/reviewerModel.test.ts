import { describe, expect, it } from 'vitest';
import { isCheapTier, pickReviewerModel, reviewerFloor } from '../src/shared/reviewerModel';
import type { ModelOption } from '../src/shared/models';

const opt = (tool: 'claude' | 'codex', model: string, efforts: string[] = [], output?: number): ModelOption => ({
  id: `${tool}:${model}`,
  tool,
  model,
  label: model,
  efforts,
  defaultEffort: efforts[0] ?? null,
  ...(output !== undefined ? { pricing: { output } } : {}),
});
const catalog = [
  opt('claude', 'haiku'),
  opt('claude', 'sonnet', ['medium']),
  opt('claude', 'opus'),
  opt('codex', 'mini'),
  opt('codex', 'big'),
];
const ladders = { claude: ['claude:haiku', 'claude:sonnet@medium', 'claude:opus'], codex: ['codex:mini', 'codex:big'] };
const base = { catalog, ladders, readyProfileIds: ['claude', 'codex'], implementer: 'claude:opus', current: null, configured: null };

describe('isCheapTier / reviewerFloor', () => {
  it('1º degrau da escada é barato; escada de 1 degrau não', () => {
    expect(isCheapTier(catalog, ladders, 'claude', 'claude:haiku')).toBe(true);
    expect(isCheapTier(catalog, ladders, 'claude', 'claude:sonnet@medium')).toBe(false);
    expect(isCheapTier(catalog, { claude: ['claude:haiku'] }, 'claude', 'claude:haiku')).toBe(false);
  });
  it('sem escada, o menor preço de saída é barato (2+ com preço e diferentes)', () => {
    const priced = [opt('claude', 'a', [], 1), opt('claude', 'b', [], 5)];
    expect(isCheapTier(priced, {}, 'claude', 'claude:a')).toBe(true);
    expect(isCheapTier(priced, {}, 'claude', 'claude:b')).toBe(false);
    expect(isCheapTier([opt('claude', 'a', [], 1)], {}, 'claude', 'claude:a')).toBe(false);
    expect(isCheapTier([opt('claude', 'a', [], 2), opt('claude', 'b', [], 2)], {}, 'claude', 'claude:a')).toBe(false);
  });
  it('sem escada nem preço, nada é barato', () => {
    expect(isCheapTier(catalog, {}, 'claude', 'claude:haiku')).toBe(false);
    expect(reviewerFloor(catalog, {}, 'claude')).toBe('claude:haiku');
  });
  it('piso: o primeiro não barato', () => {
    expect(reviewerFloor(catalog, ladders, 'claude')).toBe('claude:sonnet@medium');
    expect(reviewerFloor(catalog, ladders, 'codex')).toBe('codex:big');
    expect(reviewerFloor(catalog, ladders, 'nenhum')).toBeNull();
  });
});

describe('pickReviewerModel', () => {
  it('outro perfil pronto: o piso dele', () => {
    expect(pickReviewerModel(base)).toEqual({ value: 'codex:big', independence: 'other_provider', reason: null });
  });
  it('só um perfil: outro modelo, não barato', () => {
    const r = pickReviewerModel({ ...base, readyProfileIds: ['claude'] });
    expect(r).toMatchObject({ value: 'claude:sonnet@medium', independence: 'other_model' });
    expect(r?.reason).toContain('outro modelo');
  });
  it('perfil sem outro modelo não barato: usa o configurado', () => {
    const one = [opt('claude', 'haiku'), opt('claude', 'opus'), opt('codex', 'x')];
    const r = pickReviewerModel({
      catalog: one,
      ladders: { claude: ['claude:haiku', 'claude:opus'] },
      readyProfileIds: ['claude'],
      implementer: 'claude:opus',
      current: null,
      configured: 'codex:x',
    });
    expect(r).toMatchObject({ value: 'codex:x', independence: 'configured' });
  });
  it('configurado barato ou igual ao implementador é recusado', () => {
    const args = {
      ...base,
      catalog: [opt('claude', 'haiku'), opt('claude', 'opus')],
      ladders: { claude: ['claude:haiku', 'claude:opus'] },
      readyProfileIds: ['claude'],
    };
    expect(pickReviewerModel({ ...args, configured: 'claude:haiku', current: 'claude:opus' })?.independence).toBe('unchanged');
    expect(pickReviewerModel({ ...args, configured: 'claude:opus', current: 'claude:opus' })?.independence).toBe('unchanged');
  });
  it('mantém o atual se não barato', () => {
    const args = { ...base, catalog: [opt('claude', 'opus')], ladders: {}, readyProfileIds: ['claude'], current: 'claude:opus' };
    const r = pickReviewerModel(args);
    expect(r).toMatchObject({ value: 'claude:opus', independence: 'unchanged' });
    expect(r?.reason).toContain('mesmo modelo');
  });
  it('atual barato sobe ao piso', () => {
    const args = {
      ...base,
      catalog: [opt('claude', 'haiku'), opt('claude', 'opus')],
      ladders: { claude: ['claude:haiku', 'claude:opus'] },
      readyProfileIds: ['claude'],
      implementer: 'claude:opus',
      configured: null,
    };
    expect(pickReviewerModel({ ...args, current: 'claude:haiku' })).toMatchObject({
      value: 'claude:opus',
      independence: 'same_provider_fallback',
    });
  });
  it('sem escada nem preço, nada é barato: outro modelo vale', () => {
    expect(pickReviewerModel({ ...base, ladders: {}, readyProfileIds: ['claude'] })).toMatchObject({
      value: 'claude:haiku',
      independence: 'other_model',
    });
  });
  it('nunca devolve barato', () => {
    for (const current of [null, 'claude:haiku', 'codex:mini', 'claude:opus']) {
      for (const ready of [['claude'], ['codex'], ['claude', 'codex'], []]) {
        for (const implementer of ['claude:opus', 'claude:haiku', 'codex:big']) {
          const r = pickReviewerModel({ ...base, readyProfileIds: ready, current, implementer });
          if (r) expect(isCheapTier(catalog, ladders, r.value.split(':')[0] ?? '', r.value)).toBe(false);
        }
      }
    }
  });
});
