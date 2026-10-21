import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { EMPTY_REWORK, type MetricsPanelResult, type MetricsPanelSections, type MetricsRework } from '../../src/shared/metrics';

// Os sinais da IA (#605) zerados: as telas deles são de outra sub-tarefa.
const noSignals = EMPTY_REWORK.aiSignals;
import { setLocale } from '../../src/webview/i18n';
import { ReworkTables } from '../../src/webview/components/metrics/Rework';
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

const show = (rework: MetricsRework) => {
  const sections = { ...emptySections(), rework };
  return renderThemed(<ReworkTables result={result(sections)} sections={sections} />);
};

describe('bloco Retrabalho', () => {
  it('sem revisão nem história concluída, diz isso em vez de mostrar zeros', () => {
    show(EMPTY_REWORK);
    expect(screen.getByText('Nenhuma revisão nem história concluída neste período.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('resume a aprovação de primeira, os ajustes e os bugs, e detalha por fase e por modelo', () => {
    show({
      phases: [
        { phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1, ...noSignals },
        { phase: 'Spec', reviews: 1, approved: 0, adjusted: 0, resolved: 0, firstPass: 0, ...noSignals },
      ],
      models: [{ model: '', reviews: 4, adjusted: 1 }],
      escapes: { ...EMPTY_REWORK.escapes, stories: 4, withBugs: 1, bugs: 2 },
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    expect(screen.getByText('50% (1 de 2 respostas)')).toBeInTheDocument();
    expect(screen.getByText('1 de 4 (2 bug(s))')).toBeInTheDocument();
    const byPhase = screen.getByRole('table', { name: 'Retrabalho por fase' });
    const prd = within(byPhase).getByRole('row', { name: /PRD/ });
    expect(
      within(prd)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['3', '1 de 2', '1']);
    // sem resposta da pessoa, "de primeira" não é zero
    expect(within(within(byPhase).getByRole('row', { name: /Spec/ })).getAllByRole('cell')[1]).toHaveTextContent('—');
    const byModel = screen.getByRole('table', { name: 'Retrabalho por modelo' });
    expect(within(byModel).getByRole('rowheader', { name: 'não definido' })).toBeInTheDocument();
  });

  it('em inglês', () => {
    setLocale('en');
    show({
      phases: [{ phase: 'PRD', reviews: 1, approved: 1, adjusted: 0, resolved: 1, firstPass: 1, ...noSignals }],
      models: [],
      escapes: EMPTY_REWORK.escapes,
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    expect(screen.getByText('100% (1 of 1 answers)')).toBeInTheDocument();
    expect(screen.getByText('no story done in the period')).toBeInTheDocument();
  });
});
