import { describe, expect, it } from 'vitest';
import { isDelivered, isDeliverableStory, isWithHuman, lastAiColumn, stackBaseOf } from '../src/shared/story';
import { boardState, card, column } from './fakes/board';

describe('isWithHuman', () => {
  it.each(['waiting_review', 'waiting_answer', 'blocked'] as const)('true quando o status é %s (dono humano)', (status) => {
    expect(isWithHuman({ status })).toBe(true);
  });

  it.each(['ready', 'running', 'approved'] as const)('false quando o status é %s (dono IA)', (status) => {
    expect(isWithHuman({ status })).toBe(false);
  });

  it('false quando o status é null', () => {
    expect(isWithHuman({ status: null })).toBe(false);
  });
});

describe('stackBaseOf', () => {
  it('ordem natural: a segunda história YOLO empilha sobre a primeira, que ainda não tem base', () => {
    const s = boardState({
      cards: [card('h10', { number: 10, yolo: true, branch: 'b10', branchCreatedAt: '100' }), card('h11', { number: 11, yolo: true })],
    });

    expect(stackBaseOf(s, s.cards[1]!)?.id).toBe('h10');
  });

  it('ordem invertida: escolhe a branch criada mais recentemente, não o número menor', () => {
    const s = boardState({
      cards: [
        card('h10', { number: 10, yolo: true, branch: 'b10', branchCreatedAt: '200' }),
        card('h11', { number: 11, yolo: true, branch: 'b11', branchCreatedAt: '100' }),
        card('h12', { number: 12, yolo: true }),
      ],
    });

    // #11 criou a branch antes de #10 (reordenação por arrasto): #12 deve empilhar sobre #10, a mais recente
    expect(stackBaseOf(s, s.cards[2]!)?.id).toBe('h10');
  });

  it('ignora a anterior na lixeira ou arquivada, mesmo sendo a mais recente', () => {
    const s = boardState({
      cards: [
        card('h10', { number: 10, yolo: true, branch: 'b10', branchCreatedAt: '100' }),
        card('h11', { number: 11, yolo: true, branch: 'b11', branchCreatedAt: '200', deletedAt: 1 }),
        card('h12', { number: 12, yolo: true, branch: 'b12', branchCreatedAt: '300', archivedAt: 1 }),
        card('h13', { number: 13, yolo: true }),
      ],
    });

    expect(stackBaseOf(s, s.cards[3]!)?.id).toBe('h10');
  });

  it('a anterior concluída mas não mesclada ainda conta como base (comportamento preservado)', () => {
    const s = boardState({
      cards: [
        card('h10', { number: 10, yolo: true, branch: 'b10', branchCreatedAt: '100', mergeCommit: '' }),
        card('h11', { number: 11, yolo: true }),
      ],
    });

    expect(stackBaseOf(s, s.cards[1]!)?.id).toBe('h10');
  });

  it('a anterior já mesclada não conta: a nova parte da principal', () => {
    const s = boardState({
      cards: [
        card('h10', { number: 10, yolo: true, branch: 'b10', branchCreatedAt: '100', mergeCommit: 'abc123' }),
        card('h11', { number: 11, yolo: true }),
      ],
    });

    expect(stackBaseOf(s, s.cards[1]!)).toBeUndefined();
  });
});

describe('lastAiColumn', () => {
  it('é a última coluna aberta com aiActive, por posição, mesmo com colunas renomeadas e fora de ordem', () => {
    const s = boardState({
      columns: [
        column('revisao', 'wp', 2, 'open'),
        column('backlog', 'wp', 0, 'open'),
        column('implementacao', 'wp', 1, 'open'),
        column('done', 'wp', 3, 'done'),
      ].map((c) => (c.id === 'implementacao' || c.id === 'revisao' ? { ...c, aiActive: true } : c)),
    });

    expect(lastAiColumn(s, 'wp')?.id).toBe('revisao');
  });

  it('ignora colunas de conclusão e cancelamento mesmo com aiActive', () => {
    const s = boardState({
      columns: [column('implementacao', 'wp', 0, 'open'), column('done', 'wp', 1, 'done'), column('cancelled', 'wp', 2, 'cancelled')].map(
        (c) => ({ ...c, aiActive: true }),
      ),
    });

    expect(lastAiColumn(s, 'wp')?.id).toBe('implementacao');
  });

  it('undefined quando o workflow não tem nenhuma coluna com aiActive', () => {
    const s = boardState({ columns: [column('backlog', 'wp', 0, 'open')] });

    expect(lastAiColumn(s, 'wp')).toBeUndefined();
  });
});

describe('isDelivered', () => {
  const columns = [column('backlog', 'wp', 0, 'open'), column('homologacao', 'wp', 1, 'open'), column('done', 'wp', 2, 'done')].map((c) =>
    c.id === 'homologacao' ? { ...c, aiActive: true } : c,
  );

  it('false quando a história não está na última coluna da IA', () => {
    const s = boardState({
      columns,
      cards: [card('h1', { yolo: true, columnId: 'backlog', prUrl: 'https://pr', status: 'waiting_review' })],
    });

    expect(isDelivered(s, s.cards[0]!)).toBe(false);
  });

  it('false sem prUrl registrado', () => {
    const s = boardState({ columns, cards: [card('h1', { yolo: true, columnId: 'homologacao', prUrl: '', status: 'waiting_review' })] });

    expect(isDelivered(s, s.cards[0]!)).toBe(false);
  });

  it('false quando o status ainda é da IA', () => {
    const s = boardState({ columns, cards: [card('h1', { yolo: true, columnId: 'homologacao', prUrl: 'https://pr', status: 'running' })] });

    expect(isDelivered(s, s.cards[0]!)).toBe(false);
  });

  it('false quando o status é blocked, mesmo com dono humano: bloqueio é impedimento, não entrega', () => {
    const s = boardState({ columns, cards: [card('h1', { yolo: true, columnId: 'homologacao', prUrl: 'https://pr', status: 'blocked' })] });

    expect(isDelivered(s, s.cards[0]!)).toBe(false);
  });

  it('true quando as quatro condições valem juntas', () => {
    const s = boardState({
      columns,
      cards: [card('h1', { yolo: true, columnId: 'homologacao', prUrl: 'https://pr', status: 'waiting_review' })],
    });

    expect(isDelivered(s, s.cards[0]!)).toBe(true);
  });

  it('false para sub-tarefa, mesmo com as mesmas condições', () => {
    const s = boardState({
      columns,
      cards: [
        card('h1', { yolo: true, columnId: 'homologacao' }),
        card('t1', { yolo: true, parentId: 'h1', columnId: 'homologacao', prUrl: 'https://pr', status: 'waiting_review' }),
      ],
    });

    expect(isDelivered(s, s.cards[1]!)).toBe(false);
  });
});

describe('isDeliverableStory', () => {
  const columns = [column('backlog', 'wp', 0, 'open'), column('homologacao', 'wp', 1, 'open'), column('done', 'wp', 2, 'done')].map((c) =>
    c.id === 'homologacao' ? { ...c, aiActive: true } : c,
  );

  it('true mesmo quando o status ainda é da IA — é o que falta para `isDelivered`', () => {
    const s = boardState({ columns, cards: [card('h1', { yolo: true, columnId: 'homologacao', prUrl: 'https://pr', status: 'running' })] });

    expect(isDeliverableStory(s, s.cards[0]!)).toBe(true);
    expect(isDelivered(s, s.cards[0]!)).toBe(false);
  });

  it('false sem prUrl, fora da última coluna, bloqueada, ou para sub-tarefa', () => {
    const base = { yolo: true, columnId: 'homologacao', prUrl: 'https://pr', status: 'running' } as const;
    expect(
      isDeliverableStory(boardState({ columns, cards: [card('h1', { ...base, prUrl: '' })] }), card('h1', { ...base, prUrl: '' })),
    ).toBe(false);
    const s1 = boardState({ columns, cards: [card('h1', { ...base, columnId: 'backlog' })] });
    expect(isDeliverableStory(s1, s1.cards[0]!)).toBe(false);
    const s2 = boardState({ columns, cards: [card('h1', { ...base, status: 'blocked' })] });
    expect(isDeliverableStory(s2, s2.cards[0]!)).toBe(false);
    const s3 = boardState({
      columns,
      cards: [card('h1', { yolo: true, columnId: 'homologacao' }), card('t1', { ...base, parentId: 'h1' })],
    });
    expect(isDeliverableStory(s3, s3.cards[1]!)).toBe(false);
  });
});
