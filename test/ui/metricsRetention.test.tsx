import { lastSent, renderThemed, sentOf } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HostToWebview } from '../../src/shared/messages';
import { EMPTY_METRICS_FILTERS, type MetricsMonth, type MetricsPanelResult } from '../../src/shared/metrics';
import { setLocale } from '../../src/webview/i18n';
import { Dialog } from '../../src/webview/components/Dialog';
import { MetricsView } from '../../src/webview/components/metrics/MetricsView';
import { RetentionCard } from '../../src/webview/components/metrics/RetentionCard';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { emptySections } from './metricsFixtures';

afterEach(() => {
  useBoardStore.setState({ metricsFilters: EMPTY_METRICS_FILTERS });
  setLocale('pt-BR');
});

const month = (m: string): MetricsMonth => ({
  month: m,
  present: true,
  archived: false,
  partial: false,
  cardsDone: 3,
  runs: 4,
  runsOpen: 0,
  durationMs: 60_000,
  measuredRuns: 0,
  tokens: null,
  costUsd: null,
  costEstimatedUsd: null,
  costInformedUsd: null,
});

function panel(retention: MetricsPanelResult['retention'], over: Partial<MetricsPanelResult> = {}): MetricsPanelResult {
  const { month: _m, present: _p, archived: _a, partial: _x, ...totals } = month('2026-10');
  return {
    range: { startDate: '2026-09-01', endDate: '2026-10-04' },
    clamped: false,
    totals,
    months: [month('2026-09'), month('2026-10')],
    workflows: [],
    logSince: '2026-09-01',
    detailFrom: '2026-09',
    archivedMonths: [],
    retention,
    sections: emptySections(),
    ...over,
  };
}

const R6 = { months: 6, detailMonths: 8, detailRows: 5_000 }; // 5.000 x 240 B = 1,2 MB

const renderCard = (retention = R6, onChanged?: () => void) =>
  renderThemed(
    <>
      <RetentionCard result={panel(retention)} onChanged={onChanged} />
      <Dialog />
    </>,
  );

const field = () => screen.getByRole('spinbutton');

async function typeValue(value: string): Promise<void> {
  const input = field();
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.tab();
}

describe('RetentionCard (#161)', () => {
  it('mostra o valor em vigor num campo com label, alcançável por teclado (RF-23, RF-31)', async () => {
    renderCard();
    expect(field()).toHaveValue(6);
    expect(field()).toHaveAttribute('min', '1');
    expect(field()).toHaveAttribute('max', '24');
    await userEvent.tab();
    expect(field()).toHaveFocus();
  });

  it('o preço do número aparece com o tamanho e os meses com detalhe (RF-25)', () => {
    renderCard();
    expect(screen.getByText(/cerca de 1,2 MB · 8 meses com detalhe/)).toBeInTheDocument();
    expect(field()).toHaveAccessibleDescription(/1,2 MB/);
    expect(field()).toHaveAccessibleDescription(/Grava ao pressionar Enter ou ao sair do campo\./);
  });

  it('um mês só fica no singular e detalhe pequeno diz "menos de"', () => {
    renderCard({ months: 6, detailMonths: 1, detailRows: 40 });
    expect(screen.getByText(/menos de 100 KB · 1 mês com detalhe/)).toBeInTheDocument();
  });

  it('diz o que some e que os totais por mês nunca expiram (RF-27)', () => {
    renderCard();
    expect(
      screen.getByText(/some o detalhe por card, o lead time de card antigo e o inventário de ferramentas e skills/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Os totais por mês nunca expiram/)).toBeInTheDocument();
  });

  it('acima de 12 meses avisa do teto de tamanho', () => {
    renderCard({ ...R6, months: 18 });
    expect(screen.getByText(/passar do teto de 10 MB/)).toBeInTheDocument();
  });

  it('subir grava na hora, sem confirmação, e pede nova consulta (RF-26)', async () => {
    let changed = 0;
    renderCard(R6, () => changed++);
    await typeValue('9');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastSent('settings.rules.update')).toEqual({ type: 'settings.rules.update', patch: { logRetentionMonths: 9 } });
    expect(changed).toBe(1);
  });

  it('o número é limitado a 1–24 antes de enviar (RF-24)', async () => {
    renderCard();
    await typeValue('99');
    expect(lastSent('settings.rules.update').patch).toEqual({ logRetentionMonths: 24 });
  });

  it('baixar abre a confirmação com quantos meses perdem o detalhe e quando; confirmar envia (RF-26)', async () => {
    renderCard(); // 8 meses com detalhe (o corrente e 7 anteriores); com 3 ficam o corrente e 3: perdem 4
    await typeValue('3');
    expect(sentOf('settings.rules.update')).toEqual([]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Na próxima abertura do board, 4 meses perdem o detalhe/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Não acontece agora/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar só 3 meses' }));
    expect(lastSent('settings.rules.update').patch).toEqual({ logRetentionMonths: 3 });
  });

  it('baixar e cancelar não envia nada e o campo volta ao valor em vigor', async () => {
    renderCard();
    await typeValue('3');
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(sentOf('settings.rules.update')).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('baixar sem mês que saia da janela hoje explica que o descarte só fica mais cedo', async () => {
    renderCard({ months: 6, detailMonths: 2, detailRows: 100 });
    await typeValue('5');
    expect(await screen.findByText(/Nenhum mês guardado hoje sai da janela/)).toBeInTheDocument();
  });

  it('em inglês, o preço e a confirmação saem traduzidos', async () => {
    setLocale('en');
    renderCard();
    expect(screen.getByRole('heading', { name: 'Detail kept' })).toBeInTheDocument();
    await typeValue('1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/The next time the board opens, 6 months lose/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Keep only 1 month' })).toBeInTheDocument();
  });
});

describe('RetentionCard dentro da MetricsView', () => {
  it('aparece também num período vazio (é do board, não do recorte)', () => {
    renderThemed(<MetricsView />);
    const empty = panel(R6, { months: [{ ...month('2026-09'), present: false, cardsDone: 0, runs: 0, durationMs: 0 }] });
    const msg: HostToWebview = { type: 'metrics.result', requestId: lastSent('metrics.query').requestId, result: empty };
    act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
    expect(screen.getByRole('heading', { name: 'Detalhe guardado' })).toBeInTheDocument();
  });
});
