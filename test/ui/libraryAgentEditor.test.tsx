import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderThemed, seedBoard, lastSent, sentOf, confirmLast } from './setup';
import { LibraryAgentEditor } from '../../src/webview/components/settings/harness/LibraryAgentEditor';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { AgentAssistResult } from '../../src/shared/agentAssistance';
import type { BoardArtifact } from '../../src/shared/artifacts';

beforeEach(async () => {
  await seedBoard();
});
const RESULT: AgentAssistResult = {
  explanation: 'Defina a entrega com evidências.',
  suggestions: ['Inclua arquivo e impacto.'],
  content: 'Revise autenticação e entregue evidências, sem editar arquivos.',
  skills: [],
  mcpServers: [],
  categories: ['read'],
  model: '',
};
function answer(result: Partial<AgentAssistResult> = {}, error?: string) {
  const message = lastSent('harness.agent.assist');
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'harness.agent.assistResult',
          requestId: message.requestId,
          ...(error ? { error } : { result: { ...RESULT, ...result } }),
        },
      }),
    ),
  );
}
async function fill() {
  await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'revisor');
  await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo' }), 'Revise autenticação.');
}

it('explica as partes das instruções e só aplica a proposta da IA quando a pessoa escolhe', async () => {
  renderThemed(<LibraryAgentEditor guided onClose={vi.fn()} />);
  expect(screen.getByText(/^Um subagente é um especialista/)).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Descrição' })).toBeNull();
  const field = screen.getByRole('textbox', { name: 'Responsabilidade' });
  expect(field.getAttribute('placeholder')).toContain('Exemplo:');
  await userEvent.type(field, 'Revisar segurança');
  await userEvent.click(screen.getByRole('button', { name: 'Ajudar com IA' }));
  expect(lastSent('harness.agent.assist').input).toMatchObject({
    step: 'responsibility',
    sections: { responsibility: 'Revisar segurança' },
  });
  answer();
  expect(await screen.findByRole('region', { name: 'Sugestões da IA' })).toHaveTextContent('Inclua arquivo e impacto.');
  expect(field).toHaveValue('Revisar segurança');
  await userEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão' }));
  expect(field).toHaveValue(RESULT.content);
  for (const title of ['Escopo e limites', 'Como trabalhar', 'Entrega e conclusão']) {
    await userEvent.click(screen.getByRole('tab', { name: title }));
    expect(screen.getByRole('textbox', { name: title }).getAttribute('placeholder')).toContain('Exemplo:');
    expect(screen.getByRole('button', { name: 'Ajudar com IA' })).toBeEnabled();
  }
});

it('seleciona modelos do catálogo e explica cada categoria de permissão', async () => {
  const state = useBoardStore.getState().state!;
  useBoardStore.setState({
    state: {
      ...state,
      board: {
        ...state.board,
        aiTool: 'claude',
        modelCatalog: [
          { id: 'claude:sonnet', tool: 'claude', model: 'sonnet', label: 'Sonnet disponível', efforts: [], defaultEffort: null },
        ],
      },
    },
  });
  renderThemed(<LibraryAgentEditor onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('tab', { name: 'Modelo' }));
  await userEvent.click(screen.getByRole('combobox', { name: 'Modelo' }));
  expect(screen.getByRole('option', { name: '—' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('option', { name: 'Sonnet disponível' }));
  expect(screen.getByRole('combobox', { name: 'Modelo' })).toHaveTextContent('Sonnet disponível');
  await userEvent.click(screen.getByRole('tab', { name: 'Permissões' }));
  for (const label of ['Leitura', 'Edição', 'Comandos', 'Rede', 'Subagentes']) {
    const option = screen.getByRole('checkbox', { name: label }).closest('label')!;
    expect(option.querySelector('p')!.textContent!.length).toBeGreaterThan(40);
  }
  await userEvent.click(screen.getByRole('checkbox', { name: 'Leitura' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ajudar com IA' }));
  expect(lastSent('harness.agent.assist').input.agent).toMatchObject({ model: 'claude:sonnet', tools: { categories: ['read'] } });
  answer({ content: '' });
  await screen.findByRole('button', { name: 'Usar permissões indicadas' });
});

it('explica skills e MCPs, mostra descrições e seleciona apenas as indicações aceitas', async () => {
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
    { ...base, id: 's', kind: 'skill', name: 'seguranca', description: 'Revisa autenticação com checklist.' },
    {
      ...base,
      id: 'm',
      kind: 'mcp',
      name: 'documentacao',
      description: 'Consulta documentação interna.',
      mcpSummary: 'https://docs.example.test/mcp',
    },
  ];
  const state = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...state, harness: { ...state.harness, library: { ...state.harness.library!, artifacts } } } });
  renderThemed(<LibraryAgentEditor onClose={vi.fn()} />);
  await fill();
  await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
  expect(screen.getByText(/^Skills são procedimentos/)).toBeInTheDocument();
  expect(screen.getByText('Revisa autenticação com checklist.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Selecionar indicadas' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Indicar com IA' }));
  answer({ content: '', skills: [{ name: 'seguranca', reason: 'Ensina a revisão pedida.' }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Selecionar indicadas' }));
  expect(screen.getByRole('checkbox', { name: 'seguranca' })).toBeChecked();
  expect(screen.getByText('Ensina a revisão pedida.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('tab', { name: 'MCPs' }));
  expect(screen.getByText(/^MCP \(Model Context Protocol\)/)).toBeInTheDocument();
  expect(screen.getByText('Consulta documentação interna.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Indicar com IA' }));
  answer({ content: '', mcpServers: [{ name: 'documentacao', reason: 'Permite consultar as regras de autenticação.' }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Selecionar indicadas' }));
  expect(screen.getByRole('checkbox', { name: 'documentacao' })).toBeChecked();
});

it('revisa com IA antes de gravar, permite melhorar o conteúdo e só salva na confirmação', async () => {
  const onClose = vi.fn();
  renderThemed(<LibraryAgentEditor onClose={onClose} />);
  await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Revisar e salvar' }));
  expect(lastSent('harness.agent.assist').input.step).toBe('review');
  expect(sentOf('harness.library.save')).toHaveLength(0);
  answer();
  await userEvent.click(await screen.findByRole('button', { name: 'Melhorar conteúdo automaticamente' }));
  expect(sentOf('harness.library.save')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
  expect(lastSent('harness.library.save')).toMatchObject({
    input: { name: 'revisor', kind: 'agent', body: RESULT.content, agent: { tools: { categories: [] } } },
  });
  expect(onClose).not.toHaveBeenCalled();
  confirmLast();
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

it('uma mudança após a revisão exige nova análise e falhas da IA não apagam o rascunho', async () => {
  renderThemed(<LibraryAgentEditor onClose={vi.fn()} />);
  await fill();
  await userEvent.click(screen.getByRole('button', { name: 'Revisar e salvar' }));
  answer();
  await screen.findByRole('button', { name: 'Salvar como está' });
  await userEvent.click(screen.getByRole('tab', { name: 'Permissões' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Leitura' }));
  await userEvent.click(screen.getByRole('button', { name: 'Revisar e salvar' }));
  expect(sentOf('harness.agent.assist')).toHaveLength(2);
  answer({}, 'A ferramenta não está autenticada.');
  expect(await screen.findByRole('alert')).toHaveTextContent('não está autenticada');
  expect(screen.getByRole('button', { name: 'Salvar sem revisão de IA' })).toBeEnabled();
  expect(sentOf('harness.library.save')).toHaveLength(0);
  await userEvent.click(screen.getByRole('tab', { name: 'Instruções' }));
  expect(screen.getByRole('textbox', { name: 'Conteúdo' })).toHaveValue('Revise autenticação.');
});
