import { catalogTool, isReadyProfile, modeLabel, toolLabel } from './aiProfiles';
import { ALL_AI_BASES, baseInfo } from './harness';
import type { BoardState } from './model';
import type { ModelOption } from './models';
import { CONTEXT_ACTIONS } from './contextPlanning';
import {
  POLICY_FAILURES,
  executionPolicyProblems,
  evaluateExecutionPolicy,
  resolveExecutionTarget,
  validateExecutionPolicy,
  type ExecutionPolicy,
  type ExecutionPolicyRecord,
  type ExecutionPolicySnapshot,
  type PolicyDecision,
  type PolicyProblem,
  type PolicyEvaluation,
  type PolicyProfile,
} from './executionPolicies';

export interface PolicyLibrary {
  snapshot: ExecutionPolicySnapshot;
  profiles: PolicyProfile[];
  models: ModelOption[];
  /** Reservas de regras antigas que viraram proposta (ou ficaram sem conversão); ausente quando não há. */
  legacy?: import('./legacyFallback').LegacyFallbackNote[];
}
export interface PolicyScenario {
  /** Rascunho a avaliar no lugar da salva; nulo avalia só as políticas salvas (Próxima execução). */
  draft: ExecutionPolicy | null;
  sourceValue: string;
  defaultProfileId: string;
  explicit: boolean;
  context: PolicyEvaluation['context'];
  failure: PolicyEvaluation['failure'];
  effects: PolicyEvaluation['effects'];
  eligibility: 'admitted' | 'pending-credentials' | 'blocked-admission' | 'unavailable';
  elapsedMs: number;
  runningGlobal: number;
  runningByProfile: Record<string, number>;
}
export interface PolicySimulation {
  decision: PolicyDecision;
  hypothetical: true;
  problems: PolicyProblem[];
  requested: PolicyEvaluation['requested'];
}
export interface PolicyReply {
  library?: PolicyLibrary;
  history?: ExecutionPolicyRecord[];
  nextBefore?: number | null;
  simulation?: PolicySimulation;
  assistance?: import('./policyAssistant').PolicyAssistResult;
  error?: string;
}
/**
 * O catálogo das políticas: os perfis do board (os do catálogo da extensão, as cópias e os personalizados, com a
 * ferramenta do catálogo de modelos de cada um) e os modelos do catálogo do board. Antes da história 12 era a
 * lista fixa das três CLIs prontas, e um perfil como o do Gemini (em qualquer modo) não podia ser destino nem
 * origem de uma política: a regra salva com ele saía como "Destino inválido". Não representa instalação, login
 * nem admissão: todo perfil entra como ligado, e quem confere se o destino roda de fato é a execução
 * (`runTargetOfPolicy`, só perfil ligado e modelo no catálogo dele).
 */
export function builtinPolicyCatalog(state: BoardState): { profiles: PolicyProfile[]; models: ModelOption[] } {
  const models = state.board.modelCatalog.map(({ id, tool, model, label, efforts, defaultEffort }) => ({
    id,
    tool,
    model,
    label,
    efforts,
    defaultEffort,
  }));
  // um board sem perfis gravados (o estado de teste mais antigo) ainda vê as CLIs prontas
  const source: { id: string; tool: string; label: string }[] = state.board.aiProfiles.length
    ? state.board.aiProfiles.map((p) => ({
        id: p.id,
        tool: catalogTool(p),
        // o rótulo da lista dos perfis ("Gemini · API"); a cópia e o personalizado, pelo nome que a pessoa deu
        label: `${isReadyProfile(p) ? toolLabel(p.tool) : p.name} · ${modeLabel(p.mode)}`,
      }))
    : ALL_AI_BASES.map((tool) => ({ id: tool, tool, label: baseInfo(tool).label }));
  // um id repetido tornaria toda resolução ambígua (`profile-ambiguous`): vale o primeiro
  const profiles: PolicyProfile[] = [];
  for (const p of source)
    if (!profiles.some((x) => x.id === p.id))
      profiles.push({ ...p, enabled: true, modelIds: models.filter((m) => m.tool === p.tool).map((m) => m.id) });
  return { models, profiles };
}
/** Cenário hipotético: nunca recebe recibos nem é usado para autorizar uma execução. */
export function simulatePolicyScenario(state: BoardState, snapshot: ExecutionPolicySnapshot, scenario: PolicyScenario): PolicySimulation {
  if (scenario.draft !== null) validateExecutionPolicy(scenario.draft);
  const catalog = builtinPolicyCatalog(state);
  const fail = (): never => {
    throw new Error('Cenário de política inválido.');
  };
  const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 1000000;
  if (
    typeof scenario.sourceValue !== 'string' ||
    scenario.sourceValue.length > 1000 ||
    !catalog.profiles.some((p) => p.id === scenario.defaultProfileId) ||
    typeof scenario.explicit !== 'boolean' ||
    !scenario.context ||
    !CONTEXT_ACTIONS.includes(scenario.context.action) ||
    !['manual', 'heartbeat', 'autopilot', 'chat', 'test'].includes(scenario.context.origin) ||
    !POLICY_FAILURES.includes(scenario.failure) ||
    !['none', 'partial', 'unknown'].includes(scenario.effects) ||
    !['admitted', 'pending-credentials', 'blocked-admission', 'unavailable'].includes(scenario.eligibility) ||
    !Number.isSafeInteger(scenario.elapsedMs) ||
    scenario.elapsedMs < 0 ||
    scenario.elapsedMs > 86400000 ||
    !count(scenario.runningGlobal) ||
    !scenario.runningByProfile ||
    typeof scenario.runningByProfile !== 'object' ||
    Object.entries(scenario.runningByProfile).some(([id, n]) => !catalog.profiles.some((p) => p.id === id) || !count(n))
  )
    fail();
  const { agentId, phaseId, cardTypeId } = scenario.context;
  if (
    (agentId !== null && !state.harness.library?.artifacts.some((a) => a.kind === 'agent' && a.id === agentId)) ||
    (phaseId !== null && !state.columns.some((c) => c.id === phaseId)) ||
    (cardTypeId !== null && !state.cardTypes.some((t) => t.id === cardTypeId))
  )
    fail();
  const requested = resolveExecutionTarget({
    choices: [{ from: scenario.explicit ? 'card' : 'rule', value: scenario.sourceValue }],
    defaultProfileId: scenario.defaultProfileId,
    profiles: catalog.profiles,
    catalog: catalog.models,
  });
  const draft = scenario.draft;
  const records = snapshot.records.filter((r) => r.policy.id !== draft?.id);
  if (draft) {
    const revision = (snapshot.records.find((r) => r.policy.id === draft.id)?.revision ?? 0) + 1;
    // Revisão admitida somente na cópia da simulação, sem alterar o registro pendente importado.
    records.push({ policy: structuredClone(draft), revision, review: 'reviewed', updatedAt: 0 });
  }
  // A regra vencedora pode ser outra política salva; o cenário cobre todos os destinos distintos.
  const targets = [
    ...new Map(
      records.flatMap((r) => r.policy.targets).map((target) => [JSON.stringify([target.profileId, target.model, target.effort]), target]),
    ).values(),
  ];
  const constraints = { permission: 'board' as const, regime: 'exclusive' as const, agentId, scopeDigest: '0'.repeat(64) };
  const decision = evaluateExecutionPolicy({
    snapshot: { version: 1, records },
    requested,
    context: scenario.context,
    failure: scenario.failure,
    effects: scenario.effects,
    constraints,
    candidates: targets.map((target) => ({
      target,
      available: scenario.eligibility !== 'unavailable',
      credential: scenario.eligibility === 'pending-credentials' ? 'pending' : 'reviewed',
      admission: scenario.eligibility === 'admitted' ? 'admitted' : 'blocked',
      constraints,
    })),
    trace: {
      startedAt: 0,
      attempts: requested.state === 'resolved' ? [{ target: requested.target, startedAt: 0, endedAt: 0, consumption: null }] : [],
      budget: null,
    },
    running: { global: scenario.runningGlobal, perProfile: scenario.runningByProfile },
    now: scenario.elapsedMs,
  });
  const problems = executionPolicyProblems(records, catalog.profiles, catalog.models);
  return {
    decision: problems.length ? { ...decision, action: 'block', reason: 'invalid-policy-set', target: null } : decision,
    hypothetical: true,
    requested,
    problems,
  };
}
