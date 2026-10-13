import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import {
  EMPTY_METRICS_FILTERS,
  METRICS_MEASURES,
  SHOW_COST,
  type MetricsCell,
  type MetricsMonth,
  type MetricsPanelResult,
  type MetricsPanelSections,
} from '../../src/shared/metrics';
import type { RunReport } from '../../src/shared/log';
import { setLocale } from '../../src/webview/i18n';
import { Totals } from '../../src/webview/components/metrics/Totals';
import { MonthSeries } from '../../src/webview/components/metrics/MonthSeries';
import { MetricsBlocks } from '../../src/webview/components/metrics/MetricsBlocks';
import { DEFAULT_METRICS_BLOCKS, useBoardStore } from '../../src/webview/store/boardStore';
import { formatMetrics } from '../../src/extension/mcp/tools/metrics';
import { consumptionLine } from '../../src/extension/runner';
import { emptySections } from './metricsFixtures';

// O board mostra só tokens por enquanto (`SHOW_COST` desligado): nenhum dólar na tela, no MCP nem na
// linha de consumo da conversa. Os testes de cada bloco ligam o custo por mock para cobrir a exibição dele.

afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS, metricsBlocks: DEFAULT_METRICS_BLOCKS });
  setLocale('pt-BR');
});

const tokens = (total: number) => ({ input: total / 2, output: total / 2, cacheRead: 0, cacheWrite: 0, total });

const month = (m: string, total: number): MetricsMonth => ({
  month: m,
  present: true,
  archived: false,
  partial: false,
  cardsDone: 1,
  runs: 2,
  runsOpen: 0,
  durationMs: 60_000,
  measuredRuns: 2,
  costedRuns: 1,
  tokens: tokens(total),
  costUsd: 3.5,
  costEstimatedUsd: 0,
  costInformedUsd: 3.5,
});

function panel(sections: MetricsPanelSections = emptySections()): MetricsPanelResult {
  const { month: _m, present: _p, archived: _a, partial: _x, ...totals } = month('2026-10', 10_000);
  return {
    range: { startDate: '2026-09-01', endDate: '2026-10-04' },
    clamped: false,
    totals,
    months: [month('2026-09', 4000), month('2026-10', 10_000)],
    workflows: [],
    logSince: '2026-09-01',
    detailFrom: '2026-09',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 2, detailRows: 40 },
    sections,
  };
}

/** Card `#i`: tokens crescem com `i`, tempo de IA decresce, custo só em parte das execuções. */
function cardCell(i: number): MetricsCell {
  return {
    value: `#${i} Card ${i}`,
    runs: i,
    measuredRuns: i,
    costedRuns: 1,
    durationMs: (100 - i) * 60_000,
    tokens: i * 100,
    costUsd: i,
    costEstimatedUsd: 0,
  };
}

function cardsSections(n: number): MetricsPanelSections {
  const cells = Array.from({ length: n }, (_, k) => cardCell(k + 1));
  const sum = (f: (c: MetricsCell) => number) => cells.reduce((a, c) => a + f(c), 0);
  const sections = emptySections();
  sections.cards = {
    cells,
    covered: {
      runs: sum((c) => c.runs),
      measuredRuns: sum((c) => c.measuredRuns),
      costedRuns: sum((c) => c.costedRuns),
      durationMs: sum((c) => c.durationMs),
      tokens: sum((c) => c.tokens ?? 0),
      costUsd: sum((c) => c.costUsd ?? 0),
      costEstimatedUsd: 0,
    },
    omitted: 0,
  };
  return sections;
}

describe('só tokens: o custo em dólar fica fora do board', () => {
  it('a chave está desligada e o seletor de medida não oferece custo; a medida padrão é tokens', () => {
    expect(SHOW_COST).toBe(false);
    expect(METRICS_MEASURES).toEqual(['tokens', 'runs', 'duration']);
    expect(DEFAULT_METRICS_BLOCKS.measure).toBe('tokens');
  });

  it('os totais não têm o cartão de custo, e nenhum "US$" aparece', () => {
    const { container } = renderThemed(<Totals result={panel()} />);
    expect(screen.getByRole('group', { name: 'Tokens' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Custo' })).toBeNull();
    expect(container.textContent).not.toContain('US$');
  });

  it('a série mensal é só de tokens, sem o alternador Custo / Tokens', () => {
    const { container } = renderThemed(<MonthSeries result={panel()} />);
    expect(screen.getByRole('heading', { name: 'Tokens por mês' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Série do gráfico' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Custo' })).toBeNull();
    expect(container.textContent).not.toContain('US$');
  });

  it('o ranking de cards não tem coluna de custo e ordena por tokens, dizendo por quê', () => {
    renderThemed(<MetricsBlocks result={panel(cardsSections(3))} />);
    const block = screen.getByRole('region', { name: 'Cards mais caros' });
    const table = within(block).getByRole('table', { name: 'Cards mais caros' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers.some((h) => h?.includes('Custo'))).toBe(false);
    expect(headers.some((h) => h?.includes('Tokens'))).toBe(true);
    expect(block.querySelector('.ranking-sort-note')!.textContent).toContain('É o padrão quando o período tem tokens medidos.');
    // o card com mais tokens (#3) vem primeiro
    const first = within(table).getAllByRole('row')[1]!;
    expect(within(first).getByRole('rowheader').textContent).toContain('#3');
  });

  it('o corte por fase não tem coluna de custo nem marca de custo parcial', () => {
    const { container } = renderThemed(<MetricsBlocks result={panel(cardsSections(3))} />);
    const tables = within(container).getAllByRole('table');
    for (const table of tables) {
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent ?? '');
      expect(headers.some((h) => h.includes('Custo'))).toBe(false);
    }
    expect(container.textContent).not.toMatch(/custo parcial|sem custo medido|US\$/);
  });

  it('a linha de consumo na conversa do card não mostra dólar', () => {
    const report: RunReport = {
      measure: 'full',
      consumption: {
        inputTokens: 1234,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 1000,
        turns: 2,
        sessionId: null,
        costUsd: 1.5,
      },
      inventory: [],
      answer: '',
      reason: null,
      usageLimitReached: false,
    };
    expect(consumptionLine(report)).toBe('Consumo: 1.234 entrada · 5 saída · 0 leitura de cache · 1.000 criação de cache · 2 turnos');
  });

  it('o get_metrics do MCP responde sem a coluna e sem as notas de custo', () => {
    const text = formatMetrics(
      {
        rows: [{ label: 'total', runs: 2, durationMs: 4000, tokens: 300, costUsd: 0.03 }],
        othersCount: 0,
        logSince: '2026-01-01',
        archivedMonths: [],
        partialMonths: [],
        costPartial: true,
        tokensPartial: false,
      },
      undefined,
    );
    expect(text).toContain('tokens');
    expect(text).not.toMatch(/custo|US\$/);
  });
});
