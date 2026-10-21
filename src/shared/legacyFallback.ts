// Reserva legada (`ModelRule.fallback`) convertida em proposta de política: desligada e pendente de revisão.
// A regra antiga continua guardada só como origem; o fallback em execução é decidido apenas pelas políticas.
import type { ExecutionPolicy, ExecutionPolicyRecord, ExecutionTarget } from './executionPolicies';
import { parseModelValue, type ModelOption, type ModelRule } from './models';

export const LEGACY_POLICY_PREFIX = 'legacy-';
export type LegacyUnconvertible = 'model-missing' | 'fallback-missing' | 'effort-invalid' | 'id-invalid';

export interface LegacyFallbackNote {
  ruleId: string;
  ruleName: string;
  policyId: string | null;
  status: 'proposed' | 'unconvertible';
  /** Revisão da proposta no banco: enquanto for `pending` (ou a política estiver desligada), nada troca de CLI sozinho. */
  review: ExecutionPolicyRecord['review'] | null;
  reason?: LegacyUnconvertible;
}

const SAFE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,239}$/;

function targetOf(value: string, catalog: readonly ModelOption[]): ExecutionTarget | LegacyUnconvertible {
  const parsed = parseModelValue(value);
  const option = parsed && catalog.find((m) => m.id === parsed.id);
  if (!parsed || !option) return 'model-missing';
  if (parsed.effort !== null && !option.efforts.includes(parsed.effort)) return 'effort-invalid';
  return { profileId: option.tool, model: option.model, effort: parsed.effort };
}

/** A política proposta para a reserva de uma regra, ou o motivo de não haver como convertê-la. */
export function legacyFallbackProposal(
  rule: ModelRule,
  index: number,
  catalog: readonly ModelOption[],
): { policy: ExecutionPolicy } | { reason: LegacyUnconvertible } {
  if (!rule.fallback) return { reason: 'fallback-missing' };
  const source = targetOf(rule.model, catalog);
  const alternative = targetOf(rule.fallback, catalog);
  if (typeof source === 'string') return { reason: source };
  if (typeof alternative === 'string') return { reason: alternative };
  const id = `${LEGACY_POLICY_PREFIX}${rule.id}`;
  if (!SAFE.test(id)) return { reason: 'id-invalid' };
  const label = rule.name.trim() || rule.id;
  return {
    policy: {
      version: 1,
      id,
      // a origem fica no nome e no id; as condições da regra (campos/tipo do card) não têm equivalente e não são copiadas
      name: `Reserva migrada da regra: ${label}`.slice(0, 240),
      enabled: false,
      priority: Math.min(1000000, 100 + index * 10),
      conditions: {
        profileIds: [source.profileId],
        models: [source.model],
        actions: [],
        agentIds: [],
        phaseIds: [],
        cardTypeIds: [],
        origins: [],
        failures: ['quota'],
        explicit: 'include',
      },
      action: 'offer',
      targets: [alternative],
      limits: { maxAttempts: 2, maxElapsedMs: 3600000, backoffMs: 0, globalProcesses: null, perProfile: {} },
    },
  };
}

/** Todas as propostas possíveis das regras atuais (a ordem da lista dá a prioridade). */
export function legacyFallbackProposals(rules: readonly ModelRule[], catalog: readonly ModelOption[]): ExecutionPolicy[] {
  return rules.flatMap((rule, index) => {
    const result = legacyFallbackProposal(rule, index, catalog);
    return 'policy' in result ? [result.policy] : [];
  });
}

/** Avisos de migração: o que virou proposta, em que estado está, e o que ficou sem conversão. */
export function legacyFallbackNotes(
  rules: readonly ModelRule[],
  records: readonly ExecutionPolicyRecord[],
  catalog: readonly ModelOption[],
): LegacyFallbackNote[] {
  return rules.flatMap((rule, index): LegacyFallbackNote[] => {
    if (!rule.fallback) return [];
    const base = { ruleId: rule.id, ruleName: rule.name };
    const result = legacyFallbackProposal(rule, index, catalog);
    if ('reason' in result) return [{ ...base, policyId: null, status: 'unconvertible', review: null, reason: result.reason }];
    const record = records.find((r) => r.policy.id === result.policy.id);
    // sem registro: a pessoa descartou a proposta, e isso não se repete
    return record ? [{ ...base, policyId: record.policy.id, status: 'proposed', review: record.review }] : [];
  });
}
