import { renderThemed } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { EMPTY_METRICS_FILTERS, type MetricsPanelResult } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { Totals } from '../../src/webview/components/metrics/Totals';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS });
  setLocale('pt-BR');
});

const tokens = { input: 1000, output: 500, cacheRead: 7000, cacheWrite: 1500, total: 10_000 };

/** Totais de teste: tudo medido, nenhuma execução aberta. */
function result(over: Partial<MetricsPanelResult['totals']> = {}): MetricsPanelResult {
  return {
    range: { startDate: '2026-09-01', endDate: '2026-10-04' },
    clamped: false,
    totals: {
      cardsDone: 7,
      runs: 11,
      runsOpen: 0,
      durationMs: 3 * 3_600_000 + 12 * 60_000,
      measuredRuns: 11,
      tokens,
      costUsd: 12.5,
      costEstimatedUsd: 12.5,
      costInformedUsd: 0,
      ...over,
    },
    months: [],
    workflows: [],
    logSince: '2026-09-01',
    detailFrom: '2026-09',
    archivedMonths: [],
    retention: { months: 6, detailMonths: 2, detailRows: 40 },
    sections: emptySections(),
  };
}

const card = (name: string) => screen.getByRole('group', { name });

describe('Totals: os cinco totais', () => {
  it('mostra os cinco valores da resposta (RF-09)', () => {
    renderThemed(<Totals result={result()} />);
    expect(within(card('Atividades concluídas')).getByText('7')).toBeInTheDocument();
    expect(within(card('Execuções de IA')).getByText('11')).toBeInTheDocument();
    expect(within(card('Tokens')).getByText('10.000')).toBeInTheDocument();
    expect(within(card('Custo')).getByText('US$ 12,50')).toBeInTheDocument();
    expect(within(card('Tempo de IA')).getByText('3h12min')).toBeInTheDocument();
  });

  it('cada rótulo diz o que conta, e o de tempo diz que é soma (RF-10)', () => {
    renderThemed(<Totals result={result()} />);
    expect(within(card('Atividades concluídas')).getByText(/coluna de conclusão/)).toBeInTheDocument();
    expect(within(card('Execuções de IA')).getByText(/acionada/)).toBeInTheDocument();
    expect(within(card('Tempo de IA')).getByText(/^Soma da duração/)).toBeInTheDocument();
    expect(within(card('Tempo de IA')).getByText(/simultâneas somam/)).toBeInTheDocument();
  });

  it('execuções em andamento aparecem à parte e ficam fora do tempo (RF-11)', () => {
    renderThemed(<Totals result={result({ runsOpen: 2 })} />);
    expect(within(card('Execuções de IA')).getByText('2 em andamento')).toBeInTheDocument();
    expect(within(card('Tempo de IA')).getByText('2 em andamento, fora desta soma')).toBeInTheDocument();
  });

  it('sem execução aberta não escreve "em andamento"', () => {
    renderThemed(<Totals result={result()} />);
    expect(screen.queryByText(/^\d+ em andamento/)).toBeNull();
  });

  it('a quebra dos tokens traz os quatro tipos, somando o total exibido (RF-12)', () => {
    renderThemed(<Totals result={result()} />);
    const box = within(card('Tokens'));
    const shown = ['Entrada', 'Saída', 'Leitura de cache', 'Escrita de cache'].map((label) => {
      const dt = box.getByText(label);
      return Number(dt.nextElementSibling!.textContent!.replace(/\./g, ''));
    });
    expect(shown).toEqual([1000, 500, 7000, 1500]);
    expect(shown.reduce((a, b) => a + b, 0)).toBe(Number(box.getByText('10.000').textContent!.replace(/\./g, '')));
  });

  it('tokens e custo null viram "não medido", nunca 0 nem US$ 0,00 (RF-18)', () => {
    renderThemed(
      <Totals result={result({ tokens: null, costUsd: null, costEstimatedUsd: null, costInformedUsd: null, measuredRuns: 0 })} />,
    );
    expect(within(card('Tokens')).getByText('não medido')).toBeInTheDocument();
    expect(within(card('Custo')).getByText('não medido')).toBeInTheDocument();
    expect(within(card('Custo')).getByText(/Nenhuma das 11 execuções teve custo medido/)).toBeInTheDocument();
    expect(within(card('Tokens')).getByText(/Nenhuma das 11 execuções teve tokens medido/)).toBeInTheDocument();
    expect(screen.queryByText(/US\$\s*0,00/)).toBeNull();
    expect(within(card('Tokens')).queryByText('0')).toBeNull();
    // a quebra não aparece sem número
    expect(within(card('Tokens')).queryByText('Entrada')).toBeNull();
  });

  it('o aviso do "não medido" é a descrição do número (aria-describedby)', () => {
    renderThemed(<Totals result={result({ tokens: null, costUsd: null, measuredRuns: 0 })} />);
    const value = within(card('Custo')).getByText('não medido');
    const note = document.getElementById(value.getAttribute('aria-describedby')!);
    expect(note).toHaveTextContent(/Nenhuma das 11 execuções/);
  });

  it('medido em parte traz o número com o aviso de parcialidade (RF-18)', () => {
    renderThemed(<Totals result={result({ runs: 11, measuredRuns: 8 })} />);
    expect(within(card('Custo')).getByText('US$ 12,50')).toBeInTheDocument();
    expect(within(card('Custo')).getByText(/3 de 11 execuções não foram medidas/)).toBeInTheDocument();
    expect(within(card('Tokens')).getByText(/3 de 11 execuções não foram medidas/)).toBeInTheDocument();
  });

  it('tudo medido não traz aviso de parcialidade', () => {
    renderThemed(<Totals result={result()} />);
    expect(screen.queryByText(/não foram medidas/)).toBeNull();
  });

  it('a parte estimada do custo é marcada como estimada (RF-19)', () => {
    renderThemed(<Totals result={result({ costUsd: 15, costEstimatedUsd: 12.5, costInformedUsd: 2.5 })} />);
    expect(
      within(card('Custo')).getByText(/Estimado por tabela de preços: US\$ 12,50; informado pela ferramenta: US\$ 2,50/),
    ).toBeInTheDocument();
  });

  it('custo todo informado não leva marca de estimado', () => {
    renderThemed(<Totals result={result({ costUsd: 3, costEstimatedUsd: 0, costInformedUsd: 3 })} />);
    expect(screen.queryByText(/Estimado/)).toBeNull();
  });

  it('em inglês os rótulos e avisos saem traduzidos', () => {
    setLocale('en');
    renderThemed(<Totals result={result({ tokens: null, costUsd: null, measuredRuns: 0, runsOpen: 1 })} />);
    expect(card('AI time')).toBeInTheDocument();
    expect(within(card('Cost')).getByText('not measured')).toBeInTheDocument();
    expect(within(card('AI runs')).getByText('1 in progress')).toBeInTheDocument();
    expect(within(card('AI time')).getByText(/^Sum of each run duration/)).toBeInTheDocument();
  });
});
