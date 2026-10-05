import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { parseReleases, publishedVersion, publishWatchTargets, ReleaseWatcher } from '../src/extension/release';
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

describe('ReleaseWatcher: a rodada que comenta a versão e arquiva o card', () => {
  const RELEASE_LIST = ['release', 'list', '--limit', '100', '--json', 'tagName,isDraft,isPrerelease,publishedAt'];
  const FETCH = ['fetch', '--tags'];
  const URL = 'https://github.com/acme/app/releases/tag/v0.32.0';

  let watcher: ReleaseWatcher;
  let calls: string[][];
  let ops: string[];
  let log: string[];
  /** o que o `gh release list` devolve; por padrão uma release publicada da v0.32.0 */
  let releases: Record<string, unknown>[];
  /** saída crua do `gh release list`, quando o teste quer passar por cima do JSON */
  let rawList: string | null;
  /** as tags que contêm o commit, por sha */
  let tagsOf: (sha: string) => string[];
  /** ganchos para simular falha de cada comando */
  let failFetch: string | null;
  let failList: string | null;
  let failTags: string | null;
  let failView: string | null;
  /** commits que existem neste clone; `null` = todos */
  let knownCommits: string[] | null;
  /** faz o `card.archive` falhar */
  let failArchive: string | null;

  const release = (tagName: string, publishedAt: string, extra: Record<string, unknown> = {}) => ({
    tagName,
    publishedAt,
    isDraft: false,
    isPrerelease: false,
    ...extra,
  });
  const comments = (n: number) => router.snapshot().comments.filter((c) => c.cardId === card(n).id);
  const versionComments = (n: number) => comments(n).filter((c) => c.body.includes('saiu na versão'));
  const columnName = (n: number) => router.snapshot().columns.find((c) => c.id === card(n).columnId)!.name;
  const archived = (n: number) => card(n).archivedAt !== null;

  beforeEach(async () => {
    calls = [];
    ops = [];
    log = [];
    releases = [release('v0.32.0', '2026-03-01T00:00:00Z')];
    rawList = null;
    tagsOf = () => ['v0.32.0'];
    failFetch = failList = failTags = failView = failArchive = null;
    knownCommits = null;

    // o router de verdade, com um espião: a ordem das operações é o que o RF8 exige verificar
    const handle = router.handle.bind(router);
    (router as any).handle = (msg: any, meta?: any) => {
      ops.push(msg.type);
      if (msg.type === 'card.archive' && failArchive) throw new Error(failArchive);
      return handle(msg, meta);
    };

    watcher = new ReleaseWatcher(router, {
      cwd: '/projeto',
      log: (line) => log.push(line),
      gh: async (args) => {
        calls.push(['gh', ...args]);
        if (args[1] === 'list') {
          if (failList) throw new Error(failList);
          return rawList ?? JSON.stringify(releases);
        }
        if (failView) throw new Error(failView);
        return JSON.stringify({ url: URL });
      },
      git: async (args) => {
        calls.push(['git', ...args]);
        if (args[0] === 'fetch') {
          if (failFetch) throw new Error(failFetch);
          return '';
        }
        if (args[0] === 'rev-parse') {
          const sha = args[3]!.replace('^{commit}', '');
          if (knownCommits && !knownCommits.includes(sha)) throw new Error('fatal: malformed object name');
          return `${sha}\n`;
        }
        if (failTags) throw new Error(failTags);
        return `${tagsOf(args[2]!).join('\n')}\n`;
      },
    });
  });

  it('sem candidato: nenhuma chamada de git nem de gh (RF11/RF12)', async () => {
    await call('create_card', { title: 'Em homologação', column: 'Homologação' }); // #1
    router.handle({ type: 'card.merge.set', cardId: card(1).id, commit: 'sha1' });
    await watcher.sweep();
    expect(calls).toEqual([]);
    expect(log).toEqual([]);
  });

  it('caminho feliz: comenta com a tag e o link, arquiva e leva as sub-tarefas (RF6/RF9)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await call('create_card', { title: 'Sub-tarefa', parent: 1 }); // #2
    await merged(1, '9cf7766aaaa');
    await watcher.sweep();

    expect(calls).toEqual([
      ['git', ...FETCH],
      ['gh', ...RELEASE_LIST],
      ['git', 'rev-parse', '--verify', '--quiet', '9cf7766aaaa^{commit}'],
      ['git', 'tag', '--contains', '9cf7766aaaa'],
      ['gh', 'release', 'view', 'v0.32.0', '--json', 'url'],
    ]);
    const body = versionComments(1).at(-1)!.body;
    expect(body).toContain('saiu na versão v0.32.0');
    expect(body).toContain(URL);
    expect(body).toContain('9cf7766');
    expect(versionComments(1).at(-1)!.author).toBe('Faz AI');
    expect(archived(1)).toBe(true);
    expect(archived(2)).toBe(true);
    expect(log).toEqual(['[#1] Publicada na v0.32.0; card arquivado.']);
  });

  it('o comentário é gravado antes do arquivamento (RF8)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    ops = [];
    await watcher.sweep();
    expect(ops.filter((o) => o === 'comment.add' || o === 'card.archive')).toEqual(['comment.add', 'card.archive']);
  });

  it('arquivamento que falha deixa o card visível com o comentário, e a rodada seguinte não repete o comentário (RF8/RF10)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    failArchive = 'banco em uso';
    await watcher.sweep();
    expect(archived(1)).toBe(false);
    expect(columnName(1)).toBe('Concluído');
    expect(versionComments(1)).toHaveLength(1);
    expect(log).toEqual(['Publicações: [#1] banco em uso']);

    // a rodada seguinte consegue arquivar e não comenta de novo
    failArchive = null;
    await watcher.sweep();
    expect(archived(1)).toBe(true);
    expect(versionComments(1)).toHaveLength(1);
  });

  it('duas rodadas seguidas depois da publicação: exatamente um comentário de versão (RF10)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    await watcher.sweep();
    await watcher.sweep();
    expect(versionComments(1)).toHaveLength(1);
    // arquivada, ela sai dos candidatos: a segunda rodada não faz chamada nenhuma
    expect(calls.filter((c) => c[1] === 'release' && c[2] === 'list')).toHaveLength(1);
  });

  it('tag sem release publicada não arquiva; rascunho não arquiva; pré-lançamento arquiva (RF4)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    tagsOf = () => ['v1.0.0'];
    await watcher.sweep();
    expect(archived(1)).toBe(false);

    tagsOf = () => ['v0.33.0'];
    releases = [release('v0.33.0', '2026-04-01T00:00:00Z', { isDraft: true })];
    await watcher.sweep();
    expect(archived(1)).toBe(false);

    releases = [release('v0.33.0', '2026-04-01T00:00:00Z', { isPrerelease: true })];
    await watcher.sweep();
    expect(archived(1)).toBe(true);
    expect(versionComments(1).at(-1)!.body).toContain('v0.33.0');
    expect(log).toEqual(['[#1] Publicada na v0.33.0; card arquivado.']);
  });

  it('entre duas tags que contêm o commit, a de publicação mais antiga (RF5)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    releases = [release('v0.10.0', '2026-03-01T00:00:00Z'), release('v0.9.0', '2026-01-01T00:00:00Z')];
    // a ordem do `git tag --contains` é alfabética: põe v0.10.0 antes de v0.9.0
    tagsOf = () => ['v0.10.0', 'v0.9.0'];
    await watcher.sweep();
    expect(versionComments(1).at(-1)!.body).toContain('saiu na versão v0.9.0');
    expect(log).toEqual(['[#1] Publicada na v0.9.0; card arquivado.']);
  });

  it('cinco candidatos: um único gh release list e um git tag --contains por candidato (RF12)', async () => {
    for (let n = 1; n <= 5; n++) {
      await call('create_card', { title: `Publicada ${n}`, column: 'Homologação' });
      await merged(n);
    }
    await watcher.sweep();
    expect(calls.filter((c) => c[1] === 'release' && c[2] === 'list')).toHaveLength(1);
    expect(calls.filter((c) => c[1] === 'tag')).toHaveLength(5);
    // o link da release é memorizado por tag: uma consulta, não cinco
    expect(calls.filter((c) => c[2] === 'view')).toHaveLength(1);
    expect([1, 2, 3, 4, 5].every((n) => archived(n))).toBe(true);
  });

  it('o fetch não usa --force: tag local reescrita não é sobrescrita', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    await watcher.sweep();
    const fetch = calls.find((c) => c[1] === 'fetch')!;
    expect(fetch).not.toContain('--force');
    expect(fetch).not.toContain('-f');
  });

  it('o comentário de versão leva um marcador próprio, invisível na tela', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    await watcher.sweep();
    expect(comments(1).filter((c) => c.body.includes('<!-- faz-ai:saiu-na-versao -->'))).toHaveLength(1);
  });

  it('comentário antigo, só com a frase (sem marcador), conta como já comentado', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    router.handle(
      { type: 'comment.add', cardId: card(1).id, body: 'Esta história saiu na versão v0.32.0. Card arquivado pelo board.' },
      { author: 'Faz AI', source: 'ai' },
    );
    await watcher.sweep();
    expect(comments(1).filter((c) => c.body.includes('saiu na versão'))).toHaveLength(1);
    expect(archived(1)).toBe(true);
  });

  it('git fetch --tags falhando: a avaliação segue pelas tags locais (RF11)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    failFetch = 'fatal: unable to access remote';
    await watcher.sweep();
    expect(archived(1)).toBe(true);
    expect(log).toEqual(['Publicações: fatal: unable to access remote', '[#1] Publicada na v0.32.0; card arquivado.']);
  });

  it('gh ausente, JSON inesperado e saída vazia: nenhum card muda e nenhum status muda (RF13)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    const status = card(1).status;
    failList = 'o comando "gh" (GitHub CLI) não foi encontrado.';
    await watcher.sweep();
    failList = null;
    releases = [{ nada: true }] as never;
    await watcher.sweep();
    rawList = '';
    await watcher.sweep();

    expect(archived(1)).toBe(false);
    expect(columnName(1)).toBe('Concluído');
    expect(card(1).status).toBe(status);
    expect(versionComments(1)).toHaveLength(0);
    expect(log).toEqual([
      'Publicações: o comando "gh" (GitHub CLI) não foi encontrado.',
      'Publicações: resposta inesperada do gh: [{"nada":true}]',
      'Publicações: resposta inesperada do gh: (vazia)',
    ]);
  });

  it('log sem repetição: a mesma causa em dez candidatos e três rodadas aparece uma vez; causa nova aparece (RF14)', async () => {
    for (let n = 1; n <= 10; n++) {
      await call('create_card', { title: `Publicada ${n}`, column: 'Homologação' });
      await merged(n);
    }
    failTags = 'fatal: bad object';
    await watcher.sweep();
    await watcher.sweep();
    await watcher.sweep();
    // uma linha só: o que se compara é a causa, não a linha com o número do card
    expect(log).toHaveLength(1);
    expect(log[0]).toContain('fatal: bad object');
    expect(log[0]).toMatch(/^Publicações: \[#\d+\] /);

    failTags = 'error: index.lock exists';
    await watcher.sweep();
    expect(log).toHaveLength(2);
    expect(log[1]).toContain('error: index.lock exists');
  });

  it('commit que este clone não conhece: nada acontece e nada vai para o log (RF11/RF13)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1, 'desconhecido');
    knownCommits = [];
    await watcher.sweep();
    expect(archived(1)).toBe(false);
    expect(log).toEqual([]);
    // o `--contains` nem é tentado: ele falharia com "malformed object name" e pareceria defeito
    expect(calls.filter((c) => c[1] === 'tag')).toEqual([]);
  });

  it('gh release view falhando: comentário só com a tag e arquivamento feito (RF7)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    failView = 'release not found';
    await watcher.sweep();
    const body = versionComments(1).at(-1)!.body;
    expect(body).toContain('saiu na versão v0.32.0.');
    expect(body).not.toContain('http');
    expect(archived(1)).toBe(true);
    expect(log).toEqual(['[#1] Publicada na v0.32.0; card arquivado.']);
  });

  it('arquiva sem pendência nem diálogo, mesmo com sub-tarefa em aberto e confirmação sempre ligada (RF15)', async () => {
    router.handle({ type: 'settings.rules.update', patch: { confirmArchive: 'always' } });
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await call('create_card', { title: 'Sub-tarefa aberta', parent: 1 }); // #2
    await merged(1);
    expect(router.snapshot().board.rules.confirmArchive).toBe('always');
    await watcher.sweep();
    expect(archived(1)).toBe(true);
    expect(archived(2)).toBe(true);
  });

  it('nada escapa do sweep, nem com o router quebrado (RF13)', async () => {
    await call('create_card', { title: 'Publicada', column: 'Homologação' }); // #1
    await merged(1);
    (router as any).handle = () => {
      throw new Error('router quebrado');
    };
    await expect(watcher.sweep()).resolves.toBeUndefined();
    expect(log).toEqual(['Publicações: [#1] router quebrado']);
  });
});
