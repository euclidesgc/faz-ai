import { choose, confirmLast, lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Dialog } from '../../src/webview/components/Dialog';
import { WorkflowsSettings } from '../../src/webview/components/settings/workflows/WorkflowsSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { useAgentConnectStore } from '../../src/webview/store/agentConnectStore';
import { effortLabel } from '../../src/shared/models';
import fs from 'node:fs';
import path from 'node:path';

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

describe('sugestão de modelos por workflow', () => {
  const prepare = () => {
    const current = state();
    const parent = current.workflows.find((w) => w.kind === 'parent')!;
    const columns = current.columns.filter((c) => c.workflowId === parent.id && c.category === 'open' && c.aiActive);
    const catalog = current.board.modelCatalog.filter((m) => m.tool === current.board.aiTool);
    const first = catalog[0]!;
    const last = catalog[catalog.length - 1]!;
    const value = (m: typeof first) => (m.efforts.length ? `${m.id}@${m.efforts[0]}` : m.id);
    useBoardStore.setState({
      state: {
        ...current,
        board: { ...current.board, modelLadders: { ...current.board.modelLadders, [current.board.aiTool]: [value(first), value(last)] } },
        columns: current.columns.map((c) => (columns.includes(c) ? { ...c, phaseModel: 'antigo' } : c)),
      },
    });
    return { columns, first: value(first), last: value(last) };
  };
  const open = async () => {
    await userEvent.click(within(cardOf('Histórias')).getByRole('button', { name: 'Sugerir modelos' }));
    return screen.getByLabelText('Prévia de modelos sugeridos');
  };

  it('mostra prévia por workflow e descartar não grava', async () => {
    prepare();
    show();
    expect(screen.getAllByRole('button', { name: 'Sugerir modelos' })).toHaveLength(state().workflows.length);
    const panel = await open();
    expect(within(panel).getByText('Discovery')).toBeInTheDocument();
    expect(within(panel).getAllByText('Sem preferência').length).toBeGreaterThan(0);
    expect(sentOf('settings.column.update')).toHaveLength(0);
    await userEvent.click(within(panel).getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByLabelText('Prévia de modelos sugeridos')).toBeNull();
    expect(sentOf('settings.column.update')).toHaveLength(0);
  });

  it('aguarda cada confirmação, preserva erro parcial e retoma sem regravar a coluna confirmada', async () => {
    const { last } = prepare();
    show();
    const panel = await open();
    await userEvent.click(within(panel).getByRole('button', { name: 'Aplicar sugeridos' }));
    const first = lastSent('settings.column.update');
    expect(first.patch.phaseModel).toBe(last);
    expect(sentOf('settings.column.update')).toHaveLength(1);
    expect(within(panel).getByRole('button', { name: 'Descartar' })).toBeDisabled();
    act(() =>
      useBoardStore.setState({
        state: { ...state(), columns: state().columns.map((c) => (c.id === first.columnId ? { ...c, ...first.patch } : c)) },
      }),
    );
    confirmLast();
    await waitFor(() => expect(sentOf('settings.column.update')).toHaveLength(2));
    confirmLast(false, 'falhou');
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Não foi possível aplicar todos os modelos');
    await userEvent.click(within(panel).getByRole('button', { name: 'Aplicar sugeridos' }));
    await waitFor(() => expect(sentOf('settings.column.update')).toHaveLength(3));
    expect(lastSent('settings.column.update').columnId).not.toBe(first.columnId);
    while (screen.queryByLabelText('Prévia de modelos sugeridos')) {
      const sent = lastSent('settings.column.update');
      act(() =>
        useBoardStore.setState({
          state: { ...state(), columns: state().columns.map((c) => (c.id === sent.columnId ? { ...c, ...sent.patch } : c)) },
        }),
      );
      const count = sentOf('settings.column.update').length;
      confirmLast();
      await waitFor(() =>
        expect(!screen.queryByLabelText('Prévia de modelos sugeridos') || sentOf('settings.column.update').length > count).toBe(true),
      );
    }
    expect(sentOf('settings.column.update').some((m) => m.patch.phaseModel === null)).toBe(true);
  });

  it('recusa proposta obsoleta e direciona o aviso ao perfil padrão', async () => {
    prepare();
    show();
    const panel = await open();
    act(() => useBoardStore.setState({ state: { ...state(), board: { ...state().board, modelLadders: {} } } }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Aplicar sugeridos' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('A proposta mudou');
    expect(sentOf('settings.column.update')).toHaveLength(0);
    useAgentConnectStore.getState().select('outro', 'models');
    await userEvent.click(within(cardOf('Histórias')).getByRole('button', { name: 'Regras de fallback' }));
    expect(useAgentConnectStore.getState()).toMatchObject({ selected: state().board.aiTool, tab: 'connection' });
    expect(useBoardStore.getState()).toMatchObject({ settingsTab: 'connect', pendingSettingsSection: 'execution-policies' });
  });

  it('a proposta do workflow filho limpa um modelo anterior depois da confirmação', async () => {
    const current = state();
    const child = current.workflows.find((w) => w.kind === 'child')!;
    const column = current.columns.find((c) => c.workflowId === child.id)!;
    useBoardStore.setState({
      state: { ...current, columns: current.columns.map((c) => (c.id === column.id ? { ...c, phaseModel: 'claude:antigo' } : c)) },
    });
    show();
    await userEvent.click(within(cardOf(child.name)).getByRole('button', { name: 'Sugerir modelos' }));
    const panel = screen.getByLabelText('Prévia de modelos sugeridos');
    await userEvent.click(within(panel).getByRole('button', { name: 'Aplicar sugeridos' }));
    expect(lastSent('settings.column.update')).toMatchObject({ columnId: column.id, patch: { phaseModel: null } });
    expect(panel).toBeInTheDocument();
    confirmLast();
    await waitFor(() => expect(screen.queryByLabelText('Prévia de modelos sugeridos')).toBeNull());
  });
});

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
    // o rascunho só fecha quando o host confirma
    confirmLast();
    await waitFor(() => expect(screen.queryByLabelText('Workflow novo')).toBeNull());
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
    // a linha só fecha quando o host confirma
    confirmLast();
    await waitFor(() => expect(within(stories).queryByLabelText('Nome da coluna')).toBeNull());
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

describe('checagens da coluna (#1096)', () => {
  const rowOf = (name: string) => within(cardOf('Histórias')).getByLabelText(`Nome da coluna ${name}`).closest('tr')!;
  const reviewChecks = () => state().columns.find((c) => c.name === 'Revisão')!.checks;
  /** O host aplicaria o patch e devolveria o board: aqui o roteador de verdade faz o mesmo e a tela relê. */
  const apply = () => {
    const sent = lastSent('settings.column.update');
    board.router.handle(sent);
    syncStore(board.router);
    return sent;
  };
  const open = async () => {
    show();
    await userEvent.click(within(rowOf('Revisão')).getByRole('button', { name: /Adicionar|checagem\(ns\)|checagens?$/ }));
  };
  const addCheck = async (name: string, command: string) => {
    await userEvent.type(screen.getByLabelText('Nome da nova checagem'), name);
    await userEvent.type(screen.getByLabelText('Comando da nova checagem'), command);
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar checagem' }));
    apply();
  };

  it('abre o painel da Revisão, com "Adicionar checagem" desligado sem nome ou comando', async () => {
    await open();
    const add = screen.getByRole('button', { name: 'Adicionar checagem' });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nome da nova checagem'), 'Tipos');
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Comando da nova checagem'), 'npm run typecheck');
    expect(add).toBeEnabled();
    expect(sentOf('settings.column.update').filter((m) => m.patch.checks)).toHaveLength(0);
  });

  it('adiciona, edita, sobe, desce e exclui; cada gravação manda a lista inteira', async () => {
    await open();
    await addCheck('Tipos', 'npm run typecheck');
    expect(lastSent('settings.column.update')).toMatchObject({
      patch: { checks: [{ name: 'Tipos', command: 'npm run typecheck', timeoutSec: 600 }] },
    });
    await addCheck('Testes', 'npx vitest related {{changed_files} --run');
    expect(reviewChecks().map((c) => c.name)).toEqual(['Tipos', 'Testes']);
    // a quantidade aparece no botão da coluna
    expect(within(rowOf('Revisão')).getByRole('button', { name: /2 checagem\(ns\)/ })).toBeInTheDocument();

    // editar o comando da primeira
    const command = screen.getByLabelText('Comando da checagem 1');
    await userEvent.clear(command);
    await userEvent.type(command, 'npm run typecheck -- --noEmit');
    await userEvent.tab();
    expect(apply().patch.checks![0]).toEqual({ name: 'Tipos', command: 'npm run typecheck -- --noEmit', timeoutSec: 600 });

    // o tempo limite
    const timeout = screen.getByLabelText('Tempo limite da checagem 2');
    await userEvent.clear(timeout);
    await userEvent.type(timeout, '90');
    await userEvent.tab();
    expect(apply().patch.checks![1]!.timeoutSec).toBe(90);

    // descer a primeira e subir de volta
    await userEvent.click(screen.getByRole('button', { name: 'Descer a checagem 1' }));
    expect(apply().patch.checks!.map((c) => c.name)).toEqual(['Testes', 'Tipos']);
    // fecha a dica que o clique anterior deixou aberta, que no jsdom engole o clique seguinte
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Subir a checagem 2' }));
    expect(apply().patch.checks!.map((c) => c.name)).toEqual(['Tipos', 'Testes']);

    // excluir a primeira pede confirmação
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Excluir a checagem 1' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir checagem' }));
    expect(apply().patch.checks!.map((c) => c.name)).toEqual(['Testes']);
    await waitFor(() => expect(within(rowOf('Revisão')).getByRole('button', { name: /1 checagem\(ns\)/ })).toBeInTheDocument());
  });

  it('nome vazio não grava: o campo volta ao valor gravado e a linha mostra o motivo', async () => {
    board.router.handle({
      type: 'settings.column.update',
      columnId: state().columns.find((c) => c.name === 'Revisão')!.id,
      patch: { checks: [{ name: 'Tipos', command: 'npm run typecheck', timeoutSec: 600 }] },
    });
    syncStore(board.router);
    await open();
    const before = sentOf('settings.column.update').length;
    const name = screen.getByLabelText('Nome da checagem 1');
    await userEvent.clear(name);
    await userEvent.tab();
    expect(sentOf('settings.column.update')).toHaveLength(before);
    expect(name).toHaveValue('Tipos');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome da checagem.');
  });

  it('o botão fica desabilitado em coluna de conclusão e o painel da fase e o das checagens não abrem juntos', async () => {
    show();
    const done = within(rowOf('Concluído')).getByRole('button', { name: /Adicionar|checagem/ });
    expect(done).toBeDisabled();
    await userEvent.click(within(rowOf('Revisão')).getByRole('button', { name: /instrução|PRD|\.md/i }));
    expect(screen.getByLabelText('Instrução para a IA')).toBeInTheDocument();
    await userEvent.click(within(rowOf('Revisão')).getByRole('button', { name: /Adicionar|checagem\(ns\)/ }));
    expect(screen.queryByLabelText('Instrução para a IA')).toBeNull();
    expect(screen.getByLabelText('Nome da nova checagem')).toBeInTheDocument();
  });

  describe('Sugerir pelo projeto (#1254)', () => {
    /** O host responde ao último pedido de perfil, como o hostBridge faria. */
    const answer = (reply: { profile?: unknown; error?: string }) => {
      const sent = lastSent('harness.project.profile');
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', { data: { type: 'harness.project.profileResult', requestId: sent.requestId, ...reply } }),
        );
      });
    };
    const profile = {
      languages: [],
      scripts: { typecheck: 'tsc', lint: 'eslint', test: 'vitest' },
      tools: ['vitest'],
      folders: [],
      readme: '',
    };
    const resetChecks = () => {
      board.router.handle({
        type: 'settings.column.update',
        columnId: state().columns.find((c) => c.name === 'Revisão')!.id,
        patch: { checks: [{ name: 'Lint', command: 'npm run lint', timeoutSec: 600 }] },
      });
      syncStore(board.router);
    };

    it('propõe só os comandos que faltam e não grava até a pessoa aceitar', async () => {
      resetChecks();
      await open();
      const before = sentOf('settings.column.update').length;
      await userEvent.click(screen.getByRole('button', { name: /Sugerir pelo projeto/ }));
      answer({ profile });
      const group = await screen.findByRole('group', { name: 'Checagens sugeridas' });
      expect(
        within(group)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['npm run typecheck', 'npx vitest related {changed_files} --run', 'npm run test']);
      expect(sentOf('settings.column.update')).toHaveLength(before);

      await userEvent.click(within(group).getByRole('button', { name: 'Adicionar sugeridas' }));
      const patch = apply().patch.checks!;
      expect(patch.map((c) => c.command)).toEqual([
        'npm run lint',
        'npm run typecheck',
        'npx vitest related {changed_files} --run',
        'npm run test',
      ]);
      expect(screen.queryByRole('group', { name: 'Checagens sugeridas' })).toBeNull();
    });

    it('descartar não grava nada', async () => {
      resetChecks();
      await open();
      const before = sentOf('settings.column.update').length;
      await userEvent.click(screen.getByRole('button', { name: /Sugerir pelo projeto/ }));
      answer({ profile });
      await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
      expect(screen.queryByRole('group', { name: 'Checagens sugeridas' })).toBeNull();
      expect(sentOf('settings.column.update')).toHaveLength(before);
    });

    it('sem checagem reconhecida avisa e deixa a lista intacta', async () => {
      resetChecks();
      await open();
      const before = sentOf('settings.column.update').length;
      await userEvent.click(screen.getByRole('button', { name: /Sugerir pelo projeto/ }));
      answer({ profile: { ...profile, scripts: { build: 'x' }, tools: [] } });
      expect(await screen.findByText('Nenhuma checagem reconhecida neste projeto.')).toBeInTheDocument();
      expect(sentOf('settings.column.update')).toHaveLength(before);
      expect(reviewChecks().map((c) => c.command)).toEqual(['npm run lint']);
    });

    it('erro ao ler o projeto avisa e deixa a lista intacta', async () => {
      resetChecks();
      await open();
      await userEvent.click(screen.getByRole('button', { name: /Sugerir pelo projeto/ }));
      answer({ error: 'falhou' });
      expect(await screen.findByText('Não foi possível ler o projeto.')).toBeInTheDocument();
      expect(reviewChecks()).toHaveLength(1);
    });
  });
  describe('Modelo da fase', () => {
    const stories = () => cardOf('Histórias');
    const badge = (name: string) => within(stories()).getByRole('button', { name: `Modelo da fase ${name}` });

    it('a coluna Modelo tem um selo por coluna: revisor independente na Revisão, pelo esforço nas demais, terminal desabilitada', () => {
      show();
      expect(within(stories()).getByRole('columnheader', { name: 'Modelo' })).toBeInTheDocument();
      expect(badge('Revisão')).toHaveTextContent('revisor independente');
      // o board de teste tem uma regra ligada por Esforço da atividade
      expect(badge('Discovery')).toHaveTextContent('pelo esforço');
      const done = state().columns.find(
        (c) => c.category === 'done' && c.workflowId === state().workflows.find((w) => w.kind === 'parent')!.id,
      )!;
      expect(badge(done.name)).toBeDisabled();
      expect(badge(done.name)).toHaveTextContent('—');
    });

    it('clicar no selo abre o painel da fase e de novo fecha; o painel mostra Modelo da fase com Sem preferência', async () => {
      show();
      const b = badge('Discovery');
      expect(b).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(b);
      expect(b).toHaveAttribute('aria-pressed', 'true');
      expect(within(stories()).getByText('Modelo da fase', { selector: 'label' })).toBeInTheDocument();
      expect(within(stories()).getByText('Sem preferência')).toBeInTheDocument();
      await userEvent.click(b);
      expect(b).toHaveAttribute('aria-pressed', 'false');
      expect(within(stories()).queryByText('Modelo da fase', { selector: 'label' })).toBeNull();
    });

    it('escolher um modelo no painel envia settings.column.update com phaseModel', async () => {
      show();
      await userEvent.click(badge('Discovery'));
      const option = state().board.modelCatalog[0]!;
      await choose(within(stories()).getByRole('combobox', { name: 'Modelo' }), option.label);
      const sent = sentOf('settings.column.update').at(-1)!;
      expect(sent.patch.phaseModel).toMatch(new RegExp(`^${option.id}(@|$)`));
    });

    it('com um modelo que tem esforço, o seletor de nível aparece ao lado do modelo e grava o esforço escolhido', async () => {
      const option = state().board.modelCatalog.find((o) => o.efforts.length > 1)!;
      const [first, other] = option.efforts as [string, string];
      // a coluna já com o modelo da fase (o teste não passa as mensagens pelo roteador)
      useBoardStore.setState({
        state: {
          ...state(),
          columns: state().columns.map((c) => (c.name === 'Discovery' ? { ...c, phaseModel: `${option.id}@${first}` } : c)),
        },
      });
      show();
      await userEvent.click(badge('Discovery'));
      const effort = within(stories()).getByRole('combobox', { name: 'Esforço do modelo' });
      // os dois no mesmo par: o nível não fica fora do editor da fase
      expect(effort.closest('.model-editor')).toBe(within(stories()).getByRole('combobox', { name: 'Modelo' }).closest('.model-editor'));
      await choose(effort, effortLabel(other));
      expect(sentOf('settings.column.update').at(-1)!.patch.phaseModel).toBe(`${option.id}@${other}`);
    });

    it('o par modelo + nível quebra a linha e o nível tem largura própria (o jsdom não calcula layout: confere o CSS)', () => {
      const css = fs.readFileSync(path.join(__dirname, '../../src/webview/styles.css'), 'utf8');
      const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
      expect(rule('.model-editor')).toMatch(/flex-wrap:\s*wrap/);
      expect(rule('.model-editor .picker-trigger')).toMatch(/width:\s*auto/);
      expect(rule('.model-editor .rt-SelectTrigger')).toMatch(/flex:\s*0 0 auto/);
      expect(rule('.model-editor .rt-SelectTrigger')).toMatch(/min-width:\s*9rem/);
    });
  });
});
