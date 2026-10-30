// Conectar agentes › Conexão: o bloco "Uso da cota" do Claude Code (leitura fresca ou desconhecida) e o limite crítico.
import { lastSent, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentConnectSettings } from '../../src/webview/components/settings/agentConnect/AgentConnectSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { useAgentConnectStore } from '../../src/webview/store/agentConnectStore';
import { TEST_IDLE } from '../../src/shared/agentConnect';
import type { UsageReading } from '../../src/shared/quotaReading';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  useAgentConnectStore.setState({ selected: null, tab: 'connection', test: TEST_IDLE, items: [], log: [] });
});

const show = (readings: UsageReading[] = [], quotaCritical: Record<string, number> = {}) => {
  syncStore(board.router);
  const state = useBoardStore.getState().state!;
  act(() =>
    useBoardStore.setState({
      state: { ...state, usageReadings: readings, board: { ...state.board, runner: { ...state.board.runner, quotaCritical } } },
    }),
  );
  renderThemed(<AgentConnectSettings />);
};
const reading = (over: Partial<UsageReading> = {}): UsageReading => ({
  profileId: 'claude',
  readAt: Date.now() - 5 * 60_000,
  windows: [
    { window: 'five_hour', percent: 86, resetAt: Date.UTC(2026, 9, 29, 14, 30) },
    { window: 'seven_day', percent: 40, resetAt: null },
  ],
  ...over,
});
const block = () => within(screen.getByLabelText('Uso da cota'));

describe('Uso da cota no perfil do Claude Code', () => {
  it('com leitura fresca mostra uma linha por janela e há quanto tempo foi lida', () => {
    show([reading()]);
    expect(block().getByText(/^Janela de 5 h: 86% · renova /)).toBeInTheDocument();
    expect(block().getByText('Janela semanal: 40%')).toBeInTheDocument();
    expect(block().getByText('Lido há 5 min')).toBeInTheDocument();
  });

  it('sem leitura fresca diz que o uso é desconhecido, com a dica', () => {
    show([reading({ readAt: Date.now() - 31 * 60_000 })]);
    expect(block().getByText('Uso desconhecido')).toBeInTheDocument();
    expect(block().getByText('O board lê o uso no fim de cada execução; a leitura vale por 30 minutos.')).toBeInTheDocument();
    expect(block().queryByText(/Lido há/)).toBeNull();
  });

  it('perfil que não é do Claude Code não mostra o bloco', async () => {
    show([reading()]);
    await userEvent.click(screen.getByRole('button', { name: /^Gemini CLI(CLI|ACP|API) · / }));
    expect(screen.queryByLabelText('Uso da cota')).toBeNull();
  });

  it('o limite crítico grava por perfil e voltar ao padrão tira a chave', async () => {
    show([], { claude: 60, cursor: 70 });
    const field = block().getByLabelText('Limite crítico (%)');
    expect(field).toHaveValue(60);
    await userEvent.clear(field);
    await userEvent.type(field, '90');
    await userEvent.tab();
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { quotaCritical: { cursor: 70, claude: 90 } } });
    await userEvent.clear(field);
    await userEvent.type(field, '80');
    await userEvent.tab();
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { quotaCritical: { cursor: 70 } } });
  });

  it('valor vazio não grava', async () => {
    show();
    const before = sentOf('settings.board.update').length;
    const field = block().getByLabelText('Limite crítico (%)');
    await userEvent.clear(field);
    await userEvent.tab();
    expect(sentOf('settings.board.update')).toHaveLength(before);
  });
});
