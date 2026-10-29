import type { RunnerConfig } from './runner';
import { resetAtOf } from './usageLimit';

// Leitura de uso da cota (história #1114): o que o leitor da ferramenta achou do uso de cada janela (5 h, semanal) no
// fim de uma execução. Serve para começar a próxima execução automática no reserva antes de a cota acabar. Só regras
// puras (sem banco nem `vscode`); o relógio entra sempre por parâmetro (`now`).

/** Uma janela como o leitor a viu: crua, sem relógio. `utilization` é fração (0–1). */
export interface UsageWindowHint {
  window: string;
  utilization: number;
  resetsAt: number | null;
}
/** O que o leitor devolve no relatório (`RunReport.usageReading`). */
export interface UsageWindowsHint {
  windows: UsageWindowHint[];
}

/** Uma janela gravada: porcentagem (0–100, inteira) e renovação em ms (null sem horário). */
export interface UsageWindow {
  window: string;
  percent: number;
  resetAt: number | null;
}
/** A leitura mais recente de um perfil, como fica na `meta`. */
export interface UsageReading {
  profileId: string;
  readAt: number;
  windows: UsageWindow[];
}

export const USAGE_READINGS_META_KEY = 'usage_readings';
/** A leitura vale por 30 minutos; depois disso é desconhecida. */
export const READING_FRESH_MS = 30 * 60_000;
export const DEFAULT_QUOTA_CRITICAL = 80;

export type ReadingStatus = { kind: 'unknown' } | { kind: 'fresh'; reading: UsageReading; critical: UsageWindow | null };

const PROFILE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** A porcentagem inteira de uma fração; acima de 1 vale 100; negativo ou não finito, null. */
function percentOf(utilization: unknown): number | null {
  if (typeof utilization !== 'number' || !Number.isFinite(utilization) || utilization < 0) return null;
  return Math.min(100, Math.round(utilization * 100));
}

/** Converte o que o leitor achou numa leitura; null sem janela válida (RF12: a leitura anterior fica). */
export function nextReading(profileId: string, hint: UsageWindowsHint | undefined, now: number): UsageReading | null {
  const windows: UsageWindow[] = [];
  for (const w of hint?.windows ?? []) {
    const percent = percentOf(w?.utilization);
    if (percent === null || typeof w.window !== 'string' || !w.window) continue;
    windows.push({ window: w.window, percent, resetAt: resetAtOf({ resetsAt: w.resetsAt ?? null, text: null }, now) });
  }
  return windows.length ? { profileId, readAt: now, windows } : null;
}

export function readingOf(list: readonly UsageReading[], profileId: string): UsageReading | null {
  return list.find((r) => r.profileId === profileId) ?? null;
}

/** Leitor tolerante da `meta`: inválido, duplicado (mesmo perfil) ou janela ilegível é descartado. */
export function parseReadings(json: string | undefined): UsageReading[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json ?? '');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: UsageReading[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const { profileId, readAt, windows } = r;
    if (typeof profileId !== 'string' || !PROFILE_ID.test(profileId) || out.some((o) => o.profileId === profileId)) continue;
    if (typeof readAt !== 'number' || !Number.isFinite(readAt) || readAt <= 0 || !Array.isArray(windows)) continue;
    const valid: UsageWindow[] = [];
    for (const w of windows as Record<string, unknown>[]) {
      if (!w || typeof w !== 'object' || typeof w.window !== 'string' || !w.window) continue;
      const p = w.percent;
      if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 100) continue;
      const resetAt = typeof w.resetAt === 'number' && Number.isFinite(w.resetAt) && w.resetAt > 0 ? w.resetAt : null;
      valid.push({ window: w.window, percent: p, resetAt });
    }
    if (valid.length) out.push({ profileId, readAt, windows: valid });
  }
  return out;
}

/** O limite crítico do perfil: o configurado ou 80. */
export function quotaCriticalOf(runner: Pick<RunnerConfig, 'quotaCritical'>, profileId: string): number {
  return runner.quotaCritical?.[profileId] ?? DEFAULT_QUOTA_CRITICAL;
}

/**
 * Fresca = `now - readAt <= READING_FRESH_MS` (e `readAt <= now`). `critical` = a janela de maior porcentagem com
 * `percent >= limit`, ignorando a janela cuja renovação já passou (`resetAt <= now`: renovou).
 */
export function readingStatus(list: readonly UsageReading[], profileId: string, limit: number, now: number): ReadingStatus {
  const reading = readingOf(list, profileId);
  if (!reading || reading.readAt > now || now - reading.readAt > READING_FRESH_MS) return { kind: 'unknown' };
  let critical: UsageWindow | null = null;
  for (const w of reading.windows) {
    if (w.percent < limit || (w.resetAt !== null && w.resetAt <= now)) continue;
    if (!critical || w.percent > critical.percent) critical = w;
  }
  return { kind: 'fresh', reading, critical };
}

/** Atalho do runner: a janela crítica do perfil agora, ou null. */
export function criticalWindow(
  list: readonly UsageReading[],
  runner: Pick<RunnerConfig, 'quotaCritical'>,
  profileId: string,
  now: number,
): UsageWindow | null {
  const status = readingStatus(list, profileId, quotaCriticalOf(runner, profileId), now);
  return status.kind === 'fresh' ? status.critical : null;
}

/** "janela de 5 h" (five_hour), "janela semanal" (seven_day*), senão "janela <nome>"; a tela traduz os seus. */
export function windowLabel(window: string): string {
  if (window === 'five_hour') return 'janela de 5 h';
  if (window.startsWith('seven_day')) return 'janela semanal';
  return `janela ${window}`;
}
