import { lastSent, renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import type { HostToWebview } from '../../src/shared/messages';
import { EMPTY_METRICS_FILTERS, type MetricsMonth, type MetricsPanelResult } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { MetricsView } from '../../src/webview/components/metrics/MetricsView';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS });
  setLocale('pt-BR');
});

const month = (m: string, over: Partial<MetricsMonth> = {}): MetricsMonth => ({
  month: m,
  present: true,
  archived: false,
  partial: false,
  cardsDone: 3,
  runs: 4,
  runsOpen: 0,
  durationMs: 60_000,
  measuredRuns: 0,
  tokens: null,
  costUsd: null,
  costEstimatedUsd: null,
  costInformedUsd: null,
  ...over,
});

function panel(over: Partial<MetricsPanelResult> = {}): MetricsPanelResult {
  const { month: _m, present: _p, archived: _a, partial: _x, ...totals } = month('2026-10');
  return {
    range: { startDate: '2026-08-01', endDate: '2026-10-04' },
    clamped: false,
    totals,
    months: [month('2026-08'), month('2026-09'), month('2026-10', { partial: true })],
    workflows: ['Desenvolvimento', 'Suporte'],
    logSince: '2026-08-01',
    detailFrom: '2026-09',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 2, detailRows: 40 },
    sections: emptySections(),
    ...over,
  };
}

function show(result: MetricsPanelResult) {
  renderThemed(<MetricsView />);
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'metrics.result', requestId: lastSent('metrics.query').requestId, result } satisfies HostToWebview,
      }),
    ),
  );
}

describe('avisos de honestidade (RF-20, RF-21, RF-22)', () => {
  it('mostra o início da série e, com recorte cortado, o aviso junto do período', () => {
    show(panel({ clamped: true }));
    expect(screen.getByText('Log do board desde 1 de agosto de 2026.')).toBeInTheDocument();
    const warn = screen.getByText(/O período pedido começava antes do início da série/);
    expect(warn).toHaveTextContent('1 de agosto de 2026 a 4 de outubro de 2026');
    // no mesmo bloco do período dos filtros, e antes dos totais (não é rodapé)
    const filters = screen.getByText(/Período consultado/);
    const totals = screen.getAllByRole('heading', { level: 3 })[0]!;
    expect(filters.compareDocumentPosition(warn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warn.compareDocumentPosition(totals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sem recorte cortado não há aviso de recorte', () => {
    show(panel());
    expect(screen.queryByText(/começava antes do início da série/)).toBeNull();
  });

  it('meses arquivados: nomeados e colados ao gráfico, com o início do detalhe', () => {
    show(panel({ archivedMonths: ['2026-08'], months: [month('2026-08', { archived: true }), month('2026-09'), month('2026-10')] }));
    const note = screen.getByText(/agosto de 2026 só tem o total mensal/);
    expect(note).toHaveTextContent('O detalhe vai desde setembro de 2026.');
    const chart = document.querySelector('.metrics-series')!;
    expect(chart.nextElementSibling).toContainElement(note);
  });

  it('vários meses arquivados saem no plural, em lista', () => {
    show(
      panel({
        archivedMonths: ['2026-07', '2026-08'],
        months: [month('2026-07', { archived: true }), month('2026-08', { archived: true })],
      }),
    );
    expect(screen.getByText(/julho de 2026 e agosto de 2026 só têm o total mensal/)).toBeInTheDocument();
  });

  it('sem mês arquivado, nenhum aviso de horizonte', () => {
    show(panel());
    expect(screen.queryByText(/só tem o total mensal/)).toBeNull();
  });

  it('workflow filtrado com mês arquivado sem a dimensão: o mês é listado e fica fora da soma', () => {
    useBoardStore.setState({ metricsFilters: { ...EMPTY_METRICS_FILTERS, workflow: 'Suporte' } });
    show(
      panel({
        archivedMonths: ['2026-08'],
        months: [
          month('2026-08', { archived: true, present: false, cardsDone: 0, runs: 0, durationMs: 0 }),
          month('2026-09'),
          month('2026-10'),
        ],
      }),
    );
    const note = screen.getByText(/Com o workflow Suporte filtrado, agosto de 2026 ficou fora dos números/);
    expect(note).toHaveTextContent('Não foi somado por aproximação.');
  });

  it('workflow filtrado cujo mês arquivado tem a dimensão: sem aviso de exclusão', () => {
    useBoardStore.setState({ metricsFilters: { ...EMPTY_METRICS_FILTERS, workflow: 'Suporte' } });
    show(panel({ archivedMonths: ['2026-08'], months: [month('2026-08', { archived: true }), month('2026-09'), month('2026-10')] }));
    expect(screen.queryByText(/ficou fora dos números/)).toBeNull();
  });

  it('board sem log: diz que a série começa agora, sem nenhum zero', () => {
    show(
      panel({
        range: { startDate: '', endDate: '' },
        logSince: '',
        detailFrom: '',
        months: [month('2026-10', { present: false, cardsDone: 0, runs: 0, durationMs: 0 })],
      }),
    );
    const body = document.querySelector('.metrics-body')!;
    expect(within(body as HTMLElement).getByText(/a série começa agora/)).toBeInTheDocument();
    expect(screen.queryByText(/Log do board desde/)).toBeNull();
    expect(body.textContent).not.toMatch(/\b0\b/);
  });

  it('em inglês', () => {
    setLocale('en');
    show(panel({ clamped: true, archivedMonths: ['2026-08'], months: [month('2026-08', { archived: true }), month('2026-09')] }));
    expect(screen.getByText('Board log since August 1, 2026.')).toBeInTheDocument();
    expect(screen.getByText(/started before the start of the series/)).toBeInTheDocument();
    expect(screen.getByText(/August 2026 only has the monthly total/)).toBeInTheDocument();
  });
});
