import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { AutoMerger, MergeWatcher, mergeWatchTargets } from '../src/extension/merge';
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
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
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

describe('MergeWatcher', () => {
  const MINUTE = 60_000;
  let now: number;
  let log: string[];
  let watcher: MergeWatcher;
  let canRun: () => boolean;
  /** o gancho do fim da rodada (a rodada de publicação, #49); por padrão não faz nada */
  let after: () => Promise<void>;
  /** quantas chamadas de `gh` já tinham acontecido a cada vez que o gancho rodou */
  let afterRuns: number[];

  const json = (pr: Record<string, unknown>) => async () => JSON.stringify(pr);
  const MERGED = json({ state: 'MERGED', mergedAt: '2026-10-04T10:00:00Z', mergeCommit: { oid: 'abc123' } });
  const CLOSED = json({ state: 'CLOSED', mergedAt: null, mergeCommit: null });
  const OPEN = json({ state: 'OPEN', mergedAt: null, mergeCommit: null });
  const prOf = (n: number) => `https://github.com/acme/app/pull/${n}`;
  const comments = (n: number) => router.snapshot().comments.filter((c) => c.cardId === card(n).id && c.author === 'Faz AI');
  const flush = () => new Promise((r) => setTimeout(r, 0));
  /** deixa a história entregue: modo autônomo, pull request registrado e status com a pessoa */
  const deliver = async (n: number, url = prOf(n)) => {
    router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
    await call('set_pull_request', { card: n, url });
    router.handle({ type: 'card.status.set', cardId: card(n).id, status: 'waiting_review' });
  };

  beforeEach(async () => {
    now = 1_000_000;
    log = [];
    canRun = () => true;
    after = async () => {};
    afterRuns = [];
    watcher = new MergeWatcher(router, {
      cwd: '/projeto',
      log: (line) => log.push(line),
      gh: (args) => {
        calls.push(args);
        return ghResult();
      },
      removeWorktree: (_dir, p) => {
        removed.push(p);
      },
      now: () => now,
      canRun: () => canRun(),
      afterRound: () => {
        afterRuns.push(calls.length);
        return after();
      },
    });
    await deliver(1);
  });

  it('consulta só as histórias entregues: uma chamada gh por alvo (RF1/RF2)', async () => {
    await call('create_card', { title: 'Entregue também', column: 'Homologação' }); // #2
    await deliver(2);
    await call('create_card', { title: 'Não autônoma', column: 'Homologação' }); // #3
    await call('set_pull_request', { card: 3, url: prOf(3) });
    router.handle({ type: 'card.status.set', cardId: card(3).id, status: 'waiting_review' });
    await call('create_card', { title: 'Bloqueada', column: 'Homologação' }); // #4
    await deliver(4);
    router.handle({ type: 'card.status.set', cardId: card(4).id, status: 'blocked', note: 'impedimento' });
    await call('create_card', { title: 'Na implementação', column: 'Implementação' }); // #5
    await deliver(5);
    await call('create_card', { title: 'Sem PR', column: 'Homologação' }); // #6
    router.handle({ type: 'card.yolo.set', cardId: card(6).id, enabled: true });
    router.handle({ type: 'card.status.set', cardId: card(6).id, status: 'waiting_review' });
    await call('create_card', { title: 'Sub-tarefa', parent: 1 }); // #7
    router.handle({ type: 'card.status.set', cardId: card(7).id, status: 'waiting_review' });

    expect(mergeWatchTargets(router.snapshot()).map((c) => c.number)).toEqual([1, 2]);
    ghResult = OPEN;
    expect(await watcher.runNow()).toBe(2);
    expect(calls).toEqual([
      ['pr', 'view', prOf(1), '--json', 'state,mergedAt,mergeCommit'],
      ['pr', 'view', prOf(2), '--json', 'state,mergedAt,mergeCommit'],
    ]);
  });

  it('mergeado: grava o commit, comenta, conclui e remove a pasta de trabalho (RF3-RF6)', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree' } } });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    ghResult = MERGED;
    await watcher.runNow();
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1)).toMatchObject({ mergeCommit: 'abc123', worktreePath: '', status: null });
    expect(removed).toEqual(['/projeto.worktrees/1-login']);
    const last = comments(1).at(-1)!;
    expect(last.body).toContain(prOf(1));
    expect(last.body).toContain('abc123');
    expect(last.body).toContain('História concluída pelo board');
    expect(log).toEqual([`[#1] Pull request ${prOf(1)} mergeado (abc123); história concluída.`]);
  });

  it('mergeado sem commit informado: conclui mesmo assim e registra o commit ausente', async () => {
    ghResult = json({ state: 'MERGED', mergedAt: null, mergeCommit: null });
    await watcher.runNow();
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1).mergeCommit).toBe('');
    expect(comments(1).at(-1)!.body).toContain('commit não informado');
  });

  it('é idempotente: rodadas seguidas e em paralelo concluem uma vez só (RF11)', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree' } } });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    ghResult = MERGED;
    await Promise.all([watcher.runNow(), watcher.runNow()]);
    await watcher.runNow();
    await watcher.runNow();
    expect(columnOf(1)).toBe('Concluído');
    expect(comments(1).filter((c) => c.body.includes('mergeado'))).toHaveLength(1);
    expect(removed).toEqual(['/projeto.worktrees/1-login']);
    expect(log.filter((l) => l.includes('mergeado'))).toHaveLength(1);
    // depois de concluída, a história sai dos alvos: nenhuma consulta nova
    expect(calls).toHaveLength(2);
  });

  it('fechado sem merge: avisa uma vez e não move nem bloqueia (RF7)', async () => {
    ghResult = CLOSED;
    await watcher.runNow();
    await watcher.runNow();
    await watcher.runNow();
    expect(calls).toHaveLength(3);
    expect(columnOf(1)).toBe('Homologação');
    expect(card(1).status).toBe('waiting_review');
    const closed = comments(1).filter((c) => c.body.includes('fechado sem merge'));
    expect(closed).toHaveLength(1);
    expect(closed[0]!.body).toBe(`Pull request ${prOf(1)} foi fechado sem merge. A história continua em Homologação.`);
    expect(log).toEqual([`[#1] Pull request ${prOf(1)} fechado sem merge; a história fica onde está.`]);
  });

  it('aberto: não faz nada (RF8)', async () => {
    ghResult = OPEN;
    const before = router.snapshot().comments.length;
    await watcher.runNow();
    await watcher.runNow();
    expect(calls).toHaveLength(2);
    expect(columnOf(1)).toBe('Homologação');
    expect(card(1).status).toBe('waiting_review');
    expect(router.snapshot().comments).toHaveLength(before);
    expect(log).toEqual([]);
  });

  it('falha do gh: nada muda e o log tem uma linha por causa (RF9/RF10)', async () => {
    await call('create_card', { title: 'Outra', column: 'Homologação' }); // #2
    await deliver(2);
    ghResult = async () => {
      throw new Error('o comando "gh" (GitHub CLI) não foi encontrado.');
    };
    for (let i = 0; i < 10; i++) await watcher.runNow();
    expect(calls).toHaveLength(20);
    expect(columnOf(1)).toBe('Homologação');
    expect(columnOf(2)).toBe('Homologação');
    expect(card(1).status).toBe('waiting_review');
    expect(card(2).status).toBe('waiting_review');
    expect(log).toEqual(['Merges: o comando "gh" (GitHub CLI) não foi encontrado.']);

    // uma consulta boa zera a memória da falha: a mesma causa volta a aparecer
    ghResult = OPEN;
    await watcher.runNow();
    ghResult = async () => {
      throw new Error('o comando "gh" (GitHub CLI) não foi encontrado.');
    };
    await watcher.runNow();
    expect(log).toHaveLength(2);

    // causa diferente: linha nova
    ghResult = async () => {
      throw new Error('HTTP 401: Bad credentials');
    };
    await watcher.runNow();
    expect(log.at(-1)).toBe('Merges: HTTP 401: Bad credentials');
    expect(log).toHaveLength(3);
  });

  it('JSON inesperado ou vazio é falha de consulta, não pull request aberto (RF9)', async () => {
    ghResult = async () => 'gh: not logged in';
    await watcher.runNow();
    ghResult = async () => '';
    await watcher.runNow();
    ghResult = json({ mergedAt: null });
    await watcher.runNow();
    expect(columnOf(1)).toBe('Homologação');
    expect(comments(1).filter((c) => c.body.includes('Pull request'))).toHaveLength(0);
    expect(log).toHaveLength(3);
    expect(log[0]).toContain('resposta inesperada do gh');
    expect(log[1]).toContain('(vazia)');
  });

  it('conclui a história mergeada mesmo com sub-tarefa em aberto e avisa na conversa (RF12)', async () => {
    expect(router.snapshot().board.rules.blockDoneWithOpenChildren).toBe(true);
    await call('create_card', { title: 'Tarefa aberta', parent: 1 }); // #2
    // o caminho normal continua recusando
    expect((await call('move_card', { card: 1, column: 'Concluído' })).error).toBe(true);
    ghResult = MERGED;
    await watcher.runNow();
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1).mergeCommit).toBe('abc123');
    expect(comments(1).at(-1)!.body).toContain('Havia 1 sub-tarefa(s) em aberto no momento do merge.');
    expect(columnOf(2)).toBe('A fazer');
    expect(log.some((l) => l.includes('mergeado'))).toBe(true);
  });

  it('sem coluna de conclusão depois da coluna do card, nada acontece (RF4)', async () => {
    const s = router.snapshot();
    const story = s.workflows.find((w) => w.id === card(1).workflowId)!;
    const col = (name: string) => s.columns.find((c) => c.workflowId === story.id && c.name === name)!;
    router.handle({ type: 'settings.column.delete', columnId: col('Cancelado').id, moveCardsTo: col('Homologação').id });
    router.handle({ type: 'settings.column.delete', columnId: col('Concluído').id, moveCardsTo: col('Homologação').id });
    expect(mergeWatchTargets(router.snapshot()).map((c) => c.number)).toEqual([1]);
    ghResult = MERGED;
    await watcher.runNow();
    expect(calls).toHaveLength(1);
    expect(columnOf(1)).toBe('Homologação');
    expect(card(1).status).toBe('waiting_review');
    expect(card(1).mergeCommit).toBe('');
    expect(comments(1).filter((c) => c.body.includes('Pull request'))).toHaveLength(0);
    expect(log).toEqual([]);
  });

  it('tick respeita o liga/desliga e o intervalo configurado (RF13/RF14)', async () => {
    ghResult = OPEN;
    router.handle({ type: 'settings.board.update', patch: { git: { watchMerges: false, watchMergeMinutes: 15 } } });
    now += 60 * MINUTE;
    watcher.tick();
    await flush();
    expect(calls).toEqual([]);

    // desligado, o relógio não anda: ao religar com o intervalo vencido, a rodada acontece
    router.handle({ type: 'settings.board.update', patch: { git: { watchMerges: true } } });
    watcher.tick();
    await flush();
    expect(calls).toHaveLength(1);

    // a rodada zera a contagem: o tick seguinte espera outro intervalo inteiro
    now += 14 * MINUTE;
    watcher.tick();
    await flush();
    expect(calls).toHaveLength(1);

    now += MINUTE;
    watcher.tick();
    await flush();
    expect(calls).toHaveLength(2);
  });

  it('a primeira rodada acontece um intervalo depois de abrir o board, não na abertura', async () => {
    ghResult = OPEN;
    watcher.tick();
    await flush();
    expect(calls).toEqual([]);
    now += 15 * MINUTE;
    watcher.tick();
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('só a janela dona do board consulta (RF15)', async () => {
    ghResult = OPEN;
    canRun = () => false;
    now += 60 * MINUTE;
    watcher.tick();
    await flush();
    expect(calls).toEqual([]);
    canRun = () => true;
    watcher.tick();
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('nunca bloqueia nem deixa um erro escapar do tick', async () => {
    ghResult = async () => {
      throw new Error('sem rede');
    };
    now += 60 * MINUTE;
    expect(() => watcher.tick()).not.toThrow();
    await flush();
    expect(card(1).status).toBe('waiting_review');
    expect(log).toEqual(['Merges: sem rede']);
  });

  it('o gancho do fim da rodada roda uma vez, depois do último pull request consultado', async () => {
    await call('create_card', { title: 'Entregue também', column: 'Homologação' }); // #2
    await deliver(2);
    ghResult = OPEN;
    await watcher.runNow();
    expect(calls).toEqual([
      ['pr', 'view', prOf(1), '--json', 'state,mergedAt,mergeCommit'],
      ['pr', 'view', prOf(2), '--json', 'state,mergedAt,mergeCommit'],
    ]);
    // uma vez só, e com as duas consultas já feitas: o gancho vem depois do laço de merges
    expect(afterRuns).toEqual([2]);
  });

  it('um erro do gancho não escapa da rodada e não trava a rodada seguinte', async () => {
    ghResult = OPEN;
    after = async () => {
      throw new Error('falha do gancho');
    };
    await expect(watcher.runNow()).resolves.toBe(1);
    expect(log).toEqual([]);

    // o `busy` voltou a false: o tick seguinte, com o intervalo vencido, faz outra rodada
    now += 60 * MINUTE;
    expect(() => watcher.tick()).not.toThrow();
    await flush();
    expect(afterRuns).toHaveLength(2);
  });
});
