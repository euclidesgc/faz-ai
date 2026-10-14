/**
 * Limpeza da história depois do merge confirmado (#464): worktree, branch local, branch remota e a
 * `develop` local. Chamada pelo `AutoMerger` e pelo `MergeWatcher` (merge.ts) com o gitflow ligado.
 * Nada aqui lança para fora: o que falhar vira uma linha de aviso num único comentário na conversa
 * do card, gravado em português (a tela traduz, ver src/shared/gitNotices.ts).
 */
import * as fs from 'node:fs';
import { detectMainBranch, removeWorktree } from './git';
import type { MessageRouter } from './panel/messageRouter';
import { samePath } from './samePath';
import { BOARD_AUTHOR } from '../shared/gitflow';
import { fileList, gitNotice } from '../shared/gitNotices';
import { cardRef, type Card } from '../shared/model';

/** O que o board sabe do pull request da história, pelo `gh pr view --json`. */
export interface PullRequestFacts {
  url: string;
  /** OPEN | MERGED | CLOSED */
  state: string;
  mergedAt: string | null;
  /** '' quando o gh não informa */
  mergeCommit: string;
  /** '' quando o gh não informa */
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
}

/** Os campos pedidos ao `gh pr view --json`. */
export const PR_FIELDS = 'state,mergedAt,mergeCommit,baseRefName,headRefName,headRefOid';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Converte a saída do `gh`; qualquer coisa fora do formato esperado é falha de consulta, não "aberto". */
export function parsePullRequestFacts(out: string, url: string): PullRequestFacts {
  const unexpected = () => new Error(`resposta inesperada do gh: ${out.trim().slice(0, 200) || '(vazia)'}`);
  let data: unknown;
  try {
    data = JSON.parse(out);
  } catch {
    throw unexpected();
  }
  if (!data || typeof data !== 'object' || typeof (data as { state?: unknown }).state !== 'string') throw unexpected();
  const d = data as Record<string, unknown>;
  const oid = d.mergeCommit && typeof d.mergeCommit === 'object' ? (d.mergeCommit as { oid?: unknown }).oid : undefined;
  return {
    url,
    state: d.state as string,
    mergedAt: str(d.mergedAt) || null,
    mergeCommit: str(oid),
    baseRefName: str(d.baseRefName),
    headRefName: str(d.headRefName),
    headRefOid: str(d.headRefOid),
  };
}

export interface CleanupDeps {
  /** o `git` assíncrono do boardHost: resolve com a saída, rejeita com a mensagem do comando */
  git(args: string[], cwd: string): Promise<string>;
  /** idem para o `gh`; a parte 1 não o usa, a pilha e o hotfix (#480) usam */
  gh(args: string[], cwd: string): Promise<string>;
  log(line: string): void;
  /** pasta do projeto */
  cwd: string;
  removeWorktree?: (projectDir: string, worktreePath: string) => void;
  /** a principal do repositório; padrão `detectMainBranch(repo)` */
  mainBranch?: (repo: string) => string;
  /** espera entre as tentativas de merge da volta da principal (#480); nos testes, imediata */
  sleep?: (ms: number) => Promise<void>;
}

/** O que impede a limpeza de apagar: mudanças na worktree ou commits que não estão no pull request. */
export interface PendingWork {
  dirtyFiles: string[];
  extraCommits: number;
}

const WARNING = '**Aviso:**';

/** A primeira linha da mensagem de erro, até 200 caracteres: é o que entra em `{error}`. */
const errorLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim().slice(0, 200);

interface Worktree {
  path: string;
  /** '' com o HEAD destacado */
  branch: string;
}

/** As worktrees do repositório, pelo `git worktree list --porcelain`. */
async function listWorktrees(deps: CleanupDeps): Promise<Worktree[]> {
  const out = await deps.git(['worktree', 'list', '--porcelain'], deps.cwd);
  const list: Worktree[] = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const wt = lines.find((l) => l.startsWith('worktree '));
    if (!wt) continue;
    const branch = lines.find((l) => l.startsWith('branch refs/heads/'));
    list.push({ path: wt.slice('worktree '.length), branch: branch ? branch.slice('branch refs/heads/'.length) : '' });
  }
  return list;
}

/** o git lista o caminho real (links resolvidos): compara nas duas formas */
const isWorktree = (w: Worktree, dir: string): boolean => {
  const real = fs.existsSync(dir) ? fs.realpathSync.native(dir) : dir;
  return samePath(w.path, dir) || samePath(w.path, real);
};

const branchExists = async (deps: CleanupDeps, branch: string): Promise<boolean> => {
  try {
    await deps.git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], deps.cwd);
    return true;
  } catch {
    return false;
  }
};

/**
 * O que ainda está pendente na história: arquivos modificados ou não rastreados na worktree (o
 * `git worktree remove` recusa os dois) e commits da branch local fora do pull request. null quando
 * não há nada. Objeto do PR ausente localmente conta como commit fora dele: na dúvida, não apaga.
 */
export async function pendingWork(deps: CleanupDeps, repo: string, story: Card, pr: PullRequestFacts): Promise<PendingWork | null> {
  let dirtyFiles: string[] = [];
  if (story.worktreePath && !samePath(story.worktreePath, repo) && fs.existsSync(story.worktreePath)) {
    const out = await deps.git(['status', '--porcelain'], story.worktreePath);
    dirtyFiles = out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.slice(3).trim());
  }
  let extraCommits = 0;
  if (story.branch && (await branchExists(deps, story.branch))) {
    try {
      await deps.git(['merge-base', '--is-ancestor', `refs/heads/${story.branch}`, pr.headRefOid], repo);
    } catch {
      try {
        extraCommits = Math.max(
          1,
          Number((await deps.git(['rev-list', '--count', `${pr.headRefOid}..refs/heads/${story.branch}`], repo)).trim()) || 0,
        );
      } catch {
        extraCommits = 1;
      }
    }
  }
  return dirtyFiles.length || extraCommits ? { dirtyFiles, extraCommits } : null;
}

/**
 * Atualiza a `develop` local até `origin/<develop>`, só por fast-forward e sem trocar a branch de
 * nenhuma pasta. Devolve a linha do relatório; '' quando não há `develop` local (nada a atualizar).
 */
export async function updateDevelop(deps: CleanupDeps, develop: string): Promise<string> {
  if (!(await branchExists(deps, develop))) return '';
  try {
    // aberta em qualquer pasta (a do projeto ou uma worktree): o board não mexe nos arquivos dela (D5)
    const open = (await listWorktrees(deps)).find((w) => w.branch === develop);
    if (open) return gitNotice('develop.checkedOut', { develop, path: open.path });
    await deps.git(['fetch', '--quiet', 'origin', develop], deps.cwd);
    const ahead = Number((await deps.git(['rev-list', '--count', `origin/${develop}..${develop}`], deps.cwd)).trim());
    if (ahead > 0) return gitNotice('develop.ahead', { develop, count: ahead });
    const local = (await deps.git(['rev-parse', develop], deps.cwd)).trim();
    const remote = (await deps.git(['rev-parse', `origin/${develop}`], deps.cwd)).trim();
    if (local === remote) return gitNotice('develop.current', { develop });
    await deps.git(['fetch', '--quiet', 'origin', `${develop}:${develop}`], deps.cwd);
    return gitNotice('develop.updated', { develop });
  } catch (e) {
    return gitNotice('develop.failed', { develop, error: errorLine(e) });
  }
}

/**
 * Limpa a história concluída, na ordem: proteções (RF8), pendências (RF6), worktree (RF1), branch
 * local (RF2, RF7), branch remota (RF3, RF8), `develop` local (RF4, RF5). Nunca rejeita: cada passo
 * falha sozinho e vira aviso (RF9). Grava um único comentário, com os avisos antes do que foi feito.
 *
 * Pontos de extensão da parte 2 (#480): a troca de base das histórias empilhadas entra depois das
 * pendências e antes da worktree (e pode segurar a remota); a volta da principal para a `develop`
 * no hotfix (`pr.baseRefName === main`) entra depois da `develop`.
 */
export async function cleanUpStory(router: MessageRouter, deps: CleanupDeps, story: Card, pr: PullRequestFacts): Promise<void> {
  const ref = cardRef(story);
  const lines: string[] = [];
  const say = (line: string) => {
    if (line) lines.push(line);
  };
  const develop = router.snapshot().board.git.developBranch;
  const branch = story.branch;
  const projectDir = deps.cwd;

  try {
    const main = deps.mainBranch ? deps.mainBranch(projectDir) : (detectMainBranch(projectDir)?.name ?? '');
    const merged = pr.state === 'MERGED' || !!pr.mergedAt;
    // nunca apaga a principal, a develop nem uma branch que não seja a do card e a do pull request
    const safe = merged && !!branch && pr.headRefName === branch && branch !== main && branch !== develop;
    if (!merged) deps.log(`[${ref}] Limpeza pulada: o pull request ${pr.url} não está mesclado (${pr.state}).`);
    else if (!safe && branch) say(gitNotice('cleanup.headMismatch', { pr: pr.url, head: pr.headRefName, branch }));
    else if (!safe) deps.log(`[${ref}] Limpeza pulada: a história não tem branch registrada.`);

    let clean = false;
    if (safe) {
      try {
        const pending = await pendingWork(deps, projectDir, story, pr);
        if (!pending) clean = true;
        else if (pending.dirtyFiles.length)
          say(gitNotice('cleanup.dirty', { path: story.worktreePath, files: fileList(pending.dirtyFiles), branch }));
        else say(gitNotice('cleanup.unpushed', { branch, count: pending.extraCommits, pr: pr.url, path: story.worktreePath }));
      } catch (e) {
        // sem saber o que está pendente, não apaga; o git falhando aqui é raro e vai para o log
        deps.log(`[${ref}] Limpeza pulada: não deu para conferir as pendências (${errorLine(e)}).`);
      }
    }

    let worktrees = await listWorktrees(deps);
    let worktreeKept = false;
    if (
      clean &&
      story.worktreePath &&
      !samePath(story.worktreePath, projectDir) &&
      worktrees.some((w) => isWorktree(w, story.worktreePath))
    ) {
      try {
        (deps.removeWorktree ?? removeWorktree)(projectDir, story.worktreePath);
        router.handle({ type: 'card.workspace.clear', cardId: story.id });
        say(gitNotice('cleanup.worktreeRemoved', { path: story.worktreePath }));
        worktrees = await listWorktrees(deps);
      } catch (e) {
        worktreeKept = true;
        say(gitNotice('cleanup.worktreeFailed', { path: story.worktreePath, error: errorLine(e), branch }));
      }
    }

    if (clean && !worktreeKept && (await branchExists(deps, branch))) {
      const open = worktrees.find((w) => w.branch === branch);
      if (open && isWorktree(open, projectDir)) say(gitNotice('cleanup.localCheckedOut', { branch, path: projectDir, develop }));
      else if (open) say(gitNotice('cleanup.localInUse', { branch, path: open.path }));
      else {
        try {
          await deps.git(['branch', '-D', branch], projectDir);
          say(gitNotice('cleanup.localDeleted', { branch }));
        } catch (e) {
          say(gitNotice('cleanup.localFailed', { branch, error: errorLine(e) }));
        }
      }
    }

    let hasOrigin = true;
    try {
      await deps.git(['remote', 'get-url', 'origin'], projectDir);
    } catch {
      hasOrigin = false;
      say(gitNotice('cleanup.noOrigin', { develop }));
    }

    if (clean && hasOrigin) {
      try {
        const remote = (await deps.git(['ls-remote', '--heads', 'origin', branch], projectDir)).trim();
        const sha = remote.split(/\s+/)[0] ?? '';
        if (!remote) say(gitNotice('cleanup.remoteGone', { branch }));
        else if (sha !== pr.headRefOid) say(gitNotice('cleanup.remoteMoved', { branch, pr: pr.url }));
        else {
          await deps.git(['push', '--quiet', 'origin', '--delete', branch], projectDir);
          say(gitNotice('cleanup.remoteDeleted', { branch }));
        }
      } catch (e) {
        say(gitNotice('cleanup.remoteFailed', { branch, error: errorLine(e) }));
      }
    }

    if (hasOrigin) say(await updateDevelop(deps, develop));
  } catch (e) {
    deps.log(`[${ref}] Falha inesperada na limpeza: ${errorLine(e)}`);
  }

  const warnings = lines.filter((l) => l.startsWith(WARNING));
  const done = lines.filter((l) => !l.startsWith(WARNING));
  const body = [gitNotice('cleanup.title'), ...[...warnings, ...done].map((l) => `- ${l}`)].join('\n');
  router.handle({ type: 'comment.add', cardId: story.id, body }, { author: BOARD_AUTHOR, source: 'ai' });
  deps.log(`[${ref}] Limpeza da história: ${done.length} passo(s), ${warnings.length} aviso(s).`);
}
