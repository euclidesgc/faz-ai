// Ponto único em que o host chama o avaliador de políticas: runner (cards, refinar, resumo, conflito) e chat
// (conversa, assistentes e sugestões) passam por aqui, sem cada um montar a própria avaliação nem decidir troca de alvo.
import { createHash } from 'node:crypto';
import { catalogTool, isReadyCli } from '../shared/aiProfiles';
import type { ContextAction } from '../shared/contextPlanning';
import { effortToRun } from '../shared/execution';
import {
  evaluateExecutionPolicy,
  type ExecutionConstraints,
  type ExecutionTarget,
  type PolicyAttempt,
  type PolicyBudget,
  type PolicyDecision,
  type PolicyFailure,
  type ExecutionPolicySnapshot,
  type TargetSource,
} from '../shared/executionPolicies';
import type { AiRunOrigin } from '../shared/log';
import type { BoardState } from '../shared/model';
import { modelValue } from '../shared/models';
import { cliProblem } from '../shared/requirements';
import type { RunTarget, RunTargetSource } from '../shared/runTarget';
import type { AiRunEnd } from './ai/gateway';

/**
 * A cadeia de uma execução trocada por política: o alvo que a pessoa pediu (congelado), quando a primeira
 * tentativa começou, as tentativas já feitas e o orçamento acumulado. Passa de uma tentativa para a
 * seguinte para que um destino já visitado não reinicie a cadeia.
 */
export interface Chain {
  requested: RunTarget;
  startedAt: number;
  attempts: PolicyAttempt[];
  budget: PolicyBudget | null;
}

export const POLICY_SOURCE: Record<RunTargetSource, TargetSource> = {
  card: 'card',
  agent: 'agent',
  rule: 'rule',
  default: 'board',
  chat: 'chat',
  fallback: 'rule',
};

export const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,239}$/;

/** O modelo/esforço do alvo no formato que a ferramenta entende (nome do modelo e esforço). */
export function targetModel(state: BoardState, target: RunTarget): { name: string; effort: string | null } | null {
  if (!target.model) return null;
  const option = state.board.modelCatalog.find((o) => o.tool === catalogTool(target.cli) && o.model === target.model!.name);
  return { name: target.model.name, effort: option ? effortToRun(option, target.model.effort) : target.model.effort };
}

/** O alvo no formato das políticas (perfil, modelo e esforço como a CLI os recebe). */
export function executionTargetOf(state: BoardState, target: RunTarget): ExecutionTarget {
  const m = targetModel(state, target);
  return { profileId: target.cli.id, model: m?.name ?? null, effort: m ? m.effort : null };
}

/**
 * O destino de uma política como alvo de execução: só vale com o perfil ligado e o modelo (e o esforço) no
 * catálogo dele. Sem isso a troca não acontece.
 */
export function runTargetOfPolicy(state: BoardState, t: ExecutionTarget): RunTarget | null {
  const cli = state.board.aiProfiles.find((p) => p.id === t.profileId && p.enabled);
  if (!cli) return null;
  if (t.model === null) return { cli, model: null, value: '', source: 'fallback' };
  const option = state.board.modelCatalog.find((o) => o.tool === catalogTool(cli) && o.model === t.model);
  if (!option || (t.effort !== null && !option.efforts.includes(t.effort))) return null;
  return { cli, model: { name: option.model, effort: t.effort }, value: modelValue(option.id, t.effort), source: 'fallback' };
}

/** A identidade do escopo que a troca precisa manter (agente, skills, regras, MCPs e ferramentas). */
export const scopeDigest = (parts: unknown): string => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/** O início de uma cadeia: o alvo pedido fica congelado. */
export const newChain = (requested: RunTarget, startedAt: number): Chain => ({ requested, startedAt, attempts: [], budget: null });

/** Esta tentativa na cadeia: alvo, janela de tempo e o consumo medido (null quando não houve medição, nunca zero). */
export function attemptOf(state: BoardState, target: RunTarget, chain: Chain, execStartedAt: number, end: AiRunEnd): PolicyAttempt {
  const last = chain.attempts.at(-1)?.endedAt ?? chain.startedAt;
  const startedAt = Math.max(execStartedAt, last);
  const c = end.report.consumption;
  return {
    target: executionTargetOf(state, target),
    startedAt,
    endedAt: Math.max(Date.now(), startedAt),
    consumption: c ? { inputTokens: c.inputTokens, outputTokens: c.outputTokens, costUsd: c.costUsd } : null,
  };
}

/** A cadeia depois desta tentativa: o destino seguinte parte dela, então nenhum destino já visitado reinicia. */
export const chainAfter = (chain: Chain, attempt: PolicyAttempt, decision: PolicyDecision): Chain => ({
  ...chain,
  attempts: [...chain.attempts, attempt],
  budget: decision.budget,
});

export interface GateInput {
  state: BoardState;
  snapshot: ExecutionPolicySnapshot;
  /** o alvo desta tentativa e a cadeia até ela */
  target: RunTarget;
  chain: Chain;
  execStartedAt: number;
  end: AiRunEnd;
  failure: PolicyFailure;
  /** o contexto que as políticas casam */
  action: ContextAction;
  origin: AiRunOrigin;
  agentId: string | null;
  phaseId: string | null;
  cardTypeId: string | null;
  constraints: ExecutionConstraints | null;
  /** a IA já agiu (respondeu, usou ferramentas ou comandos): repetir às cegas pode refazer o que foi feito */
  acted: boolean;
  /** os perfis das outras execuções em andamento */
  runningProfiles: string[];
}

/**
 * A decisão do avaliador único para uma falha de execução. Nunca inventa política: o snapshot salvo, o alvo pedido
 * (congelado na cadeia) e os destinos que o board realmente consegue executar. Falha antes do spawn não passa por
 * aqui (a admissão recusa antes); devolve null quando não há restrições ou o cálculo falha (tratado como "sem
 * política": não troca). `attempt` já é a tentativa que acabou de terminar.
 */
export function evaluateRunPolicy(input: GateInput): { decision: PolicyDecision; attempt: PolicyAttempt } | null {
  if (!input.constraints) return null;
  try {
    const { state, snapshot, chain } = input;
    const constraints = input.constraints;
    const requestedSource = chain.requested.source;
    const targets = new Map<string, ExecutionTarget>();
    for (const r of snapshot.records) for (const t of r.policy.targets) targets.set(JSON.stringify([t.profileId, t.model, t.effort]), t);
    const perProfile: Record<string, number> = {};
    for (const id of input.runningProfiles) perProfile[id] = (perProfile[id] ?? 0) + 1;
    const attempt = attemptOf(state, input.target, chain, input.execStartedAt, input.end);
    const decision = evaluateExecutionPolicy({
      snapshot,
      requested: {
        state: 'resolved',
        target: executionTargetOf(state, chain.requested),
        from: POLICY_SOURCE[requestedSource],
        explicit: requestedSource === 'card' || requestedSource === 'chat',
      },
      context: {
        action: input.action,
        agentId: input.agentId,
        phaseId: input.phaseId,
        cardTypeId: input.cardTypeId,
        origin: input.origin,
      },
      failure: input.failure,
      effects: input.acted ? 'partial' : 'none',
      constraints,
      candidates: [...targets.values()].map((target) => {
        const next = runTargetOfPolicy(state, target);
        const profile = next?.cli;
        return {
          target,
          available: !!next && cliProblem(state, next.cli.id) === null,
          credential:
            profile?.credentials?.review === 'pending'
              ? ('pending' as const)
              : profile && !isReadyCli(profile) && !(profile.credentials?.review === 'reviewed' && profile.credentials.available)
                ? ('missing' as const)
                : ('reviewed' as const),
          admission: 'admitted' as const,
          constraints,
        };
      }),
      trace: { startedAt: chain.startedAt, attempts: [...chain.attempts, attempt], budget: chain.budget },
      running: { global: input.runningProfiles.length, perProfile },
      now: attempt.endedAt,
    });
    return { decision, attempt };
  } catch {
    return null;
  }
}

/** A linha do log que explica a regra vencedora, as alternativas e as recusas (RF: o log explica a decisão). */
export function describeDecision(d: PolicyDecision): string {
  const name = (t: ExecutionTarget) => `${t.profileId}${t.model ? `:${t.model}` : ''}${t.effort ? `@${t.effort}` : ''}`;
  const parts = [`Política de execução: ${d.action} (${d.reason}${d.policy ? `, ${d.policy.id} r${d.policy.revision}` : ''}).`];
  if (d.target) parts.push(`Destino: ${name(d.target)}.`);
  if (d.alternatives.length) parts.push(`Alternativas: ${d.alternatives.map(name).join(', ')}.`);
  if (d.rejected.length) parts.push(`Recusados: ${d.rejected.map((r) => `${name(r.target)} (${r.reason})`).join(', ')}.`);
  return parts.join(' ');
}
