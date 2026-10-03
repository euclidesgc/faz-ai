import { describe, expect, it } from 'vitest';
import { dayOf, monthOf } from '../src/shared/log';

// Fixa o fuso para o teste não depender do fuso da máquina que roda o CI, e ainda assim exercitar um
// deslocamento negativo (América/São_Paulo, UTC-3) — é o que expõe um `toISOString` disfarçado de local.
process.env.TZ = 'America/Sao_Paulo';

describe('monthOf e dayOf', () => {
  it('formatam no fuso local, não em UTC', () => {
    // 2026-01-02T02:30Z é 2026-01-01T23:30 em UTC-3: dia e mês diferentes do que toISOString diria
    const ts = Date.UTC(2026, 0, 2, 2, 30);
    expect(monthOf(ts)).toBe('2026-01');
    expect(dayOf(ts)).toBe('2026-01-01');
  });

  it('vira o mês', () => {
    // 2026-02-01T02:00Z é 2026-01-31T23:00 em UTC-3
    const antes = Date.UTC(2026, 1, 1, 2, 0);
    expect(monthOf(antes)).toBe('2026-01');
    expect(dayOf(antes)).toBe('2026-01-31');

    // 2026-02-01T03:00Z é 2026-02-01T00:00 em UTC-3
    const depois = Date.UTC(2026, 1, 1, 3, 0);
    expect(monthOf(depois)).toBe('2026-02');
    expect(dayOf(depois)).toBe('2026-02-01');
  });

  it('vira o ano', () => {
    // 2027-01-01T02:00Z é 2026-12-31T23:00 em UTC-3
    const antes = Date.UTC(2027, 0, 1, 2, 0);
    expect(monthOf(antes)).toBe('2026-12');
    expect(dayOf(antes)).toBe('2026-12-31');

    // 2027-01-01T03:00Z é 2027-01-01T00:00 em UTC-3
    const depois = Date.UTC(2027, 0, 1, 3, 0);
    expect(monthOf(depois)).toBe('2027-01');
    expect(dayOf(depois)).toBe('2027-01-01');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    const ts = Date.UTC(2026, 2, 5, 15, 0); // 5 de março, meio da tarde em UTC-3
    expect(monthOf(ts)).toBe('2026-03');
    expect(dayOf(ts)).toBe('2026-03-05');
  });
});
