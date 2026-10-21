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

/** a barra de seleção: o rodapé de cada história também tem o botão de ligar/desligar o modo autônomo (#416) */
const bar = () => within(document.querySelector('.selectionbar') as HTMLElement);

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

    await userEvent.click(bar().getByRole('button', { name: 'Ligar modo autônomo' }));
    expect(sentOf('card.yolo.setMany')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ligar o modo autônomo em 2 história(s)?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar modo autônomo' }));

    const sent = lastSent('card.yolo.setMany');
    expect(sent.enabled).toBe(true);
    expect(sent.cardIds.sort()).toEqual([firstId, secondId].sort());

    // a barra fica, mostrando "Aplicando…" com o botão travado, até o boardState refletir a mudança
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
    expect(bar().getByRole('button', { name: 'Aplicando…' })).toBeDisabled();

    act(() => {
      patchCard(firstId, { yolo: true });
      patchCard(secondId, { yolo: true });
    });
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
    expect(screen.queryByRole('button', { name: 'Aplicando…' })).toBeNull();
  });

  it('com as duas já em modo autônomo, o botão oferece desligar, e confirmar envia enabled: false', async () => {
    const [firstId, secondId] = await selectTwoStories();
    act(() => {
      patchCard(firstId, { yolo: true });
      patchCard(secondId, { yolo: true });
    });

    expect(bar().getByRole('button', { name: 'Desligar modo autônomo' })).toBeInTheDocument();
    await userEvent.click(bar().getByRole('button', { name: 'Desligar modo autônomo' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Desligar o modo autônomo em 2 história(s)?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desligar modo autônomo' }));

    const sent = lastSent('card.yolo.setMany');
    expect(sent.enabled).toBe(false);
    expect(sent.cardIds.sort()).toEqual([firstId, secondId].sort());
  });

  it('o "Até onde" em lote só oferece as fases que valem para todas as histórias marcadas', async () => {
    const [firstId, secondId] = await selectTwoStories();
    const col = (name: string) => useBoardStore.getState().state!.columns.find((c) => c.name === name)!;
    // uma das duas já está na Spec: Discovery e PRD ficaram para trás dela
    act(() => patchCard(secondId, { columnId: col('Spec').id, status: 'ready' }));
    await userEvent.click(bar().getByRole('button', { name: 'Ligar modo autônomo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Até onde' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Spec',
      'Plan',
      'Implementação',
      'Revisão',
      'Homologação (abre o pull request)',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Plan' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar modo autônomo' }));
    const sent = lastSent('card.yolo.setMany');
    expect(sent).toMatchObject({ enabled: true, until: col('Plan').id });
    expect(sent.cardIds.sort()).toEqual([firstId, secondId].sort());
    useBoardStore.getState().setYoloUntilName('');
  });

  it('cancelar a confirmação não envia nada e mantém a seleção', async () => {
    await selectTwoStories();
    await userEvent.click(bar().getByRole('button', { name: 'Ligar modo autônomo' }));
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

describe('ações contextuais da seleção', () => {
  it('aprova só os cards aguardando revisão e avisa que a seleção é parcial', async () => {
    const [firstId] = await selectTwoStories();
    act(() => patchCard(firstId, { status: 'waiting_review' }));
    await userEvent.click(bar().getByRole('button', { name: 'Aprovar' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Atinge 1 de 2 selecionados/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aprovar' }));
    expect(lastSent('card.status.setMany')).toMatchObject({ cardIds: [firstId], status: 'approved' });
    expect(bar().getByRole('button', { name: 'Aprovar' })).toBeDisabled();
  });

  it('bloquear exige motivo e envia só os ainda não bloqueados; cancelar preserva a seleção', async () => {
    const [firstId, secondId] = await selectTwoStories();
    act(() => patchCard(firstId, { status: 'blocked' }));
    await userEvent.click(bar().getByRole('button', { name: 'Bloquear' }));
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Bloquear' })).toBeDisabled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Motivo' }), '   ');
    expect(within(dialog).getByRole('button', { name: 'Bloquear' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(sentOf('card.status.setMany')).toEqual([]);
    expect(useBoardStore.getState().selectedIds.size).toBe(2);
    await userEvent.click(bar().getByRole('button', { name: 'Bloquear' }));
    dialog = screen.getByRole('dialog');
    const reason = within(dialog).getByRole('textbox', { name: 'Motivo' });
    expect(reason).toHaveValue('');
    expect(reason).toHaveFocus();
    await userEvent.type(reason, '  Aguardando acesso  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(lastSent('card.status.setMany')).toMatchObject({ cardIds: [secondId], status: 'blocked', note: 'Aguardando acesso' });
  });

  it('desbloqueia só quem está bloqueado e mantém ações indisponíveis sem explicar o motivo', async () => {
    const [firstId] = await selectTwoStories();
    act(() => patchCard(firstId, { status: 'blocked' }));
    const approve = bar().getByRole('button', { name: 'Aprovar' });
    expect(approve).toBeDisabled();
    expect(approve).not.toHaveAttribute('title');
    await userEvent.click(bar().getByRole('button', { name: 'Desbloquear' }));
    expect(lastSent('card.status.setMany')).toMatchObject({ cardIds: [firstId], status: 'ready' });
  });

  it('a ferramenta indisponível desabilita trabalhar e refinar', async () => {
    await selectTwoStories();
    act(() => patchState(() => ({ aiRunUnsupported: 'Sem ferramenta' })));
    for (const name of ['Trabalhar na fase', 'Refinar com IA']) expect(bar().getByRole('button', { name })).toBeDisabled();
    expect(bar().queryByText('Sem ferramenta')).toBeNull();
  });

  it('trabalhar respeita vagas de branch e ignora cards em execução; parar atinge só execuções locais', async () => {
    const [firstId, secondId] = await selectTwoStories();
    act(() => {
      const s = useBoardStore.getState().state!;
      const implementation = s.columns.find((c) => c.name === 'Implementação')!;
      patchCard(firstId, { columnId: implementation.id, status: 'running' });
      patchCard(secondId, { columnId: implementation.id, status: 'ready' });
      patchState(() => ({ aiRuns: [firstId] }));
    });
    expect(bar().getByRole('button', { name: 'Trabalhar na fase' })).toBeDisabled();
    expect(bar().getByRole('button', { name: 'Refinar com IA' })).toBeEnabled();
    act(() => patchState(() => ({ aiRuns: [] })));
    // Uma sessão externa marcada "running" também não pode receber uma segunda execução.
    await userEvent.click(bar().getByRole('button', { name: 'Trabalhar na fase' }));
    expect(sentOf('ai.run').map((m) => m.cardId)).toEqual([secondId]);
  });

  it('refinar usa apenas as vagas de texto restantes', async () => {
    const [firstId, secondId] = await selectTwoStories();
    const thirdId = createExtraStory().id;
    act(() => {
      useBoardStore.getState().selectMany([firstId, secondId, thirdId]);
      patchState(() => ({
        aiRuns: [firstId],
        aiActivity: [
          { cardId: firstId, runId: 'run', mode: 'refine', origin: 'manual', phase: 'Backlog', model: null, tool: 'claude', startedAt: 1 },
        ],
      }));
      const s = useBoardStore.getState().state!;
      patchState(() => ({ board: { ...s.board, runner: { ...s.board.runner, parallelStories: 2 } } }));
    });
    await userEvent.click(bar().getByRole('button', { name: 'Refinar com IA' }));
    expect(sentOf('ai.run')).toMatchObject([{ cardId: secondId, mode: 'refine' }]);
  });

  it('parar não altera os cards ociosos', async () => {
    const [firstId] = await selectTwoStories();
    act(() => patchState(() => ({ aiRuns: [firstId] })));
    await userEvent.click(bar().getByRole('button', { name: 'Parar a IA' }));
    expect(sentOf('ai.stop').map((m) => m.cardId)).toEqual([firstId]);
  });

  it('a barra arquiva só selecionados que continuam visíveis após mudar o filtro', async () => {
    const [firstId, secondId] = await selectTwoStories();
    const thirdId = createExtraStory().id;
    act(() => {
      patchCard(firstId, { title: 'Visível A' });
      patchCard(secondId, { title: 'Visível B' });
      useBoardStore.getState().selectMany([firstId, secondId, thirdId]);
      useBoardStore.getState().setFilters({ text: 'Visível', includeRelated: false });
    });
    expect(bar().getByText('2 selecionados')).toBeInTheDocument();
    await userEvent.click(bar().getByRole('button', { name: 'Arquivar selecionados' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Arquivar' }));
    expect(lastSent('card.archiveMany').cardIds.sort()).toEqual([firstId, secondId].sort());
  });

  it('com vários cards selecionados a barra não tem ação de duplicar', async () => {
    await selectTwoStories();
    expect(bar().getByText('2 selecionados')).toBeInTheDocument();
    expect(bar().queryByRole('button', { name: /Duplicar/ })).toBeNull();
  });
});
