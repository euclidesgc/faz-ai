import { confirmLast, lastSent, renderThemed, requestIds, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { App } from '../../src/webview/App';
import { Board } from '../../src/webview/components/Board';
import { CardDrawer } from '../../src/webview/components/CardDrawer';
import { CommentsTab } from '../../src/webview/components/card/CommentsTab';
import { SyncBar, SYNC_BAR_LINGER_MS } from '../../src/webview/components/SyncBar';
import { getInFlight } from '../../src/webview/inFlight';
import { request } from '../../src/webview/request';
import { cards } from '../../src/webview/commands';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { useBusyCards } from '../../src/webview/store/busyCards';
import { t } from '../../src/webview/i18n';

// Nenhuma ação passa em silêncio: a barra do topo acende para qualquer pedido, o card com pedido em espera
// mostra o spinner, e o botão ou o campo de onde a ação saiu mostram a espera no lugar.

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

/** Simula o `done` do pedido de índice `i` (o `confirmLast` do setup só confirma o último). */
function confirmAt(i: number, ok = true): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'done', requestId: requestIds[i]!, ok } }));
  });
}

describe('SyncBar e pedidos em voo', () => {
  it('a barra aparece com o primeiro pedido e some um instante depois do último done', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderThemed(<SyncBar />);
      expect(screen.queryByRole('progressbar')).toBeNull();
      act(() => {
        void request({ type: 'card.trash', cardId: board.storyId });
        void request({ type: 'card.archive', cardId: board.subId });
      });
      expect(getInFlight()).toBe(2);
      expect(screen.getByRole('progressbar', { name: 'Salvando no board…' })).toBeInTheDocument();
      confirmAt(0);
      // ainda há um pedido no ar: a barra fica
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      confirmAt(1);
      expect(getInFlight()).toBe(0);
      // some só depois do tempo de permanência, para dois pedidos seguidos não piscarem
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(SYNC_BAR_LINGER_MS + 1);
      });
      expect(screen.queryByRole('progressbar')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('um done com erro também libera a barra', () => {
    renderThemed(<SyncBar />);
    act(() => {
      void request({ type: 'card.trash', cardId: board.storyId });
    });
    expect(getInFlight()).toBe(1);
    confirmLast(false, 'Não deu.');
    expect(getInFlight()).toBe(0);
  });
});

describe('card ocupado', () => {
  it('mover um card marca o card como ocupado no board até o host responder (ok ou erro)', async () => {
    render(
      <Theme>
        <Board />
      </Theme>,
    );
    const article = () => screen.getByText('Login com Google').closest('article')!;
    expect(article()).not.toHaveAttribute('aria-busy');
    act(() => {
      void cards.move(board.storyId, board.router.snapshot().columns[1]!.id, 0);
    });
    expect(article()).toHaveAttribute('aria-busy', 'true');
    expect(within(article()).getByRole('status', { name: 'Salvando…' })).toBeInTheDocument();
    expect(useBusyCards.getState().counts[board.storyId]).toBe(1);
    confirmLast(false, 'Recusado.');
    await act(async () => {});
    expect(article()).not.toHaveAttribute('aria-busy');
    expect(useBusyCards.getState().counts[board.storyId]).toBeUndefined();
  });

  it('dois pedidos no mesmo card: a marca só sai quando os dois voltam', async () => {
    act(() => {
      void cards.update(board.storyId, { title: 'A' });
      void cards.setStatus(board.storyId, 'ready');
    });
    expect(useBusyCards.getState().counts[board.storyId]).toBe(2);
    confirmAt(0);
    await act(async () => {});
    expect(useBusyCards.getState().counts[board.storyId]).toBe(1);
    confirmAt(1);
    await act(async () => {});
    expect(useBusyCards.getState().counts[board.storyId]).toBeUndefined();
  });

  it('o card aberto mostra o spinner no cabeçalho enquanto espera', async () => {
    useBoardStore.getState().openCard(board.storyId);
    render(
      <Theme>
        <CardDrawer cardId={board.storyId} />
      </Theme>,
    );
    act(() => {
      void cards.update(board.storyId, { title: 'B' });
    });
    const header = screen.getByRole('button', { name: 'Fechar' }).closest('header')!;
    expect(header).toHaveAttribute('aria-busy', 'true');
    expect(within(header).getByRole('status', { name: 'Salvando…' })).toBeInTheDocument();
    confirmLast();
    await act(async () => {});
    expect(header).not.toHaveAttribute('aria-busy');
  });
});

describe('espera no botão e no campo', () => {
  it('criar card: o botão mostra a espera, o campo trava e só limpa quando o host confirma', async () => {
    render(
      <Theme>
        <Board />
      </Theme>,
    );
    await userEvent.click(screen.getAllByRole('button', { name: '+ Novo card' })[0]!);
    const input = screen.getByLabelText('Título do card');
    await userEvent.type(input, 'Nova história{Enter}');
    expect(lastSent('card.create')).toMatchObject({ title: 'Nova história' });
    expect(screen.getByRole('button', { name: 'Criar card' })).toHaveAttribute('aria-busy', 'true');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('Nova história');
    confirmLast(false, 'Não deu.');
    await act(async () => {});
    // falhou: o título fica para tentar de novo
    expect(input).toHaveValue('Nova história');
    expect(input).toBeEnabled();
    await userEvent.type(input, '{Enter}');
    confirmLast();
    await act(async () => {});
    expect(input).toHaveValue('');
  });

  it('enviar mensagem: o botão mostra a espera e o texto só sai do campo quando o host confirma', async () => {
    render(
      <Theme>
        <CommentsTab cardId={board.storyId} />
      </Theme>,
    );
    const editor = screen.getByPlaceholderText(/Escreva uma mensagem/);
    await userEvent.type(editor, 'Oi');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(lastSent('comment.add')).toEqual({ type: 'comment.add', cardId: board.storyId, body: 'Oi' });
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('aria-busy', 'true');
    expect(editor).toHaveValue('Oi');
    confirmLast();
    await act(async () => {});
    expect(editor).toHaveValue('');
    // gravada a mensagem, a IA é chamada para respondê-la, mesmo que o card esteja bloqueado
    expect(lastSent('ai.run')).toEqual({ type: 'ai.run', cardId: board.storyId, mode: 'reply' });
    expect(screen.queryByRole('button', { name: 'Enviar e trabalhar na fase' })).toBeNull();
  });

  it('com a IA trabalhando no card, o Enviar vira Parar, que pede ao host para interromper', async () => {
    board.router.handle({ type: 'card.status.set', cardId: board.storyId, status: 'running' }, { author: 'Claude Code', source: 'ai' });
    syncStore(board.router);
    render(
      <Theme>
        <CommentsTab cardId={board.storyId} />
      </Theme>,
    );
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(lastSent('ai.stop')).toEqual({ type: 'ai.stop', cardId: board.storyId });
    board.router.handle({ type: 'card.status.set', cardId: board.storyId, status: 'ready' }, { author: 'Claude Code', source: 'ai' });
  });
});

// por último: o App aplica o idioma da aparência do board, e os textos dos outros testes são em português
describe('App', () => {
  it('monta a barra do topo', () => {
    renderThemed(<App />);
    act(() => {
      void cards.trash(board.storyId);
    });
    expect(screen.getByRole('progressbar', { name: t('Salvando no board…') })).toBeInTheDocument();
  });
});
