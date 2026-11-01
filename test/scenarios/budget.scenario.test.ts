// Cenário de ponta a ponta do teto de consumo por história (#1112), do card até a conversa: a história de verdade com
// sub-tarefas, o runner, o log de uso (`ai_runs`) e o `BudgetGuard` ligados como o `boardHost` os liga (guarda no
// runner e `onDidFinish`). Só o processo da CLI é falso: cada execução "gasta" os tokens que o cenário manda, e é
// esse gasto, lido do log, que cruza os 80% e os 100%. O teto vem do `meta` do board, como a tela o gravará.
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetExceeded, BudgetGuard } from '../../src/extension/budget';
import { MODEL_LADDERS_KEY, parseLadders } from '../../src/shared/modelLadder';
import { BUDGET_META_KEY, budgetCardKey, type BudgetConfig } from '../../src/shared/budget';
import { storyWorld, type StoryWorld } from './storyWorld';

const SESSION = '5b0f7a52-3c1d-4c1e-8f7e-0a1b2c3d4e5f';
const DONE = JSON.stringify({ outcome: 'DONE', summary: 'Etapa concluída.', failure_reason: null, pending: null });
const TETO = 1000;
const NOTE = '**Teto de consumo**';

let world: StoryWorld | undefined;
/** os tokens que a próxima execução gasta (o processo falso lê aqui) */
let spend = 0;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

/** O processo do Claude Code: termina bem, com o bloco final e o consumo que o cenário mandou. */
async function setup(config: Partial<BudgetConfig> = {}): Promise<StoryWorld> {
  spend = 0;
  const w = await storyWorld(() => ({
    stdout:
      JSON.stringify({ type: 'system', subtype: 'init', session_id: SESSION }) +
      '\n' +
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: DONE,
        session_id: SESSION,
        num_turns: 1,
        usage: { input_tokens: spend, output_tokens: 0 },
        modelUsage: { 'claude-sonnet': { inputTokens: spend, outputTokens: 0 } },
      }) +
      '\n',
    code: 0,
  }));
  world = w;
  const { router, runner } = w;
  // o card avulso do cenário não faz parte da história: fora da fila
  router.handle({ type: 'card.status.set', cardId: w.cardId, status: null });
  router.setMeta(
    BUDGET_META_KEY,
    JSON.stringify({
      enabled: true,
      byEffort: { Baixo: TETO, Médio: TETO, Alto: TETO },
      warnAt: 80,
      policy: 'finish',
      ...config,
    }),
  );
  // como o host: a guarda no runner e o fim da execução avaliado pela mesma guarda
  const budget = new BudgetGuard({
    router,
    ladders: () => parseLadders(router.getMeta(MODEL_LADDERS_KEY)),
    escalated: () => false,
    log: (line) => w.lines.push(line),
  });
  w.runnerDeps.budget = budget;
  runner.onDidFinish((cardId, mode) => budget.onRunFinished(cardId, mode));
  return w;
}

/** Inicia a execução do card e espera o fim. */
function run(w: StoryWorld, cardId: string, origin: 'heartbeat' | 'manual', tokens: number): Promise<unknown> {
  spend = tokens;
  w.starts.push(cardId);
  return new Promise((resolve, reject) => {
    try {
      w.runner.start(cardId, { origin, onExit: resolve });
    } catch (e) {
      reject(e);
    }
  });
}
/** Dá a vez ao que o `onDidFinish` ainda escreve depois do `onExit`. */
const settle = () => new Promise((r) => setTimeout(r, 20));
const notes = (w: StoryWorld) => w.storyComments().filter((b) => b.includes(NOTE));
const status = (w: StoryWorld, id = w.storyId) => w.router.snapshot().cards.find((c) => c.id === id)!.status;

/** Uma segunda história, com uma sub-tarefa, no mesmo board (outra história sem o teto da primeira). */
function otherStory(w: StoryWorld): { story: string; sub: string } {
  const s = w.router.snapshot();
  const parent = s.workflows.find((x) => x.kind === 'parent')!;
  const child = s.workflows.find((x) => x.kind === 'child')!;
  const code = s.cards.find((c) => c.id === w.storyId)!.columnId;
  const story = w.router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === parent.id)!.id,
    columnId: code,
    parentId: null,
    title: 'Outra história',
  });
  const sub = w.router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === child.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === child.id && c.category === 'open')!.id,
    parentId: story,
    title: 'Etapa da outra história',
  });
  return { story, sub };
}

describe('cenário: o teto de consumo da história', () => {
  it('ao cruzar 80% a nota aparece uma vez e a política finish passa a história para a pessoa', async () => {
    const w = await setup();
    const a = w.subtask('Etapa A', null);
    const b = w.subtask('Etapa B', null);

    await run(w, a, 'heartbeat', 500); // 50%: nada ainda
    await settle();
    expect(notes(w)).toHaveLength(0);

    await run(w, b, 'heartbeat', 400); // 90%: avisa
    await settle();
    expect(notes(w)).toHaveLength(1);
    expect(notes(w)[0]).toContain('90%');
    expect(status(w)).toBe('waiting_review');

    // uma vez por teto: outra execução ainda abaixo de 100% não repete o aviso
    await run(w, a, 'heartbeat', 50);
    await settle();
    expect(notes(w)).toHaveLength(1);
  });

  it('em 100% nenhuma execução automática nova começa, e outra história sem teto segue', async () => {
    const w = await setup();
    const a = w.subtask('Etapa A', null);
    const b = w.subtask('Etapa B', null);
    const other = otherStory(w);
    w.router.setMeta(budgetCardKey(other.story), 'off');

    await run(w, a, 'heartbeat', 1200);
    await settle();
    expect(status(w)).toBe('blocked');
    expect(notes(w).some((n) => n.includes('não inicia mais execuções sozinho'))).toBe(true);

    const startsBefore = w.cliCommands.length;
    await expect(run(w, b, 'heartbeat', 10)).rejects.toBeInstanceOf(BudgetExceeded);
    expect(w.cliCommands.length).toBe(startsBefore);

    // a recusa não desliga nada: a outra história inicia a execução dela
    await run(w, other.sub, 'heartbeat', 10);
    expect(w.cliCommands.length).toBe(startsBefore + 1);
    expect(status(w, other.story)).not.toBe('blocked');
  });

  it('sem teto (desligado, ou "sem teto" na história) nada muda', async () => {
    const off = await setup({ enabled: false });
    const a = off.subtask('Etapa A', null);
    await run(off, a, 'heartbeat', 5000);
    await run(off, a, 'heartbeat', 5000);
    await settle();
    expect(notes(off)).toHaveLength(0);
    expect(status(off)).not.toBe('blocked');
    expect(status(off)).not.toBe('waiting_review');
    off.dispose();

    const noCeiling = await setup();
    noCeiling.router.setMeta(budgetCardKey(noCeiling.storyId), 'off');
    const b = noCeiling.subtask('Etapa B', null);
    await run(noCeiling, b, 'heartbeat', 5000);
    await run(noCeiling, b, 'heartbeat', 5000);
    await settle();
    expect(notes(noCeiling)).toHaveLength(0);
    expect(status(noCeiling)).not.toBe('blocked');
  });

  it('a execução manual acima do teto roda e a história recebe uma nota', async () => {
    const w = await setup();
    const a = w.subtask('Etapa A', null);
    await run(w, a, 'heartbeat', 1200);
    await settle();
    // O fim da execução que estourou já gravou `stopped` (e a nota de parada); por isso a nota do início manual só
    // aparece num teto novo. Baixar o teto para 1100 (ainda abaixo do gasto) abre esse teto sem tirar a história de 100%.
    w.router.setMeta(budgetCardKey(w.storyId), '1100');

    const before = w.cliCommands.length;
    await run(w, a, 'manual', 10);
    await settle();
    expect(w.cliCommands.length).toBe(before + 1);
    expect(w.storyComments().filter((b) => b.includes('Você iniciou à mão'))).toHaveLength(1);

    // uma nota por teto
    await run(w, a, 'manual', 10);
    await settle();
    expect(w.storyComments().filter((b) => b.includes('Você iniciou à mão'))).toHaveLength(1);
  });

  it('subir o teto rearma o aviso: a execução automática volta e o 80% do novo teto avisa de novo', async () => {
    const w = await setup();
    const a = w.subtask('Etapa A', null);
    await run(w, a, 'heartbeat', 900);
    await settle();
    expect(notes(w)).toHaveLength(1);

    w.router.setMeta(budgetCardKey(w.storyId), '2000');
    // o teto novo (2000) deixa a história em 45%: o início automático é aceito e não há aviso novo
    await run(w, a, 'heartbeat', 10);
    await settle();
    expect(notes(w)).toHaveLength(1);

    await run(w, a, 'heartbeat', 800); // 1710 de 2000: 85%
    await settle();
    expect(notes(w)).toHaveLength(2);
    expect(notes(w)[1]).toContain('2.000');
  });
});
