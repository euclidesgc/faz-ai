import type { Database } from 'sql.js';

export const SCHEMA_VERSION = 7;

/** Campo padrão "Modelo": qual modelo de IA deve executar o card. As opções são editáveis nas configurações. */
/** Campo padrão "Skills": skills do projeto que devem ser carregadas obrigatoriamente ao executar o card. */
export const SKILLS_FIELD = 'Skills';
export const MODEL_FIELD = { name: 'Modelo', options: ['Claude Fable 5.1', 'Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 4.5'] };

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      workspace_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('parent','child'))
    );

    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_terminal INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS card_types (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      default_workflow_id TEXT NOT NULL REFERENCES workflows(id)
    );

    CREATE TABLE IF NOT EXISTS cards (
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
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id, position);
    CREATE INDEX IF NOT EXISTS idx_cards_parent ON cards(parent_id);

    CREATE TABLE IF NOT EXISTS field_defs (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',
      applies_to_types_json TEXT,
      display TEXT NOT NULL DEFAULT 'inline',
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS field_values (
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      field_id TEXT NOT NULL REFERENCES field_defs(id) ON DELETE CASCADE,
      value_json TEXT NOT NULL,
      PRIMARY KEY (card_id, field_id)
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );
  `,
  2: `
    ALTER TABLE cards ADD COLUMN deleted_at INTEGER;
    ALTER TABLE cards ADD COLUMN archived_at INTEGER;

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id, created_at);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_card ON attachments(card_id);
  `,
  3: `
    ALTER TABLE columns ADD COLUMN category TEXT NOT NULL DEFAULT 'open';
    UPDATE columns SET category = 'done' WHERE is_terminal = 1;
    UPDATE columns SET category = 'cancelled' WHERE is_terminal = 1 AND lower(name) LIKE 'cancel%';
  `,
  4: `
    ALTER TABLE boards ADD COLUMN rules_json TEXT NOT NULL DEFAULT '{}';
  `,
  5: `
    ALTER TABLE cards ADD COLUMN number INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE boards ADD COLUMN next_card_number INTEGER NOT NULL DEFAULT 1;
    UPDATE cards SET number = (
      SELECT COUNT(*) FROM cards c2
      WHERE c2.board_id = cards.board_id
        AND (c2.created_at < cards.created_at OR (c2.created_at = cards.created_at AND c2.rowid <= cards.rowid))
    );
    UPDATE boards SET next_card_number = (SELECT COALESCE(MAX(number), 0) + 1 FROM cards WHERE board_id = boards.id);
    CREATE INDEX IF NOT EXISTS idx_cards_number ON cards(board_id, number);
  `,
  6: `
    INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position)
    SELECT lower(hex(randomblob(16))), b.id, '${MODEL_FIELD.name}', 'select', '${JSON.stringify(MODEL_FIELD.options)}', NULL, 'badge',
           (SELECT COALESCE(MAX(position), -1) + 1 FROM field_defs f WHERE f.board_id = b.id)
    FROM boards b
    WHERE NOT EXISTS (SELECT 1 FROM field_defs f WHERE f.board_id = b.id AND lower(f.name) = 'modelo');
  `,
  7: `
    ALTER TABLE card_types ADD COLUMN defaults_json TEXT NOT NULL DEFAULT '{}';
    INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position)
    SELECT lower(hex(randomblob(16))), b.id, '${SKILLS_FIELD}', 'multiselect', '[]', NULL, 'chip',
           (SELECT COALESCE(MAX(position), -1) + 1 FROM field_defs f WHERE f.board_id = b.id)
    FROM boards b
    WHERE NOT EXISTS (SELECT 1 FROM field_defs f WHERE f.board_id = b.id AND lower(f.name) = 'skills');
  `,
};

export function migrate(db: Database): void {
  db.run('PRAGMA foreign_keys = ON;');
  db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const res = db.exec("SELECT value FROM meta WHERE key = 'schema_version'");
  let current = res[0]?.values[0]?.[0] ? Number(res[0].values[0][0]) : 0;
  while (current < SCHEMA_VERSION) {
    const next = current + 1;
    const sql = MIGRATIONS[next];
    if (!sql) throw new Error(`Migration ${next} não encontrada`);
    db.exec('BEGIN;');
    try {
      db.exec(sql);
      db.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)", [String(next)]);
      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
    current = next;
  }
}
