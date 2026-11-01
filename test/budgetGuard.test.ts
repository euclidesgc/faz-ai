import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { BudgetExceeded, BudgetGuard, type BudgetRouter } from '../src/extension/budget';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BUDGET_META_KEY, DEFAULT_BUDGET, budgetCardKey, budgetNote, budgetStateKey, type BudgetConfig } from '../src/shared/budget';
import type { WebviewToHost } from '../src/shared/messages';
import { valueOf } from '../src/shared/selectors';
import type { AiRunMode } from '../src/shared/runner';

// O guarda do teto de consumo (#1112): recusa o início automático em 100%, aplica a política uma vez em 80% e
// nunca derruba a execução por erro próprio. O gasto é injetado (o do log real é testado em cardUsage).

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const CEILING = 1_000_000;

let router: MessageRouter;
let guard: BudgetGuard;
let log: string[];
/** o gasto por história (número do card) */
let spent: Map<string, { tokens: number; measured: number; runs: number }>;
/** os cards que já rodaram alguma vez */
let ran: Set<string>;
let escalated: Set<string>;
let reading: 'ok' | 'throws';

const snap = () => router.snapshot();
const card = (n: number) => snap().cards.find((c) => c.number === n)!;
const create = (title: string, columnName: string, parent?: number) => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === columnName)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const field = (name: string) => snap().fieldDefs.find((f) => f.name === name)!;
const ai = (msg: WebviewToHost) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
const human = (msg: WebviewToHost) => router.handle(msg);
const setField = (n: number, name: string, value: string) =>
  ai({ type: 'field.setValue', cardId: card(n).id, fieldId: field(name).id, value });
const modelOf = (n: number) => valueOf(snap(), card(n).id, field('Modelo').id);
const bodies = (n: number) =>
  snap()
    .comments.filter((c) => c.cardId === card(n).id)
    .map((c) => c.body);
const configure = (patch: Partial<BudgetConfig> = {}) =>
  router.setMeta(BUDGET_META_KEY, JSON.stringify({ ...DEFAULT_BUDGET, enabled: true, ...patch }));
const spend = (n: number, tokens: number, measured = 1, runs = measured) => spent.set(card(n).id, { tokens, measured, runs });
const stateOf = (n: number) =>
  JSON.parse(router.getMeta(budgetStateKey(card(n).id)) ?? 'null') as { ceiling: number; warned: boolean; stopped: boolean } | null;
const finish = (n: number, mode: AiRunMode = 'phase') => guard.onRunFinished(card(n).id, mode);
const check = (n: number, origin: 'manual' | 'heartbeat' | 'autopilot' = 'heartbeat', mode: AiRunMode = 'phase') =>
  guard.check(card(n).id, origin, mode);

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-budget'),
  });
  log = [];
  spent = new Map();
  ran = new Set();
  escalated = new Set();
  reading = 'ok';
  const gated: BudgetRouter = {
    snapshot: () => router.snapshot(),
    handle: (m, o) => router.handle(m, o),
    getMeta: (k) => router.getMeta(k),
    setMeta: (k, v) => router.setMeta(k, v),
    storyTokens: (id) => {
      if (reading === 'throws') throw new Error('banco fechado');
      return spent.get(id) ?? { tokens: 0, measured: 0, runs: 0 };
    },
    cardUsage: (id) => ({ total: { runs: ran.has(id) ? 1 : 0 } }) as never,
  };
  guard = new BudgetGuard({ router: gated, ladders: () => ({}), escalated: (id) => escalated.has(id), log: (l) => log.push(l) });
  // #1 história (Médio), #2 e #3 sub-tarefas abertas
  create('História', 'Implementação');
  setField(1, 'Esforço da atividade', 'Médio');
  create('Passo A', 'A fazer', 1);
  create('Passo B', 'A fazer', 1);
  setField(2, 'Esforço da atividade', 'Médio');
  setField(3, 'Esforço da atividade', 'Médio');
});

const ceilingTo = (n: number, value: number | 'off') => router.setMeta(budgetCardKey(card(n).id), String(value));

describe('check: o início automático', () => {
  it('sem teto ligado nada muda, mesmo com gasto enorme', () => {
    spend(1, 999_999_999);
    expect(() => check(1)).not.toThrow();
    finish(1);
    expect(card(1).status).not.toBe('blocked');
    expect(stateOf(1)).toBeNull();
  });

  it('abaixo de 100% passa, em 80% também (o aviso é do fim da execução)', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, 900_000);
    expect(() => check(1)).not.toThrow();
  });

  it.each(['heartbeat', 'autopilot'] as const)('em 100%% recusa o início de %s, com a nota e a história para a pessoa', (origin) => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, CEILING);
    expect(() => check(2, origin)).toThrow(BudgetExceeded);
    expect(card(1).status).toBe('blocked');
    expect(bodies(1)).toContain(budgetNote.stopped(CEILING, CEILING));
  });

  it('a recusa carrega história, gasto e teto', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, 1_200_000);
    try {
      check(1);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ name: 'BudgetExceeded', storyId: card(1).id, used: 1_200_000, ceiling: CEILING });
    }
  });

  it('a nota sai uma vez por teto; a recusa continua a cada chamada', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, CEILING);
    expect(() => check(1)).toThrow(BudgetExceeded);
    expect(() => check(1)).toThrow(BudgetExceeded);
    expect(() => check(2, 'autopilot')).toThrow(BudgetExceeded);
    expect(bodies(1).filter((b) => b.startsWith('**Teto de consumo**'))).toHaveLength(1);
  });

  it('o resumo e a resolução de conflito passam; refinar, responder e destravar são recusados', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, CEILING);
    expect(() => check(1, 'heartbeat', 'summarize')).not.toThrow();
    expect(() => check(1, 'autopilot', 'conflict')).not.toThrow();
    for (const mode of ['refine', 'reply', 'unblock'] as const) expect(() => check(1, 'heartbeat', mode)).toThrow(BudgetExceeded);
  });

  it('a execução manual acima do teto roda: só comenta, uma vez, sem trocar o status', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, 2 * CEILING);
    const before = card(1).status;
    expect(() => check(1, 'manual')).not.toThrow();
    expect(() => check(1, 'manual')).not.toThrow();
    expect(bodies(1).filter((b) => b === budgetNote.manualAbove)).toHaveLength(1);
    expect(card(1).status).toBe(before);
  });

  it('o teto do card vale mais que o do esforço; "off" tira o teto da história', () => {
    configure({ byEffort: { Baixo: 10, Médio: 10, Alto: 10 } });
    spend(1, 5_000_000);
    expect(() => check(1)).toThrow(BudgetExceeded);
    ceilingTo(1, 10_000_000);
    expect(() => check(1)).not.toThrow();
    ceilingTo(1, 'off');
    spend(1, 999_999_999);
    expect(() => check(1)).not.toThrow();
  });

  it('o teto padrão sai do esforço da história', () => {
    configure({ byEffort: { Baixo: 100, Médio: 2_000_000, Alto: 3_000_000 } });
    spend(1, 1_500_000);
    expect(() => check(1)).not.toThrow();
    setField(1, 'Esforço da atividade', 'Baixo');
    expect(() => check(1)).toThrow(BudgetExceeded);
  });

  it('só execuções sem medição não são base para recusar', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, 0, 0, 5);
    expect(() => check(1)).not.toThrow();
  });

  it('subir o teto rearma a parada: a nota sai de novo no novo teto', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, CEILING);
    expect(() => check(1)).toThrow(BudgetExceeded);
    ceilingTo(1, 2 * CEILING);
    expect(() => check(1)).not.toThrow();
    spend(1, 2 * CEILING);
    expect(() => check(1)).toThrow(BudgetExceeded);
    expect(bodies(1).filter((b) => b.startsWith('**Teto de consumo**'))).toHaveLength(2);
    expect(stateOf(1)).toMatchObject({ ceiling: 2 * CEILING, stopped: true });
  });

  it('história já com a pessoa só recebe a nota, sem trocar o status', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, CEILING);
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_answer' });
    expect(() => check(1)).toThrow(BudgetExceeded);
    expect(card(1).status).toBe('waiting_answer');
    expect(bodies(1)).toContain(budgetNote.stopped(CEILING, CEILING));
  });

  it('falha aberta: erro ao ler o gasto vai para o log e a execução segue', () => {
    configure();
    reading = 'throws';
    expect(() => check(1)).not.toThrow();
    expect(() => finish(1)).not.toThrow();
    expect(log.join('\n')).toContain('Teto de consumo: banco fechado');
  });

  it('a nota da medição parcial entra na conta', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, CEILING, 2, 5);
    expect(() => check(1)).toThrow(BudgetExceeded);
    expect(bodies(1)).toContain(budgetNote.stopped(CEILING, CEILING, 3));
  });
});

describe('onRunFinished: a política em 80%', () => {
  beforeEach(() => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, 850_000);
  });

  it('finish: a história passa para a pessoa em aguardando revisão, com a nota', () => {
    finish(2);
    expect(card(1).status).toBe('waiting_review');
    expect(bodies(1)).toContain(budgetNote.warn(850_000, CEILING, budgetNote.actionFinish));
    expect(stateOf(1)).toMatchObject({ ceiling: CEILING, warned: true });
  });

  it('a nota do finish não vira mensagem de pessoa (não devolve a vez à IA)', () => {
    finish(1);
    const note = snap().comments.find((c) => c.cardId === card(1).id && c.body.startsWith('**Teto de consumo**'))!;
    expect(note.source).toBe('ai');
    expect(card(1).status).toBe('waiting_review');
  });

  it('stop: bloqueia a história com o motivo', () => {
    configure({ policy: 'stop' });
    finish(1);
    expect(card(1).status).toBe('blocked');
    expect(card(1).statusReason).toBe(budgetNote.warn(850_000, CEILING, budgetNote.actionStop));
  });

  it('é aplicada uma vez por teto', () => {
    finish(1);
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'ready' });
    spend(1, 900_000);
    finish(1);
    expect(card(1).status).toBe('ready');
    expect(bodies(1).filter((b) => b.startsWith('**Teto de consumo**'))).toHaveLength(1);
  });

  it('rearma ao mudar o teto', () => {
    finish(1);
    ceilingTo(1, 2 * CEILING);
    spend(1, 1_700_000);
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'ready' });
    finish(1);
    expect(card(1).status).toBe('waiting_review');
    expect(stateOf(1)).toMatchObject({ ceiling: 2 * CEILING, warned: true });
  });

  it('abaixo do aviso não faz nada', () => {
    spend(1, 790_000);
    finish(1);
    expect(stateOf(1)).toBeNull();
    expect(bodies(1)).toEqual([]);
  });

  it.each(['refine', 'summarize', 'conflict'] as const)('o modo %s não conta', (mode) => {
    finish(1, mode);
    expect(stateOf(1)).toBeNull();
  });

  it('um salto direto a 100% executa só a parada, sem a política', () => {
    configure({ policy: 'finish' });
    spend(1, 1_100_000);
    finish(1);
    expect(card(1).status).toBe('blocked');
    expect(stateOf(1)).toMatchObject({ stopped: true, warned: false });
    expect(bodies(1)).toContain(budgetNote.stopped(1_100_000, CEILING));
  });

  it('em 100% depois do aviso, para sem repetir o aviso', () => {
    finish(1);
    spend(1, CEILING);
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'ready' });
    finish(1);
    expect(card(1).status).toBe('blocked');
    expect(stateOf(1)).toMatchObject({ warned: true, stopped: true });
  });

  it('história já com a pessoa: só a nota, o status fica', () => {
    ai({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_answer' });
    finish(1);
    expect(card(1).status).toBe('waiting_answer');
    expect(bodies(1)).toContain(budgetNote.warn(850_000, CEILING, budgetNote.actionFinish));
  });

  it('a execução de uma sub-tarefa avalia a história dela', () => {
    finish(3);
    expect(card(1).status).toBe('waiting_review');
    expect(bodies(3)).toEqual([]);
  });
});

describe('onRunFinished: baixar o nível', () => {
  beforeEach(() => {
    configure({ policy: 'downgrade' });
    ceilingTo(1, CEILING);
    spend(1, 850_000);
  });

  it('desce um nível o que ainda não rodou e conta de/para e o que ficou', () => {
    expect(modelOf(2)).toBe('claude:sonnet@medium');
    ran.add(card(3).id);
    finish(1);
    expect(modelOf(2)).toBe('claude:sonnet@low');
    expect(modelOf(3)).toBe('claude:sonnet@medium');
    const note = bodies(1).find((b) => b.startsWith('**Teto de consumo**'))!;
    // a própria história (ainda não executada nesta fase) desce junto
    expect(note).toContain('Desci o modelo de: #1 (Sonnet 5.5 · medium → Sonnet 5.5 · low), #2 (Sonnet 5.5 · medium → Sonnet 5.5 · low).');
    expect(note).toContain('#3 (já executado)');
    // baixar o nível não troca o status: a história segue
    expect(card(1).status).not.toBe('waiting_review');
  });

  it('modelo escolhido à mão, subido por checagem e Revisão não descem', () => {
    setField(2, 'Modelo', 'claude:opus@high');
    escalated.add(card(3).id);
    create('Revisar', 'A fazer', 1);
    setField(4, 'Fase', 'Revisão');
    setField(4, 'Esforço da atividade', 'Médio');
    const reviewBefore = modelOf(4);
    finish(1);
    expect(modelOf(2)).toBe('claude:opus@high');
    expect(modelOf(3)).toBe('claude:sonnet@medium');
    expect(modelOf(4)).toBe(reviewBefore);
    const note = bodies(1).find((b) => b.startsWith('**Teto de consumo**'))!;
    expect(note).toContain('#2 (modelo escolhido à mão)');
    expect(note).toContain('#3 (modelo subido por checagem)');
  });

  it('nada executado é trocado: o card que já rodou fica como estava', () => {
    ran.add(card(2).id);
    ran.add(card(3).id);
    ran.add(card(1).id);
    finish(1);
    expect(modelOf(2)).toBe('claude:sonnet@medium');
    expect(card(1).status).toBe('waiting_review');
  });

  it('a descida também é uma vez por teto', () => {
    finish(1);
    expect(modelOf(2)).toBe('claude:sonnet@low');
    spend(1, 900_000);
    finish(1);
    expect(modelOf(2)).toBe('claude:sonnet@low');
    expect(bodies(1).filter((b) => b.startsWith('**Teto de consumo**'))).toHaveLength(1);
  });
});

describe('limpeza ao apagar o card', () => {
  it('deletePermanent apaga o teto do card e o estado da história', () => {
    configure();
    ceilingTo(1, CEILING);
    spend(1, 850_000);
    finish(1);
    const id = card(1).id;
    expect(router.getMeta(budgetCardKey(id))).toBe(String(CEILING));
    expect(router.getMeta(budgetStateKey(id))).toBeTruthy();
    human({ type: 'card.trash', cardId: id });
    human({ type: 'card.deletePermanent', cardId: id });
    expect(router.getMeta(budgetCardKey(id))).toBeUndefined();
    expect(router.getMeta(budgetStateKey(id))).toBeUndefined();
  });
});

describe('storyTokens do router', () => {
  it('sem execuções devolve zeros', () => {
    expect(router.storyTokens(card(1).id)).toEqual({ tokens: 0, measured: 0, runs: 0 });
  });
});
