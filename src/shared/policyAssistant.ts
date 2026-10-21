import type { ExecutionPolicy, PolicyFailure } from './executionPolicies';
import type { PolicyProblem } from './executionPolicies';
import type { PolicyScenario, PolicySimulation } from './policyManagement';

/** O que a pessoa pede ao assistente: criar do objetivo, sugerir fallbacks para o rascunho ou revisar conflitos. */
export type PolicyAssistMode = 'create' | 'fallbacks' | 'conflicts';
export interface PolicyAssistInput {
  mode: PolicyAssistMode;
  /** objetivo em linguagem natural (obrigatório só para criar) */
  goal: string;
  /** o rascunho aberto no editor; nunca é a política ativa */
  draft: ExecutionPolicy | null;
  language: 'pt-BR' | 'en';
}
export interface PolicyAssistScenario {
  failure: PolicyFailure;
  eligibility: PolicyScenario['eligibility'];
  simulation: PolicySimulation;
}
export interface PolicyAssistResult {
  explanation: string;
  /** rascunho proposto, já validado; sempre desligado se for novo. Nada foi salvo. */
  policy: ExecutionPolicy | null;
  /** conflitos do conjunto de políticas salvas, calculados pelo validador (não pela IA) */
  problems: PolicyProblem[];
  scenarios: PolicyAssistScenario[];
}

export const MAX_GOAL_CHARS = 2000;
/** Padrões comuns de segredo: nem o objetivo vai à IA nem a resposta dela chega à tela com eles. */
const SECRET =
  /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|(api[_-]?key|token|secret|password|senha)\s*[:=]\s*\S+|Bearer\s+[A-Za-z0-9._-]{16,})/i;
export const hasSecret = (text: string): boolean => SECRET.test(text);

export interface PolicyChange {
  path: string;
  before: string;
  after: string;
}
const flatten = (value: unknown, path: string, out: Map<string, string>): void => {
  if (Array.isArray(value) && value.some((v) => v && typeof v === 'object')) {
    value.forEach((v, i) => flatten(v, `${path}[${i + 1}]`, out));
    out.set(`${path}.length`, String(value.length));
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
  } else out.set(path, JSON.stringify(value));
};
/** Os campos que mudam do rascunho atual para a proposta; sem base, tudo é novo. */
export function policyChanges(before: ExecutionPolicy | null, after: ExecutionPolicy): PolicyChange[] {
  const a = new Map<string, string>(),
    b = new Map<string, string>();
  if (before) flatten(before, '', a);
  flatten(after, '', b);
  const changes: PolicyChange[] = [];
  for (const path of new Set([...a.keys(), ...b.keys()]))
    if (path !== 'id' && a.get(path) !== b.get(path)) changes.push({ path, before: a.get(path) ?? '—', after: b.get(path) ?? '—' });
  return changes;
}
