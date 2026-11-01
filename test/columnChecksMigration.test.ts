import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs from 'sql.js';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('migração 53: checks_json nas colunas (#1096)', () => {
  it('sobe da 52 com a lista vazia nas colunas existentes e volta para a 52 sem perder o resto', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const db = new SQL.Database();
    migrate(db, 52);
    db.run(`
      INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto');
      INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent');
      INSERT INTO columns (id, workflow_id, name, position) VALUES ('c', 'w', 'Revisão', 0);
    `);
    const hasColumn = () => db.exec("SELECT COUNT(*) FROM pragma_table_info('columns') WHERE name = 'checks_json'")[0]!.values[0]![0];
    expect(hasColumn()).toBe(0);

    migrate(db);

    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(53);
    expect(db.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(hasColumn()).toBe(1);
    expect(db.exec("SELECT checks_json FROM columns WHERE id = 'c'")[0]!.values).toEqual([['[]']]);

    expect(DOWN_MIGRATIONS[53]).toBeDefined();
    migrateDown(db, 52);
    expect(db.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe('52');
    expect(hasColumn()).toBe(0);
    expect(db.exec("SELECT name FROM columns WHERE id = 'c'")[0]!.values).toEqual([['Revisão']]);
  });
});
