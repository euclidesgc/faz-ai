import { profileVersion, profileSignedIn } from '../src/extension/cliProbe';
import { beforeEach, afterEach, expect, it } from 'vitest';
import path from 'node:path';
import type { Database } from 'sql.js';
import { newDatabase, openInMemory } from '../src/extension/db/database';
import { migrate, SCHEMA_VERSION } from '../src/extension/db/schema';
import { seedBoard } from '../src/extension/db/seed';
import { all, one, run } from '../src/extension/db/query';
import { AiProfileRepo, validateProfileRows } from '../src/extension/repositories/aiProfileRepo';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { credentialsFor } from '../src/extension/credentials';
import { ACP_READY_AGENTS, BUILTIN_ISOLATION, BUILTIN_PROFILES, catalogTool, type AiProfileDraft } from '../src/shared/aiProfiles';
import { ACP_AGENTS } from '../src/extension/ai/acp/agents';
/** as três CLIs prontas mais os agentes ACP prontos */
const CATALOG = BUILTIN_PROFILES.length;
let db: Database, repo: AiProfileRepo, boardId: string;
const draft = (extra: Partial<AiProfileDraft> = {}): AiProfileDraft => ({
  name: 'Minha CLI',
  kind: 'custom',
  base: 'generic',
  enabled: true,
  position: 3,
  config: {
    command: 'private-command-sentinel',
    env: { TOKEN: 'profile-secret-sentinel' },
    args: ['--secret=argument-sentinel'],
    future: { keep: 'unknown-sentinel' },
  },
  ...extra,
});
beforeEach(async () => {
  db = await openInMemory(path.resolve('node_modules/sql.js/dist'));
  boardId = seedBoard(db, 'profiles', 'Perfis');
  repo = new AiProfileRepo(db);
});
afterEach(() => db.close());
it('migra dois boards preservando padrões e catálogo e semeia os três prontos', () => {
  const old = newDatabase();
  try {
    migrate(old, 41);
    for (const [id, tools] of [
      ['a', '["cursor"]'],
      ['b', '["codex","claude"]'],
    ] as const)
      run(old, 'INSERT INTO boards(id,workspace_key,name,ai_tools_json,model_catalog_json) VALUES (?,?,?,?,?)', [
        id,
        id,
        id,
        tools!,
        '[{"id":"codex:model"}]',
      ]);
    migrate(old);
    expect(one(old, "SELECT value FROM meta WHERE key='schema_version'")?.value).toBe(String(SCHEMA_VERSION));
    expect(all(old, 'SELECT * FROM ai_profiles')).toHaveLength(6);
    expect(one(old, "SELECT ai_tools_json,model_catalog_json FROM boards WHERE id='b'")).toEqual({
      ai_tools_json: '["codex","claude"]',
      model_catalog_json: '[{"id":"codex:model"}]',
    });
    expect(repo.list(boardId)).toHaveLength(CATALOG);
  } finally {
    old.close();
  }
});
it('cofre guarda todos os campos e snapshot/banco/export não recebem valores', () => {
  const profile = repo.save(boardId, draft(), 'person');
  expect(repo.resolveConfig(boardId, profile.id)).toEqual(draft().config);
  const snapshot = new BoardRepo(db).snapshot(boardId);
  const file = exportBoard(db, boardId, { pathOf: () => '' }, { extensionVersion: 'test' }).file;
  for (const bytes of [JSON.stringify(snapshot), Buffer.from(db.export()).toString(), JSON.stringify(file)])
    for (const sentinel of ['private-command-sentinel', 'profile-secret-sentinel', 'argument-sentinel', 'unknown-sentinel'])
      expect(bytes).not.toContain(sentinel);
  expect(profile.capabilities).toMatchObject({ artifacts: 'unknown', permissions: 'unknown', cancellation: 'unknown', output: 'unknown' });
  expect(credentialsFor(db).redact('profile-secret-sentinel')).not.toContain('profile-secret-sentinel');
  repo.save(boardId, { ...draft(), id: profile.id, config: { command: 'replacement' } }, 'person');
  expect(repo.resolveConfig(boardId, profile.id)).toMatchObject({ command: 'replacement', future: { keep: 'unknown-sentinel' } });
});
it('edição sem readback preserva comando e env omitidos, mas aceita troca explícita', () => {
  const profile = repo.save(boardId, draft(), 'person');
  repo.save(boardId, { ...draft({ id: profile.id, name: 'Novo nome' }), config: {} }, 'person');
  expect(repo.resolveConfig(boardId, profile.id)).toMatchObject(draft().config);
  repo.save(boardId, { ...draft({ id: profile.id }), config: { env: { OTHER: 'outro' } } }, 'person');
  expect(repo.resolveConfig(boardId, profile.id).env).toEqual({ TOKEN: 'profile-secret-sentinel', OTHER: 'outro' });
  repo.save(boardId, { ...draft({ id: profile.id }), config: { env: { OTHER: '' } } }, 'person');
  expect(repo.resolveConfig(boardId, profile.id).env).toEqual({ TOKEN: 'profile-secret-sentinel' });
  repo.save(boardId, { ...draft({ id: profile.id }), config: { command: 'novo-comando', args: [] } }, 'person');
  expect(repo.resolveConfig(boardId, profile.id)).toMatchObject({ command: 'novo-comando', args: [] });
});
it('impõe revisão humana e trava os prontos e o padrão; cópia ganha referência própria sem herdar revisão ou evidência', () => {
  expect(() => repo.save(boardId, draft(), 'ai')).toThrow('revisão humana');
  expect(() => repo.save(boardId, { ...draft(), id: 'claude' }, 'person')).toThrow('prontos');
  expect(() => repo.remove(boardId, 'claude', 'person')).toThrow('prontos');
  expect(() => repo.setEnabled(boardId, 'claude', false, 'person')).toThrow('padrão');
  const source = repo.save(boardId, draft(), 'person'),
    copy = repo.duplicate(boardId, source.id, 'person');
  expect(copy).toMatchObject({
    name: 'Minha CLI (cópia)',
    enabled: false,
    credentials: { review: 'pending', available: true },
    capabilities: { artifacts: 'unknown' },
  });
  expect(copy.credentials?.secretRef).not.toBe(source.credentials?.secretRef);
  expect(() => repo.resolveConfig(boardId, copy.id)).toThrow('revisão');
  expect(() => repo.setEnabled(boardId, copy.id, true, 'person')).toThrow('Revise');
  run(db, 'UPDATE boards SET ai_tools_json=? WHERE id=?', [JSON.stringify([source.id]), boardId]);
  expect(() => repo.remove(boardId, source.id, 'person')).toThrow('padrão');
  expect(() => repo.save(boardId, { ...draft(), id: source.id, enabled: false }, 'person')).toThrow('padrão');
});
it('completa prontos ausentes só na leitura e ignora configurações adulteradas dos prontos', () => {
  run(db, "DELETE FROM ai_profiles WHERE board_id=? AND id='cursor'", [boardId]);
  run(db, "UPDATE ai_profiles SET config_json=? WHERE board_id=? AND id='claude'", ['{"command":"não-executar"}', boardId]);
  expect(repo.list(boardId)).toHaveLength(CATALOG);
  expect(repo.resolveConfig(boardId, 'claude')).toEqual({});
  expect(all(db, 'SELECT * FROM ai_profiles WHERE board_id=?', [boardId])).toHaveLength(2);
});
it('importa referências desativadas/pendentes, conserva o alvo antigo e recusa valores antes do backup', () => {
  const profile = repo.save(boardId, draft(), 'person');
  const file = exportBoard(db, boardId, { pathOf: () => '' }, { extensionVersion: 'test' }).file;
  let backups = 0;
  const target = {
    db,
    boardId,
    workspaceKey: 'profiles',
    store: { backupCards: () => undefined, pathOf: () => '' },
    backup: () => {
      backups++;
    },
  };
  const result = importBoard(target as never, parseExportFile(JSON.stringify(file)));
  expect(result).toBeDefined();
  expect(backups).toBe(1);
  // os agentes ACP prontos sem linha não vêm no arquivo e seguem desligados, sem revisão a fazer
  expect(repo.list(boardId).every((p) => !p.enabled && (!p.credentials || p.credentials.review === 'pending'))).toBe(true);
  expect(() => repo.resolveConfig(boardId, profile.id)).toThrow('revisão');
  const invalid = structuredClone(file);
  invalid.tables.ai_profiles![3]!.config_json = '{"env":{"TOKEN":"imported-sentinel"}}';
  expect(() => importBoard(target as never, parseExportFile(JSON.stringify(invalid)))).toThrow('sem valores');
  expect(backups).toBe(1);
  repo.reviewBuiltin(boardId, 'claude', 'person');
  repo.setEnabled(boardId, 'claude', true, 'person');
  expect(repo.resolveConfig(boardId, 'claude')).toEqual({});
  const legacy = structuredClone(file);
  legacy.schemaVersion = 41;
  delete legacy.tables.ai_profiles;
  importBoard(target as never, parseExportFile(JSON.stringify(legacy)));
  expect(repo.list(boardId)).toHaveLength(CATALOG);
  expect(repo.list(boardId).every((p) => !p.enabled)).toBe(true);
});
it('o padrão aceita perfil ligado e revisado, ignorando perfil ausente, desligado ou importado', () => {
  const boards = new BoardRepo(db);
  const copy = repo.save(boardId, draft({ kind: 'catalog', tool: 'cursor', mode: 'cli', base: 'cursor', config: {} }), 'person');
  boards.updateBoard(boardId, { aiTool: copy.id });
  expect(boards.snapshot(boardId).board.aiTool).toBe(copy.id);
  boards.updateBoard(boardId, { aiTool: 'inexistente' });
  expect(boards.snapshot(boardId).board.aiTool).toBe(copy.id);
  boards.updateBoard(boardId, { aiTool: 'claude' });
  repo.setEnabled(boardId, copy.id, false, 'person');
  boards.updateBoard(boardId, { aiTool: copy.id });
  expect(boards.snapshot(boardId).board.aiTool).toBe('claude');
  run(db, "UPDATE ai_profiles SET enabled=1, review_state='pending' WHERE board_id=? AND id=?", [boardId, copy.id]);
  boards.updateBoard(boardId, { aiTool: copy.id });
  expect(boards.snapshot(boardId).board.aiTool).toBe('claude');
});

it('sonda um processo Node real com a configuração privada revisada, sem shell ou inferência', async () => {
  const saved = repo.save(boardId, draft({ config: { command: process.execPath, statusArgs: '-e process.exit(0)' } }), 'person');
  const profile = repo.resolveProfile(boardId, saved.id);
  expect(await profileVersion(profile, process.execPath)).toBe(process.versions.node);
  expect(await profileSignedIn(profile, process.execPath, '/unused')).toBe(true);
  expect(
    await profileSignedIn({ ...profile, config: { ...profile.config, statusArgs: '-e process.exit(1)' } }, process.execPath, '/unused'),
  ).toBe(false);
});

it('duplicar um pronto copia a lista de itens carregados; salvar grava o isolamento e o expõe sem expor o resto', () => {
  const copy = repo.duplicate(boardId, 'cursor', 'person');
  expect(copy.config).toEqual({ isolation: { loads: BUILTIN_ISOLATION.cursor.loads } });
  const saved = repo.save(
    boardId,
    {
      ...draft({ id: copy.id, kind: 'catalog', tool: 'cursor', mode: 'cli', base: 'cursor', name: copy.name }),
      config: { isolation: { loads: [{ kind: 'mcp', scope: 'user' }] } },
    },
    'person',
  );
  expect(saved.config).toEqual({ isolation: { loads: [{ kind: 'mcp', scope: 'user' }] } });
  expect(repo.list(boardId).find((p) => p.id === copy.id)!.config).toEqual(saved.config);
  const custom = repo.save(boardId, draft(), 'person');
  expect(custom.config).toEqual({});
  // o agente ACP é o id do catálogo, não segredo: volta na leitura pública para o board reconhecer o perfil
  const acp = repo.save(
    boardId,
    draft({ id: 'gemini-acp', name: 'Gemini ACP', config: { acpAgent: 'gemini', env: { X: '1' } } }),
    'person',
  );
  expect(acp.config).toEqual({ acpAgent: 'gemini' });
  expect(repo.list(boardId).find((p) => p.id === 'gemini-acp')!.config).toEqual({ acpAgent: 'gemini' });
  expect(JSON.stringify(repo.list(boardId))).not.toContain('private-command-sentinel');
  expect(() =>
    repo.save(boardId, draft({ config: { command: 'x', isolation: { loads: [{ kind: 'x', scope: 'user' }] } as never } }), 'person'),
  ).toThrow('Isolamento');
});

it('agente ACP pronto: desligado até a pessoa ligar, sem edição nem exclusão; a cópia é um personalizado com o agente', async () => {
  // o catálogo de perfis prontos aponta para agentes que existem no catálogo ACP, com o mesmo nome e página
  for (const ready of ACP_READY_AGENTS) {
    const agent = ACP_AGENTS.find((a) => a.id === ready.id);
    expect(agent, ready.id).toBeDefined();
    expect({ label: agent!.label, docs: agent!.docs }).toEqual({ label: ready.label, docs: ready.docs });
  }
  const listed = repo.list(boardId).find((p) => p.id === 'gemini')!;
  expect(listed).toMatchObject({
    kind: 'catalog',
    tool: 'gemini',
    mode: 'acp',
    base: 'generic',
    enabled: false,
    config: { acpAgent: 'gemini' },
  });
  // nenhum board tem a linha do agente pronto: ela nasce ao ligar, sem migração nem semente
  expect(all(db, "SELECT * FROM ai_profiles WHERE board_id=? AND mode='acp'", [boardId])).toHaveLength(0);
  expect(repo.list(boardId).find((p) => p.id === 'codex-acp')).toMatchObject({ enabled: false, kind: 'catalog', mode: 'acp' });
  repo.setEnabled(boardId, 'codex-acp', true, 'person');
  // a linha nasce já com a ferramenta e o modo
  expect(one(db, "SELECT kind, tool, mode FROM ai_profiles WHERE board_id=? AND id='codex-acp'", [boardId])).toEqual({
    kind: 'catalog',
    tool: 'codex-acp',
    mode: 'acp',
  });
  expect(repo.list(boardId).find((p) => p.id === 'codex-acp')).toMatchObject({
    enabled: true,
    credentials: { review: 'reviewed', available: true },
  });
  // a configuração resolvida é a do catálogo: o agente e a página oficial, nada do cofre
  expect(repo.resolveConfig(boardId, 'codex-acp')).toEqual({
    acpAgent: 'codex-acp',
    installUrl: 'https://github.com/agentclientprotocol/codex-acp',
  });
  expect(() => repo.save(boardId, { ...draft(), id: 'gemini', kind: 'catalog', base: 'generic', config: {} }, 'person')).toThrow('prontos');
  expect(() => repo.remove(boardId, 'gemini', 'person')).toThrow('prontos');
  const copy = repo.duplicate(boardId, 'gemini', 'person');
  expect(copy).toMatchObject({
    kind: 'custom',
    tool: copy.id,
    mode: 'acp',
    base: 'generic',
    enabled: false,
    config: { acpAgent: 'gemini' },
  });
  expect(copy.id).not.toBe('gemini');
  // sem comando de status, o login do agente pronto fica "não verificado" (a história do Conectar lê o authMethods)
  expect(await profileSignedIn({ ...listed, enabled: true }, process.execPath, '/home')).toBeNull();
  // a exportação leva a linha do agente pronto e a importação a aceita (importada, fica desligada e pendente)
  repo.setEnabled(boardId, 'codex-acp', false, 'person');
  const file = exportBoard(db, boardId, { pathOf: () => '' }, { extensionVersion: 'test' }).file;
  expect(file.tables.ai_profiles!.find((r) => r.id === 'codex-acp')).toMatchObject({
    kind: 'catalog',
    tool: 'codex-acp',
    mode: 'acp',
    base: 'generic',
    enabled: 0,
  });
  const target = {
    db,
    boardId,
    workspaceKey: 'profiles',
    store: { backupCards: () => undefined, pathOf: () => '' },
    backup: () => undefined,
  };
  importBoard(target as never, parseExportFile(JSON.stringify(file)));
  expect(repo.list(boardId).find((p) => p.id === 'codex-acp')).toMatchObject({ kind: 'catalog', mode: 'acp', enabled: false });
});

it('salvar e duplicar gravam a ferramenta e o modo pelo tipo e pelo agente, nunca pelo rascunho', () => {
  const cli = repo.save(boardId, draft({ tool: 'claude', mode: 'acp' }), 'person');
  expect(cli).toMatchObject({ kind: 'custom', tool: cli.id, mode: 'cli' });
  const acp = repo.save(boardId, draft({ name: 'Meu Gemini', config: { acpAgent: 'gemini' } }), 'person');
  expect(acp).toMatchObject({ kind: 'custom', tool: acp.id, mode: 'acp' });
  const copy = repo.duplicate(boardId, 'claude', 'person');
  expect(copy).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli', base: 'claude' });
  const copyOfCopy = repo.duplicate(boardId, copy.id, 'person');
  expect(copyOfCopy).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli' });
  // editar a cópia (o formulário manda catalog) mantém a ferramenta da base
  expect(
    repo.save(boardId, { ...draft({ id: copy.id, kind: 'catalog', base: 'claude', name: copy.name }), config: {} }, 'person'),
  ).toMatchObject({
    kind: 'catalog',
    tool: 'claude',
  });
  // o tipo não muda numa edição, nem passando pelo valor antigo
  expect(() => repo.save(boardId, { ...draft({ id: copy.id, base: 'claude' }), config: {} }, 'person')).toThrow('tipo');
  expect(all(db, 'SELECT id, kind, tool, mode FROM ai_profiles WHERE board_id = ? AND tool = ?', [boardId, ''])).toEqual([]);
});

it('linhas do schema 47 viram ferramenta × modo na leitura, gravam uma vez e não mudam a ferramenta do catálogo', () => {
  const put = (id: string, config: Record<string, unknown>) => credentialsFor(db).put(JSON.stringify(['profile', boardId, id]), config);
  // o formato antigo, como uma versão anterior gravava: kind antigo e a ferramenta vazia (o padrão da migração)
  run(db, "UPDATE ai_profiles SET kind = 'builtin', tool = '', mode = 'cli' WHERE board_id = ?", [boardId]);
  const legacy: [string, string, string, string | null][] = [
    ['gemini', 'acp', 'generic', null],
    ['claude-trabalho', 'copy', 'claude', put('claude-trabalho', { extraArgs: ['--verbose'], env: { ACCOUNT: 'trabalho' } })],
    ['meu-gemini', 'custom', 'generic', put('meu-gemini', { acpAgent: 'gemini' })],
    ['minha-cli', 'custom', 'generic', put('minha-cli', { command: 'minha-cli' })],
    // de outra máquina: a referência existe, o cofre não tem o valor
    ['importada', 'custom', 'generic', 'f'.repeat(64)],
  ];
  for (const [id, kind, base, ref] of legacy)
    run(
      db,
      "INSERT INTO ai_profiles(board_id,id,name,enabled,kind,base,position,secret_ref,review_state) VALUES (?,?,?,1,?,?,9,?,'reviewed')",
      [boardId, id, id, kind, base, ref],
    );
  // a regra antiga da ferramenta do catálogo (cópia → a base; os demais → o id), para comparar
  const before = Object.fromEntries(legacy.map(([id, kind, base]) => [id, kind === 'copy' ? base : id]));
  const listed = repo.list(boardId);
  const byId = (id: string) => listed.find((p) => p.id === id)!;
  expect(byId('claude')).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli' });
  expect(byId('gemini')).toMatchObject({ kind: 'catalog', tool: 'gemini', mode: 'acp' });
  expect(byId('claude-trabalho')).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli', base: 'claude' });
  expect(byId('meu-gemini')).toMatchObject({ kind: 'custom', tool: 'meu-gemini', mode: 'acp' });
  expect(byId('minha-cli')).toMatchObject({ kind: 'custom', tool: 'minha-cli', mode: 'cli' });
  expect(byId('importada')).toMatchObject({ kind: 'custom', tool: 'importada', mode: 'cli' });
  for (const [id, tool] of Object.entries(before)) expect(catalogTool(byId(id)), id).toBe(tool);
  // gravou o que descobriu; o personalizado sem cofre segue sem ferramenta no banco, para o save gravar
  expect(all(db, 'SELECT id, kind, tool, mode FROM ai_profiles WHERE board_id = ? ORDER BY id', [boardId])).toEqual([
    { id: 'claude', kind: 'catalog', tool: 'claude', mode: 'cli' },
    { id: 'claude-trabalho', kind: 'catalog', tool: 'claude', mode: 'cli' },
    { id: 'cursor', kind: 'catalog', tool: 'cursor', mode: 'cli' },
    { id: 'gemini', kind: 'catalog', tool: 'gemini', mode: 'acp' },
    { id: 'importada', kind: 'custom', tool: '', mode: 'cli' },
    { id: 'kimi', kind: 'catalog', tool: 'kimi', mode: 'cli' },
    { id: 'meu-gemini', kind: 'custom', tool: 'meu-gemini', mode: 'acp' },
    { id: 'minha-cli', kind: 'custom', tool: 'minha-cli', mode: 'cli' },
  ]);
  // idempotente: a segunda leitura não grava nada e devolve o mesmo
  const changes = Number(db.exec('SELECT total_changes()')[0]!.values[0]![0]);
  expect(repo.list(boardId)).toEqual(listed);
  expect(Number(db.exec('SELECT total_changes()')[0]!.values[0]![0])).toBe(changes);
  // os ajustes da cópia continuam no cofre, intactos, e a execução os resolve como antes
  expect(repo.resolveConfig(boardId, 'claude-trabalho')).toEqual({ extraArgs: ['--verbose'], env: { ACCOUNT: 'trabalho' } });
  expect(repo.resolveConfig(boardId, 'meu-gemini')).toEqual({ acpAgent: 'gemini' });
  // e a exportação aceita o banco no meio do caminho (o personalizado ainda sem ferramenta)
  expect(() => exportBoard(db, boardId, { pathOf: () => '' }, { extensionVersion: 'test' })).not.toThrow();
});

it('a importação aceita os dois conjuntos de valores e recusa ferramenta ou modo que não batem com o perfil', () => {
  const row = (over: Record<string, unknown>) => ({
    board_id: boardId,
    id: 'copia',
    name: 'Cópia',
    enabled: 0,
    kind: 'copy',
    tool: '',
    mode: 'cli',
    base: 'claude',
    config_json: '{}',
    position: 4,
    secret_ref: null,
    review_state: 'pending',
    ...over,
  });
  const ok = (over: Record<string, unknown>) => expect(() => validateProfileRows([row(over) as never], boardId)).not.toThrow();
  const bad = (over: Record<string, unknown>) => expect(() => validateProfileRows([row(over) as never], boardId)).toThrow('Tipo ou base');
  ok({});
  ok({ kind: 'catalog', tool: 'claude' });
  ok({ id: 'meu', kind: 'custom', base: 'generic', tool: 'meu', mode: 'acp' });
  ok({ id: 'claude', kind: 'builtin' });
  ok({ id: 'claude', kind: 'catalog', tool: 'claude' });
  ok({ id: 'gemini', kind: 'acp', base: 'generic' });
  ok({ id: 'gemini', kind: 'catalog', base: 'generic', tool: 'gemini', mode: 'acp' });
  bad({ kind: 'catalog' });
  bad({ kind: 'catalog', tool: 'cursor' });
  bad({ kind: 'catalog', tool: 'claude', mode: 'acp' });
  bad({ kind: 'catalog', tool: 'claude', mode: 'api' });
  // `api` é um modo conhecido desde a história 9, mas nenhum perfil roda nele ainda: nem pronto, nem
  // personalizado (que tem comando próprio ou agente ACP)
  bad({ id: 'meu', kind: 'custom', base: 'generic', tool: 'meu', mode: 'api' });
  bad({ id: 'gemini', kind: 'catalog', base: 'generic', tool: 'gemini', mode: 'api' });
  bad({ kind: 'builtin' });
  bad({ id: 'meu', kind: 'custom', base: 'generic', tool: 'outro' });
  bad({ id: 'claude', kind: 'acp' });
  bad({ id: 'gemini', kind: 'catalog', base: 'generic', tool: 'gemini', mode: 'cli' });
});
