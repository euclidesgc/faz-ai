import { confirmLast, lastSent, posted, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrashView } from '../../src/webview/components/TrashView';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
let ids: string[];

/** Cria uma história na lixeira (o host manda `deleted` por `card.trash`, aqui o roteador faz o mesmo). */
function trashedStory(title: string): string {
  const s = board.router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  const typeId = s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
  const columnId = s.columns.find((c) => c.workflowId === wf.id)!.id;
  const id = board.router.createCard({ typeId, columnId, parentId: null, title });
  board.router.handle({ type: 'card.trash', cardId: id });
  return id;
}

beforeEach(async () => {
  board = await seedBoard();
  ids = ['Primeiro excluído', 'Segundo excluído', 'Terceiro excluído'].map(trashedStory);
  syncStore(board.router);
  useBoardStore.setState({ bulkBusy: null, selectedIds: new Set() });
  renderThemed(
    <>
      <TrashView />
      <Dialog />
    </>,
  );
});

const bar = () => document.querySelector('.selectionbar') as HTMLElement | null;
const rowBox = (title: string) => screen.getByRole('checkbox', { name: `Selecionar ${title}` });
const header = () => screen.getByRole('checkbox', { name: /todas as linhas/ }) as HTMLInputElement;

describe('TrashView: seleção múltipla', () => {
  it('sem nada marcado, não há barra de ações em massa', () => {
    expect(bar()).toBeNull();
  });

  it('marcar linhas mostra a contagem e as ações em lote; desmarcar todas esconde a barra', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    await userEvent.click(rowBox('Segundo excluído'));
    expect(within(bar()!).getByText('2 selecionados')).toBeInTheDocument();
    expect(within(bar()!).getByRole('button', { name: 'Limpar' })).toBeInTheDocument();
    expect(within(bar()!).getByRole('button', { name: 'Restaurar' })).toBeInTheDocument();
    expect(within(bar()!).getByRole('button', { name: 'Apagar de vez' })).toBeInTheDocument();

    await userEvent.click(rowBox('Primeiro excluído'));
    await userEvent.click(rowBox('Segundo excluído'));
    expect(bar()).toBeNull();
  });

  it('"Limpar" desmarca tudo', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    await userEvent.click(within(bar()!).getByRole('button', { name: 'Limpar' }));
    expect(bar()).toBeNull();
    expect(rowBox('Primeiro excluído')).not.toBeChecked();
  });

  it('a caixa do cabeçalho marca todas as linhas; com todas marcadas, desmarca todas', async () => {
    await userEvent.click(header());
    for (const title of ['Primeiro excluído', 'Segundo excluído', 'Terceiro excluído']) {
      expect(rowBox(title)).toBeChecked();
    }
    expect(within(bar()!).getByText('3 selecionados')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Desmarcar todas as linhas' }));
    expect(bar()).toBeNull();
  });

  it('com seleção parcial, a caixa do cabeçalho fica indeterminada; clicar nela seleciona todas', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    expect(header().indeterminate).toBe(true);
    expect(header()).not.toBeChecked();

    await userEvent.click(header());
    expect(within(bar()!).getByText('3 selecionados')).toBeInTheDocument();
    expect(header().indeterminate).toBe(false);
  });
});

describe('TrashView: ações em massa', () => {
  it('"Restaurar" envia card.restoreMany com os ids marcados, sem confirmação, e limpa a seleção ao confirmar', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    await userEvent.click(rowBox('Terceiro excluído'));
    await userEvent.click(within(bar()!).getByRole('button', { name: 'Restaurar' }));

    expect(sentOf('card.restoreMany')).toHaveLength(1);
    expect(lastSent('card.restoreMany').cardIds.slice().sort()).toEqual([ids[0], ids[2]].sort());
    expect(screen.queryByRole('dialog')).toBeNull();

    // a barra mostra o status e trava os botões até o host responder
    expect(within(bar()!).getByRole('status')).toHaveTextContent('Restaurando 2 card(s)…');
    expect(within(bar()!).getByRole('button', { name: 'Restaurar' })).toBeDisabled();
    expect(within(bar()!).getByRole('button', { name: 'Apagar de vez' })).toBeDisabled();

    confirmLast();
    await act(async () => {});
    expect(bar()).toBeNull();
  });

  it('"Apagar de vez" pede confirmação; cancelar não envia nada e mantém a seleção', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    await userEvent.click(rowBox('Segundo excluído'));
    await userEvent.click(within(bar()!).getByRole('button', { name: 'Apagar de vez' }));

    expect(sentOf('card.deletePermanentMany')).toEqual([]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(sentOf('card.deletePermanentMany')).toEqual([]);
    expect(within(bar()!).getByText('2 selecionados')).toBeInTheDocument();
  });

  it('"Apagar de vez" confirmado envia card.deletePermanentMany com os ids e limpa a seleção', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    await userEvent.click(rowBox('Segundo excluído'));
    await userEvent.click(within(bar()!).getByRole('button', { name: 'Apagar de vez' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar de vez' }));

    expect(lastSent('card.deletePermanentMany').cardIds.slice().sort()).toEqual([ids[0], ids[1]].sort());
    expect(within(bar()!).getByRole('status')).toHaveTextContent('Apagando 2 card(s)…');

    confirmLast();
    await act(async () => {});
    expect(bar()).toBeNull();
  });

  it('a seleção some quando a linha some: restaurar um card marcado deixa a contagem certa', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    await userEvent.click(rowBox('Segundo excluído'));

    act(() => {
      board.router.handle({ type: 'card.restore', cardId: ids[0]! });
      syncStore(board.router);
    });

    expect(screen.queryByRole('checkbox', { name: 'Selecionar Primeiro excluído' })).toBeNull();
    expect(within(bar()!).getByText('1 selecionados')).toBeInTheDocument();
  });

  it('"Esvaziar lixeira" continua igual com a seleção ativa: fica habilitado e pede confirmação', async () => {
    await userEvent.click(rowBox('Primeiro excluído'));
    const empty = screen.getByRole('button', { name: 'Esvaziar lixeira' });
    expect(empty).toBeEnabled();

    await userEvent.click(empty);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Esvaziar lixeira' }));

    expect(posted).toHaveBeenCalledWith({ type: 'trash.empty' });
    expect(sentOf('card.deletePermanentMany')).toEqual([]);
    confirmLast();
    await act(async () => {});
  });
});
