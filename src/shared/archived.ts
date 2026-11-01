import type { BoardState, Card, Id, Workflow } from './model';
import { EMPTY_FILTERS, type Filters } from './filters';
import { archivedIn } from './selectors';

/** Quantos cards cada linha da aba mostra antes de pedir mais. */
export const ARCHIVED_PAGE = 50;

/** A aba filtra os cards encontrados, sem incluir automaticamente sua família. */
export const ARCHIVED_EMPTY_FILTERS: Filters = { ...EMPTY_FILTERS, includeRelated: false };

export interface ArchivedRowCards {
  /** Total de arquivados do workflow, antes do filtro da aba. */
  total: number;
  /** Cards que a linha lista, do arquivamento mais recente ao mais antigo, antes da paginação. */
  cards: Card[];
}

export function archivedRowCards(state: BoardState, workflow: Workflow, matched: Set<Id> | null, storyId: Id | null): ArchivedRowCards {
  const base = archivedIn(state, workflow.id);
  // Ao abrir uma história, a linha filha mostra todos os seus arquivados, mesmo fora do filtro geral.
  const cards =
    workflow.kind === 'child' && storyId !== null
      ? base.filter((card) => card.parentId === storyId)
      : matched === null
        ? base
        : base.filter((card) => matched.has(card.id));
  return { total: base.length, cards };
}
