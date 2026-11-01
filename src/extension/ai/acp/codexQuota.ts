// Lê o uso da cota do Codex no fim de uma execução: o último `token_count` com `rate_limits` do rollout de
// sessão mais recente (`$CODEX_HOME/sessions/AAAA/MM/DD/rollout-*.jsonl`, senão `~/.codex/sessions`).
// O formato dos rollouts (`event_msg` → `payload.type = "token_count"` → `payload.rate_limits.primary|secondary`
// com `used_percent`, `window_minutes`, `resets_at`) é o da CLI do Codex (openai/codex, codex-rs); não é um
// contrato documentado: qualquer divergência, ausência ou erro devolve `null` ("desconhecido"), sem lançar.
import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import type { AgentQuota, QuotaWindow } from '../../../shared/usageLimit';

/** Só o final do arquivo é lido: o último evento basta. */
export const TAIL_BYTES = 256 * 1024;

export interface FsLike {
  readdirSync(dir: string): string[];
  statSync(file: string): { mtimeMs: number; size: number; isDirectory(): boolean };
  openSync(file: string, flags: string): number;
  readSync(fd: number, buf: Buffer, offset: number, length: number, position: number): number;
  closeSync(fd: number): void;
}

export interface CodexQuotaDeps {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  /** início da execução (ms): rollouts com mtime anterior são de outra execução */
  since: number;
  fs?: FsLike;
  now?: () => number;
}

export const codexSessionsDir = (env: NodeJS.ProcessEnv, homeDir: string): string =>
  path.join(env.CODEX_HOME?.trim() || path.join(homeDir, '.codex'), 'sessions');

const sortedDesc = (names: string[]) => [...names].sort().reverse();

/** O rollout mais novo (varre AAAA/MM/DD do mais recente) com `mtime >= since`; null se não houver. */
export function newestRollout(dir: string, since: number, fs: FsLike = nodeFs as unknown as FsLike): string | null {
  let best: { file: string; mtime: number } | null = null;
  const walk = (d: string, depth: number) => {
    let names: string[];
    try {
      names = fs.readdirSync(d);
    } catch {
      return;
    }
    for (const name of sortedDesc(names)) {
      const full = path.join(d, name);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          if (depth < 3) walk(full, depth + 1);
        } else if (/^rollout-.*\.jsonl$/.test(name) && st.mtimeMs >= since && (!best || st.mtimeMs > best.mtime)) {
          best = { file: full, mtime: st.mtimeMs };
        }
      } catch {
        /* arquivo sumiu no meio: segue */
      }
    }
  };
  walk(dir, 0);
  return best ? (best as { file: string }).file : null;
}

/** O último `token_count` com `rate_limits` do texto (linhas de trás para frente; linha inválida é pulada). */
export function lastTokenCount(text: string): unknown | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line.includes('token_count')) continue;
    try {
      const o = JSON.parse(line) as { type?: unknown; payload?: { type?: unknown; rate_limits?: unknown } };
      if (
        o?.type === 'event_msg' &&
        o.payload?.type === 'token_count' &&
        o.payload.rate_limits &&
        typeof o.payload.rate_limits === 'object'
      )
        return o.payload.rate_limits;
    } catch {
      /* linha parcial ou inválida */
    }
  }
  return null;
}

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function windowOf(raw: unknown): QuotaWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const used = finite(o.used_percent);
  if (used === null || used < 0 || used > 100) return null;
  return { usedPercent: used, windowMinutes: finite(o.window_minutes), resetsAt: finite(o.resets_at) };
}

/**
 * A conversão para a escala da leitura por perfil (`usage_readings`, #1114): fração 0–1, como o `utilization`
 * do Claude. É o único ponto a ajustar se a escala real for outra.
 */
export const toReading = (w: QuotaWindow): { utilization: number; resetsAt: number | null; windowMinutes: number | null } => ({
  utilization: w.usedPercent / 100,
  resetsAt: w.resetsAt,
  windowMinutes: w.windowMinutes,
});

function readTail(file: string, fs: FsLike): string {
  const size = fs.statSync(file).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buf = Buffer.alloc(size - start);
  const fd = fs.openSync(file, 'r');
  try {
    let read = 0;
    while (read < buf.length) {
      const n = fs.readSync(fd, buf, read, buf.length - read, start + read);
      if (n <= 0) break;
      read += n;
    }
    const text = buf.subarray(0, read).toString('utf8');
    // começou no meio do arquivo: a primeira linha é parcial
    if (start > 0) {
      const nl = text.indexOf('\n');
      return nl < 0 ? '' : text.slice(nl + 1);
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

export function readCodexQuota(deps: CodexQuotaDeps): AgentQuota | null {
  try {
    const fs = deps.fs ?? (nodeFs as unknown as FsLike);
    const file = newestRollout(codexSessionsDir(deps.env, deps.homeDir), deps.since, fs);
    if (!file) return null;
    const limits = lastTokenCount(readTail(file, fs)) as Record<string, unknown> | null;
    if (!limits) return null;
    const primary = windowOf(limits.primary);
    const secondary = windowOf(limits.secondary);
    if (!primary && !secondary) return null;
    return { primary, secondary, readAt: (deps.now ?? Date.now)() };
  } catch {
    return null;
  }
}
