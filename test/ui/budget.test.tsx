import { confirmLast, lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { BudgetSettings } from '../../src/webview/components/settings/BudgetSettings';
import { UsageTab } from '../../src/webview/components/card/UsageTab';
import type { CardUsage } from '../../src/shared/cardUsage';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const show = () =>
  render(
    <Theme>
      <BudgetSettings />
    </Theme>,
  );

describe('BudgetSettings', () => {
  it('o interruptor envia a configuração inteira com o teto ligado', async () => {
    show();
    const before = useBoardStore.getState().state!.budget.config;
    await userEvent.click(screen.getByRole('switch', { name: 'Limitar o consumo por história' }));
    expect(lastSent('budget.config.set')).toEqual({ type: 'budget.config.set', config: { ...before, enabled: !before.enabled } });
  });

  it('o teto de um esforço e o aviso em % são gravados ao sair do campo', async () => {
    show();
    const field = screen.getByLabelText('Teto para esforço Alto');
    await userEvent.clear(field);
    await userEvent.type(field, '1234');
    await userEvent.tab();
    const sent = lastSent('budget.config.set') as { config: { byEffort: { Alto: number } } };
    expect(sent.config.byEffort.Alto).toBe(1234);
  });
});

describe('BudgetSettings: erro do host', () => {
  it('mostra o erro recusado pelo host na seção', async () => {
    show();
    await userEvent.click(screen.getByRole('switch', { name: 'Limitar o consumo por história' }));
    confirmLast(false, 'Política de teto desconhecida.');
    expect(await screen.findByRole('alert')).toHaveTextContent('Política de teto desconhecida.');
  });
});

const usageOf = (total: number): CardUsage => {
  const row = { phase: '', runs: 1, open: 0, measuredRuns: 1, durationMs: 1000, costedRuns: 0, cost: null };
  return {
    phases: [{ ...row, phase: 'Discovery', tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total } }],
    subtasks: null,
    total: { ...row, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total } },
    archivedUntil: '',
  };
};

describe('BudgetBar na aba Consumo', () => {
  const open = (total: number) => {
    const state = useBoardStore.getState().state!;
    const card = state.cards.find((c) => c.id === board.storyId)!;
    posted.mockClear();
    render(
      <Theme>
        <UsageTab card={card} />
      </Theme>,
    );
    const q = sentOf('card.usage.query').at(-1) as unknown as { requestId: string };
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'card.usage.result', requestId: q.requestId, usage: usageOf(total) } }),
      );
    });
  };
  const configure = (ceiling: number) => {
    const { config } = useBoardStore.getState().state!.budget;
    board.router.handle({
      type: 'budget.config.set',
      config: { ...config, enabled: true, byEffort: { Baixo: ceiling, Médio: ceiling, Alto: ceiling } },
    });
    syncStore(board.router);
  };

  it('mostra gasto/teto e % iguais ao Total da tabela', async () => {
    configure(1000);
    open(500);
    expect(await screen.findByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('o aviso da estimativa aparece com gasto + estimativa acima do teto e some abaixo', async () => {
    configure(1000);
    open(10);
    await screen.findByRole('progressbar');
    expect(screen.getByRole('status')).toHaveTextContent('só o contexto de entrada');
    cleanup();
    configure(100_000_000);
    open(10);
    await screen.findByRole('progressbar');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('"Sem teto" envia off e "Voltar ao padrão" envia null', async () => {
    configure(1000);
    open(10);
    await userEvent.click(await screen.findByRole('button', { name: 'Sem teto' }));
    expect(lastSent('budget.card.set')).toEqual({ type: 'budget.card.set', cardId: board.storyId, ceiling: 'off' });
    board.router.handle({ type: 'budget.card.set', cardId: board.storyId, ceiling: 500 });
    syncStore(board.router);
    cleanup();
    open(10);
    await userEvent.click(await screen.findByRole('button', { name: 'Voltar ao padrão' }));
    expect(lastSent('budget.card.set')).toEqual({ type: 'budget.card.set', cardId: board.storyId, ceiling: null });
  });
});
