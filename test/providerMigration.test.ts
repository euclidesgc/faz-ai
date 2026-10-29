import { expect, it } from 'vitest';
import path from 'node:path';
import { openInMemory, newDatabase } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { all, run } from '../src/extension/db/query';

it('origem test preserva execuções/inventário/Bash e mantém cascatas após a migração 42 → 43', async () => {
  (await openInMemory(path.resolve('node_modules/sql.js/dist'))).close();
  const db = newDatabase();
  try {
    migrate(db, 42);
    // o board direto no banco: a semente de hoje grava colunas que o schema 42 não tem
    const board = 'migration-profile';
    run(db, "INSERT INTO boards(id,workspace_key,name) VALUES (?,?,'Perfis')", [board, board]);
    run(
      db,
      "INSERT INTO ai_runs(id,board_id,started_at,month,origin,tool,permission,admission_json) VALUES ('run',?,1,'2026-10','manual','claude','board','{}')",
      [board],
    );
    run(db, "INSERT INTO ai_run_usage(run_id,kind,name,calls) VALUES ('run','tool','Read',2)");
    run(db, "INSERT INTO ai_run_bash(run_id,command,calls) VALUES ('run','echo oi',1)");
    const before = all(db, 'SELECT * FROM ai_runs');
    migrate(db);
    // as colunas da conferência, do modo e do custo por bucket (migrações posteriores) nascem nulas; o resto da linha não muda
    expect(all(db, 'SELECT * FROM ai_runs')).toEqual(
      before.map((r) => ({
        ...r,
        check_status: null,
        check_detail: null,
        mode: null,
        cost_input_usd: null,
        cost_output_usd: null,
        cost_cache_read_usd: null,
        cost_cache_write_usd: null,
      })),
    );
    expect(all(db, 'SELECT * FROM ai_run_usage')).toHaveLength(1);
    expect(all(db, 'SELECT * FROM ai_run_bash')).toHaveLength(1);
    run(
      db,
      "INSERT INTO ai_runs(id,board_id,started_at,month,origin,tool,permission) VALUES ('probe',?,2,'2026-10','test','profile-id','full')",
      [board],
    );
    expect(all(db, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(() => run(db, "INSERT INTO ai_run_usage(run_id,kind,name) VALUES ('missing','tool','Read')")).toThrow();
    run(db, "DELETE FROM ai_runs WHERE id='run'");
    expect(all(db, 'SELECT * FROM ai_run_usage')).toEqual([]);
    expect(all(db, 'SELECT * FROM ai_run_bash')).toEqual([]);
  } finally {
    db.close();
  }
});

it('falha de integridade desfaz reconstrução e restaura chaves estrangeiras sem perder registros', async () => {
  (await openInMemory(path.resolve('node_modules/sql.js/dist'))).close();
  const db = newDatabase();
  try {
    migrate(db, 42);
    run(db, "INSERT INTO boards(id,workspace_key,name) VALUES ('rollback','rollback','Rollback')");
    db.run('PRAGMA foreign_keys=OFF');
    run(db, "INSERT INTO ai_run_usage(run_id,kind,name,calls) VALUES ('orphan','tool','Read',1)");
    db.run('PRAGMA foreign_keys=ON');
    expect(() => migrate(db)).toThrow('Referências inválidas');
    expect(all(db, "SELECT value FROM meta WHERE key='schema_version'")[0]?.value).toBe('42');
    expect(all(db, 'SELECT * FROM ai_run_usage')).toHaveLength(1);
    expect(() => run(db, "INSERT INTO ai_run_usage(run_id,kind,name) VALUES ('another','tool','Read')")).toThrow();
  } finally {
    db.close();
  }
});
