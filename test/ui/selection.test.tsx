import { lastSent, sentOf, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Board } from '../../src/webview/components/Board';
import { SelectionBar } from '../../src/webview/components/SelectionBar';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState, Card } from '../../src/shared/model';

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

const renderBoardWithSelectionBar = () =>
  render(
    <Theme>
      <Board />
      <SelectionBar />
      <Dialog />
    </Theme>,
  );

const patchState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};
const patchCard = (id: string, fields: Partial<Card>) =>
  patchState((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...fields } : c)) }));

let extraStoryCount = 0;

/** cria uma história a mais, com título único (para não colidir com a de outro teste: o roteador é o mesmo do arquivo todo). */
const createExtraStory = (): { id: string; title: string } => {
  const title = `Outra história ${++extraStoryCount}`;
  const s = board.router.snapshot();
  const parentWf = s.workflows.find((w) => w.kind === 'parent')!;
  const typeId = s.cardTypes.find((t) => t.defaultWorkflowId === parentWf.id)!.id;
  const columnId = s.columns.find((c) => c.workflowId === parentWf.id)!.id;
  let id = '';
  act(() => {
    id = board.router.createCard({ typeId, columnId, parentId: null, title });
    syncStore(board.router);
  });
  return { id, title };
};

/** cria uma segunda história e marca as duas (a do fixture e esta), devolvendo os dois ids. */
const selectTwoStories = async (): Promise<[string, string]> => {
  const { id: secondId, title } = createExtraStory();
  renderBoardWithSelectionBar();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Login com Google' }));
  await userEvent.click(screen.getByRole('checkbox', { name: `Selecionar ${title}` }));
  return [board.storyId, secondId];
};

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

describe('barra de seleção e ação em lote (card 326)', () => {
  it('aparece só com 2 ou mais marcadas, com a contagem; desmarcar até sobrar 1 esconde a barra', async () => {
    renderBoardWithSelectionBar();
    expect(screen.queryByText('2 selecionados')).toBeNull();

    const box = screen.getByRole('checkbox', { name: 'Selecionar Login com Google' });
    await userEvent.click(box);
    expect(screen.queryByText(/selecionados/)).toBeNull();

    const { title } = createExtraStory();
    const secondBox = screen.getByRole('checkbox', { name: `Selecionar ${title}` });
    await userEvent.click(secondBox);
    expect(screen.getByText('2 selecionados')).toBeInTheDocument();

    await userEvent.click(box);
    expect(screen.queryByText(/selecionados/)).toBeNull();
  });

  it('o botão "Limpar" esvazia a seleção e some a barra', async () => {
    await selectTwoStories();
    expect(screen.getByText('2 selecionados')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
    expect(screen.queryByText(/selecionados/)).toBeNull();
  });

  it('sem nenhuma selecionada em modo autônomo, confirmar liga nas duas e limpa a seleção', async () => {
    const [firstId, secondId] = await selectTwoStories();

    await userEvent.click(screen.getByRole('button', { name: 'Ligar modo autônomo' }));
    expect(sentOf('card.yolo.setMany')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ligar o modo autônomo em 2 história(s)?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar modo autônomo' }));

    const sent = lastSent('card.yolo.setMany');
    expect(sent.enabled).toBe(true);
    expect(sent.cardIds.sort()).toEqual([firstId, secondId].sort());
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
  });

  it('com as duas já em modo autônomo, o botão oferece desligar, e confirmar envia enabled: false', async () => {
    const [firstId, secondId] = await selectTwoStories();
    act(() => {
      patchCard(firstId, { yolo: true });
      patchCard(secondId, { yolo: true });
    });

    expect(screen.getByRole('button', { name: 'Desligar modo autônomo' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Desligar modo autônomo' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Desligar o modo autônomo em 2 história(s)?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desligar modo autônomo' }));

    const sent = lastSent('card.yolo.setMany');
    expect(sent.enabled).toBe(false);
    expect(sent.cardIds.sort()).toEqual([firstId, secondId].sort());
  });

  it('cancelar a confirmação não envia nada e mantém a seleção', async () => {
    await selectTwoStories();
    await userEvent.click(screen.getByRole('button', { name: 'Ligar modo autônomo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(sentOf('card.yolo.setMany')).toEqual([]);
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
  });
});

describe('colapsar/expandir selecionados (card 349)', () => {
  it('nenhum colapsado: botão oferece "Colapsar selecionados"; clicar colapsa só os selecionados, sem fechar a barra', async () => {
    const [firstId, secondId] = await selectTwoStories();
    const thirdId = createExtraStory().id;

    expect(screen.getByRole('button', { name: 'Colapsar selecionados' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Colapsar selecionados' }));

    const collapsed = useBoardStore.getState().collapsed;
    expect(collapsed[`card:${firstId}`]).toBe(true);
    expect(collapsed[`card:${secondId}`]).toBe(true);
    expect(collapsed[`card:${thirdId}`]).toBeUndefined();

    // a seleção continua ativa: a barra não fecha
    expect(screen.getByText('2 selecionados')).toBeInTheDocument();
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
  });

  it('com todos já colapsados, o botão oferece "Expandir selecionados", e clicar expande os dois', async () => {
    const [firstId, secondId] = await selectTwoStories();
    act(() => {
      useBoardStore.getState().setManyCollapsed([firstId, secondId], true);
    });

    expect(screen.getByRole('button', { name: 'Expandir selecionados' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expandir selecionados' }));

    const collapsed = useBoardStore.getState().collapsed;
    expect(collapsed[`card:${firstId}`]).toBe(false);
    expect(collapsed[`card:${secondId}`]).toBe(false);
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
  });

  it('com menos de 2 selecionadas, a barra (e o botão) continuam não aparecendo', async () => {
    renderBoardWithSelectionBar();
    expect(screen.queryByRole('button', { name: 'Colapsar selecionados' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expandir selecionados' })).toBeNull();

    const box = screen.getByRole('checkbox', { name: 'Selecionar Login com Google' });
    await userEvent.click(box);
    expect(screen.queryByRole('button', { name: 'Colapsar selecionados' })).toBeNull();
  });
});
