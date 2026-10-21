import { describe, expect, it } from 'vitest';
import { aiSignalsOf, panelRework, reworkOf, type BashSignalRow, type ReworkEventRow } from '../src/extension/log/rework';
import { openInMemory } from '../src/extension/db/database';
import path from 'node:path';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
import { formatRework } from '../src/extension/mcp/tools/metrics';
import { EMPTY_REWORK, ZERO_SIGNAL } from '../src/shared/metrics';

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

describe('formatRework', () => {
  it('tabela compacta por fase e por modelo, e as histórias com bug', () => {
    const text = formatRework({
      phases: [{ phase: 'PRD', reviews: 3, approved: 2, adjusted: 1, resolved: 2, firstPass: 1, ...noSignals }],
      models: [{ model: '', reviews: 3, adjusted: 1 }],
      escapes: { ...noEscapes, stories: 4, withBugs: 1, bugs: 2 },
      aiSignals: EMPTY_REWORK.aiSignals,
    });
    expect(text).toContain('fase  revisões  de primeira  ajustes');
    expect(text).toContain('PRD   3         1 de 2       1');
    expect(text).toContain('não definido');
    expect(text).toContain('histórias concluídas no período: 4; com bug vinculado: 1 (2 bug(s))');
    expect(formatRework(EMPTY_REWORK)).toContain('nenhuma revisão no recorte.');
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
