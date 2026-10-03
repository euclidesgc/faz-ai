import type { Database, SqlValue } from 'sql.js';

export type Row = Record<string, SqlValue>;

export function all(db: Database, sql: string, params: SqlValue[] = []): Row[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: Row[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Row);
    return rows;
  } finally {
    stmt.free();
  }
}

export function one(db: Database, sql: string, params: SqlValue[] = []): Row | undefined {
  return all(db, sql, params)[0];
}

export function run(db: Database, sql: string, params: SqlValue[] = []): void {
  db.run(sql, params);
}

export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN;');
  try {
    const r = fn();
    db.exec('COMMIT;');
    return r;
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }
}

export const str = (v: SqlValue | undefined): string => (v == null ? '' : String(v));
export const num = (v: SqlValue | undefined): number => Number(v ?? 0);
export const bool = (v: SqlValue | undefined): boolean => Number(v ?? 0) === 1;
/** Como `str`, mas preserva `NULL` em vez de virar `''` — para colunas onde a distinção importa (RF-15). */
export const strOrNull = (v: SqlValue | undefined): string | null => (v == null ? null : String(v));
