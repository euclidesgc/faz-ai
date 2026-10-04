import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { promises as fs, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { migrate } from './schema';

export interface DbHandle {
  db: Database;
  /** Agenda uma gravação em disco (debounced). */
  scheduleSave(): void;
  /** Grava imediatamente e cancela qualquer gravação pendente. */
  flush(): Promise<void>;
  /** Grava uma cópia do banco como está agora, ao lado do arquivo (`.bak`), antes de uma mudança em massa. */
  backup(): void;
  close(): Promise<void>;
}

let sqlJs: SqlJsStatic | null = null;

async function getSqlJs(wasmDir: string): Promise<SqlJsStatic> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({ locateFile: (file: string) => path.join(wasmDir, file) });
  }
  return sqlJs;
}

/**
 * Banco vazio em memória, sem schema: etapa intermediária da importação de um board (o arquivo é
 * materializado na versão de schema dele e migrado antes de entrar no banco real). Só funciona depois
 * de `openInMemory` ou `openFile` terem carregado o sql.js.
 */
export function newDatabase(): Database {
  if (!sqlJs) throw new Error('sql.js ainda não foi carregado');
  return new sqlJs.Database();
}

/** Cria um banco em memória (testes). */
export async function openInMemory(wasmDir: string): Promise<Database> {
  const SQL = await getSqlJs(wasmDir);
  const db = new SQL.Database();
  migrate(db);
  return db;
}

/** Abre (ou cria) o arquivo .db e aplica migrations. */
export async function openFile(filePath: string, wasmDir: string, debounceMs = 500): Promise<DbHandle> {
  const SQL = await getSqlJs(wasmDir);
  let db: Database;
  try {
    const buf = await fs.readFile(filePath);
    db = new SQL.Database(new Uint8Array(buf));
  } catch {
    db = new SQL.Database();
  }
  migrate(db);

  let timer: NodeJS.Timeout | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = async () => {
    const data = db.export();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, Buffer.from(data));
    await fs.rename(tmp, filePath);
  };

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    writing = writing.then(write, write);
    await writing;
  };

  return {
    db,
    scheduleSave() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        writing = writing.then(write, write).catch((e) => console.error('[fazai] falha ao salvar db', e));
      }, debounceMs);
    },
    flush,
    backup() {
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(`${filePath}.bak`, Buffer.from(db.export()));
    },
    async close() {
      await flush();
      db.close();
    },
  };
}
