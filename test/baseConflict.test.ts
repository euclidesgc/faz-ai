/**
 * A conferência antes do PR (#747): as funções puras e o `BaseConflictChecker` com um repositório git de
 * verdade (um origin bare e a pasta do projeto clonada). A base avança pela própria pasta do projeto,
 * com push e fetch, e a branch da história parte do commit anterior a ela.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import {
  BASE_CONFLICT_MARK,
  BaseConflictChecker,
  baseCheckTargets,
  baseConflictNotice,
  parseGitVersion,
} from '../src/extension/baseConflict';
import { CommandError } from '../src/extension/git';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let base: string;
let repo: string;
let db: Database;
let router: MessageRouter;
let log: string[];
let gitCalls: string[][];

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** o `git` assíncrono, como o do boardHost: resolve com a saída, rejeita com `CommandError` */
const gitAsync = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) => {
    gitCalls.push(args);
    execFile('git', args, { cwd, timeout: 30_000 }, (err, stdout, stderr) =>
      err
        ? reject(new CommandError(stderr.trim() || err.message, typeof err.code === 'number' ? err.code : null, stdout))
        : resolve(stdout),
    );
  });
const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const repoCtx = () => (router as any).ctx.cards;
const commit = (file: string, content: string) => {
  fs.writeFileSync(path.join(repo, file), content);
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', `muda ${file}`);
};
const notices = (n: number) => router.snapshot().comments.filter((c) => c.cardId === card(n).id && c.body.includes(BASE_CONFLICT_MARK));

/** A história numa coluna, com a branch e a base gravadas (sem worktree: as refs bastam). */
const story = (title: string, branch: string, column = 'Implementação'): number => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: null,
    title,
  });
  const n = router.snapshot().cards.length;
  repoCtx().setWorkspace(card(n).id, branch, '');
  repoCtx().setBaseBranch(card(n).id, 'main');
  return n;
};

function checker(git: (args: string[], cwd: string) => Promise<string> = gitAsync): BaseConflictChecker {
  log = [];
  return new BaseConflictChecker({
    git,
    log: (l) => log.push(l),
    cwd: repo,
    snapshot: () => router.snapshot(),
    act: (msg) => router.handle(msg, { author: 'Faz AI', source: 'ai' }),
  });
}

/**
 * origin com a `main`; na pasta do projeto, a branch `feature/1-login` parte do commit inicial e muda
 * `app.txt`; a `main` muda a mesma linha e vai para o origin.
 */
function setupRepos(): void {
  repo = path.join(base, 'projeto');
  const origin = path.join(base, 'origin.git');
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  git(base, 'clone', '-q', origin, repo);
  git(repo, 'config', 'user.email', 'teste@exemplo.com');
  git(repo, 'config', 'user.name', 'Teste');
  commit('app.txt', 'linha\n');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'branch', 'feature/1-login');
  git(repo, 'branch', 'feature/2-livre');
  commit('app.txt', 'da main\n');
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'checkout', '-q', 'feature/1-login');
  commit('app.txt', 'da história\n');
  git(repo, 'checkout', '-q', 'feature/2-livre');
  commit('outro.txt', 'sem conflito\n');
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'fetch', '-q', 'origin');
}

beforeEach(async () => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-baseconflict-')));
  setupRepos();
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(base, 'attachments'),
    workspaceDir: repo,
  });
  gitCalls = [];
});

afterEach(() => {
  db.close();
  fs.rmSync(base, { recursive: true, force: true });
});

describe('funções puras', () => {
  it('baseCheckTargets: história viva, em coluna aberta, com branch e sem pull request, em qualquer status', () => {
    const a = story('Com branch', 'feature/1-login'); // #1
    const b = story('Com PR', 'feature/2-livre'); // #2
    repoCtx().setPullRequest(card(b).id, 'https://github.com/acme/app/pull/2');
    story('Sem branch', ''); // #3
    story('Concluída', 'feature/4-x', 'Concluído'); // #4
    const e = story('Bloqueada', 'feature/5-y'); // #5
    router.handle({ type: 'card.status.set', cardId: card(e).id, status: 'blocked', note: 'x' });
    expect(baseCheckTargets(router.snapshot()).map((c) => c.number)).toEqual([a, e]);
  });

  it('parseGitVersion lê as saídas reais do git', () => {
    expect(parseGitVersion('git version 2.56.0')).toEqual([2, 56]);
    expect(parseGitVersion('git version 2.39.3 (Apple Git-146)')).toEqual([2, 39]);
    expect(parseGitVersion('git version 2.37.1.windows.1\n')).toEqual([2, 37]);
    expect(parseGitVersion('outra coisa')).toBeNull();
  });

  it('o aviso cita a branch, a base, o commit curto e até 10 arquivos, e proíbe rebase e push forçado', () => {
    const files = Array.from({ length: 12 }, (_, i) => `f${i}.ts`);
    const body = baseConflictNotice('feature/1-login', 'develop', 'abcdef1234567', files);
    expect(body).toContain(`A branch feature/1-login ${BASE_CONFLICT_MARK} origin/develop (commit abcdef1)`);
    expect(body).toContain('f9.ts e mais 2');
    expect(body).not.toContain('f10.ts');
    expect(body).toContain('sem rebase nem push forçado');
  });
});

describe('BaseConflictChecker', () => {
  it('avisa uma vez por commit da branch, sem mexer na pasta, no HEAD, no status nem na coluna (RF10 a RF12)', async () => {
    const n = story('Login', 'feature/1-login');
    const before = {
      head: git(repo, 'rev-parse', 'HEAD'),
      status: git(repo, 'status', '--porcelain'),
      branch: git(repo, 'rev-parse', 'feature/1-login'),
    };
    const statusBefore = card(n).status;
    const columnBefore = card(n).columnId;
    const c = checker();

    await c.runNow();
    expect(notices(n)).toHaveLength(1);
    expect(notices(n)[0]!.body).toContain('em: app.txt');
    expect(notices(n)[0]!.body).toContain(`commit ${before.branch.slice(0, 7)}`);
    expect(log.some((l) => l.includes('tem conflito com origin/main'))).toBe(true);

    await c.runNow(); // nada mudou: nenhum aviso novo
    expect(notices(n)).toHaveLength(1);

    git(repo, 'checkout', '-q', 'feature/1-login');
    commit('app.txt', 'da história, de novo\n'); // commit novo, ainda em conflito
    git(repo, 'checkout', '-q', 'main');
    await c.runNow();
    expect(notices(n)).toHaveLength(2);

    expect(git(repo, 'rev-parse', 'HEAD')).toBe(before.head);
    expect(git(repo, 'status', '--porcelain')).toBe(before.status);
    expect(card(n).status).toBe(statusBefore);
    expect(card(n).columnId).toBe(columnBefore);
    // só leitura: nenhum comando que escreve em pasta, índice ou ref
    const verbs = new Set(gitCalls.map((a) => a[0]));
    expect([...verbs].sort()).toEqual(['--version', 'merge-tree', 'rev-parse']);
  });

  it('branch que mescla sem conflito não ganha aviso nem log', async () => {
    const n = story('Livre', 'feature/2-livre');
    const c = checker();
    await c.runNow();
    expect(notices(n)).toHaveLength(0);
    expect(log).toEqual([]);
  });

  it('história com pull request fica de fora: o conflito dela é do MergeWatcher', async () => {
    const n = story('Login', 'feature/1-login');
    repoCtx().setPullRequest(card(n).id, 'https://github.com/acme/app/pull/1');
    await checker().runNow();
    expect(notices(n)).toHaveLength(0);
    expect(gitCalls).toEqual([]);
  });

  it('git anterior a 2.38: uma linha no log por abertura e nenhum merge-tree (RF13)', async () => {
    story('Login', 'feature/1-login');
    const old = async (args: string[], cwd: string) => (args[0] === '--version' ? 'git version 2.37.1\n' : gitAsync(args, cwd));
    const c = checker(old);
    await c.runNow();
    await c.runNow();
    expect(log).toEqual(['Conflito antes do PR: conferência pulada, git 2.37 é anterior a 2.38.']);
    expect(gitCalls.some((a) => a[0] === 'merge-tree')).toBe(false);
  });

  it('origin/<base> inexistente: uma linha por história e motivo, sem aviso', async () => {
    const n = story('Login', 'feature/1-login');
    repoCtx().setBaseBranch(card(n).id, 'feature/9-nao-enviada');
    const c = checker();
    await c.runNow();
    await c.runNow();
    expect(log).toEqual([`[#${n}] Conflito antes do PR: conferência pulada: origin/feature/9-nao-enviada não existe.`]);
    expect(notices(n)).toHaveLength(0);
  });

  it('branch que só existe no origin: pulada com uma linha', async () => {
    const n = story('Remota', 'feature/3-remota');
    const c = checker();
    await c.runNow();
    expect(log).toEqual([`[#${n}] Conflito antes do PR: conferência pulada: a branch feature/3-remota não existe nesta máquina.`]);
  });

  it('merge-tree que sai com 1 sem a árvore é falha, não conflito', async () => {
    const n = story('Login', 'feature/1-login');
    const broken = async (args: string[], cwd: string) => {
      if (args[0] === 'merge-tree') throw new CommandError('merge-tree: nope - not something we can merge', 1, '');
      return gitAsync(args, cwd);
    };
    await checker(broken).runNow();
    expect(notices(n)).toHaveLength(0);
    expect(log).toEqual([
      `[#${n}] Conflito antes do PR: conferência pulada: git merge-tree falhou: merge-tree: nope - not something we can merge.`,
    ]);
  });

  it('com o git do board desligado, nada roda', async () => {
    story('Login', 'feature/1-login');
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'off' } } });
    await checker().runNow();
    expect(gitCalls).toEqual([]);
  });
});
