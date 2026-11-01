import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { ChecklistRepo } from '../src/extension/repositories/checklistRepo';
import { CommentRepo } from '../src/extension/repositories/commentRepo';
import { LinkRepo } from '../src/extension/repositories/linkRepo';
import { run } from '../src/extension/db/query';
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
      'Revisão',
      'Homologação',
      'Concluído',
      'Cancelado',
    ]);
    expect(colsOf(childWf().id).map((c) => c.name)).toEqual(['A fazer', 'Em andamento', 'Concluído']);
    expect(s.cardTypes.map((t) => t.name)).toContain('Sub-tarefa');
    expect(s.fieldDefs.map((f) => f.name)).toEqual(['Fase', 'Tags', 'Esforço da atividade', 'Modelo', 'Skills', 'Rules', 'MCPs']);
  });

  it('getOrCreate é idempotente por workspace', () => {
    expect(boards.getOrCreate('ws-1', 'outro').id).toBe(boardId);
    expect(boards.getOrCreate('ws-2', 'outro').id).not.toBe(boardId);
  });
});

describe('cards', () => {
  it('perguntas pendentes entram no snapshot e podem ser apagadas sem alterar updated_at', () => {
    const backlog = colsOf(parentWf().id)[0]!;
    const id = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog.id, parentId: null, title: 'Decisão' });
    const original = snap().cards.find((c) => c.id === id)!;
    const questions = [{ id: 'q1', question: 'Usar fila?', options: ['Sim', 'Não'], recommended: 'Sim' }];
    cards.setQuestions(id, questions);
    expect(snap().cards.find((c) => c.id === id)).toMatchObject({ questions, updatedAt: original.updatedAt });
    cards.setQuestions(id, []);
    expect(snap().cards.find((c) => c.id === id)).toMatchObject({ questions: [], updatedAt: original.updatedAt });
  });

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

  it('mover um card em execução para outra coluna em que a IA atua mantém "running"; para as demais, o status recomeça', () => {
    const [todo, doing, done] = colsOf(childWf().id);
    const backlog = colsOf(parentWf().id)[0]!;
    const story = cards.create(boardId, { typeId: typeNamed('História').id, columnId: backlog.id, parentId: null, title: 'h' });
    const sub = cards.create(boardId, { typeId: typeNamed('Sub-tarefa').id, columnId: todo!.id, parentId: story, title: 's' });
    const statusOf = () => snap().cards.find((c) => c.id === sub)?.status;
    // start_work e depois "Em andamento": o LED da sub-tarefa continua aceso
    cards.setStatus(sub, 'running', '', 'Claude Code');
    cards.move(sub, doing!.id, 0);
    expect(statusOf()).toBe('running');
    // um status que não é execução recomeça ao trocar de coluna
    cards.setStatus(sub, 'waiting_answer', '', 'Claude Code');
    cards.move(sub, todo!.id, 0);
    expect(statusOf()).toBe('ready');
    // na conclusão não há status de trabalho, mesmo em execução
    cards.setStatus(sub, 'running', '', 'Claude Code');
    cards.move(sub, done!.id, 0);
    expect(statusOf()).toBeNull();
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

describe('duplicar card', () => {
  const story = (title = 'Login') =>
    cards.create(boardId, { typeId: typeNamed('História').id, columnId: colsOf(parentWf().id)[0]!.id, parentId: null, title });

  it('copia título, descrição, tipo e campos para a primeira coluna, com número novo e status inicial', () => {
    const [backlog, doing] = colsOf(parentWf().id);
    const orig = story();
    cards.update(orig, { description: 'Corpo **md**' });
    const tags = snap().fieldDefs.find((f) => f.name === 'Tags')!;
    cards.setFieldValue(orig, tags.id, ['infra']);
    cards.move(orig, doing!.id, 0);
    cards.setStatus(orig, 'running', '', 'Claude Code');
    cards.setBranchCreatedAt(orig, 1700000000000);

    const copy = cards.duplicate(boardId, orig, 'Cópia de Login');
    const s = snap();
    const o = s.cards.find((c) => c.id === orig)!;
    const c = s.cards.find((x) => x.id === copy)!;
    expect(c).toMatchObject({
      title: 'Cópia de Login',
      description: 'Corpo **md**',
      typeId: o.typeId,
      parentId: null,
      columnId: backlog!.id,
    });
    expect(c.number).toBeGreaterThan(o.number);
    expect(c.status).not.toBe('running');
    expect(c.branchCreatedAt).toBe('');
    expect(s.fieldValues.find((v) => v.cardId === copy && v.fieldId === tags.id)?.value).toEqual(['infra']);
    // o original não muda
    expect(o).toMatchObject({ title: 'Login', columnId: doing!.id });
  });

  it('copia o checklist desmarcado, com ids novos e a mesma ordem', () => {
    const orig = story();
    const a = checklist.add(orig, 'passo 1');
    checklist.add(orig, 'passo 2');
    checklist.update(a, { done: true });
    const copy = cards.duplicate(boardId, orig, 'Cópia');
    const items = snap()
      .checklistItems.filter((i) => i.cardId === copy)
      .sort((x, y) => x.position - y.position);
    expect(items.map((i) => [i.text, i.done])).toEqual([
      ['passo 1', false],
      ['passo 2', false],
    ]);
    expect(items.some((i) => i.id === a)).toBe(false);
    // o checklist do original continua marcado
    expect(snap().checklistItems.find((i) => i.id === a)?.done).toBe(true);
  });

  it('não copia sub-tarefas, anexos, comentários nem vínculos', () => {
    const orig = story();
    const other = story('Outra');
    const sub = cards.create(boardId, {
      typeId: typeNamed('Sub-tarefa').id,
      columnId: colsOf(childWf().id)[0]!.id,
      parentId: orig,
      title: 's',
    });
    new CommentRepo(db).add(orig, 'Eu', 'oi', 'human');
    new LinkRepo(db).add(orig, other, 'related');
    db.run(
      "INSERT INTO attachments(id, card_id, filename, stored_name, mime, size, created_at) VALUES ('a1', ?, 'f.md', 'f', 'text/markdown', 1, 0)",
      [orig],
    );

    const copy = cards.duplicate(boardId, orig, 'Cópia');
    const s = snap();
    expect(s.cards.filter((c) => c.parentId === copy)).toHaveLength(0);
    expect(s.cards.find((c) => c.id === sub)?.parentId).toBe(orig);
    expect(s.comments.filter((c) => c.cardId === copy)).toHaveLength(0);
    expect(s.links.filter((l) => l.fromId === copy || l.toId === copy)).toHaveLength(0);
    expect(db.exec('SELECT 1 FROM attachments WHERE card_id = ?', [copy])).toHaveLength(0);
  });

  it('sub-tarefa duplicada mantém o pai e vai para a primeira coluna do workflow filho', () => {
    const parent = story();
    const [todo, doing] = colsOf(childWf().id);
    const sub = cards.create(boardId, { typeId: typeNamed('Sub-tarefa').id, columnId: todo!.id, parentId: parent, title: 's' });
    cards.move(sub, doing!.id, 0);
    const copy = cards.duplicate(boardId, sub, 'Cópia de s');
    expect(snap().cards.find((c) => c.id === copy)).toMatchObject({ parentId: parent, columnId: todo!.id });
  });

  it('título vazio cai no padrão e card inexistente dá erro', () => {
    const orig = story();
    const blank = cards.duplicate(boardId, orig, '  ');
    expect(snap().cards.find((c) => c.id === blank)?.title).toBe('Sem título');
    expect(() => cards.duplicate(boardId, 'nao-existe', 'x')).toThrow('Card não encontrado');
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
      'Revisão',
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
      'Revisão',
      'Homologação',
      'QA',
      'Concluído',
      'Cancelado',
      'Fim',
    ]);
    expect(colsOf(wf).map((c) => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('não apaga tipo em uso', () => {
    const t = typeNamed('Bug');
    cards.create(boardId, { typeId: t.id, columnId: colsOf(parentWf().id)[0]!.id, parentId: null, title: 'a' });
    expect(() => settings.deleteType(t.id)).toThrow();
  });

  it('o board novo traz o tipo de branch de cada tipo: Hotfix em hotfix, Retrabalho e Bug em bugfix, o resto em feature', () => {
    const kinds = Object.fromEntries(snap().cardTypes.map((t) => [t.name, t.branchKind]));
    expect(kinds).toEqual({
      História: 'feature',
      Retrabalho: 'bugfix',
      Bug: 'bugfix',
      Hotfix: 'hotfix',
      'Débito técnico': 'feature',
      'Sub-tarefa': 'feature',
    });
  });

  it('tipo criado nasce em feature, e updateType troca o tipo de branch sem mexer no resto', () => {
    const id = settings.createType(boardId, 'Melhoria', '#123456', parentWf().id);
    expect(snap().cardTypes.find((t) => t.id === id)?.branchKind).toBe('feature');

    settings.updateType(id, { branchKind: 'bugfix' });
    expect(snap().cardTypes.find((t) => t.id === id)).toMatchObject({ name: 'Melhoria', color: '#123456', branchKind: 'bugfix' });

    // renomear não muda o tipo de branch (RF06)
    settings.updateType(id, { name: 'Ajuste' });
    expect(snap().cardTypes.find((t) => t.id === id)).toMatchObject({ name: 'Ajuste', branchKind: 'bugfix' });
  });

  it('updateType recusa tipo de branch fora de feature, bugfix e hotfix (inclusive release) e não grava nada do patch', () => {
    const bug = typeNamed('Bug');
    for (const bad of ['release', 'develop', '']) {
      expect(() => settings.updateType(bug.id, { name: 'Outro', branchKind: bad as never })).toThrow(/Tipo de branch inválido/);
    }
    expect(typeNamed('Bug')).toMatchObject({ name: 'Bug', branchKind: 'bugfix' });
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

describe('meta', () => {
  it('getMeta devolve undefined quando a chave não existe', () => {
    expect(boards.getMeta('git.user')).toBeUndefined();
  });

  it('setMeta grava e getMeta lê o valor', () => {
    boards.setMeta('git.user', 'alice');
    expect(boards.getMeta('git.user')).toBe('alice');
  });

  it('setMeta chamado duas vezes substitui o valor', () => {
    boards.setMeta('git.user', 'alice');
    boards.setMeta('git.user', 'bob');
    expect(boards.getMeta('git.user')).toBe('bob');
  });
});

describe('checagens da coluna (#1096)', () => {
  const review = () => colsOf(parentWf().id).find((c) => c.name === 'Revisão')!;
  const list = [
    { name: 'Tipos', command: 'npm run typecheck', timeoutSec: 300 },
    { name: 'Testes', command: 'npx vitest related {changed_files} --run', timeoutSec: 600 },
  ];

  it('board novo: toda coluna sai sem checagens', () => {
    expect(snap().columns.every((c) => Array.isArray(c.checks) && c.checks.length === 0)).toBe(true);
  });

  it('grava e relê a lista na ordem, com os textos aparados; lista vazia limpa', () => {
    settings.updateColumn(review().id, { checks: [{ ...list[0]!, name: ' Tipos ' }, list[1]!] });
    expect(review().checks).toEqual(list);
    settings.updateColumn(review().id, { checks: [list[1]!, list[0]!] });
    expect(review().checks.map((k) => k.name)).toEqual(['Testes', 'Tipos']);
    settings.updateColumn(review().id, { checks: [] });
    expect(review().checks).toEqual([]);
  });

  it('recusa nome vazio, comando vazio e tempo fora do intervalo sem gravar nada', () => {
    settings.updateColumn(review().id, { checks: [list[0]!] });
    expect(() => settings.updateColumn(review().id, { name: 'Outra', checks: [{ ...list[0]!, name: '' }] })).toThrow(
      'Informe o nome da checagem.',
    );
    expect(() => settings.updateColumn(review().id, { checks: [{ ...list[0]!, command: ' ' }] })).toThrow('Informe o comando da checagem.');
    expect(() => settings.updateColumn(review().id, { checks: [{ ...list[0]!, timeoutSec: 0 }] })).toThrow(
      'O tempo limite vai de 1 a 3600 segundos.',
    );
    expect(review().checks).toEqual([list[0]]);
    expect(review().name).toBe('Revisão');
  });

  it('checks_json corrompido no banco é lido como lista vazia, sem erro', () => {
    run(db, "UPDATE columns SET checks_json = '{ruim' WHERE id = ?", [review().id]);
    expect(review().checks).toEqual([]);
    run(db, `UPDATE columns SET checks_json = '[{"name":"","command":"x"},{"name":"ok","command":"ls","timeoutSec":7}]' WHERE id = ?`, [
      review().id,
    ]);
    expect(review().checks).toEqual([{ name: 'ok', command: 'ls', timeoutSec: 7 }]);
  });
});
