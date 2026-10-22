import type { BoardState, Card, Id } from './model';
import { isLive } from './selectors';

// O que cada interface (webview do editor, página no navegador) recebe do estado do board (#1066). O host
// trabalha com o estado inteiro; a tela só precisa do que mostra: os cards vivos, mais a lixeira ou os
// arquivados quando essas telas estão abertas, e a conversa só do card aberto. Num board com histórico,
// a lixeira, os arquivados e as conversas eram 70% do que ia a cada mudança.

/** Qual tela a interface mostra e qual card está aberto: o que decide o recorte do estado. */
export interface WebviewScope {
  /** `trash` e `archived` trazem os cards dessas telas; qualquer outra, só os vivos */
  view: string;
  openCardId: Id | null;
}

export const DEFAULT_SCOPE: WebviewScope = { view: 'board', openCardId: null };

export const sameScope = (a: WebviewScope, b: WebviewScope): boolean => a.view === b.view && a.openCardId === b.openCardId;

/**
 * O recorte do estado para uma interface. Entram: os cards vivos e os pais deles (um filho vivo de uma
 * história arquivada ainda mostra o nome dela); na lixeira, os apagados; em arquivados, os arquivados;
 * e sempre o card aberto com o pai e as sub-tarefas (a tela do card mostra as sub-tarefas arquivadas
 * também). Os valores de campo, checklists, anexos e vínculos acompanham os cards que entraram. A
 * conversa vai só a do card aberto; as contagens cobrem todos (`commentCounts`, `cardCounts`).
 */
export function projectForWebview(s: BoardState, scope: WebviewScope): BoardState {
  const byId = new Map(s.cards.map((c) => [c.id, c]));
  const keep = new Set<Id>();
  const add = (c: Card | undefined) => {
    if (!c || keep.has(c.id)) return;
    keep.add(c.id);
    if (c.parentId) add(byId.get(c.parentId));
  };
  for (const c of s.cards) {
    if (isLive(c)) add(c);
    else if (scope.view === 'trash' && c.deletedAt !== null) add(c);
    else if (scope.view === 'archived' && c.deletedAt === null && c.archivedAt !== null) add(c);
  }
  const open = scope.openCardId ? byId.get(scope.openCardId) : undefined;
  if (open) {
    add(open);
    for (const c of s.cards) if (c.parentId === open.id) add(c);
  }
  const counts: Record<Id, number> = {};
  for (const m of s.comments) counts[m.cardId] = (counts[m.cardId] ?? 0) + 1;
  return {
    ...s,
    cards: keep.size === s.cards.length ? s.cards : s.cards.filter((c) => keep.has(c.id)),
    fieldValues: s.fieldValues.filter((v) => keep.has(v.cardId)),
    checklistItems: s.checklistItems.filter((i) => keep.has(i.cardId)),
    attachments: s.attachments.filter((a) => keep.has(a.cardId)),
    links: s.links.filter((l) => keep.has(l.fromId) || keep.has(l.toId)),
    comments: open ? s.comments.filter((m) => m.cardId === open.id) : [],
    commentCounts: counts,
    cardCounts: {
      trash: s.cards.filter((c) => c.deletedAt !== null).length,
      archived: s.cards.filter((c) => c.deletedAt === null && c.archivedAt !== null).length,
    },
  };
}

/** Quantas mensagens o card tem: pela contagem do recorte, ou contando a conversa quando o estado veio inteiro. */
export function commentCountOf(s: Pick<BoardState, 'comments' | 'commentCounts'>, cardId: Id): number {
  return s.commentCounts ? (s.commentCounts[cardId] ?? 0) : s.comments.filter((c) => c.cardId === cardId).length;
}

/** Quantos cards estão na lixeira: pela contagem do recorte, ou contando quando o estado veio inteiro. */
export function trashCountOf(s: Pick<BoardState, 'cards' | 'cardCounts'>): number {
  return s.cardCounts ? s.cardCounts.trash : s.cards.filter((c) => c.deletedAt !== null).length;
}
