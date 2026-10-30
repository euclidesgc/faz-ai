import { describe, expect, it } from 'vitest';
import { classifyFailure, MAX_TRANSIENT_RETRIES, RETRY_DELAYS_MS, retryDelay, type FailureSignals } from '../src/shared/failureClass';

const base: FailureSignals = {
  stopped: false,
  timedOut: false,
  stalled: false,
  code: 0,
  hasError: false,
  usageLimitReached: false,
  transientFailure: false,
  tail: [],
};
const c = (over: Partial<FailureSignals>) => classifyFailure({ ...base, ...over });

describe('classifyFailure', () => {
  it.each<[string, Partial<FailureSignals>, ReturnType<typeof classifyFailure>]>([
    ['sucesso', {}, null],
    ['parada pela pessoa', { stopped: true, code: 143 }, 'canceled'],
    ['parada vence o limite de uso', { stopped: true, usageLimitReached: true, code: 1 }, 'canceled'],
    ['limite de uso', { usageLimitReached: true, code: 1, transientFailure: true }, 'budget'],
    ['limite de uso mesmo com saída 0', { usageLimitReached: true }, 'budget'],
    ['stalled', { stalled: true, timedOut: true, code: 143 }, 'deterministic'],
    ['timeout', { timedOut: true, code: 143, transientFailure: true }, 'deterministic'],
    ['sinal estrutural do leitor', { code: 1, transientFailure: true }, 'transient'],
    ['143 sem stopped', { code: 143 }, 'transient'],
    ['137 sem stopped', { code: 137 }, 'transient'],
    ['código 1 sem sinal', { code: 1, tail: ['Error: bug no código'] }, 'deterministic'],
    ['código nulo', { code: null }, 'deterministic'],
    ['texto de rede no tail', { code: 1, tail: ['x', 'Error: socket hang up'] }, 'transient'],
    ['texto de rede com erro ao iniciar', { code: null, hasError: true, tail: ['fetch failed'] }, 'transient'],
    ['texto de rede com saída 0 não conta', { code: 0, tail: ['ECONNRESET visto no log'] }, null],
    ['erro ao iniciar sem texto', { code: 0, hasError: true }, 'deterministic'],
  ])('%s', (_name, over, expected) => {
    expect(c(over)).toBe(expected);
  });

  it('o fallback de texto só olha as últimas 20 linhas', () => {
    const tail = ['ECONNRESET', ...Array.from({ length: 25 }, (_, i) => `linha ${i}`)];
    expect(c({ code: 1, tail })).toBe('deterministic');
  });
});

describe('retentativas', () => {
  it('3 tentativas com 30 s, 2 min e 5 min', () => {
    expect(MAX_TRANSIENT_RETRIES).toBe(3);
    expect(RETRY_DELAYS_MS).toEqual([30_000, 120_000, 300_000]);
    expect([1, 2, 3].map(retryDelay)).toEqual([30_000, 120_000, 300_000]);
    expect(retryDelay(0)).toBe(30_000);
    expect(retryDelay(9)).toBe(300_000);
  });
});
