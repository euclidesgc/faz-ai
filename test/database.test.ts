import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';
import initSqlJs from 'sql.js';
import { openFile } from '../src/extension/db/database';
import { migrate, SCHEMA_VERSION } from '../src/extension/db/schema';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

/** Esquema de um board na versão 21 (antes do log de utilização), para testar a migração 22. */
const SCHEMA_V21 = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    workspace_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    rules_json TEXT NOT NULL DEFAULT '{}',
    next_card_number INTEGER NOT NULL DEFAULT 1,
    ai_tools_json TEXT NOT NULL DEFAULT '["claude","codex","cursor","kimi"]',
    model_catalog_json TEXT NOT NULL DEFAULT '[]',
    model_rules_json TEXT NOT NULL DEFAULT '[]',
    appearance_json TEXT NOT NULL DEFAULT '{}',
    template_version INTEGER NOT NULL DEFAULT 0,
    runner_json TEXT NOT NULL DEFAULT '{}',
    git_json TEXT NOT NULL DEFAULT '{}',
    exec_profiles_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('parent','child')),
    collapsed INTEGER NOT NULL DEFAULT 0,
    archive_collapsed INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE columns (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    is_terminal INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'open',
    collapsed INTEGER NOT NULL DEFAULT 0,
    ai_active INTEGER NOT NULL DEFAULT 0,
    requires_approval INTEGER NOT NULL DEFAULT 0,
    ai_instruction TEXT NOT NULL DEFAULT '',
    artifact_name TEXT NOT NULL DEFAULT '',
    artifact_template TEXT NOT NULL DEFAULT '',
    exec_profile TEXT
  );

  CREATE TABLE card_types (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    default_workflow_id TEXT NOT NULL REFERENCES workflows(id),
    defaults_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    column_id TEXT NOT NULL REFERENCES columns(id),
    type_id TEXT NOT NULL REFERENCES card_types(id),
    parent_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    archived_at INTEGER,
    number INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    status_reason TEXT NOT NULL DEFAULT '',
    status_at INTEGER,
    status_by TEXT NOT NULL DEFAULT '',
    branch TEXT NOT NULL DEFAULT '',
    worktree_path TEXT NOT NULL DEFAULT '',
    pr_url TEXT NOT NULL DEFAULT '',
    exec_profile TEXT,
    yolo INTEGER NOT NULL DEFAULT 0,
    base_branch TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_cards_column ON cards(column_id, position);
  CREATE INDEX idx_cards_parent ON cards(parent_id);
  CREATE INDEX idx_cards_number ON cards(board_id, number);

  CREATE TABLE field_defs (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    options_json TEXT NOT NULL DEFAULT '[]',
    applies_to_types_json TEXT,
    display TEXT NOT NULL DEFAULT 'inline',
    position INTEGER NOT NULL
  );

  CREATE TABLE field_values (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL REFERENCES field_defs(id) ON DELETE CASCADE,
    value_json TEXT NOT NULL,
    PRIMARY KEY (card_id, field_id)
  );

  CREATE TABLE checklist_items (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL
  );

  CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    source TEXT
  );
  CREATE INDEX idx_comments_card ON comments(card_id, created_at);

  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    artifact INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_attachments_card ON attachments(card_id);

  CREATE TABLE card_links (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    UNIQUE (from_id, to_id)
  );
`;

describe('migração 21 → 22 (log de utilização)', () => {
  it('sobe um board v21 com cards e comentários sem perder dado, e cria o log vazio', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const old = new SQL.Database();
    old.run(SCHEMA_V21);
    old.run(`
      INSERT INTO meta VALUES ('schema_version', '21');
      INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto');
      INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent');
      INSERT INTO columns (id, workflow_id, name, position) VALUES ('c', 'w', 'Backlog', 0);
      INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t', 'b', 'História', '#fff', 'w');
      INSERT INTO cards (id, board_id, workflow_id, column_id, type_id, parent_id, title, position, created_at, updated_at, number)
        VALUES ('k1', 'b', 'w', 'c', 't', NULL, 'Primeiro card', 0, 1, 1, 1);
      INSERT INTO cards (id, board_id, workflow_id, column_id, type_id, parent_id, title, position, created_at, updated_at, number)
        VALUES ('k2', 'b', 'w', 'c', 't', NULL, 'Segundo card', 1, 2, 2, 2);
      INSERT INTO comments (id, card_id, author, body, created_at, updated_at) VALUES ('m1', 'k1', 'Pessoa', 'Um comentário', 3, 3);
    `);

    migrate(old);

    // versão e dados existentes preservados (migrate() sempre sobe até a versão atual: pode passar de 22)
    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(old.exec('SELECT id, title FROM cards ORDER BY id')[0]!.values).toEqual([
      ['k1', 'Primeiro card'],
      ['k2', 'Segundo card'],
    ]);
    expect(old.exec('SELECT id, body FROM comments')[0]!.values).toEqual([['m1', 'Um comentário']]);

    // as quatro tabelas do log existem, vazias
    for (const table of ['card_events', 'ai_runs', 'ai_run_usage', 'log_months']) {
      expect(old.exec(`SELECT COUNT(*) FROM ${table}`)[0]!.values[0]![0]).toBe(0);
    }

    // as duas colunas novas em boards, com o padrão
    const [logSince, logRollupDay] = old.exec("SELECT log_since, log_rollup_day FROM boards WHERE id = 'b'")[0]!.values[0]!;
    expect(logSince).toBe(0);
    expect(logRollupDay).toBe('');
  });
});

/** Esquema de um board na versão 22 (log de utilização, sem merge_commit), para testar a migração 23. */
const SCHEMA_V22 = SCHEMA_V21.replace(
  'exec_profiles_json TEXT NOT NULL DEFAULT \'[]\'\n  );',
  `exec_profiles_json TEXT NOT NULL DEFAULT '[]',
    log_since INTEGER NOT NULL DEFAULT 0,
    log_rollup_day TEXT NOT NULL DEFAULT ''
  );`,
).concat(`
  CREATE TABLE card_events (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    month TEXT NOT NULL,
    kind TEXT NOT NULL,
    card_id TEXT,
    card_number INTEGER NOT NULL,
    card_title TEXT NOT NULL,
    card_type TEXT NOT NULL,
    workflow TEXT NOT NULL,
    column_name TEXT NOT NULL DEFAULT '',
    from_value TEXT NOT NULL DEFAULT '',
    to_value TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('human','ai')),
    run_id TEXT
  );

  CREATE TABLE ai_runs (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_ms INTEGER,
    month TEXT NOT NULL,
    outcome TEXT,
    exit_code INTEGER,
    origin TEXT NOT NULL CHECK (origin IN ('manual','heartbeat','autopilot','chat')),
    card_id TEXT,
    card_number INTEGER,
    card_title TEXT NOT NULL DEFAULT '',
    card_type TEXT NOT NULL DEFAULT '',
    workflow TEXT NOT NULL DEFAULT '',
    column_name TEXT NOT NULL DEFAULT '',
    phase TEXT NOT NULL DEFAULT '',
    tool TEXT NOT NULL,
    model TEXT, effort TEXT, profile TEXT, agent TEXT,
    permission TEXT NOT NULL,
    autonomous INTEGER NOT NULL DEFAULT 0,
    clean INTEGER NOT NULL DEFAULT 0,
    skills_json TEXT NOT NULL DEFAULT '[]',
    mcp_json TEXT,
    input_tokens INTEGER, output_tokens INTEGER,
    cache_read_tokens INTEGER, cache_write_tokens INTEGER,
    cost_usd REAL
  );

  CREATE TABLE ai_run_usage (
    run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('tool','mcp_tool','agent','skill')),
    name TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, kind, name)
  );

  CREATE TABLE log_months (
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    metric TEXT NOT NULL,
    dim TEXT NOT NULL,
    value TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (board_id, month, metric, dim, value)
  );
`);

describe('migração 22 → 23 (commit do merge)', () => {
  it('sobe um board v22 com cards sem perder dado, e cria merge_commit vazio', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const old = new SQL.Database();
    old.run(SCHEMA_V22);
    old.run(`
      INSERT INTO meta VALUES ('schema_version', '22');
      INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto');
      INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent');
      INSERT INTO columns (id, workflow_id, name, position) VALUES ('c', 'w', 'Backlog', 0);
      INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t', 'b', 'História', '#fff', 'w');
      INSERT INTO cards (id, board_id, workflow_id, column_id, type_id, parent_id, title, position, created_at, updated_at, number, pr_url)
        VALUES ('k1', 'b', 'w', 'c', 't', NULL, 'Primeiro card', 0, 1, 1, 1, 'https://example.com/pr/1');
    `);

    migrate(old);

    // versão atual e dado existente preservado, sem vão
    expect(old.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    expect(old.exec('SELECT id, pr_url FROM cards')[0]!.values).toEqual([['k1', 'https://example.com/pr/1']]);

    // a coluna nova existe, com o padrão vazio nas linhas já existentes
    const mergeCommit = old.exec("SELECT merge_commit FROM cards WHERE id = 'k1'")[0]!.values[0]![0];
    expect(mergeCommit).toBe('');
  });
});

describe('banco novo', () => {
  it('chega na versão atual do esquema e já tem a coluna merge_commit', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const fresh = new SQL.Database();

    migrate(fresh);

    expect(fresh.exec("SELECT value FROM meta WHERE key = 'schema_version'")[0]!.values[0]![0]).toBe(String(SCHEMA_VERSION));
    const columns = fresh.exec("PRAGMA table_info(cards)")[0]!.values.map((r) => r[1]);
    expect(columns).toContain('merge_commit');
  });
});

describe('persistência em arquivo', () => {
  it('grava, fecha e reabre mantendo os dados', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fazai-'));
    const file = path.join(dir, 'nested', 'fazai.db');

    const h1 = await openFile(file, WASM_DIR, 10);
    const boards = new BoardRepo(h1.db);
    const boardId = boards.getOrCreate('ws', 'P').id;
    const col = boards.snapshot(boardId).columns[0]!;
    const type = boards.snapshot(boardId).cardTypes[0]!;
    new CardRepo(h1.db).create(boardId, { typeId: type.id, columnId: col.id, parentId: null, title: 'persistido' });
    h1.scheduleSave();
    await h1.close();

    const h2 = await openFile(file, WASM_DIR);
    const s = new BoardRepo(h2.db).snapshot(boardId);
    expect(s.cards.map((c) => c.title)).toEqual(['persistido']);
    await h2.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
