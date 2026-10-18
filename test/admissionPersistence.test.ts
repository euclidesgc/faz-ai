import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory, newDatabase } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { exportBoard, importBoard, parseExportFile } from '../src/extension/db/boardExport';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { NO_CARD } from '../src/extension/ai/gateway';
import { admitExecution } from '../src/shared/executionAdmission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
const WASM = path.resolve(__dirname, '../node_modules/sql.js/dist');
let dir: string;
let db: Database;
let router: MessageRouter;
const decision = () =>
  admitExecution(
    'claude',
    'board',
    {
      version: 1,
      regime: 'exclusive',
      boardTools: { mode: 'inherit' },
      agentTools: { categories: ['read'], native: { tool: '', allow: [], deny: [] } },
      activeMcpIds: [],
      allowedMcpIds: [],
      boardMcpIds: [],
      mcpServers: [],
      mcpTools: [],
      boardMcpTools: [],
      mcpLevel: { permission: 'board', tools: [] },
    },
    'a'.repeat(64),
    [],
    1000,
  );
const config = {
  model: null,
  effort: null,
  profile: null,
  agent: null,
  permission: 'board',
  autonomous: false,
  clean: false,
  skills: [],
  mcp: [],
};
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-admission-db-'));
  db = await openInMemory(WASM);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'test',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
function run(repo = new AiRunRepo(db), boardId = router.boardId) {
  return repo.start({ ...NO_CARD, boardId, startedAt: Date.UTC(2026, 9, 15, 12), origin: 'manual', tool: 'claude' });
}
describe('auditoria persistida da admissão', () => {
  it('migra 35 para 36 sem reclassificar a execução antiga ou alterar seus dados', () => {
    const old = newDatabase();
    migrate(old, 35);
    const board = new BoardRepo(old).getOrCreate('old', 'Antigo');
    const id = run(new AiRunRepo(old), board.id);
    const before = old.exec('SELECT * FROM ai_runs')[0]!;
    migrate(old);
    const after = old.exec('SELECT * FROM ai_runs')[0]!;
    expect(after.columns).toEqual([...before.columns, 'admission_json']);
    expect(after.values[0]!.slice(0, -1)).toEqual(before.values[0]);
    expect(after.values[0]!.at(-1)).toBeNull();
    expect(new AiRunRepo(old).byMonth('2026-10')[0]?.id).toBe(id);
  });
  it('exporta e importa a decisão como auditoria, sem convertê-la em recibo local de capacidade', () => {
    const repo = new AiRunRepo(db);
    const id = run(repo);
    const d = decision();
    repo.describe(id, { ...config, admission: d });
    expect(repo.byMonth('2026-10')[0]?.admission).toEqual(d);
    const file = parseExportFile(JSON.stringify(exportBoard(db, router.boardId, router.store, { extensionVersion: 'test' }).file));
    importBoard({ db, store: router.store, workspaceKey: 'test', boardId: router.boardId }, file);
    expect(new AiRunRepo(db).byMonth('2026-10')[0]?.admission).toEqual(d);
    expect(new CapabilityEvidenceStore(path.join(dir, 'evidence')).load(d.binding)).toEqual([]);
    expect(JSON.stringify(file)).not.toContain('host-probe');
    expect(JSON.stringify(file)).not.toContain('local.key');
  });
  it('recusa metadados inválidos antes de substituir o board, mesmo se o import ignorar o parser', () => {
    const repo = new AiRunRepo(db);
    repo.describe(run(repo), { ...config, admission: decision() });
    const file = exportBoard(db, router.boardId, router.store, { extensionVersion: 'test' }).file;
    file.tables.ai_runs![0]!.admission_json = '{"version":999,"secret":"sentinela"}';
    expect(() => parseExportFile(JSON.stringify(file))).toThrow('admissão inválida');
    const backup = vi.fn();
    expect(() => importBoard({ db, store: router.store, workspaceKey: 'test', boardId: router.boardId, backup }, file)).toThrow(
      'admissão inválida',
    );
    expect(backup).not.toHaveBeenCalled();
    expect(repo.byMonth('2026-10')[0]?.admission?.version).toBe(1);
  });
  it('corrupção local não aparece como admissão válida e export não a publica', () => {
    const repo = new AiRunRepo(db);
    run(repo);
    db.run("UPDATE ai_runs SET admission_json = 'invalido'");
    expect(repo.byMonth('2026-10')[0]).toMatchObject({ admissionCorrupt: true });
    expect(repo.byMonth('2026-10')[0]?.admission).toBeUndefined();
    expect(() => exportBoard(db, router.boardId, router.store, { extensionVersion: 'test' })).toThrow();
  });
});
