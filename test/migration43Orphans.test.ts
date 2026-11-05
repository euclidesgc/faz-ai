import { expect, it } from 'vitest';
import path from 'node:path';
import { cleanOrphans, newDatabase, openInMemory } from '../src/extension/db/database';
import { migrate, SCHEMA_VERSION } from '../src/extension/db/schema';
import { all, one, run } from '../src/extension/db/query';

// Migração 43: ela reconstrói `ai_runs` e conferia o banco inteiro com `PRAGMA foreign_key_check`. Um board
// apagado por uma versão antiga, que não cascateava, deixou cards e workflows órfãos muito antes da 43; a
// conferência acusava esses restos, desfazia a migração e o board nunca mais abria. A conferência agora olha
// só as filhas de `ai_runs`, e os órfãos antigos ficam para a limpeza que roda ao abrir o arquivo.
const version = () => Number(one(db, "SELECT value FROM meta WHERE key = 'schema_version'")?.value);
let db: ReturnType<typeof newDatabase>;

async function boardAt42() {
  (await openInMemory(path.resolve('node_modules/sql.js/dist'))).close();
  db = newDatabase();
  migrate(db, 42);
  run(db, "INSERT INTO boards(id, workspace_key, name) VALUES ('vivo', 'vivo', 'Board vivo')");
  run(db, "INSERT INTO boards(id, workspace_key, name) VALUES ('apagado', 'apagado', 'Board apagado')");
  for (const board of ['vivo', 'apagado']) {
    run(db, "INSERT INTO workflows(id, board_id, name, position, kind) VALUES (?, ?, 'História', 0, 'parent')", [`wf-${board}`, board]);
    run(db, "INSERT INTO columns(id, workflow_id, name, position) VALUES (?, ?, 'Backlog', 0)", [`col-${board}`, `wf-${board}`]);
    run(db, "INSERT INTO card_types(id, board_id, name, color, default_workflow_id) VALUES (?, ?, 'História', 'blue', ?)", [
      `type-${board}`,
      board,
      `wf-${board}`,
    ]);
    run(
      db,
      `INSERT INTO cards(id, board_id, workflow_id, column_id, type_id, title, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Card', 0, 1, 1)`,
      [`card-${board}`, board, `wf-${board}`, `col-${board}`, `type-${board}`],
    );
  }
  // a versão antiga apagava o board com as chaves desligadas: os filhos ficavam
  db.run('PRAGMA foreign_keys = OFF');
  run(db, "DELETE FROM boards WHERE id = 'apagado'");
  db.run('PRAGMA foreign_keys = ON');
  expect(all(db, 'PRAGMA foreign_key_check').map((r) => r.table)).toEqual(expect.arrayContaining(['workflows', 'card_types', 'cards']));
}

it('a 43 abre um board que já tinha cards e workflows órfãos de um board apagado antes dela', async () => {
  await boardAt42();
  try {
    expect(() => migrate(db)).not.toThrow();
    expect(version()).toBe(SCHEMA_VERSION);
    // o board vivo está inteiro e os restos do apagado seguem lá, até a limpeza que roda ao abrir o arquivo
    expect(all(db, "SELECT id FROM cards WHERE board_id = 'vivo'")).toEqual([{ id: 'card-vivo' }]);
    expect(all(db, "SELECT id FROM cards WHERE board_id = 'apagado'")).toEqual([{ id: 'card-apagado' }]);
    cleanOrphans(db);
    expect(all(db, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(all(db, "SELECT id FROM cards WHERE board_id = 'vivo'")).toEqual([{ id: 'card-vivo' }]);
    expect(all(db, "SELECT id FROM cards WHERE board_id = 'apagado'")).toEqual([]);
  } finally {
    db.close();
  }
});

it('a 43 ainda recusa o inventário ou o Bash de uma execução que não existe', async () => {
  await boardAt42();
  try {
    db.run('PRAGMA foreign_keys = OFF');
    run(db, "INSERT INTO ai_run_bash(run_id, command, calls) VALUES ('sumida', 'ls', 1)");
    db.run('PRAGMA foreign_keys = ON');
    expect(() => migrate(db)).toThrow('Migração 43 do banco do board: Referências inválidas');
    expect(version()).toBe(42);
  } finally {
    db.close();
  }
});
