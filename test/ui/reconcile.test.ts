import { describe, expect, it } from 'vitest';
import type { BoardState } from '../../src/shared/model';
import { reconcileState } from '../../src/webview/store/reconcile';

const base = (): BoardState =>
  ({
    board: { name: 'B', rules: { a: 1 } },
    workflows: [{ id: 'w', name: 'Histórias' }],
    columns: [],
    cardTypes: [],
    cards: [
      { id: 'c1', title: 'Um', position: 0 },
      { id: 'c2', title: 'Dois', position: 1 },
    ],
    fieldDefs: [],
    fieldValues: [{ cardId: 'c1', fieldId: 'f', value: 1 }],
    checklistItems: [],
    links: [],
    comments: [],
    attachments: [],
    aiRuns: [],
  }) as unknown as BoardState;

describe('reconcileState: o que não mudou mantém a identidade (#1066)', () => {
  it('cards iguais voltam com o objeto anterior; o que mudou vem novo; a lista só é nova quando algo mudou', () => {
    const prev = base();
    const next = base();
    next.cards[1] = { ...next.cards[1]!, title: 'Dois (editado)' };
    const out = reconcileState(prev, next);
    expect(out.cards[0]).toBe(prev.cards[0]);
    expect(out.cards[1]).not.toBe(prev.cards[1]);
    expect(out.cards[1]!.title).toBe('Dois (editado)');
    expect(out.cards).not.toBe(prev.cards);
    expect(out.workflows).toBe(prev.workflows);
    expect(out.board).toBe(prev.board);
  });

  it('a reordenação muda a lista, mesmo com os itens iguais', () => {
    const prev = base();
    const next = base();
    next.cards.reverse();
    const out = reconcileState(prev, next);
    expect(out.cards).not.toBe(prev.cards);
    expect(out.cards[0]).toBe(prev.cards[1]);
  });

  it('sem estado anterior, devolve o novo como veio', () => {
    const next = base();
    expect(reconcileState(null, next)).toBe(next);
  });
});
