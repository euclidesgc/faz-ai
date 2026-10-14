import { confirmLast, lastSent, posted, renderThemed, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/webview/App';
import { OVERLAY_DELAY_MS } from '../../src/webview/components/BusyOverlay';
import { useBoardStore, withOverlay } from '../../src/webview/store/boardStore';
import { TrashView } from '../../src/webview/components/TrashView';
import { Dialog } from '../../src/webview/components/Dialog';
import { t } from '../../src/webview/i18n';

// O véu de espera cobre o board enquanto uma ação que troca o estado inteiro roda, e sai no `done` do host.

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

describe('BusyOverlay', () => {
  it('withOverlay põe o véu com o texto, marca o app como ocupado e tira o véu no done (ok ou erro)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      syncStore(board.router);
      renderThemed(<App />);
      let done: Promise<void>;
      act(() => {
        done = withOverlay('Recriando o board…', () => Promise.resolve());
      });
      // termina antes do atraso: o véu nem chega a aparecer
      await act(async () => {
        await done!;
      });
      expect(screen.queryByText('Recriando o board…')).not.toBeInTheDocument();

      const { request } = await import('../../src/webview/request');
      act(() => {
        done = withOverlay('Recriando o board…', () => request({ type: 'settings.board.reset' }));
      });
      act(() => {
        vi.advanceTimersByTime(OVERLAY_DELAY_MS + 1);
      });
      expect(screen.getByText('Recriando o board…')).toBeInTheDocument();
      expect(screen.getByText(t('Isso leva alguns segundos.'))).toBeInTheDocument();
      expect(document.querySelector('.app')).toHaveAttribute('aria-busy', 'true');
      expect(lastSent('settings.board.reset')).toEqual({ type: 'settings.board.reset' });

      confirmLast(false, 'Não deu.');
      await act(async () => {
        await done!;
      });
      expect(screen.queryByText('Recriando o board…')).not.toBeInTheDocument();
      expect(document.querySelector('.app')).not.toHaveAttribute('aria-busy');
    } finally {
      vi.useRealTimers();
    }
  });

  it('esvaziar a lixeira passa pelo véu', async () => {
    const s = board.router.snapshot();
    const card = s.cards[0]!;
    board.router.handle({ type: 'card.trash', cardId: card.id });
    syncStore(board.router);
    renderThemed(
      <>
        <TrashView />
        <Dialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: t('Esvaziar lixeira') }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: t('Esvaziar lixeira') }));
    expect(posted).toHaveBeenCalledWith({ type: 'trash.empty' });
    expect(useBoardStore.getState().busyOverlay).toEqual({ label: t('Esvaziando a lixeira…') });
    confirmLast();
    await act(async () => {});
    expect(useBoardStore.getState().busyOverlay).toBeNull();
  });
});
