import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { ModelOption } from '../src/shared/models';

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
  it('settings.models.detect junta os modelos da ferramenta e não traz preço nenhum', () => {
    seedCatalog([opt('claude:opus', OLD_PRICE_FIELDS)]);
    const router = new MessageRouter(dbHandle as never, opts());
    router.handle({ type: 'settings.models.detect', tool: 'claude' });
    const cat = router.snapshot().board.modelCatalog;
    expect(cat.some((o) => o.id === 'claude:sonnet')).toBe(true);
    expect(JSON.stringify(cat)).not.toContain('price');
  });

  it('settings.models.set grava a lista como a pessoa mandou', () => {
    const router = new MessageRouter(dbHandle as never, opts());
    const sent = [opt('claude:opus'), opt('claude:haiku', { label: 'Haiku meu' })];
    router.handle({ type: 'settings.models.set', catalog: sent });
    expect(router.snapshot().board.modelCatalog).toEqual(sent);
  });
});
