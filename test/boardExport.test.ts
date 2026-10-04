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
  parseExportFile,
  summarize,
  type BoardExportFile,
} from '../src/extension/db/boardExport';
import { SCHEMA_VERSION } from '../src/extension/db/schema';
import { all, str } from '../src/extension/db/query';
import { MessageRouter } from '../src/extension/panel/messageRouter';
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
  const bad = (mut: (f: BoardExportFile & Record<string, unknown>) => void): string => {
    const f = valid() as BoardExportFile & Record<string, unknown>;
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
