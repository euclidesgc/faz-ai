import { describe, expect, it } from 'vitest';
import {
  BREAKER_MARK,
  breakerNote,
  breakerTrip,
  failureSignature,
  gateFailureMessage,
  isBreakerNote,
  normalizeFailureMessage,
  runFailureMessage,
  type FailureOccurrence,
} from '../src/shared/failureSignature';

const occ = (signature: string, at: number, cardId = 'a'): FailureOccurrence => ({
  signature,
  origin: 'gate',
  at,
  cardId,
  cardNumber: 1,
  detail: signature,
});

describe('normalizeFailureMessage', () => {
  it.each([
    ['2 testes falharam', 'testes falharam'],
    ['5 Testes Falharam', 'testes falharam'],
    ['\u001b[31mError\u001b[0m: boom', 'error: boom'],
    ['at 2026-10-30T02:14:05Z failed', 'at failed'],
    ['[12:30:01] erro', 'erro'],
    ['cannot open /tmp/abc/x.log now', 'cannot open <tmp> now'],
    ['in /Users/x/repo.worktrees/1097-a/src/f.ts', 'in <tmp>'],
    ['commit 8c5a40d3 broke', 'commit broke'],
    ['id 123e4567-e89b-12d3-a456-426614174000 gone', 'id gone'],
    ['a   b \n c', 'a b c'],
  ])('%s', (raw, out) => expect(normalizeFailureMessage(raw)).toBe(out));

  it('corta em 240', () => {
    expect(normalizeFailureMessage('x'.repeat(500))).toHaveLength(240);
  });
});

describe('mensagens', () => {
  it('failureSignature usa coluna | origem | mensagem', () => {
    expect(failureSignature('Revisão', 'gate', 'tsc: 3 errors')).toBe('Revisão | gate | tsc: errors');
  });
  it('runFailureMessage: erro, linha de erro da saída, depois códigos', () => {
    const base = { errorMessage: null, tail: [], code: 2, timedOut: false, stalled: false };
    expect(runFailureMessage({ ...base, errorMessage: 'spawn falhou' })).toBe('spawn falhou');
    expect(runFailureMessage({ ...base, tail: ['ok', 'Error: x', 'fim'] })).toBe('Error: x');
    expect(runFailureMessage({ ...base, timedOut: true })).toBe('tempo limite');
    expect(runFailureMessage({ ...base, stalled: true })).toBe('sem atividade');
    expect(runFailureMessage(base)).toBe('código 2');
  });
  it('gateFailureMessage', () => {
    expect(gateFailureMessage('tsc', 'a\nerror TS1: x\n\n')).toBe('tsc: error TS1: x');
    expect(gateFailureMessage('lint', '')).toBe('lint: falhou');
  });
});

describe('breakerTrip', () => {
  it('bloqueia no terceiro A em A,B,A,B,A', () => {
    const seq = ['A', 'B', 'A', 'B', 'A'].map((s, i) => occ(s, i + 1));
    expect(breakerTrip(seq.slice(0, 4), 3)).toBeNull();
    const t = breakerTrip(seq, 3);
    expect(t?.signature).toBe('A');
    expect(t?.count).toBe(3);
  });
  it('várias assinaturas: vence a mais repetida', () => {
    const seq = [...'AAABBBB'].map((s, i) => occ(s, i));
    expect(breakerTrip(seq, 3)?.signature).toBe('B');
  });
  it('since: ocorrências antigas são filtradas por quem chama; lista vazia não bloqueia', () => {
    expect(breakerTrip([], 3)).toBeNull();
  });
});

describe('breakerNote', () => {
  it('traz marca, assinatura e histórico das 10 mais recentes', () => {
    const items = Array.from({ length: 12 }, (_, i) => occ('A', i + 1));
    const trip = breakerTrip(items, 3)!;
    const note = breakerNote(trip, 3);
    expect(note.startsWith(BREAKER_MARK)).toBe(true);
    expect(note).toContain('`A`');
    expect(note).toContain('12 vezes');
    expect(note).toContain('\n12. ');
    expect(note).not.toContain('\n2. ');
    expect(isBreakerNote({ source: 'ai', body: note })).toBe(true);
    expect(isBreakerNote({ source: 'human', body: note })).toBe(false);
  });
});
