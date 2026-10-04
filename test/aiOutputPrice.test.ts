import { describe, expect, it } from 'vitest';
import { costOf, matchModel } from '../src/extension/aiOutput/price';
import { modelPrice, type ModelOption, type ModelPrice } from '../src/shared/models';
import type { AiRunTokens } from '../src/shared/log';

// Monta um ModelOption completo para o teste, só sobrescrevendo o que importa ao caso.
const option = (over: Partial<ModelOption>): ModelOption => ({
  id: 'claude:haiku',
  tool: 'claude',
  model: 'haiku',
  label: 'Haiku 4.5',
  efforts: [],
  defaultEffort: null,
  ...over,
});

const price = (over: Partial<ModelPrice> = {}): ModelPrice => ({ input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25, ...over });

const tokens = (over: Partial<AiRunTokens> = {}): AiRunTokens => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
});

describe('modelPrice', () => {
  it('devolve o preço quando os quatro campos são números finitos e não negativos', () => {
    expect(modelPrice(option({ price: price() }))).toEqual(price());
  });

  it('devolve null quando falta um dos quatro campos', () => {
    const noCacheWrite = option({ price: { input: 1, output: 2, cacheRead: 0.1 } as unknown as ModelPrice });
    const noInput = option({ price: { output: 2, cacheRead: 0.1, cacheWrite: 1.25 } as unknown as ModelPrice });
    expect(modelPrice(noCacheWrite)).toBeNull();
    expect(modelPrice(noInput)).toBeNull();
  });

  it('devolve null quando um campo não é um número finito válido (null, string, NaN, Infinity)', () => {
    expect(modelPrice(option({ price: { ...price(), input: null } as unknown as ModelPrice }))).toBeNull();
    expect(modelPrice(option({ price: { ...price(), output: '2' } as unknown as ModelPrice }))).toBeNull();
    expect(modelPrice(option({ price: { ...price(), cacheRead: NaN } }))).toBeNull();
    expect(modelPrice(option({ price: { ...price(), cacheWrite: Infinity } }))).toBeNull();
  });

  it('devolve null quando um campo é negativo', () => {
    expect(modelPrice(option({ price: { ...price(), input: -1 } }))).toBeNull();
  });

  it('preço com os quatro campos em zero é um preço válido, não null', () => {
    const zero = price({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(modelPrice(option({ price: zero }))).toEqual(zero);
  });

  it('devolve null quando price está ausente', () => {
    expect(modelPrice(option({}))).toBeNull();
  });
});

describe('matchModel', () => {
  it('casa o nome completo que a ferramenta devolve contra o identificador curto do catálogo', () => {
    const catalog = [option({ id: 'claude:haiku', model: 'haiku' })];
    expect(matchModel(catalog, 'claude-haiku-4-5-20251001')).toBe(catalog[0]);
  });

  it('entre dois que casam, vence o identificador mais específico (mais longo)', () => {
    const haiku = option({ id: 'claude:haiku', model: 'haiku' });
    const haikuLongo = option({ id: 'claude:haiku-4-5', model: 'claude-haiku-4-5' });
    const catalog = [haiku, haikuLongo];
    expect(matchModel(catalog, 'claude-haiku-4-5-20251001')).toBe(haikuLongo);
  });

  it('devolve null quando nenhum modelo do catálogo casa com o nome', () => {
    const catalog = [option({ id: 'claude:haiku', model: 'haiku' })];
    expect(matchModel(catalog, 'claude-opus-4-1-20250805')).toBeNull();
  });

  it('o.model vazio nunca casa, mesmo que apareça dentro de qualquer nome', () => {
    const catalog = [option({ id: 'claude:vazio', model: '' })];
    expect(matchModel(catalog, 'claude-haiku-4-5-20251001')).toBeNull();
  });
});

describe('costOf', () => {
  it('soma entrada, saída, leitura e escrita de cache pelo preço de cada campo, dividido por 1e6', () => {
    const catalog = [option({ model: 'haiku', price: price({ input: 2, output: 4, cacheRead: 1, cacheWrite: 3 }) })];
    const byModel = new Map([
      ['claude-haiku-4-5-20251001', tokens({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 100 })],
    ]);
    // conta à mão: (1000*2 + 500*4 + 2000*1 + 100*3) / 1e6 = (2000+2000+2000+300)/1e6
    expect(costOf(catalog, byModel)).toBeCloseTo(6300 / 1e6, 10);
  });

  it('byModel vazio devolve null: sem modelo não há de onde estimar', () => {
    expect(costOf([option({ price: price() })], new Map())).toBeNull();
  });

  it('um modelo sem preço completo anula a estimativa da execução inteira e devolve null', () => {
    const haiku = option({ id: 'claude:haiku', model: 'haiku', price: price() });
    const sonnetSemPreco = option({ id: 'claude:sonnet', model: 'sonnet' });
    const catalog = [haiku, sonnetSemPreco];
    const byModel = new Map([
      ['claude-haiku-4-5-20251001', tokens({ inputTokens: 100 })],
      ['claude-sonnet-4-5-20250929', tokens({ inputTokens: 100 })],
    ]);
    expect(costOf(catalog, byModel)).toBeNull();
  });

  it('preço completo em zero é um custo medido: zero, não null', () => {
    const catalog = [option({ model: 'haiku', price: price({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }) })];
    const byModel = new Map([['claude-haiku-4-5-20251001', tokens({ inputTokens: 1000, outputTokens: 1000 })]]);
    expect(costOf(catalog, byModel)).toBe(0);
  });

  it('soma o custo de dois modelos diferentes na mesma execução, cada um pelo preço dele', () => {
    const haiku = option({ id: 'claude:haiku', model: 'haiku', price: price({ input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }) });
    const sonnet = option({ id: 'claude:sonnet', model: 'sonnet', price: price({ input: 10, output: 0, cacheRead: 0, cacheWrite: 0 }) });
    const catalog = [haiku, sonnet];
    const byModel = new Map([
      ['claude-haiku-4-5-20251001', tokens({ inputTokens: 1_000_000 })],
      ['claude-sonnet-4-5-20250929', tokens({ inputTokens: 1_000_000 })],
    ]);
    // se multiplicasse o total (2 milhões de tokens) pelo preço de um único modelo, o resultado seria 2 ou 20, não 11
    expect(costOf(catalog, byModel)).toBe(1 + 10);
  });

  it('calcula o custo com os números reais medidos numa execução de prova do Claude Code', () => {
    const medidos = tokens({ inputTokens: 54, outputTokens: 1221, cacheReadTokens: 106009, cacheWriteTokens: 28908 });
    const precoEscolhido = price({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
    const catalog = [option({ model: 'sonnet', price: precoEscolhido })];
    const byModel = new Map([['claude-sonnet-4-5-20250929', medidos]]);

    // conta feita à mão, com os mesmos números e o mesmo preço:
    const esperado = (54 * 3 + 1221 * 15 + 106009 * 0.3 + 28908 * 3.75) / 1e6;
    expect(esperado).toBeCloseTo(0.1586847, 7);
    expect(costOf(catalog, byModel)).toBeCloseTo(esperado, 10);
  });
});
