import { describe, expect, it } from 'vitest';
import {
  BACKOFF_MAX_MS,
  LIMIT_SLACK_MS,
  RESET_MAX_AHEAD_MS,
  backoffMs,
  canDispatch,
  limitClock,
  limitHolds,
  heldProfiles,
  nextPause,
  nextWallTime,
  parsePauses,
  parseResetText,
  resetAtOf,
  type UsageLimitPause,
  type UsageLimitState,
} from '../src/shared/usageLimit';
import { boardState } from './fakes/board';

const MIN = 60_000;
// 16/10/2026 13:45 em São Paulo (UTC-3, sem horário de verão desde 2019): o horário do caso real (#615)
const NOW = Date.UTC(2026, 9, 16, 16, 45);

describe('parseResetText', () => {
  it('lê hora e minuto com am/pm e o fuso entre parênteses', () => {
    expect(parseResetText("You've hit your session limit · resets 1:50pm (America/Sao_Paulo)")).toEqual({
      hour: 13,
      minute: 50,
      zone: 'America/Sao_Paulo',
    });
  });

  it('lê a hora cheia ("resets 3pm"), o formato de 24 h ("resets at 13:50") e meia-noite/meio-dia', () => {
    expect(parseResetText('resets 3pm')).toEqual({ hour: 15, minute: 0, zone: null });
    expect(parseResetText('Limit reached · resets at 13:50')).toEqual({ hour: 13, minute: 50, zone: null });
    expect(parseResetText('resets 12am')).toEqual({ hour: 0, minute: 0, zone: null });
    expect(parseResetText('resets 12:30pm')).toEqual({ hour: 12, minute: 30, zone: null });
  });

  it('devolve null quando não há horário legível', () => {
    expect(parseResetText('usage limit reached')).toBeNull();
    expect(parseResetText('Your quota will reset when the current 5-hour window ends')).toBeNull();
    expect(parseResetText('resets 5')).toBeNull();
    expect(parseResetText('resets 13pm')).toBeNull();
    expect(parseResetText('resets at 25:00')).toBeNull();
  });
});

describe('nextWallTime', () => {
  it('acha o instante do horário no fuso informado', () => {
    expect(nextWallTime(13, 50, 'America/Sao_Paulo', NOW)).toBe(Date.UTC(2026, 9, 16, 16, 50));
    expect(nextWallTime(18, 0, 'UTC', NOW)).toBe(Date.UTC(2026, 9, 16, 18, 0));
  });

  it('passa para o dia seguinte quando o horário de hoje já passou (RF3: "1:50am" às 23:00)', () => {
    const at23 = Date.UTC(2026, 9, 17, 2, 0); // 16/10 23:00 em São Paulo
    expect(nextWallTime(1, 50, 'America/Sao_Paulo', at23)).toBe(Date.UTC(2026, 9, 17, 4, 50));
    expect(nextWallTime(13, 50, 'UTC', NOW)).toBe(Date.UTC(2026, 9, 17, 13, 50));
  });

  it('fuso inválido cai no fuso local', () => {
    expect(nextWallTime(13, 50, 'Nada/Isso', NOW)).toBe(nextWallTime(13, 50, null, NOW));
  });
});

describe('resetAtOf', () => {
  const reset = Date.UTC(2026, 9, 16, 16, 50);

  it('aceita o resetsAt em segundos e em milissegundos', () => {
    expect(resetAtOf({ resetsAt: reset / 1000, text: null }, NOW)).toBe(reset);
    expect(resetAtOf({ resetsAt: reset, text: null }, NOW)).toBe(reset);
  });

  it('prefere o resetsAt ao texto', () => {
    expect(resetAtOf({ resetsAt: reset / 1000, text: 'resets 3pm (America/Sao_Paulo)' }, NOW)).toBe(reset);
  });

  it('lê o texto no fuso dele e, sem fuso, no fuso local informado', () => {
    expect(resetAtOf({ resetsAt: null, text: 'resets 1:50pm (America/Sao_Paulo)' }, NOW)).toBe(reset);
    expect(resetAtOf({ resetsAt: null, text: 'resets 6pm' }, NOW, 'UTC')).toBe(Date.UTC(2026, 9, 16, 18, 0));
  });

  it('ignora horário no passado ou a mais de 8 dias e cai no texto ou em null (backoff)', () => {
    expect(resetAtOf({ resetsAt: NOW + RESET_MAX_AHEAD_MS + MIN, text: null }, NOW)).toBeNull();
    expect(resetAtOf({ resetsAt: (NOW - MIN) / 1000, text: null }, NOW)).toBeNull();
    expect(resetAtOf({ resetsAt: (NOW - MIN) / 1000, text: 'resets 1:50pm (America/Sao_Paulo)' }, NOW)).toBe(reset);
    expect(resetAtOf({ resetsAt: null, text: 'usage limit reached' }, NOW)).toBeNull();
    expect(resetAtOf(null, NOW)).toBeNull();
  });
});

describe('backoff e nextPause', () => {
  it('a espera dobra de 5 até 60 min (RF4)', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map((n) => backoffMs(n) / MIN)).toEqual([5, 10, 20, 40, 60, 60, 60]);
    expect(backoffMs(7)).toBe(BACKOFF_MAX_MS);
  });

  it('com horário, a pausa vai até a renovação + 3 min', () => {
    const reset = NOW + 5 * MIN;
    expect(nextPause(null, 'claude', reset, NOW)).toEqual({
      profileId: 'claude',
      resumeAt: reset + LIMIT_SLACK_MS,
      source: 'reset',
      attempts: 0,
    });
  });

  it('com horário, fica a renovação mais tarde', () => {
    const later: UsageLimitPause = { profileId: 'claude', resumeAt: NOW + 60 * MIN, source: 'reset', attempts: 0 };
    expect(nextPause(later, 'claude', NOW + 5 * MIN, NOW)).toBe(later);
    expect(nextPause(later, 'claude', NOW + 90 * MIN, NOW).resumeAt).toBe(NOW + 90 * MIN + LIMIT_SLACK_MS);
  });

  it('sem horário, a pausa que ainda vale não sobe o degrau; a vencida sobe', () => {
    const first = nextPause(null, 'claude', null, NOW);
    expect(first).toEqual({ profileId: 'claude', resumeAt: NOW + 5 * MIN, source: 'backoff', attempts: 1 });
    // outra execução em paralelo esbarrando no mesmo minuto
    expect(nextPause(first, 'claude', null, NOW + MIN)).toBe(first);
    // a execução de teste depois do vencimento esbarrou de novo
    const after = NOW + 6 * MIN;
    expect(nextPause(first, 'claude', null, after)).toEqual({
      profileId: 'claude',
      resumeAt: after + 10 * MIN,
      source: 'backoff',
      attempts: 2,
    });
  });

  it('a pausa de outra ferramenta não conta para o degrau', () => {
    const cursor: UsageLimitPause = { profileId: 'cursor', resumeAt: NOW - MIN, source: 'backoff', attempts: 4 };
    expect(nextPause(cursor, 'claude', null, NOW).attempts).toBe(1);
  });
});

describe('limitHolds, canDispatch e pauseOf por perfil', () => {
  const pause = (over: Partial<UsageLimitState> = {}): UsageLimitState[] => [
    { profileId: 'claude', resumeAt: NOW + 10 * MIN, source: 'reset', attempts: 0, probe: null, ...over },
  ];

  it('sem pausa nada segura', () => {
    const s = boardState();
    expect(limitHolds(s, 'claude', NOW)).toBe(false);
    expect(canDispatch(s, 'claude', NOW)).toBe(true);
  });

  it('com a pausa valendo segura só o perfil dela; vencida deixa uma execução de teste', () => {
    const s = boardState({ usageLimit: pause() });
    expect(limitHolds(s, 'claude', NOW)).toBe(true);
    expect(canDispatch(s, 'claude', NOW)).toBe(false);
    expect(canDispatch(s, 'cursor', NOW)).toBe(true);
    const later = NOW + 11 * MIN;
    expect(limitHolds(s, 'claude', later)).toBe(false);
    expect(canDispatch(s, 'claude', later)).toBe(true);
    expect(canDispatch(boardState({ usageLimit: pause({ probe: 'x' }) }), 'claude', later)).toBe(false);
  });

  it('heldProfiles lista só as pausas que ainda valem', () => {
    const s = boardState({ usageLimit: [...pause(), ...pause({ profileId: 'cursor', resumeAt: NOW - MIN })] });
    expect(heldProfiles(s, NOW).map((p) => p.profileId)).toEqual(['claude']);
  });
});

describe('parsePauses', () => {
  it('lê a lista gravada, uma entrada por perfil', () => {
    const list: UsageLimitPause[] = [
      { profileId: 'claude', resumeAt: NOW, source: 'backoff', attempts: 2 },
      { profileId: 'meu-perfil', resumeAt: NOW + 1, source: 'reset', attempts: 0 },
    ];
    expect(parsePauses(JSON.stringify(list))).toEqual(list);
  });

  it('valor ausente, corrompido, antigo ou com campo inválido vira lista vazia ou descarta a entrada', () => {
    for (const json of [undefined, '', 'lixo', 'null', '{}', '{"tool":"claude","resumeAt":1,"source":"reset","attempts":0}'])
      expect(parsePauses(json)).toEqual([]);
    const bad = [
      { profileId: '', resumeAt: 1, source: 'reset', attempts: 0 },
      { profileId: 'a', resumeAt: 'amanhã', source: 'reset', attempts: 0 },
      { profileId: 'a', resumeAt: 1, source: 'talvez', attempts: 0 },
      { profileId: 'a', resumeAt: 1, source: 'reset', attempts: -1 },
      { profileId: 'ok', resumeAt: 1, source: 'reset', attempts: 0 },
      { profileId: 'ok', resumeAt: 2, source: 'reset', attempts: 0 },
    ];
    expect(parsePauses(JSON.stringify(bad))).toEqual([{ profileId: 'ok', resumeAt: 1, source: 'reset', attempts: 0 }]);
  });
});

describe('limitClock', () => {
  it('mostra só a hora quando é hoje e a data na frente quando não é', () => {
    const today = new Date(2026, 9, 16, 13, 53).getTime();
    const tomorrow = new Date(2026, 9, 17, 1, 53).getTime();
    const now = new Date(2026, 9, 16, 13, 45).getTime();
    expect(limitClock(today, now)).toBe('13:53');
    expect(limitClock(tomorrow, now)).toBe('17/10 01:53');
  });
});
