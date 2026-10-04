import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { parseReleases, publishedVersion, publishWatchTargets } from '../src/extension/release';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* texto simples */
  }
  return { error: res.isError === true, text, data };
};
const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
/** história concluída com commit de merge guardado: o candidato típico da rodada */
const merged = async (n: number, commit = `sha${n}`) => {
  router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
  router.handle({ type: 'card.merge.set', cardId: card(n).id, commit });
  router.handle({ type: 'card.move', cardId: card(n).id, columnId: columnId(n, 'Concluído'), position: 0, allowOpenChildren: true });
};
const columnId = (n: number, name: string) =>
  router.snapshot().columns.find((c) => c.workflowId === card(n).workflowId && c.name === name)!.id;
const targets = () => publishWatchTargets(router.snapshot()).map((c) => c.number);

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-release'),
  });
  const server = createMcpServer({ getRouter: async () => router, workspaceDir: os.tmpdir(), version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
});

describe('publishWatchTargets: quem é candidato a arquivamento (RF2/RF3)', () => {
  it('a história concluída com commit de merge guardado entra', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    expect(targets()).toEqual([1]);
  });

  it('a história concluída sem commit de merge não entra (RF3)', async () => {
    await call('create_card', { title: 'Sem commit', column: 'Homologação' }); // #1
    await merged(1, '');
    expect(card(1).mergeCommit).toBe('');
    expect(targets()).toEqual([]);
  });

  it('a história com commit numa coluna de categoria "open" não entra', async () => {
    await call('create_card', { title: 'Em homologação', column: 'Homologação' }); // #1
    router.handle({ type: 'card.merge.set', cardId: card(1).id, commit: 'sha1' });
    expect(targets()).toEqual([]);
  });

  it('a história numa coluna de categoria "cancelled" não entra', async () => {
    await call('create_card', { title: 'Cancelada', column: 'Homologação' }); // #1
    router.handle({ type: 'card.merge.set', cardId: card(1).id, commit: 'sha1' });
    router.handle({ type: 'card.move', cardId: card(1).id, columnId: columnId(1, 'Cancelado'), position: 0 });
    expect(targets()).toEqual([]);
  });

  it('a sub-tarefa concluída nunca é candidata, mesmo com commit', async () => {
    await call('create_card', { title: 'História', column: 'Homologação' }); // #1
    await call('create_card', { title: 'Sub-tarefa', parent: 1 }); // #2
    router.handle({ type: 'card.merge.set', cardId: card(2).id, commit: 'sha2' });
    router.handle({ type: 'card.move', cardId: card(2).id, columnId: columnId(2, 'Concluído'), position: 0 });
    await merged(1);
    expect(targets()).toEqual([1]);
  });

  it('a história já arquivada não volta a ser avaliada (RF10)', async () => {
    await call('create_card', { title: 'Arquivada', column: 'Homologação' }); // #1
    await merged(1);
    router.handle({ type: 'card.archive', cardId: card(1).id });
    expect(targets()).toEqual([]);
  });

  it('a história na lixeira não entra', async () => {
    await call('create_card', { title: 'Na lixeira', column: 'Homologação' }); // #1
    await merged(1);
    router.handle({ type: 'card.trash', cardId: card(1).id });
    expect(targets()).toEqual([]);
  });
});

describe('parseReleases: as releases publicadas do repositório (RF4/RF5)', () => {
  const out = (items: unknown) => JSON.stringify(items);
  const release = (tagName: string, publishedAt: string | null, extra: Record<string, unknown> = {}) => ({
    tagName,
    publishedAt,
    isDraft: false,
    isPrerelease: false,
    ...extra,
  });

  it('descarta release em rascunho (RF4)', () => {
    const list = parseReleases(
      out([release('v1.0.0', '2026-01-01T00:00:00Z', { isDraft: true }), release('v1.1.0', '2026-02-01T00:00:00Z')]),
    );
    expect(list.map((r) => r.tag)).toEqual(['v1.1.0']);
  });

  it('mantém release de pré-lançamento (RF4)', () => {
    const list = parseReleases(out([release('v1.0.0-rc.1', '2026-01-01T00:00:00Z', { isPrerelease: true })]));
    expect(list.map((r) => r.tag)).toEqual(['v1.0.0-rc.1']);
  });

  it('descarta item sem data de publicação utilizável (RF4)', () => {
    const list = parseReleases(out([release('v1.0.0', null), release('v1.1.0', 'não é data'), release('v1.2.0', '2026-02-01T00:00:00Z')]));
    expect(list.map((r) => r.tag)).toEqual(['v1.2.0']);
  });

  it('devolve lista vazia para um array vazio: é resposta válida, não falha', () => {
    expect(parseReleases('[]')).toEqual([]);
  });

  it('ordena da publicação mais antiga para a mais nova, não pela ordem da entrada (RF5)', () => {
    const list = parseReleases(
      out([
        release('v0.10.0', '2026-03-01T00:00:00Z'),
        release('v0.9.0', '2026-01-01T00:00:00Z'),
        release('v0.11.0', '2026-05-01T00:00:00Z'),
      ]),
    );
    expect(list.map((r) => r.tag)).toEqual(['v0.9.0', 'v0.10.0', 'v0.11.0']);
  });

  it('lança para JSON inválido, raiz que não é array e item fora do formato (RF13)', () => {
    expect(() => parseReleases('gh: not logged in')).toThrow(/resposta inesperada do gh: gh: not logged in/);
    expect(() => parseReleases('{"tagName":"v1.0.0"}')).toThrow(/resposta inesperada do gh/);
    expect(() => parseReleases(out([{ publishedAt: '2026-01-01T00:00:00Z' }]))).toThrow(/resposta inesperada do gh/);
  });

  it('lança para saída vazia, dizendo que estava vazia (RF13)', () => {
    expect(() => parseReleases('')).toThrow('resposta inesperada do gh: (vazia)');
    expect(() => parseReleases('   ')).toThrow('resposta inesperada do gh: (vazia)');
  });
});

describe('publishedVersion: qual versão levou a história (RF5)', () => {
  const releases = [
    { tag: 'v0.9.0', publishedAt: Date.parse('2026-01-01T00:00:00Z') },
    { tag: 'v0.10.0', publishedAt: Date.parse('2026-03-01T00:00:00Z') },
  ];

  it('devolve a de publicação mais antiga, mesmo com a ordem de texto pondo a outra primeiro (RF5)', () => {
    expect(publishedVersion(releases, ['v0.10.0', 'v0.9.0'])).toBe('v0.9.0');
    expect(publishedVersion(releases, ['v0.9.0', 'v0.10.0'])).toBe('v0.9.0');
  });

  it('devolve a única que casa quando só uma das tags tem release publicada (RF4)', () => {
    expect(publishedVersion(releases, ['v0.10.0', 'v1.0.0'])).toBe('v0.10.0');
  });

  it('devolve null quando nenhuma tag do commit tem release publicada (RF4)', () => {
    expect(publishedVersion(releases, ['v1.0.0', 'v2.0.0'])).toBeNull();
  });

  it('devolve null sem releases e sem tags', () => {
    expect(publishedVersion([], ['v0.9.0'])).toBeNull();
    expect(publishedVersion(releases, [])).toBeNull();
  });
});
