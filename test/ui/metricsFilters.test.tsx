import { lastSent, renderThemed, sentOf } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const month = (m: string): MetricsMonth => ({
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
});

function panel(over: Partial<MetricsPanelResult> = {}): MetricsPanelResult {
  const { month: _m, present: _p, archived: _a, partial: _x, ...totals } = month('2026-10');
  return {
    range: { startDate: '2026-09-01', endDate: '2026-10-04' },
    clamped: false,
    totals,
    months: [month('2026-09'), month('2026-10')],
    workflows: ['Desenvolvimento', 'Antigo'],
    logSince: '2026-09-01',
    detailFrom: '2026-09',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 2, detailRows: 40 },
    sections: emptySections(),
    ...over,
  };
}

const reply = (msg: HostToWebview) => act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
const answer = (result: MetricsPanelResult) => reply({ type: 'metrics.result', requestId: lastSent('metrics.query').requestId, result });

const PRESETS = ['Hoje', '7 dias', '30 dias', 'Este mês', 'Últimos 12 meses', 'Tudo', 'Intervalo livre'];
const pressed = () => PRESETS.filter((n) => screen.getByRole('button', { name: n }).getAttribute('aria-pressed') === 'true');

describe('MetricsFilters', () => {
  it('mostra os sete períodos, com aria-pressed só no escolhido, e o padrão é 12 meses (RF-03)', async () => {
    renderThemed(<MetricsView />);
    for (const n of PRESETS) expect(screen.getByRole('button', { name: n })).toHaveAttribute('type', 'button');
    expect(pressed()).toEqual(['Últimos 12 meses']);
    await userEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    expect(pressed()).toEqual(['Tudo']);
    expect(useBoardStore.getState().metricsFilters.period).toBe('all');
  });

  it('os filtros aparecem também antes da primeira resposta e no erro', () => {
    renderThemed(<MetricsView />);
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeInTheDocument();
    reply({ type: 'metrics.result', requestId: lastSent('metrics.query').requestId, error: 'falhou' });
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeInTheDocument();
  });

  it('escreve o recorte efetivo abaixo dos controles', () => {
    renderThemed(<MetricsView />);
    answer(panel());
    expect(screen.getByText('Período consultado: 1 de setembro de 2026 a 4 de outubro de 2026')).toBeInTheDocument();
  });

  it('intervalo livre aceita um lado só; o outro fica aberto (RF-04)', async () => {
    renderThemed(<MetricsView />);
    answer(panel());
    await userEvent.click(screen.getByRole('button', { name: 'Intervalo livre' }));
    await userEvent.type(screen.getByLabelText('De'), '2026-09-10');
    expect(useBoardStore.getState().metricsFilters).toMatchObject({ period: 'custom', from: '2026-09-10', to: '' });
    await waitFor(() => expect(lastSent('metrics.query').query).toMatchObject({ startDate: '2026-09-10' }));
    expect(lastSent('metrics.query').query.endDate).toBeUndefined();
    expect(screen.queryByText('A data final vem antes da inicial.')).toBeNull();
  });

  it('data final antes da inicial mostra o erro e não troca nenhum número', async () => {
    renderThemed(<MetricsView />);
    answer(panel());
    act(() => useBoardStore.getState().setMetricsFilters({ period: 'custom', from: '2026-10-04', to: '2026-10-01' }));
    expect(screen.getByText('A data final vem antes da inicial.')).toBeInTheDocument();
    expect(screen.getByLabelText('Até')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(sentOf('metrics.query')).toHaveLength(2));
    reply({ type: 'metrics.result', requestId: lastSent('metrics.query').requestId, error: 'A data final vem antes da inicial.' });
    expect(screen.getByText('Período consultado: 1 de setembro de 2026 a 4 de outubro de 2026')).toBeInTheDocument();
  });

  it('workflow: "Todos" primeiro e depois os nomes da resposta, como vieram (RF-05)', async () => {
    renderThemed(<MetricsView />);
    answer(panel());
    const select = screen.getByRole('combobox', { name: 'Workflow' });
    expect(select).toHaveTextContent('Todos');
    await userEvent.click(select);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos', 'Desenvolvimento', 'Antigo']);
    await userEvent.click(screen.getByRole('option', { name: 'Antigo' }));
    expect(useBoardStore.getState().metricsFilters.workflow).toBe('Antigo');
    await waitFor(() => expect(lastSent('metrics.query').query.workflow).toBe('Antigo'));
  });

  it('o workflow escolhido continua na lista quando a resposta não o traz', () => {
    useBoardStore.setState({ metricsFilters: { ...EMPTY_METRICS_FILTERS, workflow: 'Sumiu' } });
    renderThemed(<MetricsView />);
    answer(panel({ workflows: [] }));
    expect(screen.getByRole('combobox', { name: 'Workflow' })).toHaveTextContent('Sumiu');
  });

  it('"Limpar filtros" volta ao padrão', async () => {
    useBoardStore.setState({ metricsFilters: { period: 'custom', from: '2026-09-01', to: '', workflow: 'Antigo' } });
    renderThemed(<MetricsView />);
    answer(panel());
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(useBoardStore.getState().metricsFilters).toEqual(EMPTY_METRICS_FILTERS);
    expect(pressed()).toEqual(['Últimos 12 meses']);
    expect(screen.queryByLabelText('De')).toBeNull();
  });

  it('desmontar e montar de novo conserva os filtros, e a store não os persiste (RF-06)', async () => {
    const first = renderThemed(<MetricsView />);
    await userEvent.click(screen.getByRole('button', { name: '30 dias' }));
    first.unmount();
    renderThemed(<MetricsView />);
    expect(pressed()).toEqual(['30 dias']);
    const persisted = JSON.stringify(Object.entries(localStorage));
    expect(persisted).not.toContain('metricsFilters');
  });

  it('só pelo teclado: Tab alcança todos os controles na ordem visual e Enter/Espaço acionam', async () => {
    const user = userEvent.setup();
    renderThemed(<MetricsView />);
    answer(panel());
    await user.click(document.body);
    const order = [...PRESETS, 'Workflow', 'Limpar filtros'];
    for (const name of order) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      expect(el.getAttribute('aria-label') ?? el.textContent ?? '').toContain(name === 'Workflow' ? 'Todos' : name);
      expect(el.tabIndex).toBeLessThanOrEqual(0);
    }
    screen.getByRole('button', { name: '7 dias' }).focus();
    await user.keyboard('{Enter}');
    expect(pressed()).toEqual(['7 dias']);
    screen.getByRole('button', { name: 'Hoje' }).focus();
    await user.keyboard(' ');
    expect(pressed()).toEqual(['Hoje']);
    screen.getByRole('button', { name: 'Intervalo livre' }).focus();
    await user.keyboard('{Enter}');
    // a linha das datas vem depois do "Limpar filtros", como na tela
    screen.getByRole('button', { name: 'Limpar filtros' }).focus();
    await user.tab();
    expect(screen.getByLabelText('De')).toHaveFocus();
    for (const input of [screen.getByLabelText('De'), screen.getByLabelText('Até')]) expect(input.tabIndex).toBeLessThanOrEqual(0);
  });

  it('em inglês, rótulos e erro saem traduzidos', () => {
    setLocale('en');
    renderThemed(<MetricsView />);
    expect(screen.getByRole('button', { name: 'Last 12 months' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Workflow' })).toHaveTextContent('All');
  });
});
