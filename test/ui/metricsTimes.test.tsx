import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { EMPTY_METRICS_FILTERS, type MetricsPanelResult, type MetricsPanelSections } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { DwellTable, LeadTable } from '../../src/webview/components/metrics/Times';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS });
  setLocale('pt-BR');
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

function withDwell(dwell: MetricsPanelSections['dwell']) {
  const sections = { ...emptySections(), dwell };
  return <DwellTable result={result(sections)} sections={sections} />;
}

function withLead(lead: Partial<MetricsPanelSections['lead']>) {
  const sections = { ...emptySections(), lead: { ...emptySections().lead, ...lead } };
  return <LeadTable result={result(sections)} sections={sections} sort={null} onSort={() => {}} />;
}

describe('DwellTable: permanência por fase', () => {
  const dwell = [
    { phase: 'Descoberta', permanences: 4, medianMs: 2 * DAY, meanMs: 3 * DAY + 4 * HOUR, unknown: 1, openNow: 2 },
    { phase: 'Revisão', permanences: 0, medianMs: null, meanMs: null, unknown: 0, openNow: 0 },
  ];

  it('mostra os cinco números por fase em texto, com o rótulo "permanências" (RF-11, RF-12)', () => {
    renderThemed(withDwell(dwell));
    const table = screen.getByRole('table');
    for (const name of ['Permanências', 'Mediana', 'Média', 'Desconhecidas', 'Aqui agora'])
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: /cards/i })).not.toBeInTheDocument();
    const row = within(table).getByRole('row', { name: /Descoberta/ });
    const cells = within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(cells).toEqual(['4', '2d', '3d 4h', '1', '2']);
    expect(screen.getByText(/Permanências, não cards/)).toBeInTheDocument();
  });

  it('a fase atual vai em "aqui agora", fora da média (RF-13)', () => {
    renderThemed(withDwell(dwell));
    const row = screen.getByRole('row', { name: /Descoberta/ });
    expect(within(row).getAllByRole('cell')[4]).toHaveTextContent('2');
    expect(screen.getByText(/fica fora da média e da mediana/)).toBeInTheDocument();
  });

  it('conta as desconhecidas à parte e explica (RF-14)', () => {
    renderThemed(withDwell(dwell));
    const row = screen.getByRole('row', { name: /Descoberta/ });
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('1');
    expect(screen.getByText(/nunca como zero nem como tempo curto/)).toBeInTheDocument();
  });

  it('fase sem permanência terminada continua na lista, sem zero', () => {
    renderThemed(withDwell(dwell));
    const row = screen.getByRole('row', { name: /Revisão/ });
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('sem permanência medida');
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('sem permanência medida');
  });

  it('sem fases, diz que não há permanência', () => {
    renderThemed(withDwell([]));
    expect(screen.getByText('Nenhuma fase com permanência neste período.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('em inglês traduz rótulos e unidade', () => {
    setLocale('en');
    renderThemed(withDwell(dwell));
    expect(screen.getByRole('columnheader', { name: 'Here now' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Permanences' })).toBeInTheDocument();
  });
});

describe('LeadTable: lead time', () => {
  const rows = [
    { cardNumber: 7, title: 'Fluxo de login', leadMs: 3 * DAY, doneAt: Date.UTC(2026, 9, 3, 12) },
    { cardNumber: 8, title: 'Card antigo', leadMs: null, doneAt: Date.UTC(2026, 9, 2, 12) },
  ];

  it('mediana em destaque, média ao lado e as duas contagens (RF-15)', () => {
    renderThemed(withLead({ medianMs: 3 * DAY, meanMs: 4 * DAY, counted: 5, unknown: 2, rows }));
    expect(screen.getByText('Mediana').nextSibling).toHaveTextContent('3d');
    expect(screen.getByText('Mediana').nextSibling).toHaveClass('metrics-lead-median');
    expect(screen.getByText('Média').nextSibling).toHaveTextContent('4d');
    expect(screen.getByText('Entraram na conta').nextSibling).toHaveTextContent('5');
    expect(screen.getByText('Desconhecidos').nextSibling).toHaveTextContent('2');
  });

  it('"desconhecido" é palavra no lugar do número, com os dois motivos no texto (RF-16, RF-32)', () => {
    renderThemed(withLead({ medianMs: 3 * DAY, meanMs: 3 * DAY, counted: 1, unknown: 1, rows }));
    const row = screen.getByRole('row', { name: /Card antigo/ });
    expect(within(row).getAllByRole('cell')[0]).toHaveTextContent('desconhecido');
    expect(within(row).getAllByRole('cell')[0]).not.toHaveTextContent('0');
    const note = screen.getByText(/dois motivos possíveis/);
    expect(note).toHaveTextContent(/mês em que o card foi criado pode ter sido descartado/);
    expect(note).toHaveTextContent(/anterior ao início da série/);
    expect(screen.getByText('Desconhecidos').nextSibling).toHaveAttribute('aria-describedby');
  });

  it('nenhum valor conhecido: diz que não há valor medido, sem mediana vazia nem zero', () => {
    renderThemed(withLead({ medianMs: null, meanMs: null, counted: 0, unknown: 3, rows: [rows[1]!] }));
    expect(screen.getByText(/Nenhum lead time foi medido neste período/)).toBeInTheDocument();
    expect(screen.getByText('Mediana').nextSibling).toHaveTextContent('sem valor medido');
    expect(screen.getByText('Média').nextSibling).toHaveTextContent('sem valor medido');
  });

  it('diz que o lead time vai até a primeira conclusão (RF-17)', () => {
    renderThemed(withLead({ medianMs: DAY, meanMs: DAY, counted: 1, unknown: 0, rows: [rows[0]!] }));
    expect(screen.getByText(/até a primeira conclusão/)).toBeInTheDocument();
    expect(screen.queryByText(/dois motivos possíveis/)).not.toBeInTheDocument();
  });

  it('conta os cards concluídos não listados, sem linha "outros"', () => {
    renderThemed(withLead({ medianMs: DAY, meanMs: DAY, counted: 1, unknown: 0, rows: [rows[0]!], omitted: 4 }));
    expect(screen.getByText('+4 cards concluídos não listados')).toBeInTheDocument();
    expect(screen.queryByText(/outros/i)).not.toBeInTheDocument();
  });

  it('sem nenhum concluído, diz isso', () => {
    renderThemed(withLead({}));
    expect(screen.getByText('Nenhum card foi concluído neste período.')).toBeInTheDocument();
  });
});
