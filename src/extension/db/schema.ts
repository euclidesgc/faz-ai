import type { Database } from 'sql.js';
import { MCPS_FIELD, MODEL_FIELD, RULES_FIELD, SKILLS_FIELD } from '../../shared/boardFields';

export const SCHEMA_VERSION = 58;

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
      -- consumo: #70 passa a preenchê-las (RF-19)
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
      metric TEXT NOT NULL,   -- 'events' | 'runs' | 'cards_done' | 'tokens' | 'cost' | 'usage' (sem CHECK: métrica nova não pede migração)
      dim TEXT NOT NULL,      -- '' (total) | 'kind' | 'workflow' | 'outcome' | 'phase' | 'card_type' | 'model' | 'tool' | 'effort' | 'profile' | 'source' | tipo do inventário
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
  24: `
    -- #70: consumo medido da execução. Antes desta migração as colunas de token/custo existiam e eram
    -- sempre NULL (migração 22); 'measure' é o que distingue "não medido" de "medido e zero".
    ALTER TABLE ai_runs ADD COLUMN turns INTEGER;            -- soma dos turnos dos segmentos; NULL = não medido
    ALTER TABLE ai_runs ADD COLUMN session_id TEXT;          -- id da sessão na CLI, para reabrir
    ALTER TABLE ai_runs ADD COLUMN cost_estimated INTEGER;   -- 1 = calculado pelo preço; 0 = informado; NULL = sem custo
    ALTER TABLE ai_runs ADD COLUMN measure TEXT NOT NULL DEFAULT 'none';  -- 'none' | 'partial' | 'full'
  `,
  25: `
    -- momento em que a branch da história foi criada (#185): stackBaseOf passa a empilhar pela branch
    -- mais recente, não pelo número do card. Histórias já existentes com branch e sem essa data
    -- recebem o próprio updated_at (dado real, sem inventar timestamp); empates são resolvidos em
    -- memória por stackBaseOf, comparando o número do card.
    ALTER TABLE cards ADD COLUMN branch_created_at TEXT NOT NULL DEFAULT '';
    UPDATE cards SET branch_created_at = CAST(updated_at AS TEXT) WHERE branch != '' AND branch_created_at = '';
  `,
  26: `
    -- marcação do harness por board: o que as execuções do board podem usar (rules, skills e agentes),
    -- identificado pelo caminho como o inventário o mostra. O que não está aqui é invisível para elas.
    CREATE TABLE IF NOT EXISTS harness_selection (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('instructions','skill','agent')),
      location TEXT NOT NULL,
      usage TEXT NOT NULL CHECK (usage IN ('always','contextual')),
      PRIMARY KEY (board_id, kind, location)
    );
    -- agentes de fábrica já oferecidos (nomes): o que a pessoa apagar não volta sozinho
    ALTER TABLE boards ADD COLUMN seeded_agents_json TEXT NOT NULL DEFAULT '[]';
    -- os agentes guardados no banco (exec_profiles_json) viram arquivos na abertura do board; a coluna fica para a migração
    INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position)
    SELECT lower(hex(randomblob(16))), b.id, '${RULES_FIELD}', 'multiselect', '[]', NULL, 'chip',
           (SELECT COALESCE(MAX(position), -1) + 1 FROM field_defs f WHERE f.board_id = b.id)
    FROM boards b
    WHERE NOT EXISTS (SELECT 1 FROM field_defs f WHERE f.board_id = b.id AND lower(f.name) = 'rules');
  `,
  27: `
    -- #191: marca o comentário que é o resumo da conversa do card; NULL = mensagem comum.
    ALTER TABLE comments ADD COLUMN kind TEXT;
  `,
  28: `
    -- história derivada de outra (a funcionalidade dividida em entregas): a branch dela parte da branch
    -- da história de origem, e o pull request é empilhado sobre o dela. '' = não é derivada.
    ALTER TABLE cards ADD COLUMN derived_from TEXT NOT NULL DEFAULT '';
  `,
  29: `
    -- até onde vai o modo autônomo da história: a coluna em que a IA faz o trabalho, pede a revisão e o
    -- modo se desliga. '' = até a última coluna em que a IA atua (o pull request).
    ALTER TABLE cards ADD COLUMN yolo_until TEXT NOT NULL DEFAULT '';
  `,
  30: `
    -- o banco de artefatos do board: a marcação passa a aceitar servidores MCP (kind 'mcp') e o modo
    -- 'off' (no board, mas desligado: é como as regras entram, para revisão). O SQLite não altera um
    -- CHECK: a tabela é recriada com o mesmo conteúdo.
    CREATE TABLE harness_selection_v30 (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('instructions','skill','agent','mcp')),
      location TEXT NOT NULL,
      usage TEXT NOT NULL CHECK (usage IN ('always','contextual','off')),
      PRIMARY KEY (board_id, kind, location)
    );
    INSERT INTO harness_selection_v30(board_id, kind, location, usage) SELECT board_id, kind, location, usage FROM harness_selection;
    DROP TABLE harness_selection;
    ALTER TABLE harness_selection_v30 RENAME TO harness_selection;
    -- pastas importadas por ferramenta: o board as varre atrás de artefatos e os lista em "Importados"
    CREATE TABLE IF NOT EXISTS harness_imports (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      tool TEXT NOT NULL,
      dir TEXT NOT NULL,
      PRIMARY KEY (board_id, tool, dir)
    );
    -- campo MCPs: os servidores do board em modo "Pelo card" que a execução do card recebe
    INSERT INTO field_defs(id, board_id, name, kind, options_json, applies_to_types_json, display, position)
    SELECT lower(hex(randomblob(16))), b.id, '${MCPS_FIELD}', 'multiselect', '[]', NULL, 'chip',
           (SELECT COALESCE(MAX(position), -1) + 1 FROM field_defs f WHERE f.board_id = b.id)
    FROM boards b
    WHERE NOT EXISTS (SELECT 1 FROM field_defs f WHERE f.board_id = b.id AND lower(f.name) = 'mcps');
  `,
  31: `
    -- #462: tipo de branch do gitflow que cada tipo de card gera ('feature' | 'bugfix' | 'hotfix').
    -- Fica no tipo, não no nome: renomear o tipo não muda a branch. Os nomes guardados são sempre os em
    -- português (ver BUG_TYPE em shared/priority.ts), então o padrão dos boards existentes sai pelo nome.
    ALTER TABLE card_types ADD COLUMN branch_kind TEXT NOT NULL DEFAULT 'feature';
    UPDATE card_types SET branch_kind = 'hotfix' WHERE name = 'Bug';
    UPDATE card_types SET branch_kind = 'bugfix' WHERE name = 'Retrabalho';
  `,
  32: `
    -- quando a IA refinou o card: o heartbeat refina sozinho os cards do Backlog que ainda não foram
    -- refinados, e o campo é o que o impede de refinar o mesmo card duas vezes
    ALTER TABLE cards ADD COLUMN refined_at INTEGER;
  `,
  33: `
    -- #604: comando-base (sem argumentos) de cada chamada de Bash de uma execução de IA, para saber
    -- o que o Bash rodou. Some junto com a execução (cascata), então segue a retenção do log.
    CREATE TABLE IF NOT EXISTS ai_run_bash (
      run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
      command TEXT NOT NULL,
      calls INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (run_id, command)
    );
  `,
  34: `
    -- #615: o board guarda os próprios artefatos (regras, skills, agentes, servidores MCP), num formato
    -- neutro, em vez de referenciar o arquivo da ferramenta. A cópia do que estava em harness_selection é
    -- feita pelo host na abertura (o SQL não lê arquivos), como a dos perfis da migração 26.
    CREATE TABLE IF NOT EXISTS board_artifacts (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,            -- 'rule' | 'skill' | 'agent' | 'mcp' (sem CHECK: tipo novo não pede migração)
      name TEXT NOT NULL,            -- regra: o caminho de origem como o campo Rules o guarda
      description TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      meta_json TEXT NOT NULL DEFAULT '{}',   -- agente: AgentMeta; mcp: {server}; skill gerada: {generated}
      usage TEXT NOT NULL,           -- 'always' | 'contextual' | 'off' (sem CHECK: ver a migração 30)
      origin TEXT NOT NULL DEFAULT '',        -- location de onde veio; '' = criado no board
      origin_tool TEXT NOT NULL DEFAULT '',
      missing INTEGER NOT NULL DEFAULT 0,
      skipped_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (board_id, kind, name)
    );
    -- arquivos de apoio das skills; binário em base64
    CREATE TABLE IF NOT EXISTS board_artifact_files (
      artifact_id TEXT NOT NULL REFERENCES board_artifacts(id) ON DELETE CASCADE,
      path TEXT NOT NULL,            -- relativo à pasta da skill, com '/'
      content TEXT NOT NULL,
      encoding TEXT NOT NULL CHECK (encoding IN ('utf8','base64')),
      size INTEGER NOT NULL,         -- bytes do original
      PRIMARY KEY (artifact_id, path)
    );
  `,
  35: `
    -- Contratos novos ficam separados: nenhum campo legado muda de significado ou vira autorização.
    CREATE TABLE agent_context_contracts (
      artifact_id TEXT PRIMARY KEY REFERENCES board_artifacts(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK (revision > 0),
      contract_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE activity_context_selections (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
      workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
      phase_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      selection_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (card_id IS NULL OR workflow_id IS NULL)
    );
    -- A fase removida permanece identificável para revisão; seu nome nunca é a identidade.
    CREATE UNIQUE INDEX activity_context_target ON activity_context_selections
      (board_id, COALESCE(card_id, ''), COALESCE(workflow_id, ''), phase_id, action);
  `,
  36: `
    -- Decisão auditável separada dos recibos locais; nunca é uma autorização reutilizável.
    ALTER TABLE ai_runs ADD COLUMN admission_json TEXT;
  `,
  37: `
    ALTER TABLE activity_context_selections ADD COLUMN review_reason TEXT NOT NULL DEFAULT '';
  `,
  38: `
    ALTER TABLE board_artifacts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
  `,
  39: `
    CREATE TABLE ai_work (
      id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      work_key TEXT NOT NULL, kind TEXT NOT NULL, story_id TEXT, card_id TEXT, column_id TEXT NOT NULL,
      state TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0, owner TEXT, workspace TEXT,
      reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(board_id, work_key)
    );
    CREATE INDEX idx_ai_work_open ON ai_work(board_id, state);
    CREATE UNIQUE INDEX idx_ai_work_live_card ON ai_work(board_id, card_id)
      WHERE card_id IS NOT NULL AND state IN ('prepared', 'started', 'reconciling');
    CREATE UNIQUE INDEX idx_ai_work_live_workspace ON ai_work(workspace)
      WHERE workspace IS NOT NULL AND state IN ('prepared', 'started', 'reconciling');
    CREATE TABLE ai_work_attempts (
      id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES ai_work(id) ON DELETE CASCADE,
      generation INTEGER NOT NULL, run_id TEXT, token_hash TEXT, identity_json TEXT,
      workspace_before TEXT, mutations INTEGER NOT NULL DEFAULT 0, outcome TEXT, result_comment_id TEXT,
      started_at INTEGER NOT NULL, ended_at INTEGER, UNIQUE(work_id, generation)
    );
    CREATE UNIQUE INDEX idx_ai_work_attempts_token ON ai_work_attempts(token_hash) WHERE token_hash IS NOT NULL;
    CREATE UNIQUE INDEX idx_ai_work_attempts_run ON ai_work_attempts(run_id) WHERE run_id IS NOT NULL;
  `,
  40: `
    ALTER TABLE board_artifacts ADD COLUMN secret_ref TEXT;
    ALTER TABLE board_artifacts ADD COLUMN review_state TEXT NOT NULL DEFAULT 'legacy'
      CHECK (review_state IN ('legacy', 'pending', 'reviewed'));
  `,
  41: `
    CREATE TABLE execution_policies (
      id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK (revision > 0),
      review_state TEXT NOT NULL CHECK (review_state IN ('pending','reviewed')),
      policy_json TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE INDEX idx_execution_policies_board ON execution_policies(board_id);
    CREATE TABLE execution_policy_versions (
      policy_id TEXT NOT NULL REFERENCES execution_policies(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK (revision > 0),
      review_state TEXT NOT NULL CHECK (review_state IN ('pending','reviewed')),
      policy_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (policy_id, revision)
    );
  `,
  42: `
    -- #618: perfis são dados; comandos e variáveis ficam no cofre local de #728.
    CREATE TABLE ai_profiles (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      id TEXT NOT NULL, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      kind TEXT NOT NULL, base TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0, secret_ref TEXT,
      review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'reviewed')),
      PRIMARY KEY (board_id, id)
    );
    INSERT INTO ai_profiles(board_id,id,name,kind,base,position,review_state) SELECT id,'claude','Claude Code','builtin','claude',0,'reviewed' FROM boards;
    INSERT INTO ai_profiles(board_id,id,name,kind,base,position,review_state) SELECT id,'cursor','Cursor','builtin','cursor',1,'reviewed' FROM boards;
    INSERT INTO ai_profiles(board_id,id,name,kind,base,position,review_state) SELECT id,'kimi','Kimi Code','builtin','kimi',2,'reviewed' FROM boards;
  `,
  43: `
    -- A nova origem não pode reutilizar 'chat': preserva-se também inventário/Bash e auditoria.
    CREATE TABLE ai_runs_v43 (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_ms INTEGER,
      month TEXT NOT NULL,
      outcome TEXT,
      exit_code INTEGER,
      origin TEXT NOT NULL CHECK (origin IN ('manual','heartbeat','autopilot','chat','test')),

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
      cost_usd REAL,
      turns INTEGER, session_id TEXT, cost_estimated INTEGER,
      measure TEXT NOT NULL DEFAULT 'none', admission_json TEXT
    );
    INSERT INTO ai_runs_v43 SELECT * FROM ai_runs;
    DROP TABLE ai_runs;
    ALTER TABLE ai_runs_v43 RENAME TO ai_runs;
    CREATE INDEX idx_ai_runs_month ON ai_runs(board_id, month, started_at);
    CREATE INDEX idx_ai_runs_card ON ai_runs(board_id, card_number, started_at);
    CREATE INDEX idx_ai_runs_open ON ai_runs(board_id, outcome);
  `,
  44: `
    -- #895: perguntas da IA ainda sem resposta (o carrossel do card), em JSON.
    -- Vazio quando não há; o envio das respostas grava a descrição e esvazia.
    ALTER TABLE cards ADD COLUMN questions_json TEXT NOT NULL DEFAULT '[]';
  `,
  45: `
    -- #605: quantas chamadas do comando voltaram com erro (tool_result com is_error), para o sinal
    -- "npm test com falha" do Retrabalho. Registros anteriores ficam com 0: não medido antes desta versão.
    ALTER TABLE ai_run_bash ADD COLUMN failed INTEGER NOT NULL DEFAULT 0;
  `,
  46: `
    -- #926: o board não varre mais pastas de ferramentas; a lista de pastas importadas por ferramenta sai.
    -- harness_selection fica: a marcação de uso (Sempre / Pelo card) continua sendo do board.
    DROP TABLE IF EXISTS harness_imports;
  `,
  47: `
    -- #972: a conferência da execução (o que a sessão usou contra o que o card pediu), congelada no fim.
    -- check_status: 'ok' | 'deviation' | 'unchecked' (sem CHECK: um estado novo não deve pedir migração).
    -- check_detail: JSON dos desvios (ou da razão de não conferir). Execuções anteriores ficam NULL,
    -- que a leitura trata como "não conferida"; nada é inventado.
    ALTER TABLE ai_runs ADD COLUMN check_status TEXT;
    ALTER TABLE ai_runs ADD COLUMN check_detail TEXT;
  `,
  48: `
    -- Ferramenta por modo, história 4: o perfil passa a ser ferramenta × modo. Só as colunas: o
    -- preenchimento é do repositório (AiProfileRepo.list), porque o agente ACP do personalizado mora no
    -- cofre, que a migração não lê. tool '' = ainda não preenchido; kind segue com o valor antigo
    -- (builtin, acp, copy) até o repositório gravar catalog. Sem CHECK em mode: o modo api não deve pedir
    -- migração. ADD COLUMN não reescreve a tabela (só o esquema), nem mesmo o ai_runs grande.
    ALTER TABLE ai_profiles ADD COLUMN tool TEXT NOT NULL DEFAULT '';
    ALTER TABLE ai_profiles ADD COLUMN mode TEXT NOT NULL DEFAULT 'cli';
    -- o modo em que a execução rodou; NULL nas anteriores: não registrado, nada é inventado
    ALTER TABLE ai_runs ADD COLUMN mode TEXT;
  `,
  49: `
    -- A cópia de um artefato guarda o resumo do conteúdo da origem no momento da cópia: comparado com a
    -- origem e com a cópia, diz se a origem mudou ou se a cópia foi editada no board. '' = sem resumo
    -- (criado no board ou copiado antes desta versão); nada é inventado para as cópias anteriores.
    ALTER TABLE board_artifacts ADD COLUMN origin_digest TEXT NOT NULL DEFAULT '';
  `,
  50: `
    -- Biblioteca de artefatos: cada artefato fica só ativo ou inativo (usage 'off'), e o tipo decide o que
    -- ativo quer dizer (docs/decisoes/biblioteca-de-artefatos-do-board.md). Regra ativa vai em todo pedido;
    -- skill e agente ativos se vinculam ao card. A conversão é conservadora: a regra "Pelo card" fica
    -- inativa e a skill "Sempre" passa a ir só pelo card, para o contexto nunca crescer na atualização.
    UPDATE board_artifacts SET usage = 'off' WHERE kind = 'rule' AND usage = 'contextual';
    UPDATE board_artifacts SET usage = 'contextual' WHERE kind IN ('skill', 'agent') AND usage = 'always';
    -- versão que a pessoa dá ao artefato (a revision segue contando gravações)
    ALTER TABLE board_artifacts ADD COLUMN version TEXT NOT NULL DEFAULT '';
    UPDATE board_artifacts SET version = CASE kind WHEN 'rule' THEN '1' WHEN 'mcp' THEN '' ELSE '1.0.0' END;
    -- pasta da skill na biblioteca ('' = raiz), com '/' entre os níveis
    ALTER TABLE board_artifacts ADD COLUMN folder TEXT NOT NULL DEFAULT '';
    -- tools neutras da skill e do agente (JSON); NULL = ainda não escolhidas: a leitura deriva das
    -- categorias antigas do agente ou do allowed-tools da skill, sem inventar nada no banco
    ALTER TABLE board_artifacts ADD COLUMN tools_json TEXT;
    -- pastas de skill criadas vazias (as que têm skill vêm do próprio artefato)
    CREATE TABLE skill_folders (
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      PRIMARY KEY (board_id, path)
    );
  `,
  51: `
    -- O Plano de contexto foi aposentado: as duas tabelas nunca influenciaram a execução.
    DROP INDEX IF EXISTS activity_context_target;
    DROP TABLE IF EXISTS activity_context_selections;
    DROP TABLE IF EXISTS agent_context_contracts;
  `,
  52: `
    -- #1104: custo de cada bucket pelo preço do catálogo, congelado no fim da execução (RF-30). NULL = sem
    -- preço naquele bucket, ou execução anterior a esta versão: nada é recalculado nem inventado.
    ALTER TABLE ai_runs ADD COLUMN cost_input_usd REAL;
    ALTER TABLE ai_runs ADD COLUMN cost_output_usd REAL;
    ALTER TABLE ai_runs ADD COLUMN cost_cache_read_usd REAL;
    ALTER TABLE ai_runs ADD COLUMN cost_cache_write_usd REAL;
  `,
  53: `
    -- #1096: checagens que o board roda na saída da coluna ({name, command, timeoutSec}[] em JSON, como
    -- defaults_json). A tabela gate_runs entra com o executor, que é quem grava nela.
    ALTER TABLE columns ADD COLUMN checks_json TEXT NOT NULL DEFAULT '[]';
  `,
  54: `
    -- #1253: cada execução do portão (checagens da coluna na saída do card). Sem chave estrangeira: o
    -- repositório de cards apaga os gate_runs do card por conta própria. signature fica vazia até a #1097.
    CREATE TABLE gate_runs (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      target_column_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('move','review')),
      sha TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL CHECK (result IN ('running','passed','failed','interrupted')),
      output_tail TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX gate_runs_card ON gate_runs (card_id, started_at);
  `,
  55: `
    -- #1099: classe da falha da execução (transient|deterministic|budget|canceled). NULL = terminou bem,
    -- sessão fechada sem desfecho (unknown) ou execução anterior a esta versão.
    ALTER TABLE ai_runs ADD COLUMN failure_class TEXT;
  `,
  56: `
    -- #1108: subida de modelo da correção quando a checagem falha; uma por unidade (card + coluna do portão).
    -- status: pending (a correção ainda não foi criada) | applied. Sem chave estrangeira: o repositório de
    -- cards apaga as linhas do card por conta própria. Tabela nova e vazia, nada migra.
    CREATE TABLE model_escalations (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      gate_run_id TEXT NOT NULL,
      check_name TEXT NOT NULL,
      from_model TEXT NOT NULL,
      to_model TEXT NOT NULL,
      target_card_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending','applied')),
      created_at INTEGER NOT NULL,
      applied_at INTEGER,
      UNIQUE (card_id, column_id)
    );
  `,
  57: `
    -- #1324: rodadas da revisão independente (veredito de cada sub-tarefa de revisão). Sem chave estrangeira: o
    -- repositório de cards apaga as linhas da história e da sub-tarefa por conta própria. Tabela nova e vazia.
    CREATE TABLE review_rounds (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL,
      subtask_id TEXT NOT NULL UNIQUE,
      round INTEGER NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('APROVADO','REPROVADO','NÃO COMPROVADO')),
      head_sha TEXT NOT NULL,
      implementer_model TEXT,
      reviewer_model TEXT,
      independence TEXT,
      findings_json TEXT NOT NULL,
      unchecked_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (story_id, round)
    );
  `,
  58: `
    -- #1097: assinatura da falha determinística de cada execução (disjuntor de falhas repetidas). NULL = sem
    -- assinatura (execução que deu certo, falha transitória, anterior a esta migração); aditiva, nada é preenchido.
    ALTER TABLE ai_runs ADD COLUMN failure_signature TEXT;
    CREATE INDEX IF NOT EXISTS ai_runs_failure_signature ON ai_runs (card_id, failure_signature) WHERE failure_signature IS NOT NULL;
  `,
};

/**
 * O caminho de volta de cada migração que tem um (a partir da 48): leva o banco ao formato anterior sem
 * perder o que aquela versão sabe ler. Não roda sozinho: é o procedimento de suporte para devolver um banco
 * a uma versão anterior da extensão (que recusa abrir um formato mais novo), e o teste da migração o cobre.
 */
export const DOWN_MIGRATIONS: Readonly<Record<number, string>> = {
  48: `
    -- catalog volta ao valor antigo, que se deduz da ferramenta e do modo: a cópia tem id próprio
    -- (tool = a base), o agente ACP pronto roda em acp e a CLI pronta em cli. O pronto de base generic noutro
    -- modo (o Gemini pela API, desde a história 10, e pela CLI, desde a 8) é o agente ACP pronto do schema 47:
    -- volta a acp, o único modo que aquela versão conhece para ele; a escolha do modo se perde com a coluna, e
    -- a chave fica no cofre
    UPDATE ai_profiles SET kind = CASE WHEN tool <> '' AND tool <> id THEN 'copy'
      WHEN mode = 'acp' OR base = 'generic' THEN 'acp' ELSE 'builtin' END
      WHERE kind = 'catalog';
    ALTER TABLE ai_profiles DROP COLUMN mode;
    ALTER TABLE ai_profiles DROP COLUMN tool;
    ALTER TABLE ai_runs DROP COLUMN mode;
  `,
  49: `
    -- o resumo da origem é só um aviso: a versão anterior não o conhece
    ALTER TABLE board_artifacts DROP COLUMN origin_digest;
  `,
  50: `
    -- a versão anterior lê o mesmo usage; versão, pasta e tools neutras se perdem com as colunas
    DROP TABLE skill_folders;
    ALTER TABLE board_artifacts DROP COLUMN tools_json;
    ALTER TABLE board_artifacts DROP COLUMN folder;
    ALTER TABLE board_artifacts DROP COLUMN version;
  `,
  51: `
    -- recria as tabelas vazias do Plano de contexto (formato das migrações 35 e 37); o conteúdo não volta
    CREATE TABLE agent_context_contracts (
      artifact_id TEXT PRIMARY KEY REFERENCES board_artifacts(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK (revision > 0),
      contract_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE activity_context_selections (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
      workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
      phase_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      selection_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      review_reason TEXT NOT NULL DEFAULT '',
      CHECK (card_id IS NULL OR workflow_id IS NULL)
    );
    CREATE UNIQUE INDEX activity_context_target ON activity_context_selections
      (board_id, COALESCE(card_id, ''), COALESCE(workflow_id, ''), phase_id, action);
  `,
  52: `
    -- a versão anterior não lê o custo por bucket; cost_usd e cost_estimated seguem como estão (as execuções
    -- com custo estimado continuam legíveis nela, que só as esconde)
    ALTER TABLE ai_runs DROP COLUMN cost_cache_write_usd;
    ALTER TABLE ai_runs DROP COLUMN cost_cache_read_usd;
    ALTER TABLE ai_runs DROP COLUMN cost_output_usd;
    ALTER TABLE ai_runs DROP COLUMN cost_input_usd;
  `,
  53: `
    -- a versão anterior não conhece as checagens da coluna; elas se perdem com a coluna
    ALTER TABLE columns DROP COLUMN checks_json;
  `,
  54: `
    -- a versão anterior não conhece o registro das checagens; a tabela e o histórico dela saem
    DROP INDEX IF EXISTS gate_runs_card;
    DROP TABLE IF EXISTS gate_runs;
  `,
  55: `
    -- a versão anterior não conhece a classe da falha; ela se perde com a coluna
    ALTER TABLE ai_runs DROP COLUMN failure_class;
  `,
  56: `
    -- a versão anterior não conhece a subida de modelo; a tabela e o histórico dela saem
    DROP TABLE IF EXISTS model_escalations;
  `,
  57: `
    -- a versão anterior não conhece as rodadas da revisão; a tabela e o histórico dela saem
    DROP TABLE IF EXISTS review_rounds;
  `,
  58: `
    -- a versão anterior não conhece a assinatura da falha; ela se perde com a coluna
    DROP INDEX IF EXISTS ai_runs_failure_signature;
    ALTER TABLE ai_runs DROP COLUMN failure_signature;
  `,
};

/** Desfaz as migrações acima de `to`, da mais nova para a mais antiga, cada uma numa transação. */
export function migrateDown(db: Database, to: number): void {
  const res = db.exec("SELECT value FROM meta WHERE key = 'schema_version'");
  let current = Number(res[0]?.values[0]?.[0] ?? 0);
  while (current > to) {
    const sql = DOWN_MIGRATIONS[current];
    if (!sql) throw new Error(`A migração ${current} não tem caminho de volta.`);
    db.exec('BEGIN;');
    try {
      db.exec(sql);
      db.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)", [String(current - 1)]);
      db.exec('COMMIT;');
    } catch (e) {
      db.exec('ROLLBACK;');
      throw new Error(`Volta da migração ${current} do banco do board: ${e instanceof Error ? e.message : String(e)}`);
    }
    current--;
  }
}

/** Aplica as migrações pendentes até `upTo` (por padrão, a versão atual). */
export function migrate(db: Database, upTo = SCHEMA_VERSION): void {
  db.run('PRAGMA foreign_keys = ON;');
  db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const res = db.exec("SELECT value FROM meta WHERE key = 'schema_version'");
  let current = res[0]?.values[0]?.[0] ? Number(res[0].values[0][0]) : 0;
  // banco gravado por uma versão mais nova da extensão (a pessoa voltou para uma versão anterior, ou a
  // loja ainda não tem a versão que ela testou): esta versão não conhece as tabelas novas e esbarraria
  // nelas ao gravar. Recusa antes de tocar em qualquer coisa, dizendo o que fazer.
  if (upTo === SCHEMA_VERSION && current > SCHEMA_VERSION)
    throw new Error(
      `Este board foi gravado por uma versão mais nova do Faz AI (formato ${current}; esta versão conhece até o ${SCHEMA_VERSION}). ` +
        'Atualize a extensão para abrir o board; nada foi alterado.',
    );
  while (current < upTo) {
    const next = current + 1;
    const sql = MIGRATIONS[next];
    if (!sql) throw new Error(`Migration ${next} não encontrada`);
    // Recriar a tabela-pai exige suspender FKs antes da transação para não cascatear os filhos.
    const rebuildRuns = next === 43;
    if (rebuildRuns) db.run('PRAGMA foreign_keys = OFF;');
    let begun = false;
    try {
      db.exec('BEGIN;');
      begun = true;
      db.exec(sql);
      if (rebuildRuns && db.exec('PRAGMA foreign_key_check').some((r) => r.values.length))
        throw new Error('Referências inválidas após reconstruir o log de execuções.');
      db.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)", [String(next)]);
      db.exec('COMMIT;');
      begun = false;
    } catch (e) {
      if (begun) db.exec('ROLLBACK;');
      // qual migração falhou: sem isso o erro do SQLite não diz em que passo o banco parou
      throw new Error(`Migração ${next} do banco do board: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (rebuildRuns) db.run('PRAGMA foreign_keys = ON;');
    }
    current = next;
  }
}
