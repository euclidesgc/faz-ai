import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiRun } from '../../src/extension/log/aiRunRepo';
import { scoreStory, scoreboardFile, serialize, summarize, writeScoreboard, type Scoreboard } from '../../evals/lib/scoreboard';
import type { AcceptanceResult, ReferenceStory } from '../../evals/lib/stories';
import type { EvalConfig, EvalLog, StoryRun } from '../../evals/lib/types';

const config: EvalConfig = { model: 'claude:opus@medium', profile: 'claude' };
const story = { id: 's1' } as ReferenceStory;
const run = (end: StoryRun['end'] = 'delivered'): StoryRun => ({ storyId: 's1', end, endNote: null, startedAt: 1000, endedAt: 4000 });
const aiRun = (o: Partial<AiRun> = {}): AiRun =>
  ({
    model: 'opus',
    inputTokens: 10,
    cacheReadTokens: 100,
    cacheWriteTokens: 5,
    outputTokens: 20,
    costUsd: null,
    costEstimated: null,
    costBuckets: null,
    ...o,
  }) as AiRun;
const log = (runs: AiRun[]): EvalLog => ({ runs, signals: { reviewFixes: 1, testFailures: 2, commitsAfterPr: 3 } });
const ok: AcceptanceResult = { passed: true, exitCode: 0, durationMs: 50, output: '' };

describe('scoreStory', () => {
  it('soma os tokens ignorando null e deixa null o campo nunca medido', () => {
    const s = scoreStory(story, run(), log([aiRun(), aiRun({ inputTokens: null, cacheWriteTokens: null, outputTokens: 5 })]), ok, config);
    expect(s.tokens).toEqual({ input: 10, cacheRead: 200, cacheWrite: 5, output: 25 });
    const none = scoreStory(story, run(), log([aiRun({ cacheWriteTokens: null }), aiRun({ cacheWriteTokens: null })]), ok, config);
    expect(none.tokens.cacheWrite).toBeNull();
  });

  it('custo é null sem custo informado e parcial com costRuns', () => {
    expect(scoreStory(story, run(), log([aiRun(), aiRun()]), ok, config)).toMatchObject({ costUsd: null, costRuns: 0 });
    const partial = scoreStory(story, run(), log([aiRun({ costUsd: 0.25 }), aiRun(), aiRun({ costUsd: 0.5 })]), ok, config);
    expect(partial).toMatchObject({ costUsd: 0.75, costRuns: 2, runs: 3 });
  });

  it('custo (C2a): soma informado e estimado à parte, os buckets de cache separados e as execuções sem preço', () => {
    const buckets = (cacheRead: number, cacheWrite: number) => ({ input: 0.01, output: 0.02, cacheRead, cacheWrite });
    const s = scoreStory(
      story,
      run(),
      log([
        aiRun({ costUsd: 1, costEstimated: false, costBuckets: buckets(0.5, 0.2) }),
        aiRun({ costUsd: 0.4, costEstimated: true, costBuckets: buckets(0.1, 0.3) }),
        // custo gravado sem a marca (linha antiga): conta como estimado
        aiRun({ costUsd: 0.1, costEstimated: null }),
        // tokens sem custo: modelo sem preço no catálogo
        aiRun({ model: 'misterio' }),
        // sem tokens e sem custo (Cursor): não é "sem preço"
        aiRun({ inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null }),
      ]),
      ok,
      config,
    );
    expect(s.cost).toEqual({
      usd: 1.5,
      informedUsd: 1,
      estimatedUsd: 0.5,
      buckets: { input: 0.02, cacheRead: 0.6, cacheWrite: 0.5, output: 0.04 },
      runs: 3,
      unpricedRuns: 1,
      complete: false,
    });
    expect(s).toMatchObject({ costUsd: 1.5, costRuns: 3 });
    const complete = scoreStory(story, run(), log([aiRun({ costUsd: 2, costEstimated: false })]), ok, config);
    expect(complete.cost).toMatchObject({ usd: 2, informedUsd: 2, estimatedUsd: null, complete: true, unpricedRuns: 0 });
    expect(scoreStory(story, run(), log([aiRun()]), ok, config).cost).toMatchObject({ usd: null, complete: false, unpricedRuns: 1 });
  });

  it('conta modelMismatches', () => {
    const s = scoreStory(story, run(), log([aiRun(), aiRun({ model: 'sonnet' }), aiRun({ model: null })]), ok, config);
    expect(s.modelMismatches).toBe(2);
  });

  it('anexo exigido que faltou reprova a história mesmo com o aceite passando', () => {
    const s = scoreStory(story, run(), log([]), ok, config, ['PLAN.md']);
    expect(s).toMatchObject({ accepted: false, missingArtifacts: ['PLAN.md'] });
    expect(scoreStory(story, run(), log([]), ok, config).missingArtifacts).toEqual([]);
  });

  it('aceita só com delivered e exit 0; acceptance é null nos outros finais', () => {
    const fail: AcceptanceResult = { passed: false, exitCode: 1, durationMs: 9, output: '' };
    expect(scoreStory(story, run(), log([]), ok, config)).toMatchObject({ accepted: true, acceptance: { exitCode: 0, durationMs: 50 } });
    expect(scoreStory(story, run(), log([]), fail, config).accepted).toBe(false);
    for (const end of ['blocked', 'timeout'] as const) {
      expect(scoreStory(story, run(end), log([]), ok, config)).toMatchObject({ accepted: false, acceptance: null });
    }
    expect(scoreStory(story, run(), log([]), null, config)).toMatchObject({ accepted: false, acceptance: null });
  });

  it('duração é de relógio e copia os sinais', () => {
    const s = scoreStory(story, run(), log([]), ok, config);
    expect(s.durationMs).toBe(3000);
    expect(s.signals).toEqual({ reviewFixes: 1, testFailures: 2, commitsAfterPr: 3 });
  });
});

describe('summarize', () => {
  it('bate com a soma das histórias', () => {
    const a = scoreStory(story, run(), log([aiRun({ costUsd: 1 })]), ok, config);
    const b = scoreStory({ id: 's2' } as ReferenceStory, run('timeout'), log([aiRun(), aiRun()]), null, config);
    const sum = summarize([a, b]);
    expect(sum).toMatchObject({ stories: 2, accepted: 1, acceptanceRate: 0.5, runs: 3, costUsd: 1, costRuns: 1, durationMs: 6000 });
    expect(sum.tokens).toEqual({ input: 30, cacheRead: 300, cacheWrite: 15, output: 60, total: 405 });
    expect(sum.tokensPerAccepted).toBe(405);
    // o indicador principal: o custo das aceitas pelas aceitas; a rodada toda fica em `cost`
    expect(sum.costPerAccepted).toBe(1);
    expect(sum.acceptedCost).toMatchObject({ usd: 1, runs: 1, unpricedRuns: 0, complete: true });
    expect(sum.cost).toMatchObject({ usd: 1, runs: 1, unpricedRuns: 2, complete: false });
  });

  it('custo por tarefa aceita: null sem aceita ou sem custo nas aceitas', () => {
    const notAccepted = scoreStory(story, run('timeout'), log([aiRun({ costUsd: 3 })]), null, config);
    expect(summarize([notAccepted])).toMatchObject({ costPerAccepted: null, cost: { usd: 3 }, acceptedCost: { usd: null } });
    const accepted = scoreStory(story, run(), log([aiRun()]), ok, config);
    expect(summarize([accepted]).costPerAccepted).toBeNull();
    const two = [
      scoreStory(story, run(), log([aiRun({ costUsd: 2 })]), ok, config),
      scoreStory(story, run(), log([aiRun({ costUsd: 4 })]), ok, config),
    ];
    expect(summarize(two).costPerAccepted).toBe(3);
  });

  it('casos de borda: sem histórias, sem aceitas e sem tokens', () => {
    expect(summarize([])).toMatchObject({ stories: 0, acceptanceRate: 0, tokensPerAccepted: null, costUsd: null });
    expect(summarize([])).toHaveProperty('tokens.total', null);
    const none = scoreStory(story, run('blocked'), log([aiRun()]), null, config);
    expect(summarize([none]).tokensPerAccepted).toBeNull();
    const unmeasured = scoreStory(
      story,
      run(),
      log([aiRun({ inputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, outputTokens: null })]),
      ok,
      config,
    );
    const sum = summarize([unmeasured]);
    expect(sum.tokens.total).toBeNull();
    expect(sum.tokensPerAccepted).toBeNull();
  });
});

describe('scoreboardFile e writeScoreboard', () => {
  const date = new Date('2026-10-29T18:30:00.000Z');
  const board = (): Scoreboard => ({
    version: 2,
    date: date.toISOString(),
    fazAi: { version: '1.0.0', commit: 'abc1234', dirty: false },
    config,
    arm: null,
    harness: null,
    summary: summarize([]),
    stories: [],
  });

  it('nome estável', () => {
    expect(scoreboardFile(config, date)).toBe('2026-10-29T183000Z-claude-opus-medium.json');
    expect(scoreboardFile(config, date)).toBe(scoreboardFile(config, date));
  });

  it('nome com o braço', () => {
    expect(scoreboardFile(config, date, 'A')).toBe('2026-10-29T183000Z-claude-opus-medium-A.json');
    expect(scoreboardFile(config, date, 'B')).toBe('2026-10-29T183000Z-claude-opus-medium-B.json');
    expect(scoreboardFile(config, date, null)).toBe(scoreboardFile(config, date));
  });

  it('serialize: arm e harness logo depois de config; sem braço saem null', () => {
    const withArm = { ...board(), arm: 'B' as const, harness: { hash: 'abc123def456', notMeasured: ['x'] } };
    const parsed = JSON.parse(serialize(withArm)) as Record<string, unknown>;
    expect(parsed.version).toBe(2);
    expect(parsed.arm).toBe('B');
    expect(parsed.harness).toEqual({ hash: 'abc123def456', notMeasured: ['x'] });
    expect(JSON.parse(serialize(board()))).toMatchObject({ arm: null, harness: null });
    // placar antigo, sem os campos, também sai com null
    const old = { ...board() } as Partial<Scoreboard>;
    delete old.arm;
    delete old.harness;
    expect(JSON.parse(serialize(old as Scoreboard))).toMatchObject({ arm: null, harness: null });
  });

  it('serialize: placar da versão 1 (sem cost) sai com o custo vazio, nunca inventado', () => {
    const s = scoreStory(story, run(), log([aiRun()]), ok, config);
    const old = { ...board(), version: 1 as const, stories: [s], summary: summarize([s]) } as Scoreboard;
    delete (old.stories[0] as Partial<typeof s>).cost;
    delete (old.summary as Partial<typeof old.summary>).cost;
    delete (old.summary as Partial<typeof old.summary>).acceptedCost;
    delete (old.summary as Partial<typeof old.summary>).costPerAccepted;
    const parsed = JSON.parse(serialize(old)) as { summary: Record<string, unknown>; stories: Array<Record<string, unknown>> };
    const empty = {
      usd: null,
      informedUsd: null,
      estimatedUsd: null,
      buckets: { input: null, cacheRead: null, cacheWrite: null, output: null },
      runs: 0,
      unpricedRuns: 0,
      complete: false,
    };
    expect(parsed.stories[0]!.cost).toEqual(empty);
    expect(parsed.summary.cost).toEqual(empty);
    expect(parsed.summary.costPerAccepted).toBeNull();
  });

  it('writeScoreboard grava o nome com o braço', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-score-'));
    try {
      expect(path.basename(writeScoreboard(dir, { ...board(), arm: 'A' }, date))).toBe('2026-10-29T183000Z-claude-opus-medium-A.json');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('não sobrescreve: acrescenta -2, -3', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-score-'));
    try {
      const names = [1, 2, 3].map(() => path.basename(writeScoreboard(dir, board(), date)));
      expect(names).toEqual([
        '2026-10-29T183000Z-claude-opus-medium.json',
        '2026-10-29T183000Z-claude-opus-medium-2.json',
        '2026-10-29T183000Z-claude-opus-medium-3.json',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serialize: ordem de chaves fixa, 2 espaços e \\n no fim', () => {
    const s = scoreStory(story, run(), log([aiRun()]), ok, config);
    const b = { ...board(), stories: [s], summary: summarize([s]) };
    const text = serialize(b);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.startsWith('{\n  "version": 2,\n  "date"')).toBe(true);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['version', 'date', 'fazAi', 'config', 'arm', 'harness', 'summary', 'stories']);
    // o custo por tarefa aceita vem antes dos tokens: é o indicador principal
    expect(Object.keys(parsed.summary as object)).toEqual([
      'stories',
      'accepted',
      'acceptanceRate',
      'costPerAccepted',
      'acceptedCost',
      'cost',
      'tokens',
      'tokensPerAccepted',
      'costUsd',
      'costRuns',
      'runs',
      'durationMs',
    ]);
    expect(Object.keys((parsed.stories as object[])[0]!)).toEqual([
      'id',
      'accepted',
      'end',
      'endNote',
      'durationMs',
      'runs',
      'tokens',
      'costUsd',
      'costRuns',
      'cost',
      'modelMismatches',
      'signals',
      'acceptance',
      'missingArtifacts',
    ]);
    // chaves embaralhadas na entrada saem na mesma ordem
    const shuffled = { ...b, stories: [Object.fromEntries(Object.entries(s).reverse()) as typeof s] };
    expect(serialize(shuffled as Scoreboard)).toBe(text.replace(/"summary"[\s\S]*?"stories"/, (m) => m));
  });
});
