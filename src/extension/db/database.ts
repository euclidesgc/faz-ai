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

/**
 * Exporta o banco como bytes e religa as chaves estrangeiras. No sql.js, `db.export()` fecha e reabre a
 * conexão, o que zera os PRAGMAs: sem religar, todo DELETE depois do primeiro save deixava de cascatear
 * (vínculos, sub-tarefas e o board substituído na importação ficavam órfãos).
 */
export function exportBytes(db: Database): Uint8Array {
  const data = db.export();
  db.run('PRAGMA foreign_keys = ON;');
  return data;
}

/**
 * Apaga as linhas que violam chave estrangeira (deixadas pelas versões que gravavam com as chaves
 * desligadas) e devolve quantas apagou. Todas as FKs do schema são ON DELETE CASCADE ou sem ação: apagar a
 * linha órfã é o que teria acontecido com as chaves ligadas. Repete porque apagar um órfão pode cascatear.
 */
export function cleanOrphans(db: Database): number {
  let removed = 0;
  for (let round = 0; round < 20; round++) {
    const res = db.exec('PRAGMA foreign_key_check');
    const rows = res[0]?.values ?? [];
    if (!rows.length) break;
    const seen = new Set<string>();
    for (const [table, rowid] of rows) {
      const key = `${String(table)}:${String(rowid)}`;
      if (rowid == null || seen.has(key)) continue;
      seen.add(key);
      db.run(`DELETE FROM "${String(table)}" WHERE rowid = ?`, [rowid]);
      removed += db.getRowsModified();
    }
  }
  return removed;
}

/** Marca em `meta` de que a limpeza única de órfãos (correção da 0.32.0) já rodou neste banco. */
const ORPHANS_CLEANED = 'orphans_cleaned';

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
  // limpeza única: o arquivo pode ter órfãos gravados antes de as chaves serem religadas após o save
  if (!db.exec(`SELECT 1 FROM meta WHERE key = '${ORPHANS_CLEANED}'`).length) {
    cleanOrphans(db);
    db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [ORPHANS_CLEANED, '1']);
  }

  let timer: NodeJS.Timeout | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = async () => {
    const data = exportBytes(db);
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
      writeFileSync(`${filePath}.bak`, Buffer.from(exportBytes(db)));
    },
    async close() {
      await flush();
      db.close();
    },
  };
}
