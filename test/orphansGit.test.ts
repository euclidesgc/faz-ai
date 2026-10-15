/**
 * O varredor de órfãs (#465, parte 2) com um repositório git de verdade: cada caso monta histórias
 * pelo board (branch e worktree com os nomes que o board dá) e confere o que o `OrphanSweeper`
 * remove, o que lista e o que recusa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { deleteBranch, removeWorktree } from '../src/extension/git';
import { createMcpServer } from '../src/extension/mcp/server';
import { OrphanSweeper, type OrphanDeps } from '../src/extension/orphans';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { Card } from '../src/shared/model';
import type { OrphanReport } from '../src/shared/orphans';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let base: string;
/** a pasta do projeto: um clone do origin, com a `main` em uso */
let repo: string;
let origin: string;
let db: Database;
let router: MessageRouter;
let client: Client;
let log: string[];
let published: OrphanReport[];

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
const hasBranch = (branch: string) => {
  try {
    git(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
};
const worktrees = () =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length));
/** Um commit com data fixa: a prova de merge compara a data da ponta com a do commit do merge. */
const commit = (cwd: string, file: string, content: string, date = '2026-01-01T00:00:00Z') => {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, 'add', '.');
  execFileSync('git', ['commit', '-q', '-m', `muda ${file}`], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return git(cwd, 'rev-parse', 'HEAD');
};
/** O que o GitHub faz num merge squash, aqui na `main` local: um commit só com a árvore da branch. */
const squashOnMain = (branch: string, date = '2026-01-02T00:00:00Z'): string => {
  git(repo, 'merge', '--squash', branch);
  execFileSync('git', ['commit', '-q', '-m', `squash de ${branch}`], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return git(repo, 'rev-parse', 'HEAD');
};

/** Cria a história numa coluna aberta e a branch/worktree dela pelo board; devolve o card. */
async function story(title: string): Promise<Card> {
  const res = await call('create_card', { title, column: 'Implementação' });
  expect(res.error, res.text).toBe(false);
  const n = router.snapshot().cards.length;
  const ws = await call('prepare_workspace', { card: n });
  expect(ws.error, ws.text).toBe(false);
  return card(n);
}
const moveTo = async (n: number, column: string) => {
  const res = await call('move_card', { card: n, column });
  expect(res.error, res.text).toBe(false);
};
const setMerge = (n: number, sha: string) => router.handle({ type: 'card.merge.set', cardId: card(n).id, commit: sha });

function sweeper(over: Partial<OrphanDeps> = {}): OrphanSweeper {
  log = [];
  published = [];
  return new OrphanSweeper({
    cwd: repo,
    log: (l) => log.push(l),
    git: gitAsync,
    removeWorktree,
    deleteBranch,
    snapshot: () => router.snapshot(),
    publish: (r) => published.push(r),
    clearWorkspace: (cardId) => router.handle({ type: 'card.workspace.clear', cardId }),
    now: () => 1000,
    ...over,
  });
}

function setupRepos(): void {
  repo = path.join(base, 'projeto');
  origin = path.join(base, 'origin.git');
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
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-orphans-')));
  setupRepos();
  await setupBoard();
});

afterEach(() => {
  db.close();
  fs.rmSync(base, { recursive: true, force: true });
});

describe('sweep', () => {
  it('worktree limpa de história mesclada some, e a branch sai na segunda passada da mesma rodada', async () => {
    const c = await story('Login');
    commit(c.worktreePath, 'a.ts', 'export {};');
    setMerge(c.number, squashOnMain(c.branch));
    await moveTo(c.number, 'Concluído');

    const report = await sweeper().sweep();

    expect(report.items).toEqual([]);
    expect(report.failed).toEqual({});
    expect(report.scannedAt).toBe(1000);
    expect(worktrees()).toEqual([repo]);
    expect(hasBranch(c.branch)).toBe(false);
    expect(card(c.number).worktreePath).toBe('');
    // a branch continua registrada no card: é o histórico da história
    expect(card(c.number).branch).toBe(c.branch);
  });

  it('worktree com arquivo rastreado alterado ou com arquivo novo fica listada como decisão', async () => {
    const a = await story('Rastreado');
    const b = await story('Novo');
    await moveTo(a.number, 'Concluído');
    await moveTo(b.number, 'Concluído');
    fs.writeFileSync(path.join(a.worktreePath, 'README.md'), 'mudou');
    fs.writeFileSync(path.join(b.worktreePath, 'novo.txt'), 'x');

    const report = await sweeper().sweep();

    const wts = report.items.filter((i) => i.kind === 'worktree');
    expect(wts.map((i) => [i.cardNumber, i.verdict, i.blockers, i.dirtyFiles])).toEqual([
      [a.number, 'decision', ['dirty'], 1],
      [b.number, 'decision', ['dirty'], 1],
    ]);
    // as branches continuam em uso pelas worktrees que ficaram
    expect(report.items.filter((i) => i.kind === 'branch').map((i) => i.blockers)).toEqual([['in-use'], ['in-use']]);
    expect(fs.existsSync(a.worktreePath)).toBe(true);
    expect(fs.existsSync(b.worktreePath)).toBe(true);
  });

  it('branch de história cancelada some sem commits exclusivos e fica com um commit só dela', async () => {
    const zero = await story('Sem commit');
    const one = await story('Com commit');
    commit(one.worktreePath, 'b.ts', 'export {};');
    await moveTo(zero.number, 'Cancelado');
    await moveTo(one.number, 'Cancelado');

    const report = await sweeper().sweep();

    expect(hasBranch(zero.branch)).toBe(false);
    expect(fs.existsSync(zero.worktreePath)).toBe(false);
    // a worktree limpa sai; a branch com trabalho só dela espera a pessoa
    expect(fs.existsSync(one.worktreePath)).toBe(false);
    expect(hasBranch(one.branch)).toBe(true);
    expect(report.items.map((i) => [i.id, i.verdict, i.blockers, i.uniqueCommits, i.situation])).toEqual([
      [`branch:${one.branch}`, 'decision', ['unique'], 1, 'cancelled'],
    ]);
  });

  it('squash provado pelo mergeCommit na base some; mergeCommit fora da base fica', async () => {
    const inBase = await story('Na base');
    commit(inBase.worktreePath, 'a.ts', '1');
    setMerge(inBase.number, squashOnMain(inBase.branch));
    const outside = await story('Fora da base');
    commit(outside.worktreePath, 'b.ts', '2');
    // o commit do merge existe, mas numa branch que não é a principal
    git(repo, 'branch', 'outra', 'main');
    git(repo, 'switch', '-q', 'outra');
    const sha = squashOnMain(outside.branch);
    git(repo, 'switch', '-q', 'main');
    setMerge(outside.number, sha);
    await moveTo(inBase.number, 'Concluído');
    await moveTo(outside.number, 'Concluído');

    const report = await sweeper().sweep();

    expect(hasBranch(inBase.branch)).toBe(false);
    expect(hasBranch(outside.branch)).toBe(true);
    expect(report.items.map((i) => [i.id, i.blockers, i.situation])).toEqual([[`branch:${outside.branch}`, ['unique'], 'merged']]);
  });

  it('branch com commit depois do merge fica', async () => {
    const c = await story('Depois');
    commit(c.worktreePath, 'a.ts', '1', '2026-01-01T00:00:00Z');
    setMerge(c.number, squashOnMain(c.branch, '2026-01-02T00:00:00Z'));
    commit(c.worktreePath, 'a.ts', '2', '2026-01-03T00:00:00Z');
    await moveTo(c.number, 'Concluído');

    const report = await sweeper().sweep();

    expect(hasBranch(c.branch)).toBe(true);
    expect(report.items.map((i) => [i.kind, i.verdict, i.blockers])).toEqual([['branch', 'decision', ['unique']]]);
  });

  it('worktree fora da pasta do board e branch fora do padrão ficam intactas', async () => {
    git(repo, 'branch', 'solta', 'main');
    const fora = path.join(base, 'fora');
    git(repo, 'worktree', 'add', '-q', fora, 'solta');
    git(repo, 'branch', 'experimento', 'main');

    const report = await sweeper().sweep();

    expect(report.items).toEqual([]);
    expect(worktrees()).toEqual([repo, fora]);
    expect(hasBranch('solta')).toBe(true);
    expect(hasBranch('experimento')).toBe(true);
  });

  it('pasta da worktree apagada à mão: o registro sai e a branch sem commits também', async () => {
    const c = await story('Sumiu');
    await moveTo(c.number, 'Concluído');
    fs.rmSync(c.worktreePath, { recursive: true, force: true });

    const report = await sweeper().sweep();

    expect(report.items).toEqual([]);
    expect(worktrees()).toEqual([repo]);
    expect(hasBranch(c.branch)).toBe(false);
    expect(card(c.number).worktreePath).toBe('');
  });

  it('história ativa não é listada nem tocada', async () => {
    const c = await story('Ativa');
    commit(c.worktreePath, 'a.ts', '1');

    const report = await sweeper().sweep();

    expect(report.items).toEqual([]);
    expect(fs.existsSync(c.worktreePath)).toBe(true);
    expect(hasBranch(c.branch)).toBe(true);
  });

  it('falha de remoção vai para failed e para o log uma vez só, mesmo em duas rodadas', async () => {
    const c = await story('Presa');
    await moveTo(c.number, 'Concluído');
    const sw = sweeper({
      removeWorktree: () => {
        throw new Error('Resource busy\nmais detalhe');
      },
    });

    const first = await sw.sweep();
    const second = await sw.sweep();

    expect(first.failed).toEqual({ [`worktree:${c.worktreePath}`]: 'Resource busy' });
    expect(second.failed).toEqual(first.failed);
    expect(first.items.map((i) => i.id)).toEqual([`worktree:${c.worktreePath}`, `branch:${c.branch}`]);
    expect(log.filter((l) => l.includes('Resource busy'))).toHaveLength(1);
    expect(fs.existsSync(c.worktreePath)).toBe(true);
  });

  it('modo off: relatório vazio, sem chamar o git', async () => {
    const c = await story('Desligada');
    await moveTo(c.number, 'Concluído');
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    const spy = vi.fn(gitAsync);

    const report = await sweeper({ git: spy }).sweep();

    expect(report).toEqual({ items: [], failed: {}, scannedAt: 1000 });
    expect(spy).not.toHaveBeenCalled();
    expect(published).toEqual([report]);
    expect(fs.existsSync(c.worktreePath)).toBe(true);
  });

  it('listagem que falha mantém o relatório anterior e loga uma vez', async () => {
    const c = await story('Antes');
    await moveTo(c.number, 'Concluído');
    fs.writeFileSync(path.join(c.worktreePath, 'novo.txt'), 'x');
    const sw = sweeper();
    const before = await sw.sweep();
    expect(before.items).toHaveLength(2);

    fs.rmSync(path.join(repo, '.git'), { recursive: true, force: true });
    const a = await sw.sweep();
    const b = await sw.sweep();

    expect(a.items).toEqual(before.items);
    expect(b.items).toEqual(before.items);
    expect(log.filter((l) => l.startsWith('Varredura de órfãs pulada'))).toHaveLength(1);
  });

  it('uma varredura em curso é devolvida a quem chamar sweep de novo', async () => {
    const sw = sweeper();
    const p1 = sw.sweep();
    const p2 = sw.sweep();
    expect(p2).toBe(p1);
    await p1;
    expect(published).toHaveLength(1);
  });
});

describe('clean', () => {
  it('revalida: recusa o que sujou depois da listagem, aceita a perda com os números iguais e recusa com números diferentes', async () => {
    const c = await story('Revalida');
    await moveTo(c.number, 'Concluído');
    const sw = sweeper();
    const listed = await sw.scan();
    const id = `worktree:${c.worktreePath}`;
    expect(listed.items.find((i) => i.id === id)?.verdict).toBe('safe');

    fs.writeFileSync(path.join(c.worktreePath, 'novo.txt'), 'x');
    expect(await sw.clean(id)).toBe('Não removida: 1 arquivo(s) não commitado(s).');
    expect(fs.existsSync(c.worktreePath)).toBe(true);

    fs.writeFileSync(path.join(c.worktreePath, 'outro.txt'), 'y');
    expect(await sw.clean(id, { dirtyFiles: 1, uniqueCommits: 0 })).toBe(
      'Não removida: mudou desde a listagem, agora são 2 arquivo(s) não commitado(s).',
    );
    expect(fs.existsSync(c.worktreePath)).toBe(true);

    expect(await sw.clean(id, { dirtyFiles: 2, uniqueCommits: 0 })).toBe(`Worktree removida: ${c.worktreePath}`);
    expect(fs.existsSync(c.worktreePath)).toBe(false);
    expect(card(c.number).worktreePath).toBe('');
    // a lista publicada já não traz a worktree, e a branch deixou de estar em uso
    expect(sw.report.items.map((i) => [i.id, i.verdict])).toEqual([[`branch:${c.branch}`, 'safe']]);

    expect(await sw.clean(id)).toBe('Já não é órfã.');
    expect(await sw.clean(`branch:${c.branch}`)).toBe(`Branch apagada: ${c.branch}`);
    expect(hasBranch(c.branch)).toBe(false);
  });

  it('branch com commit só dela sai com acceptLoss e -D', async () => {
    const c = await story('Com trabalho');
    commit(c.worktreePath, 'a.ts', '1');
    await moveTo(c.number, 'Cancelado');
    const sw = sweeper();
    await sw.sweep();
    const id = `branch:${c.branch}`;
    expect(sw.report.items.map((i) => [i.id, i.uniqueCommits])).toEqual([[id, 1]]);

    expect(await sw.clean(id)).toBe('Não removida: 1 commit(s) só nesta branch.');
    expect(await sw.clean(id, { dirtyFiles: 0, uniqueCommits: 1 })).toBe(`Branch apagada: ${c.branch}`);
    expect(hasBranch(c.branch)).toBe(false);
    expect(sw.report.items).toEqual([]);
  });

  it('cleanSafe remove só as seguras', async () => {
    const clean = await story('Limpa');
    const dirty = await story('Suja');
    await moveTo(clean.number, 'Concluído');
    await moveTo(dirty.number, 'Concluído');
    fs.writeFileSync(path.join(dirty.worktreePath, 'novo.txt'), 'x');
    const sw = sweeper();

    const text = await sw.cleanSafe();

    expect(text.split('\n')).toEqual([`Worktree removida: ${clean.worktreePath}`, `Branch apagada: ${clean.branch}`]);
    expect(fs.existsSync(dirty.worktreePath)).toBe(true);
    expect(sw.report.items.map((i) => i.id)).toEqual([`worktree:${dirty.worktreePath}`, `branch:${dirty.branch}`]);
    expect(await sw.cleanSafe()).toBe('Nenhuma branch ou worktree segura para remover.');
  });
});

describe('sintaxes do git em que o varredor se apoia', () => {
  it('rev-list --not --exclude conta só os commits que nenhuma outra ref alcança', async () => {
    git(repo, 'branch', 'a', 'main');
    git(repo, 'branch', 'b', 'main');
    const count = (b: string) =>
      Number(git(repo, 'rev-list', '--count', `refs/heads/${b}`, '--not', `--exclude=${b}`, '--branches', '--remotes'));
    // sem commit exclusivo: o mesmo commit está na main
    expect(count('a')).toBe(0);
    const wt = path.join(base, 'wt-a');
    git(repo, 'worktree', 'add', '-q', wt, 'a');
    commit(wt, 'x.txt', '1');
    expect(count('a')).toBe(1);
    // outra ref aponta para o mesmo commit: deixa de ser exclusivo
    git(repo, 'branch', '-f', 'b', 'a');
    expect(count('a')).toBe(0);
  });

  it('worktree remove --force aceita a pasta ausente e tira o registro', () => {
    git(repo, 'branch', 'c', 'main');
    const wt = path.join(base, 'wt-c');
    git(repo, 'worktree', 'add', '-q', wt, 'c');
    fs.rmSync(wt, { recursive: true, force: true });
    expect(worktrees()).toEqual([repo, wt]);
    git(repo, 'worktree', 'remove', '--force', wt);
    expect(worktrees()).toEqual([repo]);
  });
});
