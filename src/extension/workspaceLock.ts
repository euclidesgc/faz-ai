import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { processBirth, processState, processGroupState, validProcessIdentity, type ProcessIdentity } from './processIdentity';

interface Journal {
  version: 1;
  workspace: string;
  leaseId: string;
  owner: { pid: number; birth: string | null; instance: string };
  workId: string;
  generation: number;
  /** null: nenhum comando foi liberado ao launcher controlado. */
  process: ProcessIdentity | null;
}
export interface WorkspaceLease {
  readonly workspace: string;
  readonly workId: string;
  readonly generation: number;
  readonly process: ProcessIdentity | null;
  recordProcess(identity: ProcessIdentity): void;
  /** Só remove a reserva com o grupo comprovadamente morto ou ainda sem comando liberado. */
  release(): boolean;
}
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length < 8192 && !value.includes('\0');
const defaultRoot = () => path.join(os.homedir(), '.faz-ai', 'workspace-locks');
const lockPath = (root: string, workspace: string) => path.join(root, createHash('sha256').update(workspace).digest('hex'));
function syncDir(dir: string): void {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function write(dir: string, journal: Journal): void {
  const temp = path.join(dir, `journal-${randomUUID()}.tmp`);
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(journal));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, path.join(dir, 'journal.json'));
    syncDir(dir);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
function read(dir: string): Journal {
  if (!fs.lstatSync(dir).isDirectory()) throw new Error('Trava da pasta inválida.');
  const file = path.join(dir, 'journal.json');
  if (!fs.lstatSync(file).isFile()) throw new Error('Diário de escrita inválido.');
  const j = JSON.parse(fs.readFileSync(file, 'utf8')) as Journal;
  if (
    !j ||
    j.version !== 1 ||
    !text(j.workspace) ||
    !path.isAbsolute(j.workspace) ||
    !text(j.leaseId) ||
    !/^[A-Za-z0-9-]{1,128}$/.test(j.leaseId) ||
    !text(j.workId) ||
    !Number.isSafeInteger(j.generation) ||
    j.generation < 1 ||
    !j.owner ||
    !text(j.owner.instance) ||
    !Number.isSafeInteger(j.owner.pid) ||
    j.owner.pid < 1 ||
    (j.owner.birth !== null && !text(j.owner.birth)) ||
    (j.process !== null && !validProcessIdentity(j.process))
  )
    throw new Error('Diário de escrita inválido; reconciliação necessária.');
  if (path.basename(dir) !== createHash('sha256').update(j.workspace).digest('hex')) throw new Error('Diário de outra pasta.');
  return j;
}
function host(instance: string): Journal['owner'] {
  return { pid: process.pid, birth: processBirth(process.pid), instance };
}
function lease(dir: string, initial: Journal): WorkspaceLease {
  let journal = initial;
  let released = false;
  const owned = () => {
    const current = read(dir);
    if (
      current.leaseId !== journal.leaseId ||
      current.workspace !== journal.workspace ||
      current.owner.pid !== journal.owner.pid ||
      current.owner.birth !== journal.owner.birth ||
      current.owner.instance !== journal.owner.instance ||
      current.workId !== journal.workId ||
      current.generation !== journal.generation
    )
      throw new Error('A posse da pasta mudou; não é possível liberar ou alterar a reserva antiga.');
    return current;
  };
  return {
    workspace: journal.workspace,
    workId: journal.workId,
    generation: journal.generation,
    get process() {
      return structuredClone(journal.process);
    },
    recordProcess(identity) {
      if (!validProcessIdentity(identity)) throw new Error('Identidade do processo inválida.');
      const current = owned();
      if (current.process && processGroupState(current.process) !== 'dead')
        throw new Error('A tentativa anterior ainda não teve o fim confirmado.');
      journal = { ...current, process: structuredClone(identity) };
      write(dir, journal);
    },
    release() {
      if (released) return true;
      const current = owned();
      if (current.process && processGroupState(current.process) !== 'dead') return false;
      // O rename retira esta geração inteira; apagar a lápide nunca toca uma nova aquisição.
      const tombstone = `${dir}.released-${journal.leaseId}`;
      fs.renameSync(dir, tombstone);
      syncDir(path.dirname(dir));
      released = true;
      fs.rmSync(tombstone, { recursive: true, force: true });
      return true;
    },
  };
}

/** Mesma raiz por usuário, independente de board, janela e diretório de dados da extensão. */
export function acquireWorkspace(
  workspace: string,
  workId: string,
  generation: number,
  instance: string,
  root = defaultRoot(),
): WorkspaceLease | null {
  if (!text(workId) || !text(instance) || !Number.isSafeInteger(generation) || generation < 1)
    throw new Error('Posse de escrita inválida.');
  const real = fs.realpathSync(workspace);
  if (!fs.statSync(real).isDirectory()) throw new Error('A pasta de escrita não é um diretório.');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(root).isDirectory()) throw new Error('Raiz de coordenação inválida.');
  const dir = lockPath(root, real);
  try {
    fs.mkdirSync(dir, { mode: 0o700 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw e;
  }
  const journal: Journal = { version: 1, workspace: real, workId, generation, leaseId: randomUUID(), owner: host(instance), process: null };
  try {
    write(dir, journal);
    syncDir(root);
    return lease(dir, journal);
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

/** Adota sem liberar: a nova instância ainda deve reconciliar processo, pasta, efeitos e banco. */
export function adoptWorkspace(
  workspace: string,
  workId: string,
  generation: number,
  instance: string,
  root = defaultRoot(),
): WorkspaceLease | null {
  if (!text(instance) || !text(workId) || !Number.isSafeInteger(generation) || generation < 1)
    throw new Error('Posse de escrita inválida.');
  const real = fs.realpathSync(workspace);
  const dir = lockPath(root, real);
  if (!fs.lstatSync(root).isDirectory()) throw new Error('Raiz de coordenação inválida.');
  const old = read(dir);
  if (old.workspace !== real || old.workId !== workId || old.generation !== generation || processState(old.owner) !== 'dead') return null;
  const guard = path.join(dir, 'recovery');
  try {
    fs.mkdirSync(guard, { mode: 0o700 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw e;
  }
  try {
    const current = read(dir);
    if (current.leaseId !== old.leaseId || current.owner.instance !== old.owner.instance || processState(current.owner) !== 'dead')
      return null;
    const adopted = { ...current, owner: host(instance) };
    write(dir, adopted);
    return lease(dir, adopted);
  } finally {
    // Queda durante a recuperação deixa a reserva retida; não presumir que um guard sem dono está livre.
    fs.rmdirSync(guard);
  }
}
