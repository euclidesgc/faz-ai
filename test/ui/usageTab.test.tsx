import { lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Theme } from '@radix-ui/themes';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDrawer } from '../../src/webview/components/CardDrawer';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { CardUsage, CardUsageRow } from '../../src/shared/cardUsage';
import type { HostToWebview } from '../../src/shared/messages';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  syncStore(board.router);
  posted.mockClear();
});

/** Abre o card no drawer, como o App faz, e vai para a aba Consumo. */
async function openUsage(id: string) {
  useBoardStore.getState().openCard(id);
  render(
    <Theme>
      <CardDrawer cardId={id} />
    </Theme>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Consumo' }));
}

/** O host respondendo ao último pedido de consumo. */
function reply(usage: CardUsage) {
  const { requestId } = lastSent('card.usage.query');
  const msg: HostToWebview = { type: 'card.usage.result', requestId, usage };
  act(() => window.dispatchEvent(new MessageEvent('message', { data: msg })));
}

const row = (phase: string, over: Partial<CardUsageRow> = {}): CardUsageRow => ({
  phase,
  runs: 1,
  open: 0,
  measuredRuns: 1,
  durationMs: 60_000,
  tokens: { input: 1000, output: 2000, cacheRead: 30_000, cacheWrite: 4000, total: 37_000 },
  costedRuns: 0,
  cost: null,
  ...over,
});

describe('aba Consumo do card', () => {
  it('pede o consumo ao host e mostra a estimativa da próxima execução junto', async () => {
    await openUsage(board.storyId);
    expect(lastSent('card.usage.query').cardId).toBe(board.storyId);
    expect(screen.getByRole('heading', { name: 'Próxima execução' })).toBeInTheDocument();
    expect(screen.getByText('Contexto estimado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gasto até agora' })).toBeInTheDocument();
  });

  it('mostra o gasto por fase, as sub-tarefas e o total; a fase sem medição fica "não medido"', async () => {
    await openUsage(board.storyId);
    reply({
      phases: [row('Discovery'), row('PRD', { runs: 2, measuredRuns: 0, tokens: null })],
      subtasks: row(''),
      total: row('', {
        runs: 4,
        measuredRuns: 2,
        tokens: { input: 2000, output: 4000, cacheRead: 60_000, cacheWrite: 8000, total: 74_000 },
      }),
      archivedUntil: '',
    });
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows.map((r) => within(r).queryByRole('rowheader')?.textContent ?? null)).toEqual([
      null,
      'Discovery',
      'PRD',
      'Sub-tarefas',
      'Total',
    ]);
    expect(rows[1]).toHaveTextContent('37 mil');
    expect(within(rows[2]!).getAllByText('não medido')).toHaveLength(5);
    expect(rows[4]).toHaveTextContent('74 mil');
    expect(screen.getByText(/Só cresce: apagar mensagens ou desmarcar itens muda as próximas execuções/)).toBeInTheDocument();
  });

  it('avisa das execuções em andamento e do detalhe que passou da retenção', async () => {
    await openUsage(board.storyId);
    reply({ phases: [row('Discovery', { open: 1 })], subtasks: null, total: row('', { open: 1 }), archivedUntil: '2025-12' });
    expect(screen.getByText('Uma execução em andamento: o consumo dela entra quando terminar.')).toBeInTheDocument();
    expect(screen.getByText(/As execuções até .*2025 ficaram só nos totais mensais do board/)).toBeInTheDocument();
  });

  it('card sem execução diz que não há; na sub-tarefa explica que o consumo fica na história', async () => {
    const empty: CardUsage = {
      phases: [],
      subtasks: null,
      total: row('', { runs: 0, measuredRuns: 0, durationMs: 0, tokens: null }),
      archivedUntil: '',
    };
    await openUsage(board.subId);
    reply(empty);
    expect(screen.getByText(/As sub-tarefas rodam dentro da sessão da história/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('consulta de novo quando uma execução do card começa ou termina', async () => {
    await openUsage(board.storyId);
    expect(sentOf('card.usage.query')).toHaveLength(1);
    const s = useBoardStore.getState().state!;
    act(() => useBoardStore.setState({ state: { ...s, aiRuns: [board.storyId] } }));
    expect(sentOf('card.usage.query')).toHaveLength(2);
    act(() => useBoardStore.setState({ state: { ...s, aiRuns: [] } }));
    expect(sentOf('card.usage.query')).toHaveLength(3);
  });

  describe('coluna Custo', () => {
    const buckets = { input: 0.1, output: 0.2, cacheRead: 0.05, cacheWrite: null };
    const costed = (cost: CardUsageRow['cost'], over: Partial<CardUsageRow> = {}) => row('', { costedRuns: 1, cost, ...over });
    const show = (phases: CardUsageRow[], total: CardUsageRow) => reply({ phases, subtasks: null, total, archivedUntil: '' });
    const setShowCost = (showCost: boolean) => {
      const s = useBoardStore.getState().state!;
      act(() => useBoardStore.setState({ state: { ...s, board: { ...s.board, rules: { ...s.board.rules, showCost } } } }));
    };

    it('custo informado: valor e dica com os buckets e o aviso da ferramenta', async () => {
      setShowCost(true);
      await openUsage(board.storyId);
      const c = costed({ totalUsd: 1.5, estimatedUsd: 0, buckets });
      show([{ ...c, phase: 'Discovery' }], c);
      const table = screen.getByRole('table');
      expect(within(table).getByRole('columnheader', { name: 'Custo' })).toBeInTheDocument();
      const cell = within(table)
        .getAllByText(/US\$\s?1,50/)[0]!
        .closest('td')!;
      expect(cell.title).toContain('Entrada: ');
      expect(cell.title).toContain('Escrita de cache: —');
      expect(cell.title).toContain('o informado pela ferramenta');
      expect(cell).not.toHaveTextContent('estimado');
    });

    it('custo estimado: marca estimado, sem aviso da ferramenta na dica', async () => {
      setShowCost(true);
      await openUsage(board.storyId);
      const c = costed({ totalUsd: 0.4, estimatedUsd: 0.4, buckets });
      show([{ ...c, phase: 'PRD' }], c);
      expect(screen.getAllByText('estimado por tabela de preços').length).toBeGreaterThan(0);
      const cell = screen.getAllByText(/US\$\s?0,40/)[0]!.closest('td')!;
      expect(cell.title).not.toContain('informado pela ferramenta');
    });

    it('custo parcial avisa quantas execuções ele cobre; linha sem custo mostra "—"', async () => {
      setShowCost(true);
      await openUsage(board.storyId);
      const c = costed({ totalUsd: 1, estimatedUsd: 0, buckets }, { runs: 3 });
      show([{ ...c, phase: 'Spec' }, row('Plan')], c);
      expect(screen.getAllByText('cobre 1 de 3 execuções').length).toBeGreaterThan(0);
      const plan = screen.getByRole('rowheader', { name: 'Plan' }).closest('tr')!;
      expect(plan).toHaveTextContent('—');
    });

    it('com a regra desligada a coluna não existe', async () => {
      setShowCost(false);
      await openUsage(board.storyId);
      const c = costed({ totalUsd: 1.5, estimatedUsd: 0, buckets });
      show([{ ...c, phase: 'Discovery' }], c);
      expect(screen.queryByRole('columnheader', { name: 'Custo' })).toBeNull();
      expect(screen.getByRole('table')).not.toHaveTextContent('US$');
    });
  });
});
