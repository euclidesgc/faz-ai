import type { Database } from 'sql.js';

export const SCHEMA_VERSION = 16;

/** Campo padrão "Modelo": qual modelo de IA deve executar o card. As opções são editáveis nas configurações. */
/** Campo padrão "Skills": skills do projeto que devem ser carregadas obrigatoriamente ao executar o card. */
export const SKILLS_FIELD = 'Skills';
export const MODEL_FIELD = 'Modelo';

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
    SELECT lower(hex(randomblob(16))), b.id, '${MODEL_FIELD}', 'select', '[]', NULL, 'badge',
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
  8: `
    ALTER TABLE boards ADD COLUMN ai_tools_json TEXT NOT NULL DEFAULT '["claude","codex","cursor","kimi"]';
  `,
  9: `
    ALTER TABLE boards ADD COLUMN model_catalog_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE boards ADD COLUMN model_rules_json TEXT NOT NULL DEFAULT '[]';
    -- o campo Modelo vira do tipo "modelo" (modelo + esforço, vindos do catálogo); os valores antigos eram só rótulos
    DELETE FROM field_values WHERE field_id IN (SELECT id FROM field_defs WHERE lower(name) = 'modelo' AND kind = 'select');
    UPDATE card_types SET defaults_json = '{}' WHERE defaults_json != '{}';
    UPDATE field_defs SET kind = 'model', options_json = '[]' WHERE lower(name) = 'modelo' AND kind = 'select';
    INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position)
    SELECT lower(hex(randomblob(16))), b.id, 'Esforço', 'select', '["Baixo","Médio","Alto"]', NULL, 'badge',
           (SELECT COALESCE(MAX(position), -1) + 1 FROM field_defs f WHERE f.board_id = b.id)
    FROM boards b
    WHERE NOT EXISTS (SELECT 1 FROM field_defs f WHERE f.board_id = b.id AND lower(f.name) = 'esforço');
  `,
  10: `
    ALTER TABLE columns ADD COLUMN collapsed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE workflows ADD COLUMN collapsed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE workflows ADD COLUMN archive_collapsed INTEGER NOT NULL DEFAULT 1;
  `,
  11: `
    ALTER TABLE boards ADD COLUMN appearance_json TEXT NOT NULL DEFAULT '{}';
    -- "Esforço" vira "Esforço da atividade" e passa a vir logo antes do campo de modelo
    UPDATE field_defs SET name = 'Esforço da atividade' WHERE lower(name) = 'esforço';
    UPDATE field_defs SET position = position * 2;
    UPDATE field_defs SET position = (
      SELECT MIN(m.position) - 1 FROM field_defs m WHERE m.board_id = field_defs.board_id AND m.kind = 'model'
    ) WHERE name = 'Esforço da atividade' AND EXISTS (SELECT 1 FROM field_defs m WHERE m.board_id = field_defs.board_id AND m.kind = 'model');
  `,
  12: `
    -- status de trabalho do card (com quem está a pendência) e o papel da IA em cada coluna
    ALTER TABLE cards ADD COLUMN status TEXT;
    ALTER TABLE cards ADD COLUMN status_reason TEXT NOT NULL DEFAULT '';
    ALTER TABLE cards ADD COLUMN status_at INTEGER;
    ALTER TABLE cards ADD COLUMN status_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE columns ADD COLUMN ai_active INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE columns ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0;
    -- versão do board padrão aplicada; boards anteriores ficam em 0 e são atualizados com confirmação
    ALTER TABLE boards ADD COLUMN template_version INTEGER NOT NULL DEFAULT 0;
  `,
  13: `
    -- cada coluna é uma fase: o que a IA faz nela e o documento (artefato) que a fase produz
    ALTER TABLE columns ADD COLUMN ai_instruction TEXT NOT NULL DEFAULT '';
    ALTER TABLE columns ADD COLUMN artifact_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE columns ADD COLUMN artifact_template TEXT NOT NULL DEFAULT '';
    -- anexo que é o artefato de uma fase; fica sempre no card da história
    ALTER TABLE attachments ADD COLUMN artifact INTEGER NOT NULL DEFAULT 0;
  `,
  14: `
    -- quem escreveu a mensagem na conversa: 'human' ou 'ai'; mensagens antigas ficam sem origem
    ALTER TABLE comments ADD COLUMN source TEXT;
  `,
  15: `
    -- como a extensão executa a IA para um card (permissões, tempo limite)
    ALTER TABLE boards ADD COLUMN runner_json TEXT NOT NULL DEFAULT '{}';
  `,
  16: `
    -- branch e pasta de trabalho (worktree) de cada história
    ALTER TABLE boards ADD COLUMN git_json TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE cards ADD COLUMN branch TEXT NOT NULL DEFAULT '';
    ALTER TABLE cards ADD COLUMN worktree_path TEXT NOT NULL DEFAULT '';
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
