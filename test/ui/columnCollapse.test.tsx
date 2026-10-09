import { seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Column } from '../../src/webview/components/Column';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeEach(async () => {
  board = await seedBoard();
});

const state = () => useBoardStore.getState().state!;

/** Renderiza a coluna (expandida) do primeiro workflow filho, com os cards ativos dela. */
function showChildColumn() {
  const s = state();
  const workflow = s.workflows.find((w) => w.kind === 'child')!;
  const column = s.columns.filter((c) => c.workflowId === workflow.id).sort((a, b) => a.position - b.position)[0]!;
  const cardsIn = s.cards.filter((c) => c.columnId === column.id && c.deletedAt === null && c.archivedAt === null);
  render(
    <Column
      column={column}
      workflow={workflow}
      cards={cardsIn}
      total={cardsIn.length}
      index={0}
      siblings={s.columns.filter((c) => c.workflowId === workflow.id)}
      collapsed={false}
      onToggle={() => {}}
    />,
  );
  return { column };
}

describe('Column: colapsar/expandir todos os cards', () => {
  it('coluna sem cards ativos: o item aparece desabilitado', async () => {
    const s = state();
    const workflow = s.workflows.find((w) => w.kind === 'parent')!;
    // coluna do workflow pai que não a primeira (onde está a história semeada) deve estar vazia
    const columns = s.columns.filter((c) => c.workflowId === workflow.id).sort((a, b) => a.position - b.position);
    const emptyColumn = columns[1]!;
    render(
      <Column
        column={emptyColumn}
        workflow={workflow}
        cards={[]}
        total={0}
        index={1}
        siblings={columns}
        collapsed={false}
        onToggle={() => {}}
      />,
    );
    await userEvent.click(screen.getByTitle('Ações da coluna'));
    expect(screen.getByText('Colapsar cards').closest('button')).toBeDisabled();
  });

  it('colapsar marca todos os cards ativos da coluna, e não mexe em cards de outra coluna', async () => {
    const s = state();
    const childWf = s.workflows.find((w) => w.kind === 'child')!;
    const firstCol = s.columns.filter((c) => c.workflowId === childWf.id).sort((a, b) => a.position - b.position)[0]!;
    // uma segunda sub-tarefa na mesma coluna, e uma terceira em outra coluna (controle)
    const otherCol = s.columns.filter((c) => c.workflowId === childWf.id).sort((a, b) => a.position - b.position)[1]!;
    const secondId = board.router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === childWf.id)!.id,
      columnId: firstCol.id,
      parentId: board.storyId,
      title: 'Segunda sub-tarefa',
    });
    const outsideId = board.router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === childWf.id)!.id,
      columnId: otherCol.id,
      parentId: board.storyId,
      title: 'De outra coluna',
    });
    syncStore(board.router);

    const { column } = showChildColumn();
    expect(column.id).toBe(firstCol.id);

    await userEvent.click(screen.getByTitle('Ações da coluna'));
    await userEvent.click(screen.getByText('Colapsar cards'));

    const collapsed = useBoardStore.getState().collapsed;
    expect(collapsed[`card:${board.subId}`]).toBe(true);
    expect(collapsed[`card:${secondId}`]).toBe(true);
    expect(collapsed[`card:${outsideId}`]).toBeFalsy();
  });

  it('clicar de novo com todos colapsados expande todos (rótulo vira "Expandir cards")', async () => {
    useBoardStore.getState().setManyCollapsed([board.subId], true);
    showChildColumn();

    await userEvent.click(screen.getByTitle('Ações da coluna'));
    expect(screen.getByText('Expandir cards')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Expandir cards'));

    expect(useBoardStore.getState().collapsed[`card:${board.subId}`]).toBe(false);
  });
});
