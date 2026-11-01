import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { newDatabase, openInMemory } from '../src/extension/db/database';
import { migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { all, one, run } from '../src/extension/db/query';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { NO_CARD } from '../src/extension/ai/gateway';

// Migração 59: a coluna `run_mode` de `ai_runs` (o modo da execução: phase, reply, unblock…). A coluna `mode`, da
// 48, segue sendo o transporte (cli, acp, api). A execução anterior lê sem modo; nada é inventado.
const BOARD = 'board-antigo';
let db: Database;
const columns = () => all(db, 'PRAGMA table_info(ai_runs)').map((c) => String(c.name));
const version = () => Number(one(db, "SELECT value FROM meta WHERE key = 'schema_version'")?.value);

beforeEach(async () => {
  (await openInMemory(path.resolve('node_modules/sql.js/dist'))).close();
  db = newDatabase();
  migrate(db, 58);
  run(db, "INSERT INTO boards(id, workspace_key, name) VALUES (?, 'pasta', 'Board antigo')", [BOARD]);
  run(
    db,
    `INSERT INTO ai_runs(id, board_id, started_at, month, origin, card_id, card_number, card_title, card_type, workflow, column_name,
       phase, tool, permission, mode) VALUES ('r1', ?, ?, '2026-10', 'manual', NULL, NULL, '', '', '', '', '', 'claude', 'full', 'cli')`,
    [BOARD, Date.UTC(2026, 9, 20)],
  );
});

describe('migração 59: o modo da execução em ai_runs', () => {
  it('cria run_mode nula na execução antiga e mantém o transporte em mode', () => {
    expect(columns()).not.toContain('run_mode');
    migrate(db);
    expect(version()).toBe(SCHEMA_VERSION);
    expect(columns()).toContain('run_mode');
    const old = new AiRunRepo(db).byMonth('2026-10').find((r) => r.id === 'r1')!;
    expect(old).toMatchObject({ transport: 'cli', runMode: null });
  });

  it('a execução nova grava o modo no start e o lê de volta; o chat (sem modo) fica nulo', () => {
    migrate(db);
    const runs = new AiRunRepo(db);
    const base = { ...NO_CARD, boardId: BOARD, startedAt: Date.UTC(2026, 9, 23), origin: 'manual' as const, tool: 'claude' };
    const reply = runs.start({ ...base, mode: 'reply' });
    const chat = runs.start(base);
    const byId = (id: string) => runs.byMonth('2026-10').find((r) => r.id === id)!;
    expect(byId(reply).runMode).toBe('reply');
    expect(byId(chat).runMode).toBeNull();
    expect(one(db, 'SELECT run_mode FROM ai_runs WHERE id = ?', [reply])?.run_mode).toBe('reply');
  });

  it('o caminho de volta (58) tira a coluna e a versão anterior lê a execução como antes', () => {
    migrate(db);
    new AiRunRepo(db).start({
      ...NO_CARD,
      boardId: BOARD,
      startedAt: Date.UTC(2026, 9, 23),
      origin: 'manual',
      tool: 'claude',
      mode: 'phase',
    });
    migrateDown(db, 58);
    expect(version()).toBe(58);
    expect(columns()).not.toContain('run_mode');
    expect(all(db, 'SELECT id, mode FROM ai_runs ORDER BY started_at').map((r) => [r.id, r.mode])).toEqual([
      ['r1', 'cli'],
      [expect.any(String), null],
    ]);
  });
});
