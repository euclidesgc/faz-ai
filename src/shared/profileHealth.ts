// Regras puras da saúde de cada perfil de CLI: o que o Diagnóstico e o aviso do topo mostram.
// Não consulta banco, arquivo nem processo: recebe os probes, as capacidades e a decisão de admissão
// já prontas e só as junta. Quem decide a admissão é `admitExecution` (executionAdmission.ts).
import { PROFILE_CAPABILITIES, type AiProfile, type ProfileIsolation } from './aiProfiles';
import {
  EXECUTOR_CAPABILITIES,
  assessCapability,
  capabilityChecks,
  evidenceSource,
  type CapabilityEvidence,
  type CapabilityState,
  type ExecutionAdmissionDecision,
  type ExecutionTransport,
  type ExecutorCapability,
} from './executionAdmission';
import type { AiTool } from './harness';
import type { InstallStep } from './environment';
import type { Board } from './model';
import { parseModelValue } from './models';

/** Situação do cadastro: o importado espera revisão e não executa nada. */
export type ProfileRegistration = 'enabled' | 'disabled' | 'pending-review';

/** Login pelo comando de status do perfil; `unchecked` quando o perfil não tem como dizer. */
export type LoginState = 'signed-in' | 'signed-out' | 'unchecked';

/** O que os probes locais acharam; ausente para perfil pendente de revisão (nada rodou). */
export interface ProfileProbe {
  id: AiTool;
  found: boolean;
  path?: string;
  version?: string;
  /** `unchecked` também quando a CLI não foi achada */
  login: LoginState;
}

/** Validade da evidência real (o último teste): válida, vencida (binário, versão ou argumentos mudaram) ou nunca testado. */
export type EvidenceState = 'valid' | 'stale' | 'never';

/** O que impede o perfil, na ordem de resolver; null quando ele está disponível. */
export type ProfileProblem = 'pending-review' | 'cli' | 'signin' | 'unvalidated' | 'stale' | 'not-admissible';

export interface ProfileHealth {
  id: AiTool;
  name: string;
  kind: AiProfile['kind'];
  tool: AiProfile['tool'];
  mode: AiProfile['mode'];
  base: AiProfile['base'];
  registration: ProfileRegistration;
  isDefault: boolean;
  /** null: perfil pendente de revisão, nenhum probe rodou */
  probe: ProfileProbe | null;
  /** o nome de cada referência de segredo e se está preenchida; nunca o valor */
  credentials: { name: string; filled: boolean }[];
  /** o estado de cada capacidade, como veio: desconhecida e parcial nunca viram verificada */
  capabilities: CapabilityState[];
  /** a decisão de admissão no regime em vigor; null sem probe (pendente) */
  admission: ExecutionAdmissionDecision | null;
  /** o que a CLI carrega por conta própria (regime compatível); ausente quando o host não informou */
  isolation?: ProfileIsolation;
  evidence: { state: EvidenceState; checkedAt?: number; version?: string; ok?: boolean };
  /** prontos: os comandos oficiais; cópia/personalizado: o installUrl; null: o perfil não informou */
  install: { steps: InstallStep[]; docs: string } | { url: string } | null;
  /** o login venceu numa execução (sinal reativo), mesmo com o status dizendo conectado */
  authExpired: boolean;
  /**
   * a validação real (teste e admissão por capacidades) conta como requisito. Falso enquanto não há
   * quem grave evidência: o bloco mostra o estado ("não validado"), mas ele não vira problema nem
   * bloqueia o board.
   */
  validationRequired: boolean;
  /** o host sabe provar as capacidades deste perfil (Claude ou agente ACP): o comando de verificação o oferece */
  verifiable?: boolean;
  /**
   * a última prova gravada para o perfil foi feita num vínculo de isolamento que não é mais o atual (o
   * binário, o ambiente relevante ou o formato do vínculo mudou): ela não vale mais e precisa ser refeita.
   * Não bloqueia; vira aviso na faixa de requisitos. `automatic`: o board refaz sozinho (agente ACP);
   * `command`: pelo comando da paleta (Claude Code).
   */
  evidenceInvalidated?: 'automatic' | 'command';
  problem: ProfileProblem | null;
}

export interface ProfileHealthInput {
  profile: AiProfile;
  isDefault: boolean;
  pendingReview: boolean;
  probe: ProfileProbe | null;
  authExpired: boolean;
  validationRequired: boolean;
  credentials: ProfileHealth['credentials'];
  capabilities: CapabilityState[];
  admission: ExecutionAdmissionDecision | null;
  isolation?: ProfileIsolation;
  evidence: ProfileHealth['evidence'];
  install: ProfileHealth['install'];
  verifiable?: boolean;
  evidenceInvalidated?: ProfileHealth['evidenceInvalidated'];
}

/**
 * O problema do perfil, nesta ordem: pending-review, cli, signin, unvalidated, stale, not-admissible.
 * É a ordem de resolver: sem CLI não há login, sem login não há teste, sem teste não há admissão.
 * Login `unchecked` (o perfil não tem como dizer) não impede. Sem `validationRequired`, só os três
 * primeiros contam.
 */
export function profileProblem(h: Omit<ProfileHealth, 'problem'>): ProfileProblem | null {
  if (h.registration === 'pending-review') return 'pending-review';
  if (!h.probe?.found) return 'cli';
  if (h.probe.login === 'signed-out' || h.authExpired) return 'signin';
  if (!h.validationRequired) return null;
  if (h.evidence.state === 'never') return 'unvalidated';
  if (h.evidence.state === 'stale') return 'stale';
  if (h.admission?.state !== 'admitted') return 'not-admissible';
  return null;
}

/** Monta o bloco do perfil. Não decide admissão: copia a que veio. */
export function profileHealth(i: ProfileHealthInput): ProfileHealth {
  const registration: ProfileRegistration = i.pendingReview ? 'pending-review' : i.profile.enabled ? 'enabled' : 'disabled';
  const base: Omit<ProfileHealth, 'problem'> = {
    id: i.profile.id,
    name: i.profile.name,
    kind: i.profile.kind,
    tool: i.profile.tool,
    mode: i.profile.mode,
    base: i.profile.base,
    registration,
    isDefault: i.isDefault,
    probe: i.pendingReview ? null : i.probe,
    credentials: i.credentials,
    capabilities: i.capabilities,
    admission: i.pendingReview ? null : i.admission,
    ...(i.isolation ? { isolation: i.isolation } : {}),
    evidence: i.evidence,
    install: i.install,
    authExpired: i.authExpired,
    validationRequired: i.validationRequired,
    ...(i.verifiable ? { verifiable: true } : {}),
    ...(i.evidenceInvalidated ? { evidenceInvalidated: i.evidenceInvalidated } : {}),
  };
  return { ...base, problem: profileProblem(base) };
}

/**
 * O estado de cada capacidade do perfil (na ordem de `PROFILE_CAPABILITIES`) lido das evidências gravadas
 * para o vínculo de isolamento dele. Cada perfil tem o próprio vínculo, então a prova de um nunca vale para
 * outro. Cancelamento e saída não têm sonda: ficam desconhecidos.
 */
export function evidenceCapabilities(
  binding: string,
  evidence: readonly CapabilityEvidence[],
  now: number,
  transport: ExecutionTransport,
): CapabilityState[] {
  const checks = capabilityChecks(transport);
  const source = evidenceSource(transport);
  return PROFILE_CAPABILITIES.map((c) =>
    (EXECUTOR_CAPABILITIES as readonly string[]).includes(c)
      ? assessCapability(c as ExecutorCapability, binding, evidence, now, checks, source).state
      : 'unknown',
  );
}

/**
 * Há prova em vigor para o vínculo atual: toda capacidade tem evidência dele, dentro da validade e sem
 * check falho (a parcial por check indisponível, como os arquivos do agente ACP, conta como em vigor).
 * É o que deixa o host pular a verificação automática; vínculo mudado, prova vencida ou falha refazem.
 */
export function evidenceCurrent(
  binding: string,
  evidence: readonly CapabilityEvidence[],
  now: number,
  transport: ExecutionTransport,
): boolean {
  const checks = capabilityChecks(transport);
  const source = evidenceSource(transport);
  return EXECUTOR_CAPABILITIES.every((c) =>
    ['verified', 'incomplete'].includes(assessCapability(c, binding, evidence, now, checks, source).reason),
  );
}

/** Disponível: CLI achada, login conectado ou não conferível, evidência válida e admissível. */
export const profileAvailable = (h: ProfileHealth): boolean => h.problem === null;

export interface BoardAvailability {
  /** nenhum perfil ligado disponível: o aviso do topo bloqueia */
  blocked: boolean;
  /** por que bloqueia: nenhum ligado; todos só não validados ("teste um perfil"); ou indisponíveis */
  reason: 'no-enabled' | 'unvalidated' | 'unavailable' | null;
  /** os perfis ligados com problema, um aviso cada; vazio quando bloqueia por `no-enabled` */
  warnings: { id: AiTool; name: string; problem: ProfileProblem }[];
}

/** Só os ligados contam; desligados e pendentes nunca geram aviso. */
export function boardAvailability(profiles: readonly ProfileHealth[]): BoardAvailability {
  const enabled = profiles.filter((p) => p.registration === 'enabled');
  if (!enabled.length) return { blocked: true, reason: 'no-enabled', warnings: [] };
  const warnings = enabled.flatMap((p) => (p.problem ? [{ id: p.id, name: p.name, problem: p.problem }] : []));
  if (enabled.some(profileAvailable)) return { blocked: false, reason: null, warnings };
  const onlyUntested = enabled.every((p) => p.problem === 'unvalidated' || p.problem === 'stale');
  return { blocked: true, reason: onlyUntested ? 'unvalidated' : 'unavailable', warnings };
}

/**
 * Os perfis que o board usa por conta própria: o padrão, os prefixos dos modelos das regras de
 * sugestão e os dos modelos dos agentes do board (RF19). Lê o prefixo `<perfil>:` do valor, sem
 * resolver alvo (isso é da #620). O padrão vem primeiro, sem repetir; valor sem prefixo não entra,
 * e perfil apagado continua na lista (quem bloqueia é o simulador).
 */
export function profilesInUse(board: Pick<Board, 'aiTool' | 'modelRules' | 'execProfiles'>): AiTool[] {
  const out: AiTool[] = [board.aiTool];
  const addPrefix = (value: string): void => {
    const parsed = parseModelValue(value);
    const colon = parsed?.id.indexOf(':') ?? -1;
    if (parsed && colon > 0) {
      const prefix = parsed.id.slice(0, colon);
      if (!out.includes(prefix)) out.push(prefix);
    }
  };
  for (const rule of board.modelRules) addPrefix(rule.model);
  for (const agent of board.execProfiles) addPrefix(agent.model);
  return out;
}
