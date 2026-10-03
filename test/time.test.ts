import { describe, expect, it } from 'vitest';
import { timeAgo } from '../src/shared/time';

describe('timeAgo', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const ago = (ms: number) => timeAgo(now - ms, now);

  it('menos de um minuto é "agora", inclusive com relógio adiantado', () => {
    expect(ago(0)).toBe('agora');
    expect(ago(59_000)).toBe('agora');
    expect(ago(-5_000)).toBe('agora');
  });

  it('arredonda para baixo em minutos, horas e dias', () => {
    expect(ago(60_000)).toBe('há 1 min');
    expect(ago(59 * 60_000)).toBe('há 59 min');
    expect(ago(3 * 3_600_000 + 59 * 60_000)).toBe('há 3 h');
    expect(ago(2 * 86_400_000 + 5 * 3_600_000)).toBe('há 2 d');
  });
});
