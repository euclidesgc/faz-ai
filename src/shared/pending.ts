import type { BoardState, Card, Id } from './model';
import { openPredecessors } from './links';
import { byExecutionOrder } from './priority';
import { isLive } from './selectors';
import { statusInfo, type CardStatus } from './status';

/** O que está esperando por alguém no board: a fila da IA e a fila da pessoa. */
export interface PendingWork {
  ai: {
    /** aprovados por uma pessoa: mover para a próxima coluna */
    approved: Card[];
    /** prontos para a IA trabalhar */
    ready: Card[];
    /** a pessoa escreveu por último na conversa e ainda não teve resposta */
    unanswered: Card[];
  };
  human: {
    waitingReview: Card[];
    waitingAnswer: Card[];
    blocked: Card[];
  };
}

export function pendingWork(s: BoardState): PendingWork {
  const open = new Set(s.columns.filter((c) => c.category === 'open').map((c) => c.id));
  const cards = s.cards.filter((c) => isLive(c) && open.has(c.columnId)).sort(byExecutionOrder(s));
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const withStatus = (status: CardStatus) => cards.filter((c) => c.status === status);
  const withHuman = (c: Card | undefined): boolean => !!c?.status && statusInfo(c.status).owner === 'human';

  const lastSource = new Map<Id, string | null>();
  for (const m of s.comments) lastSource.set(m.cardId, m.source); // os comentários vêm em ordem de criação

  return {
    ai: {
      approved: withStatus('approved'),
      // sub-tarefa de uma história que está com a pessoa espera a decisão dela, e card com dependência
      // em aberto espera ela terminar
      ready: withStatus('ready').filter((c) => (!c.parentId || !withHuman(byId.get(c.parentId))) && openPredecessors(s, c.id).length === 0),
      // card bloqueado fica parado até a pessoa desbloquear, mesmo que o motivo esteja na conversa
      unanswered: cards.filter(
        (c) => lastSource.get(c.id) === 'human' && !['ready', 'approved', 'running', 'blocked'].includes(c.status ?? ''),
      ),
    },
    human: {
      waitingReview: withStatus('waiting_review'),
      waitingAnswer: withStatus('waiting_answer'),
      blocked: withStatus('blocked'),
    },
  };
}

/** Cards cuja pendência está com a pessoa, na ordem de execução: bug primeiro, depois a coluna mais à direita, e na mesma coluna de cima para baixo. */
export const humanQueue = (s: BoardState, p: PendingWork): Card[] =>
  [...p.human.waitingReview, ...p.human.waitingAnswer, ...p.human.blocked].sort(byExecutionOrder(s));
/**
 * Cards cuja pendência está com a IA, na ordem de execução: bug primeiro, depois a coluna mais à
 * direita, e na mesma coluna de cima para baixo. A categoria (aprovado, sem resposta, pronto) não pesa na ordem, só o comparador.
 * Vazio quando não há nada para ela fazer.
 */
export const aiQueue = (s: BoardState, p: PendingWork): Card[] =>
  [...new Set([...p.ai.approved, ...p.ai.unanswered, ...p.ai.ready])].sort(byExecutionOrder(s));

/**
 * Cards que acabaram de passar para a pessoa por ação de outro (a IA): estão na fila dela agora, com
 * um status diferente do que tinham em `previous` (id → status).
 */
export function turnsPassedToHuman(previous: Map<Id, CardStatus>, s: BoardState): Card[] {
  return humanQueue(s, pendingWork(s)).filter((c) => previous.get(c.id) !== c.status && c.statusBy !== s.currentUser);
}

export const humanQueueStatuses = (s: BoardState): Map<Id, CardStatus> =>
  new Map(humanQueue(s, pendingWork(s)).map((c) => [c.id, c.status!]));
