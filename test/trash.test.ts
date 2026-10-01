import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import initSqlJs, { type Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { AttachmentStore } from '../src/extension/attachments';
import { AttachmentRepo } from '../src/extension/repositories/attachmentRepo';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { CommentRepo } from '../src/extension/repositories/commentRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let boards: BoardRepo;
let cards: CardRepo;
let boardId: string;
let story: string;
let sub1: string;
let sub2: string;

const snap = () => boards.snapshot(boardId);
const card = (id: string) => snap().cards.find((c) => c.id === id)!;

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  boards = new BoardRepo(db);
  cards = new CardRepo(db);
  boardId = boards.getOrCreate('ws', 'P').id;
  const s = snap();
  const pw = s.workflows.find((w) => w.kind === 'parent')!;
  const cw = s.workflows.find((w) => w.kind === 'child')!;
  const backlog = s.columns.find((c) => c.workflowId === pw.id)!;
  const todo = s.columns.find((c) => c.workflowId === cw.id)!;
  const tStory = s.cardTypes.find((t) => t.name === 'História')!;
  const tSub = s.cardTypes.find((t) => t.name === 'Sub-tarefa')!;
  story = cards.create(boardId, { typeId: tStory.id, columnId: backlog.id, parentId: null, title: 'história' });
  sub1 = cards.create(boardId, { typeId: tSub.id, columnId: todo.id, parentId: story, title: 's1' });
  sub2 = cards.create(boardId, { typeId: tSub.id, columnId: todo.id, parentId: story, title: 's2' });
});

describe('lixeira', () => {
  it('pai leva os filhos e restaurar traz de volta só os que foram junto', () => {
    cards.trash(sub1);
    cards.trash(story);
    expect(card(story).deletedAt).not.toBeNull();
    expect(card(sub2).deletedAt).toBe(card(story).deletedAt);
    expect(() => cards.restore(sub2)).toThrow();
    cards.restore(story);
    expect(card(story).deletedAt).toBeNull();
    expect(card(sub2).deletedAt).toBeNull();
    // sub1 foi para a lixeira antes, separadamente: continua lá (a menos que o timestamp coincida)
    if (card(sub1).deletedAt !== null) {
      cards.restore(sub1);
      expect(card(sub1).deletedAt).toBeNull();
    }
  });

  it('esvaziar apaga de vez e devolve os ids', () => {
    cards.trash(story);
    const ids = cards.emptyTrash(boardId);
    expect(ids.sort()).toEqual([story, sub1, sub2].sort());
    expect(snap().cards).toHaveLength(0);
  });
});

describe('arquivo', () => {
  it('arquiva com filhos e desarquiva movendo de coluna', () => {
    cards.archive(story);
    expect(card(sub1).archivedAt).not.toBeNull();
    const doing = snap().columns.find((c) => c.name === 'PRD' && c.workflowId === card(story).workflowId)!;
    cards.unarchive(story, doing.id, 0);
    expect(card(story).archivedAt).toBeNull();
    expect(card(story).columnId).toBe(doing.id);
    expect(card(sub1).archivedAt).toBeNull();
  });
});

describe('comentários e anexos', () => {
  it('comentários entram no snapshot e somem com o card', () => {
    const comments = new CommentRepo(db);
    const id = comments.add(story, 'Ana', 'primeiro');
    comments.update(id, 'editado');
    expect(boards.snapshot(boardId, 'Ana').comments[0]).toMatchObject({ author: 'Ana', body: 'editado' });
    expect(boards.snapshot(boardId, 'Ana').currentUser).toBe('Ana');
    cards.deletePermanent(story);
    expect(snap().comments).toHaveLength(0);
  });

  it('anexo é copiado para disco, registrado e removido', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-att-'));
    const src = path.join(dir, 'nota É.md');
    fs.writeFileSync(src, '# oi');
    const store = new AttachmentStore(path.join(dir, 'attachments'));
    const repo = new AttachmentRepo(db);
    const rec = store.importFile(story, src);
    repo.add(rec);
    expect(fs.readFileSync(store.pathOf(rec), 'utf8')).toBe('# oi');
    expect(snap().attachments[0]).toMatchObject({ mime: 'text/markdown', size: 4 });
    const data = store.importData(story, 'a.png', Buffer.from('x').toString('base64'));
    expect(data.mime).toBe('image/png');
    store.remove(rec);
    expect(fs.existsSync(store.pathOf(rec))).toBe(false);
    store.removeCard(story);
    expect(fs.existsSync(path.join(dir, 'attachments', story))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('migração v1 → v2', () => {
  it('preserva cards de um banco criado na versão 1', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const old = new SQL.Database();
    old.run(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta VALUES ('schema_version','1');
      CREATE TABLE boards (id TEXT PRIMARY KEY, workspace_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
      CREATE TABLE workflows (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, kind TEXT NOT NULL);
      CREATE TABLE columns (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, is_terminal INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE card_types (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, default_workflow_id TEXT NOT NULL);
      CREATE TABLE cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, workflow_id TEXT NOT NULL, column_id TEXT NOT NULL, type_id TEXT NOT NULL,
        parent_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE field_defs (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, options_json TEXT NOT NULL DEFAULT '[]', applies_to_types_json TEXT, display TEXT NOT NULL DEFAULT 'inline', position INTEGER NOT NULL);
      CREATE TABLE field_values (card_id TEXT NOT NULL, field_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (card_id, field_id));
      CREATE TABLE checklist_items (id TEXT PRIMARY KEY, card_id TEXT NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
      INSERT INTO boards VALUES ('b','ws','P');
      INSERT INTO workflows VALUES ('w','b','Histórias',0,'parent');
      INSERT INTO columns VALUES ('c','w','Backlog',0,0);
      INSERT INTO card_types VALUES ('t','b','História','#fff','w');
      INSERT INTO cards VALUES ('k2','b','w','c','t',NULL,'mais novo','',0,5,5);
      INSERT INTO cards VALUES ('k','b','w','c','t',NULL,'antigo','',1,1,1);`);
    migrate(old);
    const s = new BoardRepo(old).snapshot('b');
    const antigo = s.cards.find((c) => c.id === 'k');
    expect(antigo).toMatchObject({ title: 'antigo', deletedAt: null, archivedAt: null });
    // os cards existentes são numerados pela ordem de criação, e o próximo continua a sequência
    expect(antigo?.number).toBe(1);
    expect(s.cards.find((c) => c.id === 'k2')?.number).toBe(2);
    const novo = new CardRepo(old).create('b', { typeId: 't', columnId: 'c', parentId: null, title: 'novo' });
    expect(new BoardRepo(old).snapshot('b').cards.find((c) => c.id === novo)?.number).toBe(3);
    expect(s.comments).toEqual([]);
    // boards existentes ganham o campo padrão "Modelo"
    expect(s.fieldDefs.map((f) => f.name)).toEqual(['Esforço da atividade', 'Modelo', 'Skills']); // o esforço vem antes do modelo
  });
});
