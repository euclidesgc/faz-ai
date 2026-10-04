import { describe, expect, it } from 'vitest';
import { isDelivered, lastAiColumn } from '../src/shared/story';
import { boardState, card, column } from './fakes/board';

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
