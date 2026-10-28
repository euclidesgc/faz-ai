import { afterEach, beforeEach, expect, it } from 'vitest';
import path from 'node:path';
import type { Database } from 'sql.js';
import { newDatabase, openInMemory } from '../src/extension/db/database';
import { migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { all, one, run } from '../src/extension/db/query';

// Migração 50 (biblioteca de artefatos: ativo/inativo, versão, pasta e tools neutras) sobre um banco do schema 49
// como o de quem já usa a extensão: regras em todos os modos, skill e agente "Sempre" e um MCP "Pelo card".
const BOARD = 'board-antigo';
let db: Database;

const columns = (table: string) => all(db, `PRAGMA table_info(${table})`).map((c) => String(c.name));
const tables = () => all(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r.name));
const artifact = (id: string) => one(db, 'SELECT * FROM board_artifacts WHERE id = ?', [id])!;

beforeEach(async () => {
  (await openInMemory(path.resolve('node_modules/sql.js/dist'))).close();
  db = newDatabase();
  migrate(db, 49);
  run(db, "INSERT INTO boards(id, workspace_key, name) VALUES (?, 'pasta', 'Board antigo')", [BOARD]);
  const ins = (id: string, kind: string, usage: string) =>
    run(
      db,
      `INSERT INTO board_artifacts (id, board_id, kind, name, description, body, meta_json, usage, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'd', 'corpo', '{}', ?, 1, 2)`,
      [id, BOARD, kind, id, usage],
    );
  ins('r-always', 'rule', 'always');
  ins('r-contextual', 'rule', 'contextual');
  ins('r-off', 'rule', 'off');
  ins('s-always', 'skill', 'always');
  ins('s-contextual', 'skill', 'contextual');
  ins('a-always', 'agent', 'always');
  ins('m-contextual', 'mcp', 'contextual');
  ins('m-always', 'mcp', 'always');
});
afterEach(() => db.close());

it('normaliza os modos que deixaram de existir e mantém os demais', () => {
  migrate(db);
  const usage = (id: string) => artifact(id).usage;
  // regra "Pelo card" vira inativa; "Sempre" e "Desligado" ficam
  expect([usage('r-always'), usage('r-contextual'), usage('r-off')]).toEqual(['always', 'off', 'off']);
  // skill e agente "Sempre" viram "Pelo card" (ativos, vinculáveis ao card)
  expect([usage('s-always'), usage('s-contextual'), usage('a-always')]).toEqual(['contextual', 'contextual', 'contextual']);
  // o MCP mantém os dois modos
  expect([usage('m-contextual'), usage('m-always')]).toEqual(['contextual', 'always']);
});

it('cria versão por tipo, pasta vazia, tools não escolhidas (NULL) e a tabela de pastas de skill', () => {
  expect(columns('board_artifacts')).not.toContain('version');
  expect(tables()).not.toContain('skill_folders');
  migrate(db);
  expect(String(one(db, "SELECT value FROM meta WHERE key = 'schema_version'")!.value)).toBe(String(SCHEMA_VERSION));
  expect(columns('board_artifacts')).toEqual(expect.arrayContaining(['version', 'folder', 'tools_json']));
  expect(tables()).toContain('skill_folders');
  const version = (id: string) => artifact(id).version;
  expect([version('r-always'), version('s-always'), version('a-always'), version('m-contextual')]).toEqual(['1', '1.0.0', '1.0.0', '']);
  for (const row of all(db, 'SELECT folder, tools_json FROM board_artifacts')) {
    expect(row.folder).toBe('');
    expect(row.tools_json).toBeNull();
  }
  expect(all(db, 'SELECT * FROM skill_folders')).toEqual([]);
});

it('migrateDown volta ao 49 sem erro, mantém os modos já normalizados e tira as colunas e a tabela', () => {
  migrate(db);
  const before = all(db, 'SELECT id, usage FROM board_artifacts ORDER BY id');
  migrateDown(db, 49);
  expect(String(one(db, "SELECT value FROM meta WHERE key = 'schema_version'")!.value)).toBe('49');
  expect(columns('board_artifacts')).not.toContain('version');
  expect(columns('board_artifacts')).not.toContain('folder');
  expect(columns('board_artifacts')).not.toContain('tools_json');
  expect(tables()).not.toContain('skill_folders');
  expect(all(db, 'SELECT id, usage FROM board_artifacts ORDER BY id')).toEqual(before);
  // e o caminho de ida de novo funciona
  migrate(db);
  expect(columns('board_artifacts')).toContain('tools_json');
});
