import { describe, expect, it } from 'vitest';
import type { BoardState, Card } from '../src/shared/model';
import { EMPTY_FILTERS, applyFilters, activeFilterCount, type Filters } from '../src/webview/store/filters';

const NOW = new Date(2026, 9, 1, 12).getTime();
const DAY = 86400000;

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id, boardId: 'b', workflowId: 'wp', columnId: 'todo', typeId: 'story', parentId: null, title: id, description: '',
  position: 0, createdAt: NOW, updatedAt: NOW, deletedAt: null, archivedAt: null, ...over,
});

const state: BoardState = {
  board: { id: 'b', workspaceKey: 'k', name: 'B' },
  workflows: [{ id: 'wp', boardId: 'b', name: 'H', position: 0, kind: 'parent' }, { id: 'wc', boardId: 'b', name: 'S', position: 1, kind: 'child' }],
  columns: [
    { id: 'todo', workflowId: 'wp', name: 'Backlog', position: 0, isTerminal: false },
    { id: 'c-todo', workflowId: 'wc', name: 'A fazer', position: 0, isTerminal: false },
    { id: 'c-done', workflowId: 'wc', name: 'Concluído', position: 1, isTerminal: true },
  ],
  cardTypes: [],
  cards: [
    card('login', { title: 'Tela de Login', description: 'autenticação OAuth', createdAt: NOW - 10 * DAY }),
    card('bug', { typeId: 'bug', title: 'Corrigir crash' }),
    card('solo', { title: 'Sem filhos', createdAt: NOW - 40 * DAY }),
    card('prd', { workflowId: 'wc', columnId: 'c-done', typeId: 'sub', parentId: 'login', title: 'Criar PRD' }),
    card('spec', { workflowId: 'wc', columnId: 'c-todo', typeId: 'sub', parentId: 'login', title: 'Criar Spec' }),
    card('fix', { workflowId: 'wc', columnId: 'c-done', typeId: 'sub', parentId: 'bug', title: 'Patch' }),
    card('lixo', { title: 'Login antigo', deletedAt: NOW }),
  ],
  fieldDefs: [],
  fieldValues: [
    { cardId: 'prd', fieldId: 'fase', value: 'PRD' },
    { cardId: 'login', fieldId: 'tags', value: ['frontend', 'infra'] },
    { cardId: 'bug', fieldId: 'urgente', value: true },
    { cardId: 'solo', fieldId: 'prazo', value: '2026-10-05' },
  ],
  checklistItems: [],
  comments: [{ id: 'c1', cardId: 'solo', author: 'a', body: 'ver com a Júlia', createdAt: NOW, updatedAt: NOW }],
  attachments: [],
  currentUser: 'a',
};

const run = (f: Partial<Filters>) => [...(applyFilters(state, { ...EMPTY_FILTERS, includeRelated: false, ...f }, NOW) ?? [])].sort();

describe('applyFilters', () => {
  it('sem filtros devolve null', () => {
    expect(applyFilters(state, EMPTY_FILTERS, NOW)).toBeNull();
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('palavra-chave busca em título, descrição, comentários e campos, ignora acentos e lixeira', () => {
    expect(run({ text: 'login' })).toEqual(['login']);
    expect(run({ text: 'oauth tela' })).toEqual(['login']);
    expect(run({ text: 'julia' })).toEqual(['solo']);
    expect(run({ text: 'infra' })).toEqual(['login']);
  });

  it('tipo e campos (select, multiselect, checkbox)', () => {
    expect(run({ typeIds: ['bug'] })).toEqual(['bug']);
    expect(run({ fields: { fase: ['PRD'] } })).toEqual(['prd']);
    expect(run({ fields: { tags: ['infra', 'docs'] } })).toEqual(['login']);
    expect(run({ fields: { urgente: ['true'] } })).toEqual(['bug']);
    expect(run({ fields: { urgente: ['false'] } })).not.toContain('bug');
  });

  it('período sobre criação e sobre campo de data', () => {
    expect(run({ dateField: 'createdAt', datePreset: '7d' })).not.toContain('login');
    expect(run({ dateField: 'createdAt', datePreset: '30d' })).toContain('login');
    expect(run({ dateField: 'createdAt', datePreset: '30d' })).not.toContain('solo');
    expect(run({ dateField: 'prazo', datePreset: 'custom', dateFrom: '2026-10-01', dateTo: '2026-10-05' })).toEqual(['solo']);
    expect(run({ dateField: 'prazo', datePreset: 'custom', dateTo: '2026-10-04' })).toEqual([]);
  });

  it('relacionamentos', () => {
    expect(run({ relation: 'withChildren' })).toEqual(['bug', 'login']);
    expect(run({ relation: 'withoutChildren' })).toEqual(['solo']);
    expect(run({ relation: 'pendingChildren' })).toEqual(['login']);
  });

  it('includeRelated traz pai e filhos dos resultados', () => {
    expect([...applyFilters(state, { ...EMPTY_FILTERS, text: 'spec' }, NOW)!].sort()).toEqual(['login', 'spec']);
    expect([...applyFilters(state, { ...EMPTY_FILTERS, typeIds: ['bug'] }, NOW)!].sort()).toEqual(['bug', 'fix']);
  });
});
