import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { choose, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { baseInfo, type Agent, type HarnessItem } from '../../src/shared/harness';
import { AgentEditor } from '../../src/webview/components/settings/harness/AgentEditor';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardState } from '../../src/shared/model';

const agent: Agent = {
  name: 'revisor',
  description: 'Revisa',
  model: '',
  modelValue: '',
  scope: 'project',
  path: '/abs/.claude/agents/revisor.md',
  location: '.claude/agents/revisor.md',
  content: '',
  body: 'instruções',
  tools: ['Read', 'mcp__github__*'],
  deniedTools: [],
  skills: [],
  mcp: [],
  seed: false,
  readonly: false,
  background: false,
};

const mcp = (name: string): HarnessItem => ({
  kind: 'mcp',
  scope: 'project',
  name,
  description: '',
  path: '/abs/.mcp.json',
  location: '.mcp.json',
  layout: 'entry',
});

const setState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};

beforeEach(async () => {
  await seedBoard();
  setState((s) => ({
    board: { ...s.board, aiTool: 'claude' },
    harness: {
      ...s.harness,
      library: undefined,
      inventory: [{ tool: 'claude', installed: true, items: [mcp('github'), mcp('postgres')] }],
    },
    harnessSelection: [
      { kind: 'mcp', location: '.mcp.json#github', usage: 'contextual' },
      { kind: 'mcp', location: '.mcp.json#postgres', usage: 'contextual' },
    ],
  }));
  posted.mockClear();
});

const renderEditor = (a: Agent, tool: 'claude' | 'cursor' = 'claude') =>
  renderThemed(<AgentEditor agent={a} tool={baseInfo(tool)} onClose={() => {}} />);

describe('editor de agente: Claude Code', () => {
  it('as ferramentas são listas marcáveis por grupo: marcar e desmarcar grava a lista inteira', async () => {
    renderEditor(agent);
    expect(screen.getByRole('checkbox', { name: 'Read' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Grep' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Grep' }));
    expect(lastSent('harness.agent.update')).toEqual({
      type: 'harness.agent.update',
      name: 'revisor',
      scope: 'project',
      patch: { tools: ['Read', 'mcp__github__*', 'Grep'] },
    });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Read' }));
    expect(lastSent('harness.agent.update').patch).toEqual({ tools: ['mcp__github__*'] });
  });

  it('o grupo que amplia o escopo avisa, e o de leitura não; as ferramentas que o Claude Code removeu não aparecem', () => {
    renderEditor(agent);
    const groups = screen.getAllByRole('group');
    const group = (title: RegExp) => within(groups.find((g) => title.test(g.querySelector('legend')?.textContent ?? ''))!);
    // o aviso fica na legenda; as negadas ficam numa lista à parte, sem aviso
    expect(group(/^Edição de arquivos/).getAllByText('amplia o escopo').length).toBeGreaterThan(0);
    expect(group(/^Leitura/).queryByText('amplia o escopo')).toBeNull();
    for (const name of ['Bash', 'WebFetch', 'Agent', 'Write']) expect(screen.getAllByRole('checkbox', { name })[0]).toBeInTheDocument();
    for (const gone of ['AskUserQuestion', 'EnterPlanMode', 'MultiEdit']) expect(screen.queryByRole('checkbox', { name: gone })).toBeNull();
  });

  it('o que o arquivo já tem e a lista não conhece aparece como chip marcado que dá para tirar', async () => {
    renderEditor(agent);
    await userEvent.click(screen.getByRole('button', { name: /^mcp__github__\*/ }));
    expect(lastSent('harness.agent.update').patch).toEqual({ tools: ['Read'] });
  });

  it('acrescenta um servidor MCP do board como mcp__nome__*, sem repetir o que já está', async () => {
    renderEditor(agent);
    await choose(screen.getByRole('combobox', { name: 'Acrescentar servidor MCP' }), 'mcp__postgres__*');
    expect(lastSent('harness.agent.update').patch).toEqual({ tools: ['Read', 'mcp__github__*', 'mcp__postgres__*'] });
    // o github já está na lista: só o postgres é oferecido
    await userEvent.click(screen.getByRole('combobox', { name: 'Acrescentar servidor MCP' }));
    expect(screen.queryByRole('option', { name: 'mcp__github__*' })).toBeNull();
  });

  it('os conjuntos prontos marcam a lista, e as negadas são outra lista marcável', async () => {
    renderEditor({ ...agent, tools: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Editar código' }));
    expect(lastSent('harness.agent.update').patch).toEqual({ tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Negar WebFetch' }));
    expect(lastSent('harness.agent.update').patch).toEqual({ deniedTools: ['WebFetch'] });
    await userEvent.click(screen.getByRole('button', { name: 'Usar as ferramentas do nível de permissão' }));
    expect(lastSent('harness.agent.update').patch).toEqual({ tools: [] });
  });
});

describe('editor de agente: Cursor', () => {
  const cursorAgent: Agent = {
    ...agent,
    location: '.cursor/agents/revisor.md',
    path: '/abs/.cursor/agents/revisor.md',
    tools: [],
  };

  it('não tem lista de ferramentas, skills nem servidores MCP: só somente leitura e segundo plano', async () => {
    setState((s) => ({ board: { ...s.board, aiTool: 'cursor' } }));
    renderEditor(cursorAgent, 'cursor');
    expect(screen.queryByRole('checkbox', { name: 'Read' })).toBeNull();
    expect(screen.queryByText('Ferramentas disponíveis')).toBeNull();
    expect(screen.queryByText('Ferramentas negadas')).toBeNull();
    expect(screen.queryByText('Skills')).toBeNull();
    expect(screen.queryByText('Servidores MCP')).toBeNull();
    expect(screen.getByText(/Cursor não tem lista de ferramentas, skills nem servidores MCP por agente/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Somente leitura' }));
    expect(lastSent('harness.agent.update').patch).toEqual({ readonly: true });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Em segundo plano' }));
    expect(lastSent('harness.agent.update').patch).toEqual({ background: true });
    expect(sentOf('harness.agent.update')).toHaveLength(2);
  });

  it('o Claude Code não mostra somente leitura nem segundo plano', () => {
    renderEditor(agent);
    expect(screen.queryByRole('checkbox', { name: 'Somente leitura' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Em segundo plano' })).toBeNull();
  });
});
