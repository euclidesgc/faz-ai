import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import {
  EMPTY_REWORK,
  type MetricsPanelResult,
  type MetricsPanelSections,
  type MetricsRework,
  type MetricsUnfinishedRow,
} from '../../src/shared/metrics';

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
      agents: [],
      unfinished: EMPTY_REWORK.unfinished,
      escapes: { ...EMPTY_REWORK.escapes, stories: 4, withBugs: 1, bugs: 2 },
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    expect(screen.getByText('50% (1 de 2 respostas)')).toBeInTheDocument();
    expect(screen.getByText('1 de 4 (2 bug(s); autônomas: 0 de 0)')).toBeInTheDocument();
    // sem execução com registro de Bash, os sinais da IA não são zero: não foram medidos
    expect(screen.getAllByText('não medido')).toHaveLength(3);
    const byPhase = screen.getByRole('table', { name: 'Retrabalho por fase' });
    const prd = within(byPhase).getByRole('row', { name: /PRD/ });
    expect(
      within(prd)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['3', '1 de 2', '1', '—', '—', '—']);
    // sem resposta da pessoa, "de primeira" não é zero
    expect(within(within(byPhase).getByRole('row', { name: /Spec/ })).getAllByRole('cell')[1]).toHaveTextContent('—');
    const byModel = screen.getByRole('table', { name: 'Retrabalho por modelo' });
    expect(within(byModel).getByRole('rowheader', { name: 'não definido' })).toBeInTheDocument();
  });

  it('mostra os sinais da IA com a parte autônoma no resumo e por fase (#605)', () => {
    const signal = (count: number, runs: number, autonomousCount: number, autonomousRuns: number) => ({
      count,
      runs,
      autonomousCount,
      autonomousRuns,
    });
    show({
      phases: [
        {
          phase: 'Revisão',
          reviews: 0,
          approved: 0,
          adjusted: 0,
          resolved: 0,
          firstPass: 0,
          bashRuns: 2,
          reviewFixes: signal(3, 2, 1, 1),
          testFailures: signal(0, 0, 0, 0),
          commitsAfterPr: signal(2, 1, 0, 0),
        },
      ],
      models: [],
      agents: [],
      unfinished: EMPTY_REWORK.unfinished,
      escapes: { stories: 4, withBugs: 1, bugs: 2, autonomousStories: 3, autonomousWithBugs: 1, autonomousBugs: 2 },
      aiSignals: { bashRuns: 5, reviewFixes: signal(3, 2, 1, 1), testFailures: signal(1, 1, 1, 1), commitsAfterPr: signal(2, 1, 0, 0) },
    });
    expect(screen.getByText('1 de 4 (2 bug(s); autônomas: 1 de 3)')).toBeInTheDocument();
    expect(screen.getByText('3 em 2 execuções (autônomas: 1)')).toBeInTheDocument();
    expect(screen.getByText('1 em 1 execuções (autônomas: 1)')).toBeInTheDocument();
    expect(screen.getByText('2 em 1 histórias (autônomas: 0)')).toBeInTheDocument();
    const byPhase = screen.getByRole('table', { name: 'Retrabalho por fase' });
    expect(
      within(within(byPhase).getByRole('row', { name: /^Revisão/ }))
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['0', '—', '0', '3 (1)', '0 (0)', '2 (0)']);
    expect(screen.getByText(/Os sinais da IA são aproximações/)).toBeInTheDocument();
  });

  it('só com sinais da IA, sem revisão nem história concluída, o bloco aparece', () => {
    show({ ...EMPTY_REWORK, aiSignals: { ...EMPTY_REWORK.aiSignals, bashRuns: 1 } });
    expect(screen.queryByText('Nenhuma revisão nem história concluída neste período.')).toBeNull();
    expect(screen.getAllByText('0 em 0 execuções (autônomas: 0)')).toHaveLength(2);
  });

  it('retrabalho por agente: agente vazio aparece como "sem agente"', () => {
    show({
      phases: [{ phase: 'PRD', reviews: 3, approved: 1, adjusted: 2, resolved: 0, firstPass: 0, ...noSignals }],
      models: [],
      agents: [
        { agent: 'backend-node', reviews: 2, adjusted: 1 },
        { agent: '', reviews: 1, adjusted: 1 },
      ],
      unfinished: EMPTY_REWORK.unfinished,
      escapes: EMPTY_REWORK.escapes,
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    const byAgent = screen.getByRole('table', { name: 'Retrabalho por agente' });
    const backend = within(byAgent).getByRole('row', { name: /backend-node/ });
    expect(
      within(backend)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['2', '1']);
    expect(within(byAgent).getByRole('rowheader', { name: 'sem agente' })).toBeInTheDocument();
  });

  it('execuções sem resultado por modelo e por agente, com o detalhe no title e o aviso de aproximação', () => {
    const row = (
      value: string,
      runs: number,
      unfinished: number,
      failed: number,
      timeout: number,
      stopped: number,
    ): MetricsUnfinishedRow => ({
      value,
      runs,
      unfinished,
      failed,
      timeout,
      stopped,
    });
    show({
      phases: [{ phase: 'PRD', reviews: 1, approved: 1, adjusted: 0, resolved: 1, firstPass: 1, ...noSignals }],
      models: [],
      agents: [],
      unfinished: { models: [row('opus', 10, 3, 1, 1, 1)], agents: [row('', 4, 1, 0, 1, 0)] },
      escapes: EMPTY_REWORK.escapes,
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    const byModel = screen.getByRole('table', { name: 'Execuções sem resultado por modelo' });
    expect(within(byModel).getByRole('rowheader', { name: 'opus' })).toBeInTheDocument();
    const cell = within(byModel).getByText('3 de 10');
    expect(cell).toHaveAttribute('title', 'falhou: 1; tempo esgotado: 1; interrompida: 1');
    const byAgent = screen.getByRole('table', { name: 'Execuções sem resultado por agente' });
    expect(within(byAgent).getByRole('rowheader', { name: 'sem agente' })).toBeInTheDocument();
    expect(within(byAgent).getByText('1 de 4')).toHaveAttribute('title', 'falhou: 0; tempo esgotado: 1; interrompida: 0');
    expect(screen.getByText(/Execuções sem resultado são uma aproximação/)).toBeInTheDocument();
  });

  it('só com execuções sem resultado, o bloco não diz que está vazio', () => {
    show({
      ...EMPTY_REWORK,
      unfinished: { models: [{ value: 'opus', runs: 2, unfinished: 1, failed: 1, timeout: 0, stopped: 0 }], agents: [] },
    });
    expect(screen.queryByText('Nenhuma revisão nem história concluída neste período.')).toBeNull();
    expect(screen.getByRole('table', { name: 'Execuções sem resultado por modelo' })).toBeInTheDocument();
  });

  it('em inglês', () => {
    setLocale('en');
    show({
      phases: [{ phase: 'PRD', reviews: 1, approved: 1, adjusted: 0, resolved: 1, firstPass: 1, ...noSignals }],
      models: [],
      agents: [],
      unfinished: EMPTY_REWORK.unfinished,
      escapes: EMPTY_REWORK.escapes,
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    expect(screen.getByText('100% (1 of 1 answers)')).toBeInTheDocument();
    expect(screen.getByText('no story done in the period')).toBeInTheDocument();
    expect(screen.getAllByText('not measured')).toHaveLength(3);
  });
});
