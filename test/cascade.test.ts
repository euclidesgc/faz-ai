import { describe, expect, it } from 'vitest';
import { childrenToCancel, dependents, parentToComplete } from '../src/shared/cascade';
import type { Attachment, BoardState, Card } from '../src/shared/model';
import { DEFAULT_RULES, type BoardRules } from '../src/shared/rules';
import { boardState, card, sub } from './fakes/board';

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

const attachment = (id: string, cardId: string): Attachment => ({
  id,
  cardId,
  filename: id,
  storedName: id,
  mime: 'text/plain',
  size: 1,
  createdAt: 0,
  artifact: false,
});

const withRules = (s: BoardState, rules: Partial<BoardRules>): BoardState => ({
  ...s,
  board: { ...s.board, rules: { ...DEFAULT_RULES, ...rules } },
});

const col = (s: BoardState, id: string) => s.columns.find((c) => c.id === id)!;
const find = (s: BoardState, id: string): Card => s.cards.find((c) => c.id === id)!;

describe('dependents', () => {
  it('conta as sub-tarefas ativas e os anexos do card e delas', () => {
    const s = boardState({
      cards: [card('h'), sub('a', 'h', 'todo'), sub('b', 'h', 'finished'), sub('arq', 'h', 'todo', { archivedAt: 1 })],
      attachments: [attachment('1', 'h'), attachment('2', 'a'), attachment('3', 'arq'), attachment('4', 'outro')],
    });
    const d = dependents(s, find(s, 'h'));
    expect(ids(d.children)).toEqual(['a', 'b']);
    expect(d.attachments).toBe(2);
  });

  it('card sem nada junto', () => {
    const s = boardState({ cards: [card('h')] });
    expect(dependents(s, find(s, 'h'))).toEqual({ children: [], attachments: 0 });
  });
});

describe('childrenToCancel', () => {
  const s = boardState({
    cards: [card('h'), sub('aberta', 'h', 'todo'), sub('feita', 'h', 'finished'), sub('lixo', 'h', 'todo', { deletedAt: 1 })],
  });

  it('história indo para o cancelamento leva as sub-tarefas em aberto', () => {
    expect(ids(childrenToCancel(s, find(s, 'h'), col(s, 'cancelled')))).toEqual(['aberta']);
  });

  it('vazio quando não é cancelamento, quando já estava lá ou quando é sub-tarefa', () => {
    expect(childrenToCancel(s, find(s, 'h'), col(s, 'doing'))).toEqual([]);
    const cancelled = { ...find(s, 'h'), columnId: 'cancelled' };
    expect(childrenToCancel(s, cancelled, col(s, 'cancelled'))).toEqual([]);
    expect(childrenToCancel(s, find(s, 'aberta'), col(s, 'dropped'))).toEqual([]);
  });

  it('vazio quando a regra manda manter as sub-tarefas', () => {
    expect(childrenToCancel(withRules(s, { onCancelParent: 'keep' }), find(s, 'h'), col(s, 'cancelled'))).toEqual([]);
    expect(childrenToCancel(withRules(s, { onCancelParent: 'cascade' }), find(s, 'h'), col(s, 'cancelled'))).toHaveLength(1);
  });
});

describe('parentToComplete', () => {
  const base = boardState({
    cards: [
      card('h', { columnId: 'doing' }),
      card('ja-feita', { columnId: 'done' }),
      card('outra', { columnId: 'done', archivedAt: 1 }),
      sub('ultima', 'h', 'todo'),
      sub('feita', 'h', 'finished'),
      sub('largada', 'h', 'dropped'),
    ],
  });

  it('a última sub-tarefa em aberto concluída oferece mover a história para o fim da conclusão', () => {
    const r = parentToComplete(base, find(base, 'ultima'), col(base, 'finished'));
    expect(r?.parent.id).toBe('h');
    expect(r?.column.id).toBe('done');
    // só conta os cards ativos da coluna de conclusão
    expect(r?.position).toBe(1);
  });

  it('nada quando ainda sobra sub-tarefa em aberto', () => {
    const s = { ...base, cards: [...base.cards, sub('mais', 'h', 'todo')] };
    expect(parentToComplete(s, find(s, 'ultima'), col(s, 'finished'))).toBeNull();
  });

  it('sub-tarefa em aberto arquivada ou na lixeira não segura a história', () => {
    const s = { ...base, cards: [...base.cards, sub('arq', 'h', 'todo', { archivedAt: 1 }), sub('lixo', 'h', 'todo', { deletedAt: 1 })] };
    expect(parentToComplete(s, find(s, 'ultima'), col(s, 'finished'))?.parent.id).toBe('h');
  });

  it('nada quando o destino não é conclusão, ou a sub-tarefa já estava lá', () => {
    expect(parentToComplete(base, find(base, 'ultima'), col(base, 'dropped'))).toBeNull();
    expect(parentToComplete(base, find(base, 'feita'), col(base, 'finished'))).toBeNull();
  });

  it('nada para uma história (sem pai)', () => {
    expect(parentToComplete(base, find(base, 'h'), col(base, 'done'))).toBeNull();
  });

  it('nada quando a história já está encerrada, arquivada ou na lixeira', () => {
    for (const over of [{ columnId: 'done' }, { archivedAt: 1 }, { deletedAt: 1 }]) {
      const s = { ...base, cards: base.cards.map((c) => (c.id === 'h' ? { ...c, ...over } : c)) };
      expect(parentToComplete(s, find(s, 'ultima'), col(s, 'finished'))).toBeNull();
    }
  });

  it('nada quando o workflow da história não tem coluna de conclusão', () => {
    const s = { ...base, columns: base.columns.filter((c) => c.id !== 'done') };
    expect(parentToComplete(s, find(s, 'ultima'), col(s, 'finished'))).toBeNull();
  });

  it('respeita a regra: desligada não oferece; automática e perguntar oferecem', () => {
    expect(parentToComplete(withRules(base, { onAllChildrenDone: 'off' }), find(base, 'ultima'), col(base, 'finished'))).toBeNull();
    expect(parentToComplete(withRules(base, { onAllChildrenDone: 'auto' }), find(base, 'ultima'), col(base, 'finished'))).not.toBeNull();
    expect(parentToComplete(withRules(base, { onAllChildrenDone: 'ask' }), find(base, 'ultima'), col(base, 'finished'))).not.toBeNull();
  });
});
