import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { EMPTY_METRICS_FILTERS, type MetricsMonth, type MetricsPanelResult } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { MetricsBlocks } from '../../src/webview/components/metrics/MetricsBlocks';
import { formatSpan } from '../../src/webview/components/metrics/format';
import { DEFAULT_METRICS_BLOCKS, useBoardStore } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS, metricsBlocks: DEFAULT_METRICS_BLOCKS });
  setLocale('pt-BR');
});

const month: MetricsMonth = {
  month: '2026-10',
  present: true,
  archived: false,
  partial: false,
  cardsDone: 1,
  runs: 1,
  runsOpen: 0,
  durationMs: 1000,
  measuredRuns: 0,
  tokens: null,
  costUsd: null,
  costEstimatedUsd: null,
  costInformedUsd: null,
};

function result(over: Partial<MetricsPanelResult> = {}): MetricsPanelResult {
  const { month: _m, present: _p, archived: _a, partial: _x, ...totals } = month;
  return {
    range: { startDate: '2026-09-01', endDate: '2026-10-04' },
    clamped: false,
    totals,
    months: [month],
    workflows: [],
    logSince: '2026-01-01',
    detailFrom: '2026-09',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 2, detailRows: 40 },
    sections: emptySections(),
    ...over,
  };
}

const block = (name: string) => screen.getByRole('region', { name });
const DETAIL = /Só alcança o detalhe guardado, desde setembro de 2026/;
const SERIES = 'Alcança toda a série do período, inclusive os meses já arquivados.';

describe('MetricsBlocks: os cinco blocos', () => {
  it('mostra os cinco títulos, cada bloco com o seu texto explicativo', () => {
    renderThemed(<MetricsBlocks result={result()} />);
    for (const title of [
      'Onde o consumo aconteceu',
      'Quanto tempo o card fica na fase',
      'Lead time',
      'Mais caros e mais demorados',
      'O que a IA usou',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(within(block('Lead time')).getByText(/Do primeiro registro do card/)).toBeInTheDocument();
  });

  it('o aviso de horizonte está nos quatro que dependem do detalhe (RF-29)', () => {
    renderThemed(<MetricsBlocks result={result()} />);
    for (const name of ['Quanto tempo o card fica na fase', 'Lead time', 'Cards mais caros', 'O que a IA usou']) {
      expect(within(block(name)).getByText(DETAIL)).toBeInTheDocument();
      expect(within(block(name)).queryByText(SERIES)).toBeNull();
    }
  });

  it('os cortes e o ranking de fases não têm o aviso do detalhe e dizem que alcançam a série (RF-29)', () => {
    renderThemed(<MetricsBlocks result={result()} />);
    for (const name of ['Onde o consumo aconteceu', 'Fases mais caras']) {
      expect(within(block(name)).queryByText(DETAIL)).toBeNull();
      expect(within(block(name)).getByText(SERIES)).toBeInTheDocument();
    }
  });

  it('os dois rankings ficam lado a lado e cada um diz até onde alcança (RF-24)', () => {
    renderThemed(<MetricsBlocks result={result()} />);
    const group = block('Mais caros e mais demorados');
    expect(within(group).getByRole('region', { name: 'Fases mais caras' })).toBeInTheDocument();
    expect(within(group).getByRole('region', { name: 'Cards mais caros' })).toBeInTheDocument();
    expect(within(group).getAllByText(/Alcança toda a série|Só alcança o detalhe/)).toHaveLength(2);
  });

  it('sem detalhe guardado, o aviso diz que ele ainda não existe', () => {
    renderThemed(<MetricsBlocks result={result({ detailFrom: '' })} />);
    expect(
      within(block('Lead time')).getByText('Este bloco depende do detalhe guardado, e o board ainda não tem nenhum.'),
    ).toBeInTheDocument();
  });

  it('em inglês traduz títulos e avisos', () => {
    setLocale('en');
    renderThemed(<MetricsBlocks result={result()} />);
    expect(screen.getByRole('heading', { name: 'What the AI used' })).toBeInTheDocument();
    expect(within(block('Lead time')).getByText(/Only covers the stored detail, since September 2026/)).toBeInTheDocument();
  });
});

describe('estado dos blocos', () => {
  it('nasce no padrão, fora do que o board persiste, e a troca é conservada na store', () => {
    expect(useBoardStore.getState().metricsBlocks).toEqual({
      dim: 'phase',
      measure: 'cost',
      cardSort: null,
      phaseSort: null,
      leadSort: null,
    });
    act(() => useBoardStore.getState().setMetricsBlocks({ dim: 'model', measure: 'tokens' }));
    expect(useBoardStore.getState().metricsBlocks).toMatchObject({ dim: 'model', measure: 'tokens', cardSort: null });
  });
});

describe('formatSpan: dias e horas', () => {
  const H = 3_600_000;
  it('escreve dias e horas, e só o que existe', () => {
    expect(formatSpan(3 * 24 * H + 4 * H)).toBe('3d 4h');
    expect(formatSpan(2 * 24 * H)).toBe('2d');
    expect(formatSpan(5 * H + 59 * 60_000)).toBe('5h');
  });

  it('abaixo de uma hora vai em minutos, abaixo de um minuto diz "menos de 1min"', () => {
    expect(formatSpan(45 * 60_000)).toBe('45min');
    expect(formatSpan(20_000)).toBe('menos de 1min');
    setLocale('en');
    expect(formatSpan(45 * 60_000)).toBe('45m');
    expect(formatSpan(20_000)).toBe('less than 1m');
  });

  it('desconhecido é "desconhecido", nunca zero (RF-16)', () => {
    expect(formatSpan(null)).toBe('desconhecido');
    setLocale('en');
    expect(formatSpan(null)).toBe('unknown');
  });
});
