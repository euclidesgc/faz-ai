import type { BoardState, Card, Id } from './model';
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

const byNumber = (a: Card, b: Card): number => a.number - b.number;

export function pendingWork(s: BoardState): PendingWork {
  const open = new Set(s.columns.filter((c) => c.category === 'open').map((c) => c.id));
  const cards = s.cards.filter((c) => c.deletedAt === null && c.archivedAt === null && open.has(c.columnId)).sort(byNumber);
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const withStatus = (status: CardStatus) => cards.filter((c) => c.status === status);
  const withHuman = (c: Card | undefined): boolean => !!c?.status && statusInfo(c.status).owner === 'human';

  const lastSource = new Map<Id, string | null>();
  for (const m of s.comments) lastSource.set(m.cardId, m.source); // os comentários vêm em ordem de criação

  return {
    ai: {
      approved: withStatus('approved'),
      // sub-tarefa de uma história que está com a pessoa espera a decisão dela
      ready: withStatus('ready').filter((c) => !c.parentId || !withHuman(byId.get(c.parentId))),
      unanswered: cards.filter((c) => lastSource.get(c.id) === 'human' && c.status !== 'ready' && c.status !== 'approved' && c.status !== 'running'),
    },
    human: {
      waitingReview: withStatus('waiting_review'),
      waitingAnswer: withStatus('waiting_answer'),
      blocked: withStatus('blocked'),
    },
  };
}

/** Cards cuja pendência está com a pessoa. */
export const humanQueue = (p: PendingWork): Card[] => [...p.human.waitingReview, ...p.human.waitingAnswer, ...p.human.blocked].sort(byNumber);
/** Cards cuja pendência está com a IA; vazio quando não há nada para ela fazer. */
export const aiQueue = (p: PendingWork): Card[] => [...new Set([...p.ai.approved, ...p.ai.unanswered, ...p.ai.ready])];

/**
 * Cards que acabaram de passar para a pessoa por ação de outro (a IA): estão na fila dela agora, com
 * um status diferente do que tinham em `previous` (id → status).
 */
export function turnsPassedToHuman(previous: Map<Id, CardStatus>, s: BoardState): Card[] {
  return humanQueue(pendingWork(s)).filter((c) => previous.get(c.id) !== c.status && c.statusBy !== s.currentUser);
}

export const humanQueueStatuses = (s: BoardState): Map<Id, CardStatus> => new Map(humanQueue(pendingWork(s)).map((c) => [c.id, c.status!]));
