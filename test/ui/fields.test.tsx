import { confirmLast, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { ModelEditor } from '../../src/webview/components/FieldRenderer';
import { FieldsSettings } from '../../src/webview/components/settings/FieldsSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
  // os campos do board ficam fora desta tela: os testes de edição usam um campo personalizado
  board.router.handle({
    type: 'settings.field.create',
    name: 'Componentes',
    kind: 'multiselect',
    options: ['frontend', 'backend', 'infra', 'docs'],
    appliesToTypes: null,
    display: 'chip',
  });
});
beforeEach(() => syncStore(board.router));

const show = () =>
  render(
    <Theme>
      <FieldsSettings />
    </Theme>,
  );
const fieldNamed = (name: string) => useBoardStore.getState().state!.fieldDefs.find((f) => f.name === name)!;
const cardOf = (name: string) => screen.getByLabelText(`Campo ${name}`);

describe('FieldsSettings', () => {
  it('cada campo mostra o nome numa caixa de texto, o tipo com a explicação e a prévia no board', () => {
    show();
    const tags = cardOf('Componentes');
    expect(within(tags).getByLabelText('Nome')).toHaveValue('Componentes');
    expect(within(tags).getByText('Múltipla seleção')).toBeInTheDocument();
    expect(within(tags).getByText('Várias opções de uma lista que você define, como tags.')).toBeInTheDocument();
    expect(within(tags).getByLabelText('Prévia no card')).toHaveTextContent('frontend');
  });

  it('renomear grava ao sair do campo', async () => {
    show();
    const name = within(cardOf('Componentes')).getByLabelText('Nome');
    await userEvent.clear(name);
    await userEvent.type(name, 'Áreas');
    expect(sentOf('settings.field.update')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.field.update')).toEqual({
      type: 'settings.field.update',
      fieldId: fieldNamed('Componentes').id,
      patch: { name: 'Áreas' },
    });
  });

  it('trocar como aparece no board grava a exibição', async () => {
    show();
    await userEvent.click(within(cardOf('Componentes')).getByRole('radio', { name: 'Nome: valor' }));
    expect(lastSent('settings.field.update').patch).toEqual({ display: 'inline' });
  });

  it('opções: Enter inclui, o X tira', async () => {
    show();
    const tags = cardOf('Componentes');
    await userEvent.type(within(tags).getByPlaceholderText('Nova opção'), 'mobile{Enter}');
    expect(lastSent('settings.field.update').patch).toEqual({ options: [...fieldNamed('Componentes').options, 'mobile'] });
    await userEvent.click(within(tags).getByRole('button', { name: 'Tirar a opção docs' }));
    expect(lastSent('settings.field.update').patch).toEqual({ options: fieldNamed('Componentes').options.filter((o) => o !== 'docs') });
  });

  it('desligar "Todos os tipos" marca todos, e desmarcar um grava a lista', async () => {
    show();
    const tags = cardOf('Componentes');
    await userEvent.click(within(tags).getByRole('switch'));
    const types = useBoardStore.getState().state!.cardTypes;
    expect(lastSent('settings.field.update').patch).toEqual({ appliesToTypes: types.map((t) => t.id) });
  });

  it('os campos do board não aparecem, e a descrição diz quais são', () => {
    show();
    for (const name of ['Fase', 'Tags', 'Modelo', 'Skills', 'Rules', 'MCPs', 'Esforço da atividade'])
      expect(screen.queryByLabelText(`Campo ${name}`)).toBeNull();
    expect(
      screen.getByText(/Os campos do board \(Fase, Tags, Modelo, Skills, Rules, MCPs, Esforço da atividade\) não aparecem aqui/),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Campo /)).toHaveLength(1);
  });

  it('sem campo personalizado, a lista diz como criar o primeiro', () => {
    const s = useBoardStore.getState().state!;
    useBoardStore.setState({ state: { ...s, fieldDefs: s.fieldDefs.filter((f) => f.name !== 'Componentes') } });
    show();
    expect(screen.getByText('Nenhum campo personalizado. Use "Novo campo" para criar um.')).toBeInTheDocument();
  });

  it('o campo novo não oferece o tipo Modelo de IA, que é o do board', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    await userEvent.click(within(screen.getByLabelText('Campo novo')).getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'Texto' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Modelo de IA' })).toBeNull();
  });

  it('o nome de um campo do board é recusado antes de criar, mesmo sem acento', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    const draft = screen.getByLabelText('Campo novo');
    await userEvent.type(within(draft).getByLabelText('Nome'), 'esforco da atividade');
    expect(within(draft).getByText('"esforco da atividade" é o nome de um campo do board; escolha outro nome.')).toBeInTheDocument();
    expect(within(draft).getByRole('button', { name: 'Criar campo' })).toBeDisabled();
    await userEvent.type(within(draft).getByLabelText('Nome'), ' estimada');
    expect(within(draft).getByRole('button', { name: 'Criar campo' })).toBeEnabled();
  });

  it('Novo campo abre o rascunho no topo; escolher o tipo mostra a explicação e Criar envia', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    const draft = screen.getByLabelText('Campo novo');
    expect(screen.getByRole('button', { name: 'Novo campo' })).toBeDisabled();
    const name = within(draft).getByLabelText('Nome');
    expect(name).toHaveFocus();
    await userEvent.type(name, 'Prazo');
    await userEvent.click(within(draft).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Data' }));
    expect(within(draft).getByText(/Uma data, como um prazo\./)).toBeInTheDocument();
    await userEvent.click(within(draft).getByRole('button', { name: 'Criar campo' }));
    expect(lastSent('settings.field.create')).toMatchObject({
      name: 'Prazo',
      kind: 'date',
      display: 'badge',
      options: [],
      appliesToTypes: null,
    });
    // o rascunho só fecha quando o host confirma
    expect(screen.getByLabelText('Campo novo')).toBeInTheDocument();
    confirmLast();
    await waitFor(() => expect(screen.queryByLabelText('Campo novo')).toBeNull());
  });

  it('campo de seleção só pode ser criado com ao menos uma opção', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    const draft = screen.getByLabelText('Campo novo');
    await userEvent.type(within(draft).getByLabelText('Nome'), 'Prioridade');
    await userEvent.click(within(draft).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Seleção' }));
    expect(within(draft).getByRole('button', { name: 'Criar campo' })).toBeDisabled();
    await userEvent.type(within(draft).getByPlaceholderText('Nova opção'), 'Alta{Enter}');
    await userEvent.click(within(draft).getByRole('button', { name: 'Criar campo' }));
    expect(lastSent('settings.field.create')).toMatchObject({ name: 'Prioridade', kind: 'select', options: ['Alta'] });
  });

  it('Esc no nome e Cancelar descartam o rascunho sem criar', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    await userEvent.type(within(screen.getByLabelText('Campo novo')).getByLabelText('Nome'), 'x{Escape}');
    expect(screen.queryByLabelText('Campo novo')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Novo campo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(sentOf('settings.field.create')).toHaveLength(0);
  });
});

describe('ModelEditor: catálogo de todos os perfis ligados', () => {
  const option = (tool: 'claude' | 'kimi', model: string, label: string) => ({
    id: `${tool}:${model}`,
    tool,
    model,
    label,
    efforts: [],
    defaultEffort: null,
  });
  const setProfiles = (enabled: (id: string) => boolean) => {
    const s = useBoardStore.getState().state!;
    useBoardStore.setState({
      state: {
        ...s,
        board: {
          ...s.board,
          modelCatalog: [option('claude', 'opus', 'Opus X'), option('kimi', 'k3', 'Kimi K3')],
          aiProfiles: s.board.aiProfiles.map((p) => ({ ...p, enabled: enabled(p.id) })),
        },
      },
    });
  };
  const open = async (value: string | null) => {
    render(
      <Theme>
        <ModelEditor part="model" value={value} onChange={() => {}} />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Modelo' }));
  };
  const groupLabels = () =>
    screen
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id!)?.textContent);

  it('um grupo por perfil ligado', async () => {
    setProfiles((id) => id === 'claude' || id === 'kimi');
    await open(null);
    expect(groupLabels()).toEqual(['Claude Code', 'Kimi Code']);
    expect(screen.getByRole('option', { name: 'Kimi K3' })).toBeInTheDocument();
  });

  it('digitar no filtro deixa só os modelos com aquele nome, e o grupo do outro agente some', async () => {
    setProfiles((id) => id === 'claude' || id === 'kimi');
    await open(null);
    await userEvent.type(screen.getByRole('textbox', { name: 'Filtrar opções' }), 'k3');
    expect(groupLabels()).toEqual(['Kimi Code']);
    expect(screen.getByRole('option', { name: 'Kimi K3' })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Filtrar opções' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Filtrar opções' }), 'nenhum-modelo-assim');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Nada com esse nome.')).toBeInTheDocument();
  });

  it('o perfil desligado some', async () => {
    setProfiles((id) => id === 'claude');
    await open(null);
    expect(groupLabels()).toEqual(['Claude Code']);
    expect(screen.queryByRole('option', { name: 'Kimi K3' })).toBeNull();
  });

  it('o valor fora do catálogo continua visível', async () => {
    setProfiles(() => true);
    await open('claude:apagado');
    expect(screen.getAllByText('claude:apagado (fora do catálogo)').length).toBeGreaterThan(0);
  });
});
