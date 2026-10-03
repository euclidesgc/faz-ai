import type { BoardState, Card } from './model';
import { columnOf, isLive } from './selectors';

// Regras da história: o card principal, que guarda a branch, a worktree e o pull request das sub-tarefas.

/** A história do card: ele mesmo, ou o pai quando é uma sub-tarefa (undefined se o pai não está no estado). */
export const storyOf = (state: Pick<BoardState, 'cards'>, card: Card): Card | undefined =>
  card.parentId ? state.cards.find((c) => c.id === card.parentId) : card;

/** Endereço aceito como pull request da história: http(s), sem espaços. */
export const isPullRequestUrl = (url: string): boolean => /^https?:\/\/\S+$/.test(url);

/** A história do card está em modo autônomo (YOLO): a IA segue sem pedir aprovação nem confirmação. A sub-tarefa vale o que vale a história. */
export const isYolo = (state: Pick<BoardState, 'cards'>, card: Card): boolean => storyOf(state, card)?.yolo === true;

/**
 * Em que a branch de uma história em modo autônomo se apoia: a da história YOLO anterior (a de número
 * menor mais próxima que já tem branch), para os pull requests formarem uma pilha. Sem anterior, a branch principal.
 * Conta também a anterior já concluída: o pull request dela continua aberto até uma pessoa fazer o merge.
 */
export function stackBaseOf(state: Pick<BoardState, 'cards'>, story: Card): Card | undefined {
  if (!story.yolo || story.parentId) return undefined;
  return state.cards
    .filter((c) => c.yolo && !c.parentId && c.number < story.number && c.branch && c.deletedAt === null && c.archivedAt === null)
    .sort((a, b) => b.number - a.number)[0];
}

/** Histórias em modo autônomo ainda em aberto, na ordem em que foram criadas. */
export const yoloStories = (state: BoardState): Card[] =>
  state.cards
    .filter((c) => c.yolo && !c.parentId && isLive(c) && columnOf(state, c)?.category === 'open')
    .sort((a, b) => a.number - b.number);
