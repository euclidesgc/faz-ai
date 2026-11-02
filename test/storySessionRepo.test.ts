import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { DOWN_MIGRATIONS, migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { StorySessionRepo } from '../src/extension/repositories/storySessionRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('StorySessionRepo', () => {
  let repo: StorySessionRepo;
  let storyId: string;
  let boardId: string;

  beforeEach(async () => {
    const db = await openInMemory(WASM_DIR);
    const boards = new BoardRepo(db);
    boardId = boards.getOrCreate('ws', 'Projeto').id;
    const snapshot = boards.snapshot(boardId);
    storyId = new CardRepo(db).create(boardId, {
      typeId: snapshot.cardTypes.find((type) => type.name === 'História')!.id,
      columnId: snapshot.columns[0]!.id,
      parentId: null,
      title: 'História',
    });
    repo = new StorySessionRepo(db);
  });

  it('persiste gerações separadas da sessão e atualiza checkpoint/native id', () => {
    const first = repo.createSession({
      boardId,
      storyId,
      generation: 1,
      executor: 'claude',
      transport: 'acp',
      nativeSessionId: null,
      configFingerprint: 'fp1',
      workspace: '/repo',
    });
    expect(first.status).toBe('opening');
    expect(repo.updateSession(first.id, { nativeSessionId: 'native-main', status: 'active', checkpoint: { cursor: 'c1' } })).toMatchObject({
      nativeSessionId: 'native-main',
      status: 'active',
      checkpoint: { cursor: 'c1' },
    });
    repo.updateSession(first.id, { status: 'lost' });
    const second = repo.createSession({
      boardId,
      storyId,
      generation: 2,
      executor: 'claude',
      transport: 'acp',
      nativeSessionId: 'recovered',
      configFingerprint: 'fp1',
      workspace: '/repo',
      status: 'active',
    });
    expect(repo.latestForStory(storyId)).toEqual(second);
    expect(() =>
      repo.createSession({
        boardId,
        storyId,
        generation: 2,
        executor: 'claude',
        transport: 'acp',
        nativeSessionId: null,
        configFingerprint: 'fp1',
        workspace: '/repo',
      }),
    ).toThrow();
  });

  it('grava intenção antes do vínculo e retorna a mesma identidade na reconciliação', () => {
    const s = repo.createSession({
      boardId,
      storyId,
      generation: 1,
      executor: 'codex',
      transport: 'acp',
      nativeSessionId: 'main',
      configFingerprint: 'main-fp',
      workspace: '/repo',
      status: 'active',
    });
    const intent = repo.createIntent({
      sessionId: s.id,
      workId: 'work-1',
      attempt: 1,
      intentKey: 'task-1-attempt-1',
      config: { model: 'codex:gpt@high' },
      snapshot: { files: ['plan.md'] },
    });
    expect(repo.intentByKey(s.id, intent.intentKey)).toEqual(intent);
    expect(repo.listChildren(s.id)).toEqual([{ intent, child: null }]);
    repo.updateIntent(intent.id, 'reconciling');
    const linked = repo.linkChild({ intentId: intent.id, nativeSessionId: 'child-1', executor: 'codex', transport: 'acp' });
    expect(linked.status).toBe('active');
    expect(repo.listChildren(s.id)[0]).toMatchObject({ intent: { status: 'linked' }, child: linked });
    expect(repo.updateChild(intent.id, 'completed', { summary: 'feito' })).toMatchObject({
      status: 'completed',
      result: { summary: 'feito' },
    });
    expect(repo.getIntent(intent.id)).toMatchObject({ status: 'completed', result: { summary: 'feito' } });
  });
});

describe('migração 61: sessões de História', () => {
  it('cria as tabelas e desfaz só as novas tabelas', async () => {
    const SQL = await initSqlJs({ locateFile: (file: string) => path.join(WASM_DIR, file) });
    const db = new SQL.Database();
    migrate(db, 60);
    migrate(db);
    expect(SCHEMA_VERSION).toBe(61);
    expect(db.exec("SELECT value FROM meta WHERE key='schema_version'")[0]!.values[0]![0]).toBe('61');
    for (const table of ['story_sessions', 'story_session_intents', 'story_session_children'])
      expect(db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`)[0]!.values).toEqual([[table]]);
    expect(DOWN_MIGRATIONS[61]).toBeDefined();
    migrateDown(db, 60);
    expect(db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='story_sessions'")).toHaveLength(0);
  });
});
