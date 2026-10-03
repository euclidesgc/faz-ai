/** Execução da IA pelo board: a extensão roda a ferramenta do projeto em segundo plano para trabalhar num card. */

/** O que a IA pode fazer sem ninguém aprovando cada passo. */
export type RunnerPermission = 'board' | 'edits' | 'full';

export interface RunnerConfig {
  permission: RunnerPermission;
  /** tempo máximo de uma execução, em minutos */
  timeoutMinutes: number;
  /** rotina periódica: a extensão chama a IA sozinha quando há pendência com ela */
  heartbeat: boolean;
  /** intervalo entre as rodadas do heartbeat, em minutos */
  heartbeatMinutes: number;
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
export const DEFAULT_RUNNER: RunnerConfig = { permission: 'board', timeoutMinutes: 30, heartbeat: false, heartbeatMinutes: 60 };

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
  return {
    heartbeat: raw.heartbeat === true,
    heartbeatMinutes:
      Number.isFinite(interval) && interval > 0
        ? Math.min(HEARTBEAT_RANGE.max, Math.max(HEARTBEAT_RANGE.min, interval))
        : DEFAULT_RUNNER.heartbeatMinutes,
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
