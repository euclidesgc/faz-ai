/** Execução da IA pelo board: a extensão roda a ferramenta do projeto em segundo plano para trabalhar num card. */

/** O que a IA pode fazer sem ninguém aprovando cada passo. */
export type RunnerPermission = 'board' | 'edits' | 'full';

export interface RunnerConfig {
  permission: RunnerPermission;
  /** tempo máximo de uma execução, em minutos */
  timeoutMinutes: number;
}

export const RUNNER_PERMISSIONS: { value: RunnerPermission; label: string; hint: string }[] = [
  { value: 'board', label: 'Só o board', hint: 'A IA lê o projeto e usa as ferramentas do board (conversa, anexos, status, mover cards). Não altera arquivos do projeto nem roda comandos.' },
  { value: 'edits', label: 'Board e arquivos do projeto', hint: 'Além do board, a IA cria e altera arquivos do projeto sem pedir confirmação. Comandos de terminal continuam fora.' },
  { value: 'full', label: 'Sem restrições', hint: 'A IA altera arquivos e roda qualquer comando sem pedir confirmação. Use só em projetos e máquinas em que isso é aceitável.' },
];

export const TIMEOUT_RANGE = { min: 1, max: 240 };
export const DEFAULT_RUNNER: RunnerConfig = { permission: 'board', timeoutMinutes: 30 };

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
  return {
    permission: RUNNER_PERMISSIONS.some((p) => p.value === raw.permission) ? (raw.permission as RunnerPermission) : DEFAULT_RUNNER.permission,
    timeoutMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(TIMEOUT_RANGE.max, Math.max(TIMEOUT_RANGE.min, minutes)) : DEFAULT_RUNNER.timeoutMinutes,
  };
}
