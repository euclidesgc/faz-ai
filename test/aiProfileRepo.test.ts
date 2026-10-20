import { profileVersion, profileSignedIn } from '../src/extension/cliProbe';
import { beforeEach, afterEach, expect, it } from 'vitest';
import path from 'node:path';
import type { Database } from 'sql.js';
import { newDatabase, openInMemory } from '../src/extension/db/database';
import { migrate, SCHEMA_VERSION } from '../src/extension/db/schema';
import { seedBoard } from '../src/extension/db/seed';
import { all, one, run } from '../src/extension/db/query';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { credentialsFor } from '../src/extension/credentials';
import type { AiProfileDraft } from '../src/shared/aiProfiles';
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
    expect(repo.list(boardId)).toHaveLength(3);
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
  expect(repo.list(boardId)).toHaveLength(3);
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
  expect(repo.list(boardId).every((p) => !p.enabled && p.credentials?.review === 'pending')).toBe(true);
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
  expect(repo.list(boardId)).toHaveLength(3);
  expect(repo.list(boardId).every((p) => !p.enabled)).toBe(true);
});
it('o padrão aceita perfil ligado e revisado, ignorando perfil ausente, desligado ou importado', () => {
  const boards = new BoardRepo(db);
  const copy = repo.save(boardId, draft({ kind: 'copy', base: 'cursor', config: {} }), 'person');
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
