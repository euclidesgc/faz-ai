import { METRICS_BREAKDOWN_DIMS, type MetricsBreakdown, type MetricsCell, type MetricsPanelSections } from '../../src/shared/metrics';

// Fixture compartilhada dos testes de tela do painel de métricas: o `sections` de um período sem dado
// (o que o host devolve quando não há nada a mostrar, RF-34). Quem monta um `MetricsPanelResult` à mão
// usa `emptySections()` e sobrescreve só a seção de que o teste precisa.

const emptyCovered: Omit<MetricsCell, 'value'> = {
  runs: 0,
  measuredRuns: 0,
  costedRuns: 0,
  durationMs: 0,
  tokens: null,
  costUsd: null,
  costEstimatedUsd: null,
};

export function emptySections(): MetricsPanelSections {
  return {
    breakdowns: METRICS_BREAKDOWN_DIMS.map((dim): MetricsBreakdown => ({
      dim,
      cells: [],
      covered: { ...emptyCovered },
      includesArchive: false,
      excludedMonths: [],
      ambiguous: [],
    })),
    dwell: [],
    lead: { medianMs: null, meanMs: null, counted: 0, unknown: 0, rows: [], omitted: 0 },
    cards: { cells: [], covered: { ...emptyCovered }, omitted: 0 },
    inventory: { measured: false, tools: [], mcpTools: [], agents: [], skills: [] },
  };
}
