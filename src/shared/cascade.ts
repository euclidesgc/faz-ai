import type { BoardState, Card, Column } from './model';
import { cardsIn, columnOf, columnsOf, isLive, openChildren } from './selectors';

// O que uma ação sobre um card arrasta junto. Só decide; quem pergunta e executa é o front.

/** Sub-tarefas ativas do card e total de anexos (do card e delas). */
export function dependents(state: BoardState, card: Card): { children: Card[]; attachments: number } {
  const children = state.cards.filter((c) => c.parentId === card.id && isLive(c));
  const ids = new Set([card.id, ...children.map((c) => c.id)]);
  const attachments = state.attachments.filter((a) => ids.has(a.cardId)).length;
  return { children, attachments };
}

/**
 * Sub-tarefas em aberto que podem ser canceladas junto quando a história vai para `target`.
 * Vazio quando o movimento não cancela uma história ou a regra manda manter as sub-tarefas.
 */
export function childrenToCancel(state: BoardState, card: Card, target: Column): Card[] {
  if (target.category !== 'cancelled' || card.parentId || card.columnId === target.id) return [];
  if (state.board.rules.onCancelParent === 'keep') return [];
  return openChildren(state, card.id);
}

/**
 * História a concluir quando a sub-tarefa vai para `target`: a última em aberto entrando numa coluna
 * de conclusão, com a história ainda em aberto. Devolve a coluna de conclusão da história e a posição
 * no fim dela, ou null quando não há o que oferecer (inclusive com a regra desligada).
 */
export function parentToComplete(
  state: BoardState,
  child: Card,
  target: Column,
): { parent: Card; column: Column; position: number } | null {
  if (target.category !== 'done' || !child.parentId || child.columnId === target.id) return null;
  if (state.board.rules.onAllChildrenDone === 'off') return null;
  const parent = state.cards.find((c) => c.id === child.parentId);
  if (!parent || !isLive(parent) || columnOf(state, parent)?.category !== 'open') return null;
  if (openChildren(state, parent.id).some((c) => c.id !== child.id)) return null;
  const column = columnsOf(state, parent.workflowId).find((k) => k.category === 'done');
  if (!column) return null;
  return { parent, column, position: cardsIn(state, column.id).length };
}
