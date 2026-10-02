import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { migrate } from '../src/extension/db/schema';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { SettingsRepo } from '../src/extension/repositories/settingsRepo';
import { DEFAULT_RULES, parseRules } from '../src/shared/rules';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let boards: BoardRepo;
let cards: CardRepo;
let boardId: string;
let story: string;
let sub1: string;
let sub2: string;

const snap = () => boards.snapshot(boardId);
const col = (kind: 'parent' | 'child', name: string) => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === kind)!;
  return s.columns.find((c) => c.workflowId === wf.id && c.name === name)!;
};
const columnOf = (id: string) => snap().columns.find((c) => c.id === snap().cards.find((k) => k.id === id)!.columnId)!.name;

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  boards = new BoardRepo(db);
  cards = new CardRepo(db);
  boardId = boards.getOrCreate('ws', 'P').id;
  const s = snap();
  const tStory = s.cardTypes.find((t) => t.name === 'História')!;
  const tSub = s.cardTypes.find((t) => t.name === 'Sub-tarefa')!;
  story = cards.create(boardId, { typeId: tStory.id, columnId: col('parent', 'Backlog').id, parentId: null, title: 'Login' });
  sub1 = cards.create(boardId, { typeId: tSub.id, columnId: col('child', 'A fazer').id, parentId: story, title: 's1' });
  sub2 = cards.create(boardId, { typeId: tSub.id, columnId: col('child', 'Concluído').id, parentId: story, title: 's2' });
});

describe('categoria de coluna', () => {
  it('seed classifica as colunas', () => {
    expect(col('parent', 'Concluído')).toMatchObject({ category: 'done', isTerminal: true });
    expect(col('parent', 'Cancelado')).toMatchObject({ category: 'cancelled', isTerminal: true });
    expect(col('parent', 'Backlog')).toMatchObject({ category: 'open', isTerminal: false });
  });

  it('updateColumn troca a categoria', () => {
    new SettingsRepo(db).updateColumn(col('parent', 'PRD').id, { category: 'done' });
    expect(col('parent', 'PRD').category).toBe('done');
  });

  it('migração 2 → 3 deriva a categoria de is_terminal e do nome', async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => path.join(WASM_DIR, f) });
    const old = new SQL.Database();
    old.run(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta VALUES ('schema_version','2');
      CREATE TABLE boards (id TEXT PRIMARY KEY, workspace_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
      CREATE TABLE cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE attachments (id TEXT PRIMARY KEY, card_id TEXT NOT NULL);
      CREATE TABLE comments (id TEXT PRIMARY KEY, card_id TEXT NOT NULL);
      CREATE TABLE field_defs (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, options_json TEXT NOT NULL DEFAULT '[]', applies_to_types_json TEXT, display TEXT NOT NULL DEFAULT 'inline', position INTEGER NOT NULL);
      CREATE TABLE card_types (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, default_workflow_id TEXT NOT NULL);
      CREATE TABLE field_values (card_id TEXT NOT NULL, field_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY (card_id, field_id));
      CREATE TABLE workflows (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, kind TEXT NOT NULL);
      CREATE TABLE columns (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, is_terminal INTEGER NOT NULL DEFAULT 0);
      INSERT INTO columns VALUES ('a','w','Backlog',0,0), ('b','w','Concluído',1,1), ('c','w','Cancelado',2,1), ('d','w','Entregue',3,1);`);
    migrate(old);
    const rows = old.exec('SELECT id, category FROM columns ORDER BY id')[0]!.values;
    expect(rows).toEqual([['a', 'open'], ['b', 'done'], ['c', 'cancelled'], ['d', 'done']]);
  });
});

describe('regra: pai só conclui sem sub-tarefas em aberto', () => {
  const done = () => col('parent', 'Concluído').id;

  it('recusa com sub-tarefa em aberto e mantém o card onde estava', () => {
    expect(() => cards.move(story, done(), 0)).toThrow(/1 sub-tarefa\(s\) ainda em aberto/);
    expect(columnOf(story)).toBe('Backlog');
  });

  it('permite outras colunas, inclusive cancelar', () => {
    cards.move(story, col('parent', 'PRD').id, 0);
    cards.move(story, col('parent', 'Cancelado').id, 0);
    expect(columnOf(story)).toBe('Cancelado');
  });

  it('permite quando as sub-tarefas estão concluídas', () => {
    cards.move(sub1, col('child', 'Concluído').id, 0);
    cards.move(story, done(), 0);
    expect(columnOf(story)).toBe('Concluído');
  });

  it('sub-tarefa arquivada ou na lixeira não bloqueia', () => {
    cards.archive(sub1);
    cards.move(story, done(), 0);
    expect(columnOf(story)).toBe('Concluído');
    cards.move(story, col('parent', 'Backlog').id, 0);
    cards.unarchive(sub1);
    expect(() => cards.move(story, done(), 0)).toThrow();
    cards.trash(sub1);
    cards.move(story, done(), 0);
    expect(columnOf(story)).toBe('Concluído');
  });

  it('desarquivar direto para Concluído respeita a regra e não desarquiva pela metade', () => {
    cards.archive(story);
    expect(() => cards.unarchive(story, done(), 0)).toThrow();
    expect(snap().cards.find((c) => c.id === story)!.archivedAt).not.toBeNull();
    expect(snap().cards.find((c) => c.id === sub1)!.archivedAt).not.toBeNull();
  });

  it('sub-tarefas e histórias sem filhos se movem livremente', () => {
    cards.move(sub1, col('child', 'Concluído').id, 0);
    const t = snap().cardTypes.find((x) => x.name === 'Bug')!;
    const solo = cards.create(boardId, { typeId: t.id, columnId: col('parent', 'Backlog').id, parentId: null, title: 'solo' });
    cards.move(solo, done(), 0);
    expect(columnOf(solo)).toBe('Concluído');
    expect(sub2).toBeTruthy();
  });
});

describe('cancelar história levando as sub-tarefas', () => {
  it('move só as sub-tarefas em aberto e cria a coluna de cancelamento se faltar', () => {
    const cancelled = col('parent', 'Cancelado').id;
    expect(snap().columns.filter((c) => c.category === 'cancelled')).toHaveLength(1);
    cards.move(story, cancelled, 0, { cancelChildren: true });
    expect(columnOf(story)).toBe('Cancelado');
    expect(columnOf(sub1)).toBe('Cancelado');
    expect(columnOf(sub2)).toBe('Concluído');
    expect(col('child', 'Cancelado')).toMatchObject({ category: 'cancelled', position: 3 });
  });

  it('sem a opção, as sub-tarefas ficam onde estão', () => {
    cards.move(story, col('parent', 'Cancelado').id, 0);
    expect(columnOf(sub1)).toBe('A fazer');
  });

  it('a opção não tem efeito fora de colunas de cancelamento', () => {
    cards.move(story, col('parent', 'PRD').id, 0, { cancelChildren: true });
    expect(columnOf(sub1)).toBe('A fazer');
  });
});

describe('regras configuráveis', () => {
  it('board novo e banco antigo usam os padrões; valores inválidos são ignorados', () => {
    expect(snap().board.rules).toEqual(DEFAULT_RULES);
    expect(parseRules('{"onCancelParent":"xyz","confirmTrash":"never","blockDoneWithOpenChildren":"sim"}')).toEqual({ ...DEFAULT_RULES, confirmTrash: 'never' });
    expect(parseRules('não é json')).toEqual(DEFAULT_RULES);
    expect(DEFAULT_RULES.onAllChildrenDone).toBe('ask');
    expect(parseRules('{"onAllChildrenDone":"auto"}').onAllChildrenDone).toBe('auto');
  });

  it('updateRules persiste só o que foi alterado', () => {
    boards.updateRules(boardId, { onCancelParent: 'cascade' });
    boards.updateRules(boardId, { confirmArchive: 'always' });
    expect(snap().board.rules).toEqual({ ...DEFAULT_RULES, onCancelParent: 'cascade', confirmArchive: 'always' });
  });

  it('desligar o bloqueio permite concluir com sub-tarefas em aberto', () => {
    const done = col('parent', 'Concluído').id;
    expect(() => cards.move(story, done, 0)).toThrow();
    boards.updateRules(boardId, { blockDoneWithOpenChildren: false });
    cards.move(story, done, 0);
    expect(columnOf(story)).toBe('Concluído');
    expect(columnOf(sub1)).toBe('A fazer');
  });
});

describe('regra: história só avança de fase sem sub-tarefas da fase em aberto', () => {
  const setFase = (cardId: string, fase: string) => cards.setFieldValue(cardId, snap().fieldDefs.find((f) => f.name === 'Fase')!.id, fase);
  const mk = (title: string, parentId: string | null) =>
    cards.create(boardId, { typeId: snap().cardTypes.find((t) => t.name === (parentId ? 'Sub-tarefa' : 'História'))!.id, columnId: col(parentId ? 'child' : 'parent', parentId ? 'A fazer' : 'PRD').id, parentId, title });

  it('bloqueia avançar, mas deixa voltar, cancelar e avançar com sub-tarefas de outra fase', () => {
    const story = mk('h', null);
    const prdTask = mk('escrever prd', story);
    setFase(prdTask, 'PRD');
    const specTask = mk('escrever spec', story);
    setFase(specTask, 'Spec');
    mk('sem fase', story);

    expect(() => cards.move(story, col('parent', 'Spec').id, 0)).toThrow(/1 sub-tarefa\(s\) da fase PRD/);
    cards.move(story, col('parent', 'Backlog').id, 0); // voltar é livre
    cards.move(story, col('parent', 'PRD').id, 0);
    cards.move(prdTask, col('child', 'Concluído').id, 0);
    cards.move(story, col('parent', 'Spec').id, 0); // a sub-tarefa de Spec e a sem fase não seguram a saída do PRD
    expect(() => cards.move(story, col('parent', 'Plan').id, 0)).toThrow(/fase Spec/);
    cards.move(story, col('parent', 'Cancelado').id, 0); // cancelar é livre
    expect(columnOf(story)).toBe('Cancelado');
  });

  it('pode ser desligada', () => {
    const story = mk('h', null);
    setFase(mk('t', story), 'PRD');
    boards.updateRules(boardId, { blockPhaseAdvanceWithOpenChildren: false });
    cards.move(story, col('parent', 'Spec').id, 0);
    expect(columnOf(story)).toBe('Spec');
  });
});
