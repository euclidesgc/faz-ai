import { lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Board } from '../../src/webview/components/Board';
import { CardDrawer } from '../../src/webview/components/CardDrawer';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState, Card } from '../../src/shared/model';
import { cardRef } from '../../src/shared/model';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

// alguns testes mexem no estado da store; cada um começa do snapshot do roteador
beforeEach(() => syncStore(board.router));

/** Abre o drawer da história como o App faz: `openCardId` na store e o componente com o id. */
function openStory() {
  useBoardStore.getState().openCard(board.storyId);
  render(<CardDrawer cardId={board.storyId} />);
}

/** Abre o drawer de um card qualquer; devolve o resultado do render (para desmontar). */
function openCardDrawer(id: string) {
  useBoardStore.getState().openCard(id);
  return render(<CardDrawer cardId={id} />);
}

/** Altera o estado da store sem passar pelo host (o que o host mandaria num novo `boardState`). */
function patchState(patch: (s: BoardState) => Partial<BoardState>) {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
}

const patchCard = (id: string, patch: Partial<Card>) =>
  patchState((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

const snap = () => board.router.snapshot();
const card = (id: string) => snap().cards.find((c) => c.id === id)!;

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

  it('trocar o tipo envia card.update com typeId', async () => {
    openStory();
    const bug = snap().cardTypes.find((t) => t.name === 'Bug')!;
    await userEvent.selectOptions(screen.getByDisplayValue('História'), 'Bug');
    expect(lastSent('card.update')).toEqual({ type: 'card.update', cardId: board.storyId, patch: { typeId: bug.id } });
  });

  it('trocar a coluna move o card para o fim da coluna nova', async () => {
    openStory();
    const discovery = snap().columns.find((c) => c.name === 'Discovery')!;
    await userEvent.selectOptions(screen.getByDisplayValue('Backlog'), 'Discovery');
    expect(lastSent('card.move')).toEqual({ type: 'card.move', cardId: board.storyId, columnId: discovery.id, position: 0 });
  });

  it('editar o texto de um item do checklist envia o texto novo; o X exclui o item', async () => {
    openStory();
    const item = snap().checklistItems.find((i) => i.cardId === board.storyId)!;
    const input = screen.getByDisplayValue('item');
    await userEvent.type(input, ' revisto');
    await userEvent.tab();
    expect(lastSent('checklist.update')).toEqual({ type: 'checklist.update', itemId: item.id, patch: { text: 'item revisto' } });
    await userEvent.click(screen.getByRole('button', { name: 'Remover o item' }));
    expect(lastSent('checklist.delete')).toEqual({ type: 'checklist.delete', itemId: item.id });
  });

  it('o checklist mostra quantos itens estão feitos', () => {
    patchState((s) => ({
      checklistItems: [...s.checklistItems, { ...s.checklistItems[0]!, id: 'feito', text: 'outro', done: true, position: 9 }],
    }));
    openStory();
    expect(screen.getByRole('heading', { name: /Checklist/ })).toHaveTextContent('Checklist 1/2');
  });

  it('descrição: Editar, escrever e Concluir envia card.update com a descrição', async () => {
    openStory();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByPlaceholderText(/Descreva o problema/), 'Contexto');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(lastSent('card.update')).toEqual({ type: 'card.update', cardId: board.storyId, patch: { description: 'Contexto' } });
    expect(screen.queryByPlaceholderText(/Descreva o problema/)).toBeNull();
    expect(screen.getByText('Contexto')).toBeInTheDocument();
  });

  it('clicar na descrição vazia abre o editor', async () => {
    openStory();
    await userEvent.click(screen.getByText('Clique para adicionar uma descrição…'));
    expect(screen.getByPlaceholderText(/Descreva o problema/)).toHaveFocus();
  });

  it('a descrição em edição continua aberta depois de trocar de aba', async () => {
    openStory();
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByPlaceholderText(/Descreva o problema/), 'Rascunho');
    await userEvent.click(screen.getByRole('button', { name: 'Conversa' }));
    // sair do editor já salva
    expect(lastSent('card.update')).toEqual({ type: 'card.update', cardId: board.storyId, patch: { description: 'Rascunho' } });
    await userEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
    expect(screen.getByPlaceholderText(/Descreva o problema/)).toHaveValue('Rascunho');
  });

  it('fechar o drawer com a descrição em edição salva o rascunho', async () => {
    const { unmount } = openCardDrawer(board.storyId);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByPlaceholderText(/Descreva o problema/), 'Pendente');
    unmount();
    expect(lastSent('card.update')).toEqual({ type: 'card.update', cardId: board.storyId, patch: { description: 'Pendente' } });
  });

  it('trocar de card com a descrição em edição salva o rascunho no card de antes', async () => {
    const { rerender } = openCardDrawer(board.storyId);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.type(screen.getByPlaceholderText(/Descreva o problema/), 'Da história');
    posted.mockClear();
    rerender(<CardDrawer cardId={board.subId} />);
    expect(sentOf('card.update')).toEqual([{ type: 'card.update', cardId: board.storyId, patch: { description: 'Da história' } }]);
  });

  it('trocar de card volta para a aba Detalhes e mostra o card novo', async () => {
    const { rerender } = openCardDrawer(board.storyId);
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Anexos' }));
    rerender(<CardDrawer cardId={board.subId} />);
    expect(screen.getByRole('button', { name: 'Detalhes' })).toHaveClass('active');
    expect(screen.getByDisplayValue('Tarefa')).toBeInTheDocument();
    expect(screen.getByText('Clique para adicionar uma descrição…')).toBeInTheDocument();
  });

  it('mudar um campo envia field.setValue', async () => {
    openStory();
    const effort = snap().fieldDefs.find((f) => f.name === 'Esforço da atividade')!;
    await userEvent.selectOptions(screen.getByLabelText('Esforço da atividade'), 'Alto');
    expect(lastSent('field.setValue')).toEqual({ type: 'field.setValue', cardId: board.storyId, fieldId: effort.id, value: 'Alto' });
  });

  it('as abas mostram a conversa e os anexos, com a contagem no rótulo', async () => {
    patchState((s) => ({
      comments: [{ id: 'c1', cardId: board.storyId, author: 'Pessoa', body: 'oi', createdAt: 0, updatedAt: 0 } as never, ...s.comments],
    }));
    openStory();
    await userEvent.click(screen.getByRole('button', { name: 'Conversa (1)' }));
    expect(screen.queryByPlaceholderText('+ Novo item (Enter)')).toBeNull();
    expect(screen.getByText('oi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Anexos' }));
    expect(screen.getByRole('button', { name: 'Anexos' })).toHaveClass('active');
    expect(screen.queryByText('oi')).toBeNull();
  });

  it('na sub-tarefa, o link da história abre a história', async () => {
    openCardDrawer(board.subId);
    expect(screen.queryByPlaceholderText('+ Nova sub-tarefa (Enter)')).toBeNull();
    await userEvent.click(screen.getByText(`${cardRef(card(board.storyId))} Login com Google`));
    expect(useBoardStore.getState().openCardId).toBe(board.storyId);
  });

  it('clicar numa sub-tarefa abre o card dela; "Ver no board" seleciona a história e fecha', async () => {
    openStory();
    expect(screen.getByRole('heading', { name: /Sub-tarefas/ })).toHaveTextContent('Sub-tarefas 1');
    await userEvent.click(screen.getByText('Tarefa'));
    expect(useBoardStore.getState().openCardId).toBe(board.subId);
    useBoardStore.getState().openCard(board.storyId);
    await userEvent.click(screen.getByRole('button', { name: 'Ver no board' }));
    expect(useBoardStore.getState().selectedParentId).toBe(board.storyId);
    expect(useBoardStore.getState().openCardId).toBeNull();
  });

  it('sem branch, "Criar branch da história" envia card.workspace.prepare', async () => {
    openCardDrawer(board.subId);
    await userEvent.click(screen.getByRole('button', { name: 'Criar branch da história' }));
    expect(lastSent('card.workspace.prepare')).toEqual({ type: 'card.workspace.prepare', cardId: board.subId });
  });

  it('a sub-tarefa mostra a branch, a pasta e o PR da história', async () => {
    patchCard(board.storyId, { branch: 'feat/login', worktreePath: '/tmp/wt', prUrl: 'https://example.com/pr/1' });
    openCardDrawer(board.subId);
    expect(screen.getByText('feat/login')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pull request' })).toHaveAttribute('href', 'https://example.com/pr/1');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir a pasta de trabalho' }));
    expect(lastSent('card.workspace.open')).toEqual({ type: 'card.workspace.open', cardId: board.subId });
  });

  it('com git desligado não mostra a área de branch', () => {
    patchState((s) => ({ board: { ...s.board, git: { ...s.board.git, mode: 'off' } } }));
    openStory();
    expect(screen.queryByRole('button', { name: 'Criar branch da história' })).toBeNull();
  });

  it('perfil de execução: escolher envia o id; "Da fase" volta para null', async () => {
    const profile = {
      id: 'p1',
      name: 'Revisor',
      agent: 'reviewer',
      skills: ['tdd'],
      mcpServers: [],
      tools: [],
      deniedTools: [],
      model: '',
      clean: true,
      isDefault: false,
    };
    patchState((s) => ({ board: { ...s.board, execProfiles: [profile] } }));
    openStory();
    const select = screen.getByDisplayValue('Da fase (nenhum)');
    await userEvent.selectOptions(select, 'Revisor');
    expect(lastSent('card.execProfile.set')).toEqual({ type: 'card.execProfile.set', cardId: board.storyId, profileId: 'p1' });
    // o host devolveria o card com o perfil escolhido
    act(() => patchCard(board.storyId, { execProfile: 'p1' }));
    expect(screen.getByText('agente reviewer · skills: tdd · MCP: board · sessão limpa')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByDisplayValue('Revisor'), 'Da fase (nenhum)');
    expect(lastSent('card.execProfile.set').profileId).toBeNull();
  });

  it('Ações: arquivar uma sub-tarefa sem dependentes envia card.archive e fecha', async () => {
    openCardDrawer(board.subId);
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }));
    await userEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    expect(lastSent('card.archive')).toEqual({ type: 'card.archive', cardId: board.subId });
    expect(useBoardStore.getState().openCardId).toBeNull();
  });

  it('Ações: mover a história para a lixeira pergunta antes (ela tem sub-tarefa)', async () => {
    openStory();
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover para a lixeira' }));
    expect(useBoardStore.getState().dialog).not.toBeNull();
    expect(sentOf('card.trash')).toHaveLength(0);
  });

  it('card arquivado: aviso, coluna travada, sem status e "Desarquivar" no menu', async () => {
    patchCard(board.subId, { archivedAt: 1 });
    openCardDrawer(board.subId);
    expect(screen.getByText('Este card está arquivado.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A fazer')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Ações' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desarquivar' }));
    expect(lastSent('card.unarchive')).toEqual({ type: 'card.unarchive', cardId: board.subId });
  });

  it('card na lixeira: aviso, sem menu de ações e "Restaurar" envia card.restore', async () => {
    patchCard(board.subId, { deletedAt: 1 });
    openCardDrawer(board.subId);
    expect(screen.getByText('Este card está na lixeira.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Criar branch da história' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(lastSent('card.restore')).toEqual({ type: 'card.restore', cardId: board.subId });
  });

  it('clicar no fundo fecha o drawer', async () => {
    const { container } = openCardDrawer(board.storyId);
    await userEvent.click(container.querySelector('.drawer-backdrop')!);
    expect(useBoardStore.getState().openCardId).toBeNull();
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
