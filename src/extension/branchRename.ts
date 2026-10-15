import { execFileSync } from 'node:child_process';
import { FETCH_TIMEOUT_MS, git, tryGit, branchExists, hasOrigin, remoteBranchExists } from './git';
import {
  manualCommands,
  otherCloneCommands,
  remainingCommands,
  type RenameOutcome,
  type RenameRequest,
  type RenameStep,
} from '../shared/branchRename';

/** Roda o `gh` na pasta do repositório e devolve a saída; rejeita com a mensagem dele (ou "não encontrado"). */
export type GhRunner = (args: string[], cwd: string) => string;

/**
 * `git fetch --prune origin`, sem pedir senha e com limite de tempo: o prune tira da cópia local a
 * referência do nome antigo, que é o que diz se o remoto já foi renomeado. null quando atualizou;
 * senão, a mensagem do git.
 */
function fetchPruned(repo: string): string | null {
  try {
    git(repo, ['fetch', '--quiet', '--prune', 'origin'], { timeout: FETCH_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return null;
  } catch (e) {
    return e instanceof Error && e.message ? e.message : String(e);
  }
}

/** O `origin` (URL ou caminho) termina em `dono/repositório`, sem diferenciar maiúsculas nem o `.git`. */
const isRepo = (url: string, nameWithOwner: string): boolean =>
  url
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .replace(/:/g, '/')
    .toLowerCase()
    .endsWith(`/${nameWithOwner.toLowerCase()}`);

const message = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));

/** O repositório (raiz) da pasta do projeto, ou null fora de um repositório git. */
const repoOf = (projectDir: string): string | null => tryGit(projectDir, ['rev-parse', '--show-toplevel']);

/**
 * RF1: a renomeação cabe quando o nome novo não existe (nem local nem no `origin`, como o git local
 * enxerga) e o antigo existe. Sem rede: usa as refs que já estão no clone.
 */
export function renameNeeded(projectDir: string, from: string, to: string): boolean {
  const repo = repoOf(projectDir);
  if (!repo || !from || !to || from === to) return false;
  const has = (b: string) => branchExists(repo, b) || remoteBranchExists(repo, b);
  return !has(to) && has(from);
}

/**
 * Renomeia `from` para `to` no GitHub (pelo `gh`), no clone, no upstream e, na principal, no
 * `origin/HEAD`. O remoto vem primeiro: se ele falhar, nada local muda. Cada passo confere o estado
 * antes de agir, então repetir depois de uma falha só faz o que faltava (RF8). Chamar só depois da
 * confirmação da pessoa: é a única função do board que renomeia branches.
 *
 * Sem `gh`, fora do GitHub ou sem poder descobrir o repositório, nada é executado: devolve `manual`
 * com os comandos prontos.
 */
export function runBranchRename(projectDir: string, req: RenameRequest, gh: GhRunner): RenameOutcome {
  const repo = repoOf(projectDir);
  const outcome = (status: RenameOutcome['status'], extra: Partial<RenameOutcome> = {}): RenameOutcome => ({
    status,
    request: req,
    done: [],
    commands: [],
    otherClones: [],
    ...extra,
  });
  if (!repo || !req.from || !req.to || req.from === req.to) return outcome('nothing');
  const origin = hasOrigin(repo);
  const done: RenameStep[] = [];
  const others = origin ? otherCloneCommands(req) : [];
  const failed = (step: RenameStep, error: string, remaining: RenameStep[]): RenameOutcome =>
    outcome('failed', {
      done,
      failed: { step, error },
      // falha antes de qualquer mudança (o remoto, ou o fetch inicial): todos os comandos, na ordem manual
      commands: step === 'remote' || (step === 'fetch' && !done.length) ? manualCommands(req) : remainingCommands(req, remaining),
      otherClones: others,
    });

  if (origin) {
    // as refs do origin atualizadas: é o que diz se o remoto já foi renomeado (repetir é seguro)
    const fetched = fetchPruned(repo);
    if (fetched)
      return failed('fetch', fetched, ['fetch', 'remote', 'local', 'upstream', ...(req.kind === 'main' ? (['head'] as const) : [])]);
  }
  const localFrom = branchExists(repo, req.from);
  const localTo = branchExists(repo, req.to);
  const remoteFrom = origin && remoteBranchExists(repo, req.from);
  const remoteTo = origin && remoteBranchExists(repo, req.to);
  // o nome novo já é de outra branch: não há renomeação (e nunca se sobrescreve uma branch)
  if ((localFrom && localTo) || (remoteFrom && remoteTo)) return outcome('nothing');
  const needRemote = remoteFrom && !remoteTo;
  const needLocal = localFrom && !localTo;
  const tail: RenameStep[] = ['local', 'upstream', ...(req.kind === 'main' && origin ? (['head'] as const) : [])];

  if (needRemote) {
    let nameWithOwner: string;
    try {
      nameWithOwner = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], repo).trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(nameWithOwner)) throw new Error(`repositório não reconhecido: ${nameWithOwner || '(vazio)'}`);
      // o `gh` pode preferir outro remoto (o `upstream` de um fork): só age no repositório do `origin`
      const url = tryGit(repo, ['remote', 'get-url', 'origin']) ?? '';
      if (!isRepo(url, nameWithOwner)) throw new Error(`o gh aponta para ${nameWithOwner}, que não é o repositório do origin (${url})`);
    } catch (e) {
      // sem gh, sem login ou remoto que não é GitHub: o board não age no remoto, nem no clone
      return outcome('manual', { reason: message(e), commands: manualCommands(req), otherClones: others });
    }
    // POST /repos/{owner}/{repo}/branches/{branch}/rename, corpo `new_name` (API REST do GitHub, "Rename a
    // branch"): a documentação diz que PRs abertos e a branch padrão acompanham o novo nome. Conferido na
    // documentação, não testado com uma conta real.
    try {
      gh(['api', '-X', 'POST', `repos/${nameWithOwner}/branches/${encodeURIComponent(req.from)}/rename`, '-f', `new_name=${req.to}`], repo);
    } catch (e) {
      return failed('remote', message(e), []);
    }
    done.push('remote');
    const again = fetchPruned(repo);
    if (again) return failed('fetch', again, ['fetch', ...tail]);
  }

  if (needLocal) {
    try {
      git(repo, ['branch', '-m', req.from, req.to]);
    } catch (e) {
      return failed('local', message(e), tail);
    }
    done.push('local');
  }

  if (origin && branchExists(repo, req.to) && remoteBranchExists(repo, req.to)) {
    const upstream = tryGit(repo, ['rev-parse', '--abbrev-ref', `${req.to}@{upstream}`]);
    if (upstream !== `origin/${req.to}`) {
      try {
        git(repo, ['branch', '-u', `origin/${req.to}`, req.to]);
      } catch (e) {
        return failed('upstream', message(e), tail.slice(1));
      }
      done.push('upstream');
    }
  }

  if (origin && req.kind === 'main' && remoteBranchExists(repo, req.to)) {
    const head = tryGit(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    if (head !== `origin/${req.to}`) {
      try {
        git(repo, ['remote', 'set-head', 'origin', req.to]);
      } catch (e) {
        return failed('head', message(e), ['head']);
      }
      done.push('head');
    }
  }

  return done.length ? outcome('done', { done, otherClones: others }) : outcome('nothing');
}

/**
 * O `gh` como processo, para o produto: sai pelo PATH de `env` (a extensão herda um PATH curto quando o
 * editor abre pelo menu) e com limite de tempo. Falha com a mensagem do `gh`.
 */
export function ghProcess(env: () => NodeJS.ProcessEnv = () => process.env): GhRunner {
  return (args, cwd) => {
    try {
      return execFileSync('gh', args, { cwd, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'], env: env() });
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { stderr?: string };
      if (err.code === 'ENOENT')
        throw new Error('o comando "gh" não foi encontrado (instale a CLI do GitHub e faça login com gh auth login).');
      throw new Error(err.stderr?.trim() || err.message);
    }
  };
}
