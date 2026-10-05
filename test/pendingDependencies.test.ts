import { describe, expect, it } from 'vitest';
import type { CardLink } from '../src/shared/model';
import { aiQueue, pendingWork } from '../src/shared/pending';
import { boardState, card, sub } from './fakes/board';

const precedes = (id: string, fromId: string, toId: string): CardLink => ({ id, fromId, toId, kind: 'precedes' });

describe('fila da IA e dependências', () => {
  it('card com dependência em aberto não conta como pronto', () => {
    const s = boardState({
      cards: [
        card('a', { number: 1, status: 'ready' }),
        card('b', { number: 2, status: 'ready' }),
        card('h', { number: 3 }),
        sub('s1', 'h', 'todo', { number: 4, status: 'ready' }),
        sub('s2', 'h', 'todo', { number: 5, status: 'ready' }),
      ],
      links: [precedes('1', 'a', 'b'), precedes('2', 's1', 's2')],
    });
    const p = pendingWork(s);
    expect(p.ai.ready.map((c) => c.id).sort()).toEqual(['a', 's1']);
    expect(
      aiQueue(s, p)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['a', 's1']);
  });

  it('dependência concluída libera o card', () => {
    const s = boardState({
      cards: [card('a', { number: 1, columnId: 'done' }), card('b', { number: 2, status: 'ready' })],
      links: [precedes('1', 'a', 'b')],
    });
    expect(pendingWork(s).ai.ready.map((c) => c.id)).toEqual(['b']);
  });
});
