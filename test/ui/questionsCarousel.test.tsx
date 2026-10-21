import { posted, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { CardDrawer } from '../../src/webview/components/CardDrawer';
import { QuestionsCarousel } from '../../src/webview/components/card/QuestionsCarousel';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState, Card, CardQuestion } from '../../src/shared/model';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const QUESTIONS: CardQuestion[] = [
  { id: 'q1', question: 'Qual banco usar?', options: ['SQLite', 'Postgres'], recommended: 'SQLite' },
  { id: 'q2', question: 'Migrar agora?', options: ['Sim', 'Não'], recommended: 'Não' },
  { id: 'q3', question: 'Qual prazo?', options: ['Esta semana', 'Mês que vem'], recommended: 'Esta semana' },
];

function patchCard(id: string, patch: Partial<Card>) {
  const s = useBoardStore.getState().state as BoardState;
  useBoardStore.setState({ state: { ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) } });
}

/** Abre o drawer da história com as perguntas pendentes, como o App faz. */
function openWithQuestions(questions: CardQuestion[] = QUESTIONS, patch: Partial<Card> = {}) {
  patchCard(board.storyId, { questions, ...patch });
  useBoardStore.getState().openCard(board.storyId);
  return render(
    <Theme>
      <CardDrawer cardId={board.storyId} />
    </Theme>,
  );
}

/** O componente sozinho, para afirmar o que ele chama antes do envio. */
function renderCarousel(onBeforeSend: () => void) {
  patchCard(board.storyId, { questions: QUESTIONS });
  const card = useBoardStore.getState().state!.cards.find((c) => c.id === board.storyId)!;
  return renderThemed(<QuestionsCarousel card={card} onBeforeSend={onBeforeSend} />);
}

const click = (name: string | RegExp) => userEvent.click(screen.getByRole('button', { name }));

describe('QuestionsCarousel', () => {
  it('com perguntas, aparece no card aberto logo abaixo da descrição', () => {
    const { container } = openWithQuestions();
    const section = container.querySelector('section.questions')!;
    expect(section).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Qual banco usar?' })).toBeInTheDocument();
    const description = screen.getByRole('heading', { name: 'Descrição' }).closest('section')!;
    expect(description.nextElementSibling).toBe(section);
  });

  it('sem perguntas, na lixeira ou arquivado, não aparece', () => {
    const none = openWithQuestions([]);
    expect(none.container.querySelector('section.questions')).toBeNull();
    none.unmount();

    const trashed = openWithQuestions(QUESTIONS, { deletedAt: 1 });
    expect(trashed.container.querySelector('section.questions')).toBeNull();
    trashed.unmount();

    const archived = openWithQuestions(QUESTIONS, { deletedAt: null, archivedAt: 1 });
    expect(archived.container.querySelector('section.questions')).toBeNull();
  });

  it('o cabeçalho mostra "1 de 3" e a opção indicada leva o badge "Indicada"', () => {
    openWithQuestions();
    expect(screen.getByRole('heading', { name: /Perguntas da IA/ })).toHaveTextContent('1 de 3');
    expect(screen.getByRole('button', { name: /SQLite/ })).toHaveTextContent('Indicada');
    expect(screen.getByRole('button', { name: /Postgres/ })).not.toHaveTextContent('Indicada');
  });

  it('clicar numa opção avança; Anterior volta e mostra a escolha marcada', async () => {
    openWithQuestions();
    await click(/Postgres/);
    expect(screen.getByRole('heading', { name: /Perguntas da IA/ })).toHaveTextContent('2 de 3');
    expect(screen.getByRole('heading', { name: 'Migrar agora?' })).toBeInTheDocument();

    await click('Anterior');
    expect(screen.getByRole('heading', { name: 'Qual banco usar?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Postgres/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /SQLite/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a resposta personalizada substitui a opção e chega com custom: true', async () => {
    openWithQuestions();
    await click(/Postgres/);
    await click('Anterior');
    await userEvent.type(screen.getByRole('textbox', { name: 'Ou escreva a sua resposta' }), 'Um arquivo JSON{Enter}');
    // Enter avança; a escolha anterior deixou de estar marcada
    expect(screen.getByRole('heading', { name: 'Migrar agora?' })).toBeInTheDocument();
    await click('Anterior');
    expect(screen.getByRole('button', { name: /Postgres/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('textbox', { name: 'Ou escreva a sua resposta' })).toHaveValue('Um arquivo JSON');

    await click('Próxima');
    await click('Próxima');
    await click('Próxima');
    await click('Enviar respostas');
    expect(sentOf('card.questions.answer').at(-1)!.answers).toEqual([{ questionId: 'q1', text: 'Um arquivo JSON', custom: true }]);
  });

  it('o resumo lista "não respondida" para a pergunta pulada e avisa das perguntas sem resposta', async () => {
    openWithQuestions();
    await click(/SQLite/);
    await click('Próxima'); // pula a segunda
    await click(/Esta semana/);

    expect(screen.getByRole('heading', { name: 'Confira e envie' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Perguntas da IA/ })).toHaveTextContent('3 de 3');
    const skipped = screen.getByRole('button', { name: /Migrar agora\?/ });
    expect(skipped).toHaveTextContent('não respondida');
    expect(screen.getByRole('button', { name: /Qual banco usar\?/ })).toHaveTextContent('SQLite');
    expect(screen.getByRole('status')).toHaveTextContent('1 pergunta sem resposta');
  });

  it('Enviar respostas manda card.questions.answer só com as respondidas', async () => {
    openWithQuestions();
    await click(/SQLite/);
    await click('Próxima');
    await click(/Mês que vem/);
    await click('Enviar respostas');
    expect(sentOf('card.questions.answer')).toEqual([
      {
        type: 'card.questions.answer',
        cardId: board.storyId,
        answers: [
          { questionId: 'q1', text: 'SQLite', custom: false },
          { questionId: 'q3', text: 'Mês que vem', custom: false },
        ],
      },
    ]);
  });

  it('chama onBeforeSend antes de enviar as respostas', async () => {
    const order: string[] = [];
    posted.mockImplementation((m) => void order.push(m.type));
    const onBeforeSend = vi.fn(() => void order.push('onBeforeSend'));
    renderCarousel(onBeforeSend);
    await click(/SQLite/);
    await click('Próxima');
    await click('Próxima');
    await click('Enviar respostas');
    expect(onBeforeSend).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['onBeforeSend', 'card.questions.answer']);
    posted.mockReset();
  });

  it('com a descrição em edição e alterada, card.update sai antes de card.questions.answer', async () => {
    const order: string[] = [];
    posted.mockImplementation((m) => void order.push(m.type));
    openWithQuestions();
    await click('Editar');
    await userEvent.type(screen.getByPlaceholderText(/Descreva o problema/), ' com ajuste');
    await click(/SQLite/);
    await click('Próxima');
    await click('Próxima');
    await click('Enviar respostas');
    const update = order.indexOf('card.update');
    const answer = order.indexOf('card.questions.answer');
    expect(update).toBeGreaterThanOrEqual(0);
    expect(answer).toBeGreaterThan(update);
    expect(sentOf('card.update').at(-1)!.patch.description).toContain('com ajuste');
    posted.mockReset();
  });

  it('um conjunto novo de perguntas recomeça o carrossel', async () => {
    openWithQuestions();
    await click(/SQLite/);
    expect(screen.getByRole('heading', { name: 'Migrar agora?' })).toBeInTheDocument();
    act(() => patchCard(board.storyId, { questions: [{ id: 'n1', question: 'Outra?', options: ['A', 'B'], recommended: 'A' }] }));
    expect(screen.getByRole('heading', { name: 'Outra?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Perguntas da IA/ })).toHaveTextContent('1 de 1');
  });
});
