import { choose, confirmLast, lastSent, sentOf, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Column } from '../../src/webview/components/Column';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { Card, Column as ColumnModel, Workflow } from '../../src/shared/model';

let board: SeededBoard;
beforeEach(async () => {
  board = await seedBoard();
  // afterEach (setup.tsx) não limpa selectedIds: cada board novo recomeça sem seleção.
  useBoardStore.getState().clearSelected();
});

const state = () => useBoardStore.getState().state!;

const parentWorkflow = (): Workflow => state().workflows.find((w) => w.kind === 'parent')!;
const childWorkflow = (): Workflow => state().workflows.find((w) => w.kind === 'child')!;
const columnsOf = (workflowId: string): ColumnModel[] =>
  state()
    .columns.filter((c) => c.workflowId === workflowId)
    .sort((a, b) => a.position - b.position);
const liveCardsIn = (columnId: string): Card[] =>
  state().cards.filter((c) => c.columnId === columnId && c.deletedAt === null && c.archivedAt === null);

/** Renderiza a coluna (expandida) com os cards vivos dela, mais o `Dialog` para as confirmações. */
function renderColumn(column: ColumnModel, workflow: Workflow, siblings: ColumnModel[], visible?: Card[]) {
  const live = liveCardsIn(column.id);
  render(
    <Theme>
      <Column
        column={column}
        workflow={workflow}
        cards={visible ?? live}
        total={live.length}
        index={siblings.findIndex((c) => c.id === column.id)}
        siblings={siblings}
        collapsed={false}
        onToggle={() => {}}
      />
      <Dialog />
    </Theme>,
  );
}

/** Cria uma segunda história na mesma coluna do fixture e marca as duas (via `selectMany`). */
function selectTwoInSameColumn(): { wf: Workflow; cols: ColumnModel[]; col0: ColumnModel; secondId: string } {
  const wf = parentWorkflow();
  const cols = columnsOf(wf.id);
  const col0 = cols[0]!;
  const typeId = state().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
  const secondId = board.router.createCard({ typeId, columnId: col0.id, parentId: null, title: 'Segunda história do lote' });
  syncStore(board.router);
  act(() => {
    useBoardStore.getState().selectMany([board.storyId, secondId]);
  });
  return { wf, cols, col0, secondId };
}

const openMenu = () => userEvent.click(screen.getByTitle('Ações da coluna'));

describe('Column: "Selecionar todos" (RF1, RF4, RF5)', () => {
  it('RF1: aparece no menu de uma coluna do workflow de Histórias', async () => {
    const wf = parentWorkflow();
    const cols = columnsOf(wf.id);
    renderColumn(cols[0]!, wf, cols);
    await openMenu();
    expect(screen.getByText('Selecionar todos')).toBeInTheDocument();
  });

  it('RF5: não aparece no menu de uma coluna do workflow de Sub-tarefas', async () => {
    const wf = childWorkflow();
    const cols = columnsOf(wf.id);
    renderColumn(cols[0]!, wf, cols);
    await openMenu();
    expect(screen.queryByText('Selecionar todos')).toBeNull();
  });

  it('RF4: coluna sem cards vivos deixa o item desabilitado', async () => {
    const wf = parentWorkflow();
    const cols = columnsOf(wf.id);
    const empty = cols[1]!; // a história do fixture está só na primeira coluna
    renderColumn(empty, wf, cols);
    await openMenu();
    expect(screen.getByText('Selecionar todos').closest('button')).toBeDisabled();
  });

  it('RF4: coluna com cards vivos, mas todos escondidos pelo filtro, também desabilita o item', async () => {
    const wf = parentWorkflow();
    const cols = columnsOf(wf.id);
    const col0 = cols[0]!; // tem a história do fixture viva, mas o filtro (simulado) escondeu tudo
    renderColumn(col0, wf, cols, []);
    await openMenu();
    expect(screen.getByText('Selecionar todos').closest('button')).toBeDisabled();
  });
});

describe('Column: caixa de selecionar todos no cabeçalho', () => {
  it('marca todas as histórias visíveis da coluna; marcada de novo, limpa a seleção; parcial fica indeterminada', async () => {
    const { wf, cols, col0, secondId } = selectTwoInSameColumn();
    useBoardStore.getState().clearSelected();
    renderColumn(col0, wf, cols);
    const box = screen.getByRole('checkbox', { name: `Selecionar todos de ${col0.name}` }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await userEvent.click(box);
    expect(useBoardStore.getState().selectedIds).toEqual(new Set([board.storyId, secondId]));
    expect(screen.getByRole('checkbox', { name: `Desmarcar todos de ${col0.name}` })).toBeChecked();

    act(() => useBoardStore.getState().toggleSelected(secondId));
    const partial = screen.getByRole('checkbox', { name: `Selecionar todos de ${col0.name}` }) as HTMLInputElement;
    expect(partial.indeterminate).toBe(true);

    await userEvent.click(partial);
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
    await userEvent.click(screen.getByRole('checkbox', { name: `Desmarcar todos de ${col0.name}` }));
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
  });

  it('não existe numa coluna de sub-tarefas nem numa coluna sem cards visíveis', () => {
    const wf = childWorkflow();
    const cols = columnsOf(wf.id);
    renderColumn(cols[0]!, wf, cols);
    expect(screen.queryByRole('checkbox', { name: /Selecionar todos de/ })).toBeNull();
  });
});

describe('Column: "Selecionar todos" marca só os ids certos (RF2, RF3)', () => {
  it('RF2: marca só os cards visíveis da coluna, não os escondidos por um filtro ativo', async () => {
    const wf = parentWorkflow();
    const cols = columnsOf(wf.id);
    const col0 = cols[0]!;
    const typeId = state().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
    const hiddenId = board.router.createCard({ typeId, columnId: col0.id, parentId: null, title: 'Escondida pelo filtro' });
    syncStore(board.router);
    const visible = liveCardsIn(col0.id).filter((c) => c.id !== hiddenId);

    renderColumn(col0, wf, cols, visible);
    await openMenu();
    await userEvent.click(screen.getByText('Selecionar todos'));

    const selected = useBoardStore.getState().selectedIds;
    expect(selected.has(board.storyId)).toBe(true);
    expect(selected.has(hiddenId)).toBe(false);
    expect(selected.size).toBe(1);
  });

  it('RF3: marcar um card de outra coluna substitui a seleção da coluna anterior', async () => {
    const wf = parentWorkflow();
    const cols = columnsOf(wf.id);
    const col0 = cols[0]!;
    const col1 = cols[1]!;
    const typeId = state().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
    const secondId = board.router.createCard({ typeId, columnId: col1.id, parentId: null, title: 'Segunda história' });
    syncStore(board.router);

    render(
      <Theme>
        <Column
          column={col0}
          workflow={wf}
          cards={liveCardsIn(col0.id)}
          total={liveCardsIn(col0.id).length}
          index={0}
          siblings={cols}
          collapsed={false}
          onToggle={() => {}}
        />
        <Column
          column={col1}
          workflow={wf}
          cards={liveCardsIn(col1.id)}
          total={liveCardsIn(col1.id).length}
          index={1}
          siblings={cols}
          collapsed={false}
          onToggle={() => {}}
        />
      </Theme>,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Login com Google' }));
    expect(useBoardStore.getState().selectedIds.has(board.storyId)).toBe(true);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Segunda história' }));
    const selected = useBoardStore.getState().selectedIds;
    expect(selected.has(secondId)).toBe(true);
    expect(selected.has(board.storyId)).toBe(false);
    expect(selected.size).toBe(1);
  });
});

describe('Column: menu com seleção ativa (RF6, RF7)', () => {
  it('RF6: com 1+ marcados nesta coluna, o menu mostra as 5 ações em lote', async () => {
    const { wf, cols, col0 } = selectTwoInSameColumn();
    renderColumn(col0, wf, cols);
    await openMenu();
    for (const label of [
      'Limpar seleção',
      'Arquivar selecionados',
      'Mover selecionados para...',
      'Concluir selecionados',
      'Mandar selecionados para a lixeira',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('RF7: com a seleção ativa, os itens de gestão da coluna ficam desabilitados', async () => {
    const wf = parentWorkflow();
    const cols = columnsOf(wf.id);
    // coluna do meio (nem a primeira, nem a última): isola o motivo do desabilitado (seleção, não posição)
    const target = cols[2]!;
    const typeId = state().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
    const id = board.router.createCard({ typeId, columnId: target.id, parentId: null, title: 'Alvo da seleção' });
    syncStore(board.router);
    act(() => {
      useBoardStore.getState().selectMany([id]);
    });

    renderColumn(target, wf, cols);
    await openMenu();

    expect(screen.getByText('Renomear').closest('button')).toBeDisabled();
    expect(screen.getByText('Colapsar').closest('button')).toBeDisabled();
    expect(screen.getByText('Trabalho em aberto').closest('button')).toBeDisabled();
    expect(screen.getByText('Conclusão').closest('button')).toBeDisabled();
    expect(screen.getByText('Cancelamento').closest('button')).toBeDisabled();
    expect(screen.getByText('Mover para a esquerda').closest('button')).toBeDisabled();
    expect(screen.getByText('Mover para a direita').closest('button')).toBeDisabled();
    expect(screen.getByText('Excluir coluna').closest('button')).toBeDisabled();
  });

  it('"Limpar seleção" esvazia a seleção', async () => {
    const { wf, cols, col0 } = selectTwoInSameColumn();
    renderColumn(col0, wf, cols);
    await openMenu();
    await userEvent.click(screen.getByText('Limpar seleção'));
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
  });
});

describe('Column: ações em lote (RF8-RF11)', () => {
  it('"Arquivar selecionados": confirmar envia card.archiveMany com todos os ids e limpa a seleção', async () => {
    const { wf, cols, col0, secondId } = selectTwoInSameColumn();
    renderColumn(col0, wf, cols);
    await openMenu();
    await userEvent.click(screen.getByText('Arquivar selecionados'));
    expect(sentOf('card.archiveMany')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Arquivar' }));

    const sent = lastSent('card.archiveMany');
    expect(sent.cardIds.slice().sort()).toEqual([board.storyId, secondId].sort());
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
  });

  it('"Mandar selecionados para a lixeira": confirmar envia card.trashMany com todos os ids e limpa a seleção', async () => {
    const { wf, cols, col0, secondId } = selectTwoInSameColumn();
    renderColumn(col0, wf, cols);
    await openMenu();
    await userEvent.click(screen.getByText('Mandar selecionados para a lixeira'));
    expect(sentOf('card.trashMany')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    const sent = lastSent('card.trashMany');
    expect(sent.cardIds.slice().sort()).toEqual([board.storyId, secondId].sort());
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
  });

  it('"Mover selecionados para...": o diálogo tem o seletor de coluna; confirmar envia card.moveMany e limpa a seleção', async () => {
    const { wf, cols, col0, secondId } = selectTwoInSameColumn();
    const destination = cols[2]!;
    renderColumn(col0, wf, cols);
    await openMenu();
    await userEvent.click(screen.getByText('Mover selecionados para...'));
    expect(sentOf('card.moveMany')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    await choose(within(dialog).getByRole('combobox', { name: 'Coluna' }), destination.name);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));

    const sent = lastSent('card.moveMany');
    expect(sent.cardIds.slice().sort()).toEqual([board.storyId, secondId].sort());
    expect(sent.columnId).toBe(destination.id);
    // a seleção só limpa quando o host confirma o lote; até lá a barra mostra o status
    expect(useBoardStore.getState().bulkBusy).toBe('Movendo 2 história(s)…');
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
    confirmLast();
    await act(async () => {});
    expect(useBoardStore.getState().bulkBusy).toBeNull();
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
  });

  it('"Concluir selecionados": confirmar envia card.moveMany para a coluna de conclusão e limpa a seleção', async () => {
    const { wf, cols, col0, secondId } = selectTwoInSameColumn();
    const doneColumn = cols.find((c) => c.category === 'done')!;
    renderColumn(col0, wf, cols);
    await openMenu();
    await userEvent.click(screen.getByText('Concluir selecionados'));
    expect(sentOf('card.moveMany')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));

    const sent = lastSent('card.moveMany');
    expect(sent.cardIds.slice().sort()).toEqual([board.storyId, secondId].sort());
    expect(sent.columnId).toBe(doneColumn.id);
    confirmLast();
    await act(async () => {});
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
  });

  it('RF10: "Concluir selecionados" fica desabilitado se o workflow não tiver coluna de conclusão', async () => {
    const { wf, cols, col0 } = selectTwoInSameColumn();
    const siblingsWithoutDone = cols.filter((c) => c.category !== 'done');
    renderColumn(col0, wf, siblingsWithoutDone);
    await openMenu();
    expect(screen.getByText('Concluir selecionados').closest('button')).toBeDisabled();
  });

  it('"Mover selecionados para..." fica desabilitado sem outra coluna de destino', async () => {
    const { wf, col0 } = selectTwoInSameColumn();
    renderColumn(col0, wf, [col0]); // única coluna do workflow neste cenário
    await openMenu();
    expect(screen.getByText('Mover selecionados para...').closest('button')).toBeDisabled();
  });

  it('o lote leva só o que está marcado e visível: marcado escondido depois por um filtro fica de fora', async () => {
    const { wf, cols, col0, secondId } = selectTwoInSameColumn();
    const visible = liveCardsIn(col0.id).filter((c) => c.id !== secondId); // o filtro passou a esconder a 2ª
    renderColumn(col0, wf, cols, visible);
    await openMenu();
    await userEvent.click(screen.getByText('Arquivar selecionados'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Arquivar 1 história(s)?' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Arquivar' }));

    expect(lastSent('card.archiveMany').cardIds).toEqual([board.storyId]);
  });

  it('o diálogo de mover avisa que quem as regras do board impedirem fica de fora', async () => {
    const { wf, cols, col0 } = selectTwoInSameColumn();
    renderColumn(col0, wf, cols);
    await openMenu();
    await userEvent.click(screen.getByText('Mover selecionados para...'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/fica de fora/)).toBeInTheDocument();
  });

  it('RF11: cancelar a confirmação não envia nada e mantém a seleção', async () => {
    const { wf, cols, col0 } = selectTwoInSameColumn();
    renderColumn(col0, wf, cols);
    await openMenu();
    await userEvent.click(screen.getByText('Arquivar selecionados'));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(sentOf('card.archiveMany')).toEqual([]);
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
  });
});
