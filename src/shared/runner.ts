/** Execução da IA pelo board: a extensão roda a ferramenta do projeto em segundo plano para trabalhar num card. */

import type { ActivityKind } from './activity';

/** O que a IA pode fazer sem ninguém aprovando cada passo. */
export type RunnerPermission = 'board' | 'edits' | 'full';

/**
 * O regime de admissão do board (#1091). `exclusive`: a ferramenta só roda com as cinco capacidades
 * verificadas, e a IA vê só o que o board montou. `compatible`: o board aceita que a ferramenta
 * carregue os próprios arquivos de contexto (o que ela declara em "O que a CLI carrega por conta
 * própria"); permissões, MCP e delegação continuam exigidos. É a escolha da pessoa, nunca da IA.
 */
export type AdmissionRegime = 'exclusive' | 'compatible';

/**
 * O que a IA faz ao ser chamada para um card: `phase` trabalha a fase em que o card está (o que a
 * coluna pede, até passar a vez); `refine` só deixa o card claro e completo (texto, campos,
 * checklist), sem trabalhar a fase, sem mover e sem mexer em arquivos; `summarize` lê a conversa do
 * card e grava um resumo (Decisões/Observações/Pendências) como uma mensagem nova, sem mover o card
 * nem mudar o status; `conflict` atualiza a branch da história a partir da base do pull request em
 * conflito (merge, checagens, commit e push), sem trabalhar a fase, e no fim o card volta ao status
 * que tinha.
 */
export type AiRunMode = 'phase' | 'refine' | 'summarize' | 'conflict';

export interface RunnerConfig {
  permission: RunnerPermission;
  /** tempo máximo de uma execução, em minutos */
  timeoutMinutes: number;
  /** rotina periódica: a extensão chama a IA sozinha quando há pendência com ela */
  heartbeat: boolean;
  /** intervalo entre as rodadas do heartbeat, em minutos */
  heartbeatMinutes: number;
  /** o heartbeat refina sozinho os cards do Backlog ainda não refinados e deixa cada um para a revisão da pessoa */
  heartbeatRefine: boolean;
  /** o heartbeat toca várias histórias ao mesmo tempo com branch; só vale no modo worktree, em que cada história tem a sua pasta */
  parallel: boolean;
  /** com `parallel` ligado, quantas histórias com branch ao mesmo tempo (no mínimo duas); é também o teto das atividades sem branch (só texto), em qualquer modo, mesmo com `parallel` desligado */
  parallelStories: number;
  /** Pedido por história; escritores na mesma pasta continuam limitados a um. */
  parallelSubtasks: number;
  /** a pessoa pausou o autopiloto; vale até retomar, mesmo depois de reabrir o editor */
  autopilotPaused: boolean;
  /** nome do agente (arquivo marcado no Harness) usado quando nem o card nem a fase indicam um; vazio = o primeiro marcado, ou o embutido */
  defaultAgent: string;
  /** o regime de admissão escolhido pela pessoa em Harness › Ferramenta e execução */
  admissionRegime: AdmissionRegime;
  /**
   * quantas vezes a pessoa ligou o regime compatível: é a revisão que a admissão exige
   * (`compatibilityReview`), e sobe a cada vez que ela liga; 0 enquanto nunca ligou
   */
  compatibilityReviewRevision: number;
  /**
   * A ciência do regime compatível por perfil (história 7): o passo do Conectar em que a pessoa declara que
   * entende o que a ferramenta carrega por conta própria. A revisão sobe a cada ciência e vale só para o
   * perfil dela; quem grava é o host, no Conectar (a tela não manda o número, `BoardRepo` o descarta).
   */
  compatibilityReviews: Record<string, number>;
}

export const ADMISSION_REGIMES: { value: AdmissionRegime; label: string; hint: string }[] = [
  {
    value: 'exclusive',
    label: 'Exclusivo',
    hint: 'A ferramenta só roda com as cinco capacidades verificadas: a IA vê exatamente o contexto que o board montou para o card.',
  },
  {
    value: 'compatible',
    label: 'Compatível',
    hint: 'A ferramenta pode carregar os próprios arquivos de contexto (regras, skills, agentes, hooks e MCPs que o perfil declara em "O que a CLI carrega por conta própria"). Permissões, MCP e delegação continuam exigidos. É o único regime em que um agente ACP roda.',
  },
];

/**
 * O regime e a revisão que vão no pedido de admissão. Com o perfil, vale primeiro a ciência dele no Conectar
 * (`compatibilityReviews`, a revisão daquele perfil); sem ela, o regime do board, que até a história 7 a
 * pessoa escolhia em Harness › Ferramenta e execução e que segue valendo para quem o ligou. No compatível a
 * revisão nunca é zero (`parseRunner` garante); a admissão recusa qualquer outro ator.
 */
export const admissionRegimeOf = (
  runner: Pick<RunnerConfig, 'admissionRegime' | 'compatibilityReviewRevision'> & Partial<Pick<RunnerConfig, 'compatibilityReviews'>>,
  profileId?: string,
): { regime: AdmissionRegime; compatibilityReview?: { actor: 'person'; revision: number } } => {
  const own = profileId ? runner.compatibilityReviews?.[profileId] : undefined;
  if (own) return { regime: 'compatible', compatibilityReview: { actor: 'person', revision: own } };
  return runner.admissionRegime === 'compatible'
    ? { regime: 'compatible', compatibilityReview: { actor: 'person', revision: runner.compatibilityReviewRevision } }
    : { regime: 'exclusive' };
};

/** As ciências por perfil gravadas: só ids de perfil válidos com revisão inteira positiva. */
function parseReviews(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([id, n]) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(id) && Number.isSafeInteger(n) && (n as number) > 0),
  ) as Record<string, number>;
}

export const RUNNER_PERMISSIONS: { value: RunnerPermission; label: string; hint: string }[] = [
  {
    value: 'board',
    label: 'Só o board',
    hint: 'A IA lê o projeto e usa as ferramentas do board (conversa, anexos, status, mover cards). Não altera arquivos do projeto nem roda comandos.',
  },
  {
    value: 'edits',
    label: 'Board e arquivos do projeto',
    hint: 'Além do board, a IA cria e altera arquivos do projeto sem pedir confirmação. Comandos de terminal continuam fora.',
  },
  {
    value: 'full',
    label: 'Sem restrições',
    hint: 'A IA altera arquivos e roda qualquer comando sem pedir confirmação. Use só em projetos e máquinas em que isso é aceitável.',
  },
];

export const TIMEOUT_RANGE = { min: 1, max: 240 };
export const HEARTBEAT_RANGE = { min: 5, max: 1440 };
export const PARALLEL_RANGE = { min: 2, max: 6 };
/** Sub-tarefas em paralelo por história: 1 a 6 (hoje o efetivo é sempre 1, veja `effectiveLimits`). */
export const SUBTASK_PARALLEL_RANGE = { min: 1, max: 6 };
export const DEFAULT_RUNNER: RunnerConfig = {
  permission: 'board',
  timeoutMinutes: 45,
  heartbeat: false,
  heartbeatMinutes: 10,
  heartbeatRefine: true,
  parallel: false,
  parallelStories: 2,
  parallelSubtasks: 2,
  autopilotPaused: false,
  defaultAgent: '',
  admissionRegime: 'exclusive',
  compatibilityReviewRevision: 0,
  compatibilityReviews: {},
};

/**
 * Quantas histórias o heartbeat pode tocar ao mesmo tempo. Fora do modo worktree é sempre uma: as
 * histórias dividiriam a mesma pasta, e uma trocaria a branch debaixo da outra.
 */
export const parallelLimit = (runner: RunnerConfig, workspaceMode: string): number =>
  workspaceMode === 'worktree' && runner.parallel ? runner.parallelStories : 1;

/** Teto das atividades sem branch (só texto): `parallelStories`, em qualquer modo e com `parallel` desligado. */
export const textLimit = (runner: RunnerConfig): number => runner.parallelStories;

/** Teto de execuções simultâneas para o tipo de atividade. */
export const limitOf = (runner: RunnerConfig, workspaceMode: string, kind: ActivityKind): number =>
  kind === 'text' ? textLimit(runner) : parallelLimit(runner, workspaceMode);

/** Lê a configuração salva, completando com os padrões o que faltar ou for inválido. */
export function parseRunner(json: string | null | undefined): RunnerConfig {
  let raw: Partial<Record<keyof RunnerConfig, unknown>> = {};
  try {
    const v: unknown = JSON.parse(json ?? '');
    if (v && typeof v === 'object') raw = v as typeof raw;
  } catch {
    /* inválido: usa os padrões */
  }
  const minutes = Math.round(Number(raw.timeoutMinutes));
  const interval = Math.round(Number(raw.heartbeatMinutes));
  const parallel = Math.round(Number(raw.parallelStories));
  const subtasks = Math.round(Number(raw.parallelSubtasks));
  const regime: AdmissionRegime = ADMISSION_REGIMES.some((r) => r.value === raw.admissionRegime)
    ? (raw.admissionRegime as AdmissionRegime)
    : DEFAULT_RUNNER.admissionRegime;
  const revision = Math.round(Number(raw.compatibilityReviewRevision));
  return {
    admissionRegime: regime,
    // compatível sem revisão não existe: a configuração gravada à mão vale como a primeira revisão
    compatibilityReviewRevision: Number.isSafeInteger(revision) && revision > 0 ? revision : regime === 'compatible' ? 1 : 0,
    compatibilityReviews: parseReviews(raw.compatibilityReviews),
    autopilotPaused: raw.autopilotPaused === true,
    defaultAgent: typeof raw.defaultAgent === 'string' ? raw.defaultAgent.trim() : '',
    heartbeat: raw.heartbeat === true,
    // nasce ligado: quem não quer o refinamento automático desliga em Configurações → Harness
    heartbeatRefine: raw.heartbeatRefine !== false,
    heartbeatMinutes:
      Number.isFinite(interval) && interval > 0
        ? Math.min(HEARTBEAT_RANGE.max, Math.max(HEARTBEAT_RANGE.min, interval))
        : DEFAULT_RUNNER.heartbeatMinutes,
    parallel: raw.parallel === true,
    parallelSubtasks:
      Number.isFinite(subtasks) && subtasks > 0
        ? Math.min(SUBTASK_PARALLEL_RANGE.max, Math.max(SUBTASK_PARALLEL_RANGE.min, subtasks))
        : DEFAULT_RUNNER.parallelSubtasks,
    parallelStories:
      Number.isFinite(parallel) && parallel > 0
        ? Math.min(PARALLEL_RANGE.max, Math.max(PARALLEL_RANGE.min, parallel))
        : DEFAULT_RUNNER.parallelStories,
    permission: RUNNER_PERMISSIONS.some((p) => p.value === raw.permission)
      ? (raw.permission as RunnerPermission)
      : DEFAULT_RUNNER.permission,
    timeoutMinutes:
      Number.isFinite(minutes) && minutes > 0
        ? Math.min(TIMEOUT_RANGE.max, Math.max(TIMEOUT_RANGE.min, minutes))
        : DEFAULT_RUNNER.timeoutMinutes,
  };
}

/** Como o heartbeat está agora: batendo, desligado (por escolha) ou parado (ligado, mas sem como rodar). */
export type HeartbeatState = { kind: 'beating' } | { kind: 'off' } | { kind: 'stopped'; reason: string };

/**
 * Estado do heartbeat para o coração do topo do board. "Parado" é quando ele está ligado mas não consegue rodar:
 * a página perdeu a ligação com o Faz AI, ou a ferramenta do projeto não pode ser executada pelo board.
 */
export function heartbeatState(runner: RunnerConfig, ctx: { offline: boolean; unsupported: string | null }): HeartbeatState {
  if (!runner.heartbeat) return { kind: 'off' };
  if (ctx.offline) return { kind: 'stopped', reason: 'Sem ligação com o Faz AI.' };
  if (ctx.unsupported) return { kind: 'stopped', reason: ctx.unsupported };
  return { kind: 'beating' };
}
