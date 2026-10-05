import { lastSent, renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HostToWebview } from '../../src/shared/messages';
import { EMPTY_METRICS_FILTERS, type MetricsMonth, type MetricsPanelResult } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { MetricsView } from '../../src/webview/components/metrics/MetricsView';
import { MonthSeries, seriesPoints } from '../../src/webview/components/metrics/MonthSeries';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

// #160: a série de custo e tokens por mês (barras em SVG, alternador e tabela equivalente).

afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS });
  setLocale('pt-BR');
});

const tokens = (total: number) => ({ input: total / 2, output: total / 2, cacheRead: 0, cacheWrite: 0, total });

const month = (m: string, over: Partial<MetricsMonth> = {}): MetricsMonth => ({
  month: m,
  present: true,
  archived: false,
  partial: false,
  cardsDone: 3,
  runs: 4,
  runsOpen: 0,
  durationMs: 60_000,
  measuredRuns: 4,
  costedRuns: 4,
  tokens: tokens(1000),
  costUsd: 10,
  costEstimatedUsd: 10,
  costInformedUsd: null,
  ...over,
});

const gap = (m: string): MetricsMonth =>
  month(m, {
    present: false,
    cardsDone: 0,
    runs: 0,
    durationMs: 0,
    measuredRuns: 0,
    costedRuns: 0,
    tokens: null,
    costUsd: null,
    costEstimatedUsd: null,
  });

function panel(months: MetricsMonth[], over: Partial<MetricsPanelResult> = {}): MetricsPanelResult {
  const { month: _m, present: _p, archived: _a, partial: _x, ...totals } = month('2026-10');
  return {
    range: { startDate: '2026-07-04', endDate: '2026-10-04' },
    clamped: false,
    totals,
    months,
    workflows: ['Desenvolvimento'],
    logSince: '2026-07-04',
    detailFrom: '2026-07',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 4, detailRows: 40 },
    sections: emptySections(),
    ...over,
  };
}

/** Julho começou no dia 4 (parcial), agosto sem dado, setembro com custo zero, outubro corrente (parcial). */
const fourMonths = [
  month('2026-07', { partial: true, costUsd: 5, tokens: tokens(2000) }),
  gap('2026-08'),
  month('2026-09', { costUsd: 0, tokens: tokens(0) }),
  month('2026-10', { partial: true, costUsd: 12.5, tokens: tokens(4000) }),
];

const plain = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ');
const bars = (c: HTMLElement) => [...c.querySelectorAll<SVGRectElement>('rect.metrics-series-bar')];
const bar = (c: HTMLElement, m: string) => c.querySelector<SVGRectElement>(`rect.metrics-series-bar[data-month="${m}"]`);
const row = (m: string) => document.querySelector<HTMLTableRowElement>(`tbody tr[data-month="${m}"]`)!;
const cells = (m: string) => [...row(m).children].map((c) => plain(c.textContent));

describe('MonthSeries: lacuna, zero e parcial', () => {
  it('mês sem dado é espaço rotulado "sem dado", não barra; mês zero é barra de altura zero com o valor (RF-13)', () => {
    const { container } = renderThemed(<MonthSeries result={panel(fourMonths)} />);
    expect(bar(container, '2026-08')).toBeNull();
    const label = container.querySelector('.metrics-series-labels li[data-month="2026-08"]')!;
    expect(label).toHaveTextContent('sem dado');
    expect(cells('2026-08')[2]).toBe('sem dado');

    const zero = bar(container, '2026-09')!;
    expect(zero).not.toBeNull();
    expect(zero.getAttribute('height')).toBe('0');
    expect(cells('2026-09')).toEqual(['set/2026', 'US$ 0,00', '']);
    // as duas histórias opostas não saem com o mesmo texto
    expect(cells('2026-08')[1]).not.toBe(cells('2026-09')[1]);
  });

  it('mês parcial: hachura e contorno no gráfico e a palavra "parcial" na tabela, nada só na cor (RF-17, RF-28)', () => {
    const { container } = renderThemed(<MonthSeries result={panel(fourMonths)} />);
    const current = bar(container, '2026-10')!;
    expect(current).toHaveClass('is-partial');
    const fill = current.getAttribute('fill')!;
    expect(fill).toMatch(/^url\(#.+\)$/);
    const pattern = container.querySelector(`pattern#${fill.slice(5, -1)}`);
    expect(pattern).not.toBeNull();
    expect(pattern!.querySelector('rect')).not.toBeNull();
    expect(cells('2026-10')[2]).toBe('parcial');
    expect(cells('2026-07')[2]).toBe('parcial');
    // mês cheio: sem hachura e sem a palavra
    expect(bar(container, '2026-09')).not.toHaveClass('is-partial');
    expect(bar(container, '2026-09')!.getAttribute('fill')).toBeNull();
    expect(cells('2026-09')[2]).toBe('');
  });

  it('mês arquivado diz "só total mensal" na tabela', () => {
    renderThemed(<MonthSeries result={panel([month('2026-09', { archived: true }), month('2026-10', { partial: true })])} />);
    expect(cells('2026-09')[2]).toBe('só total mensal');
  });

  it('a espinha vem do host: a tela não recalcula present nem partial', () => {
    const points = seriesPoints(fourMonths, 'cost');
    expect(points.map((p) => p.state)).toEqual(['value', 'gap', 'value', 'value']);
    expect(points.map((p) => p.partial)).toEqual([true, false, false, true]);
    // presente sem medição é "não medido", não zero nem lacuna
    expect(seriesPoints([month('2026-10', { costUsd: null })], 'cost')[0]).toMatchObject({ state: 'unmeasured', value: null });
  });
  it('custo parcial (costedRuns < runs) aparece na série de custo e não na de tokens', async () => {
    const months = [month('2026-09', { costedRuns: 2 }), month('2026-10', { costedRuns: 4 })];
    const points = seriesPoints(months, 'cost');
    expect(points.map((p) => p.costPartial)).toEqual([true, false]);
    expect(seriesPoints(months, 'tokens').map((p) => p.costPartial)).toEqual([false, false]);
    const { container } = renderThemed(<MonthSeries result={panel(months)} />);
    expect(cells('2026-09')[2]).toBe('custo parcial');
    expect(bar(container, '2026-09')).toHaveClass('is-partial');
    expect(cells('2026-10')[2]).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Tokens' }));
    expect(cells('2026-09')[2]).toBe('');
  });

  it('custo não medido (costedRuns 0) com tokens medidos: "não medido" só na série de custo', async () => {
    const months = [month('2026-10', { costedRuns: 0, costUsd: null, costEstimatedUsd: null })];
    expect(seriesPoints(months, 'cost')[0]).toMatchObject({ state: 'unmeasured', costPartial: false });
    expect(seriesPoints(months, 'tokens')[0]).toMatchObject({ state: 'value' });
  });

  it('sem costedRuns na resposta cai no comportamento antigo', () => {
    const legacy = { ...month('2026-10'), costedRuns: undefined } as unknown as MetricsMonth;
    expect(seriesPoints([legacy], 'cost')[0]?.costPartial).toBe(false);
  });
});

describe('MonthSeries: gráfico e tabela equivalente', () => {
  it('tabela visível com um valor por mês, batendo com as barras (RF-30)', () => {
    const { container } = renderThemed(<MonthSeries result={panel(fourMonths)} />);
    const table = screen.getByRole('table');
    expect(table).toBeVisible();
    expect(table).not.toHaveClass('sr-only');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + fourMonths.length);
    expect(within(table).getByRole('columnheader', { name: 'Custo' })).toBeInTheDocument();
    for (const m of fourMonths) {
      const b = bar(container, m.month);
      if (!m.present) continue;
      expect(Number(b!.getAttribute('data-value'))).toBe(m.costUsd);
    }
    expect(cells('2026-10')).toEqual(['out/2026', 'US$ 12,50', 'parcial']);
    expect(cells('2026-07')[1]).toBe('US$ 5,00');
    // a barra maior é a de maior valor, e a escala começa no zero
    const heights = bars(container).map((b) => Number(b.getAttribute('height')));
    expect(Math.max(...heights)).toBe(Number(bar(container, '2026-10')!.getAttribute('height')));
    expect(Number(bar(container, '2026-07')!.getAttribute('height'))).toBeCloseTo(
      Number(bar(container, '2026-10')!.getAttribute('height')) * (5 / 12.5),
    );
  });

  it('o <svg> é role="img" com aria-label resumindo a série, e não tem texto dentro', () => {
    const { container } = renderThemed(<MonthSeries result={panel(fourMonths)} />);
    const svg = screen.getByRole('img');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    const label = plain(svg.getAttribute('aria-label'));
    expect(label).toContain('Custo por mês, julho de 2026 – outubro de 2026.');
    expect(label).toContain('Maior valor: US$ 12,50, em outubro de 2026.');
    expect(label).toContain('1 mês sem dado.');
    expect(label).toContain('2 meses parciais.');
    expect(container.querySelector('svg.metrics-series-svg text')).toBeNull();
    expect(svg.textContent).toBe('');
  });

  it('um mês só: uma barra, gráfico estreito, sem fingir tendência (RF-15)', () => {
    const { container } = renderThemed(<MonthSeries result={panel([month('2026-10', { partial: true, costUsd: 3 })])} />);
    expect(bars(container)).toHaveLength(1);
    expect(container.querySelector('.metrics-series-chart')).toHaveClass('is-single');
    expect(container.querySelector('polyline, path')).toBeNull();
    expect(plain(screen.getByRole('img').getAttribute('aria-label'))).toContain('Custo por mês, outubro de 2026.');
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('nenhum mês medido: aviso no lugar das barras, e a tabela diz "não medido" (nunca zero)', () => {
    const { container } = renderThemed(
      <MonthSeries result={panel([month('2026-09', { costUsd: null }), month('2026-10', { costUsd: null })])} />,
    );
    expect(container.querySelector('svg.metrics-series-svg')).toBeNull();
    expect(screen.getByText(/Nenhum mês deste período tem custo medido/)).toBeInTheDocument();
    expect(cells('2026-09')[1]).toBe('não medido');
    expect(container.textContent).not.toMatch(/US\$ 0,00/);
  });
});

describe('MonthSeries: alternador Custo / Tokens (RF-16)', () => {
  it('troca a série: título, unidade, cabeçalho da tabela, valores e barras mudam juntos', async () => {
    const { container } = renderThemed(<MonthSeries result={panel(fourMonths)} />);
    const cost = screen.getByRole('button', { name: 'Custo' });
    const tok = screen.getByRole('button', { name: 'Tokens' });
    expect(cost).toHaveAttribute('aria-pressed', 'true');
    expect(tok).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Custo por mês' })).toBeInTheDocument();

    await userEvent.click(tok);
    expect(tok).toHaveAttribute('aria-pressed', 'true');
    expect(cost).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Tokens por mês' })).toBeInTheDocument();
    expect(screen.getByText('em tokens (entrada, saída e cache)')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tokens' })).toBeInTheDocument();
    expect(cells('2026-10')).toEqual(['out/2026', '4.000', 'parcial']);
    expect(Number(bar(container, '2026-10')!.getAttribute('data-value'))).toBe(4000);
    expect(plain(screen.getByRole('img').getAttribute('aria-label'))).toContain('Maior valor: 4.000, em outubro de 2026.');
    // a lacuna continua lacuna na outra série
    expect(bar(container, '2026-08')).toBeNull();
  });

  it('em inglês', async () => {
    setLocale('en');
    renderThemed(<MonthSeries result={panel(fourMonths)} />);
    expect(screen.getByRole('heading', { name: 'Cost per month' })).toBeInTheDocument();
    expect(cells('2026-08')[2]).toBe('no data');
    expect(cells('2026-10')).toEqual(['Oct 2026', '$12.50', 'partial']);
    await userEvent.click(screen.getByRole('button', { name: 'Tokens' }));
    expect(screen.getByRole('heading', { name: 'Tokens per month' })).toBeInTheDocument();
  });
});

describe('MetricsView monta a série', () => {
  it('a resposta do host aparece como gráfico e tabela', () => {
    renderThemed(<MetricsView />);
    const msg: HostToWebview = { type: 'metrics.result', requestId: lastSent('metrics.query').requestId, result: panel(fourMonths) };
    act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
    expect(screen.getByRole('heading', { name: 'Custo por mês' })).toBeInTheDocument();
    expect(document.querySelector('.metrics-series svg[role="img"]')).not.toBeNull();
  });
});
