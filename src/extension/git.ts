import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WorkspaceMode } from '../shared/git';

const git = (cwd: string, args: string[]): string => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (e instanceof Error ? e.message : String(e)));
  }
};

const tryGit = (cwd: string, args: string[]): string | null => {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
};

const branchExists = (repo: string, branch: string): boolean =>
  tryGit(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) !== null;

/** Branch de onde as histórias partem: a padrão do remoto, senão main/master, senão a atual. */
export function baseBranch(repo: string): string {
  const remote = tryGit(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (remote) return remote;
  for (const name of ['main', 'master']) if (branchExists(repo, name)) return name;
  return git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

export interface PreparedWorkspace {
  branch: string;
  /** pasta em que o código da história deve ser alterado */
  path: string;
}

/**
 * Garante a branch da história e, no modo worktree, a pasta de trabalho dela. Pode ser chamada
 * várias vezes: o que já existe é reaproveitado. Nunca troca a branch da pasta do projeto.
 */
export function prepareWorkspace(input: {
  projectDir: string;
  mode: Exclude<WorkspaceMode, 'off'>;
  branch: string;
  worktreePath: string;
}): PreparedWorkspace {
  const repo = tryGit(input.projectDir, ['rev-parse', '--show-toplevel']);
  if (!repo) throw new Error('A pasta do projeto não é um repositório git.');
  if (tryGit(repo, ['rev-parse', '--verify', '--quiet', 'HEAD']) === null)
    throw new Error('O repositório ainda não tem nenhum commit: faça o primeiro commit antes de criar branches de histórias.');

  if (input.mode === 'branch') {
    if (!branchExists(repo, input.branch)) git(repo, ['branch', input.branch, baseBranch(repo)]);
    return { branch: input.branch, path: repo };
  }

  const dir = path.resolve(repo, input.worktreePath);
  const registered = git(repo, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .some((l) => l === `worktree ${fs.existsSync(dir) ? fs.realpathSync(dir) : dir}`);
  if (registered) return { branch: input.branch, path: dir };
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`A pasta ${dir} já existe e não é uma worktree deste repositório.`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  if (branchExists(repo, input.branch)) git(repo, ['worktree', 'add', dir, input.branch]);
  else git(repo, ['worktree', 'add', '-b', input.branch, dir, baseBranch(repo)]);
  return { branch: input.branch, path: dir };
}

/** Remove a worktree de uma história (a branch fica). Não faz nada se ela já não existe. */
export function removeWorktree(projectDir: string, worktreePath: string): void {
  if (!fs.existsSync(worktreePath)) return;
  git(projectDir, ['worktree', 'remove', worktreePath]);
}
