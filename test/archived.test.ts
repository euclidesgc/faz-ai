import { describe, expect, it } from 'vitest';
import { ARCHIVED_EMPTY_FILTERS, ARCHIVED_PAGE, archivedRowCards } from '../src/shared/archived';
import type { BoardState, Card, Workflow } from '../src/shared/model';

const parent: Workflow = { id: 'stories', boardId: 'b', name: 'Histórias', position: 0, kind: 'parent', collapsed: false };
const child: Workflow = { id: 'tasks', boardId: 'b', name: 'Sub-tarefas', position: 1, kind: 'child', collapsed: false };

const card = (id: string, workflowId: string, archivedAt: number | null, parentId: string | null = null): Card =>
  ({ id, workflowId, archivedAt, parentId, deletedAt: null }) as Card;

const state = {
  cards: [
    card('old', 'stories', 100),
    card('recent', 'stories', 300),
    card('live', 'stories', null),
    card('trashed', 'stories', 400),
    card('other', 'tasks', 200, 'other-story'),
    card('task-a', 'tasks', 250, 'recent'),
    card('task-b', 'tasks', 150, 'recent'),
    card('live-task', 'tasks', null, 'recent'),
  ],
} as BoardState;
state.cards.find((c) => c.id === 'trashed')!.deletedAt = 500;

describe('archivedRowCards', () => {
  it('sem filtro lista só arquivados, dos mais recentes aos mais antigos', () => {
    expect(ARCHIVED_PAGE).toBe(50);
    expect(ARCHIVED_EMPTY_FILTERS.includeRelated).toBe(false);
    const row = archivedRowCards(state, parent, null, null);
    expect(row.total).toBe(2);
    expect(row.cards.map((c) => c.id)).toEqual(['recent', 'old']);
  });

  it('com matched filtra os cards, mas mantém o total do workflow', () => {
    const row = archivedRowCards(state, parent, new Set(['old', 'live', 'trashed']), null);
    expect(row.total).toBe(2);
    expect(row.cards.map((c) => c.id)).toEqual(['old']);
  });

  it('na linha filha, a história selecionada prevalece sobre matched', () => {
    const row = archivedRowCards(state, child, new Set(['other']), 'recent');
    expect(row.total).toBe(3);
    expect(row.cards.map((c) => c.id)).toEqual(['task-a', 'task-b']);
  });
});
