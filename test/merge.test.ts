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
/** as chamadas ao `git` assíncrono (a limpeza, #464) */
let gitCalls: string[][];
let removed: string[];
let ghResult: () => Promise<string>;
/** o `git` falso: responde pelos argumentos; por padrão, um repositório sem origin e sem a branch */
let gitResult: (args: string[], cwd: string) => Promise<string>;
let merger: AutoMerger;
const noGit = async (args: string[]) => {
  if (args[0] === 'rev-parse' || args[0] === 'remote') throw new Error('fatal: não existe');
  return '';
};

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
  const server = createMcpServer({
    getRouter: async () => router,
    getRunner: async () => undefined,
    workspaceDir: os.tmpdir(),
    version: 'test',
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
  calls = [];
  gitCalls = [];
  removed = [];
  ghResult = async () => '';
  gitResult = noGit;
  merger = new AutoMerger(router, {
    cwd: '/projeto',
    log: () => {},
    gh: (args) => {
      calls.push(args);
      return ghResult();
    },
    git: (args, cwd) => {
      gitCalls.push(args);
      return gitResult(args, cwd);
    },
    removeWorktree: (_dir, p) => {
      removed.push(p);
    },
  });
  // o gitflow vem ligado por padrão (#462); os cenários de antes da limpeza (#464) rodam sem ele
  router.handle({ type: 'settings.board.update', patch: { git: { gitflow: false } } });
  await call('create_card', { title: 'Login', column: 'Homologação' });
});

/** o `gh pr view` do pull request `url` mergeado a partir de `branch` (os campos da limpeza) */
const mergedView = (url: string, branch: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    state: 'MERGED',
    mergedAt: '2026-10-13T10:00:00Z',
    mergeCommit: { oid: 'abc123' },
    baseRefName: 'develop',
    headRefName: branch,
    headRefOid: 'feed01',
    ...over,
  });
const cleanupComments = (n: number) =>
  router.snapshot().comments.filter((c) => c.cardId === card(n).id && c.body.startsWith('Limpeza da história depois do merge:'));

describe('pull request e merge na homologação', () => {
  it('registra o PR na história, inclusive a partir da sub-tarefa', async () => {
    expect((await call('set_pull_request', { card: 1, url: 'não é url' })).error).toBe(true);
    await call('create_card', { title: 'Tarefa', parent: 1 });
    expect((await call('set_pull_request', { card: 2, url: PR })).data).toEqual({ pullRequest: PR });
    expect(card(1).prUrl).toBe(PR);
    expect(card(2).prUrl).toBe('');
    expect((await call('get_card', { card: 1 })).data.phase.instruction).toContain('set_pull_request');
  });

  it('desligado (padrão): aprovar não faz merge, e o board leva o card a Concluído (#441)', async () => {
    await call('set_pull_request', { card: 1, url: PR });
    await approve(1);
    expect(calls).toEqual([]);
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1).status).toBeNull();
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
    expect(gitCalls).toEqual([]);
  });

  it('gitflow desligado: só remove a worktree, branches continuam, sem comentário de limpeza', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { autoMerge: true, mode: 'worktree', gitflow: false } } });
    await call('set_pull_request', { card: 1, url: PR });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    await approve(1);
    // nenhum `pr view` e nenhum git: o board não toca nas branches
    expect(calls).toEqual([['pr', 'merge', PR, '--squash']]);
    expect(gitCalls).toEqual([]);
    expect(removed).toEqual(['/projeto.worktrees/1-login']);
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1)).toMatchObject({ branch: 'historia/1-login', worktreePath: '' });
    expect(cleanupComments(1)).toHaveLength(0);
  });

  it('gitflow ligado: consulta o pull request antes do merge e limpa depois dele', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { autoMerge: true, mode: 'worktree', gitflow: true } } });
    await call('set_pull_request', { card: 1, url: PR });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    ghResult = async () => (calls.at(-1)![1] === 'view' ? mergedView(PR, 'historia/1-login') : '');
    await approve(1);
    expect(calls).toEqual([
      ['pr', 'view', PR, '--json', 'state,mergedAt,mergeCommit,baseRefName,headRefName,headRefOid'],
      ['pr', 'merge', PR, '--squash'],
    ]);
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1).status).toBeNull();
    // a limpeza conferiu as pendências e as branches pelo git, e deixou um relatório só
    expect(gitCalls.some((a) => a[0] === 'worktree' && a[1] === 'list')).toBe(true);
    expect(cleanupComments(1)).toHaveLength(1);
    // a worktree da limpeza é a da `cleanUpStory`: sem worktree listada pelo git, nada a remover
    expect(removed).toEqual([]);
  });

  it('merge que falha no AutoMerger: nenhuma limpeza', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { autoMerge: true, gitflow: true } } });
    await call('set_pull_request', { card: 1, url: PR });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    ghResult = async () => {
      if (calls.at(-1)![1] === 'view') return JSON.stringify({ state: 'OPEN', mergedAt: null, headRefName: 'historia/1-login' });
      throw new Error('Pull request is not mergeable');
    };
    await approve(1);
    expect(calls.map((a) => a[1])).toEqual(['view', 'merge']);
    expect(columnOf(1)).toBe('Homologação');
    expect(card(1).status).toBe('blocked');
    expect(gitCalls).toEqual([]);
    expect(removed).toEqual([]);
    expect(cleanupComments(1)).toHaveLength(0);
  });

  it('falha do gh pr view no AutoMerger: merge segue, limpeza não apaga e avisa', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { autoMerge: true, gitflow: true } } });
    await call('set_pull_request', { card: 1, url: PR });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    ghResult = async () => {
      if (calls.at(-1)![1] === 'view') throw new Error('HTTP 401: Bad credentials');
      return '';
    };
    await approve(1);
    expect(calls.map((a) => a[1])).toEqual(['view', 'merge']);
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1).status).toBeNull();
    // sem confirmar o pull request, nada é apagado: nem git, nem worktree
    expect(gitCalls).toEqual([]);
    expect(removed).toEqual([]);
    expect(card(1).branch).toBe('historia/1-login');
    expect(cleanupComments(1)).toHaveLength(0);
    const warn = router.snapshot().comments.at(-1)!;
    expect(warn.author).toBe('Faz AI');
    expect(warn.body).toContain('A limpeza não apagou nada');
    expect(warn.body).toContain(PR);
    expect(warn.body).toContain('HTTP 401: Bad credentials');
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
    await call('create_card', { title: 'Tarefa aberta', parent: 1 }); // #2: segura a conclusão
    await approve(1); // sem PR registrado: sem merge, e a conclusão é recusada pela sub-tarefa em aberto
    expect(calls).toEqual([]);
    expect(columnOf(1)).toBe('Homologação');
    expect(card(1).status).toBe('approved');
    expect(router.snapshot().comments.at(-1)!.body).toContain('não foi para Concluído');

    await call('create_card', { title: 'No Plan', column: 'Plan' }); // #3
    await call('set_pull_request', { card: 3, url: PR });
    await approve(3);
    expect(calls).toEqual([]);
    expect(columnOf(3)).toBe('Implementação'); // aprovada fora da última coluna: só avança

    await call('set_pull_request', { card: 1, url: PR });
    await approve(1);
    expect(calls).toEqual([]);
    expect(card(1).statusReason).toContain('sub-tarefa(s) da história ainda em aberto');
    expect(merger).toBeDefined();
  });
});

describe('MergeWatcher', () => {
  let log: string[];
  let watcher: MergeWatcher;
  /** o gancho do fim da rodada (a rodada de publicação, #49); por padrão não faz nada */
  let after: () => Promise<void>;
  /** quantas chamadas de `gh` já tinham acontecido a cada vez que o gancho rodou */
  let afterRuns: number[];

  const json = (pr: Record<string, unknown>) => async () => JSON.stringify(pr);
  const MERGED = json({ state: 'MERGED', mergedAt: '2026-10-04T10:00:00Z', mergeCommit: { oid: 'abc123' } });
  const CLOSED = json({ state: 'CLOSED', mergedAt: null, mergeCommit: null });
  const OPEN = json({ state: 'OPEN', mergedAt: null, mergeCommit: null });
  const prOf = (n: number) => `https://github.com/acme/app/pull/${n}`;
  const FIELDS = 'state,mergedAt,mergeCommit,baseRefName,headRefName,headRefOid';
  const comments = (n: number) => router.snapshot().comments.filter((c) => c.cardId === card(n).id && c.author === 'Faz AI');
  /** deixa a história entregue: modo autônomo, pull request registrado e status com a pessoa */
  const deliver = async (n: number, url = prOf(n)) => {
    router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
    await call('set_pull_request', { card: n, url });
    router.handle({ type: 'card.status.set', cardId: card(n).id, status: 'waiting_review' });
  };

  beforeEach(async () => {
    log = [];
    after = async () => {};
    afterRuns = [];
    watcher = new MergeWatcher(router, {
      cwd: '/projeto',
      log: (line) => log.push(line),
      gh: (args) => {
        calls.push(args);
        return ghResult();
      },
      git: (args, cwd) => {
        gitCalls.push(args);
        return gitResult(args, cwd);
      },
      removeWorktree: (_dir, p) => {
        removed.push(p);
      },
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
      ['pr', 'view', prOf(1), '--json', FIELDS],
      ['pr', 'view', prOf(2), '--json', FIELDS],
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
    // a rodada em paralelo não começa, e depois de concluída a história sai dos alvos: uma consulta só
    expect(calls).toHaveLength(1);
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

  it('nunca bloqueia nem deixa um erro escapar da rodada', async () => {
    ghResult = async () => {
      throw new Error('sem rede');
    };
    await expect(watcher.runNow()).resolves.toBe(1);
    expect(card(1).status).toBe('waiting_review');
    expect(log).toEqual(['Merges: sem rede']);
  });

  it('não começa outra rodada enquanto a anterior está em andamento', async () => {
    let release!: () => void;
    ghResult = () => new Promise<string>((r) => (release = () => r(JSON.stringify({ state: 'OPEN', mergedAt: null }))));
    const first = watcher.runNow();
    expect(await watcher.runNow()).toBe(0);
    release();
    expect(await first).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('o gancho do fim da rodada roda uma vez, depois do último pull request consultado', async () => {
    await call('create_card', { title: 'Entregue também', column: 'Homologação' }); // #2
    await deliver(2);
    ghResult = OPEN;
    await watcher.runNow();
    expect(calls).toEqual([
      ['pr', 'view', prOf(1), '--json', FIELDS],
      ['pr', 'view', prOf(2), '--json', FIELDS],
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

    // o `busy` voltou a false: a rodada seguinte acontece
    await expect(watcher.runNow()).resolves.toBe(1);
    expect(afterRuns).toHaveLength(2);
  });

  it('PR fechado sem merge no MergeWatcher: nenhuma branch apagada', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree', gitflow: true } } });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    ghResult = json({ state: 'CLOSED', mergedAt: null, mergeCommit: null, headRefName: 'historia/1-login', headRefOid: 'feed01' });
    await watcher.runNow();
    expect(columnOf(1)).toBe('Homologação');
    expect(gitCalls).toEqual([]);
    expect(removed).toEqual([]);
    expect(card(1)).toMatchObject({ branch: 'historia/1-login', worktreePath: '/projeto.worktrees/1-login' });
    expect(cleanupComments(1)).toHaveLength(0);
    expect(comments(1).filter((c) => c.body.includes('fechado sem merge'))).toHaveLength(1);
  });

  it('mergeado com o gitflow ligado: conclui e limpa (worktree, branches e develop) com um relatório só', async () => {
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree', gitflow: true } } });
    (router as any).ctx.cards.setWorkspace(card(1).id, 'historia/1-login', '/projeto.worktrees/1-login');
    ghResult = async () => mergedView(prOf(1), 'historia/1-login');
    // um repositório limpo, com origin: a branch existe nas duas pontas e a develop local está atrás
    gitResult = async (args, cwd) => {
      const a = args.join(' ');
      if (a === 'worktree list --porcelain')
        return removed.length
          ? 'worktree /projeto\nHEAD 1111\nbranch refs/heads/main\n'
          : 'worktree /projeto\nHEAD 1111\nbranch refs/heads/main\n\nworktree /projeto.worktrees/1-login\nHEAD feed01\nbranch refs/heads/historia/1-login\n';
      if (a === 'status --porcelain') return '';
      if (a.startsWith('rev-parse --verify --quiet refs/heads/')) return 'ok';
      if (a.startsWith('merge-base --is-ancestor')) return '';
      if (a === 'ls-remote --heads origin historia/1-login') return 'feed01\trefs/heads/historia/1-login\n';
      if (a === 'rev-list --count origin/develop..develop') return '0\n';
      if (a === 'rev-parse develop') return 'aaa\n';
      if (a === 'rev-parse origin/develop') return 'bbb\n';
      expect(cwd).toBe('/projeto');
      return '';
    };
    await watcher.runNow();
    expect(columnOf(1)).toBe('Concluído');
    expect(card(1)).toMatchObject({ mergeCommit: 'abc123', worktreePath: '', status: null });
    expect(removed).toEqual(['/projeto.worktrees/1-login']);
    expect(gitCalls).toContainEqual(['branch', '-D', 'historia/1-login']);
    expect(gitCalls).toContainEqual(['push', '--quiet', 'origin', '--delete', 'historia/1-login']);
    expect(gitCalls).toContainEqual(['fetch', '--quiet', 'origin', 'develop:develop']);
    const report = cleanupComments(1);
    expect(report).toHaveLength(1);
    expect(report[0]!.body).toContain('/projeto.worktrees/1-login');
    expect(report[0]!.body).toContain('historia/1-login');
    expect(report[0]!.body).toContain('develop');
    expect(report[0]!.body).not.toContain('**Aviso:**');
    // o relatório vem depois do comentário de conclusão, e a limpeza fica no log
    const mine = comments(1);
    expect(mine.at(-2)!.body).toContain('História concluída pelo board');
    expect(mine.at(-1)!.body.startsWith('Limpeza da história depois do merge:')).toBe(true);
    expect(log[0]).toBe(`[#1] Pull request ${prOf(1)} mergeado (abc123); história concluída.`);
    expect(log.at(-1)).toContain('Limpeza da história');
  });
});
