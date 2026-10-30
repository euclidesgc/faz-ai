import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { ReviewRoundRepo } from '../src/extension/repositories/reviewRoundRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

const input = (over: Record<string, unknown> = {}) => ({
  storyId: 's1',
  subtaskId: 't1',
  round: 1,
  verdict: 'REPROVADO' as const,
  headSha: 'abc',
  implementerModel: 'claude:sonnet@medium',
  reviewerModel: 'codex:gpt@high',
  independence: 'independente',
  findings: [{ id: 'A1', severity: 'bloqueia' as const, where: 'a.ts:1', text: 'x' }],
  unchecked: ['suíte'],
  ...over,
});

describe('ReviewRoundRepo', () => {
  let db: Database;
  let repo: ReviewRoundRepo;
  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    repo = new ReviewRoundRepo(db);
  });

  it('create grava e lastForStory/listForStory leem, com JSON de volta', () => {
    const a = repo.create(input());
    const b = repo.create(input({ subtaskId: 't2', round: 2, verdict: 'APROVADO', findings: [], unchecked: [] }));
    expect(a.id).toBeTruthy();
    expect(repo.lastForStory('s1')).toEqual(b);
    expect(repo.listForStory('s1')).toEqual([a, b]);
    expect(repo.listForStory('s1')[0]!.findings[0]!.id).toBe('A1');
    expect(repo.lastForStory('nada')).toBeNull();
  });

  it('UNIQUE por sub-tarefa e por (história, rodada); veredito fora da lista é recusado', () => {
    repo.create(input());
    expect(() => repo.create(input({ round: 2 }))).toThrow();
    expect(() => repo.create(input({ subtaskId: 't2' }))).toThrow();
    expect(() => repo.create(input({ subtaskId: 't3', round: 3, verdict: 'TALVEZ' }))).toThrow();
    expect(() => repo.create(input({ storyId: 's2' }))).toThrow();
    expect(() => repo.create(input({ storyId: 's2', subtaskId: 't9' }))).not.toThrow();
  });

  it('deleteForStory limpa só a história', () => {
    repo.create(input());
    repo.create(input({ storyId: 's2', subtaskId: 't2' }));
    repo.deleteForStory('s1');
    expect(repo.listForStory('s1')).toEqual([]);
    expect(repo.listForStory('s2')).toHaveLength(1);
  });

  it('deletePermanent da história apaga as rodadas dela e da sub-tarefa, e só delas', () => {
    const boards = new BoardRepo(db);
    const cards = new CardRepo(db);
    const boardId = boards.getOrCreate('ws', 'Projeto').id;
    const snap = boards.snapshot(boardId);
    const col = snap.columns[0]!;
    const type = snap.cardTypes.find((t) => t.name === 'História')!;
    const id = cards.create(boardId, { typeId: type.id, columnId: col.id, parentId: null, title: 'H' });
    repo.create(input({ storyId: id, subtaskId: 'sub-x' }));
    repo.create(input({ storyId: 'outra', subtaskId: 'sub-y' }));
    cards.deletePermanent(id);
    expect(repo.listForStory(id)).toEqual([]);
    expect(repo.listForStory('outra')).toHaveLength(1);
  });
});

describe('migração → review_rounds', () => {
  it('cria a tabela vazia, preserva os dados antigos e desce removendo-a', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const old = new SQL.Database();
    migrate(old, SCHEMA_VERSION - 1);
    old.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    const has = () => old.exec("SELECT COUNT(*) FROM sqlite_master WHERE name = 'review_rounds'")[0]!.values[0]![0];
    expect(has()).toBe(0);

    migrate(old);

    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(has()).toBe(1);
    expect(old.exec('SELECT COUNT(*) FROM review_rounds')[0]!.values[0]![0]).toBe(0);
    expect(old.exec('SELECT name FROM boards')[0]!.values).toEqual([['Projeto']]);

    expect(DOWN_MIGRATIONS[SCHEMA_VERSION]).toBeDefined();
    migrateDown(old, SCHEMA_VERSION - 1);
    expect(has()).toBe(0);
    expect(old.exec('SELECT name FROM boards')[0]!.values).toEqual([['Projeto']]);
  });
});
