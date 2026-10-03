import { describe, expect, it } from 'vitest';
import type { FieldDef } from '../src/shared/model';
import {
  archivedIn,
  cardsIn,
  checklistOf,
  childrenOf,
  columnOf,
  columnsOf,
  countDone,
  fieldsForType,
  isArchived,
  isLive,
  openChildren,
  subtaskSlot,
  typesOf,
  valueOf,
} from '../src/shared/selectors';
import { boardState, card, sub } from './fakes/board';

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

const field = (id: string, position: number, appliesToTypes: string[] | null): FieldDef => ({
  id,
  boardId: 'b',
  name: id,
  kind: 'text',
  options: [],
  appliesToTypes,
  display: 'badge',
  position,
});

describe('isLive / isArchived', () => {
  it('ativo é fora da lixeira e do arquivo', () => {
    expect(isLive(card('a'))).toBe(true);
    expect(isLive(card('a', { archivedAt: 1 }))).toBe(false);
    expect(isLive(card('a', { deletedAt: 1 }))).toBe(false);
  });

  it('arquivado na lixeira conta como lixeira, não como arquivo', () => {
    expect(isArchived(card('a', { archivedAt: 1 }))).toBe(true);
    expect(isArchived(card('a', { archivedAt: 1, deletedAt: 2 }))).toBe(false);
    expect(isArchived(card('a'))).toBe(false);
  });
});

describe('colunas', () => {
  const s = boardState({ cards: [card('h', { columnId: 'doing' }), card('perdido', { columnId: 'nao-existe' })] });

  it('columnsOf devolve só as do workflow, em ordem', () => {
    expect(ids(columnsOf(s, 'wp'))).toEqual(['backlog', 'doing', 'done', 'cancelled']);
    expect(ids(columnsOf(s, 'wc'))).toEqual(['todo', 'finished', 'dropped']);
  });

  it('columnOf acha a coluna do card', () => {
    expect(columnOf(s, s.cards[0]!)?.id).toBe('doing');
    expect(columnOf(s, s.cards[1]!)).toBeUndefined();
  });
});

describe('cardsIn / archivedIn', () => {
  const s = boardState({
    cards: [
      card('b', { position: 2 }),
      card('a', { position: 1 }),
      card('arq-velho', { archivedAt: 10 }),
      card('arq-novo', { archivedAt: 20 }),
      card('lixo', { deletedAt: 5 }),
      card('arq-lixo', { archivedAt: 30, deletedAt: 31 }),
      sub('s', 'a', 'todo', { archivedAt: 40 }),
    ],
  });

  it('cardsIn traz os ativos da coluna, por posição', () => {
    expect(ids(cardsIn(s, 'backlog'))).toEqual(['a', 'b']);
  });

  it('archivedIn traz os arquivados do workflow fora da lixeira, do mais recente ao mais antigo', () => {
    expect(ids(archivedIn(s, 'wp'))).toEqual(['arq-novo', 'arq-velho']);
    expect(ids(archivedIn(s, 'wc'))).toEqual(['s']);
  });
});

describe('sub-tarefas', () => {
  const s = boardState({
    cards: [
      card('h'),
      sub('aberta', 'h', 'todo'),
      sub('feita', 'h', 'finished'),
      sub('largada', 'h', 'dropped'),
      sub('arquivada', 'h', 'todo', { archivedAt: 1 }),
      sub('lixo', 'h', 'todo', { deletedAt: 1 }),
      sub('outra', 'x', 'todo'),
    ],
  });

  it('childrenOf inclui as arquivadas e deixa de fora as da lixeira', () => {
    expect(ids(childrenOf(s, 'h'))).toEqual(['aberta', 'feita', 'largada', 'arquivada']);
  });

  it('openChildren traz só as ativas em coluna em aberto', () => {
    expect(ids(openChildren(s, 'h'))).toEqual(['aberta']);
  });

  it('countDone conta as que estão em coluna de encerramento (concluída ou cancelada)', () => {
    expect(countDone(s, childrenOf(s, 'h'))).toBe(2);
    expect(countDone(s, [])).toBe(0);
  });
});

describe('campos', () => {
  const s = boardState({
    fieldDefs: [field('prazo', 2, null), field('fase', 1, ['sub']), field('urgente', 0, ['story', 'bug'])],
    fieldValues: [
      { cardId: 'h', fieldId: 'prazo', value: '2026-10-05' },
      { cardId: 'h', fieldId: 'urgente', value: false },
    ],
  });

  it('fieldsForType traz os do tipo e os de todos os tipos, em ordem', () => {
    expect(ids(fieldsForType(s, 'story'))).toEqual(['urgente', 'prazo']);
    expect(ids(fieldsForType(s, 'sub'))).toEqual(['fase', 'prazo']);
  });

  it('valueOf devolve o valor salvo ou null', () => {
    expect(valueOf(s, 'h', 'prazo')).toBe('2026-10-05');
    expect(valueOf(s, 'h', 'urgente')).toBe(false);
    expect(valueOf(s, 'h', 'fase')).toBeNull();
  });
});

describe('typesOf / checklistOf / subtaskSlot', () => {
  const type = (id: string, defaultWorkflowId: string) => ({ id, boardId: 'b', name: id, color: '#000', defaultWorkflowId, defaults: {} });
  const item = (id: string, cardId: string, position: number) => ({ id, cardId, text: id, done: false, position });

  it('typesOf traz só os tipos que nascem no workflow', () => {
    const s = boardState({ cardTypes: [type('story', 'wp'), type('sub', 'wc'), type('bug', 'wp')] });
    expect(ids(typesOf(s, 'wp'))).toEqual(['story', 'bug']);
  });

  it('checklistOf traz os itens do card em ordem', () => {
    const s = boardState({ checklistItems: [item('b', 'c1', 1), item('x', 'c2', 0), item('a', 'c1', 0)] });
    expect(ids(checklistOf(s, 'c1'))).toEqual(['a', 'b']);
  });

  it('subtaskSlot aponta a primeira coluna e o tipo do workflow de baixo', () => {
    expect(subtaskSlot(boardState({ cardTypes: [type('story', 'wp'), type('sub', 'wc')] }))).toEqual({ typeId: 'sub', columnId: 'todo' });
  });

  it('subtaskSlot é undefined sem tipo de sub-tarefa ou sem workflow de baixo', () => {
    expect(subtaskSlot(boardState({ cardTypes: [type('story', 'wp')] }))).toBeUndefined();
    const s = boardState({ cardTypes: [type('sub', 'wc')] });
    expect(subtaskSlot({ ...s, workflows: s.workflows.filter((w) => w.kind === 'parent') })).toBeUndefined();
  });
});
