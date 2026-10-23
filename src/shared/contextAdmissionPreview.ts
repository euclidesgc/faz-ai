// Liga a leitura da admissão do host (#729) à prévia do resolvedor. Não executa probes nem autoriza nada.
import type { ContextDraftResolution } from './contextDraftResolution';
import type { ExecutionAdmissionDecision, StrictExecutionRequest } from './executionAdmission';
import type { BoardState } from './model';
import { admissionRegimeOf } from './runner';

/**
 * Pedido de admissão equivalente ao rascunho resolvido: o regime escolhido pela pessoa, ferramentas do contrato do agente
 * e só os MCPs já selecionados. Sem agente ou contrato válido não há pedido (a prévia já explica o motivo).
 */
export function strictRequestFromDraft(s: BoardState, resolved: ContextDraftResolution): StrictExecutionRequest | null {
  if (!resolved.agent || !resolved.requestedTools) return null;
  const contract = s.contextPlanning?.agents.find((a) => a.artifactId === resolved.agent!.artifactId);
  if (!contract) return null;
  const artifacts = s.harness.library?.artifacts ?? [];
  const active = resolved.items.filter((i) => i.kind === 'mcp');
  return {
    version: 1,
    ...admissionRegimeOf(s.board.runner),
    agentTools: resolved.requestedTools,
    boardTools: { mode: 'inherit' },
    activeMcpIds: active.map((i) => i.artifactId),
    allowedMcpIds: [...contract.contract.allowedMcpIds],
    boardMcpIds: artifacts.filter((a) => a.kind === 'mcp' && a.usage !== 'off' && !a.missing).map((a) => a.id),
    mcpServers: active.map((i) => ({ artifactId: i.artifactId, name: i.name.replace(/[^A-Za-z0-9_-]/g, '-') })),
    // Operações exatas só existem quando a execução prepara o MCP; a prévia não as inventa.
    mcpTools: [],
    boardMcpTools: [],
    mcpLevel: { permission: 'board', tools: [] },
  };
}

/** Troca "admissão indisponível" pela decisão do host, explicando cada razão (com o recurso, quando há). */
export function applyAdmissionDecision(resolved: ContextDraftResolution, decision: ExecutionAdmissionDecision): ContextDraftResolution {
  const diagnostics = resolved.diagnostics.filter((d) => d.code !== 'admission-unavailable');
  for (const r of decision.reasons)
    diagnostics.push({
      code: 'admission-blocked',
      reason: r.code,
      ...(r.capability ? { capability: r.capability } : {}),
      ...(r.resourceId ? { artifactId: r.resourceId } : {}),
    });
  return {
    ...resolved,
    diagnostics,
    admission: { state: 'evaluated', admitted: decision.state === 'admitted', capabilities: decision.capabilities },
  };
}
