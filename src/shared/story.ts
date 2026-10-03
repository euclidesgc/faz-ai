import type { BoardState, Card } from './model';

// Regras da história: o card principal, que guarda a branch, a worktree e o pull request das sub-tarefas.

/** A história do card: ele mesmo, ou o pai quando é uma sub-tarefa (undefined se o pai não está no estado). */
export const storyOf = (state: Pick<BoardState, 'cards'>, card: Card): Card | undefined =>
  card.parentId ? state.cards.find((c) => c.id === card.parentId) : card;

/** Endereço aceito como pull request da história: http(s), sem espaços. */
export const isPullRequestUrl = (url: string): boolean => /^https?:\/\/\S+$/.test(url);
