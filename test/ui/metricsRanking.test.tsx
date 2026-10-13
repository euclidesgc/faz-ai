import { posted, renderThemed } from './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// o custo em dólar está desligado no board (`SHOW_COST`); estes testes cobrem a exibição dele, para quando voltar
vi.mock('../../src/shared/metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/shared/metrics')>()),
  SHOW_COST: true,
  METRICS_MEASURES: ['cost', 'tokens', 'runs', 'duration'],
}));
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  EMPTY_METRICS_FILTERS,
  type MetricsCell,
  type MetricsLeadRow,
  type MetricsMonth,
  type MetricsPanelResult,
  type MetricsPanelSections,
} from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { MetricsBlocks } from '../../src/webview/components/metrics/MetricsBlocks';
import {
  RankingNoteRow,
  RankingTable,
  defaultCellSort,
  othersOf,
  sortRows,
  type RankingColumn,
} from '../../src/webview/components/metrics/RankingTable';
import { DEFAULT_METRICS_BLOCKS, useBoardStore, type MetricsSort } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

beforeEach(() => posted.mockClear());
afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS, metricsBlocks: DEFAULT_METRICS_BLOCKS });
  setLocale('pt-BR');
  lang = 'pt-BR';
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
  costedRuns: 0,
  tokens: null,
  costUsd: null,
  costEstimatedUsd: null,
  costInformedUsd: null,
};

function result(sections: MetricsPanelSections): MetricsPanelResult {
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
    sections,
  };
}

const MIN = 60_000;

/** Card `#i`: custo cresce com `i`, tempo de IA decresce com `i` (os dois critérios dão ordens opostas). */
function cardCell(i: number, measured = true): MetricsCell {
  return {
    value: `#${i} Card ${i}`,
    runs: i,
    measuredRuns: measured ? i : 0,
    costedRuns: measured ? i : 0,
    durationMs: (100 - i) * MIN,
    tokens: measured ? i * 100 : null,
    costUsd: measured ? i : null,
    costEstimatedUsd: measured ? 0 : null,
  };
}

/** `n` cards, com o coberto somando todos e mais `extraRuns` execuções que o host deixou fora do teto. */
function cardsSections(n: number, { measured = true, omitted = 0, extraRuns = 0 } = {}): MetricsPanelSections {
  const cells = Array.from({ length: n }, (_, k) => cardCell(k + 1, measured));
  const sum = (f: (c: MetricsCell) => number) => cells.reduce((a, c) => a + f(c), 0);
  const sections = emptySections();
  sections.cards = {
    cells,
    covered: {
      runs: sum((c) => c.runs) + extraRuns,
      measuredRuns: sum((c) => c.measuredRuns) + (measured ? extraRuns : 0),
      costedRuns: sum((c) => c.measuredRuns) + (measured ? extraRuns : 0),
      durationMs: sum((c) => c.durationMs) + extraRuns * MIN,
      tokens: measured ? sum((c) => c.tokens ?? 0) + extraRuns * 100 : null,
      costUsd: measured ? sum((c) => c.costUsd ?? 0) + extraRuns : null,
      costEstimatedUsd: measured ? 0 : null,
    },
    omitted,
  };
  return sections;
}

const CARDS = { 'pt-BR': 'Cards mais caros', en: 'Most expensive cards' };
let lang: keyof typeof CARDS = 'pt-BR';
const cardsBlock = () => screen.getByRole('region', { name: CARDS[lang] });
/** a frase do critério: região aria-live, sem role="status" (o único status do painel é o do MetricsView) */
const sortNote = () => cardsBlock().querySelector('.ranking-sort-note')!;
const table = () => within(cardsBlock()).getByRole('table', { name: CARDS[lang] });
const header = (name: string) => within(table()).getByRole('columnheader', { name });
const bodyRows = () =>
  within(table())
    .getAllByRole('row')
    .filter((r) => r.closest('tbody'));
const footRows = () =>
  within(table())
    .getAllByRole('row')
    .filter((r) => r.closest('tfoot'));
/** a coluna Execuções (a 4a célula de cada linha) como número */
const runsOf = (row: HTMLElement) => Number(row.querySelectorAll('th, td')[3]!.textContent!.replace(/\./g, ''));
const firstLabel = () => within(bodyRows()[0]!).getByRole('rowheader').textContent;

describe('RankingTable: tabela de verdade e ordenação acessível (RF-35)', () => {
  it('tem caption, th scope="col" e um botão nativo em cada coluna ordenável', () => {
    renderThemed(<MetricsBlocks result={result(cardsSections(3))} />);
    expect(table().querySelector('caption')).toHaveTextContent('Cards mais caros');
    const ths = within(table()).getAllByRole('columnheader');
    expect(ths.map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col', 'col', 'col']);
    for (const name of ['Custo', 'Tokens', 'Execuções', 'Tempo de IA']) {
      expect(within(header(name)).getByRole('button', { name }).tagName).toBe('BUTTON');
    }
    expect(header('Card')).not.toHaveAttribute('aria-sort');
    expect(table().querySelector('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toBeNull();
  });

  it('aria-sort muda com a ordenação e só uma coluna fica ordenada por vez', async () => {
    const user = userEvent.setup();
    renderThemed(<MetricsBlocks result={result(cardsSections(3))} />);
    const sorted = () =>
      within(table())
        .getAllByRole('columnheader')
        .filter((th) => /ending$/.test(th.getAttribute('aria-sort') ?? ''));

    expect(header('Custo')).toHaveAttribute('aria-sort', 'descending');
    expect(sorted()).toHaveLength(1);
    expect(firstLabel()).toBe('#3 Card 3');

    await user.click(within(header('Tempo de IA')).getByRole('button'));
    expect(header('Tempo de IA')).toHaveAttribute('aria-sort', 'descending');
    expect(header('Custo')).toHaveAttribute('aria-sort', 'none');
    expect(sorted()).toHaveLength(1);
    expect(firstLabel()).toBe('#1 Card 1');

    await user.click(within(header('Tempo de IA')).getByRole('button'));
    expect(header('Tempo de IA')).toHaveAttribute('aria-sort', 'ascending');
    expect(firstLabel()).toBe('#3 Card 3');
    expect(useBoardStore.getState().metricsBlocks.cardSort).toEqual({ key: 'duration', dir: 'asc' });
  });

  it('o botão de ordenação funciona pelo teclado (Tab até ele, Enter e Espaço)', async () => {
    const user = userEvent.setup();
    renderThemed(<MetricsBlocks result={result(cardsSections(3))} />);
    const button = within(header('Execuções')).getByRole('button');
    button.focus();
    await user.keyboard('{Enter}');
    expect(header('Execuções')).toHaveAttribute('aria-sort', 'descending');
    await user.keyboard(' ');
    expect(header('Execuções')).toHaveAttribute('aria-sort', 'ascending');
    expect(button).toHaveFocus();
  });

  it('trocar o critério não manda mensagem nenhuma ao host', async () => {
    const user = userEvent.setup();
    renderThemed(<MetricsBlocks result={result(cardsSections(12))} />);
    posted.mockClear();
    await user.click(within(header('Tokens')).getByRole('button'));
    await user.click(within(header('Execuções')).getByRole('button'));
    await user.click(within(cardsBlock()).getByRole('button', { name: /Mostrar mais/ }));
    expect(posted).not.toHaveBeenCalled();
  });
});

describe('RankingTable: corte, "mostrar mais" e "outros" (RF-18, RF-33)', () => {
  it('"outros (N)" fecha com o coberto para dois critérios diferentes', async () => {
    const user = userEvent.setup();
    renderThemed(<MetricsBlocks result={result(cardsSections(12, { omitted: 3, extraRuns: 7 }))} />);
    const covered = 78 + 7; // 1 + 2 + ... + 12, mais as execuções fora do teto

    for (const name of ['Custo', 'Tempo de IA']) {
      if (name !== 'Custo') await user.click(within(header(name)).getByRole('button'));
      expect(bodyRows()).toHaveLength(10);
      const others = footRows()[0]!;
      // 2 linhas recebidas fora do corte + 3 grupos que o host deixou fora do teto
      expect(within(others).getByRole('rowheader')).toHaveTextContent('outros (5)');
      const visible = bodyRows().reduce((a, r) => a + runsOf(r), 0);
      expect(visible + runsOf(others)).toBe(covered);
    }
    expect(
      within(table()).getByText('3 grupos além do teto de 200 linhas não vieram na lista: estão somados em "outros".'),
    ).toBeInTheDocument();
  });

  it('"mostrar mais" vai a 25 linhas e volta a 10', async () => {
    const user = userEvent.setup();
    renderThemed(<MetricsBlocks result={result(cardsSections(30))} />);
    expect(bodyRows()).toHaveLength(10);
    const more = within(cardsBlock()).getByRole('button', { name: 'Mostrar mais 15 linhas' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(bodyRows()).toHaveLength(25);
    expect(within(footRows()[0]!).getByRole('rowheader')).toHaveTextContent('outros (5)');
    const less = within(cardsBlock()).getByRole('button', { name: 'Mostrar só as 10 primeiras linhas' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    await user.click(less);
    expect(bodyRows()).toHaveLength(10);
  });

  it('com tudo na tela, não há linha "outros" nem "mostrar mais"', () => {
    renderThemed(<MetricsBlocks result={result(cardsSections(4))} />);
    expect(within(table()).queryByText(/outros/)).toBeNull();
    expect(within(cardsBlock()).queryByRole('button', { name: /Mostrar/ })).toBeNull();
  });

  it('othersOf: coberto menos as linhas exibidas; o que não foi medido continua não medido', () => {
    const covered = { runs: 10, measuredRuns: 4, costedRuns: 4, durationMs: 1000, tokens: 50, costUsd: 0.3, costEstimatedUsd: null };
    const shown = [
      { runs: 3, measuredRuns: 2, costedRuns: 2, durationMs: 400, tokens: 20, costUsd: 0.1, costEstimatedUsd: null },
      { runs: 2, measuredRuns: 0, costedRuns: 0, durationMs: 100, tokens: null, costUsd: null, costEstimatedUsd: null },
    ];
    expect(othersOf(covered, shown)).toEqual({
      runs: 5,
      measuredRuns: 2,
      costedRuns: 2,
      durationMs: 500,
      tokens: 30,
      costUsd: 0.19999999999999998,
      costEstimatedUsd: null,
    });
    expect(
      othersOf({ ...covered, costUsd: 0.3, costedRuns: 9 }, [
        { ...shown[0]!, costUsd: 0.1 },
        { ...shown[0]!, costUsd: 0.2 },
      ]).costUsd,
    ).toBe(0);
  });

  it('othersOf: sem medição nas linhas restantes, tokens e custo ficam não medidos e não 0', () => {
    const covered = { runs: 10, measuredRuns: 2, costedRuns: 2, durationMs: 1000, tokens: 50, costUsd: 0.3, costEstimatedUsd: null };
    const shown = [{ runs: 3, measuredRuns: 2, costedRuns: 2, durationMs: 400, tokens: 50, costUsd: 0.3, costEstimatedUsd: null }];
    const rest = othersOf(covered, shown);
    expect(rest.runs).toBe(7);
    expect(rest.tokens).toBeNull();
    expect(rest.costUsd).toBeNull();
  });

  it('sortRows deixa o "não medido" no fim nas duas direções', () => {
    const rows = [{ v: 2 }, { v: null }, { v: 5 }];
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([5, 2, null]);
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([2, 5, null]);
  });
});

describe('RankingTable: o critério em vigor, escrito na tela (RF-21, RF-22)', () => {
  it('com custo medido, o padrão é custo, e a tela diz por quê', () => {
    renderThemed(<MetricsBlocks result={result(cardsSections(3))} />);
    expect(sortNote()).toHaveTextContent('Ordenado pela coluna "Custo", decrescente. É o padrão quando o período tem custo medido.');
    expect(sortNote()).toHaveAttribute('aria-live', 'polite');
    expect(sortNote()).not.toHaveAttribute('role');
  });

  it('sem custo medido, o padrão é o tempo de IA, e "não medido" aparece no lugar do custo', () => {
    renderThemed(<MetricsBlocks result={result(cardsSections(3, { measured: false }))} />);
    expect(header('Tempo de IA')).toHaveAttribute('aria-sort', 'descending');
    expect(sortNote()).toHaveTextContent(
      'Ordenado pela coluna "Tempo de IA", decrescente. É o padrão enquanto o período não tem custo medido.',
    );
    expect(within(bodyRows()[0]!).getAllByText('não medido')).toHaveLength(2);
  });

  it('o padrão segue o custo medido do coberto (costedRuns)', () => {
    const covered = { runs: 3, measuredRuns: 0, costedRuns: 0, durationMs: 10, tokens: null, costUsd: null, costEstimatedUsd: null };
    expect(defaultCellSort(covered)).toEqual({ key: 'duration', dir: 'desc' });
    expect(defaultCellSort({ ...covered, measuredRuns: 1, costedRuns: 1, costUsd: 0.5 })).toEqual({ key: 'cost', dir: 'desc' });
    // tokens medidos sem custo (antes de #70): ordenar por custo seria uma coluna de "não medido"
    expect(defaultCellSort({ ...covered, measuredRuns: 3, tokens: 30 })).toEqual({ key: 'duration', dir: 'desc' });
  });

  it('escolhido pela pessoa, a tela escreve o critério sem dizer que é o padrão', async () => {
    const user = userEvent.setup();
    renderThemed(<MetricsBlocks result={result(cardsSections(3))} />);
    await user.click(within(header('Execuções')).getByRole('button'));
    expect(sortNote()).toHaveTextContent(/^Ordenado pela coluna "Execuções", decrescente\.$/);
  });

  it('todo número está em texto, e o grupo sem card tem nome (RF-38, RF-20)', () => {
    const sections = cardsSections(1);
    sections.cards.cells.push({ ...cardCell(2), value: '' });
    sections.cards.covered = {
      ...sections.cards.covered,
      runs: 3,
      measuredRuns: 3,
      costedRuns: 3,
      durationMs: 197 * MIN,
      tokens: 300,
      costUsd: 3,
    };
    renderThemed(<MetricsBlocks result={result(sections)} />);
    const row = bodyRows()[0]!;
    expect(within(row).getByRole('rowheader')).toHaveTextContent('Execuções sem card');
    expect(row).toHaveTextContent(/US\$\s?2,00/);
    expect(row).toHaveTextContent('200');
    expect(row).toHaveTextContent('1h38min');
  });

  it('em inglês traduz o critério e o "outros"', () => {
    setLocale('en');
    lang = 'en';
    renderThemed(<MetricsBlocks result={result(cardsSections(11))} />);
    expect(sortNote()).toHaveTextContent('Sorted by the "Cost" column, descending. This is the default when the period has measured cost.');
    expect(within(cardsBlock()).getByText('others (1)')).toBeInTheDocument();
  });
});

describe('ranking de fases', () => {
  it('ordena o corte por fase, com "Fase não definida" no lugar do vazio', () => {
    const sections = emptySections();
    const phase = sections.breakdowns.find((b) => b.dim === 'phase')!;
    phase.cells = [
      {
        value: 'Implementação',
        runs: 2,
        measuredRuns: 0,
        costedRuns: 0,
        durationMs: 5 * MIN,
        tokens: null,
        costUsd: null,
        costEstimatedUsd: null,
      },
      { value: '', runs: 1, measuredRuns: 0, costedRuns: 0, durationMs: 9 * MIN, tokens: null, costUsd: null, costEstimatedUsd: null },
    ];
    phase.covered = { runs: 3, measuredRuns: 0, costedRuns: 0, durationMs: 14 * MIN, tokens: null, costUsd: null, costEstimatedUsd: null };
    renderThemed(<MetricsBlocks result={result(sections)} />);
    const t = within(screen.getByRole('region', { name: 'Fases mais caras' })).getByRole('table', { name: 'Fases mais caras' });
    const rows = within(t)
      .getAllByRole('rowheader')
      .map((th) => th.textContent);
    expect(rows).toEqual(['Fase não definida', 'Implementação']);
    expect(within(t).getByRole('columnheader', { name: 'Tempo de IA' })).toHaveAttribute('aria-sort', 'descending');
  });
});

describe('lead time: sem "outros", com a contagem', () => {
  const leadRows: MetricsLeadRow[] = Array.from({ length: 12 }, (_, k) => ({
    cardNumber: k + 1,
    title: `Card ${k + 1}`,
    leadMs: k === 0 ? null : k * 3_600_000,
    doneAt: 1_000 + k,
  }));
  const omitted = 4;

  function Lead() {
    const [sort, setSort] = useState<MetricsSort>({ key: 'lead', dir: 'desc' });
    const columns: RankingColumn<MetricsLeadRow>[] = [
      { key: 'card', header: 'Card', rowHeader: true, cell: (r) => `#${r.cardNumber} ${r.title}` },
      {
        key: 'lead',
        header: 'Lead time',
        numeric: true,
        cell: (r) => (r.leadMs === null ? 'desconhecido' : String(r.leadMs)),
        sortValue: (r) => r.leadMs,
      },
    ];
    return (
      <RankingTable
        caption="Lead time de cada card concluído"
        columns={columns}
        rows={leadRows}
        rowKey={(r) => String(r.cardNumber)}
        sort={sort}
        onSort={setSort}
        footer={({ hidden, colSpan }) =>
          hidden + omitted > 0 && <RankingNoteRow colSpan={colSpan}>{`+${hidden + omitted} cards concluídos não listados`}</RankingNoteRow>
        }
      />
    );
  }

  it('o corte aparece como contagem e nenhuma linha soma lead times', () => {
    renderThemed(<Lead />);
    const t = screen.getByRole('table', { name: 'Lead time de cada card concluído' });
    expect(within(t).queryByText(/outros/)).toBeNull();
    const cell = within(t).getByText('+6 cards concluídos não listados');
    expect(cell).toHaveAttribute('colspan', '2');
    // o desconhecido vai para o fim, não conta como o menor lead time
    const labels = within(t)
      .getAllByRole('rowheader')
      .map((th) => th.textContent);
    expect(labels[0]).toBe('#12 Card 12');
    expect(labels).not.toContain('#1 Card 1');
  });
});
