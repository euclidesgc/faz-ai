import { describe, expect, it } from 'vitest';
import type { BoardState, Card } from '../src/shared/model';
import { commentCountOf, projectForWebview, trashCountOf } from '../src/shared/webviewState';

const card = (id: string, over: Partial<Card> = {}): Card => ({ id, parentId: null, deletedAt: null, archivedAt: null, ...over }) as Card;

/** Um estado mínimo: só o que o recorte lê. */
function state(cards: Card[]): BoardState {
  return {
    cards,
    comments: [
      { id: 'm1', cardId: 'h1', body: 'a' },
      { id: 'm2', cardId: 'h1', body: 'b' },
      { id: 'm3', cardId: 'lixo', body: 'c' },
    ],
    fieldValues: cards.map((c) => ({ cardId: c.id, fieldId: 'f', value: 1 })),
    checklistItems: [{ id: 'k1', cardId: 'lixo' }],
    attachments: [{ id: 'a1', cardId: 'arq' }],
    links: [
      { id: 'l1', fromId: 'h1', toId: 'lixo', kind: 'precedes' },
      { id: 'l2', fromId: 'lixo', toId: 'arq', kind: 'precedes' },
    ],
  } as unknown as BoardState;
}

const CARDS = [
  card('h1'),
  card('filho-vivo', { parentId: 'h-arquivada' }),
  card('h-arquivada', { archivedAt: 1 }),
  card('arq', { archivedAt: 2 }),
  card('lixo', { deletedAt: 3 }),
  card('lixo-arquivado', { deletedAt: 4, archivedAt: 4 }),
];
const ids = (s: BoardState) => s.cards.map((c) => c.id).sort();

describe('projectForWebview: o recorte do estado para a interface (#1066)', () => {
  it('no board, os vivos e o pai (arquivado) de um filho vivo; nada da lixeira nem dos arquivados sem filho vivo', () => {
    const s = projectForWebview(state(CARDS), { view: 'board', openCardId: null });
    expect(ids(s)).toEqual(['filho-vivo', 'h-arquivada', 'h1']);
    expect(s.comments).toEqual([]);
    expect(s.fieldValues.map((v) => v.cardId).sort()).toEqual(['filho-vivo', 'h-arquivada', 'h1']);
    expect(s.checklistItems).toEqual([]);
    expect(s.attachments).toEqual([]);
    // o vínculo com uma ponta dentro do recorte fica, para a tela saber que a dependência existe
    expect(s.links.map((l) => l.id)).toEqual(['l1']);
  });

  it('as contagens cobrem o board inteiro, mesmo o que ficou de fora', () => {
    const s = projectForWebview(state(CARDS), { view: 'board', openCardId: null });
    expect(s.commentCounts).toEqual({ h1: 2, lixo: 1 });
    expect(s.cardCounts).toEqual({ trash: 2, archived: 2 });
    expect(commentCountOf(s, 'lixo')).toBe(1);
    expect(commentCountOf(s, 'h1')).toBe(2);
    expect(trashCountOf(s)).toBe(2);
  });

  it('sem contagens (estado inteiro), as funções contam pela lista', () => {
    const s = state(CARDS);
    expect(commentCountOf(s, 'h1')).toBe(2);
    expect(trashCountOf(s)).toBe(2);
  });

  it('na lixeira entram os apagados; em arquivados, os arquivados que não estão na lixeira', () => {
    expect(ids(projectForWebview(state(CARDS), { view: 'trash', openCardId: null }))).toEqual([
      'filho-vivo',
      'h-arquivada',
      'h1',
      'lixo',
      'lixo-arquivado',
    ]);
    expect(ids(projectForWebview(state(CARDS), { view: 'archived', openCardId: null }))).toEqual([
      'arq',
      'filho-vivo',
      'h-arquivada',
      'h1',
    ]);
  });

  it('o card aberto entra com o pai, as sub-tarefas e a conversa dele, em qualquer tela', () => {
    const cards = [...CARDS, card('sub-arquivada', { parentId: 'lixo', archivedAt: 9 })];
    const s = projectForWebview(state(cards), { view: 'board', openCardId: 'lixo' });
    expect(ids(s)).toEqual(['filho-vivo', 'h-arquivada', 'h1', 'lixo', 'sub-arquivada']);
    expect(s.comments.map((c) => c.id)).toEqual(['m3']);
    expect(s.checklistItems.map((i) => i.id)).toEqual(['k1']);
  });

  it('um board só de cards vivos devolve a mesma lista de cards (sem cópia)', () => {
    const live = [card('a'), card('b')];
    const full = state(live);
    expect(projectForWebview(full, { view: 'board', openCardId: null }).cards).toBe(full.cards);
  });
});
