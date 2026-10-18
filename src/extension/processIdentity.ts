// Evidência local de processo. Ausência e PID reutilizado são estados distintos.
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export interface ProcessIdentity {
  pid: number;
  birth: string | null;
  platform: NodeJS.Platform;
  /** Grupo POSIX criado para esta execução; null onde ainda não há prova equivalente. */
  groupId: number | null;
  generation: string;
}
export type ProcessState = 'alive' | 'dead' | 'unknown';
export function processBirth(pid: number): string | null {
  try {
    if (process.platform === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      return `${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`;
    }
    if (process.platform !== 'win32')
      return (
        execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || null
      );
  } catch {
    /* Falha de probe é desconhecido, nunca prova de encerramento. */
  }
  return null;
}
export function processState(owner: Pick<ProcessIdentity, 'pid' | 'birth'>): ProcessState {
  try {
    process.kill(owner.pid, 0);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown';
  }
  const birth = processBirth(owner.pid);
  return birth && owner.birth && birth === owner.birth ? 'alive' : 'unknown';
}
export function processGroupState(identity: ProcessIdentity): ProcessState {
  if (identity.platform !== process.platform || process.platform === 'win32' || identity.groupId !== identity.pid) return 'unknown';
  try {
    process.kill(-identity.groupId, 0);
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown';
  }
  // O kernel pode manter zombies no grupo depois do fim: eles já não podem agir ou criar filhos.
  // Só confirma ausência de membros executáveis com uma tabela completa e reconhecida do sistema.
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,pgid=,stat='], {
      encoding: 'utf8',
      timeout: 2000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => /^\s*(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line));
    if (!rows.length || rows.some((row) => !row)) return 'unknown';
    const members = rows.filter((row) => Number(row![2]) === identity.groupId);
    if (members.every((row) => /^[ZX]/.test(row![3]!))) return 'dead';
  } catch {
    return 'unknown';
  }
  // Mesmo com o líder morto, algum descendente ainda pode pertencer ao grupo.
  return processState(identity) === 'alive' ? 'alive' : 'unknown';
}
export function validProcessIdentity(value: unknown): value is ProcessIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(v.pid) &&
    Number(v.pid) > 0 &&
    (typeof v.birth === 'string' || v.birth === null) &&
    typeof v.platform === 'string' &&
    ['aix', 'android', 'darwin', 'freebsd', 'haiku', 'linux', 'openbsd', 'sunos', 'win32', 'cygwin', 'netbsd'].includes(v.platform) &&
    (v.groupId === null || v.groupId === v.pid) &&
    typeof v.generation === 'string' &&
    /^[A-Za-z0-9-]{1,128}$/.test(v.generation)
  );
}

/** Protocolo interno do transporte; nunca é uma declaração de capacidade fornecida pela UI ou pela IA. */
export interface SpawnControl {
  beforePreparation(): void;
  beforeStart(identity: ProcessIdentity): void | Promise<void>;
}
export class SpawnNotStartedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'SpawnNotStartedError';
  }
}
