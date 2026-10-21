// Regras puras da saúde de cada perfil de CLI: o que o Diagnóstico e o aviso do topo mostram.
// Não consulta banco, arquivo nem processo: recebe os probes, as capacidades e a decisão de admissão
// já prontas e só as junta. Quem decide a admissão é `admitExecution` (executionAdmission.ts).
import type { AiProfile } from './aiProfiles';
import type { CapabilityState, ExecutionAdmissionDecision } from './executionAdmission';
import type { AiTool } from './harness';
import type { InstallStep } from './environment';

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
  evidence: ProfileHealth['evidence'];
  install: ProfileHealth['install'];
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
    base: i.profile.base,
    registration,
    isDefault: i.isDefault,
    probe: i.pendingReview ? null : i.probe,
    credentials: i.credentials,
    capabilities: i.capabilities,
    admission: i.pendingReview ? null : i.admission,
    evidence: i.evidence,
    install: i.install,
    authExpired: i.authExpired,
    validationRequired: i.validationRequired,
  };
  return { ...base, problem: profileProblem(base) };
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
