import type { Database } from 'sql.js';

export const SCHEMA_VERSION = 23;

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
  17: `
    -- pull request da história
    ALTER TABLE cards ADD COLUMN pr_url TEXT NOT NULL DEFAULT '';
  `,
  18: `
    -- perfis de execução: o que a sessão de IA recebe para trabalhar num card
    ALTER TABLE boards ADD COLUMN exec_profiles_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE columns ADD COLUMN exec_profile TEXT;
    ALTER TABLE cards ADD COLUMN exec_profile TEXT;
  `,
  19: `
    -- vínculos entre cards: pai/filho (de é pai de para) e relativo
    CREATE TABLE IF NOT EXISTS card_links (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      UNIQUE (from_id, to_id)
    );
  `,
  20: `
    -- modo autônomo (YOLO) da história: a IA segue sem pedir aprovação nem confirmação
    ALTER TABLE cards ADD COLUMN yolo INTEGER NOT NULL DEFAULT 0;
  `,
  21: `
    -- branch de onde a branch da história partiu, quando não é a principal (histórias empilhadas do modo autônomo)
    ALTER TABLE cards ADD COLUMN base_branch TEXT NOT NULL DEFAULT '';
  `,
  22: `
    -- log de utilização: eventos do card e execuções de IA. board_id em cascata (reset_board apaga o
    -- log junto, de graça); card_id sem FK, com número/título/tipo/workflow denormalizados (o
    -- histórico sobrevive ao card apagado).
    CREATE TABLE IF NOT EXISTS card_events (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      month TEXT NOT NULL,              -- 'YYYY-MM' no fuso da máquina
      kind TEXT NOT NULL,
      card_id TEXT,                     -- sem FK: o evento sobrevive ao card
      card_number INTEGER NOT NULL,
      card_title TEXT NOT NULL,         -- cortado em 120 caracteres
      card_type TEXT NOT NULL,
      workflow TEXT NOT NULL,
      column_name TEXT NOT NULL DEFAULT '',  -- a coluna (fase) em que o card estava
      from_value TEXT NOT NULL DEFAULT '',
      to_value TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',  -- nome do campo, do arquivo, '#n' do outro card, URL do PR
      author TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('human','ai')),
      run_id TEXT                        -- a execução de IA que produziu o evento, quando houver
    );
    CREATE INDEX IF NOT EXISTS idx_card_events_month ON card_events(board_id, month, at);
    CREATE INDEX IF NOT EXISTS idx_card_events_card ON card_events(board_id, card_number, at);

    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_ms INTEGER,               -- NULL enquanto roda e quando o desfecho é 'unknown'
      month TEXT NOT NULL,
      outcome TEXT,                      -- NULL = em andamento
      exit_code INTEGER,
      origin TEXT NOT NULL CHECK (origin IN ('manual','heartbeat','autopilot','chat')),
      -- contexto no momento da chamada (RF-14): congelado, não segue o card
      card_id TEXT,
      card_number INTEGER,
      card_title TEXT NOT NULL DEFAULT '',
      card_type TEXT NOT NULL DEFAULT '',
      workflow TEXT NOT NULL DEFAULT '',
      column_name TEXT NOT NULL DEFAULT '',
      phase TEXT NOT NULL DEFAULT '',    -- nome da fase; hoje igual à coluna, guardado à parte de propósito
      -- configuração (RF-15): NULL = não definido, '' = definido e vazio
      tool TEXT NOT NULL,
      model TEXT, effort TEXT, profile TEXT, agent TEXT,
      permission TEXT NOT NULL,
      autonomous INTEGER NOT NULL DEFAULT 0,
      clean INTEGER NOT NULL DEFAULT 0,
      skills_json TEXT NOT NULL DEFAULT '[]',
      mcp_json TEXT,                     -- NULL = sem restrição de servidores MCP
      -- consumo: sempre NULL nesta entrega; #70 passa a preencher (RF-19)
      input_tokens INTEGER, output_tokens INTEGER,
      cache_read_tokens INTEGER, cache_write_tokens INTEGER,
      cost_usd REAL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_runs_month ON ai_runs(board_id, month, started_at);
    CREATE INDEX IF NOT EXISTS idx_ai_runs_card ON ai_runs(board_id, card_number, started_at);
    CREATE INDEX IF NOT EXISTS idx_ai_runs_open ON ai_runs(board_id, outcome);

    -- inventário agregado da execução; fica vazio até #70
    CREATE TABLE IF NOT EXISTS ai_run_usage (
      run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('tool','mcp_tool','agent','skill')),
      name TEXT NOT NULL,
      calls INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (run_id, kind, name)
    );

    -- totais por mês: o arquivo do detalhe descartado. Nunca expira (RF-21)
    CREATE TABLE IF NOT EXISTS log_months (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      metric TEXT NOT NULL,   -- 'events' | 'runs' | 'cards_done'
      dim TEXT NOT NULL,      -- '' (total) | 'kind' | 'outcome' | 'phase' | 'card_type' | 'model' | 'tool' | 'effort' | 'profile'
      value TEXT NOT NULL,    -- o valor da dimensão ('' quando dim = '')
      n INTEGER NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,   -- soma na unidade da métrica (ms para 'runs')
      PRIMARY KEY (board_id, month, metric, dim, value)
    );

    ALTER TABLE boards ADD COLUMN log_since INTEGER NOT NULL DEFAULT 0;      -- início da série (RF-24)
    ALTER TABLE boards ADD COLUMN log_rollup_day TEXT NOT NULL DEFAULT '';   -- 'YYYY-MM-DD' da última consolidação
  `,
  23: `
    -- commit do merge do pull request da história: insumo para detectar a versão publicada
    ALTER TABLE cards ADD COLUMN merge_commit TEXT NOT NULL DEFAULT '';
  `,
};

/** Aplica as migrações pendentes até `upTo` (por padrão, a versão atual). */
export function migrate(db: Database, upTo = SCHEMA_VERSION): void {
  db.run('PRAGMA foreign_keys = ON;');
  db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const res = db.exec("SELECT value FROM meta WHERE key = 'schema_version'");
  let current = res[0]?.values[0]?.[0] ? Number(res[0].values[0][0]) : 0;
  while (current < upTo) {
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
