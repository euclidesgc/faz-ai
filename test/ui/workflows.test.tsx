import { choose, lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Dialog } from '../../src/webview/components/Dialog';
import { WorkflowsSettings } from '../../src/webview/components/settings/workflows/WorkflowsSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const show = () =>
  render(
    <Theme>
      <WorkflowsSettings />
      <Dialog />
    </Theme>,
  );
const state = () => useBoardStore.getState().state!;
const cardOf = (name: string) => screen.getByLabelText(`Workflow ${name}`);

describe('WorkflowsSettings', () => {
  it('um card por workflow, com o nome numa caixa de texto e o papel; sem "começa colapsada" nem "linha de cima/baixo"', () => {
    show();
    const stories = cardOf('Histórias');
    expect(within(stories).getByLabelText('Nome do workflow')).toHaveValue('Histórias');
    expect(within(stories).getByText('Cards independentes')).toBeInTheDocument();
    expect(within(cardOf('Sub-tarefas')).getByText('Sub-tarefas', { selector: '.rt-Badge' })).toBeInTheDocument();
    expect(screen.queryByText(/começa colapsada/i)).toBeNull();
    expect(screen.queryByText(/linha de (cima|baixo)/i)).toBeNull();
    expect(screen.queryByText('Arquivados')).toBeNull();
  });

  it('renomear o workflow grava ao sair do campo', async () => {
    show();
    const name = within(cardOf('Histórias')).getByLabelText('Nome do workflow');
    await userEvent.clear(name);
    await userEvent.type(name, 'Backlog geral');
    expect(sentOf('settings.workflow.update')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.workflow.update')).toEqual({
      type: 'settings.workflow.update',
      workflowId: state().workflows[0]!.id,
      patch: { name: 'Backlog geral' },
    });
  });

  it('Novo workflow abre o rascunho no topo; o papel escolhido vai na criação e a explicação acompanha', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo workflow' }));
    expect(screen.getByRole('button', { name: 'Novo workflow' })).toBeDisabled();
    const draft = screen.getByLabelText('Workflow novo');
    const name = within(draft).getByLabelText('Nome');
    expect(name).toHaveFocus();
    expect(within(draft).getByText(/Recebe histórias, bugs, retrabalho e débitos/)).toBeInTheDocument();
    await userEvent.type(name, 'Suporte');
    await userEvent.click(within(draft).getByRole('radio', { name: 'Sub-tarefas' }));
    expect(within(draft).getByText(/Recebe as sub-tarefas de uma história/)).toBeInTheDocument();
    await userEvent.click(within(draft).getByRole('button', { name: 'Criar workflow' }));
    expect(lastSent('settings.workflow.create')).toEqual({ type: 'settings.workflow.create', name: 'Suporte', kind: 'child' });
    expect(screen.queryByLabelText('Workflow novo')).toBeNull();
  });

  it('Criar workflow fica desligado sem nome; Esc e Cancelar descartam', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo workflow' }));
    expect(screen.getByRole('button', { name: 'Criar workflow' })).toBeDisabled();
    await userEvent.type(within(screen.getByLabelText('Workflow novo')).getByLabelText('Nome'), 'x{Escape}');
    expect(screen.queryByLabelText('Workflow novo')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Novo workflow' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(sentOf('settings.workflow.create')).toHaveLength(0);
  });

  it('Nova coluna abre uma linha na tabela do workflow e cria depois da coluna escolhida', async () => {
    show();
    const stories = cardOf('Histórias');
    const cols = state()
      .columns.filter((c) => c.workflowId === state().workflows[0]!.id)
      .sort((a, b) => a.position - b.position);
    await userEvent.click(within(stories).getByRole('button', { name: 'Nova coluna' }));
    expect(within(stories).getByRole('button', { name: 'Nova coluna' })).toBeDisabled();
    const name = within(stories).getByLabelText('Nome da coluna');
    expect(name).toHaveFocus();
    await userEvent.type(name, 'Revisão');
    await choose(within(stories).getByRole('combobox', { name: 'Onde a coluna entra' }), `Depois de ${cols[1]!.name}`);
    await userEvent.type(name, '{Enter}');
    expect(lastSent('settings.column.create')).toEqual({
      type: 'settings.column.create',
      workflowId: state().workflows[0]!.id,
      name: 'Revisão',
      position: 2,
    });
    expect(within(stories).queryByLabelText('Nome da coluna')).toBeNull();
  });

  it('a coluna nova entra, por padrão, antes da primeira coluna de conclusão', async () => {
    show();
    const stories = cardOf('Histórias');
    const cols = state()
      .columns.filter((c) => c.workflowId === state().workflows[0]!.id)
      .sort((a, b) => a.position - b.position);
    const firstDone = cols.findIndex((c) => c.category !== 'open');
    await userEvent.click(within(stories).getByRole('button', { name: 'Nova coluna' }));
    expect(within(stories).getByRole('combobox', { name: 'Onde a coluna entra' })).toHaveTextContent(
      `Depois de ${cols[firstDone - 1]!.name}`,
    );
    await userEvent.type(within(stories).getByLabelText('Nome da coluna'), 'x');
    await userEvent.click(within(stories).getByRole('button', { name: 'Criar coluna' }));
    expect(lastSent('settings.column.create').position).toBe(firstDone);
  });

  it('a alça do workflow move uma posição com ↓ e ↑; no primeiro e no último o passo para fora não envia nada', async () => {
    show();
    const [first, second] = state().workflows;
    const handle = (name: string) => within(cardOf(name)).getByTitle(new RegExp(`Arraste para mudar a posição de "${name}"`));
    handle(first!.name).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(lastSent('settings.workflow.update')).toEqual({
      type: 'settings.workflow.update',
      workflowId: first!.id,
      patch: { position: 1 },
    });
    posted.mockClear();
    handle(first!.name).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(sentOf('settings.workflow.update')).toHaveLength(0);
    handle(second!.name).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(lastSent('settings.workflow.update').patch).toEqual({ position: 0 });
  });

  it('a tabela não tem mais coluna "Começa colapsada" e o menu de colunas não envia collapsed', async () => {
    show();
    const stories = cardOf('Histórias');
    expect(within(stories).queryByRole('columnheader', { name: /colapsada/i })).toBeNull();
    await userEvent.click(within(stories).getByLabelText('A IA atua em Backlog'));
    expect(lastSent('settings.column.update').patch).not.toHaveProperty('collapsed');
  });

  it('excluir workflow fica desligado com o motivo no tooltip enquanto há cards ou tipos nele', () => {
    show();
    const del = within(cardOf('Histórias')).getByTitle(/card\(s\)|tipo\(s\) de card/);
    expect(del).toBeDisabled();
  });

  it('mostra a tabela de status, com o nome em caixa de texto que grava ao sair', async () => {
    show();
    const name = screen.getByLabelText('Nome do status running');
    await userEvent.clear(name);
    await userEvent.type(name, 'Rodando');
    await userEvent.tab();
    expect(lastSent('settings.board.update').patch.appearance!.statuses!.running!.label).toBe('Rodando');
  });

  it('um workflow vazio, sem tipos, pode ser excluído depois de confirmar', async () => {
    board.router.handle({ type: 'settings.workflow.create', name: 'Vazio', kind: 'parent' });
    syncStore(board.router);
    show();
    const del = within(cardOf('Vazio')).getByTitle('Excluir o workflow');
    expect(del).toBeEnabled();
    await userEvent.click(del);
    expect(sentOf('settings.workflow.delete')).toHaveLength(0);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir workflow' }));
    expect(lastSent('settings.workflow.delete')).toEqual({
      type: 'settings.workflow.delete',
      workflowId: state().workflows.find((w) => w.name === 'Vazio')!.id,
    });
    expect(posted).toHaveBeenCalled();
    board.router.handle({ type: 'settings.workflow.delete', workflowId: state().workflows.find((w) => w.name === 'Vazio')!.id });
  });
});
