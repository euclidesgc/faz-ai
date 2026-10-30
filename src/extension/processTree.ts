// Os processos que a CLI iniciou e que saíram do grupo dela. O grupo próprio (`detached`) cobre quase
// tudo, mas uma CLI pode abrir comandos em grupos novos: o Claude Code põe cada comando do terminal num
// grupo seu. Se esse comando cai no meio (tempo esgotado), o que ele iniciou fica órfão (os workers do
// Vitest, por exemplo) e nem o Parar nem o fim da execução o alcançam, porque o sinal vai só ao grupo
// da CLI. Depois de órfão o processo já não aponta para a CLI, então a árvore é anotada enquanto ela vive.
import { execFile } from 'node:child_process';

export interface ProcessRow {
  pid: number;
  ppid: number;
  pgid: number;
  /** início do processo como o `ps` o mostra: PID reutilizado tem outro início */
  birth: string;
}

/** A tabela de processos do sistema, ou null se o `ps` falhar ou trouxer uma linha que não se reconhece. */
export function processTable(): Promise<ProcessRow[] | null> {
  return new Promise((resolve) => {
    execFile(
      'ps',
      ['-axo', 'pid=,ppid=,pgid=,lstart='],
      // o formato do `lstart` muda com o idioma: fixo, a comparação entre duas leituras vale
      { encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } },
      (err, stdout) => {
        if (err) return resolve(null);
        const rows: ProcessRow[] = [];
        for (const line of stdout.split('\n')) {
          if (!line.trim()) continue;
          const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S.*?)\s*$/.exec(line);
          if (!m) return resolve(null);
          rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), birth: m[4]! });
        }
        resolve(rows.length ? rows : null);
      },
    );
  });
}

/**
 * Os descendentes da CLI que estão fora do grupo dela. Parte da própria CLI, de tudo o que está no grupo
 * dela (um filho cujo pai já saiu continua no grupo) e dos que já foram anotados, e desce pelo pai de
 * cada processo.
 */
export function escapedDescendants(table: ProcessRow[], root: number, known: ProcessRow[] = []): ProcessRow[] {
  const alive = new Map(table.map((row) => [row.pid, row]));
  const seeds = new Set<number>([root]);
  for (const row of table) if (row.pgid === root) seeds.add(row.pid);
  for (const row of known) if (alive.get(row.pid)?.birth === row.birth) seeds.add(row.pid);
  const children = new Map<number, ProcessRow[]>();
  for (const row of table) {
    const list = children.get(row.ppid);
    if (list) list.push(row);
    else children.set(row.ppid, [row]);
  }
  const found = new Map<number, ProcessRow>();
  const pending = [...seeds];
  const seen = new Set(pending);
  while (pending.length) {
    for (const child of children.get(pending.pop()!) ?? []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      pending.push(child.pid);
      if (child.pgid !== root) found.set(child.pid, child);
    }
  }
  return [...found.values()];
}

/**
 * Os órfãos de um grupo anotado: o comando caiu e o worker que ele iniciou ficou com o init como pai, no
 * mesmo grupo. Um grupo só é nosso se o líder morreu (o sistema não dá o número de um grupo com membros a
 * um processo novo) ou continua sendo o mesmo processo que foi anotado.
 */
export function orphansOfGroups(table: ProcessRow[], known: ProcessRow[], root: number): ProcessRow[] {
  const alive = new Map(table.map((row) => [row.pid, row]));
  const recorded = new Map(known.map((row) => [row.pid, row]));
  const groups = new Set<number>();
  for (const row of known) {
    if (row.pgid === root) continue;
    const leader = alive.get(row.pgid);
    if (!leader || (recorded.has(row.pgid) && recorded.get(row.pgid)!.birth === leader.birth)) groups.add(row.pgid);
  }
  return table.filter((row) => row.ppid === 1 && groups.has(row.pgid));
}

export interface EscapedProcesses {
  /** anota os descendentes fora do grupo; roda enquanto a CLI vive */
  record(): Promise<void>;
  /** anota uma última vez e encerra os anotados que ainda vivem: SIGTERM e, 1 s depois, SIGKILL */
  end(): Promise<void>;
}

export function trackEscapedProcesses(
  root: number,
  deps: {
    table?: () => Promise<ProcessRow[] | null>;
    signal?: (pid: number, sig: NodeJS.Signals) => void;
    graceMs?: number;
  } = {},
): EscapedProcesses {
  const table = deps.table ?? processTable;
  const signal =
    deps.signal ??
    ((pid, sig) => {
      try {
        process.kill(pid, sig);
      } catch {
        /* já acabou */
      }
    });
  const known = new Map<number, ProcessRow>();
  const remember = (rows: ProcessRow[]) => {
    for (const row of rows) if (known.get(row.pid)?.birth !== row.birth) known.set(row.pid, row);
  };
  /** os anotados que continuam vivos com o mesmo início: um PID reutilizado é de outro processo */
  const survivors = (rows: ProcessRow[]) => {
    const alive = new Map(rows.map((row) => [row.pid, row]));
    return [...known.values()].filter((row) => alive.get(row.pid)?.birth === row.birth && row.pid !== process.pid);
  };
  const record = async () => {
    const rows = await table();
    if (rows) remember(escapedDescendants(rows, root, [...known.values()]));
  };
  let ending: Promise<void> | undefined;
  return {
    record,
    end: () =>
      (ending ??= (async () => {
        const rows = await table();
        if (!rows) return;
        remember(escapedDescendants(rows, root, [...known.values()]));
        remember(orphansOfGroups(rows, [...known.values()], root));
        const first = survivors(rows);
        if (!first.length) return;
        for (const row of first) signal(row.pid, 'SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, deps.graceMs ?? 1000).unref?.());
        const again = await table();
        if (again) for (const row of survivors(again)) signal(row.pid, 'SIGKILL');
      })()),
  };
}
