import { describe, expect, it } from 'vitest';
import {
  MAX_OUTCOME_REPAIRS,
  PHASE_OUTCOMES,
  PHASE_OUTCOME_ADVICE,
  outcomeEffect,
  readPhaseOutcome,
  repairRequest,
  type PhaseOutcome,
} from '../src/shared/phaseOutcome';

const done = { outcome: 'DONE', summary: 'Feito.' };

describe('readPhaseOutcome', () => {
  it('lê o objeto que fecha a resposta', () => {
    const r = readPhaseOutcome(`Texto antes.\n${JSON.stringify(done)}\n`);
    expect(r).toEqual({ kind: 'valid', value: { outcome: 'DONE', summary: 'Feito.', failure_reason: undefined, pending: undefined } });
  });

  it('aceita a cerca ```json', () => {
    expect(readPhaseOutcome('ok\n```json\n' + JSON.stringify(done) + '\n```').kind).toBe('valid');
  });

  it('texto depois do objeto é missing', () => {
    expect(readPhaseOutcome(JSON.stringify(done) + '\nobrigado!')).toEqual({ kind: 'missing' });
  });

  it('respeita "}" e "{" dentro de string', () => {
    const r = readPhaseOutcome(JSON.stringify({ outcome: 'DONE', summary: 'usei } e { e "aspas" \\ aqui' }));
    expect(r.kind).toBe('valid');
    if (r.kind === 'valid') expect(r.value.summary).toBe('usei } e { e "aspas" \\ aqui');
  });

  it('resposta vazia ou sem JSON é missing', () => {
    expect(readPhaseOutcome('')).toEqual({ kind: 'missing' });
    expect(readPhaseOutcome('   \n')).toEqual({ kind: 'missing' });
    expect(readPhaseOutcome('tudo certo')).toEqual({ kind: 'missing' });
  });

  it('chaves sem par são missing', () => {
    expect(readPhaseOutcome('fim }')).toEqual({ kind: 'missing' });
  });

  it('JSON quebrado é invalid', () => {
    const r = readPhaseOutcome('{"outcome": "DONE", "summary": }');
    expect(r.kind).toBe('invalid');
  });

  it('valor desconhecido de outcome é invalid, em português', () => {
    const r = readPhaseOutcome('{"outcome":"FEITO","summary":"x"}');
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') expect(r.problem).toContain('outcome');
  });

  it('summary ausente ou vazio é invalid', () => {
    expect(readPhaseOutcome('{"outcome":"DONE"}').kind).toBe('invalid');
    expect(readPhaseOutcome('{"outcome":"DONE","summary":"  "}').kind).toBe('invalid');
  });

  it('BLOCKED exige failure_reason', () => {
    expect(readPhaseOutcome('{"outcome":"BLOCKED","summary":"x"}').kind).toBe('invalid');
    expect(readPhaseOutcome('{"outcome":"BLOCKED","summary":"x","failure_reason":" "}').kind).toBe('invalid');
    expect(readPhaseOutcome('{"outcome":"BLOCKED","summary":"x","failure_reason":"sem acesso"}').kind).toBe('valid');
  });

  it.each(['NEEDS_CONTEXT', 'DONE_WITH_CONCERNS'])('%s exige pending', (outcome) => {
    expect(readPhaseOutcome(JSON.stringify({ outcome, summary: 'x' })).kind).toBe('invalid');
    expect(readPhaseOutcome(JSON.stringify({ outcome, summary: 'x', pending: null })).kind).toBe('invalid');
    expect(readPhaseOutcome(JSON.stringify({ outcome, summary: 'x', pending: 'algo' })).kind).toBe('valid');
  });

  it('DONE aceita null nos opcionais e ignora campos extras', () => {
    const r = readPhaseOutcome('{"outcome":"DONE","summary":"x","failure_reason":null,"pending":null,"extra":1}');
    expect(r.kind).toBe('valid');
    if (r.kind === 'valid') expect(r.value).not.toHaveProperty('extra');
  });

  it('o que não é objeto é invalid', () => {
    expect(readPhaseOutcome('[{"outcome":"DONE"}]').kind).toBe('missing');
    expect(readPhaseOutcome('{"a":1}').kind).toBe('invalid');
  });

  it('limita o summary a 4000', () => {
    const r = readPhaseOutcome(JSON.stringify({ outcome: 'DONE', summary: 'a'.repeat(5000) }));
    expect(r.kind === 'valid' && r.value.summary.length).toBe(4000);
  });

  it('usa o último objeto quando há outro antes', () => {
    const r = readPhaseOutcome('{"x":1}\n' + JSON.stringify(done));
    expect(r.kind).toBe('valid');
  });
});

describe('outcomeEffect', () => {
  const v = (o: Partial<PhaseOutcome> & { outcome: PhaseOutcome['outcome'] }): PhaseOutcome => ({ summary: 'S', ...o });
  const cases: Array<[PhaseOutcome, boolean, boolean, string]> = [
    [v({ outcome: 'DONE' }), true, false, 'ready'],
    [v({ outcome: 'DONE' }), true, true, 'ready'],
    [v({ outcome: 'DONE' }), false, true, 'waiting_review'],
    [v({ outcome: 'DONE' }), false, false, 'waiting_answer'],
    [v({ outcome: 'DONE_WITH_CONCERNS', pending: 'P' }), true, false, 'ready'],
    [v({ outcome: 'DONE_WITH_CONCERNS', pending: 'P' }), false, false, 'waiting_review'],
    [v({ outcome: 'DONE_WITH_CONCERNS', pending: 'P' }), false, true, 'waiting_review'],
    [v({ outcome: 'NEEDS_CONTEXT', pending: 'P' }), true, true, 'ready'],
    [v({ outcome: 'NEEDS_CONTEXT', pending: 'P' }), false, true, 'waiting_answer'],
    [v({ outcome: 'BLOCKED', failure_reason: 'R' }), true, false, 'blocked'],
    [v({ outcome: 'BLOCKED', failure_reason: 'R' }), false, true, 'blocked'],
  ];
  it.each(cases)('%j yolo=%s aprovação=%s -> %s', (value, yolo, columnRequiresApproval, status) => {
    const e = outcomeEffect(value, { yolo, columnRequiresApproval });
    expect(e.status).toBe(status);
    expect(e.comment).toContain('Desfecho informado no bloco final');
    expect(e.comment).toContain('S');
  });

  it('inclui ressalvas, necessidade e motivo', () => {
    const ctx = { yolo: false, columnRequiresApproval: false };
    expect(outcomeEffect(v({ outcome: 'DONE_WITH_CONCERNS', pending: 'P' }), ctx).comment).toContain('Ressalvas: P');
    expect(outcomeEffect(v({ outcome: 'NEEDS_CONTEXT', pending: 'P' }), ctx).comment).toContain('Preciso de: P');
    expect(outcomeEffect(v({ outcome: 'BLOCKED', failure_reason: 'R' }), ctx).reason).toBe('R\n\nS');
  });
});

describe('textos', () => {
  it('repairRequest cita o problema e o formato', () => {
    expect(repairRequest({ kind: 'missing' })).toContain('não há um objeto JSON');
    const text = repairRequest({ kind: 'invalid', problem: 'faltou X' });
    expect(text).toContain('faltou X');
    for (const o of PHASE_OUTCOMES) expect(text).toContain(o);
  });

  it('o pedido cita os 4 valores e MAX_OUTCOME_REPAIRS é 2', () => {
    for (const o of PHASE_OUTCOMES) expect(PHASE_OUTCOME_ADVICE).toContain(o);
    expect(MAX_OUTCOME_REPAIRS).toBe(2);
  });
});
