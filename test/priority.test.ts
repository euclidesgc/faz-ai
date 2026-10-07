import { describe, expect, it } from 'vitest';
import { BUG_TYPE, byExecutionOrder, isBug } from '../src/shared/priority';
import { boardState, card } from './fakes/board';

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

const types = [
  { id: 'bug', boardId: 'b', name: BUG_TYPE, color: '#000', defaultWorkflowId: 'wp', defaults: {} },
  { id: 'story', boardId: 'b', name: 'História', color: '#000', defaultWorkflowId: 'wp', defaults: {} },
];

describe('isBug', () => {
  const s = boardState({ cardTypes: types });

  it('reconhece o tipo pelo nome guardado, não pela exibição', () => {
    expect(isBug(s, card('c1', { typeId: 'bug' }))).toBe(true);
    expect(isBug(s, card('c1', { typeId: 'story' }))).toBe(false);
  });

  it('card sem tipo, ou com tipo que não existe mais no board, não é bug', () => {
    expect(isBug(s, card('c1', { typeId: '' }))).toBe(false);
    expect(isBug(s, card('c1', { typeId: 'sumiu' }))).toBe(false);
  });
});

describe('byExecutionOrder', () => {
  it('bug na última linha da última coluna vence história no topo da primeira', () => {
    const s = boardState({
      cardTypes: types,
      cards: [
        card('historia', { typeId: 'story', columnId: 'backlog', position: 0, number: 1 }),
        card('bug', { typeId: 'bug', columnId: 'done', position: 9, number: 2 }),
      ],
    });
    const [a, b] = [...s.cards].sort(byExecutionOrder(s));
    expect(ids([a!, b!])).toEqual(['bug', 'historia']);
  });

  it('mover a história de baixo para o topo da coluna inverte a fila', () => {
    const s = boardState({
      cards: [
        card('cima', { columnId: 'backlog', position: 0, number: 1 }),
        card('baixo', { columnId: 'backlog', position: 1, number: 2 }),
      ],
    });
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['cima', 'baixo']);

    const movida = {
      ...s,
      cards: [
        { ...s.cards[0]!, position: 1 },
        { ...s.cards[1]!, position: 0 },
      ],
    };
    expect(ids([...movida.cards].sort(byExecutionOrder(movida)))).toEqual(['baixo', 'cima']);
  });

  it('a coluna mais à direita vence a linha; na mesma coluna, vence a linha de cima', () => {
    const s = boardState({
      cards: [
        card('linha-1-doing', { columnId: 'doing', position: 1, number: 1 }),
        card('linha-0-backlog', { columnId: 'backlog', position: 0, number: 2 }),
        card('linha-0-doing', { columnId: 'doing', position: 0, number: 3 }),
      ],
    });
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['linha-0-doing', 'linha-1-doing', 'linha-0-backlog']);
  });

  it('números trocados não mudam a ordem quando grupo/coluna/linha já decidem', () => {
    const s = boardState({
      cards: [
        card('primeiro', { columnId: 'doing', position: 0, number: 99 }),
        card('segundo', { columnId: 'backlog', position: 0, number: 1 }),
      ],
    });
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['primeiro', 'segundo']);
  });

  it('mesmo grupo, linha e coluna: desempata pelo número, de forma estável', () => {
    const s = boardState({
      cards: [
        card('maior', { columnId: 'backlog', position: 0, number: 5 }),
        card('menor', { columnId: 'backlog', position: 0, number: 2 }),
      ],
    });
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['menor', 'maior']);
  });

  it('a sub-tarefa vale a posição da história e vem logo depois dela, na ordem da própria coluna', () => {
    const s = boardState({
      cardTypes: types,
      cards: [
        card('h-doing', { typeId: 'story', columnId: 'doing', position: 1, number: 1 }),
        card('h-backlog', { typeId: 'story', columnId: 'backlog', position: 0, number: 2 }),
        // sub-tarefas numa coluna do workflow filho, com posição baixa: não passam na frente pela coluna
        card('sub-b', { typeId: 'story', columnId: 'todo', position: 0, number: 3, parentId: 'h-backlog' }),
        card('sub-d2', { typeId: 'story', columnId: 'todo', position: 1, number: 4, parentId: 'h-doing' }),
        card('sub-d1', { typeId: 'story', columnId: 'todo', position: 0, number: 5, parentId: 'h-doing' }),
      ],
    });
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['h-doing', 'sub-d1', 'sub-d2', 'h-backlog', 'sub-b']);
  });

  it('a sub-tarefa de um bug fura a fila junto com ele', () => {
    const s = boardState({
      cardTypes: types,
      cards: [
        card('historia', { typeId: 'story', columnId: 'doing', position: 0, number: 1 }),
        card('bug', { typeId: 'bug', columnId: 'backlog', position: 5, number: 2 }),
        card('sub-bug', { typeId: 'story', columnId: 'todo', position: 0, number: 3, parentId: 'bug' }),
      ],
    });
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['bug', 'sub-bug', 'historia']);
  });

  it('card sem tipo não é bug: não fura a fila de uma história', () => {
    const s = boardState({
      cardTypes: types,
      cards: [
        card('sem-tipo', { typeId: 'sumiu', columnId: 'backlog', position: 5, number: 1 }),
        card('historia', { typeId: 'story', columnId: 'doing', position: 0, number: 2 }),
      ],
    });
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['historia', 'sem-tipo']);
  });

  it('card com coluna ausente do estado vai para o fim, sem lançar exceção', () => {
    const s = boardState({
      cards: [
        card('sem-coluna', { columnId: 'nao-existe', position: 0, number: 1 }),
        card('com-coluna', { columnId: 'backlog', position: 0, number: 2 }),
      ],
    });
    expect(() => [...s.cards].sort(byExecutionOrder(s))).not.toThrow();
    expect(ids([...s.cards].sort(byExecutionOrder(s)))).toEqual(['com-coluna', 'sem-coluna']);
  });
});
