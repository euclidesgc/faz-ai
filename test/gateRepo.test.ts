import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { GateRepo } from '../src/extension/repositories/gateRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let db: Database;
let repo: GateRepo;

beforeEach(async () => {
  const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
  db = new SQL.Database();
  migrate(db);
  repo = new GateRepo(db);
});

describe('GateRepo', () => {
  it('start grava a execução como running, sem sha e sem fim', () => {
    const g = repo.start({ cardId: 'c1', columnId: 'col', targetColumnId: 'dest', kind: 'move' });
    expect(g).toMatchObject({
      cardId: 'c1',
      columnId: 'col',
      targetColumnId: 'dest',
      kind: 'move',
      sha: '',
      result: 'running',
      finishedAt: null,
    });
    expect(repo.get(g.id)).toEqual(g);
    expect(repo.runningFor('c1')?.id).toBe(g.id);
    expect(repo.runningFor('outro')).toBeNull();
    expect(repo.get('nada')).toBeNull();
  });

  it('setSha e finish fecham a execução e tiram de runningFor', () => {
    const g = repo.start({ cardId: 'c1', columnId: 'col', targetColumnId: null, kind: 'review' });
    repo.setSha(g.id, 'abc123');
    repo.finish(g.id, 'failed', 'saída', 'sig');
    const done = repo.get(g.id)!;
    expect(done).toMatchObject({
      sha: 'abc123',
      result: 'failed',
      outputTail: 'saída',
      signature: 'sig',
      targetColumnId: null,
      kind: 'review',
    });
    expect(done.finishedAt).toBeGreaterThan(0);
    expect(repo.runningFor('c1')).toBeNull();
  });

  it('listFor traz as execuções do card em ordem de início', () => {
    const a = repo.start({ cardId: 'c1', columnId: 'col', targetColumnId: 'd', kind: 'move' });
    repo.finish(a.id, 'passed', '');
    const b = repo.start({ cardId: 'c1', columnId: 'col', targetColumnId: 'd', kind: 'move' });
    repo.start({ cardId: 'c2', columnId: 'col', targetColumnId: 'd', kind: 'move' });
    expect(repo.listFor('c1').map((g) => g.id)).toEqual([a.id, b.id]);
  });

  it('interruptAllRunning marca como interrupted só o que estava rodando', () => {
    const a = repo.start({ cardId: 'c1', columnId: 'col', targetColumnId: 'd', kind: 'move' });
    const b = repo.start({ cardId: 'c2', columnId: 'col', targetColumnId: 'd', kind: 'move' });
    repo.finish(b.id, 'passed', '');
    const hit = repo.interruptAllRunning();
    expect(hit.map((g) => g.id)).toEqual([a.id]);
    expect(hit[0]).toMatchObject({ result: 'interrupted' });
    expect(hit[0]!.finishedAt).not.toBeNull();
    expect(repo.get(b.id)!.result).toBe('passed');
    expect(repo.interruptAllRunning()).toEqual([]);
  });

  it('o CHECK recusa kind e result fora da lista', () => {
    const insert = (kind: string, result: string) =>
      db.run('INSERT INTO gate_runs (id, card_id, column_id, kind, result, started_at) VALUES (?, ?, ?, ?, ?, 1)', [
        'x' + kind + result,
        'c',
        'col',
        kind,
        result,
      ]);
    expect(() => insert('outro', 'running')).toThrow();
    expect(() => insert('move', 'talvez')).toThrow();
    expect(() => insert('review', 'passed')).not.toThrow();
  });
});

describe('apagar o card', () => {
  it('deletePermanent leva os gate_runs do card e da sub-tarefa, e só deles', () => {
    db.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'P')");
    db.run("INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'H', 0, 'parent')");
    db.run("INSERT INTO columns (id, workflow_id, name, position) VALUES ('col', 'w', 'Revisão', 0)");
    db.run("INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t', 'b', 'História', '#000000', 'w')");
    for (const [id, parent, n] of [
      ['c1', null, 1],
      ['c1a', 'c1', 2],
      ['c2', null, 3],
    ] as const)
      db.run(
        'INSERT INTO cards (id, board_id, number, workflow_id, column_id, type_id, parent_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1)',
        [id, 'b', n, 'w', 'col', 't', parent, id],
      );
    for (const id of ['c1', 'c1a', 'c2']) repo.start({ cardId: id, columnId: 'col', targetColumnId: null, kind: 'review' });

    new CardRepo(db).deletePermanent('c1');

    expect(repo.listFor('c1')).toEqual([]);
    expect(repo.listFor('c1a')).toEqual([]);
    expect(repo.listFor('c2')).toHaveLength(1);
  });
});

describe('migração 54: gate_runs (#1253)', () => {
  it('sobe da 53 criando a tabela vazia e volta tirando-a, sem perder o resto', () => {
    const old = new (db.constructor as new () => Database)();
    migrate(old, 53);
    old.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    const has = () => old.exec("SELECT COUNT(*) FROM sqlite_master WHERE name = 'gate_runs'")[0]!.values[0]![0];
    expect(has()).toBe(0);

    migrate(old);

    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(54);
    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(has()).toBe(1);
    expect(old.exec('SELECT COUNT(*) FROM gate_runs')[0]!.values[0]![0]).toBe(0);

    expect(DOWN_MIGRATIONS[54]).toBeDefined();
    migrateDown(old, 53);
    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe('53');
    expect(has()).toBe(0);
    expect(old.exec("SELECT name FROM boards WHERE id = 'b'")[0]!.values).toEqual([['Projeto']]);
  });
});
