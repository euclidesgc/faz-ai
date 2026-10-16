import { seedBoard, syncStore, type SeededBoard } from './setup';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Board } from '../../src/webview/components/Board';
import { UsageLimitBanner } from '../../src/webview/components/UsageLimitBanner';
import { setLocale, translateBoardNotice } from '../../src/webview/i18n';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState, Card } from '../../src/shared/model';
import type { UsageLimitState } from '../../src/shared/usageLimit';

// A pausa por limite de uso na tela (história #800): a faixa do topo (RF11), a etiqueta no card (RF12) e as mensagens
// do runner na conversa em inglês.

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));
afterEach(() => setLocale('pt-BR'));

const patchState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};
const patchCard = (id: string, patch: Partial<Card>) =>
  patchState((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
const pause = (over: Partial<UsageLimitState> = {}) =>
  patchState(() => ({
    usageLimit: { tool: 'claude', resumeAt: Date.now() + 30 * 60_000, source: 'reset', attempts: 0, probe: null, ...over },
  }));

describe('faixa da pausa por limite de uso no topo do board', () => {
  it('mostra a ferramenta e o horário enquanto a pausa vale (RF11)', () => {
    pause();
    render(<UsageLimitBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Limite de uso do Claude Code: a fila retoma às \d{2}:\d{2}\.$/);
  });

  it('sem horário na saída, diz que é uma nova tentativa', () => {
    pause({ source: 'backoff', attempts: 1 });
    render(<UsageLimitBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/nova tentativa às/);
  });

  it('some sem pausa, com a pausa vencida e com a pausa de outra ferramenta', () => {
    const { rerender, container } = render(<UsageLimitBanner />);
    expect(container).toBeEmptyDOMElement();
    pause({ resumeAt: Date.now() - 60_000 });
    rerender(<UsageLimitBanner />);
    expect(container).toBeEmptyDOMElement();
    pause({ tool: 'cursor' });
    rerender(<UsageLimitBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('etiqueta no card que espera o limite', () => {
  it('aparece no card pronto para a IA e não no card com a pessoa (RF12)', () => {
    patchCard(board.subId, { status: 'waiting_answer' });
    patchCard(board.storyId, { status: 'ready' });
    pause();
    const { rerender, unmount } = render(<Board />);
    expect(screen.getByText(/^Aguardando o limite de uso até/)).toBeInTheDocument();

    patchCard(board.storyId, { status: 'waiting_review' });
    rerender(<Board />);
    expect(screen.queryByText(/^Aguardando o limite de uso até/)).toBeNull();
    unmount();
  });
});

describe('mensagens do limite na conversa, em inglês', () => {
  it('traduz as três mensagens do runner', () => {
    setLocale('en');
    expect(
      translateBoardNotice(
        'O limite de uso do plano do Claude Code esgotou. O card voltou para a IA, e o autopiloto repete a execução a partir das 13:53.',
      ),
    ).toBe("The Claude Code plan's usage limit ran out. The card went back to the AI, and the autopilot repeats the run from 13:53.");
    expect(
      translateBoardNotice(
        'O limite de uso do plano do Kimi Code esgotou. O card voltou para a IA, e o heartbeat repete a execução a partir das 17/10 01:53.',
      ),
    ).toBe("The Kimi Code plan's usage limit ran out. The card went back to the AI, and the heartbeat repeats the run from 17/10 01:53.");
    expect(
      translateBoardNotice(
        'O limite de uso do plano do Cursor esgotou. O card voltou para a IA: chame a IA de novo a partir das 14:05 (o heartbeat está desligado).',
      ),
    ).toBe("The Cursor plan's usage limit ran out. The card went back to the AI: call the AI again from 14:05 (the heartbeat is off).");
  });

  it('não traduz frase fora dos avisos do board', () => {
    setLocale('en');
    expect(translateBoardNotice('Próxima rodada às 13:53')).toBe('Próxima rodada às 13:53');
  });
});
