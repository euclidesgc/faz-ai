// Preparadores do contrato v1 (E5.3): cada porta de IA monta aqui a configuração resolvida e o pedido de
// admissão que o gateway exige no runtime `v1`. Nada é ampliado sozinho: sem contrato válido, a execução não parte.
import { resolveContextDraft, type ContextDraftResolution } from '../../shared/contextDraftResolution';
import { strictRequestFromDraft } from '../../shared/contextAdmissionPreview';
import type { ContextAction, ContextActivityTarget } from '../../shared/contextPlanning';
import type { StrictExecutionRequest } from '../../shared/executionAdmission';
import type { BoardState } from '../../shared/model';
import { blockingContextDiagnostics, type AiPrepared, type ContextRuntime } from './gateway';

/** Runtime pedido pelo ambiente (`FAZ_AI_CONTEXT_RUNTIME=v1`); qualquer outro valor mantém o legado. */
export function contextRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): ContextRuntime {
  return env.FAZ_AI_CONTEXT_RUNTIME === 'v1' ? 'v1' : 'legacy';
}

export type V1Fields = Required<Pick<AiPrepared, 'context' | 'strict'>>;

/** Execução de um card (fase, refinar, resumo, conflito): o contrato vem do agente e da seleção da atividade. */
export function cardV1(state: BoardState, profileId: string, target: ContextActivityTarget): V1Fields {
  const context = resolveContextDraft(state, target);
  const missing = blockingContextDiagnostics(context);
  if (missing.length) throw new Error(`Runtime v1: o contrato da atividade não está pronto (${missing.join(', ')}).`);
  const request = strictRequestFromDraft(state, context);
  if (!request) throw new Error('Runtime v1: a atividade não tem agente com contrato válido.');
  return { context, strict: { profileId, request } };
}

/** Execução sem card (chat, assistentes, teste do perfil): contexto fechado, sem MCP além do contrato vazio. */
export function closedV1(profileId: string, action: ContextAction, readOnly = false): V1Fields {
  const context: ContextDraftResolution = {
    target: { cardId: null, workflowId: null, phaseId: '', action },
    agent: null,
    model: { choice: { mode: 'inherit' }, origin: null },
    items: [],
    inputAttachmentIds: [],
    expectedResult: '',
    activityOrigin: null,
    requestedTools: null,
    trace: [],
    diagnostics: [],
    admission: { state: 'unavailable', dependency: 729 },
    canExecute: false,
  };
  const request: StrictExecutionRequest = {
    version: 1,
    regime: 'exclusive',
    agentTools: { categories: readOnly ? ['read'] : [], native: { tool: '', allow: [], deny: [] } },
    boardTools: { mode: 'explicit', value: [] },
    activeMcpIds: [],
    allowedMcpIds: [],
    boardMcpIds: [],
    mcpServers: [],
    mcpTools: [],
    boardMcpTools: [],
    mcpLevel: { permission: 'board', tools: [] },
  };
  return { context, strict: { profileId, request } };
}
