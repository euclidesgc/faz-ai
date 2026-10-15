/**
 * Branches e worktrees órfãs (#465): as que o board criou e cuja história já terminou ou não existe.
 * Puro: o host coleta os fatos do git (`GitFacts`) e esta função decide o que é seguro limpar e o que
 * depende de uma pessoa. Sem `vscode`, banco nem `node:*`.
 */
import { PROTECTED_BRANCH, branchMatcher } from './git';
import type { BoardState, Card } from './model';
import { childrenOf, columnOf, isAiWorking, isLive } from './selectors';
import { stackBaseOf } from './story';

export type OrphanKind = 'worktree' | 'branch';
/** Em que pé está a história dona. 'unknown' = nenhum card do board tem esse número; 'missing' = a pasta da worktree sumiu. */
export type OrphanSituation = 'merged' | 'cancelled' | 'done' | 'archived' | 'deleted' | 'unknown' | 'missing';
export type OrphanVerdict = 'safe' | 'decision';
/** Por que não é segura: arquivos não commitados, commits só nesta branch, dono desconhecido ou branch ainda em uso por uma worktree. */
export type OrphanBlocker = 'dirty' | 'unique' | 'unknown-card' | 'in-use';
/** O que prova que remover não perde nada. */
export type OrphanProof = 'clean' | 'no-unique-commits' | 'merge-commit';

export interface OrphanItem {
  /** estável entre varreduras: `branch:<nome>` ou `worktree:<caminho>` */
  id: string;
  kind: OrphanKind;
  /** a branch (kind branch) ou o caminho da pasta (kind worktree) */
  ref: string;
  /** a branch que a worktree tem em uso, quando há */
  branch: string | null;
  /** número do card dono; null quando não há card com esse número */
  cardNumber: number | null;
  situation: OrphanSituation;
  verdict: OrphanVerdict;
  /** presente quando verdict = safe */
  proof: OrphanProof | null;
  blockers: OrphanBlocker[];
  /** o que se perde se limpar mesmo assim: os dois números que a tela mostra e o host revalida */
  dirtyFiles: number;
  uniqueCommits: number;
}

export interface OrphanReport {
  items: OrphanItem[];
  /** última falha de remoção por `id` (item "não removido") */
  failed: Record<string, string>;
  /** ms da última varredura; null antes da primeira */
  scannedAt: number | null;
}
export const EMPTY_ORPHANS: OrphanReport = { items: [], failed: {}, scannedAt: null };

export interface WorktreeFact {
  path: string;
  branch: string | null;
  /** a pasta existe no disco; false = só o registro do git ficou */
  exists: boolean;
  /** arquivos não commitados (rastreados ou não) */
  dirtyFiles: number;
}

export interface BranchFact {
  name: string;
  /** commits alcançáveis só por esta branch (fora de qualquer outra branch local e de qualquer remota) */
  uniqueCommits: number;
  /** o `mergeCommit` do card dono está na história da base e a ponta da branch não é mais nova que ele */
  mergeProof: boolean;
}

/** O que o git diz, coletado pelo host e entregue já em números. */
export interface GitFacts {
  mode: 'worktree' | 'branch';
  /** a branch principal do repositório */
  base: string;
  /** sem a principal; só as dentro da pasta do board */
  worktrees: WorktreeFact[];
  /** branches em uso por qualquer worktree (inclui a principal e as de fora da pasta do board) */
  checkedOut: string[];
  /** só as candidatas por nome */
  branches: BranchFact[];
}

const sameBranch = (c: Card, branch: string): boolean => c.branch !== '' && c.branch === branch;

/** O número que o nome da branch traz, pelo padrão configurado. */
const numberIn = (state: BoardState, branch: string): number | null => branchMatcher(state.board.git.branchPattern)(branch);

/**
 * A história dona da branch: a que a tem registrada em `card.branch`; senão a de mesmo número no nome
 * (só história: sub-tarefa não cria branch). Null quando nenhuma serve.
 */
export function ownerOf(state: BoardState, branch: string): Card | null {
  const registered = state.cards.find((c) => !c.parentId && sameBranch(c, branch));
  if (registered) return registered;
  const n = numberIn(state, branch);
  if (n === null) return null;
  return state.cards.find((c) => !c.parentId && c.number === n) ?? null;
}

/** As branches que o board teria criado: casam com o padrão ou são `card.branch` de algum card. */
export function candidateBranches(state: BoardState, all: string[]): string[] {
  const registered = new Set(state.cards.filter((c) => c.branch !== '').map((c) => c.branch));
  const matches = branchMatcher(state.board.git.branchPattern);
  return all.filter((b) => !PROTECTED_BRANCH.test(b) && (registered.has(b) || matches(b) !== null));
}

/** A história ainda anda: viva numa coluna em aberto, ou com a IA nela ou em alguma sub-tarefa. */
function isActive(state: BoardState, story: Card): boolean {
  if (isLive(story) && columnOf(state, story)?.category === 'open') return true;
  return isAiWorking(state, story) || childrenOf(state, story.id).some((c) => isAiWorking(state, c));
}

function situationOf(state: BoardState, story: Card | null): OrphanSituation {
  if (!story) return 'unknown';
  if (story.mergeCommit !== '') return 'merged';
  if (story.deletedAt !== null) return 'deleted';
  if (story.archivedAt !== null) return 'archived';
  return columnOf(state, story)?.category === 'cancelled' ? 'cancelled' : 'done';
}

/** Branches que nunca são órfãs: a principal, a develop, as em uso fora da pasta do board e as bases de histórias ativas (a pilha de PRs). */
function protectedBranches(state: BoardState, facts: GitFacts): (branch: string) => boolean {
  const inBoard = new Set(facts.worktrees.map((w) => w.branch).filter((b): b is string => !!b));
  const names = new Set<string>([facts.base, state.board.git.developBranch, ...facts.checkedOut.filter((b) => !inBoard.has(b))]);
  if (state.mainBranch) names.add(state.mainBranch.name);
  for (const story of state.cards) {
    if (story.parentId || !isLive(story) || !isActive(state, story)) continue;
    if (story.baseBranch) names.add(story.baseBranch);
    const stackBase = stackBaseOf(state, story)?.branch;
    if (stackBase) names.add(stackBase);
  }
  return (branch) => PROTECTED_BRANCH.test(branch) || names.has(branch);
}

/** Os itens órfãos e o veredito de cada um: `safe` pode ser limpo sozinho; `decision` espera a pessoa. */
export function detectOrphans(state: BoardState, facts: GitFacts): OrphanItem[] {
  const isProtected = protectedBranches(state, facts);
  const inUse = new Set(facts.worktrees.map((w) => w.branch).filter((b): b is string => !!b));
  const items: OrphanItem[] = [];

  // no modo "branch" não há pasta do board: a lista de worktrees é ignorada
  for (const w of facts.mode === 'worktree' ? facts.worktrees : []) {
    if (w.branch && isProtected(w.branch)) continue;
    const owner = (w.branch ? ownerOf(state, w.branch) : null) ?? state.cards.find((c) => !c.parentId && c.worktreePath === w.path) ?? null;
    if (owner && isActive(state, owner)) continue;
    const blockers: OrphanBlocker[] = [];
    if (w.exists && w.dirtyFiles > 0) blockers.push('dirty');
    if (w.exists && !owner) blockers.push('unknown-card');
    items.push({
      id: `worktree:${w.path}`,
      kind: 'worktree',
      ref: w.path,
      branch: w.branch,
      cardNumber: owner?.number ?? null,
      situation: w.exists ? situationOf(state, owner) : 'missing',
      verdict: blockers.length ? 'decision' : 'safe',
      proof: blockers.length ? null : 'clean',
      blockers,
      dirtyFiles: w.dirtyFiles,
      uniqueCommits: 0,
    });
  }

  for (const b of facts.branches) {
    if (isProtected(b.name)) continue;
    const owner = ownerOf(state, b.name);
    if (owner && isActive(state, owner)) continue;
    const blocker: OrphanBlocker | null = inUse.has(b.name)
      ? 'in-use'
      : !owner
        ? 'unknown-card'
        : b.uniqueCommits > 0 && !b.mergeProof
          ? 'unique'
          : null;
    items.push({
      id: `branch:${b.name}`,
      kind: 'branch',
      ref: b.name,
      branch: b.name,
      cardNumber: owner?.number ?? null,
      situation: situationOf(state, owner),
      verdict: blocker ? 'decision' : 'safe',
      proof: blocker ? null : b.uniqueCommits === 0 ? 'no-unique-commits' : 'merge-commit',
      blockers: blocker ? [blocker] : [],
      dirtyFiles: 0,
      uniqueCommits: b.uniqueCommits,
    });
  }

  const rank = (n: number | null): number => n ?? Number.MAX_SAFE_INTEGER;
  return items.sort(
    (a, b) =>
      rank(a.cardNumber) - rank(b.cardNumber) || (a.kind === b.kind ? 0 : a.kind === 'worktree' ? -1 : 1) || a.ref.localeCompare(b.ref),
  );
}
