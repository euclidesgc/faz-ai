import { seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardView } from '../../src/webview/components/Card';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState, Card } from '../../src/shared/model';
import { readableOn } from '../../src/shared/color';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const state = () => useBoardStore.getState().state!;
const cardOf = (id: string) => state().cards.find((c) => c.id === id)!;

function patchState(patch: (s: BoardState) => Partial<BoardState>) {
  useBoardStore.setState({ state: { ...state(), ...patch(state()) } });
}
const patchCard = (id: string, patch: Partial<Card>) =>
  patchState((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

/** Renderiza o card como está na store agora. */
const show = (id: string) => render(<CardView card={cardOf(id)} />);

describe('CardView', () => {
  it('a barra tem o ID e o tipo, na cor do tipo com texto legível', () => {
    const { container } = show(board.subId);
    const type = state().cardTypes.find((t) => t.id === cardOf(board.subId).typeId)!;
    const bar = container.querySelector<HTMLElement>('.card-bar')!;
    expect(bar).toHaveTextContent(`#${cardOf(board.subId).number}`);
    expect(bar).toHaveTextContent(type.name);
    expect(bar).toHaveStyle({ background: type.color, color: readableOn(type.color) });
  });

  it('o título fica numa linha e mostra o texto inteiro no tooltip', () => {
    patchCard(board.subId, { title: 'Um título bem comprido que não cabe na largura do card' });
    show(board.subId);
    expect(screen.getByText('Um título bem comprido que não cabe na largura do card')).toHaveAttribute(
      'title',
      'Um título bem comprido que não cabe na largura do card',
    );
  });

  it('pendência com você: ícone de pessoa, rótulo, há quanto tempo e a borda na cor do status', () => {
    patchCard(board.subId, { status: 'waiting_review', statusAt: Date.now() - 5 * 60_000 });
    const { container } = show(board.subId);
    const badge = container.querySelector('.status-badge')!;
    expect(badge).toHaveTextContent('Pendência com você: Aguardando revisão');
    expect(badge.querySelector('.lucide-user')).not.toBeNull();
    expect(screen.getByText('há 5 min')).toBeInTheDocument();
    const article = container.querySelector('article')!;
    expect(article).toHaveClass('mine');
    expect(article.style.getPropertyValue('--status-color')).toBe(state().board.appearance.statuses.waiting_review.color);
  });

  it('pendência com a IA: ícone de robô e sem destaque', () => {
    patchCard(board.subId, { status: 'ready', statusAt: Date.now() });
    const { container } = show(board.subId);
    expect(container.querySelector('.status-badge')).toHaveTextContent('Pendência com a IA: Pronto');
    expect(container.querySelector('.status-badge .lucide-bot')).not.toBeNull();
    expect(container.querySelector('article')).not.toHaveClass('mine');
  });

  it('bloqueado mostra o motivo no tooltip do status', () => {
    patchCard(board.subId, { status: 'blocked', statusReason: 'Falta a chave da API', statusAt: Date.now() });
    const { container } = show(board.subId);
    expect(container.querySelector('.status-badge')!.getAttribute('title')).toContain('Falta a chave da API');
  });

  /** O LED do card renderizado: sempre existe; `on` diz se está aceso. */
  const ledOf = (container: HTMLElement) => {
    const led = container.querySelector('.ai-led')!;
    return { on: led.classList.contains('on'), label: led.getAttribute('aria-label') };
  };

  it('o LED está sempre no card: apagado quando a IA não trabalha, aceso quando trabalha (extensão ou "Em execução")', () => {
    const idle = show(board.subId);
    expect(ledOf(idle.container)).toEqual({ on: false, label: 'IA parada neste card' });
    idle.unmount();

    patchState(() => ({ aiRuns: [board.subId] }));
    const running = show(board.subId);
    expect(ledOf(running.container)).toEqual({ on: true, label: 'IA trabalhando neste card' });
    running.unmount();

    patchState(() => ({ aiRuns: [] }));
    patchCard(board.subId, { status: 'running', statusAt: Date.now() });
    const byStatus = show(board.subId);
    expect(ledOf(byStatus.container).on).toBe(true);
    byStatus.unmount();

    // terminou: o LED continua no card, só apagado
    patchCard(board.subId, { status: 'waiting_review', statusAt: Date.now() });
    expect(ledOf(show(board.subId).container)).toEqual({ on: false, label: 'IA parada neste card' });
  });

  it('a história acende o LED quando a IA trabalha numa sub-tarefa dela, e diz quantas', () => {
    const story = show(board.storyId);
    expect(ledOf(story.container).on).toBe(false);
    story.unmount();
    patchState(() => ({ aiRuns: [board.subId] }));
    const lit = show(board.storyId);
    expect(ledOf(lit.container)).toEqual({ on: true, label: 'IA trabalhando em 1 sub-tarefa deste card' });
    lit.unmount();
    // e quando é nela mesma, vale a mensagem do próprio card
    patchState(() => ({ aiRuns: [board.storyId, board.subId] }));
    expect(ledOf(show(board.storyId).container).label).toBe('IA trabalhando neste card');
  });

  it('card arquivado não mostra status e o LED fica apagado', () => {
    patchCard(board.subId, { status: 'running', statusAt: Date.now(), archivedAt: Date.now() });
    const { container } = show(board.subId);
    expect(container.querySelector('.status-badge')).toBeNull();
    expect(ledOf(container).on).toBe(false);
  });

  it('o modelo aparece numa linha própria, com o esforço em português depois do nome', () => {
    const modelo = state().fieldDefs.find((f) => f.name === 'Modelo')!;
    board.router.handle({ type: 'field.setValue', cardId: board.subId, fieldId: modelo.id, value: 'claude:sonnet@low' });
    syncStore(board.router);
    const { container } = show(board.subId);
    expect(container.querySelector('.card-model')).toHaveTextContent('Sonnet 5.5 - baixo');
    expect(container.querySelector('.card-fields')?.textContent ?? '').not.toContain('Sonnet');
  });

  it('branch e PR do card aparecem no rodapé', () => {
    patchCard(board.storyId, { branch: 'feat/login', prUrl: 'https://example.com/pr/7' });
    show(board.storyId);
    expect(screen.getByTitle('Branch: feat/login')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pull request' })).toHaveAttribute('href', 'https://example.com/pr/7');
  });

  it('o botão de abrir abre o card e o menu de ações continua na barra', async () => {
    show(board.subId);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o card' }));
    expect(useBoardStore.getState().openCardId).toBe(board.subId);
    await userEvent.click(screen.getByRole('button', { name: 'Ações do card' }));
    expect(screen.getByRole('button', { name: 'Mover para a lixeira' })).toBeInTheDocument();
  });
});
