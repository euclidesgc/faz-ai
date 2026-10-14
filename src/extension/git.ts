import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { samePath } from './samePath';
import type { MainBranch, WorkspaceMode } from '../shared/git';
import type { GitNotice } from '../shared/gitflow';

/** Limite do `git fetch origin` antes de criar uma branch: o host fica travado esse tempo (#462, Riscos). */
export const FETCH_TIMEOUT_MS = 20_000;

const git = (cwd: string, args: string[], opts: { timeout?: number; env?: NodeJS.ProcessEnv } = {}): string => {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: opts.timeout ?? 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: opts.env,
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string; killed?: boolean; signal?: string };
    // o Node mata o processo por tempo sem mensagem no stderr: o aviso precisa dizer o porquê
    if (err.killed || err.signal === 'SIGTERM') throw new Error(`tempo esgotado após ${opts.timeout ?? 30_000} ms`);
    const stderr = err.stderr?.trim();
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

const remoteBranchExists = (repo: string, branch: string): boolean =>
  tryGit(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]) !== null;

const hasOrigin = (repo: string): boolean => tryGit(repo, ['remote', 'get-url', 'origin']) !== null;

/**
 * A branch principal do repositório, sem rede (RF09): o HEAD do origin; senão main ou master, local
 * ou já baixada do origin; senão a branch atual. null fora de um repositório git.
 */
export function detectMainBranch(projectDir: string): MainBranch | null {
  const repo = tryGit(projectDir, ['rev-parse', '--show-toplevel']);
  if (!repo) return null;
  const remote = tryGit(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (remote) return { name: remote.replace(/^origin\//, ''), source: 'origin' };
  for (const name of ['main', 'master']) if (branchExists(repo, name) || remoteBranchExists(repo, name)) return { name, source: 'name' };
  // symbolic-ref enxerga a branch mesmo sem commit; HEAD destacado devolve 'HEAD', como antes do gitflow
  const current = tryGit(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']) ?? 'HEAD';
  return { name: current, source: 'current' };
}

/**
 * `git fetch origin` com limite de tempo e sem pedir senha (GIT_TERMINAL_PROMPT=0): a extensão não
 * tem terminal para responder. 'noOrigin' sem origin; a mensagem do git quando falha; null quando atualizou.
 */
export function fetchOrigin(repo: string): null | 'noOrigin' | string {
  if (!hasOrigin(repo)) return 'noOrigin';
  try {
    git(repo, ['fetch', '--quiet', 'origin'], { timeout: FETCH_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return null;
  } catch (e) {
    return e instanceof Error && e.message ? e.message : String(e);
  }
}

export interface PreparedWorkspace {
  branch: string;
  /** pasta em que o código da história deve ser alterado */
  path: string;
  /** branch de onde a da história partiu (nome curto, sem 'origin/'): a anterior da pilha ou a base */
  base: string;
  /** o que merece um aviso na conversa da história (sem origin, fetch que falhou, develop criada...) */
  notices: GitNotice[];
}

/** De onde a branch nova parte: a ref do origin quando existe, senão a local. */
function startPointOf(repo: string, branch: string): string | null {
  if (remoteBranchExists(repo, branch)) return `origin/${branch}`;
  if (branchExists(repo, branch)) return branch;
  return null;
}

/**
 * Resolve o ponto de partida de uma branch nova (ver o fluxograma do SPEC da #462): a anterior da
 * pilha, senão a base, criando a develop quando ela não existe em lugar nenhum. Só cria a develop e,
 * nela, faz `push -u origin` sem força: nada mais é apagado, renomeado nem reescrito (RF17).
 */
function resolveStart(
  repo: string,
  input: { branch: string; stack?: string; base: string; developFrom?: string },
  notices: GitNotice[],
): { start: string; base: string } {
  if (input.stack) {
    // a branch anterior da pilha, de preferência a local, que é onde a IA acabou de trabalhar
    const stacked = branchExists(repo, input.stack) ? input.stack : remoteBranchExists(repo, input.stack) ? `origin/${input.stack}` : null;
    if (stacked) return { start: stacked, base: input.stack };
  }
  let start = startPointOf(repo, input.base);
  let created = false;
  if (!start && input.developFrom) {
    created = true;
    const main = startPointOf(repo, input.developFrom);
    if (!main) throw new Error(`A branch ${input.developFrom} não existe neste repositório nem no origin.`);
    git(repo, ['branch', '--no-track', input.base, main]);
    if (!hasOrigin(repo)) {
      // sem origin não há para onde enviar: o aviso de noOrigin, adiante, já explica
      notices.push({ kind: 'developLocalOnly', develop: input.base, main: input.developFrom, error: 'o repositório não tem origin' });
    } else {
      try {
        git(repo, ['push', '-u', 'origin', input.base], { timeout: FETCH_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
        notices.push({ kind: 'developCreated', develop: input.base, main: input.developFrom });
      } catch (e) {
        notices.push({
          kind: 'developLocalOnly',
          develop: input.base,
          main: input.developFrom,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    start = startPointOf(repo, input.base);
  }
  if (!start) throw new Error(`A branch ${input.base} não existe neste repositório nem no origin.`);
  // develop que já existia só nesta máquina, com origin: o pull request para ela não abre; o aviso traz o
  // comando, e o board não a envia sozinho (RF17). A recém-criada já avisou (developLocalOnly) se o push falhou.
  if (input.developFrom && !created && start === input.base && hasOrigin(repo))
    notices.push({ kind: 'developNotPushed', develop: input.base });
  return { start, base: input.base };
}

/**
 * Garante a branch da história e, no modo worktree, a pasta de trabalho dela. Pode ser chamada
 * várias vezes: o que já existe é reaproveitado, sem fetch. Nunca troca a branch da pasta do projeto.
 */
export function prepareWorkspace(input: {
  projectDir: string;
  mode: Exclude<WorkspaceMode, 'off'>;
  branch: string;
  worktreePath: string;
  /** branch da história anterior (pilha); vale se existir local ou no origin */
  stack?: string;
  /** base fora da pilha: a develop, a principal ou a base já gravada */
  base: string;
  /** a base é a develop do gitflow: criada a partir desta principal quando não existe em lugar nenhum */
  developFrom?: string;
}): PreparedWorkspace {
  const repo = tryGit(input.projectDir, ['rev-parse', '--show-toplevel']);
  if (!repo) throw new Error('A pasta do projeto não é um repositório git.');
  if (tryGit(repo, ['rev-parse', '--verify', '--quiet', 'HEAD']) === null)
    throw new Error('O repositório ainda não tem nenhum commit: faça o primeiro commit antes de criar branches de histórias.');

  const notices: GitNotice[] = [];
  // a branch nova parte do que está no origin: o fetch só roda aqui, uma vez por história
  const createBranch = (): { start: string; base: string } => {
    const fetched = fetchOrigin(repo);
    const resolved = resolveStart(repo, input, notices);
    if (fetched === 'noOrigin') notices.push({ kind: 'noOrigin', branch: input.branch, base: resolved.base });
    else if (fetched) notices.push({ kind: 'fetchFailed', branch: input.branch, base: resolved.base, error: fetched });
    return resolved;
  };

  if (input.mode === 'branch') {
    if (branchExists(repo, input.branch)) return { branch: input.branch, path: repo, base: '', notices };
    const { start, base } = createBranch();
    // --no-track: com push.default=upstream, um `git push` iria para a develop ou para a principal
    git(repo, ['branch', '--no-track', input.branch, start]);
    return { branch: input.branch, path: repo, base, notices };
  }

  const dir = path.resolve(repo, input.worktreePath);
  // o git lista com `/` (também no Windows) e o caminho real (links resolvidos): compara na mesma forma
  const real = fs.existsSync(dir) ? fs.realpathSync.native(dir) : dir;
  const registered = git(repo, ['worktree', 'list', '--porcelain'])
    .split(/\r?\n/)
    .some((l) => l.startsWith('worktree ') && (samePath(l.slice('worktree '.length), real) || samePath(l.slice('worktree '.length), dir)));
  if (registered) return { branch: input.branch, path: dir, base: '', notices };
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`A pasta ${dir} já existe e não é uma worktree deste repositório.`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  if (branchExists(repo, input.branch)) {
    git(repo, ['worktree', 'add', dir, input.branch]);
    return { branch: input.branch, path: dir, base: '', notices };
  }
  const { start, base } = createBranch();
  git(repo, ['worktree', 'add', '--no-track', '-b', input.branch, dir, start]);
  return { branch: input.branch, path: dir, base, notices };
}

/** Remove a worktree de uma história (a branch fica). Não faz nada se ela já não existe. */
export function removeWorktree(projectDir: string, worktreePath: string): void {
  if (!fs.existsSync(worktreePath)) {
    // a pasta já foi apagada à mão: tira o registro que sobrou, para o nome poder ser usado de novo
    tryGit(projectDir, ['worktree', 'prune']);
    return;
  }
  try {
    git(projectDir, ['worktree', 'remove', worktreePath]);
  } catch (e) {
    // um arquivo preso (outra janela, um processo ainda rodando, o antivírus no Windows) pode deixar
    // a pasta pela metade: o registro sai, e a mensagem do git segue como veio
    tryGit(projectDir, ['worktree', 'prune']);
    throw e;
  }
}
