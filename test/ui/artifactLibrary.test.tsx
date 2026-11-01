// A biblioteca de artefatos (Configurações › Harness): contador das abas, filtro de estado, busca por pasta, o
// interruptor de ativo, a árvore de pastas das skills e o alerta de skill incompatível com o agente do card.
import { posted, renderThemed, seedBoard, lastSent, sentOf } from './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentMeta, BoardArtifact } from '../../src/shared/artifacts';
import type { ExecProfile } from '../../src/shared/execution';
import { AgentBar } from '../../src/webview/components/card/AgentBar';
import { FieldsSection } from '../../src/webview/components/card/FieldsSection';
import { ArtifactsHarness } from '../../src/webview/components/settings/harness/ArtifactsHarness';
import { useBoardStore } from '../../src/webview/store/boardStore';

const artifact = (over: Partial<BoardArtifact> & Pick<BoardArtifact, 'kind' | 'name'>): BoardArtifact => ({
  id: `${over.kind}:${over.name}`,
  description: '',
  usage: 'contextual',
  origin: '',
  originTool: '',
  missing: false,
  skipped: [],
  files: [],
  body: '',
  path: '',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const agentMeta: AgentMeta = {
  skills: [],
  mcpServers: [],
  model: '',
  tools: { categories: [], native: { tool: '', allow: [], deny: [] } },
};

function library(artifacts: BoardArtifact[], skillFolders: string[] = []): void {
  const s = useBoardStore.getState().state!;
  act(() =>
    useBoardStore.setState({
      state: { ...s, harness: { ...s.harness, library: { directory: '/lib', artifacts, flowSkills: [], skillFolders } } },
    }),
  );
}

const rowNames = () =>
  screen.getAllByRole('listitem').flatMap((li) =>
    within(li)
      .queryAllByText(/^[a-z][a-z0-9/-]*$/, { selector: '.item-name' })
      .map((e) => e.textContent),
  );

beforeEach(async () => {
  await seedBoard();
  useBoardStore.setState({ harnessTopic: 'rules' });
  posted.mockClear();
});

describe('Biblioteca de artefatos', () => {
  it('a aba mostra o contador X/Y de ativos, no feminino para regras e skills', () => {
    library([
      artifact({ kind: 'rule', name: 'a', usage: 'always' }),
      artifact({ kind: 'rule', name: 'b', usage: 'off' }),
      artifact({ kind: 'agent', name: 'ag', agent: agentMeta }),
    ]);
    renderThemed(<ArtifactsHarness />);
    expect(within(screen.getByRole('tab', { name: /Regras/ })).getAllByText('1/2 ativas')[0]).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: /Agentes/ })).getAllByText('1/1 ativos')[0]).toBeInTheDocument();
  });

  it('o filtro Ativas/Inativas e a busca (inclusive pela pasta da skill) afunilam a lista', async () => {
    useBoardStore.setState({ harnessTopic: 'skill' });
    library([
      artifact({ kind: 'skill', name: 'api', folder: 'backend/node' }),
      artifact({ kind: 'skill', name: 'tela', folder: 'frontend', usage: 'off' }),
      artifact({ kind: 'skill', name: 'raiz', folder: '' }),
    ]);
    renderThemed(<ArtifactsHarness />);
    await userEvent.click(screen.getByRole('radio', { name: 'Inativas' }));
    expect(rowNames()).toEqual(['tela']);
    await userEvent.click(screen.getByRole('radio', { name: 'Ativas' }));
    expect(rowNames()).toEqual(['api', 'raiz']);
    await userEvent.click(screen.getByRole('radio', { name: 'Todas' }));
    await userEvent.type(screen.getByRole('searchbox'), 'backend');
    expect(rowNames()).toEqual(['api']);
  });

  it('o interruptor liga com o modo do tipo e desliga com off', async () => {
    library([artifact({ kind: 'rule', name: 'estilo', usage: 'off' }), artifact({ kind: 'rule', name: 'testes', usage: 'always' })]);
    renderThemed(<ArtifactsHarness />);
    await userEvent.click(screen.getByRole('switch', { name: 'Ativo: estilo' }));
    expect(lastSent('harness.selection.set')).toEqual({
      type: 'harness.selection.set',
      items: [{ kind: 'instructions', location: 'estilo' }],
      usage: 'always',
    });
    await userEvent.click(screen.getByRole('switch', { name: 'Ativo: testes' }));
    expect(lastSent('harness.selection.set')).toMatchObject({ items: [{ kind: 'instructions', location: 'testes' }], usage: 'off' });
  });

  it('o servidor MCP mantém Sempre/Pelo card só quando ativo e volta ao modo anterior ao ligar', async () => {
    useBoardStore.setState({ harnessTopic: 'mcp' });
    library([
      artifact({ kind: 'mcp', name: 'ligado', usage: 'always', origin: 'a.json#ligado' }),
      artifact({ kind: 'mcp', name: 'parado', usage: 'off', origin: 'a.json#parado' }),
    ]);
    renderThemed(<ArtifactsHarness />);
    expect(screen.getByRole('combobox', { name: 'Modo no board: ligado' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Modo no board: parado' })).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: 'Ativo: parado' }));
    expect(lastSent('harness.selection.set')).toMatchObject({ items: [{ kind: 'mcp', location: 'a.json#parado' }], usage: 'contextual' });
    expect(sentOf('harness.selection.set')).toHaveLength(1);
  });

  it('a árvore de pastas conta as subpastas, filtra a lista e cria pasta dentro da selecionada', async () => {
    useBoardStore.setState({ harnessTopic: 'skill' });
    library(
      [
        artifact({ kind: 'skill', name: 'api', folder: 'backend/node' }),
        artifact({ kind: 'skill', name: 'dados', folder: 'backend' }),
        artifact({ kind: 'skill', name: 'tela', folder: 'frontend/react' }),
      ],
      ['backend', 'backend/node', 'frontend', 'frontend/react'],
    );
    renderThemed(<ArtifactsHarness />);
    const tree = screen.getByRole('navigation', { name: 'Pastas de skills' });
    expect(within(tree).getByRole('button', { name: /^backend\s*2$/ })).toBeInTheDocument();
    expect(within(tree).getByRole('button', { name: /^Todas\s*3$/ })).toBeInTheDocument();
    await userEvent.click(within(tree).getByRole('button', { name: /^backend\s*2$/ }));
    expect(rowNames()).toEqual(['api', 'dados']);
    await userEvent.click(within(tree).getByRole('button', { name: /^node\s*1$/ }));
    expect(rowNames()).toEqual(['api']);

    await userEvent.click(within(tree).getByRole('button', { name: /Nova pasta/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome da pasta' }), 'Inválida');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(sentOf('harness.library.addFolder')).toHaveLength(0);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Nome da pasta' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome da pasta' }), 'cache{Enter}');
    expect(lastSent('harness.library.addFolder')).toMatchObject({ folder: 'backend/node/cache' });
  });

  it('Excluir pede confirmação e manda a seleção nula', async () => {
    library([artifact({ kind: 'rule', name: 'estilo', usage: 'always' })]);
    renderThemed(<ArtifactsHarness />);
    await userEvent.click(screen.getByRole('button', { name: 'Apagar: estilo' }));
    expect(useBoardStore.getState().dialog?.title).toBe('Apagar "estilo"?');
    act(() => useBoardStore.getState().dialog!.onConfirm());
    expect(lastSent('harness.selection.set')).toMatchObject({ items: [{ kind: 'instructions', location: 'estilo' }], usage: null });
  });
});

describe('Card: skills e agente', () => {
  function cardWith(skillTools: BoardArtifact['tools'], agentTools: BoardArtifact['tools']) {
    const s = useBoardStore.getState().state!;
    const card = s.cards[0]!;
    const field = s.fieldDefs.find((f) => f.name === 'Skills')!;
    const profile = {
      id: 'revisor',
      name: 'revisor',
      isDefault: false,
      scope: 'board',
      skills: [],
      mcpServers: [],
      tools: [],
      deniedTools: [],
    } as unknown as ExecProfile;
    act(() =>
      useBoardStore.setState({
        state: {
          ...s,
          cards: [{ ...card, execProfile: 'revisor' }, ...s.cards.slice(1)],
          fieldValues: [...s.fieldValues, { cardId: card.id, fieldId: field.id, value: ['migrar'] }],
          board: { ...s.board, execProfiles: [profile] },
          harness: {
            ...s.harness,
            library: {
              directory: '/lib',
              flowSkills: [],
              artifacts: [
                artifact({ kind: 'skill', name: 'migrar', tools: skillTools }),
                artifact({ kind: 'agent', name: 'revisor', agent: agentMeta, tools: agentTools }),
              ],
            },
          },
        },
      }),
    );
    return useBoardStore.getState().state!.cards[0]!;
  }

  it('avisa quando a skill vinculada pede tools que o agente do card não concede', () => {
    const card = cardWith(['read', 'shell', 'network'], ['read']);
    renderThemed(<AgentBar card={card} />);
    expect(screen.getByRole('alert')).toHaveTextContent('A skill migrar pede Terminal, Rede, que o agente revisor não concede.');
  });

  it('sem lacuna de tools não há alerta', () => {
    const card = cardWith(['read'], ['read', 'edit']);
    renderThemed(<AgentBar card={card} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o campo Rules não aparece mais no card', () => {
    const card = cardWith([], []);
    renderThemed(<FieldsSection card={card} />);
    expect(screen.queryByText('Rules')).toBeNull();
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });
});
