// O Conectar de uma ferramenta de IA (épica "ferramenta por modo", história 7): os passos, o estado que o
// host publica para a tela e a regra pura que tira o regime de admissão das provas gravadas. O fluxo em si
// (achar o binário, guardar a chave, autenticar, verificar, ler os modelos) é do host, em
// `src/extension/ai/connect.ts`; aqui fica só o que a tela também lê.
import {
  EXECUTOR_CAPABILITIES,
  capabilityChecks,
  type CapabilityEvidence,
  type ExecutionTransport,
  type ExecutorCapability,
} from './executionAdmission';
import type { AdmissionRegime } from './runner';
import type { ToolMode } from './aiTools';

/**
 * Os passos, na ordem: `locate` (o binário e a versão), `signIn` (a chave de API no cofre e o `authenticate`
 * do agente, ou o login da CLI), `verify` (as sondas de capacidade, que dizem o regime), `review` (a ciência
 * da pessoa, só no regime compatível) e `models` (o catálogo de modelos lido da ferramenta).
 */
export const CONNECT_STEPS = ['locate', 'signIn', 'verify', 'review', 'models'] as const;
export type ConnectStep = (typeof CONNECT_STEPS)[number];

/**
 * O que a tela manda junto do Conectar: a chave colada no campo, o clique na ciência do regime e o modo do
 * cartão (um perfil por ferramenta, com o modo trocável; sem ele, o modo atual do perfil).
 */
export interface ConnectInput {
  apiKey?: string;
  acknowledge?: boolean;
  mode?: ToolMode;
}

/** O que a conexão já sabe, passo a passo; é também o que fica gravado depois de "Conectada". */
export interface ConnectSummary {
  /** a versão da ferramenta; null quando ela não diz (e no modo API, que não tem binário) */
  version: string | null;
  /**
   * `api-key`: a chave está no cofre e o agente a aceitou no login (sem conferir com a rede); `api-key-checked`:
   * a chave foi conferida na hora com a API (o modo API lê os modelos da conta com ela); `signed-in`: a sonda
   * confirmou o login; `unverified`: sem sonda
   */
  signIn: 'api-key' | 'api-key-checked' | 'signed-in' | 'unverified';
  /** o regime que as provas permitem; null quando o perfil não tem sonda de capacidades (Cursor, Kimi Code) */
  regime: AdmissionRegime | null;
  /** a revisão da ciência do perfil (só no regime compatível) */
  reviewed: number | null;
  /** quantos modelos a ferramenta anunciou; null quando ela não lista (vale a lista embutida) */
  models: number | null;
  /** quando a conexão terminou (epoch ms) */
  at: number;
}

/**
 * O estado de uma conexão, como a tela o mostra: o passo em curso, o que ele espera da pessoa, o erro preso
 * ao passo em que ocorreu (com "Tentar de novo"), ou "Conectada". Nunca carrega a chave.
 */
export interface ConnectState {
  profileId: string;
  /** o modo que esta conexão conecta (o cartão em que a pessoa clicou); ausente nas gravadas antes da história 10 */
  mode?: ToolMode;
  step: ConnectStep;
  status: 'running' | 'waiting' | 'failed' | 'connected';
  /** o que o passo espera (`waiting`): a chave de API ou a ciência do regime compatível */
  needs?: 'api-key' | 'review';
  /** o motivo, em português (a tela traduz pelo dicionário do host) */
  error?: string;
  /** o comando de login da ferramenta, quando o passo do login falhou por falta dele */
  command?: string;
  /** a página oficial de instalação, quando o passo `locate` não achou a ferramenta */
  docs?: string;
  summary: Partial<ConnectSummary>;
}

/** Uma capacidade foi provada: todos os checks esperados para o transporte, com sucesso. */
function proven(evidence: readonly CapabilityEvidence[], capability: ExecutorCapability, transport: ExecutionTransport): boolean {
  const e = evidence.find((x) => x.capability === capability);
  return !!e && capabilityChecks(transport)[capability].every((id) => e.checks.some((c) => c.id === id && c.outcome === 'passed'));
}

/**
 * O regime que as provas recém-gravadas permitem, sem perguntar nada à pessoa: as cinco capacidades
 * provadas → exclusivo; permissões, MCP e delegação provadas (o mínimo que a admissão exige em qualquer
 * regime) → compatível, que pede a ciência; menos que isso → null, e o passo `verify` falha com os pendentes.
 * No ACP os arquivos de contexto do agente nunca têm prova (`own-context-files` fica `unavailable`): o
 * resultado é sempre compatível.
 */
export function regimeFromEvidence(
  transport: ExecutionTransport,
  evidence: readonly CapabilityEvidence[],
): { regime: AdmissionRegime } | { regime: null; pending: string[] } {
  if (EXECUTOR_CAPABILITIES.every((c) => proven(evidence, c, transport))) return { regime: 'exclusive' };
  const required: ExecutorCapability[] = ['permissions', 'mcp', 'delegation'];
  if (required.every((c) => proven(evidence, c, transport))) return { regime: 'compatible' };
  const pending = required
    .filter((c) => !proven(evidence, c, transport))
    .flatMap((c) => {
      const e = evidence.find((x) => x.capability === c);
      const failed = capabilityChecks(transport)[c].filter((id) => !e?.checks.some((k) => k.id === id && k.outcome === 'passed'));
      return failed.map((id) => `${c}/${id}`);
    });
  return { regime: null, pending };
}
