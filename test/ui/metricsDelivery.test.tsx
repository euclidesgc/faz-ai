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

const show = (delivery: MetricsDelivery, showCost = false) => {
  const sections = { ...emptySections(), delivery };
  return renderThemed(<DeliveryTables result={result(sections)} sections={sections} showCost={showCost} />);
};

const noCache = { cacheReadTokens: null, cacheWriteTokens: null };
const noCost = { costed: 0, costUsd: null, costEstimatedUsd: null };

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
      cacheReadTokens: 2000,
      cacheWriteTokens: 500,
      groups: [
        {
          type: 'História',
          effort: 'Alto',
          stories: 2,
          measured: 2,
          tokens: 3000,
          meanTokens: 1500,
          medianTokens: 1500,
          cacheReadTokens: 2000,
          cacheWriteTokens: 500,
          ...noCost,
          meanCostUsd: null,
          medianCostUsd: null,
        },
        {
          type: 'Bug',
          effort: '',
          stories: 1,
          measured: 0,
          tokens: null,
          meanTokens: null,
          medianTokens: null,
          ...noCache,
          ...noCost,
          meanCostUsd: null,
          medianCostUsd: null,
        },
      ],
      byModel: [
        {
          type: 'História',
          value: '',
          stories: 2,
          measured: 2,
          tokens: 3000,
          tokensPerStory: 1500,
          adjusted: 1,
          cacheReadTokens: 2000,
          cacheWriteTokens: 500,
          ...noCost,
          costPerStory: null,
        },
      ],
      byAgent: [
        {
          type: 'Bug',
          value: 'revisor',
          stories: 1,
          measured: 0,
          tokens: null,
          tokensPerStory: null,
          adjusted: 0,
          ...noCache,
          ...noCost,
          costPerStory: null,
        },
      ],
    });
    expect(screen.getByText('Histórias concluídas').nextElementSibling).toHaveTextContent('3');
    const groups = screen.getByRole('table', { name: 'Custo por entrega por tipo e esforço' });
    const bug = within(groups).getByRole('row', { name: /Bug/ });
    expect(within(bug).getByText('não definido')).toBeInTheDocument();
    // tokens, média, mediana, leitura e escrita de cache
    expect(within(bug).getAllByText('não medido')).toHaveLength(5);
    // sem a regra "Mostrar custo em dólar", nenhuma coluna de custo
    expect(within(groups).queryByRole('columnheader', { name: 'Custo' })).toBeNull();
    expect(within(groups).getByRole('row', { name: /^História / })).toHaveTextContent('1.500');
    expect(
      within(screen.getByRole('table', { name: 'Custo por entrega por tipo e modelo' })).getByText('não definido'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Custo por entrega por tipo e agente' })).getByText('revisor')).toBeInTheDocument();
    expect(screen.getByText(/aparece em cada um deles/)).toBeInTheDocument();
  });

  it('com a regra ligada, o custo é o indicador principal: vem antes dos tokens, marca o estimado e explica a história sem preço', () => {
    show(
      {
        ...EMPTY_DELIVERY,
        stories: 3,
        measured: 3,
        tokens: 9000,
        cacheReadTokens: 6000,
        cacheWriteTokens: 1500,
        costed: 2,
        costUsd: 4.5,
        costEstimatedUsd: 3.5,
        groups: [
          {
            type: 'História',
            effort: 'Alto',
            stories: 3,
            measured: 3,
            tokens: 9000,
            meanTokens: 3000,
            medianTokens: 3000,
            cacheReadTokens: 6000,
            cacheWriteTokens: 1500,
            costed: 2,
            costUsd: 4.5,
            costEstimatedUsd: 3.5,
            meanCostUsd: 2.25,
            medianCostUsd: 2.25,
          },
        ],
        byModel: [
          {
            type: 'História',
            value: 'opus',
            stories: 2,
            measured: 2,
            tokens: 6000,
            tokensPerStory: 3000,
            adjusted: 0,
            cacheReadTokens: 4000,
            cacheWriteTokens: 1000,
            costed: 2,
            costUsd: 4.5,
            costEstimatedUsd: 0,
            costPerStory: 2.25,
          },
          {
            type: 'História',
            value: 'misterio',
            stories: 1,
            measured: 1,
            tokens: 3000,
            tokensPerStory: 3000,
            adjusted: 0,
            cacheReadTokens: 2000,
            cacheWriteTokens: 500,
            ...noCost,
            costPerStory: null,
          },
        ],
      },
      true,
    );
    expect(screen.getByText('Histórias com custo').nextElementSibling).toHaveTextContent('2');
    const total = screen.getAllByText('Custo').find((el) => el.tagName === 'DT')!.nextElementSibling;
    expect(total).toHaveTextContent(/US\$\s?4,50/);
    expect(total).toHaveTextContent(/parte estimada por tabela de preços: US\$\s?3,50/);
    const groups = screen.getByRole('table', { name: 'Custo por entrega por tipo e esforço' });
    const headers = within(groups)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      'Tipo',
      'Esforço',
      'Histórias',
      'Com custo',
      'Custo',
      'Custo médio',
      'Custo mediano',
      'Medidas',
      'Tokens',
      'Média',
      'Mediana',
      'Leitura de cache',
      'Escrita de cache',
    ]);
    const story = within(groups).getByRole('row', { name: /^História / });
    expect(story).toHaveTextContent(/US\$\s?2,25/);
    expect(within(story).getAllByText('estimado por tabela de preços').length).toBeGreaterThan(0);
    const models = screen.getByRole('table', { name: 'Custo por entrega por tipo e modelo' });
    const misterio = within(models).getByRole('row', { name: /misterio/ });
    // modelo sem preço no catálogo: o custo fica "não medido" e os tokens são o indicador
    expect(within(misterio).getAllByText('não medido')).toHaveLength(2);
    expect(misterio).toHaveTextContent('3.000');
    expect(screen.getByText(/os tokens são o único indicador onde o modelo não tem preço no catálogo/)).toHaveTextContent(
      'Histórias medidas sem custo: 1.',
    );
    expect(screen.getByText(/trocar leitura por escrita faz o custo subir/)).toBeInTheDocument();
  });

  it('traduz para inglês', () => {
    setLocale('en');
    show({ ...EMPTY_DELIVERY });
    expect(screen.getByText('No story done in this period.')).toBeInTheDocument();
  });
});
