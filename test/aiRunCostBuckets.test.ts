import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { RunReport } from '../src/shared/log';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

const consumption = (over: Partial<NonNullable<RunReport['consumption']>> = {}): NonNullable<RunReport['consumption']> => ({
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 2,
  cacheWriteTokens: 1,
  turns: 1,
  sessionId: null,
  costUsd: null,
  ...over,
});

const report = (measure: RunReport['measure'], c: RunReport['consumption']): RunReport =>
  ({ measure, consumption: c, inventory: [], answer: '', reason: null }) as unknown as RunReport;

describe('custo por bucket em ai_runs (migração 52)', () => {
  let db: Database;
  let runs: AiRunRepo;
  let boardId: string;
  const start = () =>
    runs.start({
      boardId,
      startedAt: Date.now(),
      origin: 'manual',
      tool: 'claude',
      cardId: null,
      cardNumber: null,
      cardTitle: '',
      cardType: '',
      workflow: '',
      columnName: '',
      phase: '',
    });

  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    boardId = new BoardRepo(db).getOrCreate('ws', 'Projeto').id;
    runs = new AiRunRepo(db);
  });

  it('measure grava os quatro buckets e o total estimado, e toRun lê de volta', () => {
    const id = start();
    runs.measure(
      id,
      report(
        'full',
        consumption({
          costUsd: 0.5,
          costEstimated: true,
          costBuckets: { input: 0.1, output: 0.2, cacheRead: null, cacheWrite: 0.2 },
        }),
      ),
    );
    const r = runs.byMonth(new Date().toISOString().slice(0, 7)).find((x) => x.id === id)!;
    expect(r.costUsd).toBe(0.5);
    expect(r.costEstimated).toBe(true);
    expect(r.costBuckets).toEqual({ input: 0.1, output: 0.2, cacheRead: null, cacheWrite: 0.2 });
  });

  it('sem preço, medida none ou linha antiga: buckets null', () => {
    const a = start();
    runs.measure(a, report('full', consumption({ costUsd: 1 })));
    const b = start();
    runs.measure(b, report('none', consumption({ costBuckets: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 } })));
    const c = start();
    const rows = runs.byMonth(new Date().toISOString().slice(0, 7));
    expect(rows.find((x) => x.id === a)!.costBuckets).toBeNull();
    expect(rows.find((x) => x.id === b)!.costBuckets).toBeNull();
    expect(rows.find((x) => x.id === c)!.costBuckets).toBeNull();
  });
});

describe('migração 51 → 52 (custo por bucket)', () => {
  it('sobe com as colunas NULL nas execuções antigas e desce de volta para 51', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const old = new SQL.Database();
    migrate(old, 51);
    old.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    old.run(
      "INSERT INTO ai_runs (id, board_id, started_at, month, origin, tool, permission, cost_usd, cost_estimated) VALUES ('r1', 'b', 1, '2026-10', 'manual', 'claude', 'x', 0.5, 0)",
    );
    const cols = () =>
      old.exec(
        "SELECT COUNT(*) FROM pragma_table_info('ai_runs') WHERE name IN ('cost_input_usd','cost_output_usd','cost_cache_read_usd','cost_cache_write_usd')",
      )[0]!.values[0]![0];
    expect(cols()).toBe(0);

    migrate(old);

    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(52);
    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(cols()).toBe(4);
    expect(
      old.exec(
        'SELECT cost_usd, cost_estimated, cost_input_usd, cost_output_usd, cost_cache_read_usd, cost_cache_write_usd FROM ai_runs',
      )[0]!.values,
    ).toEqual([[0.5, 0, null, null, null, null]]);

    expect(DOWN_MIGRATIONS[52]).toBeDefined();
    migrateDown(old, 51);
    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe('51');
    expect(cols()).toBe(0);
    expect(old.exec('SELECT cost_usd FROM ai_runs')[0]!.values).toEqual([[0.5]]);
  });
});
