import { afterEach, beforeEach, expect, it } from 'vitest';
import path from 'node:path';
import type { Database } from 'sql.js';
import { newDatabase, openInMemory } from '../src/extension/db/database';
import { migrate, migrateDown, SCHEMA_VERSION } from '../src/extension/db/schema';
import { all, one, run } from '../src/extension/db/query';
import { credentialsFor } from '../src/extension/credentials';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { exportBoard } from '../src/extension/db/boardExport';
import { catalogTool } from '../src/shared/aiProfiles';
import { toolModeOf } from '../src/shared/aiTools';

// Migração 48 (ferramenta por modo, história 4) sobre um banco como o de quem já usa a extensão: o board
// nasceu antes dos perfis (a migração 42 semeou as CLIs prontas), e a pessoa ligou um agente ACP pronto,
// duplicou o Claude Code, criou um personalizado ACP e um de CLI, e rodou cards. Dados inventados.
const BOARD = 'board-antigo';
const owner = (id: string) => JSON.stringify(['profile', BOARD, id]);
let db: Database;

const columns = (table: string) => all(db, `PRAGMA table_info(${table})`).map((c) => String(c.name));
const version = () => one(db, "SELECT value FROM meta WHERE key = 'schema_version'")?.value;

beforeEach(async () => {
  (await openInMemory(path.resolve('node_modules/sql.js/dist'))).close();
  db = newDatabase();
  migrate(db, 41);
  run(db, "INSERT INTO boards(id, workspace_key, name, ai_tools_json) VALUES (?, 'pasta', 'Board antigo', '[\"claude-trabalho\"]')", [
    BOARD,
  ]);
  migrate(db, 47);
  const profile = (id: string, kind: string, base: string, config: Record<string, unknown> | null) =>
    run(
      db,
      "INSERT INTO ai_profiles(board_id,id,name,enabled,kind,base,position,secret_ref,review_state) VALUES (?,?,?,1,?,?,5,?,'reviewed')",
      [BOARD, id, id, kind, base, config ? credentialsFor(db).put(owner(id), config) : null],
    );
  profile('gemini', 'acp', 'generic', null);
  profile('claude-trabalho', 'copy', 'claude', { extraArgs: ['--verbose'], env: { CONTA: 'trabalho' } });
  profile('meu-gemini', 'custom', 'generic', { acpAgent: 'gemini', env: { CHAVE: 'valor-inventado' } });
  profile('minha-cli', 'custom', 'generic', { command: 'minha-cli', args: ['{prompt}'] });
  for (const [id, tool] of [
    ['r1', 'claude-trabalho'],
    ['r2', 'meu-gemini'],
  ] as const)
    run(
      db,
      `INSERT INTO ai_runs(id,board_id,started_at,ended_at,month,outcome,origin,tool,profile,permission,measure,input_tokens,check_status)
       VALUES (?,?,1,2,'2026-10','done','manual',?,?,'board','full',10,'ok')`,
      [id, BOARD, tool, tool],
    );
  run(db, "INSERT INTO ai_run_usage(run_id,kind,name,calls) VALUES ('r1','tool','Read',2)");
});
afterEach(() => db.close());

it('o banco do schema 47 abre, migra só as colunas e mantém perfis e execuções como estavam', () => {
  const profilesBefore = all(db, 'SELECT * FROM ai_profiles ORDER BY id');
  const runsBefore = all(db, 'SELECT * FROM ai_runs ORDER BY id');
  migrate(db);
  expect(version()).toBe(String(SCHEMA_VERSION));
  expect(SCHEMA_VERSION).toBe(48);
  expect(columns('ai_profiles')).toEqual(expect.arrayContaining(['tool', 'mode']));
  expect(columns('ai_runs')).toContain('mode');
  // a migração não lê o cofre: só cria as colunas no padrão, e o kind segue o antigo até o repositório ler
  expect(all(db, 'SELECT * FROM ai_profiles ORDER BY id')).toEqual(profilesBefore.map((r) => ({ ...r, tool: '', mode: 'cli' })));
  // execução anterior: o modo não foi registrado, e nada é inventado
  expect(all(db, 'SELECT * FROM ai_runs ORDER BY id')).toEqual(runsBefore.map((r) => ({ ...r, mode: null })));
  expect(all(db, 'SELECT * FROM ai_run_usage')).toHaveLength(1);
});

it('depois da migração o board continua funcionando: perfis com ferramenta e modo, execuções novas gravam o modo', () => {
  migrate(db);
  const repo = new AiProfileRepo(db);
  const listed = repo.list(BOARD);
  const byId = (id: string) => listed.find((p) => p.id === id)!;
  expect(byId('claude')).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli', enabled: true });
  expect(byId('gemini')).toMatchObject({ kind: 'catalog', tool: 'gemini', mode: 'acp', enabled: true });
  expect(byId('claude-trabalho')).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli', base: 'claude' });
  expect(byId('meu-gemini')).toMatchObject({ kind: 'custom', tool: 'meu-gemini', mode: 'acp', config: { acpAgent: 'gemini' } });
  expect(byId('minha-cli')).toMatchObject({ kind: 'custom', tool: 'minha-cli', mode: 'cli' });
  // a ferramenta do catálogo de modelos (chave de campos de modelo, políticas e consumo) não muda
  expect(Object.fromEntries(listed.map((p) => [p.id, catalogTool(p)]))).toMatchObject({
    claude: 'claude',
    gemini: 'gemini',
    'claude-trabalho': 'claude',
    'meu-gemini': 'meu-gemini',
    'minha-cli': 'minha-cli',
  });
  // o driver de cada perfil (história 5) é o mesmo que o adaptador de antes derivava de base e acpAgent:
  // no personalizado ACP, a ferramenta do driver é o agente do catálogo, não o id do perfil
  const oldAdapter = (p: (typeof listed)[number]) =>
    p.base === 'generic'
      ? typeof p.config.acpAgent === 'string'
        ? { tool: p.config.acpAgent, mode: 'acp' }
        : null
      : { tool: p.base, mode: 'cli' };
  for (const p of listed) expect(toolModeOf(p), p.id).toEqual(oldAdapter(p));
  expect(toolModeOf(byId('meu-gemini'))).toEqual({ tool: 'gemini', mode: 'acp' });
  expect(toolModeOf(byId('minha-cli'))).toBeNull();
  // a execução resolve a configuração do cofre como antes
  expect(repo.resolveProfile(BOARD, 'claude-trabalho').config).toEqual({ extraArgs: ['--verbose'], env: { CONTA: 'trabalho' } });
  expect(repo.resolveProfile(BOARD, 'meu-gemini').config).toMatchObject({ acpAgent: 'gemini' });
  const runs = new AiRunRepo(db);
  expect(runs.byMonth('2026-10').map((r) => [r.id, r.mode, r.check.status])).toEqual([
    ['r1', null, 'ok'],
    ['r2', null, 'ok'],
  ]);
  const id = runs.start({
    boardId: BOARD,
    startedAt: Date.UTC(2026, 9, 23),
    origin: 'manual',
    cardId: null,
    cardNumber: null,
    cardTitle: '',
    cardType: '',
    workflow: '',
    columnName: '',
    phase: '',
    tool: 'meu-gemini',
  });
  runs.describe(id, {
    model: null,
    effort: null,
    profile: 'meu-gemini',
    agent: null,
    permission: 'board',
    mode: 'acp',
    autonomous: false,
    clean: false,
    skills: [],
    mcp: null,
  });
  expect(runs.byMonth('2026-10').find((r) => r.id === id)).toMatchObject({ tool: 'meu-gemini', mode: 'acp' });
  // a exportação leva ferramenta e modo
  const file = exportBoard(db, BOARD, { pathOf: () => '' }, { extensionVersion: 'test' }).file;
  expect(file.tables.ai_profiles!.find((r) => r.id === 'claude-trabalho')).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli' });
  expect(file.tables.ai_runs!.find((r) => r.id === id)).toMatchObject({ mode: 'acp' });
});

it('o preenchimento lê o banco pela chave primária, sem varrer a tabela', () => {
  migrate(db);
  const plan = all(db, "EXPLAIN QUERY PLAN SELECT id, kind, base, secret_ref FROM ai_profiles WHERE board_id = ? AND tool = ''", [BOARD]);
  expect(plan.map((r) => String(r.detail)).join(' ')).toMatch(
    /SEARCH ai_profiles USING INDEX sqlite_autoindex_ai_profiles_1 \(board_id=\?\)/,
  );
});

it('ida e volta: o caminho de volta devolve o banco ao schema 47 com os tipos antigos, e ele migra de novo igual', () => {
  const profilesBefore = all(db, 'SELECT * FROM ai_profiles ORDER BY id');
  const runsBefore = all(db, 'SELECT * FROM ai_runs ORDER BY id');
  migrate(db);
  const repo = new AiProfileRepo(db);
  const listed = repo.list(BOARD);
  expect(one(db, "SELECT kind FROM ai_profiles WHERE id = 'claude-trabalho'")?.kind).toBe('catalog');
  migrateDown(db, 47);
  expect(version()).toBe('47');
  expect(columns('ai_profiles')).not.toContain('tool');
  expect(columns('ai_profiles')).not.toContain('mode');
  expect(columns('ai_runs')).not.toContain('mode');
  // o que a versão anterior lê volta exatamente como estava: catalog vira builtin, acp ou copy de novo
  expect(all(db, 'SELECT * FROM ai_profiles ORDER BY id')).toEqual(profilesBefore);
  expect(all(db, 'SELECT * FROM ai_runs ORDER BY id')).toEqual(runsBefore);
  expect(() => migrateDown(db, 46)).toThrow('não tem caminho de volta');
  migrate(db);
  expect(new AiProfileRepo(db).list(BOARD)).toEqual(listed);
});

it('agente ACP pronto que saiu do catálogo continua a própria ferramenta em acp, também na volta ao 47', () => {
  // um id que nenhum catálogo atual tem: a linha foi gravada quando ele era um agente ACP pronto
  run(
    db,
    "INSERT INTO ai_profiles(board_id,id,name,enabled,kind,base,position,review_state) VALUES (?,'agente-antigo','Agente antigo',0,'acp','generic',20,'reviewed')",
    [BOARD],
  );
  const before = all(db, 'SELECT * FROM ai_profiles ORDER BY id');
  migrate(db);
  const old = new AiProfileRepo(db).list(BOARD).find((p) => p.id === 'agente-antigo')!;
  expect(old).toMatchObject({ kind: 'catalog', tool: 'agente-antigo', mode: 'acp', base: 'generic' });
  expect(catalogTool(old)).toBe('agente-antigo');
  expect(one(db, "SELECT kind, tool, mode FROM ai_profiles WHERE id = 'agente-antigo'")).toEqual({
    kind: 'catalog',
    tool: 'agente-antigo',
    mode: 'acp',
  });
  migrateDown(db, 47);
  // volta como acp, não como uma cópia com base generic (que o schema 47 recusa)
  expect(all(db, 'SELECT * FROM ai_profiles ORDER BY id')).toEqual(before);
});

it('o Gemini pronto no modo API (história 10) volta ao 47 como o agente ACP pronto que ele era', () => {
  migrate(db);
  new AiProfileRepo(db).list(BOARD);
  // a linha como o Conectar a deixaria ao escolher o modo API (história 7)
  run(db, "UPDATE ai_profiles SET mode = 'api' WHERE board_id = ? AND id = 'gemini'", [BOARD]);
  expect(one(db, "SELECT kind, tool FROM ai_profiles WHERE id = 'gemini'")).toEqual({ kind: 'catalog', tool: 'gemini' });
  expect(new AiProfileRepo(db).list(BOARD).find((p) => p.id === 'gemini')).toMatchObject({ mode: 'api', kind: 'catalog' });
  migrateDown(db, 47);
  // a versão anterior só conhece o Gemini em ACP: a escolha da API se perde com a coluna, nunca vira CLI pronta
  expect(one(db, "SELECT kind, base FROM ai_profiles WHERE id = 'gemini'")).toEqual({ kind: 'acp', base: 'generic' });
  migrate(db);
  expect(new AiProfileRepo(db).list(BOARD).find((p) => p.id === 'gemini')).toMatchObject({ mode: 'acp', kind: 'catalog' });
});

it('modo de execução fora dos conhecidos lê como não registrado', () => {
  migrate(db);
  run(db, "UPDATE ai_runs SET mode = 'xyz' WHERE id = 'r1'");
  expect(new AiRunRepo(db).byMonth('2026-10').find((r) => r.id === 'r1')!.mode).toBeNull();
});

it('o modo API (história 9) lê como gravado, sem migração nova', () => {
  migrate(db);
  run(db, "UPDATE ai_runs SET mode = 'api' WHERE id = 'r1'");
  expect(new AiRunRepo(db).byMonth('2026-10').find((r) => r.id === 'r1')!.mode).toBe('api');
});
