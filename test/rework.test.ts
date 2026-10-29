import { describe, expect, it } from 'vitest';
import { aiSignalsOf, panelRework, reworkOf, unfinishedOf, type BashSignalRow, type ReworkEventRow } from '../src/extension/log/rework';
import { openInMemory } from '../src/extension/db/database';
import path from 'node:path';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
import { formatRework } from '../src/extension/mcp/tools/metrics';
import { EMPTY_DELIVERY, EMPTY_REWORK, ZERO_SIGNAL, type MetricsDelivery } from '../src/shared/metrics';

// Os sinais da IA (#605) são contas de outra função: nas fases do `reworkOf` vêm zerados.
const noSignals = EMPTY_REWORK.aiSignals;
const noEscapes = EMPTY_REWORK.escapes;

// As contas do retrabalho (rework.ts), sem banco: só a sequência de mudanças de status.

const PERIOD = { start: 1000, end: 2000 };
const row = (
  cardNumber: number,
  phase: string,
  at: number,
  from: string,
  to: string,
  over: Partial<ReworkEventRow> = {},
): ReworkEventRow => ({
  cardNumber,
  phase,
  at,
  from,
  to,
  source: to === 'waiting_review' ? 'ai' : 'human',
  model: '',
  agent: '',
  ...over,
});

describe('reworkOf', () => {
  it('conta revisões, aprovações e ajustes por fase; "de primeira" é a primeira resposta da pessoa', () => {
    const { phases } = reworkOf(
      [
        // #1 no PRD: devolvido uma vez, aprovado na segunda
        row(1, 'PRD', 1100, 'running', 'waiting_review'),
        row(1, 'PRD', 1200, 'waiting_review', 'ready'),
        row(1, 'PRD', 1300, 'running', 'waiting_review'),
        row(1, 'PRD', 1400, 'waiting_review', 'approved'),
        // #2 no PRD: aprovado de primeira
        row(2, 'PRD', 1150, 'running', 'waiting_review'),
        row(2, 'PRD', 1250, 'waiting_review', 'approved'),
      ],
      PERIOD,
    );
    expect(phases).toEqual([{ phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1, ...noSignals }]);
  });

  it('a aprovação automática do modo autônomo e as mudanças da IA não são resposta da pessoa', () => {
    const { phases } = reworkOf(
      [row(1, 'Spec', 1100, 'running', 'approved', { source: 'ai' }), row(1, 'Spec', 1200, 'waiting_review', 'ready', { source: 'ai' })],
      PERIOD,
    );
    expect(phases).toEqual([]);
  });

  it('o ajuste conta para o modelo da execução que pediu a revisão respondida', () => {
    const { models } = reworkOf(
      [
        row(1, 'PRD', 1100, 'running', 'waiting_review', { model: 'opus' }),
        row(1, 'PRD', 1200, 'waiting_review', 'ready'),
        row(1, 'PRD', 1300, 'running', 'waiting_review', { model: 'sonnet' }),
        row(1, 'PRD', 1400, 'waiting_review', 'approved'),
      ],
      PERIOD,
    );
    expect(models).toEqual([
      { model: 'opus', reviews: 1, adjusted: 1 },
      { model: 'sonnet', reviews: 1, adjusted: 0 },
    ]);
  });

  it('o que veio antes do período só dá contexto: a revisão de antes não conta, a resposta dentro conta', () => {
    const { phases, models } = reworkOf(
      [
        // pedida antes, aprovada dentro: conta como primeira resposta
        row(3, 'Spec', 900, 'running', 'waiting_review', { model: 'opus' }),
        row(3, 'Spec', 1100, 'waiting_review', 'approved'),
        // já respondida (ajuste) antes do período: a aprovação de dentro não é "de primeira"
        row(4, 'Plan', 800, 'running', 'waiting_review'),
        row(4, 'Plan', 850, 'waiting_review', 'ready'),
        row(4, 'Plan', 900, 'running', 'waiting_review'),
        row(4, 'Plan', 1500, 'waiting_review', 'approved'),
        // depois do período: fora
        row(5, 'PRD', 2500, 'running', 'waiting_review'),
      ],
      PERIOD,
    );
    expect(phases).toEqual([
      { phase: 'Spec', reviews: 0, approved: 1, adjusted: 0, resolved: 1, firstPass: 1, ...noSignals },
      { phase: 'Plan', reviews: 0, approved: 1, adjusted: 0, resolved: 0, firstPass: 0, ...noSignals },
    ]);
    expect(models).toEqual([]);
  });
});

describe('reworkOf: o corte por agente (RF6) e os ajustes', () => {
  const rows = [
    row(1, 'PRD', 1100, 'running', 'waiting_review', { model: 'opus', agent: 'backend-node' }),
    row(1, 'PRD', 1200, 'waiting_review', 'ready'),
    row(2, 'PRD', 1100, 'running', 'waiting_review', { model: 'opus', agent: 'backend-node' }),
    row(2, 'PRD', 1200, 'waiting_review', 'approved'),
    row(3, 'PRD', 1100, 'running', 'waiting_review', { model: 'opus', agent: 'frontend-web' }),
    row(3, 'PRD', 1200, 'waiting_review', 'approved'),
    row(4, 'PRD', 1100, 'running', 'waiting_review'),
    row(4, 'PRD', 1200, 'waiting_review', 'ready'),
    // aprovação automática do modo autônomo: fora da conta
    row(5, 'PRD', 1100, 'running', 'approved', { source: 'ai', agent: 'backend-node' }),
  ];

  it('conta revisões e ajustes por agente; "" = sem agente', () => {
    const { agents } = reworkOf(rows, PERIOD);
    expect(agents).toEqual([
      { agent: 'backend-node', reviews: 2, adjusted: 1 },
      { agent: '', reviews: 1, adjusted: 1 },
      { agent: 'frontend-web', reviews: 1, adjusted: 0 },
    ]);
  });

  it('adjustments traz também o ajuste anterior ao período, e nada depois do fim', () => {
    const { adjustments, agents } = reworkOf(
      [
        row(7, 'Spec', 100, 'running', 'waiting_review', { model: 'opus', agent: 'backend-node' }),
        row(7, 'Spec', 200, 'waiting_review', 'ready'),
        row(8, 'Spec', 1100, 'running', 'waiting_review', { model: 'sonnet', agent: 'frontend-web' }),
        row(8, 'Spec', 1200, 'waiting_review', 'ready'),
      ],
      PERIOD,
    );
    expect(adjustments).toEqual([
      { cardNumber: 7, model: 'opus', agent: 'backend-node' },
      { cardNumber: 8, model: 'sonnet', agent: 'frontend-web' },
    ]);
    // o corte por agente só conta o período
    expect(agents).toEqual([{ agent: 'frontend-web', reviews: 1, adjusted: 1 }]);
  });
});

describe('unfinishedOf (RF7)', () => {
  it('3 de 10 sem resultado; unsupported e unknown entram só no total', () => {
    const { models, agents } = unfinishedOf([
      { model: 'opus', agent: 'a', outcome: 'completed', n: 4 },
      { model: 'opus', agent: 'a', outcome: 'failed', n: 1 },
      { model: 'opus', agent: 'b', outcome: 'timeout', n: 1 },
      { model: 'opus', agent: 'b', outcome: 'stopped', n: 1 },
      { model: 'opus', agent: 'b', outcome: 'unsupported', n: 2 },
      { model: 'opus', agent: 'b', outcome: 'unknown', n: 1 },
      { model: 'sonnet', agent: 'b', outcome: 'completed', n: 5 },
    ]);
    expect(models[0]).toEqual({ value: 'opus', runs: 10, unfinished: 3, failed: 1, timeout: 1, stopped: 1 });
    expect(models[1]).toEqual({ value: 'sonnet', runs: 5, unfinished: 0, failed: 0, timeout: 0, stopped: 0 });
    expect(agents.map((a) => [a.value, a.runs, a.unfinished])).toEqual([
      ['b', 10, 2],
      ['a', 5, 1],
    ]);
  });
});

describe('formatRework', () => {
  it('traz por agente, execuções sem resultado, custo por entrega e a visão cruzada; null sai como "-"', () => {
    const unfinished = (value: string, runs: number, n: number) => ({ value, runs, unfinished: n, failed: n, timeout: 0, stopped: 0 });
    const delivery: MetricsDelivery = {
      stories: 2,
      measured: 1,
      tokens: 1800,
      groups: [{ type: 'Bug', effort: '', stories: 2, measured: 1, tokens: 1800, meanTokens: 1800, medianTokens: null }],
      byModel: [{ type: 'Bug', value: 'sonnet', stories: 2, measured: 1, tokens: 1800, tokensPerStory: 1800, adjusted: 1 }],
      byAgent: [{ type: 'Bug', value: '', stories: 2, measured: 0, tokens: null, tokensPerStory: null, adjusted: 0 }],
      omitted: { groups: 0, byModel: 3, byAgent: 0 },
    };
    const text = formatRework(
      {
        ...EMPTY_REWORK,
        phases: [{ phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1, ...noSignals }],
        agents: [{ agent: '', reviews: 2, adjusted: 1 }],
        unfinished: { models: [unfinished('sonnet', 10, 3)], agents: [unfinished('backend-node', 4, 1)] },
      },
      delivery,
    );
    expect(text).toContain('por agente da execução que pediu a revisão');
    expect(text).toContain('sem agente');
    expect(text).toContain('execuções sem resultado (aproximação: falha, tempo esgotado ou interrompida;');
    expect(text).toContain('3 de 10');
    expect(text).toContain('1 de 4');
    expect(text).toContain('custo por entrega: 2 histórias concluídas, 1 medidas, 1800 tokens (detalhe guardado');
    expect(text).toMatch(/Bug\s+não definido\s+2\s+1\s+1800\s+1800\s+-/);
    expect(text).toContain('visão cruzada (uma história com vários modelos/agentes conta para cada um)');
    expect(text).toContain('+3 linha(s) fora do limite');
    // sem história concluída, o custo por entrega e a visão cruzada viram uma linha só
    const empty = formatRework(EMPTY_REWORK, EMPTY_DELIVERY);
    expect(empty).toContain('custo por entrega: nenhuma história concluída no período');
    expect(empty).not.toContain('visão cruzada');
  });

  it('tabela compacta por fase e por modelo, e as histórias com bug', () => {
    const text = formatRework({
      phases: [{ phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1, ...noSignals }],
      models: [{ model: '', reviews: 3, adjusted: 1 }],
      agents: [],
      unfinished: EMPTY_REWORK.unfinished,
      escapes: { ...noEscapes, stories: 4, withBugs: 1, bugs: 2 },
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    expect(text).toContain('fase  revisões  de primeira  ajustes');
    expect(text).toContain('PRD   3         1 de 2       1');
    expect(text).toContain('não definido');
    expect(text).toContain('histórias concluídas no período: 4; com bug vinculado: 1 (2 bug(s))');
    expect(formatRework(EMPTY_REWORK)).toContain('nenhuma revisão no recorte.');
  });

  it('mostra os sinais da IA com a parte autônoma, por fase e no total; sem registro de Bash, "não medidos" (#605)', () => {
    const signal = (count: number, runs: number, autonomousCount: number, autonomousRuns: number) => ({
      count,
      runs,
      autonomousCount,
      autonomousRuns,
    });
    const text = formatRework({
      phases: [
        { phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1, ...noSignals },
        {
          phase: 'Revisão',
          reviews: 0,
          approved: 0,
          adjusted: 0,
          resolved: 0,
          firstPass: 0,
          bashRuns: 2,
          reviewFixes: signal(3, 2, 1, 1),
          testFailures: ZERO_SIGNAL,
          commitsAfterPr: signal(2, 1, 0, 0),
        },
      ],
      models: [],
      agents: [],
      unfinished: EMPTY_REWORK.unfinished,
      escapes: { stories: 4, withBugs: 1, bugs: 2, autonomousStories: 3, autonomousWithBugs: 1, autonomousBugs: 2 },
      aiSignals: { bashRuns: 5, reviewFixes: signal(3, 2, 1, 1), testFailures: signal(1, 1, 1, 1), commitsAfterPr: signal(2, 1, 0, 0) },
    });
    expect(text).toContain('correções  test c/ falha  commits pós-PR');
    // fase sem registro de Bash: "-", não zero
    expect(text).toContain('PRD      3         1 de 2       1        -          -              -');
    expect(text).toContain('Revisão  0         -            0        3 (1)      0 (0)          2 (0)');
    expect(text).toContain('com bug vinculado: 1 (2 bug(s)); autônomas: 1 de 3 (2 bug(s))');
    expect(text).toContain('sinais da IA (execuções com registro de Bash: 5');
    expect(text).toContain('correções na Revisão: 3 em 2 execuções (autônomas: 1 em 1)');
    expect(text).toContain('npm test com falha: 1 em 1 execuções (autônomas: 1 em 1)');
    expect(text).toContain('commits depois do PR: 2 em 1 histórias (autônomas: 0 em 0)');
    expect(formatRework(EMPTY_REWORK)).toContain('sinais da IA: não medidos (nenhuma execução com registro de Bash no período)');
  });
});

describe('aiSignalsOf: os sinais da IA (#605)', () => {
  const bash = (over: Partial<BashSignalRow> & { runId: string; command: string }): BashSignalRow => ({
    storyId: 's1',
    phase: 'Implementação',
    autonomous: false,
    startedAt: 1500,
    calls: 1,
    failed: 0,
    ...over,
  });

  it('só as execuções iniciadas no período entram; a base é a execução com qualquer comando registrado', () => {
    const { total } = aiSignalsOf(
      [
        bash({ runId: 'r1', command: 'cat' }),
        bash({ runId: 'r1', command: 'ls' }),
        bash({ runId: 'fora', command: 'npm test', failed: 1, startedAt: 999 }),
      ],
      PERIOD,
    );
    expect(total.bashRuns).toBe(1);
    expect(total.testFailures).toEqual(ZERO_SIGNAL);
  });

  it('correções na Revisão: commits em execuções da fase "Revisão" (pelo nome normalizado), com a parte autônoma', () => {
    const { total, byPhase } = aiSignalsOf(
      [
        bash({ runId: 'r1', command: 'git commit', phase: 'Revisao', calls: 2 }),
        bash({ runId: 'r2', command: 'git commit', phase: 'REVISÃO', calls: 1, autonomous: true }),
        bash({ runId: 'r3', command: 'git commit', phase: 'Implementação', calls: 5 }),
      ],
      PERIOD,
    );
    expect(total.reviewFixes).toEqual({ count: 3, runs: 2, autonomousCount: 1, autonomousRuns: 1 });
    expect(byPhase.get('Revisao')!.reviewFixes).toEqual({ count: 2, runs: 1, autonomousCount: 0, autonomousRuns: 0 });
    expect(byPhase.get('Implementação')!.reviewFixes).toEqual(ZERO_SIGNAL);
  });

  it('npm test com falha: só as chamadas que voltaram com erro; outro comando com erro não conta', () => {
    const { total } = aiSignalsOf(
      [
        bash({ runId: 'r1', command: 'npm test', calls: 3, failed: 2, autonomous: true }),
        bash({ runId: 'r2', command: 'npm test', calls: 1, failed: 0 }),
        bash({ runId: 'r3', command: 'npx', calls: 1, failed: 1 }),
      ],
      PERIOD,
    );
    expect(total.bashRuns).toBe(3);
    expect(total.testFailures).toEqual({ count: 2, runs: 1, autonomousCount: 2, autonomousRuns: 1 });
  });

  it('commits depois do PR: a execução começou depois do pull_request_set; no total conta histórias, por fase conta execuções', () => {
    const { total, byPhase } = aiSignalsOf(
      [
        // antes do PR: não conta
        bash({ runId: 'r0', command: 'git commit', storyId: 's1', startedAt: 1100, prAt: 1200 }),
        bash({ runId: 'r1', command: 'git commit', storyId: 's1', startedAt: 1300, prAt: 1200, calls: 2 }),
        bash({ runId: 'r2', command: 'git commit', storyId: 's1', startedAt: 1400, prAt: 1200, autonomous: true }),
        bash({ runId: 'r3', command: 'git commit', storyId: 's2', startedAt: 1400, prAt: 1300 }),
        // sem PR, ou sem card: não conta
        bash({ runId: 'r4', command: 'git commit', storyId: 's3', startedAt: 1400 }),
        bash({ runId: 'r5', command: 'git commit', storyId: null, startedAt: 1400, prAt: 1000 }),
      ],
      PERIOD,
    );
    // s1 é autônoma porque uma das execuções dela depois do PR foi autônoma
    expect(total.commitsAfterPr).toEqual({ count: 4, runs: 2, autonomousCount: 1, autonomousRuns: 1 });
    expect(byPhase.get('Implementação')!.commitsAfterPr).toEqual({ count: 4, runs: 3, autonomousCount: 1, autonomousRuns: 1 });
  });
});

describe('panelRework com banco: os sinais da IA e a parte autônoma dos escapes (#605)', () => {
  it('lê ai_run_bash com a história da execução e o PR, e marca a história autônoma nos escapes', async () => {
    const db = await openInMemory(WASM_DIR);
    db.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    db.run("INSERT INTO workflows (id, board_id, name, position, kind) VALUES ('w', 'b', 'Histórias', 0, 'parent')");
    db.run(
      "INSERT INTO card_types (id, board_id, name, color, default_workflow_id) VALUES ('t', 'b', 'História', 'x', 'w'), ('tb', 'b', 'Bug', 'x', 'w')",
    );
    db.run("INSERT INTO columns (id, workflow_id, name, position) VALUES ('col', 'w', 'Concluído', 0)");
    const card = (id: string, number: number, type: string, parent: string | null) =>
      db.run(
        'INSERT INTO cards (id, board_id, workflow_id, column_id, type_id, number, title, position, parent_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [id, 'b', 'w', 'col', type, number, `Card ${number}`, 0, parent, number === 9 ? 1800 : 100, 100],
      );
    card('s1', 1, 't', null);
    card('sub', 2, 't', 's1');
    card('s2', 3, 't', null);
    card('bug', 9, 'tb', null);
    const event = (id: string, cardId: string, kind: string, at: number) =>
      db.run(
        "INSERT INTO card_events (id, board_id, at, month, kind, card_id, card_number, card_title, card_type, workflow, author, source) VALUES (?,?,?,?,?,?,1,'x','História','Histórias','a','human')",
        [id, 'b', at, '2026-10', kind, cardId],
      );
    event('e1', 's1', 'pull_request_set', 1200);
    event('e2', 's1', 'done', 1500);
    event('e3', 's2', 'done', 1500);
    db.run("INSERT INTO card_links (id, from_id, to_id, kind) VALUES ('l', 'bug', 's1', 'related')");
    const run = (id: string, cardId: string | null, phase: string, autonomous: number, startedAt: number) =>
      db.run(
        "INSERT INTO ai_runs (id, board_id, started_at, month, origin, tool, permission, card_id, phase, autonomous, workflow) VALUES (?,?,?,?,?,?,?,?,?,?,'Histórias')",
        [id, 'b', startedAt, '2026-10', 'manual', 'claude', 'x', cardId, phase, autonomous],
      );
    run('r1', 'sub', 'Implementação', 0, 1100);
    run('r2', 'sub', 'Revisão', 1, 1300);
    run('r3', 's2', 'Implementação', 0, 1400);
    const bash = (runId: string, command: string, calls: number, failed: number) =>
      db.run('INSERT INTO ai_run_bash (run_id, command, calls, failed) VALUES (?,?,?,?)', [runId, command, calls, failed]);
    bash('r1', 'git commit', 1, 0);
    bash('r1', 'npm test', 2, 1);
    bash('r2', 'git commit', 2, 0);
    bash('r3', 'npm test', 1, 0);

    const rework = panelRework(db, 'b', PERIOD, '');
    expect(rework.aiSignals).toEqual({
      bashRuns: 3,
      reviewFixes: { count: 2, runs: 1, autonomousCount: 2, autonomousRuns: 1 },
      testFailures: { count: 1, runs: 1, autonomousCount: 0, autonomousRuns: 0 },
      // r2 é da sub-tarefa de s1 e começou depois do PR de s1; r1 começou antes
      commitsAfterPr: { count: 2, runs: 1, autonomousCount: 2, autonomousRuns: 1 },
    });
    expect(rework.phases.map((p) => [p.phase, p.bashRuns, p.reviewFixes.count, p.testFailures.count, p.commitsAfterPr.runs])).toEqual([
      ['Implementação', 2, 0, 1, 0],
      ['Revisão', 1, 2, 0, 1],
    ]);
    // s1 teve execução autônoma (pela sub-tarefa) e um bug depois da conclusão; s2 não
    expect(rework.escapes).toEqual({ stories: 2, withBugs: 1, bugs: 1, autonomousStories: 1, autonomousWithBugs: 1, autonomousBugs: 1 });
    // fora do período: nada medido
    expect(panelRework(db, 'b', { start: 5000, end: 6000 }, '').aiSignals.bashRuns).toBe(0);
  });
});

describe('panelRework com banco: agentes e execuções sem resultado', () => {
  it('devolve agents e unfinished, ignora execução em andamento e respeita o workflow', async () => {
    const db = await openInMemory(WASM_DIR);
    db.run("INSERT INTO boards (id, workspace_key, name) VALUES ('b', 'ws', 'Projeto')");
    const run = (id: string, model: string, agent: string, outcome: string | null, workflow: string, startedAt = 1500) =>
      db.run(
        'INSERT INTO ai_runs (id, board_id, started_at, month, origin, tool, permission, model, agent, outcome, workflow) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [id, 'b', startedAt, '2026-10', 'manual', 'claude', 'x', model, agent, outcome, workflow],
      );
    run('r1', 'opus', 'backend-node', 'completed', 'Histórias');
    run('r2', 'opus', 'backend-node', 'failed', 'Histórias');
    run('r3', 'opus', '', 'stopped', 'Sub-tarefas');
    run('r4', 'opus', 'backend-node', null, 'Histórias');
    run('r5', 'opus', 'backend-node', 'failed', 'Histórias', 5000);
    const event = (id: string, at: number, from: string, to: string, runId: string | null, source: string) =>
      db.run(
        "INSERT INTO card_events (id, board_id, at, month, kind, card_id, card_number, card_title, card_type, workflow, author, source, column_name, from_value, to_value, run_id) VALUES (?,?,?,?,'status_changed','c',1,'x','História','Histórias','a',?,'PRD',?,?,?)",
        [id, 'b', at, '2026-10', source, from, to, runId],
      );
    event('e1', 1100, 'running', 'waiting_review', 'r1', 'ai');
    event('e2', 1200, 'waiting_review', 'ready', null, 'human');

    const all = panelRework(db, 'b', PERIOD, '');
    expect(all.agents).toEqual([{ agent: 'backend-node', reviews: 1, adjusted: 1 }]);
    expect(all.unfinished.models).toEqual([{ value: 'opus', runs: 3, unfinished: 2, failed: 1, timeout: 0, stopped: 1 }]);
    expect(all.unfinished.agents.map((a) => [a.value, a.runs, a.unfinished])).toEqual([
      ['backend-node', 2, 1],
      ['', 1, 1],
    ]);
    const sub = panelRework(db, 'b', PERIOD, 'Sub-tarefas');
    expect(sub.agents).toEqual([]);
    expect(sub.unfinished.models).toEqual([{ value: 'opus', runs: 1, unfinished: 1, failed: 0, timeout: 0, stopped: 1 }]);
  });
});
