import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { ChecklistRepo } from '../src/extension/repositories/checklistRepo';
import { SettingsRepo } from '../src/extension/repositories/settingsRepo';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let boards: BoardRepo;
let cards: CardRepo;
let checklist: ChecklistRepo;
let settings: SettingsRepo;
let boardId: string;

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  boards = new BoardRepo(db);
  cards = new CardRepo(db);
  checklist = new ChecklistRepo(db);
  settings = new SettingsRepo(db);
  boardId = boards.getOrCreate('ws-1', 'Projeto X').id;
});

const snap = () => boards.snapshot(boardId);
const parentWf = () => snap().workflows.find((w) => w.kind === 'parent')!;
const childWf = () => snap().workflows.find((w) => w.kind === 'child')!;
const colsOf = (wfId: string) => snap().columns.filter((c) => c.workflowId === wfId);
const typeNamed = (n: string) => snap().cardTypes.find((t) => t.name === n)!;

describe('seed', () => {
  it('cria board com dois workflows, colunas, tipos e campos padrão', () => {
    const s = snap();
    expect(s.workflows).toHaveLength(2);
    expect(colsOf(parentWf().id).map((c) => c.name)).toEqual([
      'Backlog',
      'Discovery',
      'PRD',
      'Spec',
      'Plan',
      'Implementação',
      'Homologação',
      'Concluído',
      'Cancelado',
    ]);
    expect(colsOf(childWf().id).map((c) => c.name)).toEqual(['A fazer', 'Em andamento', 'Concluído']);
    expect(s.cardTypes.map((t) => t.name)).toContain('Sub-tarefa');
    expect(s.fieldDefs.map((f) => f.name)).toEqual(['Fase', 'Tags', 'Esforço da atividade', 'Modelo', 'Skills']);
  });

  it('getOrCreate é idempotente por workspace', () => {
    expect(boards.getOrCreate('ws-1', 'outro').id).toBe(boardId);
    expect(boards.getOrCreate('ws-2', 'outro').id).not.toBe(boardId);
  });
});

describe('cards', () => {
  it('cria história e sub-tarefa ligada ao pai', () => {
    const backlog = colsOf(parentWf().id)[0]!;
    const story = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog.id, parentId: null, title: 'Login' });
    const todo = colsOf(childWf().id)[0]!;
    const sub = cards.create(boardId, { typeId: typeNamed('Sub-tarefa').id, columnId: todo.id, parentId: story, title: 'PRD' });
    const s = snap();
    expect(s.cards.find((c) => c.id === sub)?.parentId).toBe(story);
  });

  it('rejeita sub-tarefa sem pai e história com pai', () => {
    const todo = colsOf(childWf().id)[0]!;
    expect(() => cards.create(boardId, { typeId: typeNamed('Sub-tarefa').id, columnId: todo.id, parentId: null, title: 'x' })).toThrow();
    const backlog = colsOf(parentWf().id)[0]!;
    const story = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog.id, parentId: null, title: 'a' });
    expect(() => cards.create(boardId, { typeId: typeNamed('Bug').id, columnId: backlog.id, parentId: story, title: 'b' })).toThrow();
  });

  it('move dentro do workflow e reindexa; rejeita entre workflows', () => {
    const [backlog, doing] = colsOf(parentWf().id);
    const a = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog!.id, parentId: null, title: 'a' });
    const b = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog!.id, parentId: null, title: 'b' });
    const c = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog!.id, parentId: null, title: 'c' });
    cards.move(a, doing!.id, 0);
    cards.move(c, backlog!.id, 0);
    const s = snap();
    const inBacklog = s.cards
      .filter((x) => x.columnId === backlog!.id)
      .sort((x, y) => x.position - y.position)
      .map((x) => x.id);
    expect(inBacklog).toEqual([c, b]);
    expect(s.cards.find((x) => x.id === a)?.columnId).toBe(doing!.id);
    expect(() => cards.move(a, colsOf(childWf().id)[0]!.id, 0)).toThrow();
  });

  it('apagar pai apaga filhos, valores de campo e checklist (cascade)', () => {
    const backlog = colsOf(parentWf().id)[0]!;
    const story = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog.id, parentId: null, title: 'a' });
    const sub = cards.create(boardId, {
      typeId: typeNamed('Sub-tarefa').id,
      columnId: colsOf(childWf().id)[0]!.id,
      parentId: story,
      title: 'b',
    });
    const fase = snap().fieldDefs.find((f) => f.name === 'Fase')!;
    cards.setFieldValue(sub, fase.id, 'PRD');
    checklist.add(story, 'passo 1');
    expect(snap().fieldValues).toHaveLength(1);
    cards.deletePermanent(story);
    const s = snap();
    expect(s.cards).toHaveLength(0);
    expect(s.fieldValues).toHaveLength(0);
    expect(s.checklistItems).toHaveLength(0);
  });

  it('setFieldValue com valor vazio remove a linha', () => {
    const backlog = colsOf(parentWf().id)[0]!;
    const story = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog.id, parentId: null, title: 'a' });
    const tags = snap().fieldDefs.find((f) => f.name === 'Tags')!;
    cards.setFieldValue(story, tags.id, ['infra']);
    expect(snap().fieldValues[0]?.value).toEqual(['infra']);
    cards.setFieldValue(story, tags.id, []);
    expect(snap().fieldValues).toHaveLength(0);
  });

  it('setBranchCreatedAt guarda quando a branch da história foi criada', () => {
    const backlog = colsOf(parentWf().id)[0]!;
    const story = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog.id, parentId: null, title: 'a' });
    expect(snap().cards[0]?.branchCreatedAt).toBe('');
    cards.setBranchCreatedAt(story, 1700000000000);
    expect(snap().cards.find((c) => c.id === story)?.branchCreatedAt).toBe('1700000000000');
  });
});

describe('settings', () => {
  it('cria, reordena e apaga coluna movendo cards', () => {
    const wf = parentWf().id;
    const review = settings.createColumn(wf, 'Review');
    settings.updateColumn(review, { position: 2 });
    expect(colsOf(wf).map((c) => c.name)).toEqual([
      'Backlog',
      'Discovery',
      'Review',
      'PRD',
      'Spec',
      'Plan',
      'Implementação',
      'Homologação',
      'Concluído',
      'Cancelado',
    ]);
    const card = cards.create(boardId, { typeId: typeNamed('História').id, columnId: review, parentId: null, title: 'a' });
    const done = colsOf(wf).find((c) => c.name === 'Concluído')!;
    settings.deleteColumn(review, done.id);
    expect(snap().cards.find((c) => c.id === card)?.columnId).toBe(done.id);
    expect(() => settings.deleteColumn(done.id, colsOf(childWf().id)[0]!.id)).toThrow();
  });

  it('cria a coluna antes da conclusão por padrão, ou na posição pedida', () => {
    const wf = parentWf().id;
    settings.createColumn(wf, 'QA');
    settings.createColumn(wf, 'Triagem', 1);
    settings.createColumn(wf, 'Fim', 99);
    expect(colsOf(wf).map((c) => c.name)).toEqual([
      'Backlog',
      'Triagem',
      'Discovery',
      'PRD',
      'Spec',
      'Plan',
      'Implementação',
      'Homologação',
      'QA',
      'Concluído',
      'Cancelado',
      'Fim',
    ]);
    expect(colsOf(wf).map((c) => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('não apaga tipo em uso', () => {
    const t = typeNamed('Bug');
    cards.create(boardId, { typeId: t.id, columnId: colsOf(parentWf().id)[0]!.id, parentId: null, title: 'a' });
    expect(() => settings.deleteType(t.id)).toThrow();
  });

  it('cria e atualiza campo custom', () => {
    const id = settings.createField(boardId, {
      name: 'Prioridade',
      kind: 'select',
      options: ['Alta', 'Baixa'],
      appliesToTypes: null,
      display: 'badge',
    });
    settings.updateField(id, { options: ['Alta', 'Média', 'Baixa'], appliesToTypes: [typeNamed('Bug').id] });
    const f = snap().fieldDefs.find((x) => x.id === id)!;
    expect(f.options).toHaveLength(3);
    expect(f.appliesToTypes).toEqual([typeNamed('Bug').id]);
  });
});

describe('número do card', () => {
  it('é sequencial por board e não é reutilizado depois de apagar', () => {
    const mk = (title: string) =>
      cards.create(boardId, { typeId: typeNamed('História').id, columnId: colsOf(parentWf().id)[0]!.id, parentId: null, title });
    const numberOf = (id: string) => snap().cards.find((c) => c.id === id)?.number;
    const a = mk('a');
    const b = mk('b');
    expect([numberOf(a), numberOf(b)]).toEqual([1, 2]);
    cards.deletePermanent(b);
    expect(numberOf(mk('c'))).toBe(3);

    const other = boards.getOrCreate('ws-2', 'Outro').id;
    const s = boards.snapshot(other);
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const id = cards.create(other, {
      typeId: s.cardTypes.find((t) => t.name === 'História')!.id,
      columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
      parentId: null,
      title: 'x',
    });
    expect(boards.snapshot(other).cards.find((c) => c.id === id)?.number).toBe(1);
  });
});
