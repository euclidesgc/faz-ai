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
    expect(within(dialog).getByText(/Sem restrições/)).toBeInTheDocument();
    expect(within(dialog).getByText(/não faz o merge/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar o modo autônomo' }));
    expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: true });
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
    expect(screen.getByText('O autopiloto está tocando a fila.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(lastSent('ai.autopilot.pause')).toEqual({ type: 'ai.autopilot.pause' });

    act(() => autopilot({ active: false, note: '#1 está bloqueado: Sem acesso' }));
    expect(screen.getByText('#1 está bloqueado: Sem acesso')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retomar' }));
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
  it('a história em modo autônomo ganha o selo', () => {
    patchCard(board.storyId, { yolo: true });
    render(<Board />);
    expect(screen.getAllByTitle(/Modo autônomo \(YOLO\)/).length).toBeGreaterThan(0);
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
    const button = screen.getByRole('button', { name: /Autônomo/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(lastSent('ai.autopilot.pause')).toBeTruthy();

    act(() => autopilot({ active: false, note: null }));
    rerender(<AutopilotButton />);
    expect(screen.getByRole('button', { name: /Autônomo pausado/ })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: /Autônomo pausado/ }));
    expect(lastSent('ai.autopilot.resume')).toBeTruthy();
  });
});
