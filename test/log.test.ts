import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { CARD_TITLE_MAX_LENGTH, dayOf, monthOf, type AiRunConfig, type AiRunStart, type CardEvent } from '../src/shared/log';
import type { BoardState } from '../src/shared/model';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { CardRepo } from '../src/extension/repositories/cardRepo';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { cardAndChildrenFacts, cardFacts, cardFamilyFacts, newestCardFacts, trashedCardFacts } from '../src/extension/log/facts';

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

describe('facts: recortes da sonda', () => {
  let db: Database;
  let boardId: string;
  let cards: CardRepo;
  let boards: BoardRepo;

  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    boards = new BoardRepo(db);
    boardId = boards.getOrCreate('ws-1', 'Projeto X').id;
    cards = new CardRepo(db);
  });

  const snap = () => boards.snapshot(boardId);
  const story = (title: string) => {
    const wf = snap().workflows.find((w) => w.kind === 'parent')!;
    const col = snap().columns.filter((c) => c.workflowId === wf.id)[0]!;
    const typeId = snap().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
    return cards.create(boardId, { typeId, columnId: col.id, parentId: null, title });
  };
  const subtask = (parentId: string, title: string) => {
    const wf = snap().workflows.find((w) => w.kind === 'child')!;
    const col = snap().columns.filter((c) => c.workflowId === wf.id)[0]!;
    const typeId = snap().cardTypes.find((t) => t.name === 'Sub-tarefa')!.id;
    return cards.create(boardId, { typeId, columnId: col.id, parentId, title });
  };

  it('cardFamilyFacts devolve o card, o pai e os filhos dele, e nada mais', () => {
    const h = story('História');
    const s1 = subtask(h, 'Sub 1');
    const s2 = subtask(h, 'Sub 2');
    const other = story('Outra');

    expect(new Set(cardFamilyFacts(db, s1).keys())).toEqual(new Set([h, s1]));
    expect(new Set(cardFamilyFacts(db, h).keys())).toEqual(new Set([h, s1, s2]));
    expect(cardFamilyFacts(db, other).has(h)).toBe(false);
  });

  it('trashedCardFacts devolve os cards na lixeira e os filhos deles', () => {
    const h = story('História');
    const s1 = subtask(h, 'Sub 1');
    const live = story('Viva');
    cards.trash(h);

    expect(new Set(trashedCardFacts(db, boardId).keys())).toEqual(new Set([h, s1]));
    expect(trashedCardFacts(db, boardId).has(live)).toBe(false);
  });

  it('newestCardFacts devolve só o card de maior número', () => {
    story('Primeira');
    const last = story('Última');
    const map = newestCardFacts(db, boardId);
    expect([...map.keys()]).toEqual([last]);
  });
});

/**
 * O log ligado ao router de verdade: cada mensagem passa por `handle()` e o que fica em `card_events`
 * é conferido pelo `CardEventRepo`. Um teste por requisito, de RF-01 a RF-12, mais a cascata e o
 * orçamento de desempenho.
 */
describe('EventLog no MessageRouter', () => {
  let db: Database;
  let router: MessageRouter;
  let events: CardEventRepo;
  let root: string;
  let saves: number;
  let logged: string[];

  const AI = { author: 'IA', source: 'ai' as const };

  beforeEach(async () => {
    db = await openInMemory(WASM_DIR);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-log-'));
    saves = 0;
    logged = [];
    router = new MessageRouter(
      { db, scheduleSave: () => saves++, flush: async () => {}, backup: () => {}, close: async () => {} },
      { workspaceKey: 'ws', folderName: 'P', author: 'Ana', attachmentsDir: path.join(root, 'a'), log: (line) => logged.push(line) },
    );
    events = new CardEventRepo(db);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const snap = (): BoardState => router.snapshot();
  const wfOf = (kind: 'parent' | 'child') => snap().workflows.find((w) => w.kind === kind)!;
  const column = (name: string, kind: 'parent' | 'child' = 'parent') =>
    snap().columns.find((c) => c.workflowId === wfOf(kind).id && c.name === name)!;
  const field = (name: string) => snap().fieldDefs.find((f) => f.name === name)!;
  const card = (id: string) => snap().cards.find((c) => c.id === id)!;

  const story = (title = 'História', col = 'Backlog'): string =>
    router.createCard({
      typeId: snap().cardTypes.find((t) => t.defaultWorkflowId === wfOf('parent').id)!.id,
      columnId: column(col).id,
      parentId: null,
      title,
    });
  const subtask = (parentId: string, title = 'Sub-tarefa'): string =>
    router.createCard({
      typeId: snap().cardTypes.find((t) => t.name === 'Sub-tarefa')!.id,
      columnId: column('A fazer', 'child').id,
      parentId,
      title,
    });
  const move = (cardId: string, col: string, over: { cancelChildren?: boolean; kind?: 'parent' | 'child' } = {}, origin = {}) =>
    router.handle(
      { type: 'card.move', cardId, columnId: column(col, over.kind).id, position: 0, cancelChildren: over.cancelChildren },
      origin,
    );

  const of = (id: string) => events.byCard(card(id).number);
  const kinds = (list: CardEvent[]) => list.map((e) => e.kind);
  const only = (list: CardEvent[], kind: CardEvent['kind']): CardEvent => {
    const found = list.filter((e) => e.kind === kind);
    expect(found).toHaveLength(1);
    return found[0]!;
  };

  it('RF-01: criar um card registra created com instante, autor, origem, workflow, coluna inicial e tipo', () => {
    const before = Date.now();
    const id = router.handle({
      type: 'card.create',
      typeId: snap().cardTypes.find((t) => t.name === 'História')!.id,
      columnId: column('Backlog').id,
      parentId: null,
      title: 'Login',
    }).cards[0]!.id;

    const [created, ...rest] = of(id);
    expect(rest).toEqual([]);
    expect(created).toMatchObject({
      kind: 'created',
      cardId: id,
      cardNumber: card(id).number,
      cardTitle: 'Login',
      cardType: 'História',
      workflow: wfOf('parent').name,
      columnName: 'Backlog',
      toValue: 'Backlog',
      author: 'Ana',
      source: 'human',
      runId: null,
    });
    expect(created!.at).toBeGreaterThanOrEqual(before);
    expect(created!.month).toBe(monthOf(created!.at));
  });

  it('RF-01: o atalho createCard() registra o mesmo created, com a origem informada', () => {
    const id = story('Pelo MCP');
    expect(of(id)).toHaveLength(1);
    expect(of(id)[0]).toMatchObject({ kind: 'created', cardTitle: 'Pelo MCP', source: 'human' });

    const byAi = router.createCard(
      { typeId: snap().cardTypes.find((t) => t.name === 'História')!.id, columnId: column('Backlog').id, parentId: null, title: 'Da IA' },
      AI,
    );
    expect(of(byAi)[0]).toMatchObject({ kind: 'created', author: 'IA', source: 'ai' });
  });

  it('RF-02: mover para frente e para trás registra os dois column_changed, com as colunas invertidas', () => {
    const id = story('Mover', 'Discovery');
    move(id, 'PRD');
    move(id, 'Discovery');

    const moves = of(id).filter((e) => e.kind === 'column_changed');
    expect(moves).toHaveLength(2);
    expect(moves[0]).toMatchObject({ fromValue: 'Discovery', toValue: 'PRD', columnName: 'Discovery' });
    expect(moves[1]).toMatchObject({ fromValue: 'PRD', toValue: 'Discovery', columnName: 'PRD' });
  });

  it('RF-03: mudar o status registra status_changed com o anterior e o novo, pela IA e pela pessoa', () => {
    const id = story('Status', 'Discovery'); // Discovery tem IA ativa: nasce "ready"
    router.handle({ type: 'card.status.set', cardId: id, status: 'running' }, AI);
    router.handle({ type: 'card.status.set', cardId: id, status: 'waiting_review', note: 'Pronto' }, AI);
    router.handle({ type: 'card.status.set', cardId: id, status: 'approved' });

    const changes = of(id).filter((e) => e.kind === 'status_changed');
    expect(changes).toHaveLength(3);
    expect(changes[0]).toMatchObject({ fromValue: 'ready', toValue: 'running', source: 'ai', author: 'IA' });
    expect(changes[1]).toMatchObject({ fromValue: 'running', toValue: 'waiting_review', source: 'ai' });
    expect(changes[2]).toMatchObject({ fromValue: 'waiting_review', toValue: 'approved', source: 'human', author: 'Ana' });
  });

  it('RF-04: comentário, pergunta, pedido de revisão e impedimento são quatro eventos de tipos distintos', () => {
    const id = story('Conversa', 'Discovery');
    router.handle({ type: 'comment.add', cardId: id, body: 'Olá' }, AI);
    router.handle({ type: 'card.status.set', cardId: id, status: 'waiting_answer', note: 'Qual banco?' }, AI);
    router.handle({ type: 'card.status.set', cardId: id, status: 'waiting_review', note: 'Revise' }, AI);
    router.handle({ type: 'card.status.set', cardId: id, status: 'blocked', note: 'Sem acesso' }, AI);

    const conversation = of(id).filter((e) => ['comment', 'question', 'review_requested', 'blocked'].includes(e.kind));
    expect(kinds(conversation)).toEqual(['comment', 'question', 'review_requested', 'blocked']);
    for (const e of conversation) expect(e).toMatchObject({ author: 'IA', source: 'ai' });
  });

  it('RF-04: comentário com corpo vazio não gera evento (o handler não muda nada)', () => {
    const id = story('Vazio');
    router.handle({ type: 'comment.add', cardId: id, body: '   ' });
    expect(kinds(of(id))).toEqual(['created']);
  });

  it('RF-05: artefato de fase e anexo comum são eventos distintos, e substituir o artefato não apaga o anterior', () => {
    const id = story('Docs', 'PRD');
    router.handle({ type: 'attachment.addData', cardId: id, filename: 'PRD.md', base64: '', artifact: true }, AI);
    router.handle({ type: 'attachment.addData', cardId: id, filename: 'print.png', base64: '' });
    router.handle({ type: 'attachment.addData', cardId: id, filename: 'PRD.md', base64: '', artifact: true }, AI);

    const list = of(id).filter((e) => e.kind === 'artifact_saved' || e.kind === 'attachment_added');
    expect(kinds(list)).toEqual(['artifact_saved', 'attachment_added', 'artifact_saved']);
    expect(list[0]).toMatchObject({ subject: 'PRD.md', columnName: 'PRD', source: 'ai' });
    expect(list[1]).toMatchObject({ subject: 'print.png', source: 'human' });
    expect(snap().attachments.filter((a) => a.cardId === id)).toHaveLength(2); // o artefato foi substituído, o evento ficou
  });

  it('RF-05: o atalho addAttachmentFiles() registra o anexo com o nome do arquivo', () => {
    const id = story('Arquivo');
    const file = path.join(root, 'nota.txt');
    fs.writeFileSync(file, 'x');
    router.addAttachmentFiles(id, [file]);
    expect(only(of(id), 'attachment_added').subject).toBe('nota.txt');
  });

  it('RF-06: criar e concluir a sub-tarefa registram no pai o #n dela; o vínculo registra um evento em cada ponta', () => {
    const h = story('História');
    const s = subtask(h, 'Passo 1');
    expect(only(of(s), 'created')).toMatchObject({ cardType: 'Sub-tarefa', columnName: 'A fazer' });
    expect(only(of(h), 'subtask_created').subject).toBe(`#${card(s).number}`);

    move(s, 'Concluído', { kind: 'child' });
    expect(only(of(s), 'done')).toMatchObject({ fromValue: 'A fazer', toValue: 'Concluído' });
    expect(only(of(h), 'subtask_done').subject).toBe(`#${card(s).number}`);

    const other = story('Outra');
    router.handle({ type: 'link.add', fromId: h, toId: other, kind: 'related' });
    expect(only(of(h), 'link_added')).toMatchObject({ subject: `#${card(other).number}`, toValue: 'related' });
    expect(only(of(other), 'link_added').subject).toBe(`#${card(h).number}`);

    const link = snap().links.find((l) => l.fromId === h && l.toId === other)!;
    router.handle({ type: 'link.remove', linkId: link.id });
    expect(only(of(h), 'link_removed').subject).toBe(`#${card(other).number}`);
    expect(only(of(other), 'link_removed').subject).toBe(`#${card(h).number}`);
  });

  it('RF-07: registrar o pull request gera pull_request_set com a URL', () => {
    const id = story('PR');
    router.handle({ type: 'card.pr.set', cardId: id, url: 'https://example.com/pr/9' }, AI);
    expect(only(of(id), 'pull_request_set')).toMatchObject({ subject: 'https://example.com/pr/9', source: 'ai' });
  });

  it('RF-08: concluir e cancelar registram done e cancelled além do column_changed', () => {
    const a = story('Concluir');
    move(a, 'Concluído');
    expect(kinds(of(a))).toEqual(['created', 'column_changed', 'done']);

    const b = story('Cancelar');
    move(b, 'Cancelado');
    expect(kinds(of(b))).toEqual(['created', 'column_changed', 'cancelled']);
  });

  it('RF-08: arquivar, mandar para a lixeira, restaurar e apagar registram um evento cada', () => {
    const id = story('Ciclo');
    router.handle({ type: 'card.archive', cardId: id });
    router.handle({ type: 'card.unarchive', cardId: id });
    router.handle({ type: 'card.trash', cardId: id });
    router.handle({ type: 'card.restore', cardId: id });
    router.handle({ type: 'card.trash', cardId: id });
    const number = card(id).number;
    router.handle({ type: 'card.deletePermanent', cardId: id });

    expect(kinds(events.byCard(number))).toEqual(['created', 'archived', 'unarchived', 'trashed', 'restored', 'trashed', 'deleted']);
    for (const e of events.byCard(number)) expect(e).toMatchObject({ author: 'Ana', source: 'human' });
  });

  it('RF-09: os quatro campos de triagem registram field_changed com o nome do campo e os valores; "Fase" não', () => {
    const id = story('Triagem');
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Tags').id, value: ['infra', 'db'] });
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Modelo').id, value: 'claude:opus' }, AI);
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Modelo').id, value: 'claude:sonnet' });
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Skills').id, value: ['unit-testing'] });
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Esforço da atividade').id, value: 'Alto' });
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Fase').id, value: 'PRD' });

    const changes = of(id).filter((e) => e.kind === 'field_changed');
    expect(changes.map((e) => [e.subject, e.fromValue, e.toValue])).toEqual([
      ['Tags', '', 'infra, db'],
      ['Modelo', changes[1]!.fromValue, 'claude:opus'],
      ['Modelo', 'claude:opus', 'claude:sonnet'],
      ['Skills', '', 'unit-testing'],
      ['Esforço da atividade', '', 'Alto'],
    ]);
    expect(changes[1]!.source).toBe('ai');
  });

  it('RF-09: gravar o mesmo valor de novo não gera evento', () => {
    const id = story('Repetido');
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Tags').id, value: ['a'] });
    router.handle({ type: 'field.setValue', cardId: id, fieldId: field('Tags').id, value: ['a'] });
    expect(of(id).filter((e) => e.kind === 'field_changed')).toHaveLength(1);
  });

  it('RF-10: todo evento tem instante, autor, origem e o número do card; a origem da IA é "ai"', () => {
    const id = story('Origem');
    router.handle({ type: 'comment.add', cardId: id, body: 'Da IA' }, AI);
    router.handle({ type: 'comment.add', cardId: id, body: 'Da pessoa' });

    const list = of(id);
    expect(kinds(list)).toEqual(['created', 'comment', 'comment']);
    for (const e of list) {
      expect(e.at).toBeGreaterThan(0);
      expect(e.author).not.toBe('');
      expect(e.cardNumber).toBe(card(id).number);
    }
    expect(list[1]).toMatchObject({ author: 'IA', source: 'ai' });
    expect(list[2]).toMatchObject({ author: 'Ana', source: 'human' });
  });

  it('RF-10: run_id vem do resolvedor do executor; sem execução aberta pelo board fica nulo (RF-20)', () => {
    const id = story('Execução');
    router.handle({ type: 'comment.add', cardId: id, body: 'sem execução' }, AI);
    router.setRunResolver((cardId) => (cardId === id ? 'run-1' : null));
    router.handle({ type: 'comment.add', cardId: id, body: 'com execução' }, AI);
    const s = subtask(id, 'Filha');
    router.handle({ type: 'comment.add', cardId: s, body: 'na sub-tarefa, a execução é a da história' }, AI);

    const comments = of(id).filter((e) => e.kind === 'comment');
    expect(comments.map((e) => e.runId)).toEqual([null, 'run-1']);
    expect(only(of(s), 'comment').runId).toBe('run-1');
  });

  it('RF-11: o histórico sobrevive ao deletePermanent, com número, título, tipo e workflow do card', () => {
    const id = story('Apagada', 'Discovery');
    move(id, 'PRD');
    const number = card(id).number;
    const month = monthOf(Date.now());
    const inMonth = events.byMonth(month).length;

    router.handle({ type: 'card.trash', cardId: id });
    router.handle({ type: 'card.deletePermanent', cardId: id });

    expect(snap().cards.find((c) => c.id === id)).toBeUndefined();
    const list = events.byCard(number);
    expect(kinds(list)).toEqual(['created', 'column_changed', 'trashed', 'deleted']);
    for (const e of list)
      expect(e).toMatchObject({ cardNumber: number, cardTitle: 'Apagada', cardType: 'História', workflow: wfOf('parent').name });
    expect(events.byMonth(month)).toHaveLength(inMonth + 2); // só os dois eventos novos; nada foi apagado
  });

  it('RF-11: esvaziar a lixeira registra deleted para cada card removido e mantém o histórico de todos', () => {
    const h = story('História');
    const s = subtask(h, 'Filha');
    const live = story('Viva');
    const [hn, sn] = [card(h).number, card(s).number];
    router.handle({ type: 'card.trash', cardId: h });
    router.handle({ type: 'trash.empty' });

    expect(snap().cards.map((c) => c.id)).toEqual([live]);
    expect(kinds(events.byCard(hn))).toEqual(['created', 'subtask_created', 'trashed', 'deleted']);
    expect(kinds(events.byCard(sn))).toEqual(['created', 'trashed', 'deleted']);
    expect(kinds(of(live))).toEqual(['created']);
  });

  it('RF-12: uma mudança feita por fora do board não gera evento nem faz a operação seguinte falhar', () => {
    const id = story('Por fora', 'Discovery');
    db.run('UPDATE cards SET column_id = ? WHERE id = ?', [column('PRD').id, id]);
    expect(kinds(of(id))).toEqual(['created']);

    move(id, 'Spec');
    expect(only(of(id), 'column_changed')).toMatchObject({ fromValue: 'PRD', toValue: 'Spec' });
    expect(logged).toEqual([]);
  });

  it('cascata: cancelar a história registra cancelled para ela e para cada sub-tarefa em aberto', () => {
    const h = story('História', 'Discovery');
    const s1 = subtask(h, 'Um');
    const s2 = subtask(h, 'Dois');
    move(s2, 'Concluído', { kind: 'child' });
    move(h, 'Cancelado', { cancelChildren: true });

    expect(kinds(of(h)).filter((k) => k === 'cancelled')).toEqual(['cancelled']);
    expect(only(of(s1), 'cancelled')).toMatchObject({ fromValue: 'A fazer', toValue: 'Cancelado' });
    expect(of(s2).filter((e) => e.kind === 'cancelled')).toEqual([]); // já estava concluída: não foi cancelada
  });

  it('cascata: mandar a história para a lixeira registra trashed também nas sub-tarefas', () => {
    const h = story('História');
    const s = subtask(h, 'Filha');
    router.handle({ type: 'card.trash', cardId: h });
    expect(only(of(s), 'trashed').cardId).toBe(s);
  });

  it('handler que lança não registra nada: o log não conta o que não aconteceu', () => {
    const id = story('Travada', 'Discovery');
    expect(() => move(id, 'A fazer', { kind: 'child' })).toThrow();
    expect(kinds(of(id))).toEqual(['created']);
  });

  it('falha no log não derruba a operação: vai para o canal de log e o board muda mesmo assim', () => {
    const id = story('Resiliente', 'Discovery');
    db.run('DROP TABLE card_events');
    move(id, 'PRD');

    expect(card(id).columnId).toBe(column('PRD').id);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^\[fazai\] falha ao registrar o log do board: /);
  });

  it('nada do log entra no BoardState', () => {
    const id = story('Fora do snapshot');
    const created = only(of(id), 'created');
    expect(JSON.stringify(snap())).not.toContain(created.id);
    expect(Object.keys(snap()).some((k) => /event|log/i.test(k))).toBe(false);
  });

  it('orçamento: mover um card faz exatamente um scheduleSave e no máximo duas consultas a mais que antes', async () => {
    // `db` instrumentado: conta `prepare` (consultas), `run` (gravações) e `exec` (transações)
    const counts = { prepare: 0, run: 0, exec: 0 };
    const raw = await openInMemory(WASM_DIR);
    const counted = new Proxy(raw, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === 'prepare' || prop === 'run' || prop === 'exec')
          return (...args: unknown[]) => {
            counts[prop]++;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    let scheduled = 0;
    const r = new MessageRouter(
      { db: counted, scheduleSave: () => scheduled++, flush: async () => {}, backup: () => {}, close: async () => {} },
      { workspaceKey: 'ws', folderName: 'P', author: 'Ana', attachmentsDir: path.join(root, 'b') },
    );
    const s0 = r.snapshot();
    const pwf = s0.workflows.find((w) => w.kind === 'parent')!;
    const col = (name: string) => s0.columns.find((c) => c.workflowId === pwf.id && c.name === name)!;
    const id = r.createCard({
      typeId: s0.cardTypes.find((t) => t.defaultWorkflowId === pwf.id)!.id,
      columnId: col('Backlog').id,
      parentId: null,
      title: 'x',
    });
    const measure = (fn: () => void) => {
      const start = { ...counts };
      fn();
      return { prepare: counts.prepare - start.prepare, run: counts.run - start.run, exec: counts.exec - start.exec };
    };

    // "antes": o que `handle()` fazia sem o log — o handler (CardRepo.move) e o snapshot devolvido
    const cards = new CardRepo(counted);
    const boards = new BoardRepo(counted);
    const baseline = measure(() => {
      cards.move(id, col('Discovery').id, 0);
      boards.snapshot(r.boardId, 'Ana');
    });
    cards.move(id, col('Backlog').id, 0); // de volta, para a medição do router partir do mesmo lugar

    scheduled = 0;
    const withLog = measure(() => r.handle({ type: 'card.move', cardId: id, columnId: col('Discovery').id, position: 0 }));

    expect(scheduled).toBe(1);
    expect(withLog.prepare - baseline.prepare).toBeLessThanOrEqual(2);
    expect(withLog.exec).toBe(baseline.exec); // o log não abre transação própria
    // as gravações a mais são os INSERTs dos eventos (column_changed e status_changed: Discovery tem IA ativa)
    expect(withLog.run - baseline.run).toBe(2);
    expect(new CardEventRepo(raw).byCard(1).filter((e) => e.kind !== 'created')).toHaveLength(2);
  });
});
