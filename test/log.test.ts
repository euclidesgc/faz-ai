import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { CARD_TITLE_MAX_LENGTH, dayOf, monthOf, type AiRunConfig, type AiRunStart, type CardEvent } from '../src/shared/log';
import { openInMemory } from '../src/extension/db/database';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { cardAndChildrenFacts, cardFacts } from '../src/extension/log/facts';

// Fixa o fuso para o teste não depender do fuso da máquina que roda o CI, e ainda assim exercitar um
// deslocamento negativo (América/São_Paulo, UTC-3) — é o que expõe um `toISOString` disfarçado de local.
process.env.TZ = 'America/Sao_Paulo';

describe('monthOf e dayOf', () => {
  it('formatam no fuso local, não em UTC', () => {
    // 2026-01-02T02:30Z é 2026-01-01T23:30 em UTC-3: dia e mês diferentes do que toISOString diria
    const ts = Date.UTC(2026, 0, 2, 2, 30);
    expect(monthOf(ts)).toBe('2026-01');
    expect(dayOf(ts)).toBe('2026-01-01');
  });

  it('vira o mês', () => {
    // 2026-02-01T02:00Z é 2026-01-31T23:00 em UTC-3
    const antes = Date.UTC(2026, 1, 1, 2, 0);
    expect(monthOf(antes)).toBe('2026-01');
    expect(dayOf(antes)).toBe('2026-01-31');

    // 2026-02-01T03:00Z é 2026-02-01T00:00 em UTC-3
    const depois = Date.UTC(2026, 1, 1, 3, 0);
    expect(monthOf(depois)).toBe('2026-02');
    expect(dayOf(depois)).toBe('2026-02-01');
  });

  it('vira o ano', () => {
    // 2027-01-01T02:00Z é 2026-12-31T23:00 em UTC-3
    const antes = Date.UTC(2027, 0, 1, 2, 0);
    expect(monthOf(antes)).toBe('2026-12');
    expect(dayOf(antes)).toBe('2026-12-31');

    // 2027-01-01T03:00Z é 2027-01-01T00:00 em UTC-3
    const depois = Date.UTC(2027, 0, 1, 3, 0);
    expect(monthOf(depois)).toBe('2027-01');
    expect(dayOf(depois)).toBe('2027-01-01');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    const ts = Date.UTC(2026, 2, 5, 15, 0); // 5 de março, meio da tarde em UTC-3
    expect(monthOf(ts)).toBe('2026-03');
    expect(dayOf(ts)).toBe('2026-03-05');
  });
});

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

describe('CardEventRepo', () => {
  let db: Database;
  let boardId: string;
  let events: CardEventRepo;

  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    const boards = new BoardRepo(db);
    boardId = boards.getOrCreate('ws-1', 'Projeto X').id;
    events = new CardEventRepo(db);
  });

  const baseEvent = (over: Partial<Omit<CardEvent, 'id' | 'month'>> = {}): Omit<CardEvent, 'id' | 'month'> => ({
    boardId,
    at: Date.UTC(2026, 0, 15, 12, 0),
    kind: 'created',
    cardId: 'card-1',
    cardNumber: 1,
    cardTitle: 'Título',
    cardType: 'Tarefa',
    workflow: 'Backlog',
    columnName: 'Backlog',
    fromValue: '',
    toValue: 'Backlog',
    subject: '',
    author: 'Pessoa',
    source: 'human',
    runId: null,
    ...over,
  });

  it('grava e lê o evento por card e por mês, com o month calculado de `at`', () => {
    events.add(baseEvent());
    const byCard = events.byCard(1);
    expect(byCard).toHaveLength(1);
    expect(byCard[0]!.month).toBe('2026-01');
    expect(byCard[0]!.cardNumber).toBe(1);

    const byMonth = events.byMonth('2026-01');
    expect(byMonth).toHaveLength(1);
    expect(byMonth[0]!.id).toBe(byCard[0]!.id);
  });

  it('byCard separa eventos de cards diferentes e byMonth separa meses diferentes', () => {
    events.add(baseEvent({ cardNumber: 1, at: Date.UTC(2026, 0, 15, 12, 0) }));
    events.add(baseEvent({ cardNumber: 2, at: Date.UTC(2026, 1, 15, 12, 0) }));
    expect(events.byCard(1)).toHaveLength(1);
    expect(events.byCard(2)).toHaveLength(1);
    expect(events.byMonth('2026-01')).toHaveLength(1);
    expect(events.byMonth('2026-02')).toHaveLength(1);
  });

  it('corta o título em CARD_TITLE_MAX_LENGTH caracteres', () => {
    const longo = 'x'.repeat(CARD_TITLE_MAX_LENGTH + 50);
    events.add(baseEvent({ cardTitle: longo }));
    const [event] = events.byCard(1);
    expect(event!.cardTitle).toHaveLength(CARD_TITLE_MAX_LENGTH);
    expect(event!.cardTitle).toBe(longo.slice(0, CARD_TITLE_MAX_LENGTH));
  });

  it('monthsWithDetail devolve os meses distintos com evento gravado', () => {
    events.add(baseEvent({ at: Date.UTC(2026, 0, 15, 12, 0) }));
    events.add(baseEvent({ at: Date.UTC(2026, 0, 20, 12, 0) }));
    events.add(baseEvent({ at: Date.UTC(2026, 1, 1, 12, 0) }));
    expect(events.monthsWithDetail()).toEqual(['2026-01', '2026-02']);
  });

  it('deleteMonth apaga só os eventos daquele mês', () => {
    events.add(baseEvent({ at: Date.UTC(2026, 0, 15, 12, 0) }));
    events.add(baseEvent({ at: Date.UTC(2026, 1, 1, 12, 0) }));
    events.deleteMonth('2026-01');
    expect(events.byMonth('2026-01')).toHaveLength(0);
    expect(events.byMonth('2026-02')).toHaveLength(1);
    expect(events.monthsWithDetail()).toEqual(['2026-02']);
  });
});

describe('AiRunRepo', () => {
  let db: Database;
  let boardId: string;
  let runs: AiRunRepo;

  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    const boards = new BoardRepo(db);
    boardId = boards.getOrCreate('ws-1', 'Projeto X').id;
    runs = new AiRunRepo(db);
  });

  const baseStart = (over: Partial<AiRunStart> = {}): AiRunStart => ({
    boardId,
    startedAt: Date.UTC(2026, 0, 15, 12, 0),
    origin: 'manual',
    tool: 'claude',
    cardId: 'card-1',
    cardNumber: 1,
    cardTitle: 'Título',
    cardType: 'Tarefa',
    workflow: 'Backlog',
    columnName: 'Backlog',
    phase: 'Backlog',
    ...over,
  });

  const baseConfig = (over: Partial<AiRunConfig> = {}): AiRunConfig => ({
    model: 'opus',
    effort: 'high',
    profile: 'padrão',
    agent: '',
    permission: 'default',
    autonomous: false,
    clean: false,
    skills: ['sql-queries'],
    mcp: null,
    ...over,
  });

  it('start grava a linha sem ended_at, com outcome nulo e origem registrada', () => {
    const id = runs.start(baseStart({ origin: 'heartbeat' }));
    const [run] = runs.byMonth('2026-01');
    expect(run!.id).toBe(id);
    expect(run!.endedAt).toBeNull();
    expect(run!.outcome).toBeNull();
    expect(run!.origin).toBe('heartbeat');
    expect(run!.month).toBe('2026-01');
  });

  it('corta o título do card em CARD_TITLE_MAX_LENGTH caracteres', () => {
    const longo = 'y'.repeat(CARD_TITLE_MAX_LENGTH + 10);
    runs.start(baseStart({ cardTitle: longo }));
    const [run] = runs.byMonth('2026-01');
    expect(run!.cardTitle).toHaveLength(CARD_TITLE_MAX_LENGTH);
  });

  it('describe preserva a diferença entre null (não definido) e "" (definido e vazio)', () => {
    const id = runs.start(baseStart());
    runs.describe(id, baseConfig({ model: null, effort: null, profile: '', agent: '' }));
    const [run] = runs.byMonth('2026-01');
    expect(run!.model).toBeNull();
    expect(run!.effort).toBeNull();
    expect(run!.profile).toBe('');
    expect(run!.agent).toBe('');
  });

  it('describe preserva mcp nulo (sem restrição) separado de uma lista vazia', () => {
    const id1 = runs.start(baseStart());
    runs.describe(id1, baseConfig({ mcp: null }));
    const id2 = runs.start(baseStart());
    runs.describe(id2, baseConfig({ mcp: [] }));
    const byId = (id: string) => runs.byMonth('2026-01').find((r) => r.id === id)!;
    expect(byId(id1).mcp).toBeNull();
    expect(byId(id2).mcp).toEqual([]);
  });

  it('describe grava skills, permissão, autônomo e sessão limpa', () => {
    const id = runs.start(baseStart());
    runs.describe(id, baseConfig({ permission: 'yolo', autonomous: true, clean: true, skills: ['a', 'b'] }));
    const [run] = runs.byMonth('2026-01');
    expect(run!.permission).toBe('yolo');
    expect(run!.autonomous).toBe(true);
    expect(run!.clean).toBe(true);
    expect(run!.skills).toEqual(['a', 'b']);
  });

  it('finish grava ended_at, duration_ms e o desfecho quando termina bem', () => {
    const id = runs.start(baseStart());
    runs.finish(id, 'done', 0);
    const [run] = runs.byMonth('2026-01');
    expect(run!.outcome).toBe('done');
    expect(run!.exitCode).toBe(0);
    expect(run!.endedAt).not.toBeNull();
    expect(run!.durationMs).not.toBeNull();
    expect(run!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it.each(['failed', 'unsupported', 'timeout', 'stopped'] as const)('finish aceita o desfecho %s com duration_ms preenchido', (outcome) => {
    const id = runs.start(baseStart());
    runs.finish(id, outcome);
    const [run] = runs.byMonth('2026-01');
    expect(run!.outcome).toBe(outcome);
    expect(run!.durationMs).not.toBeNull();
  });

  it('finish com desfecho unknown deixa duration_ms nulo', () => {
    const id = runs.start(baseStart());
    runs.finish(id, 'unknown');
    const [run] = runs.byMonth('2026-01');
    expect(run!.outcome).toBe('unknown');
    expect(run!.durationMs).toBeNull();
    expect(run!.endedAt).not.toBeNull();
  });

  it('closeOpen marca como unknown toda linha com outcome nulo, com ended_at preenchido e duration_ms nulo', () => {
    const open = runs.start(baseStart());
    runs.closeOpen(5_000);
    const [run] = runs.byMonth('2026-01');
    expect(run!.id).toBe(open);
    expect(run!.outcome).toBe('unknown');
    expect(run!.endedAt).toBe(5_000);
    expect(run!.durationMs).toBeNull();
  });

  it('closeOpen não toca numa linha já fechada', () => {
    const closed = runs.start(baseStart());
    runs.finish(closed, 'done', 0);
    const before = runs.byMonth('2026-01').find((r) => r.id === closed)!;
    runs.closeOpen(9_999_999);
    const after = runs.byMonth('2026-01').find((r) => r.id === closed)!;
    expect(after.outcome).toBe('done');
    expect(after.endedAt).toBe(before.endedAt);
  });

  it('deleteMonth apaga só as execuções daquele mês', () => {
    runs.start(baseStart({ startedAt: Date.UTC(2026, 0, 15, 12, 0) }));
    runs.start(baseStart({ startedAt: Date.UTC(2026, 1, 1, 12, 0) }));
    runs.deleteMonth('2026-01');
    expect(runs.byMonth('2026-01')).toHaveLength(0);
    expect(runs.byMonth('2026-02')).toHaveLength(1);
  });
});

describe('cardFacts e cardAndChildrenFacts', () => {
  let db: Database;
  let boardId: string;
  let cards: CardRepo;

  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    const boards = new BoardRepo(db);
    const board = boards.getOrCreate('ws-1', 'Projeto X');
    boardId = board.id;
    cards = new CardRepo(db);
  });

  const snap = () => new BoardRepo(db).snapshot(boardId);
  const parentWf = () => snap().workflows.find((w) => w.kind === 'parent')!;
  const childWf = () => snap().workflows.find((w) => w.kind === 'child')!;
  const colOf = (wfId: string) => snap().columns.filter((c) => c.workflowId === wfId)[0]!;
  const typeOf = (name: string) => snap().cardTypes.find((t) => t.name === name)!;

  it('devolve o recorte de fatos do card numa única consulta, com nomes de coluna/tipo/workflow juntados', () => {
    const wf = parentWf();
    const col = colOf(wf.id);
    const typeId = snap().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
    const id = cards.create(boardId, { typeId, columnId: col.id, parentId: null, title: 'Minha história' });
    cards.setPullRequest(id, 'https://example.com/pr/1');

    const facts = cardFacts(db, [id]).get(id)!;
    expect(facts.title).toBe('Minha história');
    expect(facts.columnName).toBe(col.name);
    expect(facts.columnCategory).toBe(col.category);
    expect(facts.workflow).toBe(wf.name);
    expect(facts.cardType).toBe(typeOf(facts.cardType).name);
    expect(facts.archived).toBe(false);
    expect(facts.trashed).toBe(false);
    expect(facts.parentId).toBeNull();
    expect(facts.prUrl).toBe('https://example.com/pr/1');
    expect(typeof facts.number).toBe('number');
  });

  it('cardFacts aceita vários ids numa consulta só e marca archived/trashed', () => {
    const wf = parentWf();
    const col = colOf(wf.id);
    const typeId = snap().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
    const id1 = cards.create(boardId, { typeId, columnId: col.id, parentId: null, title: 'Um' });
    const id2 = cards.create(boardId, { typeId, columnId: col.id, parentId: null, title: 'Dois' });
    cards.archive(id2);

    const map = cardFacts(db, [id1, id2]);
    expect(map.size).toBe(2);
    expect(map.get(id1)!.archived).toBe(false);
    expect(map.get(id2)!.archived).toBe(true);
  });

  it('cardAndChildrenFacts devolve o card e os filhos numa consulta só', () => {
    const pwf = parentWf();
    const pcol = colOf(pwf.id);
    const parentType = snap().cardTypes.find((t) => t.defaultWorkflowId === pwf.id)!.id;
    const parentId = cards.create(boardId, { typeId: parentType, columnId: pcol.id, parentId: null, title: 'História' });

    const cwf = childWf();
    const ccol = colOf(cwf.id);
    const childType = typeOf('Sub-tarefa').id;
    const child1 = cards.create(boardId, { typeId: childType, columnId: ccol.id, parentId, title: 'Sub 1' });
    const child2 = cards.create(boardId, { typeId: childType, columnId: ccol.id, parentId, title: 'Sub 2' });

    const other = cards.create(boardId, { typeId: parentType, columnId: pcol.id, parentId: null, title: 'Outra história' });

    const map = cardAndChildrenFacts(db, parentId);
    expect(new Set(map.keys())).toEqual(new Set([parentId, child1, child2]));
    expect(map.has(other)).toBe(false);
  });
});
