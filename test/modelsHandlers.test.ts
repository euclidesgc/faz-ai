import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { ModelOption } from '../src/shared/models';
import { forgetModels, rememberModels } from '../src/extension/models';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let dbHandle: { db: any; scheduleSave: () => void; close: () => Promise<void> };

const opts = () => ({
  workspaceKey: 'ws',
  folderName: 'Projeto',
  author: 'Pessoa',
  attachmentsDir: path.join(dir, 'attachments'),
  workspaceDir: dir,
  homeDir: path.join(dir, 'home-do-usuario'),
});
/** `extra` aceita campos que o catálogo gravado por versões anteriores ainda traz (preço e origem). */
const opt = (id: string, extra: Record<string, unknown> = {}): ModelOption => {
  const [tool, model] = id.split(':') as [ModelOption['tool'], string];
  return { id, tool, model, label: model, efforts: [], defaultEffort: null, ...extra } as ModelOption;
};
const catalogJson = () => (dbHandle.db.exec('SELECT model_catalog_json FROM boards')[0]?.values[0]?.[0] as string | undefined) ?? '[]';
const seedCatalog = (catalog: ModelOption[]) => {
  // cria o board uma vez e grava o catálogo "antigo" direto no banco, como se fosse de uma versão anterior
  new MessageRouter(dbHandle as never, opts());
  dbHandle.db.run('UPDATE boards SET model_catalog_json = ?', [JSON.stringify(catalog)]);
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-models-'));
  const db = await openInMemory(WASM_DIR);
  dbHandle = { db, scheduleSave: () => {}, close: async () => {} };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const OLD_PRICE_FIELDS = {
  price: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
  priceSource: 'manual',
  priceCheckedAt: '2026-10-07',
  priceUrl: 'https://old',
  variablePrice: true,
};

describe('catálogo gravado quando o board guardava preços', () => {
  it('abrir o board tira preço, origem e preço variável de cada modelo e mantém o resto', () => {
    seedCatalog([
      opt('claude:opus', { ...OLD_PRICE_FIELDS, label: 'Meu Opus', efforts: ['low', 'high'], defaultEffort: 'low' }),
      opt('claude:haiku'),
    ]);
    const router = new MessageRouter(dbHandle as never, opts());
    const [opus, haiku] = router.snapshot().board.modelCatalog;
    expect(opus).toEqual(opt('claude:opus', { label: 'Meu Opus', efforts: ['low', 'high'], defaultEffort: 'low' }));
    expect(haiku).toEqual(opt('claude:haiku'));
  });

  it('já limpo: abrir de novo não altera o JSON gravado', () => {
    seedCatalog([opt('claude:opus', OLD_PRICE_FIELDS)]);
    new MessageRouter(dbHandle as never, opts());
    const once = catalogJson();
    expect(once).not.toContain('price');
    new MessageRouter(dbHandle as never, opts());
    expect(catalogJson()).toBe(once);
  });
});

describe('detectar e gravar o catálogo', () => {
  it('settings.models.detect preserva o preço (pricing) cadastrado; a tabela antiga continua saindo', () => {
    const pricing = { input: 3, output: 15 };
    seedCatalog([opt('claude:sonnet', { pricing, ...OLD_PRICE_FIELDS })]);
    const router = new MessageRouter(dbHandle as never, opts());
    // abrir o board só limpa a tabela antiga
    expect(router.snapshot().board.modelCatalog.find((o) => o.id === 'claude:sonnet')).toEqual(opt('claude:sonnet', { pricing }));
    router.handle({ type: 'settings.models.detect', tool: 'claude' });
    const sonnet = router.snapshot().board.modelCatalog.find((o) => o.id === 'claude:sonnet')!;
    expect(sonnet.pricing).toEqual(pricing);
    expect(JSON.stringify(sonnet)).not.toContain('"price"');
  });

  it('settings.models.detect junta os modelos da ferramenta e não traz preço nenhum', () => {
    seedCatalog([opt('claude:opus', OLD_PRICE_FIELDS)]);
    const router = new MessageRouter(dbHandle as never, opts());
    router.handle({ type: 'settings.models.detect', tool: 'claude' });
    const cat = router.snapshot().board.modelCatalog;
    expect(cat.some((o) => o.id === 'claude:sonnet')).toBe(true);
    expect(JSON.stringify(cat)).not.toContain('price');
  });

  it('com a lista lida agora da ferramenta, o modelo que ela não lista mais sai; o cadastrado à mão fica', () => {
    seedCatalog([
      opt('gemini:gemini-velho', { fromTool: true }),
      opt('gemini:meu-modelo'),
      opt('gemini:gemini-2.5-pro', { fromTool: true, label: 'Pro antigo' }),
      opt('claude:opus'),
    ]);
    const router = new MessageRouter(dbHandle as never, opts());
    rememberModels('gemini', [opt('gemini:gemini-2.5-pro', { fromTool: true, label: 'Gemini 2.5 Pro' })]);
    try {
      router.handle({ type: 'settings.models.detect', tool: 'gemini' });
    } finally {
      forgetModels('gemini');
    }
    const cat = router.snapshot().board.modelCatalog;
    expect(cat.filter((o) => o.tool === 'gemini').map((o) => [o.id, o.label])).toEqual([
      ['gemini:gemini-2.5-pro', 'Gemini 2.5 Pro'],
      ['gemini:meu-modelo', 'meu-modelo'],
    ]);
    expect(cat.some((o) => o.id === 'claude:opus')).toBe(true);
  });

  it('o modelo padrão do agente continua padrão quando o Detectar relê a lista', () => {
    seedCatalog([opt('cursor:auto', { fromTool: true, default: true }), opt('cursor:composer-2.5', { fromTool: true })]);
    const router = new MessageRouter(dbHandle as never, opts());
    rememberModels('cursor', [opt('cursor:auto', { fromTool: true }), opt('cursor:composer-2.5', { fromTool: true })]);
    try {
      router.handle({ type: 'settings.models.detect', tool: 'cursor' });
    } finally {
      forgetModels('cursor');
    }
    const cursor = router.snapshot().board.modelCatalog.filter((o) => o.tool === 'cursor');
    expect(cursor.filter((o) => o.default).map((o) => o.id)).toEqual(['cursor:auto']);
  });

  it('o modelo recusado para a conta sai do catálogo, não volta pelo Detectar e volta se a pessoa o cadastrar', () => {
    seedCatalog([opt('gemini:gemini-2.5-flash', { fromTool: true }), opt('gemini:gemini-2.5-pro', { fromTool: true })]);
    const router = new MessageRouter(dbHandle as never, opts());
    const gemini = () =>
      router
        .snapshot()
        .board.modelCatalog.filter((o) => o.tool === 'gemini')
        .map((o) => o.model);
    router.retireModel('gemini', 'gemini-2.5-flash');
    expect(gemini()).toEqual(['gemini-2.5-pro']);
    // a lista da API ainda o traz: o Detectar não o recoloca
    rememberModels('gemini', [opt('gemini:gemini-2.5-flash', { fromTool: true }), opt('gemini:gemini-2.5-pro', { fromTool: true })]);
    try {
      router.handle({ type: 'settings.models.detect', tool: 'gemini' });
      expect(gemini()).toEqual(['gemini-2.5-pro']);
      router.handle({ type: 'settings.models.set', catalog: [...router.snapshot().board.modelCatalog, opt('gemini:gemini-2.5-flash')] });
      router.handle({ type: 'settings.models.detect', tool: 'gemini' });
      expect(gemini()).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
    } finally {
      forgetModels('gemini');
    }
  });

  it('settings.models.set grava a lista como a pessoa mandou', () => {
    const router = new MessageRouter(dbHandle as never, opts());
    const sent = [opt('claude:opus'), opt('claude:haiku', { label: 'Haiku meu' })];
    router.handle({ type: 'settings.models.set', catalog: sent });
    expect(router.snapshot().board.modelCatalog).toEqual(sent);
  });
});

describe('"Sugerir regras" e as faixas de esforço de outros perfis', () => {
  const faixa = (fieldId: string, nivel: string, model: string) => ({
    id: `r-${nivel}`,
    name: `Esforço ${nivel.toLowerCase()}`,
    enabled: true,
    groups: [[{ fieldId, op: 'is' as const, value: nivel }]],
    model,
  });
  const esforco = (router: MessageRouter) => router.snapshot().fieldDefs.find((f) => f.name === 'Esforço da atividade')!.id;

  it('troca só a faixa do perfil sugerido e mantém, na frente, a de outro perfil', () => {
    const router = new MessageRouter(dbHandle as never, opts());
    router.handle({ type: 'settings.models.detect', tool: 'claude' });
    router.handle({ type: 'settings.models.detect', tool: 'kimi' });
    const f = esforco(router);
    router.handle({
      type: 'settings.modelRules.set',
      rules: [faixa(f, 'Baixo', 'kimi:kimi-k2'), faixa(f, 'Alto', 'claude:opus')],
    });
    router.handle({ type: 'settings.modelRules.suggest', tool: 'claude' });
    const rules = router.snapshot().board.modelRules;
    expect(rules[0]).toMatchObject({ id: 'r-Baixo', model: 'kimi:kimi-k2' });
    expect(rules.some((r) => r.id === 'r-Alto')).toBe(false);
    expect(rules.slice(1).map((r) => r.model.split(':')[0])).toEqual(['claude', 'claude', 'claude']);
  });

  it('sem faixas de outro perfil, o resultado é o de sempre', () => {
    const router = new MessageRouter(dbHandle as never, opts());
    router.handle({ type: 'settings.models.detect', tool: 'claude' });
    const f = esforco(router);
    router.handle({ type: 'settings.modelRules.set', rules: [faixa(f, 'Alto', 'claude:opus')] });
    router.handle({ type: 'settings.modelRules.suggest', tool: 'claude' });
    const rules = router.snapshot().board.modelRules;
    expect(rules).toHaveLength(3);
    expect(rules.some((r) => r.id === 'r-Alto')).toBe(false);
  });
});
