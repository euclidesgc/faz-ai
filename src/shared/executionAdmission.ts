// Decisão pura de admissão: evidência de isolamento não se confunde com configuração ou orientação.
import { NATIVE_AGENT_TOOLS, agentToolsOf } from './agentTools';
import type { AiTool } from './harness';
import type { ToolCategory } from './artifacts';
import type { AgentContextContract, ContextChoice } from './contextPlanning';
import type { RunnerPermission } from './runner';

export const EXECUTOR_CAPABILITIES = ['conversation', 'artifacts', 'permissions', 'mcp', 'delegation'] as const;
export type ExecutorCapability = (typeof EXECUTOR_CAPABILITIES)[number];
export type CapabilityState = 'verified' | 'partial' | 'unknown';
export const CAPABILITY_CHECKS: Record<ExecutorCapability, readonly string[]> = {
  conversation: ['fresh-conversation'],
  artifacts: ['project-sentinel', 'user-sentinel', 'ancestor-sentinel', 'additional-directory-sentinel', 'managed-settings'],
  permissions: ['allowed-tool', 'forbidden-tool'],
  mcp: ['allowed-server', 'forbidden-server', 'operation-scope'],
  delegation: ['native-delegation-denied'],
};
/** Como o executor é chamado: a CLI de uma passada (flags de isolamento) ou um agente pelo ACP (sessão). */
export type ExecutionTransport = 'cli' | 'acp';
/**
 * Os checks do transporte ACP: o que o handshake do agente deixa observável. Permissões e delegação
 * são respondidas pelo board a cada `session/request_permission`, na versão 1 do protocolo; os
 * servidores MCP vão só no `session/new` (o verificador observa o agente conectar ao dele). Os arquivos
 * de contexto que o agente lê por conta própria não têm flag no protocolo: ficam `unavailable`, e por
 * isso um agente ACP só é admissível no regime compatível, revisado pela pessoa.
 */
export const ACP_CAPABILITY_CHECKS: Record<ExecutorCapability, readonly string[]> = {
  conversation: ['fresh-session'],
  artifacts: ['own-context-files', 'managed-settings'],
  permissions: ['protocol-version'],
  mcp: ['session-servers'],
  delegation: ['protocol-version'],
};
export const capabilityChecks = (transport: ExecutionTransport): Record<ExecutorCapability, readonly string[]> =>
  transport === 'acp' ? ACP_CAPABILITY_CHECKS : CAPABILITY_CHECKS;
/** Produzida pelo verificador do host. Nenhum protocolo de escrita aceita esta estrutura da IA/UI. */
export interface CapabilityEvidence {
  version: 1;
  capability: ExecutorCapability;
  source: 'host-probe';
  binding: string;
  checkedAt: number;
  expiresAt: number;
  checks: { id: string; outcome: 'passed' | 'failed' | 'unavailable'; receipt: string }[];
}
export interface CapabilityAssessment {
  capability: ExecutorCapability;
  state: CapabilityState;
  reason: 'verified' | 'no-evidence' | 'changed-binding' | 'expired' | 'incomplete' | 'failed' | 'invalid';
}
export interface StrictExecutionRequest {
  version: 1;
  /** O regime é lido da configuração humana pelo preparador do host, nunca de uma proposta da IA. */
  regime: 'exclusive' | 'compatible';
  compatibilityReview?: { actor: 'person'; revision: number };
  agentTools: AgentContextContract['tools'];
  /** Ausente não equivale a lista vazia; o preparador precisa declarar herança explicitamente. */
  boardTools: ContextChoice<ToolCategory[]>;
  activeMcpIds: string[];
  allowedMcpIds: string[];
  boardMcpIds: string[];
  mcpServers: { artifactId: string; name: string }[];
  /** Nomes exatos, já limitados pelo escopo de operações do board/MCP. Sem curingas. */
  mcpTools: string[];
  /** Fronteira do board por operação, inclusive as ferramentas do servidor faz-ai. */
  boardMcpTools: string[];
  mcpLevel: { permission: RunnerPermission; tools: string[] };
}
export interface ExecutionAdmissionDecision {
  version: 1;
  regime: StrictExecutionRequest['regime'];
  state: 'admitted' | 'blocked';
  capabilities: CapabilityAssessment[];
  reasons: { code: string; capability?: ExecutorCapability; resourceId?: string }[];
  /** Lista explícita: [] significa nenhuma ferramenta, nunca herança. */
  tools: string[];
  deniedTools: string[];
  mcpTools: string[];
  activeMcpIds: string[];
  binding: string;
}

const CATEGORIES: readonly ToolCategory[] = ['read', 'edit', 'run', 'net', 'agents'];
const NO_DELEGATION = ['Agent', 'Task', 'SendMessage', 'ListAgents'];
const known = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texts = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 1000 && v.every((x) => typeof x === 'string' && !!x && !x.includes('\0')) && new Set(v).size === v.length;
const categories = (v: unknown): v is ToolCategory[] => texts(v) && v.every((x) => CATEGORIES.includes(x as ToolCategory));
const mcpTool = (v: string) => /^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(v);

export function assessCapability(
  capability: ExecutorCapability,
  binding: string,
  evidence: readonly CapabilityEvidence[],
  now: number,
  checks: Record<ExecutorCapability, readonly string[]> = CAPABILITY_CHECKS,
): CapabilityAssessment {
  const result = (state: CapabilityState, reason: CapabilityAssessment['reason']): CapabilityAssessment => ({ capability, state, reason });
  if (!Number.isSafeInteger(now) || now < 0) return result('unknown', 'invalid');
  const rows = evidence.filter((e) => e.capability === capability);
  if (!rows.length) return result('unknown', 'no-evidence');
  const matching = rows.filter((e) => e.binding === binding);
  if (!matching.length) return result('unknown', 'changed-binding');
  if (matching.some((e) => !Number.isSafeInteger(e.checkedAt))) return result('unknown', 'invalid');
  const newest = Math.max(...matching.map((e) => e.checkedAt));
  // Uma falha mais nova (ou conflitante no mesmo instante) nunca recorre ao sucesso antigo.
  let final = result('verified', 'verified');
  for (const row of matching.filter((e) => e.checkedAt === newest)) {
    if (
      row.version !== 1 ||
      row.source !== 'host-probe' ||
      row.checkedAt < 0 ||
      !Number.isSafeInteger(row.expiresAt) ||
      row.checkedAt > now ||
      row.expiresAt <= row.checkedAt ||
      !Array.isArray(row.checks) ||
      row.checks.some(
        (c) =>
          !known(c) ||
          typeof c.id !== 'string' ||
          !['passed', 'failed', 'unavailable'].includes(c.outcome) ||
          typeof c.receipt !== 'string' ||
          !/^[a-f0-9]{64}$/.test(c.receipt),
      ) ||
      new Set(row.checks.map((c) => c.id)).size !== row.checks.length
    )
      return result('unknown', 'invalid');
    if (row.expiresAt <= now) return result('unknown', 'expired');
    if (row.checks.some((c) => c.outcome === 'failed')) return result('partial', 'failed');
    if (
      row.checks.some((c) => c.outcome === 'unavailable') ||
      checks[capability].some((id) => !row.checks.some((c) => c.id === id && c.outcome === 'passed'))
    )
      final = result('partial', 'incomplete');
  }
  return final;
}

/** A mesma decisão pode ser usada em simulação e no gateway. Não consulta arquivos nem executa probes. */
export function admitExecution(
  tool: AiTool,
  permission: RunnerPermission,
  request: StrictExecutionRequest,
  binding: string,
  evidence: readonly CapabilityEvidence[],
  now: number,
  transport: ExecutionTransport = 'cli',
): ExecutionAdmissionDecision {
  const checks = capabilityChecks(transport);
  const decision: ExecutionAdmissionDecision = {
    version: 1,
    regime: request.regime,
    state: 'blocked',
    capabilities: EXECUTOR_CAPABILITIES.map((c) => assessCapability(c, binding, evidence, now, checks)),
    reasons: [],
    tools: [],
    deniedTools: [...NO_DELEGATION],
    mcpTools: [],
    activeMcpIds: [],
    binding,
  };
  const reason = (code: string, resourceId?: string) => decision.reasons.push({ code, ...(resourceId ? { resourceId } : {}) });
  const native = request.agentTools?.native;
  if (
    request.version !== 1 ||
    !['board', 'edits', 'full'].includes(permission) ||
    !known(request.mcpLevel) ||
    request.mcpLevel.permission !== permission ||
    !texts(request.mcpLevel.tools) ||
    request.mcpLevel.tools.some((name) => !mcpTool(name)) ||
    !['exclusive', 'compatible'].includes(request.regime) ||
    !known(request.boardTools) ||
    !['inherit', 'explicit'].includes(request.boardTools.mode) ||
    (request.boardTools.mode === 'explicit' && (!categories(request.boardTools.value) || Object.keys(request.boardTools).length !== 2)) ||
    (request.boardTools.mode === 'inherit' && Object.keys(request.boardTools).length !== 1) ||
    !categories(request.agentTools?.categories) ||
    !native ||
    !NATIVE_AGENT_TOOLS.includes(native.tool) ||
    !texts(native.allow) ||
    !texts(native.deny) ||
    [request.activeMcpIds, request.allowedMcpIds, request.boardMcpIds, request.mcpTools, request.boardMcpTools].some((v) => !texts(v)) ||
    !Array.isArray(request.mcpServers) ||
    request.mcpServers.some(
      (s) =>
        !known(s) ||
        typeof s.artifactId !== 'string' ||
        typeof s.name !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(s.name) ||
        s.name === 'faz-ai',
    ) ||
    new Set(request.mcpServers.map((s) => s.artifactId)).size !== request.mcpServers.length ||
    new Set(request.mcpServers.map((s) => s.name)).size !== request.mcpServers.length ||
    request.mcpTools.some((name) => !mcpTool(name)) ||
    request.boardMcpTools.some((name) => !mcpTool(name))
  ) {
    reason('invalid-request');
    return decision;
  }
  // Compatibilidade pode admitir descoberta externa, mas nunca afrouxa ferramentas/MCP/delegação.
  const required = request.regime === 'compatible' ? ['permissions', 'mcp', 'delegation'] : EXECUTOR_CAPABILITIES;
  if (
    request.regime === 'compatible' &&
    (request.compatibilityReview?.actor !== 'person' ||
      !Number.isSafeInteger(request.compatibilityReview.revision) ||
      request.compatibilityReview.revision < 1)
  )
    reason('compatibility-not-reviewed');
  for (const c of decision.capabilities)
    if (required.includes(c.capability) && c.state !== 'verified')
      decision.reasons.push({ code: 'capability-not-verified', capability: c.capability });
  if (native.tool && native.tool !== tool) reason('native-executor-mismatch');
  if (!native.tool && (native.allow.length || native.deny.length)) reason('native-executor-required');
  // Regras detalhadas que não sabemos intersectar são recusadas; não se tornam instrução no prompt.
  const builtin = new Set((agentToolsOf(tool) ?? []).flatMap((g) => g.tools.map((t) => t.name)));
  const recognized = (name: unknown): name is string => typeof name === 'string' && (builtin.has(name) || mcpTool(name));
  if (native.allow.some((name) => !recognized(name)) || native.deny.some((name) => !recognized(name)))
    reason('unsupported-native-restriction');
  const allowedCategories = request.agentTools.categories.filter(
    (c) => c !== 'agents' && (request.boardTools.mode === 'inherit' || request.boardTools.value.includes(c)),
  );
  const level = permission === 'full' ? ['read', 'edit', 'run', 'net'] : permission === 'edits' ? ['read', 'edit'] : ['read'];
  const candidates = (agentToolsOf(tool) ?? [])
    .filter((g) => allowedCategories.includes(g.id as ToolCategory) && level.includes(g.id))
    .flatMap((g) => g.tools.map((t) => t.name));
  const nativeAllow = native.tool ? new Set(native.allow) : null;
  const denied = new Set([...NO_DELEGATION, ...native.deny.filter(recognized)]);
  decision.tools = [...new Set(candidates)].filter((name) => !denied.has(name) && (!nativeAllow || nativeAllow.has(name)));
  decision.deniedTools = [...denied];
  for (const id of request.activeMcpIds) {
    if (!request.allowedMcpIds.includes(id) || !request.boardMcpIds.includes(id) || !request.mcpServers.some((s) => s.artifactId === id))
      reason('mcp-outside-boundary', id);
    else decision.activeMcpIds.push(id);
  }
  for (const name of request.mcpTools) {
    const server = /^mcp__([A-Za-z0-9_-]+)__/.exec(name)![1]!;
    const selected =
      server === 'faz-ai' || request.mcpServers.some((s) => s.name === server && decision.activeMcpIds.includes(s.artifactId));
    if (
      !selected ||
      !request.boardMcpTools.includes(name) ||
      !request.mcpLevel.tools.includes(name) ||
      !nativeAllow?.has(name) ||
      denied.has(name)
    )
      reason('mcp-operation-outside-boundary', name);
    else decision.mcpTools.push(name);
  }
  // Um executor ainda sem tradução detalhada não recebe selo por ter evidência de outra integração.
  // No ACP a tradução é a do protocolo: nenhuma ferramenta nativa (o board responde cada pedido pelo
  // nível e pelo manifesto do card), delegação negada e MCP só do `session/new`.
  if (transport === 'cli' && tool !== 'claude') reason('tool-mapping-unavailable');
  decision.state = decision.reasons.length ? 'blocked' : 'admitted';
  return decision;
}

/** Metadados de auditoria; registros importados nunca são usados como evidência local de capacidade. */
export function validateAdmissionDecision(v: unknown): asserts v is ExecutionAdmissionDecision {
  const keys = (o: unknown, names: string[]) =>
    known(o) && Object.keys(o).length === names.length && names.every((k) => Object.hasOwn(o, k));
  const fail = (): never => {
    throw new Error('Decisão de admissão inválida ou versão não suportada.');
  };
  if (!keys(v, ['version', 'regime', 'state', 'capabilities', 'reasons', 'tools', 'deniedTools', 'mcpTools', 'activeMcpIds', 'binding']))
    fail();
  const d = v as unknown as ExecutionAdmissionDecision;
  if (
    d.version !== 1 ||
    !['exclusive', 'compatible'].includes(d.regime) ||
    !['admitted', 'blocked'].includes(d.state) ||
    typeof d.binding !== 'string' ||
    (!/^[a-f0-9]{64}$/.test(d.binding) && !(d.binding === '' && d.state === 'blocked')) ||
    [d.tools, d.deniedTools, d.mcpTools, d.activeMcpIds].some((a) => !texts(a) || a.some((s) => s.length > 1000)) ||
    !Array.isArray(d.capabilities) ||
    d.capabilities.length !== EXECUTOR_CAPABILITIES.length ||
    new Set(d.capabilities.map((c) => c?.capability)).size !== EXECUTOR_CAPABILITIES.length ||
    d.capabilities.some(
      (c) =>
        !keys(c, ['capability', 'state', 'reason']) ||
        !EXECUTOR_CAPABILITIES.includes(c.capability) ||
        !['verified', 'partial', 'unknown'].includes(c.state) ||
        !['verified', 'no-evidence', 'changed-binding', 'expired', 'incomplete', 'failed', 'invalid'].includes(c.reason),
    ) ||
    !Array.isArray(d.reasons) ||
    d.reasons.length > 1000 ||
    d.reasons.some(
      (r) =>
        !known(r) ||
        Object.keys(r).some((k) => !['code', 'capability', 'resourceId'].includes(k)) ||
        typeof r.code !== 'string' ||
        !/^[a-z-]{1,100}$/.test(r.code) ||
        (r.capability !== undefined && !EXECUTOR_CAPABILITIES.includes(r.capability)) ||
        (r.resourceId !== undefined && (typeof r.resourceId !== 'string' || r.resourceId.length > 1000 || r.resourceId.includes('\0'))),
    )
  )
    fail();
  if (d.state === 'admitted' && d.reasons.length) fail();
}
