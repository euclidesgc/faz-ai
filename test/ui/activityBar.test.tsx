import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../../src/webview/i18n';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { ActivityBar } from '../../src/webview/components/ActivityBar';
import { App } from '../../src/webview/App';
import { boardState, card } from '../fakes/board';
import { renderThemed } from './setup';

// card 338: ActivityBar (React), a parte visual da barra de status. SPEC da #239, "Estratégia de testes", item 3.

afterEach(() => setLocale('pt-BR'));

const NOW = 1_700_000_000_000;

const activity = () => ({
  cardId: 'c1' as const,
  runId: 'r1',
  mode: 'phase' as const,
  origin: 'manual' as const,
  phase: 'Discovery',
  model: null,
  startedAt: NOW,
});

describe('ActivityBar', () => {
  it('sem execução: role status com o texto idle', () => {
    useBoardStore.setState({ state: boardState() });
    renderThemed(<ActivityBar offline={false} />);
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('Heartbeat desligado');
  });

  it('com uma execução: mostra a referência do card, clicável', async () => {
    useBoardStore.setState({
      state: boardState({ cards: [card('c1', { number: 12, title: 'Discovery do board' })], aiActivity: [activity()] }),
    });
    renderThemed(<ActivityBar offline={false} />);
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('#12');
    const ref = screen.getByRole('button', { name: 'Abrir o card #12' });
    await userEvent.click(ref);
    expect(useBoardStore.getState().openCardId).toBe('c1');
  });

  it('Enter no botão focado também abre o card', async () => {
    useBoardStore.setState({
      state: boardState({ cards: [card('c1', { number: 12, title: 'Discovery do board' })], aiActivity: [activity()] }),
    });
    renderThemed(<ActivityBar offline={false} />);
    const ref = screen.getByRole('button', { name: 'Abrir o card #12' });
    ref.focus();
    await userEvent.keyboard('{Enter}');
    expect(useBoardStore.getState().openCardId).toBe('c1');
  });

  it('locale en: nenhum texto em português', () => {
    setLocale('en');
    useBoardStore.setState({
      state: boardState({ cards: [card('c1', { number: 12, title: 'Discovery do board' })], aiActivity: [activity()] }),
    });
    renderThemed(<ActivityBar offline={false} />);
    const bar = screen.getByRole('status');
    expect(bar.textContent).not.toMatch(/IA em|agora/);
    expect(bar.textContent).toContain('AI on');
  });

  it('App não mostra mais "IA trabalhando em" no topo', () => {
    useBoardStore.setState({
      state: boardState({ cards: [card('c1', { number: 12, title: 'Discovery do board' })], aiActivity: [activity()] }),
    });
    renderThemed(<App />);
    expect(screen.queryByText(/IA trabalhando em/)).toBeNull();
    expect(screen.getAllByRole('status').some((n) => n.textContent?.includes('#12'))).toBe(true);
  });
});
