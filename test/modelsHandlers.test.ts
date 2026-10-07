import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { builtinPrice } from '../src/shared/prices';
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
const opt = (id: string, extra: Partial<ModelOption> = {}): ModelOption => {
  const [tool, model] = id.split(':') as [ModelOption['tool'], string];
  return { id, tool, model, label: model, efforts: [], defaultEffort: null, ...extra };
};
const TABLE = builtinPrice('claude:opus')!;
const quatro = { input: TABLE.input, output: TABLE.output, cacheRead: TABLE.cacheRead, cacheWrite: TABLE.cacheWrite };
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

describe('sincronização da tabela embutida ao abrir o board', () => {
  it('atualiza o builtin antigo, preserva o manual e preenche o modelo sem preço (RF-06, RF-08, RF-09)', () => {
    seedCatalog([
      opt('claude:opus', {
        price: { ...quatro, input: quatro.input + 7 },
        priceSource: 'builtin',
        priceCheckedAt: '2020-01-01',
        priceUrl: 'https://old',
      }),
      opt('claude:sonnet', { price: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }, priceSource: 'manual' }),
      opt('claude:haiku'),
    ]);
    const router = new MessageRouter(dbHandle as never, opts());
    const [opus, sonnet, haiku] = router.snapshot().board.modelCatalog;
    expect(opus).toMatchObject({ price: quatro, priceSource: 'builtin', priceCheckedAt: TABLE.checkedAt, priceUrl: TABLE.url });
    expect(sonnet).toEqual(opt('claude:sonnet', { price: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }, priceSource: 'manual' }));
    const h = builtinPrice('claude:haiku')!;
    expect(haiku).toMatchObject({ priceSource: 'builtin', priceCheckedAt: h.checkedAt, priceUrl: h.url });
    expect(haiku!.price).toEqual({ input: h.input, output: h.output, cacheRead: h.cacheRead, cacheWrite: h.cacheWrite });
  });

  it('catálogo já sincronizado: abrir de novo não altera o JSON gravado', () => {
    seedCatalog([opt('claude:opus'), opt('claude:sonnet', { price: { input: 1 } })]);
    new MessageRouter(dbHandle as never, opts());
    const once = catalogJson();
    expect(JSON.parse(once)[0].priceSource).toBe('builtin');
    new MessageRouter(dbHandle as never, opts());
    expect(catalogJson()).toBe(once);
  });

  it('catálogo antigo com price e sem priceSource continua sem priceSource (RF-07)', () => {
    seedCatalog([opt('claude:opus', { price: quatro })]);
    const router = new MessageRouter(dbHandle as never, opts());
    const [opus] = router.snapshot().board.modelCatalog;
    expect(opus!.price).toEqual(quatro);
    expect(opus!.priceSource).toBeUndefined();
    expect(opus!.priceCheckedAt).toBeUndefined();
  });
});

describe('detectar e gravar o catálogo', () => {
  it('settings.models.detect preserva preço e origem manual e preenche os novos com embutido', () => {
    seedCatalog([
      opt('claude:opus', { price: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }, priceSource: 'manual', label: 'Meu Opus' }),
    ]);
    const router = new MessageRouter(dbHandle as never, opts());
    router.handle({ type: 'settings.models.detect', tool: 'claude' });
    const cat = router.snapshot().board.modelCatalog;
    expect(cat.find((o) => o.id === 'claude:opus')).toMatchObject({
      price: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
      priceSource: 'manual',
    });
    expect(cat.find((o) => o.id === 'claude:opus')!.priceCheckedAt).toBeUndefined();
    expect(cat.find((o) => o.id === 'claude:sonnet')).toMatchObject({ priceSource: 'builtin', priceUrl: TABLE.url });
    // o detectar também mantém a origem embutida de quem já estava sincronizado
    router.handle({ type: 'settings.models.detect', tool: 'claude' });
    expect(router.snapshot().board.modelCatalog.find((o) => o.id === 'claude:sonnet')).toMatchObject({ priceSource: 'builtin' });
  });

  it('settings.models.set aplica a tabela a quem está sem preço e não toca no manual', () => {
    const router = new MessageRouter(dbHandle as never, opts());
    router.handle({
      type: 'settings.models.set',
      catalog: [
        opt('claude:opus'),
        opt('claude:haiku', { price: { input: 9, output: 9, cacheRead: 9, cacheWrite: 9 }, priceSource: 'manual' }),
      ],
    });
    const [opus, haiku] = router.snapshot().board.modelCatalog;
    expect(opus).toMatchObject({ price: quatro, priceSource: 'builtin' });
    expect(haiku).toMatchObject({ price: { input: 9, output: 9, cacheRead: 9, cacheWrite: 9 }, priceSource: 'manual' });
  });
});
