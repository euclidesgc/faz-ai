import { describe, expect, it } from 'vitest';
import { nextTier, parseLadders, previousTier, tierRank } from '../src/shared/modelLadder';
import { isHandPicked, type ModelOption } from '../src/shared/models';
import type { BoardState, Card } from '../src/shared/model';

const opt = (model: string, efforts: string[], defaultEffort: string | null = null): ModelOption => ({
  id: `claude:${model}`,
  tool: 'claude',
  model,
  label: model,
  efforts,
  defaultEffort,
});
const catalog = [opt('haiku', []), opt('sonnet', ['low', 'medium', 'high'], 'medium'), opt('opus', ['low', 'high'])];

describe('parseLadders', () => {
  it('lê escadas válidas e ignora o resto', () => {
    expect(parseLadders('{"claude":["a","b",3],"x":"y","z":[]}')).toEqual({ claude: ['a', 'b'] });
    expect(parseLadders('lixo')).toEqual({});
    expect(parseLadders('[1]')).toEqual({});
    expect(parseLadders(null)).toEqual({});
  });
});

describe('nextTier', () => {
  const ladders = { claude: ['claude:haiku', 'claude:sonnet@medium', 'claude:opus@high', 'claude:fora'] };
  it('usa a escada do perfil', () => {
    expect(nextTier(catalog, ladders, 'claude', 'claude:haiku')).toBe('claude:sonnet@medium');
    expect(nextTier(catalog, ladders, 'claude', 'claude:sonnet@medium')).toBe('claude:opus@high');
  });
  it('topo da escada e item fora do catálogo: null', () => {
    expect(nextTier(catalog, ladders, 'claude', 'claude:opus@high')).toBeNull();
  });
  it('sem escada sobe o esforço do mesmo modelo', () => {
    expect(nextTier(catalog, {}, 'claude', 'claude:sonnet@low')).toBe('claude:sonnet@medium');
    expect(nextTier(catalog, {}, 'claude', 'claude:sonnet')).toBe('claude:sonnet@high');
    expect(nextTier(catalog, { outro: ['x'] }, 'claude', 'claude:opus@low')).toBe('claude:opus@high');
  });
  it('topo do esforço, sem esforço e fora do catálogo: null', () => {
    expect(nextTier(catalog, {}, 'claude', 'claude:sonnet@high')).toBeNull();
    expect(nextTier(catalog, {}, 'claude', 'claude:haiku')).toBeNull();
    expect(nextTier(catalog, {}, 'claude', 'claude:desconhecido@low')).toBeNull();
    expect(nextTier(catalog, {}, 'claude', '')).toBeNull();
  });
});

describe('tierRank', () => {
  it('posição na escada, senão no esforço, senão -1', () => {
    const ladders = { claude: ['claude:haiku', 'claude:opus@high'] };
    expect(tierRank(catalog, ladders, 'claude', 'claude:opus@high')).toBe(1);
    expect(tierRank(catalog, {}, 'claude', 'claude:sonnet@high')).toBe(2);
    expect(tierRank(catalog, {}, 'claude', 'claude:x@high')).toBe(-1);
  });
});

describe('isHandPicked', () => {
  const state = (value: string | null, suggestion: string | null): BoardState =>
    ({
      fieldDefs: [{ id: 'f', kind: 'model', appliesToTypes: null }],
      fieldValues: value === null ? [] : [{ cardId: 'c', fieldId: 'f', value }],
      board: {
        modelRules: suggestion
          ? [{ id: 'r', name: '', enabled: true, groups: [[{ fieldId: '@type', op: 'is', value: 'T' }]], model: suggestion }]
          : [],
      },
      cardTypes: [{ id: 't', name: 'T' }],
    }) as unknown as BoardState;
  const card = { id: 'c', typeId: 't' } as Card;
  it('sem valor não é à mão', () => expect(isHandPicked(state(null, 'a'), card)).toBe(false));
  it('igual à sugestão não é à mão', () => expect(isHandPicked(state('a', 'a'), card)).toBe(false));
  it('diferente da sugestão é à mão', () => expect(isHandPicked(state('b', 'a'), card)).toBe(true));
  it('com previous compara com ele', () => {
    expect(isHandPicked(state('b', 'a'), card, 'b')).toBe(false);
    expect(isHandPicked(state('b', 'a'), card, null)).toBe(true);
  });
});

describe('previousTier', () => {
  const ladders = { claude: ['claude:haiku', 'claude:sonnet@medium', 'claude:opus@high', 'claude:fora'] };
  it('usa a escada do perfil', () => {
    expect(previousTier(catalog, ladders, 'claude', 'claude:opus@high')).toBe('claude:sonnet@medium');
    expect(previousTier(catalog, ladders, 'claude', 'claude:sonnet@medium')).toBe('claude:haiku');
  });
  it('primeiro degrau da escada: null', () => {
    expect(previousTier(catalog, ladders, 'claude', 'claude:haiku')).toBeNull();
  });
  it('sem escada desce o esforço do mesmo modelo', () => {
    expect(previousTier(catalog, {}, 'claude', 'claude:sonnet@high')).toBe('claude:sonnet@medium');
    expect(previousTier(catalog, {}, 'claude', 'claude:sonnet')).toBe('claude:sonnet@low');
    expect(previousTier(catalog, { outro: ['x'] }, 'claude', 'claude:opus@high')).toBe('claude:opus@low');
  });
  it('primeiro esforço, sem esforço e fora do catálogo: null', () => {
    expect(previousTier(catalog, {}, 'claude', 'claude:sonnet@low')).toBeNull();
    expect(previousTier(catalog, {}, 'claude', 'claude:haiku')).toBeNull();
    expect(previousTier(catalog, {}, 'claude', 'claude:nada@high')).toBeNull();
  });
});
