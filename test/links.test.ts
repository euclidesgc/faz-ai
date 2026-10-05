import { describe, expect, it } from 'vitest';
import {
  childProgress,
  linkBetween,
  linkedCards,
  linkedParentsToComplete,
  linkProblem,
  openPredecessors,
  subtaskWaves,
} from '../src/shared/links';
import type { CardLink } from '../src/shared/model';
import { DEFAULT_RULES } from '../src/shared/rules';
import { boardState, card, sub } from './fakes/board';

const link = (id: string, fromId: string, toId: string, kind: CardLink['kind'] = 'child'): CardLink => ({ id, fromId, toId, kind });

// três cards em workflows iguais: p é o pai, a e b os filhos, r um relativo
const state = (links: CardLink[], over: Parameters<typeof boardState>[0] = {}) =>
  boardState({
    cards: [card('p', { columnId: 'doing' }), card('a', { columnId: 'done' }), card('b', { columnId: 'doing' }), card('r')],
    links,
    ...over,
  });

describe('vínculos entre cards', () => {
  it('separa pais, filhos e relativos de cada ponta do vínculo', () => {
    const s = state([link('1', 'p', 'a'), link('2', 'p', 'b'), link('3', 'a', 'r', 'related')]);
    expect(linkedCards(s, 'p')).toMatchObject({ children: [{ id: 'a' }, { id: 'b' }], parents: [], related: [] });
    expect(linkedCards(s, 'a')).toMatchObject({ parents: [{ id: 'p' }], children: [], related: [{ id: 'r' }] });
    // o relativo vale nos dois sentidos
    expect(linkedCards(s, 'r').related.map((c) => c.id)).toEqual(['a']);
    expect(linkBetween(s, 'b', 'p')?.id).toBe('2');
  });

  it('card na lixeira some dos vínculos', () => {
    const s = state([link('1', 'p', 'a')], { cards: [card('p'), card('a', { deletedAt: 5 })] });
    expect(linkedCards(s, 'p').children).toEqual([]);
  });

  it('o progresso conta os filhos fora de "em aberto" (concluídos ou cancelados)', () => {
    const s = state([link('1', 'p', 'a'), link('2', 'p', 'b')]);
    expect(childProgress(s, 'p')).toEqual({ done: 1, total: 2 });
    expect(childProgress(s, 'a')).toEqual({ done: 0, total: 0 });
  });

  it('recusa vínculo consigo mesmo, duplicado (em qualquer sentido) e card inexistente', () => {
    const s = state([link('1', 'p', 'a')]);
    expect(linkProblem(s, 'p', 'p', 'child')).toMatch(/ele mesmo/);
    expect(linkProblem(s, 'p', 'a', 'related')).toMatch(/já estão vinculados/);
    expect(linkProblem(s, 'a', 'p', 'child')).toMatch(/já estão vinculados/);
    expect(linkProblem(s, 'p', 'nada', 'child')).toMatch(/não encontrado/);
    expect(linkProblem(s, 'p', 'b', 'child')).toBeNull();
    expect(linkProblem(s, 'a', 'r', 'related')).toBeNull();
  });

  it('recusa ciclo de pai e filho, também através das sub-tarefas', () => {
    const s = state([link('1', 'p', 'a'), link('2', 'a', 'b')]);
    // b já é neto de p: p não pode virar filho de b
    expect(linkProblem(s, 'b', 'p', 'child')).toMatch(/ciclo/);
    // relativo não forma hierarquia
    expect(linkProblem(s, 'b', 'p', 'related')).toBeNull();
    // sub-tarefa conta como filha: a história "h" tem a sub "x"; vincular h como filha de x fecharia o ciclo
    const withSub = boardState({ cards: [card('h'), sub('x', 'h', 'todo')], links: [] });
    expect(linkProblem(withSub, 'x', 'h', 'child')).toMatch(/ciclo/);
  });

  describe('pai a concluir quando o último filho vinculado conclui', () => {
    const target = { id: 'done', category: 'done' };
    it('oferece o pai quando nenhum outro filho está em aberto', () => {
      const s = state([link('1', 'p', 'a'), link('2', 'p', 'b')], {
        cards: [card('p', { columnId: 'doing' }), card('a', { columnId: 'done' }), card('b', { columnId: 'doing' })],
      });
      const b = s.cards.find((c) => c.id === 'b')!;
      const offered = linkedParentsToComplete(s, b, target);
      expect(offered).toHaveLength(1);
      expect(offered[0]).toMatchObject({ parent: { id: 'p' }, column: { id: 'done' } });
    });

    it('não oferece com outro filho ainda em aberto, com a regra desligada ou fora de uma coluna de conclusão', () => {
      const s = state([link('1', 'p', 'a'), link('2', 'p', 'b')], {
        cards: [card('p', { columnId: 'doing' }), card('a', { columnId: 'doing' }), card('b', { columnId: 'doing' })],
      });
      const b = s.cards.find((c) => c.id === 'b')!;
      expect(linkedParentsToComplete(s, b, target)).toEqual([]);
      const done = state([link('1', 'p', 'b')], { cards: [card('p', { columnId: 'doing' }), card('b', { columnId: 'doing' })] });
      expect(linkedParentsToComplete(done, done.cards[1]!, { id: 'cancelled', category: 'cancelled' })).toEqual([]);
      const off = { ...done, board: { ...done.board, rules: { ...DEFAULT_RULES, onAllChildrenDone: 'off' as const } } };
      expect(linkedParentsToComplete(off, off.cards[1]!, target)).toEqual([]);
    });
  });
});

describe('dependência entre cards (precedes)', () => {
  it('separa de quem o card depende e quem depende dele, sem misturar com pai e filho', () => {
    const s = state([link('1', 'a', 'b', 'precedes')]);
    expect(linkedCards(s, 'b')).toMatchObject({ predecessors: [{ id: 'a' }], successors: [], parents: [], children: [] });
    expect(linkedCards(s, 'a')).toMatchObject({ successors: [{ id: 'b' }], predecessors: [], children: [] });
    // dependência não entra no progresso de filhos
    expect(childProgress(s, 'a')).toEqual({ done: 0, total: 0 });
  });

  it('só a dependência ainda em aberto segura o card', () => {
    // a está concluído, r está em aberto
    const s = state([link('1', 'a', 'b', 'precedes'), link('2', 'r', 'b', 'precedes')]);
    expect(openPredecessors(s, 'b').map((c) => c.id)).toEqual(['r']);
    expect(openPredecessors(s, 'r')).toEqual([]);
  });

  it('recusa ciclo de dependência, direto ou por outros cards', () => {
    const s = state([link('1', 'p', 'b', 'precedes'), link('2', 'b', 'r', 'precedes')]);
    expect(linkProblem(s, 'r', 'p', 'precedes')).toMatch(/dependeria dele mesmo/);
    expect(linkProblem(s, 'p', 'r', 'precedes')).toBeNull();
  });

  it('subtaskWaves: o que pode rodar junto agora e o que espera; concluir a dependência libera a seguinte', () => {
    const cards = [card('h'), sub('s1', 'h', 'todo'), sub('s2', 'h', 'todo'), sub('s3', 'h', 'todo'), sub('s4', 'h', 'finished')];
    const links = [link('1', 's1', 's3', 'precedes'), link('2', 's4', 's2', 'precedes')];
    const before = subtaskWaves(boardState({ cards, links }), 'h');
    expect(before.ready.map((c) => c.id)).toEqual(['s1', 's2']);
    expect(before.waiting.map((c) => c.id)).toEqual(['s3']);
    const after = subtaskWaves(boardState({ cards: cards.map((c) => (c.id === 's1' ? { ...c, columnId: 'finished' } : c)), links }), 'h');
    expect(after.ready.map((c) => c.id)).toEqual(['s2', 's3']);
    expect(after.waiting).toEqual([]);
  });

  it('subtaskWaves: sub-tarefa com a pessoa ou já em execução não entra em ready, fica num grupo próprio', () => {
    const cards = [
      card('h'),
      sub('s1', 'h', 'todo', { status: 'ready' }),
      sub('s2', 'h', 'todo', { status: 'waiting_answer' }),
      sub('s3', 'h', 'todo', { status: 'running' }),
      sub('s4', 'h', 'todo', { status: 'approved' }),
      sub('s5', 'h', 'todo', { status: 'blocked' }),
      sub('s6', 'h', 'todo'),
    ];
    const waves = subtaskWaves(boardState({ cards, links: [] }), 'h');
    expect(waves.ready.map((c) => c.id)).toEqual(['s1', 's4', 's6']);
    expect(waves.withPerson.map((c) => c.id)).toEqual(['s2', 's5']);
    expect(waves.running.map((c) => c.id)).toEqual(['s3']);
    expect(waves.waiting).toEqual([]);
  });

  it('recusa dependência entre a sub-tarefa e a própria história (ou um ancestral), nos dois sentidos', () => {
    const s = boardState({ cards: [card('h'), sub('x', 'h', 'todo'), card('avo'), card('outra')], links: [link('1', 'avo', 'h')] });
    // a sub-tarefa esperaria a história concluir, e a história não conclui com a sub-tarefa aberta
    expect(linkProblem(s, 'h', 'x', 'precedes')).toMatch(/própria história|ancestral/);
    expect(linkProblem(s, 'avo', 'x', 'precedes')).toMatch(/própria história|ancestral/);
    expect(linkProblem(s, 'x', 'h', 'precedes')).toMatch(/própria história|ancestral/);
    expect(linkProblem(s, 'outra', 'x', 'precedes')).toBeNull();
  });
});
