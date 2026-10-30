import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { EscalationRepo } from '../src/extension/repositories/escalationRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

const input = (over: Record<string, unknown> = {}) => ({
  cardId: 'c1',
  columnId: 'col1',
  gateRunId: 'g1',
  check: 'lint',
  fromModel: 'claude:sonnet@low',
  toModel: 'claude:sonnet@medium',
  targetCardId: null,
  status: 'pending' as const,
  ...over,
});

describe('EscalationRepo', () => {
  let db: Database;
  let repo: EscalationRepo;
  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    repo = new EscalationRepo(db);
  });

  it('record grava e forUnit lê', () => {
    const e = repo.record(input());
    expect(e).toMatchObject({ cardId: 'c1', check: 'lint', status: 'pending', targetCardId: null, appliedAt: null });
    expect(repo.forUnit('c1', 'col1')).toEqual(e);
    expect(repo.forUnit('c1', 'outra')).toBeUndefined();
  });

  it('record applied já traz appliedAt', () => {
    const e = repo.record(input({ status: 'applied', targetCardId: 'c1' }));
    expect(e.appliedAt).not.toBeNull();
  });

  it('UNIQUE (card, coluna): o segundo record lança', () => {
    repo.record(input());
    expect(() => repo.record(input({ gateRunId: 'g2' }))).toThrow();
    expect(() => repo.record(input({ columnId: 'col2' }))).not.toThrow();
  });

  it('pendingFor devolve só a pendente; markApplied a consome', () => {
    const e = repo.record(input());
    repo.record(input({ columnId: 'col2', status: 'applied', targetCardId: 'x' }));
    expect(repo.pendingFor('c1')?.id).toBe(e.id);
    repo.markApplied(e.id, 'sub1');
    expect(repo.pendingFor('c1')).toBeUndefined();
    expect(repo.forUnit('c1', 'col1')).toMatchObject({ status: 'applied', targetCardId: 'sub1' });
  });

  it('deleteForCard limpa o card e preserva os outros', () => {
    repo.record(input());
    repo.record(input({ cardId: 'c2' }));
    repo.deleteForCard('c1');
    expect(repo.forUnit('c1', 'col1')).toBeUndefined();
    expect(repo.forUnit('c2', 'col1')).toBeDefined();
  });

  it('deletePermanent do card apaga as subidas dele e das sub-tarefas', () => {
    const boards = new BoardRepo(db);
    const cards = new CardRepo(db);
    const boardId = boards.getOrCreate('ws', 'Projeto').id;
    const snap = boards.snapshot(boardId);
    const col = snap.columns[0]!;
    const type = snap.cardTypes.find((t) => t.name === 'História')!;
    const id = cards.create(boardId, { typeId: type.id, columnId: col.id, parentId: null, title: 'H' });
    repo.record(input({ cardId: id }));
    repo.record(input({ cardId: 'outro' }));
    cards.deletePermanent(id);
    expect(repo.forUnit(id, 'col1')).toBeUndefined();
    expect(repo.forUnit('outro', 'col1')).toBeDefined();
  });

  it('modelLadders lê o meta model_ladders', () => {
    const boards = new BoardRepo(db);
    const b = boards.getOrCreate('ws', 'Projeto');
    expect(boards.modelLadders(b.id)).toEqual({});
    boards.setMeta('model_ladders', '{"claude":["a","b"]}');
    expect(boards.modelLadders(b.id)).toEqual({ claude: ['a', 'b'] });
  });
});

describe('migração → model_escalations', () => {
  it('cria a tabela vazia, preserva os dados antigos e desce removendo-a', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const old = new SQL.Database();
    migrate(old, SCHEMA_VERSION - 1);
    old.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    const has = () => old.exec("SELECT COUNT(*) FROM sqlite_master WHERE name = 'model_escalations'")[0]!.values[0]![0];
    expect(has()).toBe(0);

    migrate(old);

    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(has()).toBe(1);
    expect(old.exec('SELECT COUNT(*) FROM model_escalations')[0]!.values[0]![0]).toBe(0);
    expect(old.exec('SELECT name FROM boards')[0]!.values).toEqual([['Projeto']]);

    expect(DOWN_MIGRATIONS[SCHEMA_VERSION]).toBeDefined();
    migrateDown(old, SCHEMA_VERSION - 1);
    expect(has()).toBe(0);
    expect(old.exec('SELECT name FROM boards')[0]!.values).toEqual([['Projeto']]);
  });
});
