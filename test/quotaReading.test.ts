import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUOTA_CRITICAL,
  READING_FRESH_MS,
  criticalWindow,
  nextReading,
  parseReadings,
  quotaCriticalOf,
  readingStatus,
  windowLabel,
  type UsageReading,
} from '../src/shared/quotaReading';

const NOW = new Date(2026, 9, 29, 14, 0).getTime();
const reading = (percent: number, over: Partial<UsageReading> = {}, resetAt: number | null = NOW + 3_600_000): UsageReading => ({
  profileId: 'claude',
  readAt: NOW - 60_000,
  windows: [{ window: 'five_hour', percent, resetAt }],
  ...over,
});

describe('readingStatus', () => {
  it('29 min é fresca; 31 min é desconhecida', () => {
    expect(readingStatus([reading(50, { readAt: NOW - 29 * 60_000 })], 'claude', 80, NOW).kind).toBe('fresh');
    expect(readingStatus([reading(50, { readAt: NOW - 31 * 60_000 })], 'claude', 80, NOW).kind).toBe('unknown');
    expect(readingStatus([reading(50, { readAt: NOW - READING_FRESH_MS })], 'claude', 80, NOW).kind).toBe('fresh');
  });

  it('perfil sem leitura e readAt no futuro são desconhecidos', () => {
    expect(readingStatus([], 'claude', 80, NOW).kind).toBe('unknown');
    expect(readingStatus([reading(90, { readAt: NOW + 1000 })], 'claude', 80, NOW).kind).toBe('unknown');
  });

  it('janela renovada não conta como crítica', () => {
    const s = readingStatus([reading(95, {}, NOW - 1)], 'claude', 80, NOW);
    expect(s).toMatchObject({ kind: 'fresh', critical: null });
  });

  it('79% não, 80% e 86% sim, com limite 80', () => {
    const crit = (p: number) => (readingStatus([reading(p)], 'claude', 80, NOW) as { critical: unknown }).critical;
    expect(crit(79)).toBeNull();
    expect(crit(80)).not.toBeNull();
    expect(crit(86)).not.toBeNull();
  });

  it('escolhe a janela de maior porcentagem', () => {
    const r = reading(81);
    r.windows.push({ window: 'seven_day', percent: 90, resetAt: null });
    expect(criticalWindow([r], { quotaCritical: {} }, 'claude', NOW)?.window).toBe('seven_day');
  });
});

describe('limite crítico', () => {
  it('padrão 80 e limite 70 com 75%', () => {
    expect(quotaCriticalOf({ quotaCritical: {} }, 'claude')).toBe(DEFAULT_QUOTA_CRITICAL);
    expect(quotaCriticalOf({ quotaCritical: { claude: 70 } }, 'claude')).toBe(70);
    expect(criticalWindow([reading(75)], { quotaCritical: { claude: 70 } }, 'claude', NOW)?.percent).toBe(75);
    expect(criticalWindow([reading(75)], { quotaCritical: {} }, 'claude', NOW)).toBeNull();
  });
});

describe('nextReading', () => {
  it('arredonda a fração e converte resetsAt em ms', () => {
    const r = nextReading(
      'claude',
      { windows: [{ window: 'five_hour', utilization: 0.866, resetsAt: Math.floor((NOW + 3_600_000) / 1000) }] },
      NOW,
    );
    expect(r).toEqual({
      profileId: 'claude',
      readAt: NOW,
      windows: [{ window: 'five_hour', percent: 87, resetAt: Math.floor((NOW + 3_600_000) / 1000) * 1000 }],
    });
  });

  it('valor acima de 1 vale 100; negativo e NaN são descartados', () => {
    const r = nextReading(
      'claude',
      {
        windows: [
          { window: 'a', utilization: 1.4, resetsAt: null },
          { window: 'b', utilization: -1, resetsAt: null },
          { window: 'c', utilization: NaN, resetsAt: null },
        ],
      },
      NOW,
    );
    expect(r?.windows).toEqual([{ window: 'a', percent: 100, resetAt: null }]);
  });

  it('sem janela válida devolve null (RF12)', () => {
    expect(nextReading('claude', undefined, NOW)).toBeNull();
    expect(nextReading('claude', { windows: [] }, NOW)).toBeNull();
  });
});

describe('parseReadings', () => {
  it('lê o válido e descarta inválido, duplicado e janela ilegível', () => {
    const good = reading(40);
    const json = JSON.stringify([
      good,
      reading(99), // duplicado do mesmo perfil
      { profileId: 'Bad Id', readAt: 1, windows: [{ window: 'x', percent: 1, resetAt: null }] },
      { profileId: 'cursor', readAt: 1, windows: [{ window: 'x', percent: 'muito', resetAt: null }] },
      { profileId: 'codex', readAt: 'ontem', windows: [] },
      null,
    ]);
    expect(parseReadings(json)).toEqual([good]);
  });

  it('JSON inválido ou ausente vira lista vazia', () => {
    expect(parseReadings('{')).toEqual([]);
    expect(parseReadings(undefined)).toEqual([]);
    expect(parseReadings('{"a":1}')).toEqual([]);
  });
});

describe('windowLabel', () => {
  it('nomeia as janelas conhecidas', () => {
    expect(windowLabel('five_hour')).toBe('janela de 5 h');
    expect(windowLabel('seven_day_opus')).toBe('janela semanal');
    expect(windowLabel('x')).toBe('janela x');
  });
});
