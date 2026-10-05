import { lastSent, renderThemed, sentOf } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HostToWebview } from '../../src/shared/messages';
import { EMPTY_METRICS_FILTERS, type MetricsMonth, type MetricsPanelResult } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { MetricsView } from '../../src/webview/components/metrics/MetricsView';
import { Note } from '../../src/webview/components/metrics/Note';
import {
  formatCost,
  formatDay,
  formatDuration,
  formatMoney,
  formatMonth,
  formatRange,
  formatTokens,
  isEmptyResult,
} from '../../src/webview/components/metrics/format';
import { toPanelQuery } from '../../src/webview/components/metrics/useMetricsQuery';
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

/** Uma resposta de teste: dois meses com dado, ou todos vazios com `empty`. */
function panel(startDate: string, endDate: string, over: Partial<MetricsPanelResult> = {}): MetricsPanelResult {
  const { month: _m, present: _p, archived: _a, partial: _x, ...totals } = month('2026-10');
  return {
    range: { startDate, endDate },
    clamped: false,
    totals,
    months: [month('2026-09'), month('2026-10', { partial: true })],
    workflows: ['Desenvolvimento'],
    logSince: '2026-09-01',
    detailFrom: '2026-09',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 2, detailRows: 40 },
    sections: emptySections(),
    ...over,
  };
}

const emptyMonths = [month('2026-09', { present: false, cardsDone: 0, runs: 0, durationMs: 0 })];

/** O host respondendo (o canal real é um `message` na janela). */
function reply(msg: HostToWebview): void {
  act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
}

const answer = (requestId: string, result: MetricsPanelResult) => reply({ type: 'metrics.result', requestId, result });

describe('MetricsView: consulta e estados', () => {
  it('abre carregando e pede o período padrão (últimos 12 meses, todos os workflows)', () => {
    renderThemed(<MetricsView />);
    expect(screen.getByRole('heading', { name: 'Métricas' })).toBeInTheDocument();
    expect(screen.getByText('Carregando métricas…')).toBeInTheDocument();
    const sent = sentOf('metrics.query');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.query).toEqual(toPanelQuery(EMPTY_METRICS_FILTERS, Date.now()));
    expect(sent[0]!.query.startDate).toBeTruthy();
    expect(sent[0]!.query.workflow).toBeUndefined();
  });

  it('a resposta é anunciada na região aria-live com o período, sem tirar o foco de onde está (RF-32)', async () => {
    renderThemed(
      <>
        <button type="button">fora</button>
        <MetricsView />
      </>,
    );
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    answer(lastSent('metrics.query').requestId, panel('2026-09-01', '2026-10-04'));
    expect(live).toHaveTextContent('Números atualizados: 1 de setembro de 2026 a 4 de outubro de 2026');
    expect(screen.getByRole('button', { name: 'fora' })).toHaveFocus();
    expect(screen.queryByText('Carregando métricas…')).toBeNull();
  });

  it('período sem dado diz desde quando há dado e não escreve "0" em lugar nenhum (RF-07)', () => {
    const { container } = renderThemed(<MetricsView />);
    answer(lastSent('metrics.query').requestId, panel('2026-09-01', '2026-09-30', { months: emptyMonths }));
    expect(screen.getByText('Nenhum dado neste período. O log do board tem dados desde 1 de setembro de 2026.')).toBeInTheDocument();
    expect(container.querySelector('.metrics')!.textContent).not.toMatch(/\b0\b/);
  });

  it('board sem log nenhum: a série começa agora', () => {
    renderThemed(<MetricsView />);
    answer(lastSent('metrics.query').requestId, panel('', '', { months: emptyMonths, logSince: '' }));
    expect(screen.getByText(/O board ainda não tem log: a série começa agora/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Números atualizados.');
  });

  it('erro de consulta aparece como alerta, sem trocar o que estava na tela, e "Consultar de novo" refaz o pedido na hora', async () => {
    renderThemed(<MetricsView />);
    answer(lastSent('metrics.query').requestId, panel('2026-09-01', '2026-10-04', { months: emptyMonths }));
    act(() => useBoardStore.getState().setMetricsFilters({ period: 'custom', from: '2026-10-04', to: '2026-10-01' }));
    await waitFor(() => expect(sentOf('metrics.query')).toHaveLength(2));
    reply({ type: 'metrics.result', requestId: lastSent('metrics.query').requestId, error: 'A data final vem antes da inicial.' });
    expect(screen.getByRole('alert')).toHaveTextContent('A data final vem antes da inicial.');
    // a resposta anterior continua na tela; nada é anunciado como atualizado
    expect(screen.getByText(/O log do board tem dados desde/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
    await userEvent.click(screen.getByRole('button', { name: 'Consultar de novo' }));
    expect(sentOf('metrics.query')).toHaveLength(3);
    answer(lastSent('metrics.query').requestId, panel('2026-09-01', '2026-10-04'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('erro antes da primeira resposta: só o alerta, sem o "carregando" eterno', () => {
    renderThemed(<MetricsView />);
    reply({ type: 'metrics.result', requestId: lastSent('metrics.query').requestId, error: 'falhou' });
    expect(screen.getByRole('alert')).toHaveTextContent('falhou');
    expect(screen.queryByText('Carregando métricas…')).toBeNull();
  });

  it('descarta a resposta de um pedido anterior: só vale a do último requestId', async () => {
    renderThemed(<MetricsView />);
    const first = lastSent('metrics.query');
    act(() => useBoardStore.getState().setMetricsFilters({ period: '7d' }));
    await waitFor(() => expect(sentOf('metrics.query')).toHaveLength(2));
    const second = lastSent('metrics.query');
    expect(second.requestId).not.toBe(first.requestId);
    expect(second.query).toEqual(toPanelQuery({ ...EMPTY_METRICS_FILTERS, period: '7d' }, Date.now()));
    // a do filtro velho chega atrasada: ignorada
    answer(first.requestId, panel('2025-11-01', '2026-10-04'));
    expect(screen.getByText('Carregando métricas…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
    answer(second.requestId, panel('2026-09-28', '2026-10-04'));
    expect(screen.getByRole('status')).toHaveTextContent('28 de setembro de 2026 a 4 de outubro de 2026');
  });

  it('mudanças seguidas do filtro viram um pedido só, e com resposta na tela mostra "Atualizando…"', async () => {
    renderThemed(<MetricsView />);
    answer(lastSent('metrics.query').requestId, panel('2026-09-01', '2026-10-04'));
    act(() => useBoardStore.getState().setMetricsFilters({ period: 'custom', from: '0002-01-01' }));
    act(() => useBoardStore.getState().setMetricsFilters({ from: '0020-01-01' }));
    act(() => useBoardStore.getState().setMetricsFilters({ from: '2026-01-01' }));
    expect(screen.getByText('Atualizando…')).toBeInTheDocument();
    await waitFor(() => expect(sentOf('metrics.query')).toHaveLength(2));
    expect(lastSent('metrics.query').query.startDate).toBe('2026-01-01');
    // espera mais que o atraso: nenhum pedido extra saiu
    await new Promise((r) => setTimeout(r, 400));
    expect(sentOf('metrics.query')).toHaveLength(2);
  });

  it('o workflow escolhido vai no pedido', async () => {
    renderThemed(<MetricsView />);
    act(() => useBoardStore.getState().setMetricsFilters({ workflow: 'Desenvolvimento' }));
    await waitFor(() => expect(lastSent('metrics.query').query.workflow).toBe('Desenvolvimento'));
  });
});

describe('filtros do painel na store (RF-06)', () => {
  it('trocar de visão conserva os filtros, e eles não entram no estado persistido', () => {
    const s = useBoardStore.getState();
    act(() => s.setMetricsFilters({ period: '30d', workflow: 'Desenvolvimento' }));
    act(() => useBoardStore.getState().setView('metrics'));
    act(() => useBoardStore.getState().setView('board'));
    expect(useBoardStore.getState().metricsFilters).toEqual({ ...EMPTY_METRICS_FILTERS, period: '30d', workflow: 'Desenvolvimento' });
    const persisted = JSON.parse(sessionStorage.getItem('fazai.ui') ?? '{}') as Record<string, unknown>;
    expect(persisted.view).toBe('board');
    expect(persisted).not.toHaveProperty('metricsFilters');
    act(() => useBoardStore.getState().clearMetricsFilters());
    expect(useBoardStore.getState().metricsFilters).toEqual(EMPTY_METRICS_FILTERS);
  });
});

describe('format: números do painel no idioma da interface', () => {
  const plain = (s: string) => s.replace(/\u00a0/g, ' ');

  it('"não medido" no lugar de zero, e centavo de execução sem virar US$ 0,00 (RF-18)', () => {
    expect(formatCost(null)).toBe('não medido');
    expect(formatTokens(null)).toBe('não medido');
    expect(plain(formatMoney(12.5))).toBe('US$ 12,50');
    expect(plain(formatMoney(0.0034))).toBe('US$ 0,0034');
    expect(plain(formatCost(0))).toBe('US$ 0,00');
    expect(formatTokens(1234567)).toBe('1.234.567');
  });

  it('duração, dia, mês e recorte em português e em inglês', () => {
    expect(formatDuration(3 * 3_600_000 + 12 * 60_000)).toBe('3h12min');
    expect(formatDuration(45 * 60_000)).toBe('45min');
    expect(formatDuration(30_000)).toBe('30s');
    expect(formatDuration(27 * 3_600_000 + 5 * 60_000)).toBe('27h05min');
    expect(formatDay('2026-10-04')).toBe('4 de outubro de 2026');
    expect(formatDay('2026-10-04', 'short')).toBe('04/10/2026');
    expect(formatDay('')).toBe('');
    expect(formatMonth('2026-10', 'short')).toBe('out');
    expect(formatMonth('2026-10')).toBe('out/2026');
    expect(formatMonth('2026-10', 'long')).toBe('outubro de 2026');
    expect(formatRange({ startDate: '2026-10-04', endDate: '2026-10-04' })).toBe('4 de outubro de 2026 a 4 de outubro de 2026');
    setLocale('en');
    expect(formatCost(null)).toBe('not measured');
    expect(formatMoney(12.5)).toBe('$12.50');
    expect(formatDuration(3 * 3_600_000 + 12 * 60_000)).toBe('3h 12m');
    expect(formatMonth('2026-10')).toBe('Oct 2026');
    expect(formatRange({ startDate: '2026-10-01', endDate: '2026-10-04' })).toBe('October 1, 2026 to October 4, 2026');
  });

  it('isEmptyResult: vazio é todo mês sem dado, não total zero', () => {
    expect(isEmptyResult(panel('2026-09-01', '2026-09-30', { months: emptyMonths }))).toBe(true);
    expect(isEmptyResult(panel('2026-09-01', '2026-10-04'))).toBe(false);
  });
});

describe('Note', () => {
  it('é texto pequeno com o ícone decorativo, ligável ao número por id', () => {
    const { container } = renderThemed(
      <>
        <span aria-describedby="nota-custo">não medido</span>
        <Note id="nota-custo">Ainda não medido.</Note>
      </>,
    );
    const note = container.querySelector('#nota-custo')!;
    expect(note).toHaveClass('metrics-note');
    expect(note).toHaveTextContent('Ainda não medido.');
    expect(note.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('não medido')).toHaveAccessibleDescription('Ainda não medido.');
  });
});
