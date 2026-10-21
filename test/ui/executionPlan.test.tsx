import { useState } from 'react';
import { act, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { choose, confirmLast, lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { ExecutionPlanPanel, type ExecutionPlanDrafts, ContextPlanDefaults } from '../../src/webview/components/card/ExecutionPlanPanel';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { cardContextTargets, activityDraft, contextTargetKey, CONTEXT_ACTION_LABELS } from '../../src/shared/contextPlan';
import { setLocale, t } from '../../src/webview/i18n';
import type { BoardArtifact } from '../../src/shared/artifacts';
import { CardDrawer } from '../../src/webview/components/CardDrawer';

let storyId: string;
let subId: string;
beforeEach(async () => {
  ({ storyId, subId } = await seedBoard());
  setLocale('pt-BR');
});
function Panel({ id, initial = {} }: { id: string; initial?: ExecutionPlanDrafts }) {
  const state = useBoardStore((s) => s.state)!;
  const [drafts, setDrafts] = useState(initial);
  return <ExecutionPlanPanel card={state.cards.find((c) => c.id === id)!} drafts={drafts} onDrafts={setDrafts} />;
}
function initialDraft(id = subId) {
  const state = useBoardStore.getState().state!;
  const target = cardContextTargets(
    state,
    state.cards.find((c) => c.id === id)!,
  )[0]!;
  const draft = activityDraft(state, target);
  draft.selection.expectedResult = 'Testes revisados';
  draft.reason = 'Cobrir o caso novo';
  return { [contextTargetKey(target)]: draft };
}

it('mostra fases abertas da história e mantém a tarefa com quatro ações independentes', () => {
  const view = renderThemed(<Panel id={storyId} />);
  const state = useBoardStore.getState().state!;
  const story = state.cards.find((c) => c.id === storyId)!;
  for (const phase of state.columns.filter((c) => c.workflowId === story.workflowId && !c.isTerminal))
    expect(screen.getByRole('button', { name: `Configurar Trabalho · ${phase.name}` })).toBeEnabled();
  view.unmount();
  renderThemed(<Panel id={subId} />);
  expect(screen.getAllByRole('button', { name: /^Configurar / })).toHaveLength(4);
  expect(screen.getByText(/contratos ainda são rascunhos/)).toBeInTheDocument();
  expect(posted).not.toHaveBeenCalled();
});

it('edita localmente, cancela sem salvar e só envia depois de comparar', async () => {
  renderThemed(<Panel id={subId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Configurar Refino' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Resultado esperado' }), 'Não salvar');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(posted).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Configurar Trabalho' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Resultado esperado' }), 'Entregar testes');
  await userEvent.type(screen.getByRole('textbox', { name: 'Justificativa da escolha' }), 'Validar comportamento');
  await userEvent.click(screen.getByRole('button', { name: 'Usar no rascunho do plano' }));
  expect(screen.queryByRole('button', { name: 'Aplicar rascunhos revisados' })).not.toBeInTheDocument();
  expect(posted).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Comparar alterações (1)' }));
  expect(screen.getByText('Resultado esperado: → Entregar testes')).toBeInTheDocument();
  expect(screen.getAllByText('Validar comportamento')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Aplicar rascunhos revisados' }));
  const message = lastSent('contextPlanning.saveBatch');
  expect(message.inputs).toHaveLength(1);
  expect(message.inputs[0]).toMatchObject({ target: { cardId: subId, action: 'work', phaseId: '' }, reason: 'Validar comportamento' });
  confirmLast();
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Comparar alterações/ })).not.toBeInTheDocument());
  expect(sentOf('harness.agent.assist')).toEqual([]);
});

it('preserva rascunhos quando o host recusa o lote e exige nova comparação após revisão concorrente', async () => {
  const initial = initialDraft();
  renderThemed(<Panel id={subId} initial={initial} />);
  await userEvent.click(screen.getByRole('button', { name: 'Comparar alterações (1)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicar rascunhos revisados' }));
  expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
  confirmLast(false, 'Falha ao salvar');
  await screen.findByRole('alert');
  expect(screen.getByText('Resultado esperado: → Testes revisados')).toBeInTheDocument();
  act(() => {
    const state = useBoardStore.getState().state!;
    const draft = Object.values(initial)[0]!;
    useBoardStore.setState({
      state: {
        ...state,
        contextPlanning: {
          ...state.contextPlanning!,
          activities: [
            {
              ...draft.target,
              id: 'concorrente',
              revision: 1,
              updatedAt: 1,
              selection: { ...draft.selection, expectedResult: 'Outro resultado' },
            },
          ],
        },
      },
    });
  });
  expect(screen.getByRole('button', { name: 'Aplicar rascunhos revisados' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar revisões e comparar' }));
  expect(screen.queryByRole('button', { name: 'Aplicar rascunhos revisados' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Comparar alterações (1)' }));
  expect(screen.getByText('Resultado esperado: Outro resultado → Testes revisados')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Aplicar rascunhos revisados' }));
  expect(lastSent('contextPlanning.saveBatch').inputs[0]!.expectedRevision).toBe(1);
  confirmLast();
});

it('copia entre ações como rascunho revisável sem escrever nem compartilhar estado', async () => {
  renderThemed(<Panel id={subId} initial={initialDraft()} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Trabalho' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Refino' }));
  await userEvent.click(screen.getByRole('button', { name: 'Copiar Trabalho para as atividades marcadas' }));
  expect(posted).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Comparar alterações (2)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicar rascunhos revisados' }));
  const inputs = lastSent('contextPlanning.saveBatch').inputs;
  expect(inputs.map((d) => d.target.action).sort()).toEqual(['refine', 'work']);
  expect(inputs.every((d) => d.selection.expectedResult === 'Testes revisados')).toBe(true);
  confirmLast();
});

it('mantém MCP incompatível selecionado visível e removível ao trocar o agente', async () => {
  const state = useBoardStore.getState().state!;
  const base = {
    description: 'Catálogo',
    body: 'CORPO PRIVADO DO CATÁLOGO',
    origin: '',
    originTool: '' as const,
    missing: false,
    skipped: [],
    files: [],
    path: '',
    usage: 'contextual' as const,
    createdAt: 0,
    updatedAt: 0,
  };
  const artifacts: BoardArtifact[] = [
    { ...base, id: 'a1', kind: 'agent', name: 'dev' },
    { ...base, id: 'a2', kind: 'agent', name: 'revisor' },
    { ...base, id: 'mcp', kind: 'mcp', name: 'memoria' },
  ];
  const contract = {
    version: 1 as const,
    role: 'Revisor',
    instructions: '',
    essentialSkillIds: [],
    availableSkillIds: [],
    allowedMcpIds: ['mcp'],
    tools: { categories: [], native: { tool: '' as const, allow: [], deny: [] } },
  };
  useBoardStore.setState({
    state: {
      ...state,
      harness: { ...state.harness, library: { directory: '', artifacts } },
      contextPlanning: {
        ...state.contextPlanning!,
        agents: [
          { artifactId: 'a1', revision: 1, updatedAt: 0, contract },
          { artifactId: 'a2', revision: 1, updatedAt: 0, contract: { ...contract, allowedMcpIds: [] } },
        ],
      },
    },
  });
  const drafts = initialDraft();
  const draft = Object.values(drafts)[0]!;
  draft.selection.agent = { mode: 'explicit', value: 'a1' };
  draft.selection.activeMcpIds = { mode: 'explicit', value: ['mcp', 'ausente'] };
  renderThemed(<Panel id={subId} initial={drafts} />);
  await userEvent.click(screen.getByRole('button', { name: 'Configurar Trabalho' }));
  expect(screen.queryByText('CORPO PRIVADO DO CATÁLOGO')).not.toBeInTheDocument();
  await choose(screen.getByRole('combobox', { name: 'Agente da atividade' }), /revisor/);
  const region = screen.getByRole('region', { name: 'MCPs ativos' });
  const incompatible = within(region).getByRole('checkbox', { name: /memoria · Fora do contrato/ });
  expect(incompatible).toBeChecked();
  expect(incompatible).toBeEnabled();
  const missing = within(region).getByRole('checkbox', { name: /ausente · Indisponível/ });
  expect(missing).toBeChecked();
  await userEvent.click(incompatible);
  await userEvent.click(missing);
  await userEvent.click(screen.getByRole('button', { name: 'Usar no rascunho do plano' }));
  await userEvent.click(screen.getByRole('button', { name: 'Comparar alterações (1)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicar rascunhos revisados' }));
  expect(lastSent('contextPlanning.saveBatch').inputs[0]!.selection).toMatchObject({
    agent: { mode: 'explicit', value: 'a2' },
    activeMcpIds: { mode: 'explicit', value: [] },
  });
  confirmLast();
});

it('oferece padrões sem card para chat e assistentes e traduz todos os nomes das ações', () => {
  setLocale('en');
  renderThemed(<ContextPlanDefaults />);
  for (const label of Object.values(CONTEXT_ACTION_LABELS)) expect(t(label)).not.toBe(label);
  expect(screen.getByRole('button', { name: /Configure Board default · Board conversation/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: /Configure Board default · Harness suggestions/ })).toBeEnabled();
  expect(posted).not.toHaveBeenCalled();
  setLocale('pt-BR');
});

it('mantém o rascunho entre abas e Esc fecha apenas o editor da atividade', async () => {
  useBoardStore.getState().openCard(subId);
  renderThemed(<CardDrawer cardId={subId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Plano de execução' }));
  await userEvent.click(screen.getByRole('button', { name: 'Configurar Trabalho' }));
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(useBoardStore.getState().openCardId).toBe(subId);
  await userEvent.click(screen.getByRole('button', { name: 'Configurar Trabalho' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Resultado esperado' }), 'Rascunho preservado');
  await userEvent.click(screen.getByRole('button', { name: 'Usar no rascunho do plano' }));
  await userEvent.click(screen.getByRole('button', { name: 'Detalhes' }));
  await userEvent.click(screen.getByRole('button', { name: 'Plano de execução' }));
  expect(screen.getByRole('button', { name: 'Comparar alterações (1)' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Configurar Trabalho' }));
  expect(screen.getByRole('textbox', { name: 'Resultado esperado' })).toHaveValue('Rascunho preservado');
  expect(sentOf('contextPlanning.saveBatch')).toHaveLength(0);
});
