import { act, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { confirmLast, lastSent, renderThemed, seedBoard, sentOf } from './setup';
import { AgentContractEditor } from '../../src/webview/components/settings/harness/AgentContractEditor';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { BoardArtifact } from '../../src/shared/artifacts';
import type { AgentContextContract } from '../../src/shared/contextPlanning';
import { setLocale } from '../../src/webview/i18n';

const CONTRACT: AgentContextContract = {
  version: 1,
  role: 'Revisor',
  instructions: 'Revise sem editar.',
  essentialSkillIds: ['essential'],
  availableSkillIds: ['optional'],
  allowedMcpIds: ['mcp'],
  tools: { categories: ['read'], native: { tool: 'claude', allow: ['Read'], deny: ['Bash'] } },
};
function seedContract(contract?: AgentContextContract) {
  const state = useBoardStore.getState().state!;
  const base = {
    origin: '',
    originTool: '' as const,
    missing: false,
    skipped: [],
    files: [],
    body: '',
    path: '',
    usage: 'contextual' as const,
    createdAt: 0,
    updatedAt: 0,
  };
  const artifacts: BoardArtifact[] = [
    {
      ...base,
      id: 'agent',
      name: 'revisor',
      kind: 'agent',
      description: 'Legado',
      body: 'Instruções antigas',
      agent: {
        skills: ['essencial'],
        mcpServers: ['memoria'],
        model: '',
        tools: { categories: ['edit'], native: { tool: '', allow: [], deny: [] } },
      },
    },
    { ...base, id: 'essential', name: 'essencial', kind: 'skill', description: '' },
    { ...base, id: 'optional', name: 'opcional', kind: 'skill', description: '' },
    { ...base, id: 'mcp', name: 'memoria', kind: 'mcp', description: '' },
    { ...base, id: 'always', name: 'obrigatorio', kind: 'mcp', description: '', usage: 'always' },
  ];
  useBoardStore.setState({
    state: {
      ...state,
      harness: { ...state.harness, library: { ...state.harness.library!, artifacts } },
      contextPlanning: {
        runtime: 'legacy',
        legacy: { version: 0, agents: [], cards: [] },
        activities: [],
        agents: contract ? [{ artifactId: 'agent', revision: 3, updatedAt: 0, contract }] : [],
      },
    },
  });
}
beforeEach(async () => {
  await seedBoard();
});

it('mostra essenciais e Sempre, deixa opcionais e MCPs inativos e explica incompatibilidades', async () => {
  seedContract(CONTRACT);
  renderThemed(<AgentContractEditor artifactId="agent" onClose={vi.fn()} />);
  const preview = within(screen.getByRole('region', { name: 'Prévia do contrato' }));
  expect(preview.getByText('essencial')).toBeInTheDocument();
  expect(preview.getByText('Essencial do agente')).toBeInTheDocument();
  expect(preview.queryByText('opcional')).toBeNull();
  expect(preview.queryByText('memoria')).toBeNull();
  expect(preview.getByText(/MCP fora do contrato/)).toHaveTextContent('always');
  expect(preview.getByText(/Admissão indisponível/)).toBeInTheDocument();
  await userEvent.click(within(screen.getByRole('region', { name: 'MCPs permitidos' })).getByRole('checkbox', { name: 'obrigatorio' }));
  expect(preview.getByText('obrigatorio')).toBeInTheDocument();
  expect(preview.queryByText(/MCP fora do contrato/)).toBeNull();
});

it('salva revisão esperada e restrições nativas, aguarda o host e não grava o legado', async () => {
  seedContract(CONTRACT);
  const close = vi.fn();
  renderThemed(<AgentContractEditor artifactId="agent" onClose={close} />);
  await userEvent.type(screen.getByRole('textbox', { name: 'Papel do agente' }), ' humano');
  await userEvent.clear(screen.getByRole('textbox', { name: 'Permitir nativas (uma por linha)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho do contrato' }));
  expect(lastSent('contextPlanning.save')).toMatchObject({
    input: {
      kind: 'agent',
      artifactId: 'agent',
      expectedRevision: 3,
      contract: { ...CONTRACT, role: 'Revisor humano', tools: { ...CONTRACT.tools, native: { ...CONTRACT.tools.native, allow: [] } } },
    },
  });
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Salvar rascunho do contrato' })).toBeDisabled();
  confirmLast(false, 'Revisão desatualizada.');
  expect(await screen.findByRole('alert')).toHaveTextContent('Revisão desatualizada.');
  expect(screen.getByRole('textbox', { name: 'Papel do agente' })).toHaveValue('Revisor humano');
  expect(sentOf('harness.library.save')).toHaveLength(0);
  expect(sentOf('harness.agent.assist')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho do contrato' }));
  confirmLast();
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it('preserva IDs ausentes para revisão e impede sobrescrever uma revisão atualizada', async () => {
  seedContract({ ...CONTRACT, essentialSkillIds: ['deleted'] });
  renderThemed(<AgentContractEditor artifactId="agent" onClose={vi.fn()} />);
  const missing = within(screen.getByRole('region', { name: 'Skills essenciais' })).getByRole('checkbox', {
    name: 'deleted · Indisponível',
  });
  expect(missing).toBeChecked();
  expect(screen.getByText(/Recurso ausente/)).toHaveTextContent('deleted');
  await userEvent.type(screen.getByRole('textbox', { name: 'Papel do agente' }), ' novo');
  act(() => {
    const state = useBoardStore.getState().state!;
    useBoardStore.setState({
      state: {
        ...state,
        contextPlanning: { ...state.contextPlanning!, agents: [{ artifactId: 'agent', revision: 4, updatedAt: 1, contract: CONTRACT }] },
      },
    });
  });
  expect(screen.getByRole('alert')).toHaveTextContent('O contrato mudou');
  expect(screen.getByRole('button', { name: 'Salvar rascunho do contrato' })).toBeDisabled();
  expect(missing).toBeChecked();
});

it('traduz a prévia e os campos do contrato', () => {
  seedContract(CONTRACT);
  setLocale('en');
  try {
    renderThemed(<AgentContractEditor artifactId="agent" onClose={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Agent role' })).toHaveValue('Revisor');
    expect(screen.getByRole('region', { name: 'Essential skills' })).toBeInTheDocument();
    const preview = within(screen.getByRole('region', { name: 'Contract preview' }));
    expect(preview.getByText('Agent essential')).toBeInTheDocument();
    expect(preview.getByText(/MCP outside the agent contract/)).toBeInTheDocument();
  } finally {
    setLocale('pt-BR');
  }
});
