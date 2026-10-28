import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { AgentModels } from '../../src/webview/components/settings/agentConnect/AgentModels';
import { ModelSuggestion } from '../../src/webview/components/settings/agentConnect/ModelSuggestion';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const state = () => useBoardStore.getState().state!;
const tool = () => state().board.aiTool;
/** Conectar agentes: os modelos do agente em uso (aba Modelos) e a sugestão de modelo do board, como na tela. */
const show = () =>
  render(
    <Theme>
      <AgentModels profile={state().board.aiProfiles.find((p) => p.id === tool())!} />
      <ModelSuggestion />
    </Theme>,
  );

describe('Conectar agentes: os modelos do agente', () => {
  it('Detectar modelos e Novo modelo ficam no topo; não há linha solta de adicionar', () => {
    show();
    expect(screen.getByRole('button', { name: 'Detectar modelos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo modelo' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('identificador')).toBeNull();
  });

  it('Novo modelo abre o rascunho, com foco no nome, e Adicionar grava na lista', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo modelo' }));
    expect(screen.getByRole('button', { name: 'Novo modelo' })).toBeDisabled();
    const draft = within(screen.getByLabelText('Modelo novo'));
    expect(draft.getByLabelText('Nome')).toHaveFocus();
    await userEvent.type(draft.getByLabelText('Nome'), 'Teste 9');
    await userEvent.type(draft.getByLabelText('Identificador na ferramenta'), 'teste-9');
    await userEvent.type(draft.getByLabelText('Esforços aceitos'), 'low, high');
    await userEvent.click(draft.getByRole('button', { name: 'Adicionar modelo' }));
    const added = lastSent('settings.models.set').catalog.find((m) => m.model === 'teste-9');
    expect(added).toMatchObject({ tool: tool(), label: 'Teste 9', efforts: ['low', 'high'], defaultEffort: 'low' });
    expect(screen.queryByLabelText('Modelo novo')).toBeNull();
  });

  it('com a lista lida da ferramenta, a tela diz a data da leitura; só a embutida, não diz (história 12)', () => {
    const { unmount } = show();
    expect(screen.queryByText(/lista lida da (ferramenta|documentação) em/)).toBeNull();
    unmount();
    const catalog = state().board.modelCatalog;
    const first = catalog.findIndex((m) => m.tool === tool());
    const readAt = new Date(2026, 9, 23, 15, 7).getTime();
    useBoardStore.setState({
      state: {
        ...state(),
        board: { ...state().board, modelCatalog: catalog.map((m, i) => (i === first ? { ...m, fromTool: true, readAt } : m)) },
      },
    });
    show();
    // o Claude Code não lista os modelos: a lista dele vem da página de modelos da documentação
    expect(screen.getByText(/lista lida da documentação em .*15:07/)).toBeInTheDocument();
  });

  it('o modelo que pede uma CLI mais nova que a instalada avisa, com o comando para atualizar', () => {
    const catalog = state().board.modelCatalog.map((m) =>
      m.id === 'claude:haiku' ? { ...m, label: 'Haiku 5.5', requires: '2.1.293', fromTool: true as const } : m,
    );
    const withVersion = (version: string) =>
      useBoardStore.setState({
        state: {
          ...state(),
          board: { ...state().board, modelCatalog: catalog },
          connections: { claude: { profileId: 'claude', step: 'models', status: 'connected', summary: { version } } },
        },
      });
    withVersion('2.1.280 (Claude Code)');
    const { unmount } = show();
    expect(
      screen.getByText('Pede o Claude Code v2.1.293 ou mais novo; o instalado é 2.1.280 (Claude Code). Rode claude update.'),
    ).toBeInTheDocument();
    unmount();
    withVersion('2.1.310 (Claude Code)');
    show();
    expect(screen.queryByText(/Pede o Claude Code/)).toBeNull();
  });

  it('o rascunho recusa um identificador que já existe', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo modelo' }));
    const draft = within(screen.getByLabelText('Modelo novo'));
    const existing = state().board.modelCatalog.find((m) => m.tool === tool())!;
    await userEvent.type(draft.getByLabelText('Identificador na ferramenta'), existing.model);
    expect(draft.getByRole('button', { name: 'Adicionar modelo' })).toBeDisabled();
    expect(draft.getByText('Já existe um modelo com este identificador.')).toBeInTheDocument();
  });

  it('renomear grava ao sair do campo; o esforço padrão sai do seletor', async () => {
    show();
    const m = state().board.modelCatalog.find((x) => x.tool === tool() && x.efforts.length > 1)!;
    const name = screen.getByLabelText(`Nome de ${m.model}`);
    await userEvent.clear(name);
    await userEvent.type(name, 'Outro nome');
    expect(sentOf('settings.models.set')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.models.set').catalog.find((x) => x.id === m.id)!.label).toBe('Outro nome');
    const other = m.efforts.find((e) => e !== m.defaultEffort)!;
    await choose(screen.getByRole('combobox', { name: `Esforço padrão de ${m.model}` }), other);
    expect(lastSent('settings.models.set').catalog.find((x) => x.id === m.id)!.defaultEffort).toBe(other);
  });

  it('o modelo padrão sai do seletor acima da tabela, e "A ferramenta escolhe" o tira', async () => {
    show();
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    const select = screen.getByRole('combobox', { name: 'Modelo padrão' });
    expect(select).toHaveTextContent('A ferramenta escolhe');
    await choose(select, m.label);
    const marked = lastSent('settings.models.set').catalog.filter((x) => x.tool === tool() && x.default);
    expect(marked.map((x) => x.id)).toEqual([m.id]);
  });

  it('remover tira o modelo do catálogo, sem confirmação', async () => {
    show();
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    await userEvent.click(screen.getByRole('button', { name: `Remover ${m.model} do catálogo` }));
    expect(lastSent('settings.models.set').catalog.some((x) => x.id === m.id)).toBe(false);
  });

  it('Sugestão de modelo: Montar nova regra abre o montador por cima da lista, com os botões no topo', async () => {
    show();
    const build = screen.getByRole('button', { name: 'Montar nova regra' });
    await userEvent.click(build);
    expect(build).toBeDisabled();
    const builder = within(screen.getByLabelText('Regra de sugestão'));
    await userEvent.type(builder.getByLabelText('Nome da regra'), 'Backend pesado');
    await userEvent.click(builder.getByRole('button', { name: 'Adicionar à lista' }));
    expect(lastSent('settings.modelRules.set').rules.at(-1)).toMatchObject({ name: 'Backend pesado', enabled: true });
  });

  it('Montar nova regra: não há campo "Fallback" nem botão para as políticas, e a regra vai sem reserva', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Montar nova regra' }));
    const builder = within(screen.getByLabelText('Regra de sugestão'));
    await userEvent.type(builder.getByLabelText('Nome da regra'), 'Sem reserva');
    expect(builder.getAllByRole('combobox', { name: 'Modelo' })).toHaveLength(1);
    expect(builder.queryByText('Fallback')).not.toBeInTheDocument();
    expect(builder.queryByRole('button', { name: 'Ir para as políticas de execução' })).not.toBeInTheDocument();
    await userEvent.click(builder.getByRole('button', { name: 'Adicionar à lista' }));
    const sent = lastSent('settings.modelRules.set').rules.at(-1);
    expect(sent).toMatchObject({ name: 'Sem reserva' });
    expect(sent).not.toHaveProperty('fallback');
  });

  it('o interruptor liga e desliga uma regra', async () => {
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    board.router.handle({
      type: 'settings.modelRules.set',
      rules: [{ id: 'r1', name: 'Teste', enabled: true, groups: [[{ fieldId: '@type', op: 'is', value: 'História' }]], model: m.id }],
    });
    syncStore(board.router);
    show();
    await userEvent.click(screen.getByRole('switch', { name: 'Regra Teste em uso' }));
    expect(lastSent('settings.modelRules.set').rules[0]!.enabled).toBe(false);
  });

  it('a tabela de modelos não tem coluna nem campo de preço', () => {
    show();
    expect(screen.queryByText(/Preço/)).toBeNull();
    expect(screen.queryByLabelText(/^Preço de /)).toBeNull();
  });
});

describe('Conectar agentes: modos rápidos do Cursor', () => {
  it('a chave só aparece no Cursor e grava a regra', async () => {
    show();
    expect(screen.queryByRole('switch', { name: 'Incluir os modos rápidos' })).toBeNull();
    board.router.handle({ type: 'settings.board.update', patch: { aiTool: 'cursor' } });
    syncStore(board.router);
    show();
    const toggle = screen.getAllByRole('switch', { name: 'Incluir os modos rápidos' }).at(-1)!;
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(lastSent('settings.rules.update')).toEqual({ type: 'settings.rules.update', patch: { includeFastModels: true } });
    board.router.handle({ type: 'settings.board.update', patch: { aiTool: 'claude' } });
  });
});

describe('Conectar agentes: preencher o modelo sugerido (RF01/RF07)', () => {
  it('sem regra de sugestão, o interruptor fica desabilitado e o aviso de dependência aparece', () => {
    board.router.handle({ type: 'settings.modelRules.set', rules: [] });
    syncStore(board.router);
    show();
    const toggle = screen.getByRole('switch', { name: 'Preencher o modelo sugerido automaticamente' });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/Depende de/)).toBeInTheDocument();
  });

  it('sem regra, o interruptor aparece desligado mesmo com a preferência gravada como ligada', () => {
    board.router.handle({ type: 'settings.rules.update', patch: { autoApplyModelSuggestion: true } });
    board.router.handle({ type: 'settings.modelRules.set', rules: [] });
    syncStore(board.router);
    show();
    const toggle = screen.getByRole('switch', { name: 'Preencher o modelo sugerido automaticamente' });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
  });

  it('com uma regra cadastrada, o interruptor fica habilitado e grava a mudança', async () => {
    const m = state().board.modelCatalog.find((x) => x.tool === tool())!;
    board.router.handle({
      type: 'settings.modelRules.set',
      rules: [{ id: 'r3', name: 'Teste', enabled: true, groups: [[{ fieldId: '@type', op: 'is', value: 'História' }]], model: m.id }],
    });
    syncStore(board.router);
    show();
    const toggle = screen.getByRole('switch', { name: 'Preencher o modelo sugerido automaticamente' });
    expect(toggle).toBeEnabled();
    await userEvent.click(toggle);
    expect(lastSent('settings.rules.update')).toEqual({ type: 'settings.rules.update', patch: { autoApplyModelSuggestion: false } });
  });
});

describe('regras de modelo em inglês', () => {
  it('os nomes do board padrão nas regras saem traduzidos: o campo, as opções e o nome das regras', async () => {
    const { ModelRulesEditor } = await import('../../src/webview/components/settings/ModelRulesEditor');
    const { setLocale } = await import('../../src/webview/i18n');
    const seeded = await seedBoard();
    seeded.router.handle({ type: 'settings.modelRules.suggest', tool: 'claude' });
    syncStore(seeded.router);
    setLocale('en');
    try {
      render(
        <Theme>
          <ModelRulesEditor />
        </Theme>,
      );
      expect(screen.getByText('Task effort low')).toBeInTheDocument();
      expect(screen.getByText('Task effort = Low')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recreate the "Task effort" rules' })).toBeInTheDocument();
    } finally {
      setLocale('pt-BR');
    }
  });
});
