import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { driverFor } from '../src/extension/ai/drivers';
import { GEMINI_DAILY_RESET_ZONE, classifyGeminiFailure, durationMs } from '../src/extension/ai/drivers/gemini/limit';
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
  stricterHint,
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

  const LA = 'America/Los_Angeles';
  it('fim do horário de verão no Pacífico (1º/11/2026, dia de 25 h): o dia seguinte vem do calendário, nunca no passado', () => {
    // 1º/11 00:30 PDT (07:30 UTC), 01:30 PST, a segunda vez (09:30 UTC), 10:00 PST e 23:30 PST: meia-noite de 2/11 PST
    for (const now of [Date.UTC(2026, 10, 1, 7, 30), Date.UTC(2026, 10, 1, 9, 30), Date.UTC(2026, 10, 1, 18), Date.UTC(2026, 10, 2, 7, 30)])
      expect(nextWallTime(0, 0, LA, now)).toBe(Date.UTC(2026, 10, 2, 8, 0));
    // 31/10 23:00 PDT: a meia-noite de 1º/11 ainda é PDT
    expect(nextWallTime(0, 0, LA, Date.UTC(2026, 10, 1, 6, 0))).toBe(Date.UTC(2026, 10, 1, 7, 0));
    // 13:50 já passou em 1º/11 (14:00 PST): 13:50 de 2/11 PST
    expect(nextWallTime(13, 50, LA, Date.UTC(2026, 10, 1, 22, 0))).toBe(Date.UTC(2026, 10, 2, 21, 50));
    expect(resetAtOf({ resetsAt: null, text: null, dailyResetZone: LA }, Date.UTC(2026, 10, 1, 18))).toBe(Date.UTC(2026, 10, 2, 8, 0));
  });

  it('início do horário de verão no Pacífico (8/3/2026 e 14/3/2027, dia de 23 h)', () => {
    // 7/3 23:30 PST: a meia-noite de 8/3 ainda é PST
    expect(nextWallTime(0, 0, LA, Date.UTC(2026, 2, 8, 7, 30))).toBe(Date.UTC(2026, 2, 8, 8, 0));
    // 8/3 10:00 PDT: a meia-noite de 9/3 já é PDT
    expect(nextWallTime(0, 0, LA, Date.UTC(2026, 2, 8, 17, 0))).toBe(Date.UTC(2026, 2, 9, 7, 0));
    expect(nextWallTime(0, 0, LA, Date.UTC(2027, 2, 14, 19, 0))).toBe(Date.UTC(2027, 2, 15, 7, 0));
    expect(nextWallTime(23, 0, LA, Date.UTC(2027, 2, 15, 6, 30))).toBe(Date.UTC(2027, 2, 15, 6, 0) + 24 * 60 * MIN);
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

describe('resetAtOf: a cota diária e a espera pedida pela API (história 12)', () => {
  it('a cota diária renova na próxima meia-noite do Pacífico', () => {
    // 16/10 16:45 UTC é 09:45 em Los Angeles (horário de verão, UTC-7): a meia-noite seguinte é 17/10 07:00 UTC
    expect(resetAtOf({ resetsAt: null, text: null, dailyResetZone: GEMINI_DAILY_RESET_ZONE }, NOW)).toBe(Date.UTC(2026, 9, 17, 7, 0));
    // depois do fim do horário de verão (1º/11/2026), UTC-8
    expect(resetAtOf({ resetsAt: null, text: null, dailyResetZone: GEMINI_DAILY_RESET_ZONE }, Date.UTC(2026, 10, 10, 12))).toBe(
      Date.UTC(2026, 10, 11, 8, 0),
    );
  });

  it('o retryDelay é a pausa curta, a partir de agora; a cota diária vence o retryDelay curto', () => {
    expect(resetAtOf({ resetsAt: null, text: null, retryAfterMs: 41_000 }, NOW)).toBe(NOW + 41_000);
    expect(resetAtOf({ resetsAt: null, text: null, retryAfterMs: 13_000, dailyResetZone: GEMINI_DAILY_RESET_ZONE }, NOW)).toBe(
      Date.UTC(2026, 9, 17, 7, 0),
    );
    // a pausa do perfil: a espera + a folga de sempre
    expect(nextPause(null, 'gemini', resetAtOf({ resetsAt: null, text: null, retryAfterMs: 41_000 }, NOW), NOW)).toEqual({
      profileId: 'gemini',
      resumeAt: NOW + 41_000 + LIMIT_SLACK_MS,
      source: 'reset',
      attempts: 0,
    });
  });

  it('espera inválida ou longe demais cai no backoff', () => {
    expect(resetAtOf({ resetsAt: null, text: null, retryAfterMs: 0 }, NOW)).toBeNull();
    expect(resetAtOf({ resetsAt: null, text: null, retryAfterMs: RESET_MAX_AHEAD_MS + MIN }, NOW)).toBeNull();
  });
});

const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const DAILY = { resetsAt: null, text: null, dailyResetZone: GEMINI_DAILY_RESET_ZONE };

describe('classifyGeminiFailure: o limite de uso do Gemini nos três modos', () => {
  it('CLI: o erro do result da 0.65.0 com a cota diária (a fixture gravada) é limite, com a renovação da meia-noite', () => {
    const line = fs
      .readFileSync(path.join(__dirname, 'fixtures', 'gemini-stream-json-quota.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .find((e) => e.type === 'result');
    expect(classifyGeminiFailure({ message: line.error.message })).toEqual({ usageLimitReached: true, usageLimitHint: DAILY });
  });

  it('ACP: o session/prompt com o código 429 do Gemini CLI, na cota diária e no 429 que escapou das tentativas', () => {
    expect(classifyGeminiFailure({ code: 429, message: 'You have exhausted your daily quota on this model.' })).toEqual({
      usageLimitReached: true,
      usageLimitHint: DAILY,
    });
    // sem horário: a pausa usa o backoff
    expect(classifyGeminiFailure({ code: 429, message: 'Rate limit exceeded. Try again later.' })).toEqual({ usageLimitReached: true });
  });

  it('API: o 429 RESOURCE_EXHAUSTED por minuto dá a pausa curta do RetryInfo; o diário, a meia-noite', () => {
    const minute = fixture('gemini-api-429-minute.json') as { error: { message: string; status: string } };
    expect(classifyGeminiFailure({ code: 429, message: minute.error.message, status: minute.error.status, body: minute })).toEqual({
      usageLimitReached: true,
      usageLimitHint: { resetsAt: null, text: null, retryAfterMs: 41_000 },
    });
    const daily = fixture('gemini-api-429-daily.json') as { error: { message: string } };
    expect(classifyGeminiFailure({ code: 429, message: daily.error.message, body: daily })).toEqual({
      usageLimitReached: true,
      usageLimitHint: DAILY,
    });
  });

  it('a espera escrita no texto (sem detalhes): "Please retry in", "Suggested retry after" e o JSON embutido pela CLI', () => {
    expect(classifyGeminiFailure({ message: 'Quota exceeded for metric x. Please retry in 41.536s.' }).usageLimitHint).toEqual({
      resetsAt: null,
      text: null,
      retryAfterMs: 41_536,
    });
    expect(
      classifyGeminiFailure({ message: 'You exceeded your current quota.\nSuggested retry after 30s.' }).usageLimitHint?.retryAfterMs,
    ).toBe(30_000);
    const embedded = `[API Error: ${JSON.stringify(fixture('gemini-api-429-daily.json'))}]`;
    expect(classifyGeminiFailure({ message: embedded })).toEqual({ usageLimitReached: true, usageLimitHint: DAILY });
  });

  it('créditos e capacidade esgotados são limite; chave recusada, modelo inexistente e erro comum não', () => {
    expect(
      classifyGeminiFailure({
        message: 'Insufficient credits',
        code: 403,
        body: {
          error: {
            code: 403,
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'INSUFFICIENT_G1_CREDITS_BALANCE' }],
          },
        },
      }).usageLimitReached,
    ).toBe(true);
    expect(classifyGeminiFailure({ message: 'Model capacity exhausted: MODEL_CAPACITY_EXHAUSTED', code: 503 }).usageLimitReached).toBe(
      true,
    );
    for (const failure of [
      { message: 'API key not valid. Please pass a valid API key.', code: 400, status: 'INVALID_ARGUMENT' },
      { message: 'models/gemini-9 is not found for API version v1beta', code: 404, status: 'NOT_FOUND' },
      { message: 'Gemini API key is missing or not configured.', code: -32000 },
      { message: 'erro sem mensagem' },
    ])
      expect(classifyGeminiFailure(failure)).toEqual({ usageLimitReached: false });
  });

  it('um 429 solto no texto não é limite; como status ("status: 429 Too Many Requests", "HTTP 429") é', () => {
    for (const message of ['Lines 1-429 processed', 'Li 429 arquivos', 'issue #429 resolvida'])
      expect(classifyGeminiFailure({ message })).toEqual({ usageLimitReached: false });
    expect(classifyGeminiFailure({ message: '[API Error: got status: 429 Too Many Requests.]' }).usageLimitReached).toBe(true);
    expect(classifyGeminiFailure({ message: 'Request failed: HTTP 429' }).usageLimitReached).toBe(true);
    // no ACP e na API vale o código numérico, não o texto
    expect(classifyGeminiFailure({ message: 'Too many', code: 429 }).usageLimitReached).toBe(true);
    expect(classifyGeminiFailure({ message: 'Lines 1-429 processed', code: 500 }).usageLimitReached).toBe(false);
  });

  it('stricterHint: a diária vence a curta, nas duas ordens; entre curtas, a mais recente', () => {
    const short = (ms: number) => ({ resetsAt: null, text: null, retryAfterMs: ms });
    expect(stricterHint(DAILY, short(41_000))).toBe(DAILY);
    expect(stricterHint(short(41_000), DAILY)).toBe(DAILY);
    expect(stricterHint(short(41_000), short(5_000))).toEqual(short(5_000));
    expect(stricterHint(undefined, short(1))).toEqual(short(1));
    expect(stricterHint(DAILY, undefined)).toBe(DAILY);
  });

  it('durationMs lê a Duration do protobuf em JSON', () => {
    expect(['41s', '0.5s', '1500ms', '41.536101329s', 'x', '', '-3s'].map((d) => durationMs(d))).toEqual([
      41_000,
      500,
      1500,
      41_537,
      null,
      null,
      null,
    ]);
  });

  it('os três modos do Gemini expõem a mesma classificação no driver; o Claude Code e o Cursor não têm', () => {
    for (const mode of ['cli', 'acp', 'api'] as const) expect(driverFor('gemini', mode)?.classifyFailure).toBe(classifyGeminiFailure);
    expect(driverFor('claude', 'cli')?.classifyFailure).toBeUndefined();
    expect(driverFor('cursor', 'cli')?.classifyFailure).toBeUndefined();
    // os outros agentes ACP não dizem como escrevem o limite: o board não adivinha pelo texto
    expect(driverFor('opencode', 'acp')?.classifyFailure).toBeUndefined();
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
