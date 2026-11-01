// Empréstimo coordenado pelo caminho real. O diário completo antecede a primeira escrita;
// estado ambíguo fica retido para reconciliação, nunca é interpretado como processo encerrado.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  processBirth,
  processState,
  processGroupState,
  validProcessIdentity,
  type ProcessIdentity,
  type ProcessState,
} from '../processIdentity';
import type { HeadlessCommand } from '../headless';
import { excludeLocally } from './pinCommands';

export type ProjectMcpSpec = NonNullable<HeadlessCommand['projectMcp']>;
type Owner = { pid: number; generation: string; birth: string | null };
type JsonObject = Record<string, unknown>;
interface Journal {
  version: 1;
  file: string;
  owner: Owner;
  before: string | null;
  expected: string;
  beforeEntry: unknown;
  writtenEntry: unknown;
  createdDirs: string[];
  mode: number;
  phase: 'prepared' | 'process-unconfirmed';
  /** Ausente em diários antigos: não pode receber a garantia do protocolo novo. */
  gate?: { version: 1; process: ProcessIdentity | null };
}
export interface LeaseOptions {
  /** A mesma raiz por usuário, independente da janela, board ou diretório de dados da extensão. */
  coordinationDir?: string;
  log(line: string): void;
  /** Injeção de falhas nas fronteiras duráveis, usada pelos testes de queda. */
  checkpoint?(point: 'journal' | 'write' | 'restore'): void;
  /** Sondas de processo substituíveis, usadas pelos testes da reconciliação. */
  probes?: { owner?(owner: Owner): ProcessState; group?(identity: ProcessIdentity): ProcessState };
}
export interface ProjectServerLease {
  readonly file: string;
  readonly generation: string;
  readonly result: 'kept' | 'added' | 'repaired';
  /** Antes de iniciar qualquer processo. Uma queda aqui exige reconciliação, não restauração cega. */
  markProcessUnconfirmed(): void;
  /** O launcher controlado ainda não recebeu a descrição que lhe permite iniciar a CLI. */
  prepareControlledProcess(): void;
  recordControlledProcess(identity: ProcessIdentity): void;
  /** Somente após confirmar o fim da árvore de processos, inclusive em cancelamento. */
  confirmProcessStopped(): void;
  /** false = conflito/estado ambíguo, diário e trava preservados. */
  release(): boolean;
}

const object = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v);
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (!object(a) || !object(b)) return false;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]));
};
function config(text: string): JsonObject & { mcpServers?: JsonObject } {
  const value: unknown = JSON.parse(text);
  if (!object(value) || (value.mcpServers !== undefined && !object(value.mcpServers))) throw new Error('Configuração MCP inválida.');
  return value;
}
/** Resolve também caminhos cujo arquivo e diretórios finais ainda não existem. */
export function realLeasePath(file: string): string {
  const tail: string[] = [];
  let parent = path.resolve(file);
  while (!fs.existsSync(parent)) {
    const next = path.dirname(parent);
    if (next === parent) throw new Error('Não foi possível resolver o caminho real do arquivo MCP.');
    tail.unshift(path.basename(parent));
    parent = next;
  }
  return path.join(fs.realpathSync(parent), ...tail);
}
const rootOf = (options: Pick<LeaseOptions, 'coordinationDir'>) =>
  options.coordinationDir ?? path.join(os.homedir(), '.faz-ai', 'mcp-leases');
const lockOf = (root: string, file: string) => path.join(root, createHash('sha256').update(file).digest('hex'));
function syncDir(dir: string): void {
  // No Windows o fsync de diretório não é suportado pelo runtime; o arquivo continua fsync antes do rename.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function atomicWrite(file: string, text: string, mode = 0o600): void {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(tmp, 'wx', mode);
    try {
      fs.writeFileSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
    syncDir(path.dirname(file));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}
function journalAt(lock: string): Journal {
  const value: unknown = JSON.parse(fs.readFileSync(path.join(lock, 'journal.json'), 'utf8'));
  if (
    !object(value) ||
    value.version !== 1 ||
    typeof value.file !== 'string' ||
    !path.isAbsolute(value.file) ||
    !object(value.owner) ||
    !Number.isSafeInteger(value.owner.pid) ||
    Number(value.owner.pid) <= 0 ||
    typeof value.owner.generation !== 'string' ||
    !/^[A-Za-z0-9-]{1,128}$/.test(value.owner.generation) ||
    (typeof value.owner.birth !== 'string' && value.owner.birth !== null) ||
    (typeof value.before !== 'string' && value.before !== null) ||
    typeof value.expected !== 'string' ||
    !Array.isArray(value.createdDirs) ||
    !value.createdDirs.every((d) => typeof d === 'string' && path.isAbsolute(d)) ||
    !Number.isInteger(value.mode) ||
    !['prepared', 'process-unconfirmed'].includes(String(value.phase)) ||
    (value.gate !== undefined &&
      (!object(value.gate) || value.gate.version !== 1 || (value.gate.process !== null && !validProcessIdentity(value.gate.process))))
  )
    throw new Error('Diário MCP inválido; reconciliação necessária.');
  const journal = value as unknown as Journal;
  if (
    !equal(config(journal.expected).mcpServers?.['faz-ai'], journal.writtenEntry) ||
    !equal(journal.before === null ? null : (config(journal.before).mcpServers?.['faz-ai'] ?? null), journal.beforeEntry)
  )
    throw new Error('Diário MCP inconsistente; reconciliação necessária.');
  return journal;
}
function owned(lock: string, journal: Journal): void {
  const current = journalAt(lock);
  if (current.owner.generation !== journal.owner.generation || current.file !== journal.file)
    throw new Error('A geração do empréstimo MCP mudou; nada foi restaurado.');
}
function restore(lock: string, j: Journal, options: LeaseOptions): boolean {
  owned(lock, j);
  if (j.phase === 'process-unconfirmed') {
    options.log('Empréstimo MCP retido: o encerramento da árvore de processos ainda não foi confirmado.');
    return false;
  }
  if (realLeasePath(j.file) !== j.file) {
    options.log('O caminho real do arquivo MCP mudou; reconciliação necessária.');
    return false;
  }
  const text = readText(j.file);
  let replacement: string | null;
  if (text === null || text === j.before) replacement = text;
  else if (text === j.expected) replacement = j.before;
  else {
    try {
      const current = config(text);
      if (!equal(current.mcpServers?.['faz-ai'], j.writtenEntry)) {
        options.log('A entrada faz-ai foi editada durante a execução; a edição foi preservada e o empréstimo exige revisão.');
        return false;
      }
      if (j.beforeEntry === null) delete current.mcpServers?.['faz-ai'];
      else (current.mcpServers ??= {})['faz-ai'] = j.beforeEntry;
      replacement = JSON.stringify(current, null, 2) + '\n';
    } catch {
      options.log('O arquivo MCP foi editado e não é JSON válido; nada foi restaurado e o diário foi preservado.');
      return false;
    }
  }
  options.checkpoint?.('restore');
  // Reconfere a edição da pessoa após calcular a restauração. Não aplica um estado lido antes da pausa.
  if (readText(j.file) !== text) {
    options.log('O arquivo MCP mudou durante a restauração; reconciliação necessária.');
    return false;
  }
  if (text !== replacement) {
    if (replacement === null) {
      fs.unlinkSync(j.file);
      syncDir(path.dirname(j.file));
    } else atomicWrite(j.file, replacement, j.mode);
  }
  for (const dir of j.createdDirs) {
    try {
      fs.rmdirSync(dir);
    } catch {
      /* nunca remove conteúdo criado pela pessoa */
    }
  }
  owned(lock, j);
  // Retira a geração inteira de uma vez: outro recuperador nunca vê um lock parcialmente apagado.
  const tombstone = `${lock}.released-${j.owner.generation}`;
  fs.renameSync(lock, tombstone);
  fs.rmSync(tombstone, { recursive: true, force: true });
  syncDir(path.dirname(lock));
  options.log('Empréstimo MCP encerrado; a configuração anterior foi restaurada sem sobrescrever edições concorrentes.');
  return true;
}

export function leaseProjectServer(cwd: string, spec: ProjectMcpSpec, options: LeaseOptions): ProjectServerLease {
  if (path.isAbsolute(spec.file) || spec.file.split(/[\\/]/).includes('..')) throw new Error('Caminho MCP fora do projeto.');
  const file = realLeasePath(path.join(cwd, spec.file));
  const root = rootOf(options);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('A pasta de coordenação MCP não pode ser um link.');
  const lock = lockOf(root, file);
  const acquire = () => fs.mkdirSync(lock, { mode: 0o700 });
  try {
    acquire();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    // Uma execução anterior deste host pode ter terminado sem confirmar o fim da árvore de processos
    // (o cursor-agent deixa um filho vivo por um instante); ela retém o empréstimo, e ninguém mais o
    // devolve enquanto a janela vive. Antes de recusar, tenta reconciliar o que já tem prova de fim.
    try {
      recoverProjectServers(options);
      acquire();
    } catch (again) {
      if ((again as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error('O arquivo MCP está emprestado ou aguarda reconciliação em outra execução.');
      throw again;
    }
  }
  let journalWritten = false;
  let journal: Journal;
  try {
    const before = readText(file);
    const current = config(before ?? '{}');
    const beforeEntry = current.mcpServers?.['faz-ai'] ?? null;
    const writtenEntry = { ...(spec.stdioType === false ? {} : { type: 'stdio' }), ...spec.entry };
    (current.mcpServers ??= {})['faz-ai'] = writtenEntry;
    const expected = equal(beforeEntry, writtenEntry) && before !== null ? before : JSON.stringify(current, null, 2) + '\n';
    const createdDirs: string[] = [];
    for (let dir = path.dirname(file); !fs.existsSync(dir); dir = path.dirname(dir)) createdDirs.push(dir);
    journal = {
      version: 1,
      file,
      owner: { pid: process.pid, generation: randomUUID(), birth: processBirth(process.pid) },
      before,
      expected,
      beforeEntry,
      writtenEntry,
      createdDirs,
      mode: before === null ? 0o600 : fs.statSync(file).mode & 0o777,
      phase: 'prepared',
    };
    atomicWrite(path.join(lock, 'journal.json'), JSON.stringify(journal));
    syncDir(root);
    journalWritten = true;
    options.checkpoint?.('journal');
    if (readText(file) !== before || realLeasePath(file) !== file)
      throw new Error('O arquivo MCP mudou antes da escrita; reconciliação necessária.');
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    if (before !== expected) {
      excludeLocally(cwd, spec.file);
      atomicWrite(file, expected, 0o600);
    }
    options.checkpoint?.('write');
  } catch (e) {
    // Depois do WAL, qualquer erro conserva a prova para recuperação; antes dele não houve mutação.
    if (!journalWritten) {
      for (const name of fs.readdirSync(lock)) fs.rmSync(path.join(lock, name), { force: true });
      fs.rmdirSync(lock);
    }
    throw e;
  }
  let released = false;
  const phase = (value: Journal['phase'], gate?: Journal['gate']) => {
    if (released) throw new Error('Empréstimo MCP já encerrado.');
    owned(lock, journal);
    const { gate: _oldGate, ...previous } = journal;
    const next: Journal = { ...previous, phase: value, ...(gate ? { gate } : {}) };
    atomicWrite(path.join(lock, 'journal.json'), JSON.stringify(next));
    journal = next;
  };
  return {
    file,
    generation: journal.owner.generation,
    result: journal.before === journal.expected ? 'kept' : journal.beforeEntry === null ? 'added' : 'repaired',
    markProcessUnconfirmed: () => phase('process-unconfirmed'),
    prepareControlledProcess: () => phase('process-unconfirmed', { version: 1, process: null }),
    recordControlledProcess: (identity) => {
      if (journal.gate?.version !== 1 || journal.gate.process !== null || !validProcessIdentity(identity))
        throw new Error('Identidade do launcher inválida ou já registrada.');
      phase('process-unconfirmed', { version: 1, process: { ...identity } });
    },
    confirmProcessStopped: () => phase('prepared'),
    release: () => {
      if (released) return true;
      released = restore(lock, journal, options);
      return released;
    },
  };
}

/** O diário é deste mesmo processo (PID e nascimento iguais), não de um PID reutilizado. */
const ownedByThisHost = (owner: Owner): boolean =>
  owner.pid === process.pid && owner.birth !== null && owner.birth === processBirth(process.pid);

/**
 * Recupera preparação sem processo e dono comprovadamente morto. Ambiguidade conserva tudo.
 * Um empréstimo deste próprio host, deixado em "processo não confirmado" por uma execução que já
 * acabou, também é devolvido, mas só com o processo controlado registrado e o grupo dele morto: a
 * execução não vai mais confirmar nada, e sem isso o Cursor ficaria recusado até reabrir a janela.
 */
export function recoverProjectServers(
  options: LeaseOptions,
  stateOf: (owner: Owner) => ProcessState = options.probes?.owner ?? processState,
  groupState: (identity: ProcessIdentity) => ProcessState = options.probes?.group ?? processGroupState,
): number {
  const root = rootOf(options);
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(root)) {
    if (!/^[a-f0-9]{64}$/.test(name)) continue;
    const lock = path.join(root, name);
    try {
      let j = journalAt(lock);
      if (lockOf(root, j.file) !== lock) continue;
      const ownerDead = stateOf(j.owner) === 'dead';
      const mine = !ownerDead && ownedByThisHost(j.owner);
      if (!ownerDead && !mine) continue;
      // Do próprio host, só o caso com prova completa: um diário em "prepared" ou sem processo registrado
      // pode ser de uma execução ainda em curso nesta janela.
      if (mine && (j.phase !== 'process-unconfirmed' || !j.gate?.process || groupState(j.gate.process) !== 'dead')) continue;
      // Trava de recuperação independente: duas janelas não restauram o mesmo diário simultaneamente.
      const recovery = path.join(lock, 'recovery');
      try {
        fs.mkdirSync(recovery, { mode: 0o700 });
      } catch {
        continue;
      }
      try {
        // A geração continua a mesma; a aquisição normal nunca remove uma trava órfã por conta própria.
        if (j.phase === 'process-unconfirmed') {
          if (!j.gate || (j.gate.process !== null && groupState(j.gate.process) !== 'dead')) {
            options.log('Execução MCP órfã exige reconciliação dos processos; configuração e diário preservados.');
            continue;
          }
          // Sem identidade registrada, o launcher nunca recebeu a descrição. Com ela, exige grupo ausente.
          j = { ...j, phase: 'prepared' };
          atomicWrite(path.join(lock, 'journal.json'), JSON.stringify(j));
        }
        if (mine) options.log('A árvore de processos da execução anterior já encerrou; o empréstimo MCP retido é devolvido agora.');
        if (restore(lock, j, options)) count++;
      } finally {
        // A restauração bem-sucedida já retirou a geração antiga. Não toca numa nova posse.
        if (fs.existsSync(lock) && journalAt(lock).owner.generation === j.owner.generation)
          fs.rmSync(recovery, { recursive: true, force: true });
      }
    } catch {
      options.log('Não foi possível recuperar um empréstimo MCP; diário preservado para revisão.');
    }
  }
  return count;
}
