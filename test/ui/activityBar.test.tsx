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

  it('com várias execuções: lista "ref what" separados por · e todos os botões abrem o card certo', async () => {
    useBoardStore.setState({
      state: boardState({
        cards: [
          card('c1', { number: 12, title: 'Discovery do board' }),
          card('c2', { number: 15, title: 'Refinando algo' }),
          card('c3', { number: 20, title: 'Implementação da barra' }),
        ],
        aiActivity: [
          activity(),
          { ...activity(), cardId: 'c2', runId: 'r2', mode: 'refine', phase: '' },
          { ...activity(), cardId: 'c3', runId: 'r3', phase: 'Implementação' },
        ],
      }),
    });
    renderThemed(<ActivityBar offline={false} />);
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('Discovery');
    expect(bar.textContent).toContain('refinando');
    expect(bar.textContent).toContain('Implementação');
    expect(bar.textContent).toContain(' · ');
    expect(screen.getByRole('button', { name: 'Abrir o card #12' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir o card #15' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir o card #20' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o card #15' }));
    expect(useBoardStore.getState().openCardId).toBe('c2');
  });

  it('o "há N min" fica fora da região viva: só a referência e a fase são anunciadas', () => {
    useBoardStore.setState({
      state: boardState({ cards: [card('c1', { number: 12, title: 'Discovery do board' })], aiActivity: [activity()] }),
    });
    const { container } = renderThemed(<ActivityBar offline={false} />);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live.textContent).toContain('#12');
    expect(live.textContent).toContain('Discovery');
    expect(live.textContent).not.toMatch(/há \d+ h/);
    expect(container.querySelector('.activity-bar')!.textContent).toMatch(/há \d+ h/);
    expect(container.querySelector('.activity-bar')).not.toHaveAttribute('aria-live');
  });

  it('a nota do autopiloto fica numa linha e o texto inteiro vai para o tooltip', () => {
    const note = 'Fila parada: #3 precisa de revisão antes de seguir para a próxima fase';
    useBoardStore.setState({ state: boardState({ autopilot: { active: false, note } }) });
    const { container } = renderThemed(<ActivityBar offline={false} />);
    expect(screen.getByRole('status').textContent).toBe(note);
    expect(container.querySelector('.activity-bar')).toHaveAttribute('title', note);
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
