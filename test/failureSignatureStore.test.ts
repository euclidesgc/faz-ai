import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { GateRepo } from '../src/extension/repositories/gateRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const open = async (to?: number): Promise<Database> => {
  const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
  const db = new SQL.Database();
  migrate(db, to);
  return db;
};
const has = (db: Database) =>
  db.exec("SELECT COUNT(*) FROM pragma_table_info('ai_runs') WHERE name = 'failure_signature'")[0]!.values[0]![0];
const hasIndex = (db: Database) =>
  db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'ai_runs_failure_signature'")[0]!.values[0]![0];

describe('migração 57 → 58 (assinatura da falha)', () => {
  it('sobe com NULL nas execuções antigas, cria coluna e índice, e desce para 57', async () => {
    const old = await open(57);
    old.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    old.run(
      "INSERT INTO ai_runs (id, board_id, started_at, month, origin, card_title, card_type, workflow, column_name, phase, tool, permission, outcome) VALUES ('r1','b',1,'2026-10','manual','','','','','','claude','','failed')",
    );
    expect(has(old)).toBe(0);
    migrate(old);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(58);
    expect(has(old)).toBe(1);
    expect(hasIndex(old)).toBe(1);
    expect(old.exec("SELECT failure_signature FROM ai_runs WHERE id = 'r1'")[0]!.values).toEqual([[null]]);

    expect(DOWN_MIGRATIONS[58]).toBeDefined();
    migrateDown(old, 57);
    expect(has(old)).toBe(0);
    expect(hasIndex(old)).toBe(0);
    expect(old.exec('SELECT outcome FROM ai_runs')[0]!.values).toEqual([['failed']]);
  });
});

describe('AiRunRepo.failureOccurrences', () => {
  it('soma só as com assinatura, dos cards pedidos, depois de since', async () => {
    const db = await open();
    db.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    const runs = new AiRunRepo(db);
    const start = (cardId: string, cardNumber: number, startedAt: number) =>
      runs.start({
        boardId: 'b',
        startedAt,
        origin: 'manual',
        tool: 'claude',
        cardId,
        cardNumber,
        cardTitle: '',
        cardType: '',
        workflow: '',
        columnName: 'Revisão',
        phase: '',
      });
    const a = start('story', 10, 100);
    const b = start('sub', 11, 200);
    const c = start('sub', 11, 300);
    const d = start('outra', 12, 250);
    const e = start('story', 10, 400);
    runs.setFailureSignature(a, 'Revisão | run | erro');
    runs.setFailureSignature(b, 'Revisão | run | erro');
    runs.setFailureSignature(d, 'Revisão | run | erro');
    runs.finish(c, 'failed', 1, 'transient'); // sem assinatura
    runs.closeOpen(500); // e fica unknown, sem assinatura
    expect(e).toBeTruthy();

    const all = runs.failureOccurrences(['story', 'sub'], 0);
    expect(all.map((o) => [o.cardId, o.cardNumber, o.at, o.origin, o.signature, o.detail])).toEqual([
      ['story', 10, 100, 'run', 'Revisão | run | erro', 'erro'],
      ['sub', 11, 200, 'run', 'Revisão | run | erro', 'erro'],
    ]);
    expect(runs.failureOccurrences(['story', 'sub'], 100).map((o) => o.at)).toEqual([200]);
    expect(runs.failureOccurrences([], 0)).toEqual([]);
  });
});

describe('GateRepo.failedOccurrences', () => {
  it('só failed com assinatura, dos cards pedidos, depois de since', async () => {
    const db = await open();
    const gates = new GateRepo(db);
    const mk = (cardId: string, result: 'failed' | 'passed' | 'interrupted', signature: string) => {
      const g = gates.start({ cardId, columnId: 'col', targetColumnId: null, kind: 'move' });
      gates.finish(g.id, result, 'saída', signature);
      return g;
    };
    const f1 = mk('story', 'failed', 'Revisão | gate | tsc: erro');
    mk('sub', 'failed', 'Revisão | gate | tsc: erro');
    mk('story', 'passed', '');
    mk('story', 'interrupted', '');
    mk('outra', 'failed', 'Revisão | gate | tsc: erro');

    const occ = gates.failedOccurrences(['story', 'sub'], 0);
    expect(occ.map((o) => [o.cardId, o.origin, o.detail])).toEqual([
      ['story', 'gate', 'tsc: erro'],
      ['sub', 'gate', 'tsc: erro'],
    ]);
    expect(gates.failedOccurrences(['story', 'sub'], f1.startedAt + 10_000)).toEqual([]);
    expect(gates.failedOccurrences([], 0)).toEqual([]);
  });
});
