/**
 * A sincronização das branches locais do heartbeat (#722): `syncTargets` puro e o `BranchSyncer` com um
 * repositório git de verdade (um origin bare, a pasta do projeto clonada e as worktrees das histórias).
 * O origin avança por um segundo clone, como faria outra pessoa ou o GitHub; o fetch, que é da
 * `Maintenance`, o teste faz à mão antes de cada passada.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { BranchSyncer, syncTargets } from '../src/extension/branchSync';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { BoardState, Card } from '../src/shared/model';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let base: string;
/** a pasta do projeto: um clone do origin, com a `main` aberta */
let repo: string;
let origin: string;
/** o outro clone, que empurra commits novos para o origin */
let other: string;
let db: Database;
let router: MessageRouter;
let client: Client;
let log: string[];

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const identity = (cwd: string) => {
  git(cwd, 'config', 'user.email', 'teste@exemplo.com');
  git(cwd, 'config', 'user.name', 'Teste');
};
/** o `git` assíncrono, como o do boardHost: resolve com a saída, rejeita com o stderr */
const gitAsync = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 30_000 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout),
    );
  });
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { error: res.isError === true, text: (res.content as { text: string }[])[0]!.text };
};
const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const sha = (ref: string, cwd = repo) => git(cwd, 'rev-parse', ref);
const commit = (cwd: string, file: string, content = file) => {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', `muda ${file}`);
  return git(cwd, 'rev-parse', 'HEAD');
};
/** Um commit novo na branch do origin, feito por outro clone, e o fetch na pasta do projeto. */
const advanceOrigin = (branch: string, file: string): string => {
  git(other, 'fetch', '-q', 'origin');
  git(other, 'checkout', '-q', '-B', branch, `origin/${branch}`);
  const head = commit(other, file);
  git(other, 'push', '-q', 'origin', branch);
  git(repo, 'fetch', '-q', '--prune', 'origin');
  return head;
};
const fetch = () => git(repo, 'fetch', '-q', '--prune', 'origin');

/** Cria a história numa coluna aberta e a branch/worktree dela pelo board, já enviada ao origin. */
async function story(title: string, push = true): Promise<Card> {
  const res = await call('create_card', { title, column: 'Implementação' });
  expect(res.error, res.text).toBe(false);
  const n = router.snapshot().cards.length;
  const ws = await call('prepare_workspace', { card: n });
  expect(ws.error, ws.text).toBe(false);
  if (push) git(repo, 'push', '-q', 'origin', card(n).branch);
  return card(n);
}

function syncer(snapshot: () => BoardState = () => router.snapshot()): BranchSyncer {
  log = [];
  return new BranchSyncer({ git: gitAsync, log: (l) => log.push(l), cwd: repo, snapshot, mainBranch: () => 'main' });
}

function setupRepos(): void {
  repo = path.join(base, 'projeto');
  origin = path.join(base, 'origin.git');
  other = path.join(base, 'outro');
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(base, 'seed');
  fs.mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'main');
  identity(seed);
  fs.writeFileSync(path.join(seed, 'README.md'), 'oi');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'inicial');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');
  git(seed, 'branch', 'develop', 'main');
  git(seed, 'push', '-q', 'origin', 'develop');
  fs.rmSync(seed, { recursive: true, force: true });
  git(base, 'clone', '-q', origin, repo);
  identity(repo);
  git(repo, 'remote', 'set-head', 'origin', 'main');
  git(repo, 'branch', 'develop', 'origin/develop');
  git(base, 'clone', '-q', origin, other);
  identity(other);
}

async function setupBoard(): Promise<void> {
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(base, 'attachments'),
    workspaceDir: repo,
  });
  const server = createMcpServer({ getRouter: async () => router, getRunner: async () => undefined, workspaceDir: repo, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
}

beforeEach(async () => {
  // realpath: no macOS a pasta temporária é um link, e o git devolve o caminho resolvido
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-branchsync-')));
  setupRepos();
  await setupBoard();
});

afterEach(() => {
  db.close();
  fs.rmSync(base, { recursive: true, force: true });
});

describe('syncTargets', () => {
  const setBranch = (n: number, branch: string) => (router as any).ctx.cards.setWorkspace(card(n).id, branch, '');
  const create = async (title: string, column = 'Implementação', parent?: number) => {
    const res = await call('create_card', parent ? { title, parent } : { title, column });
    expect(res.error, res.text).toBe(false);
    return router.snapshot().cards.length;
  };
  const branches = (main = 'main') => syncTargets(router.snapshot(), main).map((t) => t.branch);

  it('as bases primeiro (principal e develop com o gitflow), depois a branch de cada história viva em coluna aberta (RF8)', async () => {
    setBranch(await create('Viva'), 'feature/1-viva'); // #1
    setBranch(await create('Concluída', 'Concluído'), 'feature/2-concluida'); // #2
    const archived = await create('Arquivada'); // #3
    setBranch(archived, 'feature/3-arquivada');
    router.handle({ type: 'card.archive', cardId: card(archived).id });
    const trashed = await create('Na lixeira'); // #4
    setBranch(trashed, 'feature/4-lixeira');
    router.handle({ type: 'card.trash', cardId: card(trashed).id });
    setBranch(await create('Sub-tarefa', undefined, 1), 'feature/5-sub'); // #5
    setBranch(await create('Repetida'), 'feature/1-viva'); // #6: a mesma branch da #1
    await create('Sem branch'); // #7
    expect(branches()).toEqual(['main', 'develop', 'feature/1-viva']);
    expect(syncTargets(router.snapshot(), 'main')[2]).toEqual({ branch: 'feature/1-viva', storyId: card(1).id });
  });

  it('sem gitflow não há develop; a develop com o nome da principal aparece uma vez; sem principal, só as histórias', async () => {
    setBranch(await create('Viva'), 'feature/1-viva');
    router.handle({ type: 'settings.board.update', patch: { git: { gitflow: false } } });
    expect(branches()).toEqual(['main', 'feature/1-viva']);
    router.handle({ type: 'settings.board.update', patch: { git: { gitflow: true, developBranch: 'main' } } });
    expect(branches()).toEqual(['main', 'feature/1-viva']);
    router.handle({ type: 'settings.board.update', patch: { git: { developBranch: 'develop' } } });
    expect(branches('')).toEqual(['develop', 'feature/1-viva']);
  });
});

describe('BranchSyncer', () => {
  it('branch fechada atrás do origin: só a ref anda, e a pasta do projeto não muda (RF13, RF15)', async () => {
    const before = sha('develop');
    const next = advanceOrigin('develop', 'dev.txt');
    const head = sha('HEAD');
    await syncer().sync();
    expect(sha('develop')).toBe(next);
    expect(sha('HEAD')).toBe(head);
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(fs.existsSync(path.join(repo, 'dev.txt'))).toBe(false);
    expect(log).toEqual([`Branches: develop atualizada de ${before.slice(0, 7)} para ${next.slice(0, 7)} (1 commit(s) do origin).`]);
  });

  it('branch aberta numa pasta limpa: avança com fast-forward e o arquivo novo aparece na pasta (RF12)', async () => {
    const c = await story('Login');
    const next = advanceOrigin(c.branch, 'novo.ts');
    advanceOrigin('main', 'main.txt'); // a principal, aberta e limpa na pasta do projeto, também anda
    await syncer().sync();
    expect(sha(c.branch)).toBe(next);
    expect(fs.existsSync(path.join(c.worktreePath, 'novo.ts'))).toBe(true);
    expect(git(c.worktreePath, 'status', '--porcelain')).toBe('');
    expect(fs.existsSync(path.join(repo, 'main.txt'))).toBe(true);
    expect(log.filter((l) => l.includes('atualizada'))).toHaveLength(2);
  });

  it('pasta com arquivo alterado ou não rastreado: a branch não muda, e o log diz o motivo uma vez por motivo (RF12, RF14)', async () => {
    const c = await story('Login');
    const before = sha(c.branch);
    advanceOrigin(c.branch, 'novo.ts');
    fs.writeFileSync(path.join(c.worktreePath, 'README.md'), 'mudado e não commitado');
    const s = syncer();
    for (let i = 0; i < 3; i++) await s.sync();
    expect(sha(c.branch)).toBe(before);
    expect(fs.readFileSync(path.join(c.worktreePath, 'README.md'), 'utf8')).toBe('mudado e não commitado');
    expect(log).toEqual([`Branches: ${c.branch} não foi atualizada: a pasta ${c.worktreePath} tem alterações ou arquivos não rastreados.`]);

    // limpa: sincroniza; suja de novo (um arquivo não rastreado) com o origin à frente: linha nova
    git(c.worktreePath, 'checkout', '--', 'README.md');
    await s.sync();
    expect(sha(c.branch)).toBe(sha(`origin/${c.branch}`));
    fs.writeFileSync(path.join(c.worktreePath, 'rascunho.txt'), 'não rastreado');
    advanceOrigin(c.branch, 'outro.ts');
    const dirty = sha(c.branch);
    await s.sync();
    expect(sha(c.branch)).toBe(dirty);
    expect(fs.existsSync(path.join(c.worktreePath, 'rascunho.txt'))).toBe(true);
    expect(log.filter((l) => l.includes('não rastreados'))).toHaveLength(2);
  });

  it('branch à frente ou divergente: nada muda, nenhum commit novo, e o log diz o motivo (RF9)', async () => {
    const c = await story('Login');
    const ahead = commit(c.worktreePath, 'local.ts');
    const s = syncer();
    await s.sync();
    expect(sha(c.branch)).toBe(ahead);
    expect(log).toEqual([`Branches: ${c.branch} não foi atualizada: tem 1 commit(s) que o origin não tem.`]);
    advanceOrigin(c.branch, 'remoto.ts');
    await s.sync();
    expect(sha(c.branch)).toBe(ahead);
    expect(git(c.worktreePath, 'rev-list', '--count', 'HEAD')).toBe('2');
    expect(log.at(-1)).toBe(`Branches: ${c.branch} não foi atualizada: divergiu do origin (1 commit(s) só aqui, 1 só no origin).`);
  });

  it('igual ao origin, sem a branch no origin ou pessoal: nada muda e nada vai para o log (RF8, RF10)', async () => {
    await story('Igual'); // enviada e sem nada novo
    const local = await story('Só local', false);
    git(repo, 'branch', 'minha', 'main');
    git(repo, 'push', '-q', 'origin', 'minha');
    const mine = sha('minha');
    advanceOrigin('minha', 'pessoal.txt');
    await syncer().sync();
    expect(sha('minha')).toBe(mine);
    expect(sha(local.branch)).toBeTruthy();
    expect(log).toEqual([]);
  });

  it('com execução numa sub-tarefa da história, a branch é pulada', async () => {
    const c = await story('Login');
    const before = sha(c.branch);
    advanceOrigin(c.branch, 'novo.ts');
    const sub = await call('create_card', { title: 'Passo', parent: c.number });
    expect(sub.error, sub.text).toBe(false);
    router.handle({ type: 'card.status.set', cardId: card(router.snapshot().cards.length).id, status: 'running' }, { source: 'ai' });
    await syncer().sync();
    expect(sha(c.branch)).toBe(before);
    expect(log).toEqual([`Branches: ${c.branch} não foi atualizada: há uma execução da IA na história #${c.number}.`]);
  });

  it('uma execução que começa depois da medição também pula a branch: o board é lido de novo antes de escrever (RF11)', async () => {
    const c = await story('Login');
    const before = sha(c.branch);
    advanceOrigin(c.branch, 'novo.ts');
    let reads = 0;
    const s = syncer(() => {
      // a primeira leitura monta os alvos; antes da segunda (a escrita), a IA começa na história
      if (++reads === 2) router.handle({ type: 'card.status.set', cardId: c.id, status: 'running' }, { source: 'ai' });
      return router.snapshot();
    });
    await s.sync();
    expect(sha(c.branch)).toBe(before);
    expect(log.at(-1)).toContain('há uma execução da IA');
  });

  it('a pasta do projeto em uso por uma execução (fase de texto ou modo branch) segura a principal aberta nela', async () => {
    const before = sha('main');
    advanceOrigin('main', 'main.txt');
    const res = await call('create_card', { title: 'PRD', column: 'PRD' });
    expect(res.error, res.text).toBe(false);
    router.handle({ type: 'card.status.set', cardId: card(router.snapshot().cards.length).id, status: 'running' }, { source: 'ai' });
    await syncer().sync();
    expect(sha('main')).toBe(before);
    expect(log).toEqual([`Branches: main não foi atualizada: a pasta ${repo} está em uso por uma execução da IA.`]);
  });

  it('uma branch que falha (ref travada) não impede as outras, e não muda (RF17)', async () => {
    const c = await story('Login');
    const dev = sha('develop');
    advanceOrigin('develop', 'dev.txt');
    const next = advanceOrigin(c.branch, 'novo.ts');
    fs.writeFileSync(path.join(repo, '.git', 'refs', 'heads', 'develop.lock'), '');
    await syncer().sync();
    expect(sha('develop')).toBe(dev);
    expect(sha(c.branch)).toBe(next);
    expect(log.find((l) => l.startsWith('Branches: develop não foi atualizada:'))).toContain('develop.lock');
    expect(log.some((l) => l.startsWith(`Branches: ${c.branch} atualizada`))).toBe(true);
  });

  it("com o git do board desligado ('off'), nada muda e nada vai para o log (RF18)", async () => {
    const before = sha('develop');
    advanceOrigin('develop', 'dev.txt');
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    await syncer().sync();
    expect(sha('develop')).toBe(before);
    expect(log).toEqual([]);
  });

  it('o fetch com --prune não quebra a sincronização: a branch que sumiu do origin é ignorada', async () => {
    const c = await story('Login');
    git(other, 'push', '-q', 'origin', '--delete', c.branch);
    fetch();
    await syncer().sync();
    expect(sha(c.branch)).toBeTruthy();
    expect(log).toEqual([]);
  });
});
