import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { EMPTY_DELIVERY, type MetricsDelivery, type MetricsPanelResult, type MetricsPanelSections } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { DeliveryTables } from '../../src/webview/components/metrics/Delivery';
import { emptySections } from './metricsFixtures';

afterEach(() => setLocale('pt-BR'));

function result(sections: MetricsPanelSections): MetricsPanelResult {
  return {
    range: { startDate: '2026-10-01', endDate: '2026-10-04' },
    clamped: false,
    totals: {
      cardsDone: 0,
      runs: 0,
      runsOpen: 0,
      durationMs: 0,
      measuredRuns: 0,
      costedRuns: 0,
      tokens: null,
      costUsd: null,
      costEstimatedUsd: null,
      costInformedUsd: null,
    },
    months: [],
    workflows: [],
    logSince: '2026-10-04',
    detailFrom: '2026-10',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 2, detailRows: 0 },
    sections,
  };
}

const show = (delivery: MetricsDelivery) => {
  const sections = { ...emptySections(), delivery };
  return renderThemed(<DeliveryTables result={result(sections)} sections={sections} />);
};

describe('bloco Custo por entrega', () => {
  it('sem história concluída, diz isso em vez de mostrar zeros', () => {
    show(EMPTY_DELIVERY);
    expect(screen.getByText('Nenhuma história concluída neste período.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('resume e detalha por tipo × esforço, modelo e agente; null vira "não medido"', () => {
    show({
      ...EMPTY_DELIVERY,
      stories: 3,
      measured: 2,
      tokens: 3000,
      groups: [
        { type: 'História', effort: 'Alto', stories: 2, measured: 2, tokens: 3000, meanTokens: 1500, medianTokens: 1500 },
        { type: 'Bug', effort: '', stories: 1, measured: 0, tokens: null, meanTokens: null, medianTokens: null },
      ],
      byModel: [{ type: 'História', value: '', stories: 2, measured: 2, tokens: 3000, tokensPerStory: 1500, adjusted: 1 }],
      byAgent: [{ type: 'Bug', value: 'revisor', stories: 1, measured: 0, tokens: null, tokensPerStory: null, adjusted: 0 }],
    });
    expect(screen.getByText('Histórias concluídas').nextElementSibling).toHaveTextContent('3');
    const groups = screen.getByRole('table', { name: 'Custo por entrega por tipo e esforço' });
    const bug = within(groups).getByRole('row', { name: /Bug/ });
    expect(within(bug).getByText('não definido')).toBeInTheDocument();
    expect(within(bug).getAllByText('não medido')).toHaveLength(3);
    expect(within(groups).getByRole('row', { name: /^História / })).toHaveTextContent('1.500');
    expect(
      within(screen.getByRole('table', { name: 'Custo por entrega por tipo e modelo' })).getByText('não definido'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Custo por entrega por tipo e agente' })).getByText('revisor')).toBeInTheDocument();
    expect(screen.getByText(/aparece em cada um deles/)).toBeInTheDocument();
  });

  it('traduz para inglês', () => {
    setLocale('en');
    show({ ...EMPTY_DELIVERY });
    expect(screen.getByText('No story done in this period.')).toBeInTheDocument();
  });
});
