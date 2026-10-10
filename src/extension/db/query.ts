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

/**
 * Erro do SQLite com o comando que falhou: "FOREIGN KEY constraint failed" sozinho não diz qual
 * gravação foi recusada. Só o texto do comando entra (encurtado), nunca os valores, que são dados da pessoa.
 */
export function withSql(e: unknown, sql: string): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes(' — SQL: ')) return e instanceof Error ? e : new Error(message);
  const statement = sql.replace(/\s+/g, ' ').trim().slice(0, 160);
  const error = new Error(`${message} — SQL: ${statement}`);
  if (e instanceof Error && e.stack) error.stack = `${error.message}\n${e.stack.split('\n').slice(1).join('\n')}`;
  return error;
}

export function run(db: Database, sql: string, params: SqlValue[] = []): void {
  try {
    db.run(sql, params);
  } catch (e) {
    throw withSql(e, sql);
  }
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
