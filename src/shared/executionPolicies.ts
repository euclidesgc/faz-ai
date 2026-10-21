// Evolução das regras de modelo: uma decisão pura para execução e simulação, sem spawn nem inferência.
import { parseModelValue, type ModelOption } from './models';
import { effortToRun } from './execution';
import type { AiTool } from './harness';
import type { RunnerPermission } from './runner';
import { CONTEXT_ACTIONS, type ContextAction } from './contextPlanning';
import type { AiRunOrigin } from './log';

export const POLICY_FAILURES = [
  'auth',
  'quota',
  'rate-limit',
  'unavailable',
  'capability',
  'permission',
  'flag-refused',
  'timeout',
  'invalid-output',
  'partial-work',
  'unknown',
] as const;
export type PolicyFailure = (typeof POLICY_FAILURES)[number];
export interface ExecutionTarget {
  profileId: string;
  model: string | null;
  effort: string | null;
}
export interface PolicyProfile {
  id: string;
  tool: AiTool;
  enabled: boolean;
  modelIds: string[];
}
export type TargetSource = 'card' | 'activity' | 'chat' | 'agent' | 'phase' | 'rule' | 'board';
export type TargetResolution =
  | { state: 'resolved'; target: ExecutionTarget; from: TargetSource; explicit: boolean }
  | { state: 'blocked'; reason: string; from: TargetSource; value: string };
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,239}$/.test(v);
const modelName = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_./-]{0,239}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Record<string, unknown> =>
  object(v) && Object.keys(v).length === names.length && names.every((name) => Object.hasOwn(v, name));
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const list = (v: unknown, check: (x: unknown) => boolean) =>
  Array.isArray(v) && v.length <= 100 && v.every(check) && new Set(v).size === v.length;
export const targetKey = (t: ExecutionTarget): string => JSON.stringify([t.profileId, t.model, t.effort]);
export function validExecutionTarget(v: unknown): v is ExecutionTarget {
  return (
    keys(v, ['profileId', 'model', 'effort']) &&
    id(v.profileId) &&
    (v.model === null || modelName(v.model)) &&
    (v.effort === null || id(v.effort)) &&
    (v.model !== null || v.effort === null)
  );
}
export function targetProblem(target: ExecutionTarget, profiles: readonly PolicyProfile[], catalog: readonly ModelOption[]): string | null {
  if (!validExecutionTarget(target)) return 'target-invalid';
  const profile = profiles.find((p) => p.id === target.profileId);
  if (!profile) return 'profile-missing';
  if (!profile.enabled) return 'profile-disabled';
  if (target.model === null) return target.effort === null ? null : 'effort-invalid';
  const matches = catalog.filter((m) => profile.modelIds.includes(m.id) && m.tool === profile.tool && m.model === target.model);
  if (matches.length !== 1) return matches.length ? 'model-ambiguous' : 'model-missing';
  return target.effort !== null && !matches[0]!.efforts.includes(target.effort) ? 'effort-invalid' : null;
}
/** A primeira escolha presente é definitiva: prefixo explícito nunca segue o perfil-cópia padrão. */
export function resolveExecutionTarget(input: {
  choices: { from: TargetSource; value: string | null | undefined }[];
  defaultProfileId: string;
  profiles: readonly PolicyProfile[];
  catalog: readonly ModelOption[];
}): TargetResolution {
  if (new Set(input.profiles.map((p) => p.id)).size !== input.profiles.length)
    return { state: 'blocked', reason: 'profile-ambiguous', from: 'board', value: '' };
  const choice = input.choices.find((c) => c.value !== null && c.value !== undefined && c.value !== '');
  if (!choice) {
    const target = { profileId: input.defaultProfileId, model: null, effort: null };
    const problem = targetProblem(target, input.profiles, input.catalog);
    return problem
      ? { state: 'blocked', reason: problem, from: 'board', value: input.defaultProfileId }
      : { state: 'resolved', target, from: 'board', explicit: false };
  }
  const raw = choice.value!;
  const parsed = raw.endsWith('@') ? null : parseModelValue(raw);
  const colon = parsed?.id.indexOf(':') ?? -1;
  if (!parsed || colon < 1 || parsed.id.indexOf(':', colon + 1) >= 0)
    return { state: 'blocked', reason: 'model-invalid', from: choice.from, value: raw };
  const target = { profileId: parsed.id.slice(0, colon), model: parsed.id.slice(colon + 1), effort: parsed.effort };
  const problem = validExecutionTarget(target) ? targetProblem(target, input.profiles, input.catalog) : 'model-invalid';
  if (!problem && target.effort === null) {
    const profile = input.profiles.find((p) => p.id === target.profileId)!;
    const option = input.catalog.find((m) => profile.modelIds.includes(m.id) && m.tool === profile.tool && m.model === target.model)!;
    target.effort = effortToRun(option, null);
  }
  return problem
    ? { state: 'blocked', reason: problem, from: choice.from, value: raw }
    : { state: 'resolved', target, from: choice.from, explicit: ['card', 'activity', 'chat'].includes(choice.from) };
}
export interface PolicyConditions {
  profileIds: string[];
  models: (string | null)[];
  actions: ContextAction[];
  agentIds: string[];
  phaseIds: string[];
  cardTypeIds: string[];
  origins: (AiRunOrigin | 'test')[];
  failures: PolicyFailure[];
  /** A troca de escolha explícita também exige perfil/modelo de origem exatos nas condições. */
  explicit: 'exclude' | 'include' | 'only';
}
export interface PolicyLimits {
  maxAttempts: number;
  maxElapsedMs: number;
  backoffMs: number;
  globalProcesses: number | null;
  perProfile: Record<string, number>;
}
export interface ExecutionPolicy {
  version: 1;
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: PolicyConditions;
  action: 'block' | 'wait' | 'offer' | 'auto';
  targets: ExecutionTarget[];
  limits: PolicyLimits;
}
export interface ExecutionPolicyRecord {
  policy: ExecutionPolicy;
  revision: number;
  review: 'reviewed' | 'pending';
  updatedAt: number;
}
export interface ExecutionPolicySnapshot {
  version: 1;
  records: ExecutionPolicyRecord[];
}
export function validateExecutionPolicy(v: unknown): asserts v is ExecutionPolicy {
  const fail = (): never => {
    throw new Error('Política de execução inválida ou versão não suportada.');
  };
  if (!keys(v, ['version', 'id', 'name', 'enabled', 'priority', 'conditions', 'action', 'targets', 'limits'])) fail();
  const p = v as unknown as ExecutionPolicy;
  if (
    p.version !== 1 ||
    !id(p.id) ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.length > 240 ||
    p.name.includes('\0') ||
    typeof p.enabled !== 'boolean' ||
    !integer(p.priority, 0, 1000000) ||
    !['block', 'wait', 'offer', 'auto'].includes(p.action)
  )
    fail();
  const c = p.conditions;
  if (
    !keys(c, ['profileIds', 'models', 'actions', 'agentIds', 'phaseIds', 'cardTypeIds', 'origins', 'failures', 'explicit']) ||
    ![c.profileIds, c.agentIds, c.phaseIds, c.cardTypeIds].every((v) => list(v, id)) ||
    !list(c.models, (v) => v === null || modelName(v)) ||
    !list(c.actions, (v) => CONTEXT_ACTIONS.includes(v as ContextAction)) ||
    !list(c.origins, (v) => ['manual', 'heartbeat', 'autopilot', 'chat', 'test'].includes(String(v))) ||
    !list(c.failures, (v) => POLICY_FAILURES.includes(v as PolicyFailure)) ||
    !c.failures.length ||
    !['exclude', 'include', 'only'].includes(c.explicit)
  )
    fail();
  if (
    !Array.isArray(p.targets) ||
    p.targets.length > 100 ||
    p.targets.some((t) => !validExecutionTarget(t)) ||
    new Set(p.targets.map(targetKey)).size !== p.targets.length ||
    (['block', 'wait'].includes(p.action) ? p.targets.length !== 0 : p.targets.length === 0)
  )
    fail();
  const l = p.limits;
  if (
    !keys(l, ['maxAttempts', 'maxElapsedMs', 'backoffMs', 'globalProcesses', 'perProfile']) ||
    !integer(l.maxAttempts, 1, 100) ||
    !integer(l.maxElapsedMs, 1, 86400000) ||
    !integer(l.backoffMs, 0, l.maxElapsedMs) ||
    (l.globalProcesses !== null && !integer(l.globalProcesses, 1, 10000)) ||
    !object(l.perProfile) ||
    Object.keys(l.perProfile).length > 100 ||
    Object.entries(l.perProfile).some(([k, n]) => !id(k) || !integer(n, 1, 10000))
  )
    fail();
}
export function validateExecutionPolicySnapshot(value: unknown): asserts value is ExecutionPolicySnapshot {
  if (!keys(value, ['version', 'records']) || value.version !== 1 || !Array.isArray(value.records) || value.records.length > 200)
    throw new Error('Snapshot de políticas inválido.');
  const ids = new Set<string>();
  for (const row of value.records) {
    if (
      !keys(row, ['policy', 'revision', 'review', 'updatedAt']) ||
      !integer(row.revision, 1, Number.MAX_SAFE_INTEGER) ||
      !integer(row.updatedAt, 0, Number.MAX_SAFE_INTEGER) ||
      !['reviewed', 'pending'].includes(String(row.review))
    )
      throw new Error('Versão de política inválida.');
    validateExecutionPolicy(row.policy);
    if (ids.has(row.policy.id)) throw new Error('Identidade de política repetida.');
    ids.add(row.policy.id);
  }
}
const overlaps = (a: readonly unknown[], b: readonly unknown[]) => !a.length || !b.length || a.some((x) => b.includes(x));
const accepts = (values: readonly unknown[], v: unknown) => !values.length || values.includes(v);
const conditionDimensions = ['profileIds', 'models', 'actions', 'agentIds', 'phaseIds', 'cardTypeIds', 'origins', 'failures'] as const;
export interface PolicyProblem {
  code: 'ambiguous-priority' | 'cycle' | 'target-invalid';
  policyIds: string[];
  target?: ExecutionTarget;
}
/** Regras ativas empatadas ou cadeias cíclicas não dependem da ordem do array para escolher vencedora. */
export function executionPolicyProblems(
  records: readonly ExecutionPolicyRecord[],
  profiles?: readonly PolicyProfile[],
  catalog?: readonly ModelOption[],
): PolicyProblem[] {
  const active = records.filter((r) => r.review === 'reviewed' && r.policy.enabled);
  const problems: PolicyProblem[] = [];
  for (const row of records) validateExecutionPolicy(row.policy);
  for (const row of active)
    if (profiles && catalog)
      for (const target of row.policy.targets)
        if (targetProblem(target, profiles, catalog)) problems.push({ code: 'target-invalid', policyIds: [row.policy.id], target });
  for (let i = 0; i < active.length; i++)
    for (const b of active.slice(i + 1)) {
      const a = active[i]!;
      if (
        a.policy.priority === b.policy.priority &&
        conditionDimensions.every((key) => overlaps(a.policy.conditions[key], b.policy.conditions[key])) &&
        !(a.policy.conditions.explicit === 'exclude' && b.policy.conditions.explicit === 'only') &&
        !(a.policy.conditions.explicit === 'only' && b.policy.conditions.explicit === 'exclude')
      )
        problems.push({ code: 'ambiguous-priority', policyIds: [a.policy.id, b.policy.id] });
    }
  const routing = active.filter((r) => r.policy.targets.length);
  const edges = new Map(
    routing.map((a) => [
      a.policy.id,
      routing
        .filter(
          (b) =>
            (['actions', 'agentIds', 'phaseIds', 'cardTypeIds', 'origins'] as const).every((key) =>
              overlaps(a.policy.conditions[key], b.policy.conditions[key]),
            ) &&
            !(a.policy.conditions.explicit === 'exclude' && b.policy.conditions.explicit === 'only') &&
            !(a.policy.conditions.explicit === 'only' && b.policy.conditions.explicit === 'exclude') &&
            a.policy.targets.some(
              (t) => accepts(b.policy.conditions.profileIds, t.profileId) && accepts(b.policy.conditions.models, t.model),
            ),
        )
        .map((b) => b.policy.id),
    ]),
  );
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const walk = (node: string, chain: string[]): void => {
    if (visiting.has(node)) {
      problems.push({ code: 'cycle', policyIds: [...chain.slice(chain.indexOf(node)), node] });
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) walk(next, [...chain, node]);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of edges.keys()) walk(node, []);
  return problems;
}
export interface ExecutionConstraints {
  permission: RunnerPermission;
  regime: 'exclusive' | 'compatible';
  agentId: string | null;
  scopeDigest: string;
}
export interface PolicyCandidate {
  target: ExecutionTarget;
  available: boolean;
  credential: 'reviewed' | 'pending' | 'missing';
  admission: 'admitted' | 'blocked';
  constraints: ExecutionConstraints;
}
export interface PolicyBudget {
  maxAttempts: number;
  deadlineAt: number;
  globalProcesses: number | null;
  perProfile: Record<string, number>;
}
export interface PolicyAttempt {
  target: ExecutionTarget;
  startedAt: number;
  endedAt: number;
  consumption: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null } | null;
}
export interface PolicyEvaluation {
  snapshot: ExecutionPolicySnapshot;
  requested: TargetResolution;
  context: {
    action: ContextAction;
    agentId: string | null;
    phaseId: string | null;
    cardTypeId: string | null;
    origin: AiRunOrigin | 'test';
  };
  failure: PolicyFailure;
  effects: 'none' | 'partial' | 'unknown';
  constraints: ExecutionConstraints;
  candidates: PolicyCandidate[];
  trace: { startedAt: number; attempts: PolicyAttempt[]; budget: PolicyBudget | null };
  running: { global: number; perProfile: Record<string, number> };
  now: number;
}
export interface PolicyDecision {
  action: 'block' | 'wait' | 'offer' | 'fallback' | 'reconcile';
  reason: string;
  policy: { id: string; revision: number } | null;
  target: ExecutionTarget | null;
  alternatives: ExecutionTarget[];
  rejected: { target: ExecutionTarget; reason: string }[];
  budget: PolicyBudget | null;
  nextAttempt: number;
  notBefore: number | null;
  visited: ExecutionTarget[];
  /** Ausência de medição continua null; nenhum custo é inferido pelo avaliador. */
  consumption: PolicyAttempt['consumption'][];
}
function validConstraints(value: unknown): value is ExecutionConstraints {
  return (
    keys(value, ['permission', 'regime', 'agentId', 'scopeDigest']) &&
    ['board', 'edits', 'full'].includes(String(value.permission)) &&
    ['exclusive', 'compatible'].includes(String(value.regime)) &&
    (value.agentId === null || id(value.agentId)) &&
    typeof value.scopeDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.scopeDigest)
  );
}
function validBudget(value: unknown): value is PolicyBudget {
  return (
    keys(value, ['maxAttempts', 'deadlineAt', 'globalProcesses', 'perProfile']) &&
    integer(value.maxAttempts, 1, 100) &&
    integer(value.deadlineAt, 0, Number.MAX_SAFE_INTEGER) &&
    (value.globalProcesses === null || integer(value.globalProcesses, 1, 10000)) &&
    object(value.perProfile) &&
    Object.entries(value.perProfile).every(([key, n]) => id(key) && integer(n, 1, 10000))
  );
}
/** A origem é a escolha inicial congelada; os destinos ordenados continuam a mesma cadeia. */
export function evaluateExecutionPolicy(input: PolicyEvaluation): PolicyDecision {
  const d: PolicyDecision = {
    action: 'block',
    reason: 'no-policy',
    policy: null,
    target: null,
    alternatives: [],
    rejected: [],
    budget: input.trace.budget ? structuredClone(input.trace.budget) : null,
    nextAttempt: input.trace.attempts.length + 1,
    notBefore: null,
    visited: input.trace.attempts.map((a) => structuredClone(a.target)),
    consumption: input.trace.attempts.map((a) => structuredClone(a.consumption)),
  };
  const stop = (reason: string, action: PolicyDecision['action'] = 'block') => ({
    ...d,
    ...(action === 'block' || action === 'reconcile' ? { target: null } : {}),
    action,
    reason,
  });
  if (
    input.snapshot.version !== 1 ||
    !integer(input.now, 0, Number.MAX_SAFE_INTEGER) ||
    !integer(input.trace.startedAt, 0, input.now) ||
    input.trace.attempts.length > 100 ||
    !integer(input.running.global, 0, 1000000) ||
    Object.values(input.running.perProfile).some((n) => !integer(n, 0, 1000000))
  )
    return stop('invalid-input');
  if (
    !validConstraints(input.constraints) ||
    (input.trace.budget !== null && !validBudget(input.trace.budget)) ||
    input.candidates.some(
      (c) =>
        !validExecutionTarget(c.target) ||
        typeof c.available !== 'boolean' ||
        !['reviewed', 'pending', 'missing'].includes(c.credential) ||
        !['admitted', 'blocked'].includes(c.admission) ||
        !validConstraints(c.constraints),
    ) ||
    new Set(input.candidates.map((c) => targetKey(c.target))).size !== input.candidates.length
  )
    return stop('invalid-input');
  try {
    validateExecutionPolicySnapshot(input.snapshot);
  } catch {
    return stop('invalid-policy-set');
  }
  if (input.requested.state === 'blocked') return stop('requested-target-invalid');
  if (
    input.requested.state !== 'resolved' ||
    typeof input.requested.explicit !== 'boolean' ||
    !CONTEXT_ACTIONS.includes(input.context.action) ||
    !['manual', 'heartbeat', 'autopilot', 'chat', 'test'].includes(input.context.origin) ||
    [input.context.agentId, input.context.phaseId, input.context.cardTypeId].some((v) => v !== null && !id(v)) ||
    !validExecutionTarget(input.requested.target) ||
    !POLICY_FAILURES.includes(input.failure) ||
    !['none', 'partial', 'unknown'].includes(input.effects)
  )
    return stop('invalid-input');
  let lastEnd = input.trace.startedAt;
  for (const attempt of input.trace.attempts) {
    if (
      !validExecutionTarget(attempt.target) ||
      !integer(attempt.startedAt, lastEnd, input.now) ||
      !integer(attempt.endedAt, attempt.startedAt, input.now)
    )
      return stop('invalid-history');
    if (
      attempt.consumption !== null &&
      (!keys(attempt.consumption, ['inputTokens', 'outputTokens', 'costUsd']) ||
        Object.values(attempt.consumption).some((n) => n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0)))
    )
      return stop('invalid-consumption');
    lastEnd = attempt.endedAt;
  }
  if (new Set(d.visited.map(targetKey)).size !== d.visited.length) return stop('visited-cycle');
  if (input.effects !== 'none' || input.failure === 'partial-work' || input.failure === 'unknown' || input.failure === 'invalid-output')
    return stop('reconciliation-required', 'reconcile');
  try {
    if (executionPolicyProblems(input.snapshot.records).length) return stop('invalid-policy-set');
  } catch {
    return stop('invalid-policy-set');
  }
  const target = input.requested.target;
  const matches = input.snapshot.records
    .filter((r) => {
      const p = r.policy,
        c = p.conditions;
      return (
        r.review === 'reviewed' &&
        p.enabled &&
        accepts(c.profileIds, target.profileId) &&
        accepts(c.models, target.model) &&
        accepts(c.actions, input.context.action) &&
        accepts(c.agentIds, input.context.agentId) &&
        accepts(c.phaseIds, input.context.phaseId) &&
        accepts(c.cardTypeIds, input.context.cardTypeId) &&
        accepts(c.origins, input.context.origin) &&
        c.failures.includes(input.failure) &&
        (input.requested.state === 'resolved' && input.requested.explicit
          ? c.explicit !== 'exclude' && c.profileIds.includes(target.profileId) && c.models.includes(target.model)
          : c.explicit !== 'only')
      );
    })
    .sort((a, b) => a.policy.priority - b.policy.priority);
  const winner = matches[0];
  if (!winner) return d;
  d.policy = { id: winner.policy.id, revision: winner.revision };
  const p = winner.policy,
    l = p.limits,
    old = d.budget;
  const perProfile = { ...(old?.perProfile ?? {}) };
  for (const [id, cap] of Object.entries(l.perProfile)) perProfile[id] = Math.min(perProfile[id] ?? cap, cap);
  d.budget = {
    maxAttempts: Math.min(old?.maxAttempts ?? l.maxAttempts, l.maxAttempts),
    deadlineAt: Math.min(old?.deadlineAt ?? Number.MAX_SAFE_INTEGER, input.trace.startedAt + l.maxElapsedMs),
    globalProcesses:
      old?.globalProcesses == null
        ? l.globalProcesses
        : l.globalProcesses === null
          ? old.globalProcesses
          : Math.min(old.globalProcesses, l.globalProcesses),
    perProfile,
  };
  if (!validBudget(d.budget)) return stop('invalid-budget');
  if (input.now >= d.budget.deadlineAt) return stop('deadline-exhausted');
  if (input.trace.attempts.length >= d.budget.maxAttempts) return stop('attempts-exhausted');
  if (p.action === 'auto' && ['permission', 'capability'].includes(input.failure)) return stop('mandatory-constraint-failed');
  if (p.action === 'block') return stop('policy-block');
  if (p.action === 'wait') {
    d.notBefore = lastEnd + l.backoffMs;
    return stop('policy-wait', 'wait');
  }
  const visited = new Set(d.visited.map(targetKey));
  for (const candidate of p.targets) {
    let reason: string | null = visited.has(targetKey(candidate)) ? 'already-visited' : null;
    const available = input.candidates.find((c) => targetKey(c.target) === targetKey(candidate));
    if (!reason && !available) reason = 'availability-unknown';
    if (!reason && available) {
      if (!available.available) reason = 'unavailable';
      else if (available.credential !== 'reviewed') reason = 'credentials-not-reviewed';
      else if (available.admission !== 'admitted') reason = 'admission-blocked';
      else if (
        available.constraints.permission !== input.constraints.permission ||
        available.constraints.regime !== input.constraints.regime ||
        available.constraints.agentId !== input.constraints.agentId ||
        available.constraints.scopeDigest !== input.constraints.scopeDigest
      )
        reason = 'constraints-changed';
      else if (
        (d.budget.globalProcesses !== null && input.running.global >= d.budget.globalProcesses) ||
        (d.budget.perProfile[candidate.profileId] !== undefined &&
          (input.running.perProfile[candidate.profileId] ?? 0) >= d.budget.perProfile[candidate.profileId]!)
      )
        reason = 'concurrency-limit';
    }
    if (reason) d.rejected.push({ target: structuredClone(candidate), reason });
    else d.alternatives.push(structuredClone(candidate));
  }
  if (!d.alternatives.length) return stop('targets-exhausted');
  d.target = d.alternatives[0]!;
  d.notBefore = lastEnd + l.backoffMs;
  if (d.notBefore >= d.budget.deadlineAt) return stop('deadline-exhausted');
  if (input.now < d.notBefore) return stop('backoff', 'wait');
  return stop(p.action === 'offer' ? 'alternatives-require-review' : 'fallback-permitted', p.action === 'offer' ? 'offer' : 'fallback');
}
/** Alias deliberado: simulação não mantém uma implementação concorrente da decisão. */
export const simulateExecutionPolicy = evaluateExecutionPolicy;
