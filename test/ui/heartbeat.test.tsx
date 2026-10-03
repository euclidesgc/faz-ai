import { lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeartbeatButton } from '../../src/webview/components/HeartbeatButton';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { DEFAULT_RUNNER, heartbeatState } from '../../src/shared/runner';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

/** Deixa o board com o heartbeat ligado ou desligado e, opcionalmente, a ferramenta sem como rodar. */
const setup = (heartbeat: boolean, unsupported: string | null = null) => {
  board.router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat, heartbeatMinutes: 30 } } });
  syncStore(board.router);
  useBoardStore.setState({ state: { ...useBoardStore.getState().state!, aiRunUnsupported: unsupported } });
  posted.mockClear();
};
const heart = () => screen.getByRole('button', { name: /Heartbeat/ });

describe('heartbeatState', () => {
  const on = { ...DEFAULT_RUNNER, heartbeat: true };
  it('desligado vale mesmo sem ligação; ligado bate quando consegue rodar', () => {
    expect(heartbeatState(DEFAULT_RUNNER, { offline: true, unsupported: 'x' })).toEqual({ kind: 'off' });
    expect(heartbeatState(on, { offline: false, unsupported: null })).toEqual({ kind: 'beating' });
  });
  it('ligado mas sem ligação ou sem ferramenta executável fica parado, com o motivo', () => {
    expect(heartbeatState(on, { offline: true, unsupported: null })).toEqual({ kind: 'stopped', reason: 'Sem ligação com o Faz AI.' });
    expect(heartbeatState(on, { offline: false, unsupported: 'A ferramenta não está instalada.' })).toEqual({
      kind: 'stopped',
      reason: 'A ferramenta não está instalada.',
    });
  });
});

describe('HeartbeatButton', () => {
  it('ligado: o coração bate (classe beating), o tooltip diz o intervalo e o clique desliga', async () => {
    setup(true);
    render(<HeartbeatButton offline={false} />);
    expect(heart()).toHaveClass('beating');
    expect(heart()).toHaveAttribute('aria-pressed', 'true');
    expect(heart()).toHaveAttribute('title', expect.stringContaining('a cada 30 min'));
    await userEvent.click(heart());
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { heartbeat: false } });
  });

  it('desligado: o coração fica cinza e parado e o clique liga o heartbeat', async () => {
    setup(false);
    render(<HeartbeatButton offline={false} />);
    expect(heart()).toHaveClass('off');
    expect(heart()).not.toHaveClass('beating');
    expect(heart()).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(heart());
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { heartbeat: true } });
  });

  it('ligado mas sem ligação com o board: parado, com o motivo, e o clique não envia nada', async () => {
    setup(true);
    render(<HeartbeatButton offline />);
    expect(heart()).toHaveClass('stopped');
    expect(heart()).toHaveAttribute('aria-disabled', 'true');
    expect(heart()).toHaveAttribute('title', expect.stringContaining('Sem ligação com o Faz AI.'));
    await userEvent.click(heart());
    expect(sentOf('settings.board.update')).toHaveLength(0);
  });

  it('ligado mas com a ferramenta sem como rodar: parado e mostra o motivo da ferramenta', async () => {
    setup(true, 'O Claude Code não está instalado.');
    render(<HeartbeatButton offline={false} />);
    expect(heart()).toHaveClass('stopped');
    expect(heart()).toHaveAttribute('title', expect.stringContaining('O Claude Code não está instalado.'));
    await userEvent.click(heart());
    expect(sentOf('settings.board.update')).toHaveLength(0);
  });
});
