import { lastSent, renderThemed, seedBoard, confirmLast, sentOf } from './setup';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BoardLibrary } from '../../src/webview/components/settings/harness/BoardLibrary';
import { Dialog } from '../../src/webview/components/Dialog';
import { selectionOf, type BoardArtifact } from '../../src/shared/artifacts';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeEach(async () => {
  await seedBoard();
});

describe('biblioteca do board nas configurações', () => {
  it.each(['Criar', 'Assistente guiado'])('isola %s de subagentes em um modal e devolve o foco ao sair', async (action) => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByRole('tab', { name: /^Sub-agentes/ }));
    const trigger = screen.getByRole('button', { name: action });
    await userEvent.click(trigger);
    const modal = await screen.findByRole('dialog', { name: 'Criar subagente' });
    expect(screen.queryByRole('searchbox', { name: 'Buscar na biblioteca' })).toBeNull();
    const name = within(modal).getByRole('textbox', { name: 'Nome' });
    await userEvent.type(name, 'revisor');
    await userEvent.click(document.querySelector('.rt-BaseDialogOverlay')!);
    expect(name).toHaveValue('revisor');
    expect(modal).toBeInTheDocument();
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    ['Regras', 'ai.suggestRules'],
    ['Skills', 'ai.suggestSkills'],
    ['Sub-agentes', 'ai.suggestAgents'],
  ] as const)('gera %s, abre o chat do editor e mostra loading até a IA terminar', async (tab, command) => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
    const button = screen.getByRole('button', { name: 'Gerar com base no projeto' });
    await userEvent.click(button);
    expect(lastSent(command)).toEqual({ type: command });
    expect(lastSent('ui.showChat')).toEqual({ type: 'ui.showChat' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Gerar com base no projeto');
    expect(button.querySelector('[style*="visibility: hidden"]')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Aguarde a resposta da IA.');
    await userEvent.click(button);
    expect(sentOf(command)).toHaveLength(1);
    act(() => {
      const state = useBoardStore.getState().state!;
      useBoardStore.setState({ state: { ...state, chat: { ...state.chat, busy: true } } });
    });
    confirmLast();
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    act(() => {
      const state = useBoardStore.getState().state!;
      useBoardStore.setState({ state: { ...state, chat: { ...state.chat, busy: false } } });
    });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('mostra falha ao iniciar e permite tentar novamente', async () => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    const button = screen.getByRole('button', { name: 'Gerar com base no projeto' });
    await userEvent.click(button);
    confirmLast(false, 'Ferramenta indisponível.');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ferramenta indisponível.');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button).toHaveAttribute('aria-busy', 'true');
    confirmLast();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('mostra a pasta e permite trocar o destino sem selecionar uma ferramenta', async () => {
    renderThemed(<BoardLibrary />);
    const field = screen.getByRole('textbox', { name: 'Pasta da biblioteca' });
    expect(field).toHaveValue(useBoardStore.getState().state!.harness.library!.directory);
    await userEvent.clear(field);
    await userEvent.type(field, '/dados/biblioteca');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    expect(lastSent('harness.library.directory')).toEqual({ type: 'harness.library.directory', dir: '/dados/biblioteca' });
    expect(screen.getByText('A pasta informada será o local onde os artefatos serão guardados.')).toBeInTheDocument();
    expect(screen.queryByText(/^Você pode colar pastas de skills aqui/)).toBeNull();
  });

  it('agrupa a prévia por tipo e importa os artefatos selecionados', async () => {
    act(() => {
      const state = useBoardStore.getState().state!;
      useBoardStore.setState({
        state: {
          ...state,
          harness: {
            ...state.harness,
            library: {
              ...state.harness.library!,
              preview: {
                directory: '/origem',
                items: [
                  { key: '0', kind: 'skill', name: 'react', description: '' },
                  { key: '1', kind: 'rule', name: 'AGENTS.md', description: '' },
                  { key: '2', kind: 'agent', name: 'revisor', description: '' },
                  { key: '3', kind: 'mcp', name: 'memoria', description: '' },
                ],
              },
            },
          },
        },
      });
    });
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByText('Importar artefatos'));
    const importArea = within(screen.getByText('Importar artefatos').closest('details')!);
    await userEvent.click(importArea.getByRole('tab', { name: /^Skills/ }));
    expect(screen.getByRole('checkbox', { name: 'react' })).toBeChecked();
    await userEvent.click(importArea.getByRole('tab', { name: /^MCPs/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'memoria' }));
    await userEvent.click(screen.getByRole('button', { name: 'Importar selecionados (3)' }));
    expect(lastSent('harness.library.apply')).toEqual({ type: 'harness.library.apply', keys: ['0', '1', '2'] });
    confirmLast();
    // O resumo vem no estado enviado pelo host, sem mensagem otimista de sucesso.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Importar selecionados (4)' })).toBeEnabled());
  });

  it('escolhe uma pasta para todos os tipos e permite atualizar a lista', async () => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByText('Importar artefatos'));
    await userEvent.click(screen.getByRole('button', { name: 'Escolher pasta' }));
    expect(lastSent('harness.library.pickArtifacts')).toEqual({ type: 'harness.library.pickArtifacts' });
    confirmLast();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar lista' }));
    expect(lastSent('harness.refresh')).toEqual({ type: 'harness.refresh' });
  });

  it('o assistente de regras revisa AGENTS.md e só fecha após salvar', async () => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByRole('tab', { name: /^Regras/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Assistente guiado' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Projeto e objetivo' }), 'Usar contratos do projeto');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    for (let part = 0; part < 5; part++) {
      await userEvent.click(screen.getByRole('button', { name: 'Usar este exemplo' }));
      await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    }
    expect(screen.queryByText(/^Detectado no projeto:/)).toBeNull();
    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveValue('AGENTS.md');
    expect(screen.queryByRole('textbox', { name: 'Descrição' })).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Conteúdo' }) as HTMLTextAreaElement).value).toContain('Usar contratos do projeto');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    expect(lastSent('harness.library.save')).toMatchObject({ input: { kind: 'rule', name: 'AGENTS.md' } });
    expect(screen.getByRole('textbox', { name: 'Conteúdo' })).toBeInTheDocument();
    confirmLast();
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Conteúdo' })).toBeNull());
  });
});

it('alternar JSON e formulário MCP preserva variáveis e cabeçalhos sem apagar edições', async () => {
  renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByRole('tab', { name: /^MCPs/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Criar' }));
  await userEvent.type(await screen.findByRole('textbox', { name: 'Nome' }), 'memoria');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Editar JSON diretamente' }));
  const json = screen.getByRole('textbox', { name: 'Definição JSON do MCP' });
  await userEvent.clear(json);
  await userEvent.paste(
    JSON.stringify({ command: 'node', args: ['servidor.js'], env: { TOKEN: 'local' }, headers: { Authorization: 'local' } }),
  );
  await userEvent.click(screen.getByRole('checkbox', { name: 'Editar JSON diretamente' }));
  expect(screen.getByRole('textbox', { name: 'Comando' })).toHaveValue('node');
  await userEvent.clear(screen.getByRole('textbox', { name: 'Comando' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Comando' }), 'node-local');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
  expect(lastSent('harness.library.save')).toMatchObject({
    input: {
      kind: 'mcp',
      name: 'memoria',
      server: { command: 'node-local', args: ['servidor.js'], env: { TOKEN: 'local' }, headers: { Authorization: 'local' } },
    },
  });
  confirmLast();
});

it('permite preencher a finalidade do MCP existente e preserva a configuração ao salvar', async () => {
  renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByRole('tab', { name: /^MCPs/ }));
  const mcpCredential = { secretRef: 'a'.repeat(64), transport: 'stdio', review: 'reviewed', available: true };
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'harness.library.content',
          input: { id: 'mcp-github', kind: 'mcp', name: 'github', description: '', body: '', mcpCredential },
        },
      }),
    );
  });
  const purpose = screen.getByRole('textbox', { name: 'Para que serve este MCP?' });
  expect(screen.queryByRole('textbox', { name: 'Definição JSON do MCP' })).toBeNull();
  expect(purpose.tagName).toBe('TEXTAREA');
  await userEvent.type(purpose, 'Consulta issues e pull requests.');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
  expect(lastSent('harness.library.save')).toMatchObject({
    input: { id: 'mcp-github', kind: 'mcp', description: 'Consulta issues e pull requests.' },
  });
  expect(lastSent('harness.library.save')!.input).not.toHaveProperty('server');
  confirmLast();
});

it('filtra por contém sem perder seleções de outras abas e mantém abas vazias', async () => {
  const state = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: {
      ...state,
      harness: {
        ...state.harness,
        library: {
          ...state.harness.library!,
          preview: {
            directory: '/source',
            items: [
              { key: 'r', kind: 'rule', name: 'AGENTS.md', description: '' },
              { key: 'a', kind: 'skill', name: 'react-auth', description: 'Autenticação' },
              { key: 'b', kind: 'skill', name: 'react-state', description: 'Estado' },
            ],
          },
        },
      },
    },
  });
  renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByText('Importar artefatos'));
  const area = within(screen.getByText('Importar artefatos').closest('details')!);
  expect(area.getByRole('tab', { name: /^MCPs/ })).toHaveTextContent('0');
  expect(area.getByRole('tab', { name: /^Subagentes/ })).toHaveTextContent('0');
  await userEvent.click(area.getByRole('checkbox', { name: 'AGENTS.md' }));
  await userEvent.click(area.getByRole('tab', { name: /^Skills/ }));
  await userEvent.type(area.getByRole('searchbox', { name: 'Filtrar Skills' }), 'AUTH');
  expect(area.getByRole('checkbox', { name: 'react-auth' })).toBeChecked();
  expect(area.queryByRole('checkbox', { name: 'react-state' })).toBeNull();
  await userEvent.click(area.getByRole('tab', { name: /^Regras/ }));
  expect(area.getByRole('checkbox', { name: 'AGENTS.md' })).not.toBeChecked();
  await userEvent.click(area.getByRole('button', { name: 'Importar selecionados (2)' }));
  expect(lastSent('harness.library.apply')).toEqual({ type: 'harness.library.apply', keys: ['a', 'b'] });
  confirmLast();
});

it('lembra o aviso dispensado e permite exibi-lo novamente', async () => {
  localStorage.removeItem('faz-ai.harness.warning.rule');
  useBoardStore.setState({ harnessTopic: 'rules' });
  const view = renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar e não exibir mais' }));
  expect(screen.queryByText(/^As regras entram desligadas:/)).toBeNull();
  view.unmount();
  renderThemed(<BoardLibrary />);
  confirmLast();
  expect(screen.queryByText(/^As regras entram desligadas:/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Exibir aviso sobre os artefatos' }));
  expect(screen.getByText(/^As regras entram desligadas:/)).toBeInTheDocument();
  localStorage.removeItem('faz-ai.harness.warning.rule');
});

it.each([
  ['Regras', 'Projeto e objetivo', 5],
  ['Skills', 'Quando usar', 3],
] as const)('o assistente de %s explica cada seção e não inclui exemplos de etapas puladas', async (tab, first, remaining) => {
  renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tab}`) }));
  await userEvent.click(screen.getByRole('button', { name: 'Assistente guiado' }));
  const field = await screen.findByRole('textbox', { name: first });
  expect(field).toHaveAttribute('placeholder');
  expect(field.getAttribute('placeholder')!.length).toBeGreaterThan(40);
  expect(field).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  expect(screen.getByRole('list', { name: 'Etapas do assistente' }).querySelector('[aria-current="step"]')).toHaveTextContent(first);
  await userEvent.click(screen.getByRole('button', { name: 'Usar este exemplo' }));
  const example = (field as HTMLTextAreaElement).value;
  expect(field.getAttribute('placeholder')).toContain(`Exemplo:\n${example}`);
  expect(field.getAttribute('placeholder')!.split('\n\nExemplo:')[0]).not.toBe(example);
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  for (let part = 0; part < remaining; part++) {
    await userEvent.click(screen.getByRole('button', { name: 'Pular esta parte' }));
  }
  const body = screen.getByRole('textbox', { name: 'Conteúdo' });
  expect((body as HTMLTextAreaElement).value).toContain(example);
  expect((body as HTMLTextAreaElement).value.match(/^## /gm)).toHaveLength(1);
  await userEvent.clear(body);
  await userEvent.type(body, 'Revisão manual preservada');
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pular esta parte' }));
  expect(screen.getByRole('textbox', { name: 'Conteúdo' })).toHaveValue('Revisão manual preservada');
});

function seedSkills(kind: BoardArtifact['kind'] = 'skill') {
  const artifacts: BoardArtifact[] = ['alpha', 'beta', 'gamma'].map((name, index) => ({
    id: `skill-${index}`,
    kind,
    name,
    description: `Skill ${name}`,
    usage: 'contextual',
    origin: `/origem/${name}/SKILL.md`,
    originTool: 'claude',
    missing: false,
    skipped: [],
    files: [],
    body: '',
    path: `/biblioteca/${name}/SKILL.md`,
    createdAt: 0,
    updatedAt: 0,
  }));
  const state = useBoardStore.getState().state!;
  useBoardStore.setState({
    harnessTopic: 'skill',
    state: {
      ...state,
      harness: { ...state.harness, library: { ...state.harness.library!, artifacts } },
      harnessSelection: artifacts.map(selectionOf),
    },
  });
  return artifacts;
}

it('seleciona skills entre filtros e aplica o modo em massa sem oferecer atualização da origem', async () => {
  const artifacts = seedSkills();
  renderThemed(<BoardLibrary />);
  confirmLast();
  const actions = within(screen.getByRole('group', { name: 'Ações em massa de skills' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar skill: alpha' }));
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' }), 'beta');
  expect(screen.queryByRole('checkbox', { name: 'Selecionar skill: alpha' })).toBeNull();
  await userEvent.click(actions.getByRole('checkbox', { name: 'Selecionar skills visíveis' }));
  expect(actions.getByText('2 selecionados')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Atualizar da origem' })).toBeNull();
  await userEvent.click(actions.getByRole('button', { name: 'Desligado' }));
  expect(lastSent('harness.selection.set')).toEqual({
    type: 'harness.selection.set',
    items: artifacts.slice(0, 2).map((a) => ({ kind: 'skill', location: a.origin })),
    usage: 'off',
  });
  confirmLast(false, 'Falha ao gravar.');
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao gravar.');
  expect(actions.getByText('2 selecionados')).toBeInTheDocument();
  await userEvent.click(actions.getByRole('button', { name: 'Sempre' }));
  confirmLast();
  await waitFor(() => expect(actions.queryByText('2 selecionados')).toBeNull());
  expect(lastSent('harness.selection.set')).toMatchObject({ usage: 'always' });
});

it('excluir skills em massa pede confirmação e mantém a seleção ao cancelar', async () => {
  const artifacts = seedSkills();
  renderThemed(
    <>
      <BoardLibrary />
      <Dialog />
    </>,
  );
  confirmLast();
  const actions = within(screen.getByRole('group', { name: 'Ações em massa de skills' }));
  await userEvent.click(actions.getByRole('checkbox', { name: 'Selecionar skills visíveis' }));
  await userEvent.click(actions.getByRole('button', { name: 'Excluir selecionadas' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByRole('heading')).toHaveTextContent('Excluir 3 artefatos da biblioteca?');
  expect(screen.getByRole('dialog')).toHaveTextContent('alpha');
  expect(screen.getByRole('dialog')).toHaveTextContent('gamma');
  expect(sentOf('harness.selection.set')).toHaveLength(0);
  await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
  expect(actions.getByText('3 selecionados')).toBeInTheDocument();
  await userEvent.click(actions.getByRole('button', { name: 'Excluir selecionadas' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
  expect(lastSent('harness.selection.set')).toEqual({
    type: 'harness.selection.set',
    items: artifacts.map((a) => ({ kind: 'skill', location: a.origin })),
    usage: null,
  });
  confirmLast();
  await waitFor(() => expect(actions.queryByText('3 selecionados')).toBeNull());
});

it.each([
  ['agent', 'Sub-agentes', 'subagentes', 'subagente', 'Disponível no board', 'contextual'],
  ['mcp', 'MCPs', 'MCPs', 'MCP', 'Desligado', 'off'],
] as const)(
  'seleciona e altera %s em massa, exclui com confirmação e não oferece atualizar origem',
  async (kind, tab, plural, singular, action, usage) => {
    const artifacts = seedSkills(kind);
    renderThemed(
      <>
        <BoardLibrary />
        <Dialog />
      </>,
    );
    confirmLast();
    await userEvent.click(screen.getByRole('tab', { name: new RegExp('^' + tab) }));
    const actions = within(screen.getByRole('group', { name: 'Ações em massa de ' + plural }));
    expect(screen.queryByRole('button', { name: 'Atualizar da origem' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar ' + singular + ': alpha' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' }), 'beta');
    await userEvent.click(actions.getByRole('checkbox', { name: 'Selecionar ' + plural + ' visíveis' }));
    expect(actions.getByText('2 selecionados')).toBeInTheDocument();
    if (kind === 'agent') {
      expect(actions.queryByRole('button', { name: 'Sempre' })).toBeNull();
      expect(actions.queryByRole('button', { name: 'Desligado' })).toBeNull();
    }
    await userEvent.click(actions.getByRole('button', { name: action }));
    expect(lastSent('harness.selection.set')).toMatchObject({
      items: artifacts.slice(0, 2).map((a) => ({ kind, location: a.origin })),
      usage,
    });
    confirmLast();
    await waitFor(() => expect(actions.queryByText('2 selecionados')).toBeNull());
    await userEvent.click(actions.getByRole('checkbox', { name: 'Selecionar ' + plural + ' visíveis' }));
    await userEvent.click(actions.getByRole('button', { name: 'Excluir selecionadas' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('beta');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
    expect(lastSent('harness.selection.set')).toMatchObject({ items: [{ kind, location: artifacts[1]!.origin }], usage: null });
    confirmLast();
  },
);

it('mostra a descrição do MCP em vez do comando e orienta quando ela está ausente', async () => {
  const artifacts = seedSkills('mcp');
  const state = useBoardStore.getState().state!;
  act(() =>
    useBoardStore.setState({
      state: {
        ...state,
        harness: {
          ...state.harness,
          library: {
            ...state.harness.library!,
            artifacts: artifacts.map((a, i) => ({
              ...a,
              description: i === 0 ? 'Consulta issues e pull requests' : 'npx',
              mcpSummary: 'npx',
            })),
          },
        },
      },
    }),
  );
  renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByRole('tab', { name: /^MCPs/ }));
  expect(screen.getByText('Consulta issues e pull requests')).toBeInTheDocument();
  expect(screen.getAllByText('Sem descrição cadastrada. Use Editar para explicar o que este MCP oferece e quando usá-lo.')).toHaveLength(2);
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' }), 'pull requests');
  expect(screen.getByRole('checkbox', { name: 'Selecionar MCP: alpha' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Selecionar MCP: beta' })).toBeNull();
});
