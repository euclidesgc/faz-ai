import type { ColumnCheck } from './model';

/** Limites do tempo de cada checagem, em segundos: o teto impede que uma checagem prenda o card indefinidamente. */
export const CHECK_TIMEOUT_MIN = 1;
export const CHECK_TIMEOUT_MAX = 3600;
/** Cobre a suíte `vitest related` e o typecheck do projeto. */
export const CHECK_TIMEOUT_DEFAULT = 600;

/** Ajusta o tempo ao intervalo aceito; o que não é número volta ao padrão. */
export function clampCheckTimeout(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return CHECK_TIMEOUT_DEFAULT;
  return Math.min(CHECK_TIMEOUT_MAX, Math.max(CHECK_TIMEOUT_MIN, Math.round(n)));
}

/**
 * Leitura tolerante: o que vem do banco (ou de um board importado) pode estar corrompido, e o board precisa
 * abrir do mesmo jeito. JSON inválido ou que não é lista vira `[]`; item sem nome ou comando é descartado.
 */
export function parseColumnChecks(raw: unknown): ColumnCheck[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: ColumnCheck[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const command = typeof r.command === 'string' ? r.command.trim() : '';
    if (!name || !command) continue;
    out.push({ name, command, timeoutSec: r.timeoutSec === undefined ? CHECK_TIMEOUT_DEFAULT : clampCheckTimeout(r.timeoutSec) });
  }
  return out;
}

/** Gravação estrita: devolve o motivo da recusa (em português) ou `null` se a lista é válida. */
export function columnChecksError(checks: readonly ColumnCheck[]): string | null {
  for (const c of checks) {
    if (!c || typeof c.name !== 'string' || !c.name.trim()) return 'Informe o nome da checagem.';
    if (typeof c.command !== 'string' || !c.command.trim()) return 'Informe o comando da checagem.';
    if (!Number.isInteger(c.timeoutSec) || c.timeoutSec < CHECK_TIMEOUT_MIN || c.timeoutSec > CHECK_TIMEOUT_MAX)
      return `O tempo limite vai de ${CHECK_TIMEOUT_MIN} a ${CHECK_TIMEOUT_MAX} segundos.`;
  }
  return null;
}
