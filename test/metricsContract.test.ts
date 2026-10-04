import { describe, expect, it } from 'vitest';
import { EMPTY_METRICS_FILTERS, resolvePeriod, type MetricsFilters, type MetricsPeriod } from '../src/shared/metrics';

// 2026-10-04, 22:30 no fuso da máquina: a hora tardia é de propósito, é onde `toISOString()` erraria o dia
const NOW = new Date(2026, 9, 4, 22, 30).getTime();

const f = (period: MetricsPeriod, extra: Partial<MetricsFilters> = {}): MetricsFilters => ({ ...EMPTY_METRICS_FILTERS, period, ...extra });

describe('resolvePeriod', () => {
  it('today: hoje dos dois lados', () => {
    expect(resolvePeriod(f('today'), NOW)).toEqual({ startDate: '2026-10-04', endDate: '2026-10-04' });
  });

  it('7d: seis dias atrás até hoje (sete dias com o de hoje)', () => {
    expect(resolvePeriod(f('7d'), NOW)).toEqual({ startDate: '2026-09-28', endDate: '2026-10-04' });
  });

  it('30d: vinte e nove dias atrás até hoje', () => {
    expect(resolvePeriod(f('30d'), NOW)).toEqual({ startDate: '2026-09-05', endDate: '2026-10-04' });
  });

  it('thisMonth: dia 1 do mês corrente até hoje', () => {
    expect(resolvePeriod(f('thisMonth'), NOW)).toEqual({ startDate: '2026-10-01', endDate: '2026-10-04' });
  });

  it('thisMonth no dia 1: um dia só', () => {
    const day1 = new Date(2026, 9, 1, 0, 5).getTime();
    expect(resolvePeriod(f('thisMonth'), day1)).toEqual({ startDate: '2026-10-01', endDate: '2026-10-01' });
  });

  it('12m: dia 1 de onze meses atrás até hoje, doze meses com o corrente', () => {
    const r = resolvePeriod(f('12m'), NOW);
    expect(r).toEqual({ startDate: '2025-11-01', endDate: '2026-10-04' });
    const [y0 = 0, m0 = 0] = r.startDate!.split('-').map(Number);
    const [y1 = 0, m1 = 0] = r.endDate!.split('-').map(Number);
    expect((y1 - y0) * 12 + (m1 - m0) + 1).toBe(12);
  });

  it('12m em janeiro vira o ano para trás', () => {
    const jan = new Date(2026, 0, 15, 12).getTime();
    expect(resolvePeriod(f('12m'), jan)).toEqual({ startDate: '2025-02-01', endDate: '2026-01-15' });
  });

  it('all: nenhum recorte', () => {
    expect(resolvePeriod(f('all'), NOW)).toEqual({});
  });

  it('custom com os dois lados', () => {
    expect(resolvePeriod(f('custom', { from: '2026-08-10', to: '2026-09-20' }), NOW)).toEqual({
      startDate: '2026-08-10',
      endDate: '2026-09-20',
    });
  });

  it('custom só com o início: o fim fica aberto', () => {
    expect(resolvePeriod(f('custom', { from: '2026-08-10' }), NOW)).toEqual({ startDate: '2026-08-10' });
  });

  it('custom só com o fim: o início fica aberto', () => {
    expect(resolvePeriod(f('custom', { to: '2026-09-20' }), NOW)).toEqual({ endDate: '2026-09-20' });
  });

  it('custom sem lado nenhum: sem recorte', () => {
    expect(resolvePeriod(f('custom'), NOW)).toEqual({});
  });

  it('o padrão é 12m', () => {
    expect(EMPTY_METRICS_FILTERS.period).toBe('12m');
  });
});
