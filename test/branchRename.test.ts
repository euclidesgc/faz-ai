import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renameNeeded, runBranchRename, type GhRunner } from '../src/extension/branchRename';
import { manualCommands, otherCloneCommands, remainingCommands } from '../src/shared/branchRename';

let base: string;
let repo: string;
let origin: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (cwd: string, ...args: string[]): string | null => {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
};
const has = (cwd: string, ref: string) => tryGit(cwd, 'rev-parse', '--verify', '--quiet', ref) !== null;
const refs = (cwd: string) => git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)').split('\n').filter(Boolean);

/** `dono/repositório` do origin do cenário: é o que o `gh repo view` devolve */
const nwo = () => `${path.basename(path.dirname(origin))}/${path.basename(origin, '.git')}`;

/** O `gh` que o teste injeta: `repo view` e a API de renomear, que age no repositório bare. Registra cada chamada. */
function fakeGh(opts: { view?: string | Error; rename?: Error } = {}) {
  const calls: string[][] = [];
  const gh: GhRunner = (args) => {
    calls.push(args);
    if (args[0] === 'repo') {
      if (opts.view instanceof Error) throw opts.view;
      return `${opts.view ?? nwo()}\n`;
    }
    if (opts.rename) throw opts.rename;
    const m = /^repos\/[^/]+\/[^/]+\/branches\/(.+)\/rename$/.exec(args[3] ?? '');
    const newName = (args[5] ?? '').replace('new_name=', '');
    const from = decodeURIComponent(m![1]!);
    // o GitHub renomeia a branch e leva a branch padrão junto
    const head = git(origin, 'symbolic-ref', 'HEAD');
    git(origin, 'branch', '-m', from, newName);
    if (head === `refs/heads/${from}`) git(origin, 'symbolic-ref', 'HEAD', `refs/heads/${newName}`);
    return '';
  };
  return { gh, calls, renames: () => calls.filter((c) => c[0] === 'api').length };
}

function setup(opts: { main?: string; origin?: boolean } = {}) {
  const main = opts.main ?? 'master';
  repo = path.join(base, 'projeto');
  origin = path.join(base, 'origin.git');
  if (opts.origin === false) {
    fs.mkdirSync(repo);
    git(repo, 'init', '-q', '-b', main);
  } else {
    git(base, 'init', '-q', '--bare', '-b', main, origin);
    git(base, 'clone', '-q', origin, repo);
    git(repo, 'switch', '-q', '-c', main);
  }
  git(repo, 'config', 'user.email', 't@e.com');
  git(repo, 'config', 'user.name', 'T');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'inicial');
  git(repo, 'branch', 'develop');
  if (opts.origin !== false) {
    git(repo, 'push', '-q', '-u', 'origin', main);
    git(repo, 'push', '-q', '-u', 'origin', 'develop');
    git(repo, 'remote', 'set-head', 'origin', main);
  }
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-rename-'));
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('renameNeeded (RF1)', () => {
  it('o nome novo não existe e o antigo existe', () => {
    setup();
    expect(renameNeeded(repo, 'master', 'main')).toBe(true);
    expect(renameNeeded(repo, 'develop', 'dev')).toBe(true);
  });
  it('não renomeia para um nome que já existe, nem a partir de um que não existe, nem para o mesmo nome', () => {
    setup();
    git(repo, 'branch', 'main');
    expect(renameNeeded(repo, 'master', 'main')).toBe(false);
    expect(renameNeeded(repo, 'naoexiste', 'outro')).toBe(false);
    expect(renameNeeded(repo, 'master', 'master')).toBe(false);
  });
  it('só no origin também conta como existente', () => {
    setup();
    git(repo, 'push', '-q', 'origin', 'develop:refs/heads/dev');
    git(repo, 'fetch', '-q', 'origin');
    expect(renameNeeded(repo, 'develop', 'dev')).toBe(false);
  });
  it('fora de um repositório devolve false', () => {
    expect(renameNeeded(base, 'a', 'b')).toBe(false);
  });
});

describe('runBranchRename: GitHub com gh (RF4, RF5)', () => {
  it('develop: remoto, branch local, upstream; origin/HEAD não muda', () => {
    setup();
    const { gh, calls } = fakeGh();
    const r = runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, gh);
    expect(r.status).toBe('done');
    expect(r.done).toEqual(['remote', 'local', 'upstream']);
    expect(calls[1]).toEqual(['api', '-X', 'POST', `repos/${nwo()}/branches/develop/rename`, '-f', 'new_name=dev']);
    expect(has(repo, 'refs/heads/dev')).toBe(true);
    expect(has(repo, 'refs/heads/develop')).toBe(false);
    expect(has(repo, 'refs/remotes/origin/dev')).toBe(true);
    expect(has(repo, 'refs/remotes/origin/develop')).toBe(false);
    expect(has(origin, 'refs/heads/dev')).toBe(true);
    expect(has(origin, 'refs/heads/develop')).toBe(false);
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'dev@{upstream}')).toBe('origin/dev');
    expect(git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).toBe('origin/master');
    expect(r.otherClones).toEqual(otherCloneCommands({ kind: 'develop', from: 'develop', to: 'dev' }));
  });

  it('principal: o origin/HEAD passa a apontar para a nova', () => {
    setup();
    const { gh } = fakeGh();
    const r = runBranchRename(repo, { kind: 'main', from: 'master', to: 'main' }, gh);
    expect(r.status).toBe('done');
    expect(r.done).toEqual(['remote', 'local', 'upstream', 'head']);
    expect(git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).toBe('origin/main');
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'main@{upstream}')).toBe('origin/main');
    expect(git(repo, 'branch', '--show-current')).toBe('main');
    expect(r.otherClones).toContain('git remote set-head origin -a');
  });

  it('a branch de nome com barra vai codificada na URL da API', () => {
    setup();
    git(repo, 'branch', 'release/1');
    git(repo, 'push', '-q', '-u', 'origin', 'release/1');
    const { gh, calls } = fakeGh();
    const r = runBranchRename(repo, { kind: 'develop', from: 'release/1', to: 'release/2' }, gh);
    expect(r.status).toBe('done');
    expect(calls[1]![3]).toBe(`repos/${nwo()}/branches/release%2F1/rename`);
  });

  it('branch checada em outra worktree: o git move a HEAD dela', () => {
    setup();
    const wt = path.join(base, 'wt');
    git(repo, 'worktree', 'add', '-q', wt, 'develop');
    const { gh } = fakeGh();
    const r = runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, gh);
    expect(r.status).toBe('done');
    expect(git(wt, 'branch', '--show-current')).toBe('dev');
  });

  it('repetir depois de concluída não faz nada e não chama o gh de novo', () => {
    setup();
    const f = fakeGh();
    runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, f.gh);
    const before = refs(repo);
    const again = runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, f.gh);
    expect(again.status).toBe('nothing');
    expect(f.renames()).toBe(1);
    expect(refs(repo)).toEqual(before);
  });
});

describe('runBranchRename: falhas (RF4, RF6, RF8)', () => {
  it('o gh falha ao renomear: nada local muda e a mensagem traz o erro e os comandos', () => {
    setup();
    const before = refs(repo);
    const { gh } = fakeGh({ rename: new Error('HTTP 403: Resource not accessible') });
    const r = runBranchRename(repo, { kind: 'main', from: 'master', to: 'main' }, gh);
    expect(r.status).toBe('failed');
    expect(r.failed).toEqual({ step: 'remote', error: 'HTTP 403: Resource not accessible' });
    expect(r.done).toEqual([]);
    expect(r.commands).toEqual(manualCommands({ kind: 'main', from: 'master', to: 'main' }));
    expect(refs(repo)).toEqual(before);
    expect(has(origin, 'refs/heads/master')).toBe(true);
  });

  it('sem gh ou fora do GitHub: nada é executado e os comandos vêm prontos', () => {
    setup();
    const before = refs(repo);
    const beforeOrigin = refs(origin);
    const { gh, renames } = fakeGh({ view: new Error('o comando "gh" não foi encontrado') });
    const r = runBranchRename(repo, { kind: 'main', from: 'master', to: 'main' }, gh);
    expect(r.status).toBe('manual');
    expect(r.reason).toContain('não foi encontrado');
    expect(r.commands).toEqual([
      'git branch -m master main',
      'git push -u origin main',
      '# no provedor (GitHub: Settings → Branches), troque a branch padrão para main antes de apagar a antiga',
      'git push origin --delete master',
      'git remote set-head origin main',
    ]);
    expect(renames()).toBe(0);
    expect(refs(repo)).toEqual(before);
    expect(refs(origin)).toEqual(beforeOrigin);
  });

  it('o gh aponta para outro repositório que o origin (fork com upstream): cai no manual e não renomeia nada', () => {
    setup();
    const before = refs(origin);
    const f = fakeGh({ view: 'organizacao/projeto' });
    const r = runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, f.gh);
    expect(r.status).toBe('manual');
    expect(r.reason).toContain('organizacao/projeto');
    expect(f.renames()).toBe(0);
    expect(refs(origin)).toEqual(before);
  });

  it('o fetch inicial falha (origin inalcançável): nada muda e os comandos vêm na ordem manual', () => {
    setup();
    git(repo, 'remote', 'set-url', 'origin', path.join(base, 'nao-existe.git'));
    const f = fakeGh();
    const r = runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, f.gh);
    expect(r.status).toBe('failed');
    expect(r.failed?.step).toBe('fetch');
    expect(r.commands).toEqual(['git branch -m develop dev', 'git push -u origin dev', 'git push origin --delete develop']);
    expect(f.calls).toEqual([]);
  });

  it('a descoberta devolve algo que não é dono/repositório: cai no manual', () => {
    setup();
    const { gh } = fakeGh({ view: 'x' });
    expect(runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, gh).status).toBe('manual');
  });

  it('falha no meio: o remoto mudou e o local não; a mensagem diz o que falta e repetir conclui sem chamar o gh', () => {
    setup();
    // um arquivo de ref no caminho impede `git branch -m master main` (conflito de diretório)
    git(repo, 'branch', 'main/x');
    const f = fakeGh();
    const req = { kind: 'main', from: 'master', to: 'main' } as const;
    const first = runBranchRename(repo, req, f.gh);
    expect(first.status).toBe('failed');
    expect(first.failed?.step).toBe('local');
    expect(first.done).toEqual(['remote']);
    expect(first.commands).toEqual(['git branch -m master main', 'git branch -u origin/main main', 'git remote set-head origin main']);
    expect(has(origin, 'refs/heads/main')).toBe(true);
    expect(has(repo, 'refs/heads/master')).toBe(true);
    git(repo, 'branch', '-q', '-D', 'main/x');
    const second = runBranchRename(repo, req, f.gh);
    expect(second.status).toBe('done');
    expect(second.done).toEqual(['local', 'upstream', 'head']);
    expect(f.renames()).toBe(1);
    expect(git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).toBe('origin/main');
  });

  it('o nome novo já existe: não sobrescreve nada', () => {
    setup();
    git(repo, 'branch', 'dev');
    const before = refs(repo);
    const { gh, calls } = fakeGh();
    const r = runBranchRename(repo, { kind: 'develop', from: 'develop', to: 'dev' }, gh);
    expect(r.status).toBe('nothing');
    expect(calls).toEqual([]);
    expect(refs(repo)).toEqual(before);
  });
});

describe('runBranchRename: sem origin', () => {
  it('renomeia só a branch local, sem chamar o gh', () => {
    setup({ origin: false });
    const { gh, calls } = fakeGh();
    const r = runBranchRename(repo, { kind: 'main', from: 'master', to: 'main' }, gh);
    expect(r.status).toBe('done');
    expect(r.done).toEqual(['local']);
    expect(r.otherClones).toEqual([]);
    expect(calls).toEqual([]);
    expect(git(repo, 'branch', '--show-current')).toBe('main');
  });
});

describe('comandos prontos', () => {
  it('develop não troca a branch padrão nem o origin/HEAD', () => {
    const cmds = manualCommands({ kind: 'develop', from: 'develop', to: 'dev' });
    expect(cmds).toEqual(['git branch -m develop dev', 'git push -u origin dev', 'git push origin --delete develop']);
    expect(remainingCommands({ kind: 'develop', from: 'develop', to: 'dev' }, ['upstream'])).toEqual(['git branch -u origin/dev dev']);
  });
});
