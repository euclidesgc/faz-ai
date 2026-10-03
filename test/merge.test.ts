import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { AutoMerger } from '../src/extension/merge';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const PR = 'https://github.com/acme/app/pull/7';

let router: MessageRouter;
let client: Client;
let calls: string[][];
let removed: string[];
let ghResult: () => Promise<string>;
let merger: AutoMerger;

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
const columnOf = (n: number) => router.snapshot().columns.find((c) => c.id === card(n).columnId)!.name;
/** aprova como pessoa e espera o merge terminar */
const approve = async (n: number) => {
  router.handle({ type: 'card.status.set', cardId: card(n).id, status: 'approved' });
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-merge'),
  });
  const server = createMcpServer({ getRouter: async () => router, workspaceDir: os.tmpdir(), version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
  calls = [];
  removed = [];
  ghResult = async () => '';
  merger = new AutoMerger(router, {
    cwd: '/projeto',
    log: () => {},
    gh: (args) => {
      calls.push(args);
      return ghResult();
    },
    removeWorktree: (_dir, p) => {
      removed.push(p);
    },
  });
  await call('create_card', { title: 'Login', column: 'Homologação' });
});

describe('pull request e merge na homologação', () => {
  it('registra o PR na história, inclusive a partir da sub-tarefa', async () => {
    expect((await call('set_pull_request', { card: 1, url: 'não é url' })).error).toBe(true);
    await call('create_card', { title: 'Tarefa', parent: 1 });
    expect((await call('set_pull_request', { card: 2, url: PR })).data).toEqual({ pullRequest: PR });
    expect(card(1).prUrl).toBe(PR);
    expect(card(2).prUrl).toBe('');
    expect((await call('get_card', { card: 1 })).data.phase.instruction).toContain('set_pull_request');
  });

  it('desligado (padrão): aprovar só marca o card, e a IA o move', async () => {
    await call('set_pull_request', { card: 1, url: PR });
    await approve(1);
    expect(calls).toEqual([]);
    expect(card(1).status).toBe('approved');
    expect((await call('move_card', { card: 1, column: 'Concluído' })).error).toBe(false);
  });

  it('ligado: aprovar faz o merge, conclui o card e remove a pasta de trabalho', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { autoMerge: true, mergeMethod: 'rebase' } } });
    await call('set_pull_request', { card: 1, url: PR });
    router.handle({ type: 'card.workspace.clear', cardId: card(1).id });
    (router as any).cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    await approve(1);
    expect(calls).toEqual([['pr', 'merge', PR, '--rebase']]);
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1)).toMatchObject({ status: null, branch: 'historia/1-login', worktreePath: '' });
    expect(removed).toEqual(['/projeto.worktrees/1-login']);
    expect(router.snapshot().comments.at(-1)).toMatchObject({ author: 'Faz AI', body: `Merge de ${PR} feito.` });
  });

  it('merge que falha bloqueia o card, que continua na homologação', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { autoMerge: true } } });
    await call('set_pull_request', { card: 1, url: PR });
    ghResult = async () => {
      throw new Error('Pull request is not mergeable: the merge commit cannot be cleanly created.');
    };
    await approve(1);
    expect(calls).toEqual([['pr', 'merge', PR, '--squash']]);
    expect(columnOf(1)).toBe('Homologação');
    expect(card(1).status).toBe('blocked');
    expect(card(1).statusReason).toContain('not mergeable');

    // depois de resolver, aprovar de novo tenta outra vez
    ghResult = async () => '';
    await approve(1);
    expect(columnOf(1)).toBe('Concluído');
  });

  it('não faz merge sem PR, fora da última coluna, nem com sub-tarefas em aberto', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { autoMerge: true } } });
    await approve(1); // sem PR registrado
    expect(calls).toEqual([]);
    expect(card(1).status).toBe('approved');

    await call('create_card', { title: 'No Plan', column: 'Plan' }); // #2
    await call('set_pull_request', { card: 2, url: PR });
    await approve(2);
    expect(calls).toEqual([]);

    await call('set_pull_request', { card: 1, url: PR });
    await call('create_card', { title: 'Tarefa aberta', parent: 1 });
    await approve(1);
    expect(calls).toEqual([]);
    expect(card(1).statusReason).toContain('sub-tarefa(s) da história ainda em aberto');
    expect(merger).toBeDefined();
  });
});
