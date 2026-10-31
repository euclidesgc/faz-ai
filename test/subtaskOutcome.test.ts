import { describe, expect, it } from 'vitest';
import type { BoardState, Card } from '../src/shared/model';
import type { OutcomeRead } from '../src/shared/phaseOutcome';
import {
  CONCERN_MARK,
  CONTEXT_MARK,
  concernNote,
  concernsOf,
  contextBlockedReason,
  contextHashOf,
  contextKey,
  contextReason,
  descriptionHash,
  isContextKey,
  isContextNote,
  isContextReason,
  routeDeclared,
  type ClaimEvidence,
} from '../src/shared/subtaskOutcome';

const card = (number: number, description = 'desc'): Card =>
  ({ id: `c${number}`, number, columnId: 'col', description }) as unknown as Card;
const valid = (outcome: string, extra: Record<string, string | null> = {}): OutcomeRead =>
  ({ kind: 'valid', value: { outcome, summary: 'resumo', failure_reason: null, pending: null, ...extra } }) as OutcomeRead;
const ev = (patch: Partial<ClaimEvidence> = {}): ClaimEvidence => ({
  cardClosed: false,
  cardWithPerson: false,
  mutations: 1,
  workspaceChanged: true,
  ...patch,
});

describe('routeDeclared', () => {
  it('sem leitura ou com bloco ausente/inválido não faz nada', () => {
    expect(routeDeclared(null, ev())).toEqual({ kind: 'none' });
    expect(routeDeclared({ kind: 'missing' }, ev())).toMatchObject({ kind: 'none', note: expect.stringContaining('ausente') });
    expect(routeDeclared({ kind: 'invalid', problem: 'x' }, ev())).toMatchObject({
      kind: 'none',
      note: expect.stringContaining('inválido'),
    });
  });
  it('card com a pessoa vence o bloco', () => {
    expect(routeDeclared(valid('BLOCKED', { failure_reason: 'f' }), ev({ cardWithPerson: true }))).toEqual({ kind: 'none' });
  });
  it('DONE com o card concluído', () => {
    expect(routeDeclared(valid('DONE'), ev({ cardClosed: true }))).toEqual({ kind: 'none' });
    expect(routeDeclared(valid('DONE'), ev({ cardClosed: true, mutations: 0, workspaceChanged: false }))).toMatchObject({
      kind: 'concern',
    });
    expect(routeDeclared(valid('DONE'), ev({ cardClosed: true, mutations: 0, workspaceChanged: null }))).toEqual({ kind: 'none' });
  });
  it('DONE_WITH_CONCERNS concluído vira ressalva com pending', () => {
    expect(routeDeclared(valid('DONE_WITH_CONCERNS', { pending: 'conferir X' }), ev({ cardClosed: true }))).toEqual({
      kind: 'concern',
      text: 'conferir X',
    });
  });
  it.each(['NEEDS_CONTEXT', 'BLOCKED'])('%s com o card concluído vira ressalva', (outcome) => {
    const r = routeDeclared(valid(outcome, { pending: 'p', failure_reason: 'f' }), ev({ cardClosed: true }));
    expect(r).toMatchObject({ kind: 'concern', text: expect.stringContaining(`declarou ${outcome}`) });
  });
  it('DONE não concluído não conclui por alegação', () => {
    expect(routeDeclared(valid('DONE'), ev())).toEqual({ kind: 'none' });
    expect(routeDeclared(valid('DONE_WITH_CONCERNS', { pending: 'p' }), ev())).toEqual({ kind: 'none' });
  });
  it('NEEDS_CONTEXT e BLOCKED não concluídos', () => {
    expect(routeDeclared(valid('NEEDS_CONTEXT', { pending: 'falta Y' }), ev())).toEqual({
      kind: 'needs-context',
      summary: 'resumo',
      pending: 'falta Y',
    });
    expect(routeDeclared(valid('BLOCKED', { failure_reason: 'sem acesso' }), ev())).toEqual({
      kind: 'block',
      reason: 'sem acesso\n\nresumo',
    });
  });
});

describe('contexto e ressalvas', () => {
  it('hash estável e sensível ao texto', () => {
    expect(descriptionHash('a')).toBe(descriptionHash('a'));
    expect(descriptionHash('a')).not.toBe(descriptionHash('b'));
    expect(descriptionHash(null)).toBe(descriptionHash(''));
    expect(descriptionHash('a')).toMatch(/^[0-9a-f]{8}$/);
  });
  it('contextReason e leitura do hash', () => {
    const reason = contextReason(card(5, 'x'), { summary: 's', pending: 'p' });
    expect(reason.startsWith(CONTEXT_MARK)).toBe(true);
    expect(isContextReason(reason)).toBe(true);
    expect(isContextReason('outro')).toBe(false);
    expect(contextHashOf(reason)).toBe(descriptionHash('x'));
    expect(contextHashOf('outro')).toBeNull();
    expect(isContextNote({ source: 'ai', body: `Resultado\n\n${reason}` })).toBe(true);
    expect(isContextNote({ source: 'human', body: reason })).toBe(false);
  });
  it('contextKey é estável e distinta das demais', () => {
    const story = card(1);
    const a = contextKey(
      story,
      [
        { cardId: 'b', hash: '1' },
        { cardId: 'a', hash: '2' },
      ],
      0,
    );
    expect(a).toBe(
      contextKey(
        story,
        [
          { cardId: 'a', hash: '2' },
          { cardId: 'b', hash: '1' },
        ],
        0,
      ),
    );
    expect(a).not.toBe(contextKey(story, [{ cardId: 'a', hash: '3' }], 0));
    expect(a).not.toBe(contextKey(story, [{ cardId: 'a', hash: '2' }], 9));
    expect(isContextKey(a)).toBe(true);
    expect(isContextKey('x')).toBe(false);
    expect(isContextKey(JSON.stringify(['story', 'c1', 'col', 'brief', [], 0]))).toBe(false);
  });
  it('contextBlockedReason cita as sub-tarefas', () => {
    expect(contextBlockedReason(card(1), [card(3), card(2)], 'limit')).toContain('#2, #3');
    expect(contextBlockedReason(card(1), [card(2)], 'unchanged')).toContain('continua a mesma');
  });
  it('concernsOf lê as notas da história sem repetir a execução', () => {
    const story = card(1);
    const note = concernNote(card(7), 'w1', 'olhar Z');
    expect(note.startsWith(CONCERN_MARK)).toBe(true);
    const s = {
      comments: [
        { cardId: 'c1', source: 'ai', body: note },
        { cardId: 'c1', source: 'ai', body: note },
        { cardId: 'c1', source: 'human', body: concernNote(card(8), 'w2', 'falso') },
        { cardId: 'c2', source: 'ai', body: concernNote(card(9), 'w3', 'outra história') },
        { cardId: 'c1', source: 'ai', body: concernNote(card(7), 'w9', 'segunda') },
      ],
    } as unknown as BoardState;
    expect(concernsOf(s, story)).toEqual([
      { ref: '#7', text: 'olhar Z' },
      { ref: '#7', text: 'segunda' },
    ]);
  });
});
