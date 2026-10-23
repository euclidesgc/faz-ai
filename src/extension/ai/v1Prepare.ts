// Preparadores do contrato v1 (E5.3): cada porta de IA monta aqui a configuração resolvida e o pedido de
// admissão que o gateway exige no runtime `v1`. Nada é ampliado sozinho: sem contrato válido, a execução não parte.
import { resolveContextDraft, type ContextDraftResolution } from '../../shared/contextDraftResolution';
import { strictRequestFromDraft } from '../../shared/contextAdmissionPreview';
import type { ContextAction, ContextActivityTarget } from '../../shared/contextPlanning';
import type { StrictExecutionRequest } from '../../shared/executionAdmission';
import type { BoardState } from '../../shared/model';
import { admissionRegimeOf, type RunnerConfig, type RunnerPermission } from '../../shared/runner';
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
export function closedV1(profileId: string, action: ContextAction, runner: RunnerConfig, readOnly = false): V1Fields {
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
    ...admissionRegimeOf(runner),
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

/**
 * O pedido de admissão de um card no runtime legado, para um perfil personalizado (#1091). O gateway
 * exige admissão de todo perfil que não é pronto, e o legado só montava o pedido no `v1`: sem isto,
 * um perfil ACP passava na verificação e nenhum card rodava. As categorias vêm do nível de permissão
 * (é o que a admissão permite por nível) e os MCPs são os do plano, pelo nome, que no legado é o id.
 */
export function legacyStrictRequest(
  runner: RunnerConfig,
  permission: RunnerPermission,
  mcpServers: readonly string[],
): StrictExecutionRequest {
  const categories = permission === 'full' ? ['read', 'edit', 'run', 'net'] : permission === 'edits' ? ['read', 'edit'] : ['read'];
  const servers = [...new Set(mcpServers)];
  return {
    version: 1,
    ...admissionRegimeOf(runner),
    agentTools: { categories: categories as StrictExecutionRequest['agentTools']['categories'], native: { tool: '', allow: [], deny: [] } },
    boardTools: { mode: 'inherit' },
    activeMcpIds: servers,
    allowedMcpIds: servers,
    boardMcpIds: servers,
    mcpServers: servers.map((name) => ({ artifactId: name, name })),
    mcpTools: [],
    boardMcpTools: [],
    mcpLevel: { permission, tools: [] },
  };
}
