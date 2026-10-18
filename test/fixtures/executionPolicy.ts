import type { ModelOption } from '../../src/shared/models';
import type {
  ExecutionPolicy,
  ExecutionPolicyRecord,
  ExecutionTarget,
  PolicyCandidate,
  PolicyEvaluation,
  PolicyProfile,
} from '../../src/shared/executionPolicies';

export const catalog: ModelOption[] = [
  { id: 'claude:opus', tool: 'claude', model: 'opus', label: 'Principal', efforts: ['high'], defaultEffort: 'high' },
  { id: 'claude:haiku', tool: 'claude', model: 'haiku', label: 'Alternativo', efforts: ['medium'], defaultEffort: 'medium' },
  { id: 'cursor:composer', tool: 'cursor', model: 'composer', label: 'Composer', efforts: ['high'], defaultEffort: 'high' },
];
export const profiles: PolicyProfile[] = [
  { id: 'claude', tool: 'claude', enabled: true, modelIds: ['claude:opus', 'claude:haiku'] },
  { id: 'copy', tool: 'claude', enabled: true, modelIds: ['claude:opus', 'claude:haiku'] },
  { id: 'cursor', tool: 'cursor', enabled: true, modelIds: ['cursor:composer'] },
];
export const primary: ExecutionTarget = { profileId: 'claude', model: 'opus', effort: 'high' };
export const alternative: ExecutionTarget = { profileId: 'claude', model: 'haiku', effort: 'medium' };
export const other: ExecutionTarget = { profileId: 'cursor', model: 'composer', effort: 'high' };
export function policy(over: Partial<ExecutionPolicy> = {}): ExecutionPolicy {
  return {
    version: 1,
    id: 'quota',
    name: 'Quota da implementação',
    enabled: true,
    priority: 10,
    conditions: {
      profileIds: ['claude'],
      models: ['opus'],
      actions: ['work'],
      agentIds: [],
      phaseIds: [],
      cardTypeIds: [],
      origins: ['manual'],
      failures: ['quota'],
      explicit: 'include',
    },
    action: 'auto',
    targets: [alternative, other],
    limits: { maxAttempts: 3, maxElapsedMs: 1000, backoffMs: 0, globalProcesses: 2, perProfile: { claude: 1 } },
    ...over,
  };
}
export const record = (p = policy()): ExecutionPolicyRecord => ({ policy: p, revision: 1, review: 'reviewed', updatedAt: 1 });
export const candidate = (target: ExecutionTarget): PolicyCandidate => ({
  target,
  available: true,
  credential: 'reviewed',
  admission: 'admitted',
  constraints: { permission: 'board', regime: 'exclusive', agentId: 'agent', scopeDigest: 'a'.repeat(64) },
});
export function evaluation(over: Partial<PolicyEvaluation> = {}): PolicyEvaluation {
  return {
    snapshot: { version: 1, records: [record()] },
    requested: { state: 'resolved', target: primary, from: 'card', explicit: true },
    context: { action: 'work', agentId: 'agent', phaseId: 'phase', cardTypeId: 'type', origin: 'manual' },
    failure: 'quota',
    effects: 'none',
    constraints: candidate(primary).constraints,
    candidates: [candidate(alternative), candidate(other)],
    trace: { startedAt: 0, attempts: [{ target: primary, startedAt: 0, endedAt: 100, consumption: null }], budget: null },
    running: { global: 0, perProfile: {} },
    now: 200,
    ...over,
  };
}
