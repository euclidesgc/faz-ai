import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { newDatabase, openInMemory } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { EXPORT_TABLES, exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { all, run } from '../src/extension/db/query';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const GONE = ['agent_context_contracts', 'activity_context_selections'];
const tableNames = (db: Database) => all(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r.name));

describe('migração 51: aposentadoria do Plano de contexto', () => {
  it('um board v50 perde as duas tabelas e o índice', async () => {
    (await openInMemory(WASM_DIR)).close();
    const db = newDatabase();
    migrate(db, 50);
    expect(tableNames(db)).toEqual(expect.arrayContaining(GONE));
    run(db, "INSERT INTO boards(id, workspace_key, name) VALUES ('b', 'p', 'B')");
    migrate(db);
    expect(tableNames(db)).not.toEqual(expect.arrayContaining([GONE[0]!]));
    for (const t of GONE) expect(tableNames(db)).not.toContain(t);
    expect(all(db, "SELECT name FROM sqlite_master WHERE name = 'activity_context_target'")).toEqual([]);
    expect(all(db, 'SELECT id FROM boards')).toHaveLength(1);
    db.close();
  });
});

describe('export e import sem o Plano de contexto', () => {
  let dir: string;
  let db: Database;
  let router: MessageRouter;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-ctx-'));
    db = await openInMemory(WASM_DIR);
    router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {}, backup: () => {} } as never, {
      workspaceKey: 'ws-a',
      folderName: 'A',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'attachments'),
      workspaceDir: path.join(dir, 'ws'),
      homeDir: path.join(dir, 'home'),
    });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const doExport = () => exportBoard(db, router.boardId, router.store, { extensionVersion: '0.48.0' }).file;

  it('o export não leva as chaves', () => {
    const f = doExport();
    for (const t of GONE) {
      expect(f.tables[t]).toBeUndefined();
      expect(EXPORT_TABLES.map((x) => x.name)).not.toContain(t);
    }
  });

  it('um backup antigo com as chaves (inclusive inválidas) ainda é importado, ignorando-as', () => {
    const f = doExport();
    f.tables.agent_context_contracts = [
      { artifact_id: 'x', board_id: f.board.id as string, revision: 0, contract_json: '{}', updated_at: 1 },
    ];
    f.tables.activity_context_selections = [{ id: 'y', board_id: f.board.id as string, selection_json: 'lixo' }];
    const text = JSON.stringify(f);
    new BoardRepo(db).deleteBoard(router.boardId).forEach((id) => router.store.removeCard(id));
    const fresh = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {}, backup: () => {} } as never, {
      workspaceKey: 'ws-a',
      folderName: 'A',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'attachments'),
      workspaceDir: path.join(dir, 'ws'),
      homeDir: path.join(dir, 'home'),
    });
    expect(() =>
      importBoard({ db, backup: () => {}, store: fresh.store, workspaceKey: 'ws-a', boardId: fresh.boardId }, parseExportFile(text)),
    ).not.toThrow();
    for (const t of GONE) expect(tableNames(db)).not.toContain(t);
  });
});
