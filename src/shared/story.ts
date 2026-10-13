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

/** A história já está com a pessoa (status de dono humano): entregue, aguardando resposta, ou bloqueada. */
export function isWithHuman(card: Pick<Card, 'status'>): boolean {
  return card.status !== null && statusInfo(card.status).owner === 'human';
}

/** A história do card está em modo autônomo (YOLO): a IA segue sem pedir aprovação nem confirmação. A sub-tarefa vale o que vale a história. */
export const isYolo = (state: Pick<BoardState, 'cards'>, card: Card): boolean => storyOf(state, card)?.yolo === true;

/** A história ainda tem uma branch cujo código não chegou à principal: dá para empilhar sobre ela. */
const stackable = (c: Card): boolean => !!c.branch && c.mergeCommit === '' && c.deletedAt === null && c.archivedAt === null;

/**
 * Em que a branch de uma história se apoia. A derivada (`derivedFrom`) parte da branch da história de
 * origem, enquanto o pull request dela não foi mesclado. A história em modo autônomo parte da história
 * YOLO aberta com a branch criada mais recentemente, para os pull requests formarem uma pilha na ordem
 * real de execução (#185) — e não pelo número do card, que diverge da fila quando a pessoa reordena os
 * cards por arrasto. Sem candidata, a branch principal. Conta também a anterior já concluída, mas não
 * a que já teve o pull request mesclado (`mergeCommit` preenchido): o código dela já está na
 * principal, então a nova não precisa (e não deve) empilhar sobre uma branch cujo conteúdo já foi
 * incorporado.
 */
export function stackBaseOf(state: Pick<BoardState, 'cards'>, story: Card): Card | undefined {
  if (story.parentId) return undefined;
  const origin = story.derivedFrom ? state.cards.find((c) => c.id === story.derivedFrom) : undefined;
  if (origin && origin.id !== story.id && stackable(origin)) return origin;
  if (!story.yolo) return undefined;
  return state.cards
    .filter((c) => c.yolo && !c.parentId && c.id !== story.id && stackable(c))
    .sort((a, b) => Number(b.branchCreatedAt) - Number(a.branchCreatedAt) || b.number - a.number)[0];
}

/** Histórias em modo autônomo ainda em aberto, na ordem de execução da fila: bug primeiro, depois a coluna mais à direita, e na mesma coluna de cima para baixo. */
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
 * Onde o modo autônomo da história para: a coluna escolhida ao ligar o modo (`yoloUntil`) ou, sem
 * escolha, com uma que não vale mais (apagada, de outro workflow, onde a IA não atua) ou que a
 * história já passou (a pessoa a arrastou adiante), a última coluna em que a IA atua.
 */
export function yoloStopOf(state: BoardState, story: Card): Column | undefined {
  const last = lastAiColumn(state, story.workflowId);
  const chosen = story.yoloUntil ? state.columns.find((c) => c.id === story.yoloUntil) : undefined;
  if (!chosen || chosen.workflowId !== story.workflowId || chosen.category !== 'open' || !chosen.aiActive) return last;
  const current = columnOf(state, story);
  if (current && current.position > chosen.position) return last;
  return chosen;
}

/**
 * A história em modo autônomo está na coluna até onde a pessoa liberou o modo, antes da última coluna
 * da IA: ali a IA faz o trabalho da fase, pede a revisão e o modo se desliga (na última coluna, a
 * entrega é o pull request, como sempre).
 */
export function isAtYoloStop(state: BoardState, story: Card): boolean {
  if (!story.yolo || story.parentId) return false;
  const stop = yoloStopOf(state, story);
  return !!stop && stop.id === story.columnId && stop.id !== lastAiColumn(state, story.workflowId)?.id;
}

/**
 * As colunas que a pessoa pode escolher como "até onde" ao ligar o modo autônomo: as abertas em que a
 * IA atua, da coluna atual em diante. A atual fica de fora quando o trabalho dela já foi entregue
 * para revisão (ou aprovado): parar ali não deixaria nada para a IA fazer.
 */
export function yoloStopOptions(state: BoardState, story: Card): Column[] {
  const current = columnOf(state, story);
  const done = story.status === 'waiting_review' || story.status === 'approved';
  return columnsOf(state, story.workflowId).filter(
    (c) => c.category === 'open' && c.aiActive && (!current || c.position > current.position || (c.id === current.id && !done)),
  );
}

/**
 * A história (não a sub-tarefa) está entregue: modo autônomo, parada na última coluna em que a IA
 * atua, com pull request registrado e o status passado para a pessoa — exceto bloqueio, que é
 * impedimento, não entrega.
 */
export function isDelivered(state: BoardState, card: Card): boolean {
  if (!isDeliverableStory(state, card)) return false;
  return card.status !== null && statusInfo(card.status).owner === 'human';
}

/**
 * A história (não a sub-tarefa) pode ser entregue: modo autônomo, parada na última coluna em que a
 * IA atua, com pull request registrado e sem bloqueio — mas sem exigir que o status já tenha passado
 * para a pessoa (isso é o que falta para `isDelivered`). Serve para decidir, em qualquer gatilho
 * (registro do pull request, mudança de coluna, fim de uma execução), se a entrega deve ser feita agora.
 */
export function isDeliverableStory(state: BoardState, card: Card): boolean {
  if (!card.yolo || card.parentId) return false;
  const column = columnOf(state, card);
  if (!isLive(card) || column?.category !== 'open') return false;
  if (column.id !== lastAiColumn(state, card.workflowId)?.id) return false;
  if (!card.prUrl) return false;
  return card.status !== 'blocked';
}
