import { useState } from 'react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { lastSent, posted, renderThemed, seedBoard, sentOf } from './setup';
import { ExecutionPlanPanel, type ExecutionPlanDrafts } from '../../src/webview/components/card/ExecutionPlanPanel';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { proposalInputsHash, type ContextProposal } from '../../src/shared/contextProposal';
import { setLocale } from '../../src/webview/i18n';
import type { BoardArtifact } from '../../src/shared/artifacts';
import type { ContextActivityTarget } from '../../src/shared/contextPlanning';

let subId: string;
beforeEach(async () => {
  ({ subId } = await seedBoard());
  setLocale('pt-BR');
  posted.mockClear();
});
function Panel({ id }: { id: string }) {
  const state = useBoardStore((s) => s.state)!;
  const [drafts, setDrafts] = useState<ExecutionPlanDrafts>({});
  return <ExecutionPlanPanel card={state.cards.find((c) => c.id === id)!} drafts={drafts} onDrafts={setDrafts} />;
}
const target = (): ContextActivityTarget => ({ cardId: null, workflowId: null, phaseId: '', action: 'work' });
function seedAgent() {
  const state = useBoardStore.getState().state!;
  const base = {
    description: 'Catálogo',
    body: '',
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
    { ...base, id: 'dev', kind: 'agent', name: 'dev' },
    { ...base, id: 'revisao', kind: 'skill', name: 'revisao' },
  ];
  useBoardStore.setState({
    state: {
      ...state,
      harness: { ...state.harness, library: { directory: '', artifacts } },
      contextPlanning: {
        ...state.contextPlanning!,
        agents: [
          {
            artifactId: 'dev',
            revision: 1,
            updatedAt: 0,
            contract: {
              version: 1,
              role: 'Dev',
              instructions: '',
              essentialSkillIds: [],
              availableSkillIds: [],
              allowedMcpIds: [],
              tools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
            },
          },
        ],
        activities: [
          {
            ...target(),
            id: 'board-work',
            revision: 1,
            updatedAt: 0,
            selection: {
              version: 1,
              agent: { mode: 'explicit', value: 'dev' },
              model: { mode: 'inherit' },
              additionalSkillIds: { mode: 'inherit' },
              activeMcpIds: { mode: 'inherit' },
              inputAttachmentIds: [],
              expectedResult: '',
            },
          },
        ],
      },
    },
  });
}
const reply = (message: object) => act(() => void window.dispatchEvent(new MessageEvent('message', { data: message })));

it('sem agente válido não há botão de proposta', () => {
  renderThemed(<Panel id={subId} />);
  expect(screen.queryByRole('button', { name: /Propor configuração/ })).not.toBeInTheDocument();
});

it('pede a proposta, mostra os motivos e só vira rascunho quando a pessoa usa; nada é gravado', async () => {
  seedAgent();
  renderThemed(<Panel id={subId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Propor configuração de Trabalho com IA' }));
  const sent = lastSent('contextPlanning.propose');
  expect(sent.target).toMatchObject({ cardId: subId, action: 'work' });
  const state = useBoardStore.getState().state!;
  const proposal: ContextProposal = {
    target: sent.target,
    agentId: 'dev',
    explanation: 'Só revisão.',
    additionalSkills: [{ artifactId: 'revisao', reason: 'a tarefa revisa um diff' }],
    activeMcps: [],
    inputsHash: proposalInputsHash(state, sent.target, 'dev'),
  };
  reply({ type: 'contextPlanning.propose.result', requestId: sent.requestId, proposal });
  expect(await screen.findByText(/revisao: a tarefa revisa um diff/)).toBeInTheDocument();
  expect(sentOf('contextPlanning.save')).toHaveLength(0);
  expect(sentOf('contextPlanning.saveBatch')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Usar como rascunho' }));
  expect(screen.queryByRole('button', { name: 'Usar como rascunho' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Comparar alterações (1)' }));
  expect(screen.getByText(/Skills adicionais: Herdar → revisao/)).toBeInTheDocument();
  expect(sentOf('contextPlanning.saveBatch')).toHaveLength(0);
});

it('proposta desatualizada não pode ser usada e o erro do host aparece', async () => {
  seedAgent();
  renderThemed(<Panel id={subId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Propor configuração de Trabalho com IA' }));
  const sent = lastSent('contextPlanning.propose');
  reply({
    type: 'contextPlanning.propose.result',
    requestId: sent.requestId,
    error: 'A IA não respondeu no formato esperado. Tente novamente.',
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('formato esperado');
  await userEvent.click(screen.getByRole('button', { name: 'Propor configuração de Trabalho com IA' }));
  const again = lastSent('contextPlanning.propose');
  reply({
    type: 'contextPlanning.propose.result',
    requestId: again.requestId,
    proposal: { target: again.target, agentId: 'dev', explanation: '', additionalSkills: [], activeMcps: [], inputsHash: 'velho' },
  });
  expect(await screen.findByText(/proposta está desatualizada/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Usar como rascunho' })).toBeDisabled();
});
