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
import { BOARD_AUTHOR, prBaseOf } from '../shared/gitflow';
import { fileList, gitNotice } from '../shared/gitNotices';
import { cardRef, type Card } from '../shared/model';
import { columnOf, isLive } from '../shared/selectors';

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
  /** MERGEABLE | CONFLICTING | UNKNOWN; '' quando o gh não informa */
  mergeable: string;
}

/** Os campos pedidos ao `gh pr view --json`. */
export const PR_FIELDS = 'state,mergedAt,mergeCommit,baseRefName,headRefName,headRefOid,mergeable';

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
    mergeable: str(d.mergeable),
  };
}

export interface CleanupDeps {
  /** o `git` assíncrono do boardHost: resolve com a saída, rejeita com a mensagem do comando */
  git(args: string[], cwd: string): Promise<string>;
  /** idem para o `gh`: a troca de base dos pull requests da pilha e a volta da principal no hotfix (#480) */
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

/** Resultado da troca de base das histórias empilhadas (#480, RF11/RF12). */
export interface Restack {
  /** motivo para manter a branch remota da concluída: um pull request seguinte ainda a usa como base */
  keepRemote: string | null;
  /** linhas para o relatório da concluída (só avisos) */
  lines: string[];
}

/** O PR só é editado se estiver aberto; se o `gh pr view` falhar, trata como não aberto (sem aviso). */
async function prIsOpen(deps: CleanupDeps, url: string): Promise<boolean> {
  try {
    const raw = await deps.gh(['pr', 'view', url, '--json', 'state'], deps.cwd);
    return (JSON.parse(raw) as { state?: string }).state === 'OPEN';
  } catch (e) {
    deps.log(`Não deu para conferir o estado de ${url} (${errorLine(e)}); o PR não será editado.`);
    return false;
  }
}

/**
 * Passa para `newBase` a base das histórias empilhadas sobre a concluída: as vivas, sem pai, fora da conclusão e
 * com `baseBranch === story.branch`. Grava a base pela mensagem `card.baseBranch.set` e, quando a seguinte tem pull
 * request aberto, troca a base dele com `gh pr edit`. Se o `gh` falhar, a remota da concluída precisa ficar (o GitHub
 * fecharia o PR dependente) e as duas conversas avisam. Cada seguinte recebe um comentário explicando a troca.
 */
export async function restackFollowers(router: MessageRouter, deps: CleanupDeps, story: Card, newBase: string): Promise<Restack> {
  const out: Restack = { keepRemote: null, lines: [] };
  if (!story.branch || !newBase || newBase === story.branch) return out;
  const s = router.snapshot();
  const followers = s.cards.filter(
    (c) => c.id !== story.id && !c.parentId && isLive(c) && columnOf(s, c)?.category === 'open' && c.baseBranch === story.branch,
  );
  for (const next of followers) {
    const parts = [gitNotice('stack.moved', { prev: story.number, old: story.branch, base: newBase })];
    router.handle({ type: 'card.baseBranch.set', cardId: next.id, base: newBase });
    if (next.prUrl && (await prIsOpen(deps, next.prUrl))) {
      try {
        await deps.gh(['pr', 'edit', next.prUrl, '--base', newBase], deps.cwd);
        parts.push(gitNotice('stack.prMoved', { pr: next.prUrl, base: newBase }));
      } catch (e) {
        const error = errorLine(e);
        parts.push(gitNotice('stack.prFailed', { pr: next.prUrl, base: newBase, error }));
        out.keepRemote ??= error;
        out.lines.push(
          gitNotice('cleanup.remoteStillBase', { branch: story.branch, nextPr: next.prUrl, number: next.number, base: newBase }),
        );
      }
    }
    router.handle({ type: 'comment.add', cardId: next.id, body: parts.join('\n\n') }, { author: BOARD_AUTHOR, source: 'ai' });
    deps.log(`[${cardRef(story)}] Base de ${cardRef(next)} passou de ${story.branch} para ${newBase}.`);
  }
  return out;
}

const parseJson = (out: string): unknown => {
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
};

/**
 * Volta da principal para a `develop` depois de um hotfix (#480, RF14/RF15): com a `develop` já contendo a `main`
 * não faz nada; senão reaproveita o pull request aberto de `main` para `develop` ou abre um, e o mescla com merge
 * commit (`--merge`, nunca `--delete-branch`), em até 3 tentativas. Conflito deixa o PR aberto e avisa. Devolve a
 * linha do relatório.
 */
export async function backMergeMain(deps: CleanupDeps, main: string, develop: string, story: Card, pr: PullRequestFacts): Promise<string> {
  const cwd = deps.cwd;
  try {
    await deps.git(['fetch', '--quiet', 'origin', main, develop], cwd);
    try {
      await deps.git(['merge-base', '--is-ancestor', `origin/${main}`, `origin/${develop}`], cwd);
      return gitNotice('back.already', { main, develop });
    } catch {
      /* a develop ainda não contém a main: segue para o pull request */
    }
  } catch (e) {
    return gitNotice('back.createFailed', { main, develop, error: errorLine(e) });
  }

  let url = '';
  try {
    const list = parseJson(await deps.gh(['pr', 'list', '--base', develop, '--head', main, '--state', 'open', '--json', 'url'], cwd));
    const first = Array.isArray(list) ? (list[0] as { url?: unknown } | undefined) : undefined;
    url = str(first?.url);
  } catch (e) {
    deps.log(`[${cardRef(story)}] gh pr list falhou (${errorLine(e)}); tentando abrir o pull request de volta.`);
  }
  if (!url) {
    try {
      const out = await deps.gh(
        [
          'pr',
          'create',
          '--base',
          develop,
          '--head',
          main,
          '--title',
          gitNotice('back.prTitle', { main, develop, number: story.number }),
          '--body',
          gitNotice('back.prBody', { pr: pr.url, main, develop }),
        ],
        cwd,
      );
      // o gh imprime o endereço do pull request na última linha
      url =
        out
          .trim()
          .split(/\r?\n/)
          .reverse()
          .find((l) => /^https?:\/\//.test(l.trim()))
          ?.trim() ?? '';
      if (!url) throw new Error(`resposta inesperada do gh: ${out.trim().slice(0, 200) || '(vazia)'}`);
    } catch (e) {
      return gitNotice('back.createFailed', { main, develop, error: errorLine(e) });
    }
  }

  let error = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await deps.gh(['pr', 'merge', url, '--merge'], cwd);
      return gitNotice('back.merged', { main, develop, url });
    } catch (e) {
      error = errorLine(e);
      // logo depois de criado o GitHub ainda calcula o mergeable (UNKNOWN): espera e tenta de novo
      if (attempt < 3) await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(5000);
    }
  }
  try {
    const view = parseJson(await deps.gh(['pr', 'view', url, '--json', 'mergeable,state'], cwd)) as { mergeable?: unknown } | undefined;
    if (view?.mergeable === 'CONFLICTING') return gitNotice('back.conflict', { main, develop, url });
  } catch {
    /* sem a razão, o aviso genérico serve */
  }
  return gitNotice('back.notMerged', { main, develop, url, error });
}

/**
 * Limpa a história concluída, na ordem: proteções (RF8), pendências (RF6), worktree (RF1), branch
 * local (RF2, RF7), branch remota (RF3, RF8), `develop` local (RF4, RF5). Nunca rejeita: cada passo
 * falha sozinho e vira aviso (RF9). Grava um único comentário, com os avisos antes do que foi feito.
 *
 * Parte 2 (#480): a troca de base das histórias empilhadas (RF11, RF12) entra depois das pendências e
 * antes da worktree, mesmo com pendência (o merge já aconteceu), e pode segurar a remota; a volta da
 * principal para a `develop` no hotfix (`pr.baseRefName === main`, RF14–RF16) entra depois da `develop`.
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

    // a pilha é refeita antes de apagar a branch: a base das seguintes passa para a base real do PR (D3)
    let keepRemote: string | null = null;
    if (safe) {
      const newBase = pr.baseRefName || story.baseBranch || prBaseOf(router.snapshot(), story)?.baseBranch || '';
      const restack = await restackFollowers(router, deps, story, newBase);
      keepRemote = restack.keepRemote;
      restack.lines.forEach(say);
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

    if (clean && hasOrigin && keepRemote) deps.log(`[${ref}] Branch remota ${branch} mantida: ${keepRemote}`);
    if (clean && hasOrigin && !keepRemote) {
      try {
        // `refs/heads/` casa o nome exato; só o nome casaria também `outra/<branch>` pelo fim
        const remote = (await deps.git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], projectDir)).trim();
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
    // hotfix: a base real do PR é a principal, e a develop precisa receber a correção (RF14)
    if (merged && hasOrigin && main && pr.baseRefName === main && develop !== main)
      say(await backMergeMain(deps, main, develop, story, pr));
  } catch (e) {
    deps.log(`[${ref}] Falha inesperada na limpeza: ${errorLine(e)}`);
  }

  const warnings = lines.filter((l) => l.startsWith(WARNING));
  const done = lines.filter((l) => !l.startsWith(WARNING));
  const body = [gitNotice('cleanup.title'), ...[...warnings, ...done].map((l) => `- ${l}`)].join('\n');
  router.handle({ type: 'comment.add', cardId: story.id, body }, { author: BOARD_AUTHOR, source: 'ai' });
  deps.log(`[${ref}] Limpeza da história: ${done.length} passo(s), ${warnings.length} aviso(s).`);
}
