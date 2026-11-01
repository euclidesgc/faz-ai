import { admissionRegimeOf, type RunnerConfig, type RunnerPermission } from '../../shared/runner';
import type { StrictExecutionRequest } from '../../shared/executionAdmission';

/**
 * O pedido de admissão de um card no runtime legado, para um perfil personalizado (#1091). O gateway
 * exige admissão de todo perfil que não é pronto, e o legado só montava o pedido no `v1`: sem isto,
 * um perfil ACP passava na verificação e nenhum card rodava. As categorias vêm do nível de permissão
 * (é o que a admissão permite por nível) e os MCPs são os do plano, pelo nome, que no legado é o id.
 */
export function cardAdmissionRequest(
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

/** O pedido de admissão de uma execução sem card (chat): sem MCP, no nível de permissão da execução. */
export function closedAdmissionRequest(
  runner: RunnerConfig,
  readOnly = false,
  permission: RunnerPermission = 'board',
): StrictExecutionRequest {
  return {
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
    mcpLevel: { permission, tools: [] },
  };
}
