import { lastSent, posted, seedBoard, sentOf, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Board } from '../../src/webview/components/Board';
import { CardDrawer } from '../../src/webview/components/CardDrawer';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

/** Abre o drawer da história como o App faz: `openCardId` na store e o componente com o id. */
function openStory() {
  useBoardStore.getState().openCard(board.storyId);
  render(<CardDrawer cardId={board.storyId} />);
}

describe('CardDrawer', () => {
  it('editar o título e sair do campo envia card.update', async () => {
    openStory();
    const title = screen.getByDisplayValue('Login com Google');
    await userEvent.clear(title);
    await userEvent.type(title, 'Login revisado');
    await userEvent.tab();
    expect(lastSent('card.update')).toEqual({ type: 'card.update', cardId: board.storyId, patch: { title: 'Login revisado' } });
  });

  it('Enter no título confirma do mesmo jeito', async () => {
    openStory();
    await userEvent.type(screen.getByDisplayValue('Login com Google'), ' 2{Enter}');
    expect(lastSent('card.update').patch).toEqual({ title: 'Login com Google 2' });
  });

  it('sair do título sem mudar nada não envia', async () => {
    openStory();
    await userEvent.click(screen.getByDisplayValue('Login com Google'));
    await userEvent.tab();
    expect(sentOf('card.update')).toHaveLength(0);
  });

  it('Enter no campo de checklist adiciona o item e limpa o campo', async () => {
    openStory();
    const input = screen.getByPlaceholderText('+ Novo item (Enter)');
    await userEvent.type(input, 'Escrever testes{Enter}');
    expect(lastSent('checklist.add')).toEqual({ type: 'checklist.add', cardId: board.storyId, text: 'Escrever testes' });
    expect(input).toHaveValue('');
  });

  it('marcar um item do checklist envia checklist.update com done', async () => {
    openStory();
    const item = board.router.snapshot().checklistItems.find((i) => i.cardId === board.storyId)!;
    await userEvent.click(screen.getByRole('checkbox'));
    expect(lastSent('checklist.update')).toEqual({ type: 'checklist.update', itemId: item.id, patch: { done: true } });
  });

  it('Enter em "+ Nova sub-tarefa" cria um card filho na primeira coluna de baixo', async () => {
    openStory();
    const s = board.router.snapshot();
    const childWf = s.workflows.find((w) => w.kind === 'child')!;
    await userEvent.type(screen.getByPlaceholderText('+ Nova sub-tarefa (Enter)'), 'Tarefa nova{Enter}');
    expect(lastSent('card.create')).toMatchObject({
      parentId: board.storyId,
      title: 'Tarefa nova',
      columnId: s.columns.find((c) => c.workflowId === childWf.id)!.id,
    });
  });

  it('o botão de fechar e a tecla Escape fecham o card sem enviar nada', async () => {
    openStory();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(useBoardStore.getState().openCardId).toBeNull();
    useBoardStore.getState().openCard(board.storyId);
    await userEvent.keyboard('{Escape}');
    expect(useBoardStore.getState().openCardId).toBeNull();
    expect(posted).not.toHaveBeenCalled();
  });
});

describe('Board / Column', () => {
  it('"+ Novo card" abre o formulário e Enter cria o card na coluna', async () => {
    render(<Board />);
    const s = board.router.snapshot();
    const parentWf = s.workflows.find((w) => w.kind === 'parent')!;
    const firstCol = s.columns.filter((c) => c.workflowId === parentWf.id).sort((a, b) => a.position - b.position)[0]!;
    // o primeiro botão é o da primeira coluna da linha de cima
    await userEvent.click(screen.getAllByRole('button', { name: '+ Novo card' })[0]!);
    await userEvent.type(screen.getByPlaceholderText('Título (Enter adiciona)'), 'Nova história{Enter}');
    expect(lastSent('card.create')).toMatchObject({ columnId: firstCol.id, parentId: null, title: 'Nova história' });
  });

  it('sem história selecionada, "+ Nova sub-tarefa" fica desligado', () => {
    render(<Board />);
    for (const b of screen.getAllByRole('button', { name: '+ Nova sub-tarefa' })) expect(b).toBeDisabled();
  });

  it('clicar no cabeçalho da linha colapsa a linha e compartilha com o host', async () => {
    render(<Board />);
    const parentWf = board.router.snapshot().workflows.find((w) => w.kind === 'parent')!;
    await userEvent.click(screen.getByRole('heading', { name: parentWf.name }));
    expect(useBoardStore.getState().collapsed[parentWf.id]).toBe(true);
    expect(lastSent('view.set').patch.collapsed).toEqual({ [parentWf.id]: true });
  });
});
