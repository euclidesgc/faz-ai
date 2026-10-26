import { seedBoard, syncStore, type SeededBoard } from './setup';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageLimitBanner } from '../../src/webview/components/UsageLimitBanner';
import { setLocale } from '../../src/webview/i18n';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { UsageLimitState } from '../../src/shared/usageLimit';

// A pausa por limite de uso na tela (história #1047): uma linha por perfil de CLI na faixa do topo.

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));
afterEach(() => setLocale('pt-BR'));

const pause = (...list: Partial<UsageLimitState>[]) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: {
      ...s,
      usageLimit: list.map((over) => ({
        profileId: 'claude',
        resumeAt: Date.now() + 30 * 60_000,
        source: 'reset',
        attempts: 0,
        probe: null,
        ...over,
      })),
    },
  });
};

describe('faixa da pausa por limite de uso no topo do board', () => {
  it('mostra o perfil e o horário enquanto a pausa vale', () => {
    // relógio fixo no meio do dia: perto da meia-noite a retomada cai no dia seguinte e a faixa mostra a data
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 25, 10, 0));
    try {
      pause({});
      render(<UsageLimitBanner />);
      expect(screen.getByRole('status')).toHaveTextContent(/^Limite de uso do .+: a fila dele retoma às \d{2}:\d{2}\.$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem horário na saída, diz que é uma nova tentativa', () => {
    pause({ source: 'backoff', attempts: 1 });
    render(<UsageLimitBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/nova tentativa às/);
  });

  it('uma linha por perfil pausado, em inglês quando a interface é inglês', () => {
    const second = useBoardStore.getState().state!.board.aiProfiles.find((p) => p.id !== 'claude');
    if (!second) return;
    setLocale('en');
    pause({}, { profileId: second.id });
    render(<UsageLimitBanner />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/^Usage limit for .+: its queue resumes at /);
  });

  it('some sem pausa, com a pausa vencida e com perfil que não existe mais', () => {
    const { rerender, container } = render(<UsageLimitBanner />);
    pause();
    rerender(<UsageLimitBanner />);
    pause({ resumeAt: Date.now() - 60_000 });
    rerender(<UsageLimitBanner />);
    expect(container).toBeEmptyDOMElement();
    pause({ profileId: 'perfil-removido' });
    rerender(<UsageLimitBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
