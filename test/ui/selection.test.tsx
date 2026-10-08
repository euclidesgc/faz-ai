import { seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Board } from '../../src/webview/components/Board';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  syncStore(board.router);
  useBoardStore.getState().clearSelected();
});

const renderBoard = () =>
  render(
    <Theme>
      <Board />
    </Theme>,
  );

describe('seleção múltipla de cards no board', () => {
  it('marcar a caixa de uma história adiciona o id a selectedIds', async () => {
    renderBoard();
    const box = screen.getByRole('checkbox', { name: 'Selecionar Login com Google' });
    expect(useBoardStore.getState().selectedIds.has(board.storyId)).toBe(false);
    await userEvent.click(box);
    expect(useBoardStore.getState().selectedIds.has(board.storyId)).toBe(true);
  });

  it('marcar duas histórias deixa as duas no conjunto; desmarcar uma tira só ela', async () => {
    const s = board.router.snapshot();
    const parentWf = s.workflows.find((w) => w.kind === 'parent')!;
    const typeId = s.cardTypes.find((t) => t.defaultWorkflowId === parentWf.id)!.id;
    const columnId = s.columns.find((c) => c.workflowId === parentWf.id)!.id;
    const secondId = board.router.createCard({ typeId, columnId, parentId: null, title: 'Outra história' });
    syncStore(board.router);

    renderBoard();
    const box = screen.getByRole('checkbox', { name: 'Selecionar Login com Google' });
    const secondBox = screen.getByRole('checkbox', { name: 'Selecionar Outra história' });
    await userEvent.click(box);
    await userEvent.click(secondBox);

    expect(useBoardStore.getState().selectedIds.has(board.storyId)).toBe(true);
    expect(useBoardStore.getState().selectedIds.has(secondId)).toBe(true);

    await userEvent.click(box);
    expect(useBoardStore.getState().selectedIds.has(board.storyId)).toBe(false);
    expect(useBoardStore.getState().selectedIds.has(secondId)).toBe(true);
  });

  it('clicar na caixa de marcação não chama selectParent nem openCard', async () => {
    renderBoard();
    const box = screen.getByRole('checkbox', { name: 'Selecionar Login com Google' });
    await userEvent.click(box);
    expect(useBoardStore.getState().selectedParentId).toBeNull();
    expect(useBoardStore.getState().openCardId).toBeNull();
  });

  it('a caixa de marcação não existe numa sub-tarefa', () => {
    renderBoard();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Tarefa' })).toBeNull();
  });
});
