import { choose, lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { Dialog } from '../../src/webview/components/Dialog';
import { Settings } from '../../src/webview/components/settings/Settings';
import { TypesSettings } from '../../src/webview/components/settings/TypesSettings';
import { useBoardStore, useHostSync } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
  // um tipo sem cards: é o único que pode ser apagado
  board.router.handle({
    type: 'settings.type.create',
    name: 'Sem uso',
    color: '#123456',
    defaultWorkflowId: board.router.snapshot().workflows[0]!.id,
  });
  syncStore(board.router);
});

describe('TypesSettings', () => {
  it('cada tipo tem a prévia do card com a cor e o nome; cor boa não mostra aviso', () => {
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    const t = useBoardStore.getState().state!.cardTypes[0]!;
    const preview = screen.getByLabelText(`Prévia do card do tipo ${t.name}`);
    expect(preview.querySelector('.card-bar')).toHaveTextContent(t.name);
    expect(preview.querySelector('.card-bar')).toHaveStyle({ background: t.color });
    expect(screen.queryByText('Texto difícil de ler nesta cor.')).toBeNull();
  });

  it('cor com pouco contraste mostra o aviso e as sugestões; um clique aplica a cor sugerida', async () => {
    const t = useBoardStore.getState().state!.cardTypes[0]!;
    board.router.handle({ type: 'settings.type.update', typeId: t.id, patch: { color: '#00aaaa' } });
    syncStore(board.router);
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    expect(screen.getByText('Texto difícil de ler nesta cor.')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Usar #009191'));
    expect(lastSent('settings.type.update')).toMatchObject({ typeId: t.id, patch: { color: '#009191' } });
    board.router.handle({ type: 'settings.type.update', typeId: t.id, patch: { color: t.color } });
    syncStore(board.router);
  });

  /** Abre a linha do tipo novo pelo botão do topo e devolve o campo de nome. */
  async function openDraft() {
    await userEvent.click(screen.getByRole('button', { name: 'Novo tipo' }));
    return screen.getByPlaceholderText('Nome do tipo');
  }

  it('o botão Novo tipo abre uma linha na tabela, com foco no nome, e fica desligado enquanto ela está aberta', async () => {
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    expect(screen.queryByPlaceholderText('Nome do tipo')).toBeNull();
    const name = await openDraft();
    expect(name).toHaveFocus();
    expect(name.closest('tr')).toHaveClass('draft-row');
    expect(screen.getByRole('button', { name: 'Novo tipo' })).toBeDisabled();
    // a prévia acompanha o nome digitado
    expect(screen.getByLabelText('Prévia do card do tipo Novo tipo')).toBeInTheDocument();
    await userEvent.type(name, 'Spike');
    expect(screen.getByLabelText('Prévia do card do tipo Spike')).toBeInTheDocument();
  });

  it('Enter cria o tipo com o workflow escolhido e fecha a linha', async () => {
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    const wf = useBoardStore.getState().state!.workflows[1]!;
    const name = await openDraft();
    await choose(within(name.closest('tr')!).getByRole('combobox', { name: 'Workflow' }), wf.name);
    await userEvent.type(name, 'Bug{Enter}');
    expect(lastSent('settings.type.create')).toMatchObject({ name: 'Bug', defaultWorkflowId: wf.id });
    expect(screen.queryByPlaceholderText('Nome do tipo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Novo tipo' })).toBeEnabled();
  });

  it('o botão Adicionar faz o mesmo que o Enter e fica desligado sem nome', async () => {
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    const name = await openDraft();
    expect(screen.getByRole('button', { name: 'Criar tipo' })).toBeDisabled();
    await userEvent.type(name, 'Melhoria');
    await userEvent.click(screen.getByRole('button', { name: 'Criar tipo' }));
    expect(lastSent('settings.type.create').name).toBe('Melhoria');
  });

  it('Enter com o nome vazio não envia nada', async () => {
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    await userEvent.type(await openDraft(), '   {Enter}');
    expect(sentOf('settings.type.create')).toHaveLength(0);
  });

  it('Esc e Cancelar fecham a linha sem criar', async () => {
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    await userEvent.type(await openDraft(), 'Rascunho{Escape}');
    expect(screen.queryByPlaceholderText('Nome do tipo')).toBeNull();
    await openDraft();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByPlaceholderText('Nome do tipo')).toBeNull();
    expect(sentOf('settings.type.create')).toHaveLength(0);
  });

  it('apagar abre o diálogo e só envia a exclusão depois de confirmar', async () => {
    render(
      <Theme>
        <TypesSettings />
        <Dialog />
      </Theme>,
    );
    const type = useBoardStore.getState().state!.cardTypes.find((t) => t.name === 'Sem uso')!;
    const row = screen.getByDisplayValue('Sem uso').closest('tr')!;
    await userEvent.click(within(row).getByTitle('Apagar'));
    // o diálogo pede confirmação; nada foi enviado ainda
    expect(useBoardStore.getState().dialog?.title).toBe('Apagar o tipo "Sem uso"?');
    expect(sentOf('settings.type.delete')).toHaveLength(0);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apagar' }));
    expect(lastSent('settings.type.delete')).toEqual({ type: 'settings.type.delete', typeId: type.id });
    expect(useBoardStore.getState().dialog).toBeNull();
  });

  it('cancelar o diálogo não apaga', async () => {
    render(
      <Theme>
        <TypesSettings />
        <Dialog />
      </Theme>,
    );
    const row = screen.getByDisplayValue('Sem uso').closest('tr')!;
    await userEvent.click(within(row).getByTitle('Apagar'));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(posted).not.toHaveBeenCalled();
  });

  it('tipo em uso tem o botão de apagar desligado', () => {
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    const story = useBoardStore
      .getState()
      .state!.cardTypes.find((t) => t.defaultWorkflowId === board.router.snapshot().workflows[0]!.id && t.name !== 'Sem uso')!;
    const row = screen.getByDisplayValue(story.name).closest('tr')!;
    expect(within(row).getByTitle('Tipo em uso')).toBeDisabled();
  });
});

describe('TypesSettings: skills por tipo', () => {
  it('as skills escolhidas no tipo já nascem em todo card novo dele', async () => {
    const s0 = useBoardStore.getState().state!;
    useBoardStore.setState({
      state: {
        ...s0,
        board: { ...s0.board, aiTool: 'claude' },
        harness: {
          ...s0.harness,
          skills: [
            {
              name: 'revisar-spec',
              description: 'Revisa a spec',
              enabled: true,
              mode: 'auto',
              path: '.claude/skills/revisar-spec/SKILL.md',
              content: '',
            },
          ],
        },
      },
    });
    const t = useBoardStore.getState().state!.cardTypes.find((x) => x.name !== 'Sem uso')!;
    render(
      <Theme>
        <TypesSettings />
      </Theme>,
    );
    const defaults = within(screen.getByLabelText(`Padrões do tipo ${t.name}`));
    await userEvent.click(defaults.getByRole('button', { name: /Escolher skills/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'revisar-spec' }));
    const sent = lastSent('settings.type.update');
    const field = useBoardStore.getState().state!.fieldDefs.find((f) => f.name === 'Skills')!;
    expect(sent).toMatchObject({ typeId: t.id, patch: { defaults: { [field.id]: ['revisar-spec'] } } });

    // no host, o card novo do tipo nasce com a skill
    board.router.handle(sent);
    const snap = board.router.snapshot();
    const cardId = board.router.createCard({
      typeId: t.id,
      columnId: snap.columns.find((c) => c.workflowId === t.defaultWorkflowId)!.id,
      parentId: null,
      title: 'Novo',
    });
    expect(board.router.snapshot().fieldValues.filter((v) => v.cardId === cardId && v.fieldId === field.id)[0]?.value).toEqual([
      'revisar-spec',
    ]);
  });
});

describe('Settings: menu lateral', () => {
  it('Modelos de IA vem logo depois do Harness de IA, antes de Agentes', () => {
    useBoardStore.setState({ settingsNavCollapsed: false, settingsTab: 'columns' });
    render(
      <Theme>
        <Settings />
      </Theme>,
    );
    const nav = screen.getByRole('navigation', { name: 'Seções das configurações' });
    const labels = within(nav)
      .getAllByRole('button')
      .map((x) => x.textContent);
    const at = (label: string) => labels.indexOf(label);
    expect(at('Modelos de IA')).toBe(at('Harness de IA') + 1);
    expect(at('Agentes')).toBe(at('Modelos de IA') + 1);
  });

  it('recolhe numa faixa de ícones: rótulos somem, as seções seguem acessíveis pelo nome e o estado fica lembrado', async () => {
    useBoardStore.setState({ settingsNavCollapsed: false, settingsTab: 'columns' });
    render(
      <Theme>
        <Settings />
      </Theme>,
    );
    expect(screen.getByLabelText('Nome do board')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recolher o menu' }));
    expect(useBoardStore.getState().settingsNavCollapsed).toBe(true);
    expect(screen.queryByLabelText('Nome do board')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Seções das configurações' });
    expect(nav).not.toHaveTextContent('Tipos de card');
    await userEvent.click(within(nav).getByRole('button', { name: 'Tipos de card' }));
    expect(useBoardStore.getState().settingsTab).toBe('types');
    // a instalação do MCP fica na seção da ferramenta, no Harness de IA, e não no menu
    expect(screen.queryByRole('button', { name: /MCP/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Expandir o menu' }));
    expect(nav).toHaveTextContent('Tipos de card');
    useBoardStore.setState({ settingsNavCollapsed: false });
  });
});

/** Liga o store às mensagens do host (como o App faz) junto com o conteúdo das Configurações. */
function SettingsWithHostSync() {
  useHostSync();
  return <Settings />;
}

describe('Settings: ida e volta com o Settings do editor', () => {
  it('o botão "Abrir no Settings do editor" manda ui.openIdeSettings', async () => {
    render(
      <Theme>
        <Settings />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no Settings do editor' }));
    expect(lastSent('ui.openIdeSettings')).toEqual({ type: 'ui.openIdeSettings', key: undefined });
  });

  it('ui.openSettings troca a aba e rola até a seção', () => {
    render(
      <Theme>
        <SettingsWithHostSync />
      </Theme>,
    );
    const scroll = vi.fn();
    const alvo = document.createElement('div');
    alvo.id = 'secao-teste';
    alvo.scrollIntoView = scroll;
    document.body.append(alvo);
    act(() =>
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'ui.openSettings', tab: 'harness', section: 'secao-teste' } })),
    );
    expect(useBoardStore.getState().settingsTab).toBe('harness');
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    alvo.remove();
  });

  it('ui.openView mostra o Diagnóstico', () => {
    render(
      <Theme>
        <SettingsWithHostSync />
      </Theme>,
    );
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'ui.openView', view: 'environment' } })));
    expect(useBoardStore.getState().view).toBe('environment');
  });
});
