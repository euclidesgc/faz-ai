import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs from 'sql.js';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('migração 60: phase_model nas colunas (#1411)', () => {
  it('sobe da 59 com o modelo da fase nulo nas colunas existentes e volta para a 59 sem a coluna', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const db = new SQL.Database();
    migrate(db, 59);
    db.run(`
      INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto');
      INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent');
      INSERT INTO columns (id, workflow_id, name, position) VALUES ('c', 'w', 'Revisão', 0);
    `);
    const hasColumn = () => db.exec("SELECT COUNT(*) FROM pragma_table_info('columns') WHERE name = 'phase_model'")[0]!.values[0]![0];
    expect(hasColumn()).toBe(0);

    migrate(db);

    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(60);
    expect(db.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(hasColumn()).toBe(1);
    expect(db.exec("SELECT phase_model FROM columns WHERE id = 'c'")[0]!.values).toEqual([[null]]);

    expect(DOWN_MIGRATIONS[60]).toBeDefined();
    migrateDown(db, 59);
    expect(db.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe('59');
    expect(hasColumn()).toBe(0);
    expect(db.exec("SELECT name FROM columns WHERE id = 'c'")[0]!.values).toEqual([['Revisão']]);
  });
});
