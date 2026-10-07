import type { BoardState, Card, Column, Id } from './model';
import { columnOf, columnsOf, isLive } from './selectors';
import { byExecutionOrder } from './priority';
import { statusInfo } from './status';

// Regras da história: o card principal, que guarda a branch, a worktree e o pull request das sub-tarefas.

/** A história do card: ele mesmo, ou o pai quando é uma sub-tarefa (undefined se o pai não está no estado). */
export const storyOf = (state: Pick<BoardState, 'cards'>, card: Card): Card | undefined =>
  card.parentId ? state.cards.find((c) => c.id === card.parentId) : card;

/** Endereço aceito como pull request da história: http(s), sem espaços. */
export const isPullRequestUrl = (url: string): boolean => /^https?:\/\/\S+$/.test(url);

/** A história do card está em modo autônomo (YOLO): a IA segue sem pedir aprovação nem confirmação. A sub-tarefa vale o que vale a história. */
export const isYolo = (state: Pick<BoardState, 'cards'>, card: Card): boolean => storyOf(state, card)?.yolo === true;

/**
 * Em que a branch de uma história em modo autônomo se apoia: a história YOLO aberta com a branch
 * criada mais recentemente, para os pull requests formarem uma pilha na ordem real de execução (#185)
 * — e não pelo número do card, que diverge da fila quando a pessoa reordena os cards por arrasto. Sem
 * candidata, a branch principal. Conta também a anterior já concluída, mas não a que já teve o pull
 * request mesclado (`mergeCommit` preenchido): o código dela já está na principal, então a nova não
 * precisa (e não deve) empilhar sobre uma branch cujo conteúdo já foi incorporado.
 */
export function stackBaseOf(state: Pick<BoardState, 'cards'>, story: Card): Card | undefined {
  if (!story.yolo || story.parentId) return undefined;
  return state.cards
    .filter(
      (c) => c.yolo && !c.parentId && c.id !== story.id && c.branch && c.mergeCommit === '' && c.deletedAt === null && c.archivedAt === null,
    )
    .sort((a, b) => Number(b.branchCreatedAt) - Number(a.branchCreatedAt) || b.number - a.number)[0];
}

/** Histórias em modo autônomo ainda em aberto, na ordem de execução da fila: bug primeiro, depois de cima para baixo no board. */
export const yoloStories = (state: BoardState): Card[] =>
  state.cards.filter((c) => c.yolo && !c.parentId && isLive(c) && columnOf(state, c)?.category === 'open').sort(byExecutionOrder(state));

/**
 * Onde a IA para de atuar num workflow: a última coluna em aberto com `aiActive`, por posição — nunca
 * pelo nome ("Homologação" é só a configuração padrão; as colunas são renomeáveis). `undefined` se o
 * workflow não tiver nenhuma.
 */
export const lastAiColumn = (state: BoardState, workflowId: Id): Column | undefined =>
  columnsOf(state, workflowId)
    .filter((c) => c.category === 'open' && c.aiActive)
    .at(-1);

/**
 * A história (não a sub-tarefa) está entregue: modo autônomo, parada na última coluna em que a IA
 * atua, com pull request registrado e o status passado para a pessoa — exceto bloqueio, que é
 * impedimento, não entrega.
 */
export function isDelivered(state: BoardState, card: Card): boolean {
  if (!card.yolo || card.parentId) return false;
  const column = columnOf(state, card);
  if (!isLive(card) || column?.category !== 'open') return false;
  if (column.id !== lastAiColumn(state, card.workflowId)?.id) return false;
  if (!card.prUrl) return false;
  return card.status !== null && card.status !== 'blocked' && statusInfo(card.status).owner === 'human';
}
