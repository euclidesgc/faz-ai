import { describe, expect, it } from 'vitest';
import { archiveKey } from '../src/shared/filters';
import { buildLanes, laneOf, lanesMatch, moveToLane, resolveDrop, type Lanes } from '../src/shared/dragLanes';
import { boardState, card } from './fakes/board';

const ARC = archiveKey('wp');

// backlog: a b c | doing: d e | done: vazia | arquivados: x
const state = boardState({
  cards: [
    card('a', { columnId: 'backlog', position: 0 }),
    card('b', { columnId: 'backlog', position: 1 }),
    card('c', { columnId: 'backlog', position: 2 }),
    card('d', { columnId: 'doing', position: 0 }),
    card('e', { columnId: 'doing', position: 1 }),
    card('x', { columnId: 'backlog', position: 3, archivedAt: 5 }),
  ],
});
const base = (): Lanes => ({ backlog: ['a', 'b', 'c'], doing: ['d', 'e'], done: [], [ARC]: ['x'] });
const archive = { laneId: ARC, archivedIds: new Set(['x']) };

describe('buildLanes / laneOf', () => {
  it('monta uma faixa por coluna e a de arquivados, copiando as listas', () => {
    const vis = { backlog: ['a'], doing: ['d'] };
    const lanes = buildLanes(['backlog', 'doing', 'done'], vis, ARC, ['x']);
    expect(lanes).toEqual({ backlog: ['a'], doing: ['d'], done: [], [ARC]: ['x'] });
    expect(lanes.backlog).not.toBe(vis.backlog);
  });

  it('laneOf acha a faixa do card ou undefined', () => {
    expect(laneOf(base(), 'e')).toBe('doing');
    expect(laneOf(base(), 'x')).toBe(ARC);
    expect(laneOf(base(), 'zzz')).toBeUndefined();
  });
});

describe('moveToLane', () => {
  it('mesma faixa devolve o mesmo objeto', () => {
    const l = base();
    expect(moveToLane(l, 'a', 'c', true)).toBe(l);
    expect(moveToLane(l, 'a', 'backlog', false)).toBe(l);
  });

  it('desconhecidos devolvem o mesmo objeto', () => {
    const l = base();
    expect(moveToLane(l, 'zzz', 'd', false)).toBe(l);
    expect(moveToLane(l, 'a', 'zzz', false)).toBe(l);
  });

  it('outra faixa: início, meio e fim', () => {
    expect(moveToLane(base(), 'a', 'd', false).doing).toEqual(['a', 'd', 'e']);
    expect(moveToLane(base(), 'a', 'd', true).doing).toEqual(['d', 'a', 'e']);
    expect(moveToLane(base(), 'a', 'e', true).doing).toEqual(['d', 'e', 'a']);
  });

  it('remove da origem e não altera o original', () => {
    const l = base();
    const r = moveToLane(l, 'b', 'd', false);
    expect(r.backlog).toEqual(['a', 'c']);
    expect(l.backlog).toEqual(['a', 'b', 'c']);
  });

  it('faixa vazia ou over = faixa vai para o fim', () => {
    expect(moveToLane(base(), 'a', 'done', false).done).toEqual(['a']);
    expect(moveToLane(base(), 'a', 'doing', true).doing).toEqual(['d', 'e', 'a']);
  });

  it('card vivo sobre o arquivo não muda de faixa', () => {
    const l = base();
    expect(moveToLane(l, 'a', ARC, false, archive)).toBe(l);
    expect(moveToLane(l, 'a', 'x', false, archive)).toBe(l);
  });

  it('arquivado sai do arquivo e volta a ele', () => {
    const out = moveToLane(base(), 'x', 'b', false, archive);
    expect(out.backlog).toEqual(['a', 'x', 'b', 'c']);
    expect(out[ARC]).toEqual([]);
    expect(moveToLane(out, 'x', ARC, false, archive)[ARC]).toEqual(['x']);
  });
});

describe('resolveDrop', () => {
  const drop = (lanes: Lanes, id: string) => resolveDrop(state, lanes, id, 'wp');

  it('sem mudança é none', () => {
    expect(drop(base(), 'b')).toEqual({ kind: 'none' });
  });

  it('card fora das faixas é none', () => {
    expect(drop(base(), 'zzz')).toEqual({ kind: 'none' });
  });

  it('subir na mesma coluna: antes do vizinho seguinte', () => {
    expect(drop({ ...base(), backlog: ['c', 'a', 'b'] }, 'c')).toEqual({ kind: 'move', columnId: 'backlog', position: 0 });
    expect(drop({ ...base(), backlog: ['a', 'c', 'b'] }, 'c')).toEqual({ kind: 'move', columnId: 'backlog', position: 1 });
  });

  it('descer na mesma coluna cai depois do over', () => {
    // a sobre b, abaixo do centro: faixa a=[b,a,c]; sem o ativo, full=[b,c]; seguinte c -> 1
    expect(drop({ ...base(), backlog: ['b', 'a', 'c'] }, 'a')).toEqual({ kind: 'move', columnId: 'backlog', position: 1 });
  });

  it('descer até o fim da mesma coluna', () => {
    expect(drop({ ...base(), backlog: ['b', 'c', 'a'] }, 'a')).toEqual({ kind: 'move', columnId: 'backlog', position: 2 });
  });

  it('outra coluna: início, meio e fim', () => {
    expect(drop({ ...base(), backlog: ['b', 'c'], doing: ['a', 'd', 'e'] }, 'a')).toEqual({ kind: 'move', columnId: 'doing', position: 0 });
    expect(drop({ ...base(), backlog: ['b', 'c'], doing: ['d', 'a', 'e'] }, 'a')).toEqual({ kind: 'move', columnId: 'doing', position: 1 });
    expect(drop({ ...base(), backlog: ['b', 'c'], doing: ['d', 'e', 'a'] }, 'a')).toEqual({ kind: 'move', columnId: 'doing', position: 2 });
  });

  it('coluna vazia: posição 0', () => {
    expect(drop({ ...base(), backlog: ['b', 'c'], done: ['a'] }, 'a')).toEqual({ kind: 'move', columnId: 'done', position: 0 });
  });

  it('filtro ativo com vizinhos escondidos', () => {
    // doing real: d e; o filtro esconde d. Visível: [e]. Soltar antes de e -> 1; depois de e -> fim.
    const s = boardState({ cards: [...state.cards] });
    expect(resolveDrop(s, { ...base(), backlog: ['b', 'c'], doing: ['a', 'e'] }, 'a', 'wp')).toEqual({
      kind: 'move',
      columnId: 'doing',
      position: 1,
    });
    expect(resolveDrop(s, { ...base(), backlog: ['b', 'c'], doing: ['e', 'a'] }, 'a', 'wp')).toEqual({
      kind: 'move',
      columnId: 'doing',
      position: 2,
    });
    // tudo escondido: só o ativo na faixa -> fim da coluna real
    expect(resolveDrop(s, { ...base(), backlog: ['b', 'c'], doing: ['a'] }, 'a', 'wp')).toEqual({
      kind: 'move',
      columnId: 'doing',
      position: 2,
    });
  });

  it('mesma coluna com cards escondidos: depois do último visível anterior', () => {
    // backlog real a b c; visível só a e c (b escondido). a vai para depois de c -> position 2 (full=[b,c])
    expect(drop({ ...base(), backlog: ['c', 'a'] }, 'a')).toEqual({ kind: 'move', columnId: 'backlog', position: 2 });
  });

  it('card vivo na faixa de arquivados arquiva', () => {
    expect(drop({ ...base(), backlog: ['b', 'c'], [ARC]: ['a', 'x'] }, 'a')).toEqual({ kind: 'archive' });
  });

  it('arquivado de volta ao arquivo é none', () => {
    expect(drop(base(), 'x')).toEqual({ kind: 'none' });
  });

  it('arquivado solto numa coluna desarquiva', () => {
    expect(drop({ ...base(), doing: ['d', 'x', 'e'], [ARC]: [] }, 'x')).toEqual({ kind: 'unarchive', columnId: 'doing', position: 1 });
    expect(drop({ ...base(), done: ['x'], [ARC]: [] }, 'x')).toEqual({ kind: 'unarchive', columnId: 'done', position: 0 });
  });

  it('ignora vizinhos que sumiram do estado', () => {
    expect(drop({ ...base(), backlog: ['b', 'c'], doing: ['a', 'fantasma', 'e'] }, 'a')).toEqual({
      kind: 'move',
      columnId: 'doing',
      position: 1,
    });
  });
});

describe('lanesMatch', () => {
  it('iguais', () => {
    expect(lanesMatch(base(), base())).toBe(true);
  });

  it('ordem diferente numa faixa', () => {
    expect(lanesMatch(base(), { ...base(), backlog: ['b', 'a', 'c'] })).toBe(false);
  });

  it('tamanho ou chaves diferentes', () => {
    expect(lanesMatch(base(), { ...base(), doing: ['d'] })).toBe(false);
    expect(lanesMatch(base(), { backlog: ['a', 'b', 'c'] })).toBe(false);
    expect(lanesMatch({ a: [] }, { b: [] })).toBe(false);
  });
});
