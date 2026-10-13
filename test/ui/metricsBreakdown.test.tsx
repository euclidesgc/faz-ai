import { choose, posted, renderThemed } from './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// o custo em dólar está desligado no board (`SHOW_COST`); estes testes cobrem a exibição dele, para quando voltar
vi.mock('../../src/shared/metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/shared/metrics')>()),
  SHOW_COST: true,
  METRICS_MEASURES: ['cost', 'tokens', 'runs', 'duration'],
}));
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EMPTY_METRICS_FILTERS,
  type MetricsBreakdown,
  type MetricsBreakdownDim,
  type MetricsCell,
  type MetricsMonth,
  type MetricsPanelResult,
  type MetricsPanelSections,
} from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { BREAKDOWN_ROWS, Breakdown, breakdownRows, remainder } from '../../src/webview/components/metrics/Breakdown';
import { MetricsBlocks } from '../../src/webview/components/metrics/MetricsBlocks';
import { DEFAULT_METRICS_BLOCKS, useBoardStore } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

// card 175: o corte por dimensão (Breakdown). O componente é montado como MetricsBlocks o monta: dimensão e
// medida lidas da store, a troca gravada nela.

beforeEach(() => posted.mockClear());
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
  costedRuns: 0,
  tokens: null,
  costUsd: null,
  costEstimatedUsd: null,
  costInformedUsd: null,
};

/** Uma categoria medida por inteiro, com custo informado (sem parte estimada), salvo o que o teste mudar. */
function cell(value: string, over: Partial<MetricsCell> = {}): MetricsCell {
  return {
    value,
    runs: 1,
    measuredRuns: 1,
    costedRuns: 1,
    durationMs: 60_000,
    tokens: 100,
    costUsd: 1,
    costEstimatedUsd: null,
    ...over,
  };
}

/** O total que o host mandaria: a soma das categorias (o teste de "outros" monta o seu). */
function covered(cells: MetricsCell[]): Omit<MetricsCell, 'value'> {
  const sum = (pick: (c: MetricsCell) => number | null) => cells.reduce((a, c) => a + (pick(c) ?? 0), 0);
  const measuredRuns = sum((c) => c.measuredRuns);
  const costedRuns = sum((c) => c.costedRuns);
  const anyEstimated = cells.some((c) => c.costEstimatedUsd !== null);
  return {
    runs: sum((c) => c.runs),
    measuredRuns,
    costedRuns,
    durationMs: sum((c) => c.durationMs),
    tokens: measuredRuns ? sum((c) => c.tokens) : null,
    costUsd: costedRuns ? sum((c) => c.costUsd) : null,
    costEstimatedUsd: anyEstimated ? sum((c) => c.costEstimatedUsd) : null,
  };
}

function cut(dim: MetricsBreakdownDim, cells: MetricsCell[], over: Partial<MetricsBreakdown> = {}): MetricsBreakdown {
  return { dim, cells, covered: covered(cells), includesArchive: true, excludedMonths: [], ambiguous: [], ...over };
}

function sectionsWith(...cuts: MetricsBreakdown[]): MetricsPanelSections {
  const s = emptySections();
  s.breakdowns = s.breakdowns.map((b) => cuts.find((c) => c.dim === b.dim) ?? b);
  return s;
}

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

/** O Breakdown ligado à store, como em MetricsBlocks. */
function Connected({ sections }: { sections: MetricsPanelSections }) {
  const blocks = useBoardStore((s) => s.metricsBlocks);
  const setBlocks = useBoardStore((s) => s.setMetricsBlocks);
  const r = result(sections);
  return <Breakdown result={r} sections={r.sections} dim={blocks.dim} measure={blocks.measure} onChange={setBlocks} />;
}

const PERIOD = '1 de setembro de 2026 a 4 de outubro de 2026';
const phases = () =>
  cut('phase', [
    cell('Implementação', { runs: 3, costUsd: 3, durationMs: 120_000, tokens: 300, measuredRuns: 3, costedRuns: 3 }),
    cell('Revisão', { runs: 2, costUsd: 5, durationMs: 60_000, tokens: 200, measuredRuns: 2, costedRuns: 2 }),
    cell(''),
  ]);
const models = () =>
  cut('model', [cell('opus', { runs: 2, costUsd: 2, measuredRuns: 2, costedRuns: 2, tokens: 50 }), cell('haiku', { runs: 4, tokens: 10 })]);

/** As linhas da tabela, sem o cabeçalho, como texto de cada célula. */
const tableRows = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => [...tr.querySelectorAll('th, td')].map((c) => (c.textContent ?? '').replace(/\u00a0/g, ' ')));

describe('Breakdown: o seletor e o título', () => {
  it('nasce em "Fase", com dimensão, medida e período no título visível e no nome do gráfico (RF-01, RF-36)', () => {
    renderThemed(<Connected sections={sectionsWith(phases())} />);
    expect(screen.getByRole('combobox', { name: 'Recortar por' })).toHaveTextContent('Fase');
    expect(screen.getByRole('combobox', { name: 'Medida da barra' })).toHaveTextContent('Custo');
    const title = `Custo por fase, ${PERIOD}`;
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: title })).toBeInTheDocument();
  });

  it('o seletor tem as seis dimensões e uma só de fase (RF-01, RF-05)', async () => {
    renderThemed(<Connected sections={sectionsWith(phases())} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Recortar por' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Fase',
      'Tipo de card',
      'Modelo',
      'Ferramenta de IA',
      'Esforço do modelo',
      'Perfil de agente',
    ]);
  });

  it('trocar a dimensão redesenha no lugar, conserva filtros e medida, e não pede nada ao host (RF-01)', async () => {
    const filters = { ...EMPTY_METRICS_FILTERS, period: '30d' as const, workflow: 'Histórias' };
    useBoardStore.setState({ metricsFilters: filters, metricsBlocks: { ...DEFAULT_METRICS_BLOCKS, measure: 'tokens' } });
    renderThemed(<Connected sections={sectionsWith(phases(), models())} />);
    await choose(screen.getByRole('combobox', { name: 'Recortar por' }), 'Modelo');
    expect(useBoardStore.getState().metricsBlocks).toMatchObject({ dim: 'model', measure: 'tokens' });
    expect(useBoardStore.getState().metricsFilters).toEqual(filters);
    expect(screen.getByRole('img', { name: `Tokens por modelo, ${PERIOD}` })).toBeInTheDocument();
    expect(tableRows().map((r) => r[0])).toEqual(['opus', 'haiku']);
    expect(posted).not.toHaveBeenCalled();
  });

  it('a troca é anunciada na região aria-live e o foco fica no seletor usado (RF-39)', async () => {
    renderThemed(<Connected sections={sectionsWith(phases(), models())} />);
    const status = document.querySelector('.metrics-breakdown-live')!;
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
    const dimSelect = screen.getByRole('combobox', { name: 'Recortar por' });
    await choose(dimSelect, 'Modelo');
    expect(status).toHaveTextContent(`Custo por modelo, ${PERIOD}`);
    expect(document.activeElement).toBe(dimSelect);

    const measureSelect = screen.getByRole('combobox', { name: 'Medida da barra' });
    await choose(measureSelect, 'Execuções');
    expect(status).toHaveTextContent(`Execuções por modelo, ${PERIOD}`);
    expect(document.activeElement).toBe(measureSelect);
  });

  it('o corte de fase diz o que "fase" significa; os outros cortes não (RF-05)', async () => {
    renderThemed(<Connected sections={sectionsWith(phases(), models())} />);
    const text = /Fase é o nome da coluna em que o card estava no momento da chamada/;
    expect(screen.getByText(text)).toBeInTheDocument();
    await choose(screen.getByRole('combobox', { name: 'Recortar por' }), 'Modelo');
    expect(screen.queryByText(text)).toBeNull();
  });
});

describe('Breakdown: as linhas', () => {
  it('cada linha tem as quatro medidas em texto, com unidade (RF-02, RF-38)', () => {
    renderThemed(<Connected sections={sectionsWith(phases())} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Fase',
      'Custo',
      'Tokens',
      'Execuções',
      'Tempo de IA',
      'Observação',
    ]);
    const revisao = tableRows().find((r) => r[0] === 'Revisão')!;
    expect(revisao.slice(1, 5)).toEqual(['US$ 5,00', '200', '2', '1min']);
  });

  it('ordena pela medida escolhida, do maior para o menor, e só a ordem e as barras mudam (RF-02)', async () => {
    renderThemed(<Connected sections={sectionsWith(phases())} />);
    expect(tableRows().map((r) => r[0])).toEqual(['Revisão', 'Implementação', 'não definido']);
    const before = tableRows().find((r) => r[0] === 'Revisão');
    await choose(screen.getByRole('combobox', { name: 'Medida da barra' }), 'Execuções');
    expect(tableRows().map((r) => r[0])).toEqual(['Implementação', 'Revisão', 'não definido']);
    expect(tableRows().find((r) => r[0] === 'Revisão')).toEqual(before);
    const bars = [...document.querySelectorAll('.metrics-breakdown-bar')].map((b) => Number(b.getAttribute('data-value')));
    expect(bars).toEqual([3, 2, 1]);
  });

  it('barras começam no zero e a maior ocupa a escala inteira', () => {
    renderThemed(<Connected sections={sectionsWith(phases())} />);
    const bars = [...document.querySelectorAll('.metrics-breakdown-bar')];
    expect(bars.every((b) => b.getAttribute('x') === '0')).toBe(true);
    expect(bars.map((b) => Number(b.getAttribute('width')))).toEqual([100, 60, 20]);
    expect(document.querySelector('.metrics-breakdown-svg text')).toBeNull();
  });

  it('"não definido" é uma linha própria, contada (RF-04)', () => {
    renderThemed(<Connected sections={sectionsWith(phases())} />);
    const row = tableRows().find((r) => r[0] === 'não definido')!;
    expect(row[3]).toBe('1');
  });

  it('coluna renomeada aparece com os dois nomes, sem fundir (RF-06)', () => {
    renderThemed(<Connected sections={sectionsWith(cut('phase', [cell('Revisão'), cell('Review')]))} />);
    expect(
      tableRows()
        .map((r) => r[0])
        .sort(),
    ).toEqual(['Review', 'Revisão']);
    expect(screen.queryByRole('button', { name: /juntar|fundir/i })).toBeNull();
  });

  it('nome de fase em mais de um workflow: aviso junto do corte e marca na linha (RF-07)', () => {
    renderThemed(<Connected sections={sectionsWith(cut('phase', [cell('Revisão'), cell('Teste')], { ambiguous: ['Revisão'] }))} />);
    expect(screen.getByText(/Revisão: mais de um workflow tem uma coluna com este nome/)).toBeInTheDocument();
    expect(tableRows().find((r) => r[0] === 'Revisão')![5]).toContain('nome em mais de um workflow');
    expect(tableRows().find((r) => r[0] === 'Teste')![5]).not.toContain('nome em mais de um workflow');
  });
});

describe('Breakdown: o que não foi medido e o que é estimado', () => {
  it('"não medido" no lugar de "US$ 0,00", com a contagem de execuções sem medição (RF-30)', () => {
    renderThemed(
      <Connected
        sections={sectionsWith(cut('phase', [cell('Plano', { runs: 2, measuredRuns: 0, costedRuns: 0, tokens: null, costUsd: null })]))}
      />,
    );
    const row = tableRows()[0]!;
    expect(row[1]).toBe('não medido');
    expect(row[2]).toBe('não medido');
    expect(row[5]).toContain('2 execuções sem custo medido');
    expect(row[5]).toContain('2 execuções sem tokens medidos');
    expect(screen.queryByText(/US\$\s0,00/)).toBeNull();
    // sem custo medido em categoria nenhuma, não há barra para desenhar, e a tela diz por quê
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/Nenhuma categoria tem custo medido neste período/)).toBeInTheDocument();
  });

  it('custo parcial vem de costedRuns: tokens de todas, custo de uma só (RF-30)', () => {
    renderThemed(<Connected sections={sectionsWith(cut('phase', [cell('Plano', { runs: 3, measuredRuns: 3, costedRuns: 1 })]))} />);
    const row = tableRows()[0]!;
    expect(row[1]).toBe('US$ 1,00');
    expect(row[5]).toContain('custo parcial');
    expect(row[5]).toContain('2 execuções sem custo medido');
    expect(row[5]).not.toContain('tokens parciais');
  });

  it('linha sem custo, com a medida em custo: sem barra e marcada "não medido" ao lado do rótulo (RF-30)', () => {
    renderThemed(
      <Connected
        sections={sectionsWith(
          cut('phase', [cell('Plano'), cell('Teste', { measuredRuns: 0, costedRuns: 0, tokens: null, costUsd: null })]),
        )}
      />,
    );
    expect(document.querySelectorAll('.metrics-breakdown-bar')).toHaveLength(1);
    expect(tableRows().map((r) => r[0])).toEqual(['Plano', 'Teste']);
    expect(document.querySelectorAll('.metrics-breakdown-labels li')[1]).toHaveTextContent('não medido');
  });

  it('a marca de estimado chega a cada linha, inteira ou em parte (RF-31)', () => {
    renderThemed(
      <Connected
        sections={sectionsWith(
          cut('phase', [
            cell('Plano', { costUsd: 2, costEstimatedUsd: 2 }),
            cell('Teste', { costUsd: 1, costEstimatedUsd: 0.25 }),
            cell('Revisão', { costUsd: 0.5 }),
          ]),
        )}
      />,
    );
    const marks = Object.fromEntries(tableRows().map((r) => [r[0], r[5]]));
    expect(marks['Plano']).toBe('estimado por tabela de preços');
    expect(marks['Teste']).toBe('parte estimada por tabela de preços: US$ 0,25');
    expect(marks['Revisão']).toBe('');
  });
});

describe('Breakdown: "outros" e o total (RF-03)', () => {
  const many = () => Array.from({ length: BREAKDOWN_ROWS + 2 }, (_, i) => cell(`F${i + 1}`, { runs: i + 1, costUsd: i + 1 }));

  it('com mais de 12 categorias mostra as 12 maiores e "outros (N)" com a soma; tudo fecha com o total', () => {
    const cells = many();
    const b = cut('phase', cells);
    const rows = breakdownRows(b, 'cost');
    expect(rows).toHaveLength(BREAKDOWN_ROWS + 1);
    expect(rows[0]!.value).toBe('F14');
    const other = rows[rows.length - 1]!;
    expect(other.other).toEqual({ count: 2 });
    expect(other.cell).toMatchObject({ runs: 1 + 2, costUsd: 1 + 2 });
    const runs = rows.reduce((a, r) => a + r.cell.runs, 0);
    expect(runs).toBe(b.covered.runs);
  });

  it('o que o host deixou fora do teto também cai em "outros", calculado do total', () => {
    const cells = [cell('A', { runs: 5, measuredRuns: 5, costedRuns: 5 })];
    const b = cut('phase', cells, { covered: { ...covered(cells), runs: 7, durationMs: 180_000, measuredRuns: 5, costedRuns: 5 } });
    const rows = breakdownRows(b, 'runs');
    expect(rows.map((r) => r.other)).toEqual([null, { count: 0 }]);
    expect(rows[1]!.cell).toMatchObject({ runs: 2, durationMs: 120_000, measuredRuns: 0, tokens: null, costUsd: null });
  });

  it('"outros" sem execução medida é "não medido", nunca zero', () => {
    const shown = [cell('A')];
    const rest = remainder(
      { ...covered(shown), runs: 3 },
      shown.map(({ value: _v, ...c }) => c),
    );
    expect(rest).toMatchObject({ runs: 2, tokens: null, costUsd: null, costEstimatedUsd: null });
  });

  it('na tela: a linha "outros (2)" fica por último', () => {
    renderThemed(<Connected sections={sectionsWith(cut('phase', many()))} />);
    const labels = tableRows().map((r) => r[0]);
    expect(labels).toHaveLength(BREAKDOWN_ROWS + 1);
    expect(labels[labels.length - 1]).toBe('outros (2)');
  });
});

describe('Breakdown: período vazio e idioma', () => {
  it('sem execução no período, diz que não há dado e não escreve zeros (RF-34)', () => {
    renderThemed(<Connected sections={emptySections()} />);
    expect(screen.getByText('Nenhuma execução de IA neste período.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/US\$\s0,00/)).toBeNull();
  });

  it('meses fora do corte são ditos junto dele (RF-10)', () => {
    renderThemed(<Connected sections={sectionsWith(cut('phase', [cell('Plano')], { excludedMonths: ['2026-08'] }))} />);
    expect(screen.getByText(/agosto de 2026 ficou fora deste corte/)).toBeInTheDocument();
  });

  it('em inglês traduz o título, os seletores e as marcas', () => {
    setLocale('en');
    renderThemed(
      <Connected sections={sectionsWith(cut('phase', [cell(''), cell('Plano', { runs: 2, costedRuns: 1, measuredRuns: 2 })]))} />,
    );
    expect(screen.getByRole('combobox', { name: 'Break down by' })).toHaveTextContent('Phase');
    expect(screen.getByRole('img', { name: 'Cost by phase, September 1, 2026 to October 4, 2026' })).toBeInTheDocument();
    expect(tableRows().map((r) => r[0])).toContain('not defined');
    expect(tableRows().find((r) => r[0] === 'Plano')![5]).toContain('partial cost');
  });

  it('MetricsBlocks monta o corte dentro de "Onde o consumo aconteceu"', () => {
    renderThemed(<MetricsBlocks result={result(sectionsWith(phases()))} />);
    const region = screen.getByRole('region', { name: 'Onde o consumo aconteceu' });
    expect(within(region).getByRole('img', { name: `Custo por fase, ${PERIOD}` })).toBeInTheDocument();
  });
});
