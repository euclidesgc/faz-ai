import { lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import userEvent from '@testing-library/user-event';
import { AutopilotButton } from '../../src/webview/components/AutopilotButton';
import { CardDrawer } from '../../src/webview/components/CardDrawer';
import { Dialog } from '../../src/webview/components/Dialog';
import { Board } from '../../src/webview/components/Board';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { Autopilot, BoardState, Card } from '../../src/shared/model';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  syncStore(board.router);
  posted.mockClear();
});

const patchState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};
const patchCard = (id: string, patch: Partial<Card>) =>
  patchState((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
const autopilot = (value: Autopilot) => patchState(() => ({ autopilot: value }));
const openDrawer = (id: string) => {
  useBoardStore.getState().openCard(id);
  return render(
    <Theme>
      <CardDrawer cardId={id} />
      <Dialog />
    </Theme>,
  );
};

describe('modo autônomo no painel do card', () => {
  it('ligar pede confirmação, explicando o que o modo faz, e só então envia card.yolo.set', async () => {
    openDrawer(board.storyId);
    const toggle = screen.getByRole('checkbox', { name: /Modo autônomo/ });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(sentOf('card.yolo.set')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/do Backlog ao pull request/)).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Não avisar novamente' })).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar o modo autônomo' }));
    expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: true });
  });

  it('"Não avisar novamente" marcado: liga desta vez e as próximas ligam sem perguntar (#416)', async () => {
    try {
      const first = openDrawer(board.storyId);
      await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Não avisar novamente' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar o modo autônomo' }));
      expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: true });
      expect(useBoardStore.getState().dontWarnYolo).toBe(true);
      first.unmount();

      openDrawer(board.storyId);
      await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
      expect(useBoardStore.getState().dialog).toBeNull();
      expect(sentOf('card.yolo.set')).toHaveLength(2);
    } finally {
      useBoardStore.getState().setDontWarnYolo(false);
    }
  });

  it('depois de confirmar, a caixa já aparece marcada e travada até o boardState confirmar', async () => {
    openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ligar o modo autônomo' }));
    const toggle = screen.getByRole('checkbox', { name: /Modo autônomo/ });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();

    act(() => patchCard(board.storyId, { yolo: true }));
    expect(screen.getByRole('checkbox', { name: /Modo autônomo/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Modo autônomo/ })).toBeEnabled();
  });

  it('cancelar a confirmação não liga nada', async () => {
    openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(sentOf('card.yolo.set')).toEqual([]);
  });

  it('desligar é direto, sem confirmação', async () => {
    patchCard(board.storyId, { yolo: true });
    openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: false });
  });

  it('com o modo ligado mostra o andamento do autopiloto e permite pausar e retomar', async () => {
    patchCard(board.storyId, { yolo: true });
    autopilot({ active: true, note: null });
    openDrawer(board.storyId);
    expect(screen.getByText('O modo autônomo está tocando a fila.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pausar modo autônomo' }));
    expect(lastSent('ai.autopilot.pause')).toEqual({ type: 'ai.autopilot.pause' });

    act(() => autopilot({ active: false, note: '#1 está bloqueado: Sem acesso' }));
    expect(screen.getByText('#1 está bloqueado: Sem acesso')).toBeInTheDocument();

    // a nota sobre OUTRA história não entra inteira no card: só uma linha que aponta para ela
    act(() => autopilot({ active: false, note: '#298 está bloqueado: Entrega já concluída e verificada 6x nesta coluna...' }));
    expect(screen.queryByText(/Entrega já concluída/)).toBeNull();
    expect(screen.getByText('A fila está parada em #298: veja a barra de atividade.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retomar modo autônomo' }));
    expect(lastSent('ai.autopilot.resume')).toEqual({ type: 'ai.autopilot.resume' });
  });

  it('a sub-tarefa só informa que herda o modo da história; sem o modo, não mostra nada', () => {
    const { unmount } = openDrawer(board.subId);
    expect(screen.queryByRole('checkbox', { name: /Modo autônomo/ })).toBeNull();
    expect(screen.queryByText(/Modo autônomo, da história/)).toBeNull();
    unmount();

    patchCard(board.storyId, { yolo: true });
    openDrawer(board.subId);
    expect(screen.getByText(/Modo autônomo, da história #/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Modo autônomo/ })).toBeNull();
  });
});

describe('selo no card do board', () => {
  it('a história em modo autônomo ganha o selo, que é também o botão de desligar (#416)', () => {
    patchCard(board.storyId, { yolo: true });
    render(<Board />);
    const marks = screen.getAllByRole('button', { name: 'Desligar modo autônomo' });
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]).toHaveClass('yolo-mark', 'on');
  });
});

describe('botão do autopiloto no topo', () => {
  it('não aparece sem história em modo autônomo na fila', () => {
    render(<AutopilotButton />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tocando: um clique pausa; pausado: um clique retoma', async () => {
    patchCard(board.storyId, { yolo: true });
    autopilot({ active: true, note: null });
    const { rerender } = render(<AutopilotButton />);
    const button = screen.getByRole('button', { name: /modo autônomo/ });
    expect(button).not.toHaveAttribute('aria-pressed');
    await userEvent.click(button);
    expect(lastSent('ai.autopilot.pause')).toBeTruthy();

    act(() => autopilot({ active: false, note: null }));
    rerender(<AutopilotButton />);
    expect(screen.getByRole('button', { name: 'Retomar modo autônomo' })).not.toHaveAttribute('aria-pressed');
    await userEvent.click(screen.getByRole('button', { name: 'Retomar modo autônomo' }));
    expect(lastSent('ai.autopilot.resume')).toBeTruthy();
  });
});
