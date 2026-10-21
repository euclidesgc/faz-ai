// Reserva legada (`fallback` nas regras de modelo gravadas) convertida em proposta de política: desligada e pendente de revisão.
// O campo não existe mais em `ModelRule`: só a conversão lê o JSON bruto do board, e o fallback em execução é decidido apenas pelas políticas.
import type { ExecutionPolicy, ExecutionPolicyRecord, ExecutionTarget } from './executionPolicies';
import { parseJsonArray, parseModelValue, type ModelOption } from './models';

export const LEGACY_POLICY_PREFIX = 'legacy-';
export type LegacyUnconvertible = 'model-missing' | 'effort-invalid' | 'id-invalid';

/** Uma regra do JSON gravado que ainda traz a reserva do motor antigo. */
export interface LegacyFallbackRule {
  id: string;
  name: string;
  model: string;
  fallback: string;
  /** posição na lista gravada: dá a prioridade da proposta */
  index: number;
}

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

/** Lê do JSON bruto de `boards.model_rules_json` só as regras que ainda têm reserva (string não vazia). */
export function parseLegacyFallbacks(json: string | null | undefined): LegacyFallbackRule[] {
  return parseJsonArray<{ id?: unknown; name?: unknown; model?: unknown; fallback?: unknown }>(json).flatMap((r, index) => {
    if (!r || typeof r.id !== 'string' || typeof r.model !== 'string' || typeof r.fallback !== 'string' || !r.fallback) return [];
    return [{ id: r.id, name: typeof r.name === 'string' ? r.name : '', model: r.model, fallback: r.fallback, index }];
  });
}

function targetOf(value: string, catalog: readonly ModelOption[]): ExecutionTarget | LegacyUnconvertible {
  const parsed = parseModelValue(value);
  const option = parsed && catalog.find((m) => m.id === parsed.id);
  if (!parsed || !option) return 'model-missing';
  if (parsed.effort !== null && !option.efforts.includes(parsed.effort)) return 'effort-invalid';
  return { profileId: option.tool, model: option.model, effort: parsed.effort };
}

/** A política proposta para a reserva de uma regra, ou o motivo de não haver como convertê-la. */
export function legacyFallbackProposal(
  rule: LegacyFallbackRule,
  catalog: readonly ModelOption[],
): { policy: ExecutionPolicy } | { reason: LegacyUnconvertible } {
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
      priority: Math.min(1000000, 100 + rule.index * 10),
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

/** Todas as propostas possíveis das regras legadas (o índice de cada uma dá a prioridade). */
export function legacyFallbackProposals(rules: readonly LegacyFallbackRule[], catalog: readonly ModelOption[]): ExecutionPolicy[] {
  return rules.flatMap((rule) => {
    const result = legacyFallbackProposal(rule, catalog);
    return 'policy' in result ? [result.policy] : [];
  });
}

/** Avisos de migração: o que virou proposta, em que estado está, e o que ficou sem conversão. */
export function legacyFallbackNotes(
  rules: readonly LegacyFallbackRule[],
  records: readonly ExecutionPolicyRecord[],
  catalog: readonly ModelOption[],
): LegacyFallbackNote[] {
  return rules.flatMap((rule): LegacyFallbackNote[] => {
    const base = { ruleId: rule.id, ruleName: rule.name };
    const result = legacyFallbackProposal(rule, catalog);
    if ('reason' in result) return [{ ...base, policyId: null, status: 'unconvertible', review: null, reason: result.reason }];
    const record = records.find((r) => r.policy.id === result.policy.id);
    // sem registro: a pessoa descartou a proposta, e isso não se repete
    return record ? [{ ...base, policyId: record.policy.id, status: 'proposed', review: record.review }] : [];
  });
}
