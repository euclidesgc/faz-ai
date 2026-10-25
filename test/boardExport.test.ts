import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import {
  EXPORT_TABLES,
  NOT_EXPORTED,
  exportBoard,
  exportFileName,
  importBoard,
  parseExportFile,
  summarize,
  type BoardExportFile,
} from '../src/extension/db/boardExport';
import { newDatabase, openFile } from '../src/extension/db/database';
import { migrate, SCHEMA_VERSION } from '../src/extension/db/schema';
import type { BoardState } from '../src/shared/model';
import { all, run, str } from '../src/extension/db/query';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import { LARGE_EXPORT_BYTES } from '../src/shared/backup';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let db: Database;
let router: MessageRouter;
let storyId: string;
let subId: string;

/** Um roteador (board) sobre o mesmo banco, para outra pasta. */
function openRouter(database: Database, workspaceKey: string, folderName: string): MessageRouter {
  return new MessageRouter({ db: database, scheduleSave: () => {}, close: async () => {}, backup: () => {} } as never, {
    workspaceKey,
    folderName,
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: path.join(dir, 'ws-' + workspaceKey),
    homeDir: path.join(dir, 'home'),
  });
}

/** Enche o board com um pouco de tudo: cards, campos, checklist, conversa, vínculo, anexo, arquivado e lixeira. */
function populate(r: MessageRouter): { story: string; sub: string } {
  let s = r.snapshot();
  const parentWf = s.workflows.find((w) => w.kind === 'parent')!;
  const childWf = s.workflows.find((w) => w.kind === 'child')!;
  const typeOf = (wf: string) => s.cardTypes.find((t) => t.defaultWorkflowId === wf)!;
  const firstCol = (wf: string) => s.columns.find((c) => c.workflowId === wf)!;
  const story = r.createCard({ typeId: typeOf(parentWf.id).id, columnId: firstCol(parentWf.id).id, parentId: null, title: 'História' });
  const sub = r.createCard({ typeId: typeOf(childWf.id).id, columnId: firstCol(childWf.id).id, parentId: story, title: 'Tarefa' });
  const other = r.createCard({ typeId: typeOf(parentWf.id).id, columnId: firstCol(parentWf.id).id, parentId: null, title: 'Outra' });
  s = r.snapshot();
  const field = (n: string) => s.fieldDefs.find((f) => f.name === n)!;
  r.handle({ type: 'field.setValue', cardId: story, fieldId: field('Esforço da atividade').id, value: 'Alto' });
  r.handle({ type: 'field.setValue', cardId: sub, fieldId: field('Skills').id, value: ['revisar'] });
  r.handle({ type: 'checklist.add', cardId: story, text: 'item 1' });
  r.handle({ type: 'checklist.add', cardId: story, text: 'item 2' });
  r.handle({ type: 'checklist.update', itemId: r.snapshot().checklistItems[0]!.id, patch: { done: true } });
  r.handle({ type: 'comment.add', cardId: story, body: 'oi' }, { author: 'IA', source: 'ai' });
  r.handle({ type: 'link.add', fromId: story, toId: other, kind: 'related' });
  r.handle({
    type: 'attachment.addData',
    cardId: story,
    filename: 'spec.md',
    base64: Buffer.from('# Spec').toString('base64'),
    artifact: true,
  });
  r.handle({ type: 'attachment.addData', cardId: sub, filename: 'foto.png', base64: Buffer.from([1, 2, 3, 4]).toString('base64') });
  r.handle({ type: 'card.archive', cardId: other });
  const trashed = r.createCard({ typeId: typeOf(parentWf.id).id, columnId: firstCol(parentWf.id).id, parentId: null, title: 'Lixo' });
  r.handle({ type: 'card.trash', cardId: trashed });
  r.handle({ type: 'settings.board.update', patch: { name: 'Meu Board' } });
  return { story, sub };
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-export-'));
  db = await openInMemory(WASM_DIR);
  router = openRouter(db, 'ws-a', 'A');
  ({ story: storyId, sub: subId } = populate(router));
});

const doExport = (r = router) => exportBoard(db, r.boardId, r.store, { extensionVersion: '0.31.0', now: Date.UTC(2026, 9, 4, 15) });

describe('exportBoard', () => {
  it('cabeçalho, board sem workspace_key e uma lista por tabela', () => {
    const { file, warnings } = doExport();
    expect(warnings).toEqual([]);
    expect(file.fazai).toBe('board-export');
    expect(file.formatVersion).toBe(1);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.extensionVersion).toBe('0.31.0');
    expect(file.exportedAt).toBe('2026-10-04T15:00:00.000Z');
    expect(file.board.id).toBe(router.boardId);
    expect(file.board.name).toBe('Meu Board');
    expect(file.board).not.toHaveProperty('workspace_key');
    expect(Object.keys(file.tables)).toEqual(EXPORT_TABLES.map((t) => t.name));
  });

  it('leva conteúdo e configuração: cards (com arquivado e lixeira), campos, checklist, conversa, vínculos, anexos e eventos', () => {
    const { file } = doExport();
    const cards = file.tables.cards!;
    expect(cards.map((c) => c.title).sort()).toEqual(['História', 'Lixo', 'Outra', 'Tarefa']);
    expect(cards.find((c) => c.title === 'Outra')!.archived_at).not.toBeNull();
    expect(cards.find((c) => c.title === 'Lixo')!.deleted_at).not.toBeNull();
    expect(cards.find((c) => c.title === 'Tarefa')!.parent_id).toBe(storyId);
    expect(file.tables.field_values!.length).toBeGreaterThanOrEqual(2);
    expect(file.tables.checklist_items!.map((i) => [i.text, i.done])).toEqual([
      ['item 1', 1],
      ['item 2', 0],
    ]);
    expect(file.tables.comments!.map((c) => [c.body, c.author, c.source])).toEqual([['oi', 'IA', 'ai']]);
    expect(file.tables.card_links!).toHaveLength(1);
    expect(file.tables.attachments!.map((a) => a.filename).sort()).toEqual(['foto.png', 'spec.md']);
    expect(file.tables.card_events!.length).toBeGreaterThan(0);
    expect(file.tables.workflows!.length).toBe(2);
    expect(file.tables.columns!.length).toBeGreaterThan(5);
    expect(file.tables.card_types!.length).toBeGreaterThan(1);
    expect(file.tables.field_defs!.length).toBeGreaterThan(1);
  });

  it('anexos vão em base64, um item por linha de attachments', () => {
    const { file } = doExport();
    expect(file.files).toHaveLength(2);
    const spec = file.tables.attachments!.find((a) => a.filename === 'spec.md')!;
    const f = file.files.find((x) => x.attachmentId === spec.id)!;
    expect(Buffer.from(f.base64!, 'base64').toString()).toBe('# Spec');
  });

  it('anexo registrado sem arquivo em disco: o export termina, o item fica sem base64 e o card vai aos avisos', () => {
    const a = router.snapshot().attachments.find((x) => x.cardId === subId)!;
    fs.rmSync(router.store.pathOf(a));
    const { file, warnings } = doExport();
    const sub = router.snapshot().cards.find((c) => c.id === subId)!;
    expect(warnings).toEqual([`#${sub.number}`]);
    expect(file.files.find((x) => x.attachmentId === a.id)).toEqual({ attachmentId: a.id });
    expect(file.files.filter((x) => x.base64)).toHaveLength(1);
  });

  it('dois boards no mesmo banco: o export de A não contém linhas de B', () => {
    const other = openRouter(db, 'ws-b', 'B');
    populate(other);
    const { file } = doExport();
    const idsB = new Set(all(db, 'SELECT id FROM cards WHERE board_id = ?', [other.boardId]).map((r) => str(r.id)));
    expect(idsB.size).toBe(4);
    for (const c of file.tables.cards!) expect(idsB.has(str(c.id))).toBe(false);
    for (const w of file.tables.workflows!) expect(w.board_id).toBe(router.boardId);
    const colsB = new Set(
      all(db, 'SELECT c.id FROM columns c JOIN workflows w ON w.id = c.workflow_id WHERE w.board_id = ?', [other.boardId]).map((r) =>
        str(r.id),
      ),
    );
    for (const c of file.tables.columns!) expect(colsB.has(str(c.id))).toBe(false);
    expect(file.tables.cards!.length).toBe(4);
    expect(file.tables.attachments!.length).toBe(2);
  });

  it('toda tabela do schema com board_id ou card_id está em EXPORT_TABLES (fora as excluídas de propósito)', () => {
    const tables = all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((r) => str(r.name));
    const linked = tables.filter((t) => {
      const cols = all(db, `PRAGMA table_info(${t})`).map((c) => str(c.name));
      return cols.includes('board_id') || cols.includes('card_id') || cols.includes('workflow_id') || cols.includes('run_id');
    });
    const listed = new Set([...EXPORT_TABLES.map((t) => t.name), ...NOT_EXPORTED]);
    expect(linked.filter((t) => !listed.has(t))).toEqual([]);
    // e cada tabela listada existe
    for (const t of EXPORT_TABLES) expect(tables).toContain(t.name);
  });

  it('o arquivo é JSON puro (valores só texto, número ou nulo) e o nome sugerido vem do board e da data', () => {
    const { file } = doExport();
    const text = JSON.stringify(file);
    expect(parseExportFile(text)).toEqual(file);
    expect(exportFileName('Meu Board: v2/teste', Date.UTC(2026, 9, 4, 15))).toMatch(/^Meu Board_ v2_teste-2026-10-0[45]\.fazai\.json$/);
  });
});

describe('parseExportFile', () => {
  const valid = (): BoardExportFile => doExport().file;
  const bad = (mut: (f: any) => void): string => {
    const f = valid();
    mut(f);
    return JSON.stringify(f);
  };

  it('recusa JSON inválido e arquivo sem o marcador', () => {
    expect(() => parseExportFile('{')).toThrow('Arquivo não é um export do Faz AI: o conteúdo não é um JSON válido.');
    expect(() => parseExportFile('[]')).toThrow('Arquivo não é um export do Faz AI: o conteúdo não é um objeto JSON.');
    expect(() => parseExportFile(bad((f) => delete f.fazai))).toThrow(
      'Arquivo não é um export do Faz AI: falta o marcador "board-export".',
    );
  });

  it('recusa formato mais novo', () => {
    expect(() => parseExportFile(bad((f) => (f.formatVersion = 2)))).toThrow(
      'Este arquivo foi gerado por uma versão mais nova do Faz AI (formato 2). Atualize a extensão.',
    );
  });

  it('recusa schema mais novo, dizendo a versão da extensão que gerou', () => {
    expect(() => parseExportFile(bad((f) => (f.schemaVersion = SCHEMA_VERSION + 1)))).toThrow(
      `Este arquivo precisa do Faz AI 0.31.0 ou superior (banco versão ${SCHEMA_VERSION + 1}). Atualize a extensão.`,
    );
  });

  it('recusa tabela obrigatória ausente e linha sem id', () => {
    expect(() => parseExportFile(bad((f) => delete f.tables.comments))).toThrow(
      'Arquivo não é um export do Faz AI: falta a tabela "comments".',
    );
    expect(() => parseExportFile(bad((f) => delete f.tables.cards![0]!.id))).toThrow(
      'Arquivo não é um export do Faz AI: linha sem id em "cards".',
    );
    expect(() => parseExportFile(bad((f) => delete f.board))).toThrow('Arquivo não é um export do Faz AI: faltam os dados do board.');
    expect(() => parseExportFile(bad((f) => delete f.files))).toThrow(
      'Arquivo não é um export do Faz AI: falta a lista de arquivos dos anexos.',
    );
  });

  it('aceita schema mais antigo (a importação migra) e preenche o que faltar no cabeçalho', () => {
    const f = parseExportFile(bad((x) => ((x.schemaVersion = 21), delete x.exportedAt, delete x.extensionVersion)));
    expect(f.schemaVersion).toBe(21);
    expect(f.exportedAt).toBe('');
    expect(f.extensionVersion).toBe('');
  });

  it('um export antigo com a tabela harness_imports (removida no formato 45) ainda é aceito, e o export novo não a traz', () => {
    expect(doExport().file.tables.harness_imports).toBeUndefined();
    const f = parseExportFile(
      bad((x) => ((x.schemaVersion = 44), (x.tables.harness_imports = [{ board_id: 'b', tool: 'claude', dir: '/x' }]))),
    );
    expect(f.schemaVersion).toBe(44);
  });
});

describe('summarize', () => {
  it('resume o arquivo para a confirmação', () => {
    const { file } = doExport();
    const s = summarize(file, 1234);
    expect(s).toEqual({
      boardName: 'Meu Board',
      cards: 4,
      attachments: 2,
      sizeBytes: 1234,
      formatVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      extensionVersion: '0.31.0',
      exportedAt: '2026-10-04T15:00:00.000Z',
      large: false,
    });
    expect(summarize(file, LARGE_EXPORT_BYTES + 1).large).toBe(true);
  });
});

/** O snapshot sem o que muda de propósito na importação (a chave da pasta) e sem o que não vem do banco. */
function comparable(s: BoardState) {
  const { board, harness: _h, chat: _c, aiRuns: _a, autopilot: _p, aiRunUnsupported: _u, pendingUpgrade: _g, ...rest } = s;
  const { workspaceKey: _k, ...b } = board;
  return { ...rest, board: b };
}

const readAll = (r: MessageRouter) =>
  Object.fromEntries(r.snapshot().attachments.map((a) => [a.id, fs.readFileSync(r.store.pathOf(a)).toString('base64')]));

/** Apaga o board da pasta (com os anexos) e reabre a pasta: o roteador cria um board vazio no lugar. */
function wipe(): void {
  new BoardRepo(db).deleteBoard(router.boardId).forEach((id) => router.store.removeCard(id));
  router = openRouter(db, 'ws-a', 'A');
}
const target = (r: MessageRouter, backup?: () => void) => ({ db, backup, store: r.store, workspaceKey: 'ws-a', boardId: r.boardId });

describe('importBoard', () => {
  it('a ciência do regime compatível por perfil não vem na importação: quem importa dá a própria (história 7)', () => {
    router.recordCompatibilityReview('gemini');
    router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat: true } } } as never);
    expect(router.snapshot().board.runner.compatibilityReviews).toEqual({ gemini: 1 });
    const text = JSON.stringify(doExport().file);
    wipe();
    importBoard(target(router), parseExportFile(text));
    const runner = openRouter(db, 'ws-a', 'A').snapshot().board.runner;
    expect(runner.compatibilityReviews).toEqual({});
    // o resto do runner vem como estava
    expect(runner.heartbeat).toBe(true);
  });

  it('ida e volta: o board volta igual (ids, números, conteúdo, configuração e anexos)', () => {
    const before = comparable(router.snapshot());
    const files = readAll(router);
    const { file } = doExport();
    const text = JSON.stringify(file);

    // apaga o board da pasta e reabre: o roteador cria um vazio no lugar
    wipe();
    expect(router.snapshot().cards).toHaveLength(0);
    expect(fs.existsSync(router.store.pathOf(router.snapshot().attachments[0] ?? { cardId: storyId, storedName: 'x' }))).toBe(false);

    const result = importBoard(target(router), parseExportFile(text));
    expect(result).toEqual({
      boardId: before.board.id,
      boardName: 'Meu Board',
      cards: 4,
      attachments: 2,
      warnings: [],
      mcpSecrets: [],
      profileReviews: ['Claude Code', 'Cursor', 'Kimi Code'],
    });

    const other = openRouter(db, 'ws-a', 'A'); // reabre a pasta: o board é o importado
    expect(other.boardId).toBe(before.board.id);
    const after = comparable(other.snapshot());
    expect(after).toEqual({
      ...before,
      board: {
        ...before.board,
        // o agente ACP pronto sem linha no banco não vem no arquivo: segue como estava
        aiProfiles: before.board.aiProfiles.map((p) =>
          p.credentials ? { ...p, enabled: false, credentials: { ...p.credentials, review: 'pending' } } : p,
        ),
      },
    });
    expect(other.snapshot().board.workspaceKey).toBe('ws-a');
    expect(readAll(other)).toEqual(files);
    expect(
      other
        .snapshot()
        .cards.map((c) => c.number)
        .sort(),
    ).toEqual([1, 2, 3, 4]);
  });

  it('zera log_rollup_day e mantém next_card_number', () => {
    const { file } = doExport();
    run(db, "UPDATE boards SET log_rollup_day = '2026-10-01' WHERE id = ?", [router.boardId]);
    const exported = exportBoard(db, router.boardId, router.store, { extensionVersion: 'x' }).file;
    expect(exported.board.log_rollup_day).toBe('2026-10-01');
    importBoard(target(router), exported);
    const row = all(db, 'SELECT log_rollup_day, next_card_number FROM boards WHERE id = ?', [str(file.board.id)])[0]!;
    expect(row.log_rollup_day).toBe('');
    expect(row.next_card_number).toBe(5);
  });

  it('dois boards no mesmo banco: importar em A não toca B', () => {
    const other = openRouter(db, 'ws-b', 'B');
    populate(other);
    const beforeB = comparable(other.snapshot());
    const filesB = readAll(other);
    const { file } = doExport();
    router.handle({ type: 'card.trash', cardId: storyId });
    importBoard(target(router), file);
    expect(comparable(openRouter(db, 'ws-b', 'B').snapshot())).toEqual(beforeB);
    expect(readAll(other)).toEqual(filesB);
    expect(
      openRouter(db, 'ws-a', 'A')
        .snapshot()
        .cards.find((c) => c.id === storyId)!.deletedAt,
    ).toBeNull();
  });

  it('arquivo de schema antigo: materializa na versão dele, migra e importa com as colunas novas no default', () => {
    // o board nasce na versão 5 e sobe até a 21, para receber os campos padrão que as migrações 6, 7 e 9 inserem
    const old = newDatabase();
    migrate(old, 5);
    old.run(`
      INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws-old', 'Antigo');
      INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent');
      INSERT INTO columns (id, workflow_id, name, position) VALUES ('c', 'w', 'Backlog', 0);
      INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t', 'b', 'História', '#000', 'w');
      INSERT INTO cards (id, board_id, workflow_id, column_id, type_id, parent_id, title, position, created_at, updated_at, number)
        VALUES ('k', 'b', 'w', 'c', 't', NULL, 'Card antigo', 0, 1, 1, 7);
    `);
    migrate(old, 21);
    expect(
      all(old, 'SELECT name FROM field_defs')
        .map((f) => f.name)
        .sort(),
    ).toEqual(['Esforço da atividade', 'Modelo', 'Skills']);
    const tables: Record<string, ReturnType<typeof all>> = {};
    for (const t of EXPORT_TABLES)
      tables[t.name] = all(old, 'SELECT name FROM sqlite_master WHERE name = ?', [t.name]).length
        ? all(old, `SELECT * FROM ${t.name}`)
        : [];
    const board = all(old, 'SELECT * FROM boards')[0]!;
    delete board.workspace_key;
    old.close();
    const file = parseExportFile(
      JSON.stringify({
        fazai: 'board-export',
        formatVersion: 1,
        schemaVersion: 21,
        extensionVersion: '0.27.0',
        exportedAt: '',
        board,
        tables,
        files: [],
      }),
    );
    const result = importBoard(target(router), file);
    expect(result.cards).toBe(1);
    const card = all(db, 'SELECT number, merge_commit, yolo FROM cards WHERE id = ?', ['k'])[0]!;
    expect(card).toEqual({ number: 7, merge_commit: '', yolo: 0 });
    const b = all(db, 'SELECT workspace_key, log_since FROM boards WHERE id = ?', ['b'])[0]!;
    expect(b.workspace_key).toBe('ws-a');
    expect(
      openRouter(db, 'ws-a', 'A')
        .snapshot()
        .cards.map((c) => c.title),
    ).toEqual(['Card antigo']);
  });

  it('arquivo de schema 47: importa pelo caminho de migração e os perfis saem com ferramenta e modo', () => {
    const r = router;
    // uma cópia do Claude Code e um agente ACP pronto ligado, como uma versão anterior deixava
    r.handle({ type: 'settings.aiProfiles.duplicate', id: 'claude' });
    new AiProfileRepo(db).setEnabled(r.boardId, 'gemini', true, 'person');
    const copyId = r.snapshot().board.aiProfiles.find((p) => p.name === 'Claude Code (cópia)')!.id;
    const { file } = doExport();
    // o arquivo como o schema 47 gravava: sem as colunas novas e com os tipos antigos
    const legacy = structuredClone(file);
    legacy.schemaVersion = 47;
    for (const row of legacy.tables.ai_profiles!) {
      row.kind = row.id === 'gemini' ? 'acp' : row.id === copyId ? 'copy' : row.kind === 'catalog' ? 'builtin' : (row.kind ?? null);
      delete row.tool;
      delete row.mode;
    }
    for (const row of legacy.tables.ai_runs!) delete row.mode;
    importBoard(target(r), parseExportFile(JSON.stringify(legacy)));
    const profiles = openRouter(db, 'ws-a', 'A').snapshot().board.aiProfiles;
    expect(profiles.find((p) => p.id === 'claude')).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli' });
    expect(profiles.find((p) => p.id === 'gemini')).toMatchObject({ kind: 'catalog', tool: 'gemini', mode: 'acp', enabled: false });
    expect(profiles.find((p) => p.id === copyId)).toMatchObject({ kind: 'catalog', tool: 'claude', mode: 'cli', base: 'claude' });
    expect(all(db, "SELECT id FROM ai_profiles WHERE board_id = ? AND tool = ''", [r.boardId])).toEqual([]);
    // um arquivo do schema 48 sem as colunas novas não é um export desta versão
    const broken = structuredClone(file);
    delete broken.tables.ai_profiles![0]!.tool;
    expect(() => parseExportFile(JSON.stringify(broken))).toThrow('falta a coluna "tool" em "ai_profiles"');
  });

  it('o modo das execuções importadas é um dos que o board grava, ou nulo', () => {
    run(
      db,
      "INSERT INTO ai_runs(id,board_id,started_at,month,origin,tool,permission,mode) VALUES ('run-1',?,1,'2026-10','manual','claude','board','cli')",
      [router.boardId],
    );
    const { file } = doExport();
    const row = (mode: unknown) => ({ ...file.tables.ai_runs![0], id: 'run-importada', mode }) as never;
    const withRun = (mode: unknown) => ({ ...file, tables: { ...file.tables, ai_runs: [row(mode)] } });
    expect(file.tables.ai_runs!.length).toBeGreaterThan(0);
    expect(() => parseExportFile(JSON.stringify(withRun('xyz')))).toThrow('modo de execução inválido');
    expect(() => parseExportFile(JSON.stringify(withRun('acp')))).not.toThrow();
    // o modo API entrou com a admissão dele (história 9), sem migração: a coluna é texto sem CHECK
    expect(() => parseExportFile(JSON.stringify(withRun('api')))).not.toThrow();
    expect(() => parseExportFile(JSON.stringify(withRun(null)))).not.toThrow();
  });

  it('export antigo sem branch_kind: a importação migra e o Bug sai em hotfix, o Retrabalho em bugfix', () => {
    const old = newDatabase();
    migrate(old, 29);
    old.run(`
      INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws-old', 'Antigo');
      INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent');
      INSERT INTO columns (id, workflow_id, name, position) VALUES ('c', 'w', 'Backlog', 0);
      INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t1', 'b', 'História', '#000', 'w');
      INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t2', 'b', 'Bug', '#000', 'w');
      INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t3', 'b', 'Retrabalho', '#000', 'w');
    `);
    const tables: Record<string, ReturnType<typeof all>> = {};
    for (const t of EXPORT_TABLES)
      tables[t.name] = all(old, 'SELECT name FROM sqlite_master WHERE name = ?', [t.name]).length
        ? all(old, `SELECT * FROM ${t.name}`)
        : [];
    // o arquivo antigo não tem a coluna branch_kind
    expect(Object.keys(tables.card_types![0]!)).not.toContain('branch_kind');
    const board = all(old, 'SELECT * FROM boards')[0]!;
    delete board.workspace_key;
    old.close();
    const file = parseExportFile(
      JSON.stringify({
        fazai: 'board-export',
        formatVersion: 1,
        schemaVersion: 29,
        extensionVersion: '0.39.0',
        exportedAt: '',
        board,
        tables,
        files: [],
      }),
    );

    importBoard(target(router), file);

    const kinds = Object.fromEntries(
      all(db, 'SELECT name, branch_kind FROM card_types WHERE board_id = ?', ['b']).map((r) => [str(r.name), str(r.branch_kind)]),
    );
    expect(kinds).toEqual({ História: 'feature', Bug: 'hotfix', Retrabalho: 'bugfix' });
  });

  it('atomicidade: base64 inválido lança antes de tocar o banco, e o board original fica como estava', () => {
    const before = comparable(router.snapshot());
    const files = readAll(router);
    const { file } = doExport();
    file.files[1]!.base64 = '%%% não é base64';
    expect(() => importBoard(target(router), file)).toThrow(/Anexo "(foto\.png|spec\.md)" com conteúdo inválido no arquivo\./);
    expect(comparable(openRouter(db, 'ws-a', 'A').snapshot())).toEqual(before);
    expect(readAll(router)).toEqual(files);
  });

  it('se a cópia de segurança falhar, nada é apagado', () => {
    const before = comparable(router.snapshot());
    const { file } = doExport();
    expect(() =>
      importBoard(
        target(router, () => {
          throw new Error('disco cheio');
        }),
        file,
      ),
    ).toThrow('disco cheio');
    expect(comparable(openRouter(db, 'ws-a', 'A').snapshot())).toEqual(before);
  });

  it('anexo sem conteúdo no arquivo é importado como registro, sem arquivo, e vai aos avisos', () => {
    const { file } = doExport();
    const a = file.tables.attachments!.find((x) => x.filename === 'foto.png')!;
    delete file.files.find((x) => x.attachmentId === a.id)!.base64;
    const result = importBoard(target(router), file);
    const sub = router.snapshot().cards.find((c) => c.id === subId)!;
    expect(result.warnings).toEqual([`#${sub.number}`]);
    expect(result.attachments).toBe(2);
    const snap = openRouter(db, 'ws-a', 'A').snapshot();
    const imported = snap.attachments.find((x) => x.id === a.id)!;
    expect(imported.filename).toBe('foto.png');
    expect(fs.existsSync(router.store.pathOf(imported))).toBe(false);
  });

  it('o mesmo arquivo importado em outra pasta do mesmo banco é recusado em vez de engolir o outro board', () => {
    const { file } = doExport();
    const other = openRouter(db, 'ws-b', 'B');
    expect(() => importBoard({ ...target(other), workspaceKey: 'ws-b', boardId: other.boardId }, file)).toThrow(
      'Este board já foi importado em outra pasta que usa o mesmo banco.',
    );
    expect(openRouter(db, 'ws-b', 'B').snapshot().board.name).toBe('B');
  });

  it('.bak: com o banco em arquivo, a cópia de segurança é gravada antes e abre com o board anterior', async () => {
    const dbFile = path.join(dir, 'boards', 'a.db');
    const handle = await openFile(dbFile, WASM_DIR, 10);
    const r = new MessageRouter(handle, {
      workspaceKey: 'ws-file',
      folderName: 'F',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'att-file'),
      workspaceDir: path.join(dir, 'ws-file'),
      homeDir: path.join(dir, 'home'),
    });
    r.handle({ type: 'settings.board.update', patch: { name: 'Antes' } });
    await handle.flush();
    const { file } = doExport();
    importBoard({ db: handle.db, backup: () => handle.backup(), store: r.store, workspaceKey: 'ws-file', boardId: r.boardId }, file);
    await handle.flush();
    expect(fs.existsSync(`${dbFile}.bak`)).toBe(true);
    const bak = await openFile(`${dbFile}.bak`, WASM_DIR);
    expect(all(bak.db, 'SELECT name FROM boards').map((b) => b.name)).toEqual(['Antes']);
    await bak.close();
    const reopened = await openFile(dbFile, WASM_DIR);
    expect(all(reopened.db, 'SELECT name FROM boards').map((b) => b.name)).toEqual(['Meu Board']);
    expect(all(reopened.db, 'SELECT COUNT(*) AS n FROM cards')[0]!.n).toBe(4);
    await reopened.close();
    await handle.close();
  });
});

describe('artefatos do board no export e no import', () => {
  const BIN = Buffer.from([0, 255, 1, 254, 2]);
  const MCP_META = JSON.stringify({
    server: { command: 'npx', env: { GITHUB_TOKEN: 'ghp_segredo', LOG: 'x' }, headers: { Authorization: 'Bearer abc' } },
  });

  function seedArtifacts(): void {
    const b = router.boardId;
    const ins = (id: string, kind: string, name: string, meta = '{}') =>
      run(
        db,
        `INSERT INTO board_artifacts (id, board_id, kind, name, description, body, meta_json, usage, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'd', 'corpo', ?, 'always', 1, 2)`,
        [id, b, kind, name, meta],
      );
    ins('a-skill', 'skill', 'revisar');
    ins('a-agent', 'agent', 'dev');
    ins('a-mcp', 'mcp', 'github', MCP_META);
    run(
      db,
      "INSERT INTO board_artifact_files (artifact_id, path, content, encoding, size) VALUES ('a-skill', 'refs/a.md', 'texto', 'utf8', 5)",
    );
    run(
      db,
      "INSERT INTO board_artifact_files (artifact_id, path, content, encoding, size) VALUES ('a-skill', 'bin/x.dat', ?, 'base64', 5)",
      [BIN.toString('base64')],
    );
  }

  const artifactRows = (d: Database) => ({
    artifacts: all(d, 'SELECT * FROM board_artifacts ORDER BY id'),
    files: all(d, 'SELECT * FROM board_artifact_files ORDER BY artifact_id, path'),
  });

  it('o arquivo leva referências MCP sem valores de configuração', () => {
    seedArtifacts();
    const { file } = doExport();
    expect(file.tables.board_artifacts).toHaveLength(3);
    expect(file.tables.board_artifact_files).toHaveLength(2);
    const mcp = file.tables.board_artifacts!.find((r) => r.kind === 'mcp')!;
    expect(JSON.parse(str(mcp.meta_json))).toEqual({ server: { secretRef: mcp.secret_ref }, transport: 'stdio' });
    expect(JSON.stringify(file)).not.toContain('ghp_segredo');
    expect(JSON.stringify(file)).not.toContain('Bearer abc');
    // O legado só troca os valores por referência depois de confirmar o cofre.
    expect(str(all(db, "SELECT meta_json FROM board_artifacts WHERE id = 'a-mcp'")[0]!.meta_json)).not.toContain('ghp_segredo');
  });

  it('ida e volta por cima do mesmo board: artefatos e arquivo binário voltam iguais; mcpSecrets lista as chaves vazias', () => {
    seedArtifacts();
    const before = artifactRows(db);
    const text = JSON.stringify(doExport().file);
    const result = importBoard(target(router), parseExportFile(text));
    expect(result.mcpSecrets).toEqual(['github: revisão da configuração local']);
    const after = artifactRows(db);
    expect(after.files).toEqual(before.files);
    const bin = after.files.find((f) => f.path === 'bin/x.dat')!;
    expect(Buffer.from(str(bin.content), 'base64')).toEqual(BIN);
    // só o MCP muda (segredos zerados)
    expect(after.artifacts.filter((a) => a.kind !== 'mcp')).toEqual(before.artifacts.filter((a) => a.kind !== 'mcp'));
    expect(str(after.artifacts.find((a) => a.kind === 'mcp')!.meta_json)).not.toContain('ghp_segredo');
  });

  it('ida e volta num banco limpo', async () => {
    seedArtifacts();
    const text = JSON.stringify(doExport().file);
    const fresh = await openInMemory(WASM_DIR);
    const r2 = new MessageRouter({ db: fresh, scheduleSave: () => {}, close: async () => {}, backup: () => {} } as never, {
      workspaceKey: 'ws-z',
      folderName: 'Z',
      author: 'Pessoa',
      attachmentsDir: path.join(dir, 'attachments-z'),
      workspaceDir: path.join(dir, 'ws-z'),
      homeDir: path.join(dir, 'home'),
    });
    const result = importBoard({ db: fresh, store: r2.store, workspaceKey: 'ws-z', boardId: r2.boardId }, parseExportFile(text));
    expect(result.mcpSecrets).toHaveLength(1);
    const rows = artifactRows(fresh);
    expect(rows.artifacts.map((a) => a.id)).toEqual(['a-agent', 'a-mcp', 'a-skill']);
    expect(rows.files.map((f) => [f.artifact_id, f.path])).toEqual([
      ['a-skill', 'bin/x.dat'],
      ['a-skill', 'refs/a.md'],
    ]);
    expect(Buffer.from(str(rows.files[0]!.content), 'base64')).toEqual(BIN);
  });

  it('export de versão anterior à 33: as tabelas novas valem vazias', () => {
    const f = doExport().file as any;
    f.schemaVersion = 32;
    delete f.tables.ai_profiles;
    delete f.tables.board_artifacts;
    delete f.tables.board_artifact_files;
    const parsed = parseExportFile(JSON.stringify(f));
    expect(parsed.tables.board_artifacts).toEqual([]);
    expect(parsed.tables.board_artifact_files).toEqual([]);
    expect(importBoard(target(router), parsed).mcpSecrets).toEqual([]);
  });

  it('recusa nome de skill/agente e caminho de apoio inseguros', () => {
    seedArtifacts();
    const bad = (mut: (f: any) => void): string => {
      const f = doExport().file;
      mut(f);
      return JSON.stringify(f);
    };
    const named = (kind: string, name: string) => bad((f) => (f.tables.board_artifacts.find((r: any) => r.kind === kind).name = name));
    for (const n of ['../x', 'a/b', '..', '']) {
      expect(() => parseExportFile(named('skill', n))).toThrow('Arquivo não é um export do Faz AI: nome de skill ou agente inválido.');
      expect(() => parseExportFile(named('agent', n))).toThrow('nome de skill ou agente inválido');
    }
    // regra e MCP têm nome livre (caminho de origem, nome do servidor)
    expect(() => parseExportFile(named('mcp', 'a/b'))).not.toThrow();
    for (const p of ['../x', '/etc/passwd', 'a/../b', 'a\\b', 'C:/x', '']) {
      expect(() => parseExportFile(bad((f) => (f.tables.board_artifact_files[0].path = p)))).toThrow(
        'Arquivo não é um export do Faz AI: caminho de arquivo de apoio inválido.',
      );
    }
  });
});
