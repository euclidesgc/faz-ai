import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// o custo em dólar está desligado no board (`SHOW_COST`); estes testes cobrem a exibição dele, para quando voltar
vi.mock('../src/shared/metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/shared/metrics')>()),
  SHOW_COST: true,
  METRICS_MEASURES: ['cost', 'tokens', 'runs', 'duration'],
}));
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics, getPanelMetrics } from '../src/extension/log/metrics';
import { consolidate } from '../src/extension/log/rollup';
import { formatMetrics } from '../src/extension/mcp/tools/metrics';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { DEFAULT_LOG_RETENTION_MONTHS } from '../src/shared/rules';
import type { MetricsBreakdownDim, MetricsPanelSections } from '../src/shared/metrics';

// Medida e custo são critérios separados (#105): a execução medida (`measure <> 'none'`) conta tokens
// mesmo sem custo — o preço por milhão nasce vazio no catálogo, então "tokens medidos, custo não
// medido" é o caso comum. `getMetrics` e os cortes/ranking do painel tratavam `cost_usd` como "medida"
// e mostravam esses tokens como "não medido".

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const TODAY = new Date(2026, 5, 15, 12, 0, 0).getTime();
const at = (year: number, month: number, day = 10) => new Date(year, month - 1, day, 12, 0, 0).getTime();

let db: Database;
let boardId: string;
let runs: AiRunRepo;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  db = await openInMemory(WASM_DIR);
  boardId = new BoardRepo(db).getOrCreate('ws', 'Projeto').id;
  runs = new AiRunRepo(db);
  db.run('UPDATE boards SET log_since = ? WHERE id = ?', [at(2025, 1, 1), boardId]);
});

afterEach(() => vi.useRealTimers());

interface RunOpts {
  model?: string;
  cardNumber?: number;
  /** omitido = execução não medida (`measure: 'none'`) */
  tokens?: number;
  /** omitido com `tokens` = medida sem custo (preço vazio no catálogo) */
  costUsd?: number;
}

/** Uma execução fechada; o consumo entra pelo caminho real (`AiRunRepo.measure`). */
function run(startedAt: number, durationMs: number, opts: RunOpts = {}): string {
  vi.setSystemTime(startedAt);
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool: 'claude',
    cardId: opts.cardNumber ? `c${opts.cardNumber}` : null,
    cardNumber: opts.cardNumber ?? null,
    cardTitle: opts.cardNumber ? 'Card' : '',
    cardType: 'História',
    workflow: 'Histórias',
    columnName: 'Implementação',
    phase: 'Implementação',
  });
  runs.describe(id, {
    model: opts.model ?? 'opus',
    effort: 'high',
    profile: 'Agente padrão',
    agent: null,
    permission: 'default',
    autonomous: false,
    clean: false,
    skills: [],
    mcp: null,
  });
  vi.setSystemTime(startedAt + durationMs);
  runs.finish(id, 'done', 0);
  if (opts.tokens !== undefined)
    runs.measure(id, {
      measure: 'full',
      consumption: {
        inputTokens: opts.tokens,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 1,
        sessionId: null,
        costUsd: opts.costUsd ?? null,
        costEstimated: true,
      },
      inventory: [],
      answer: '',
      reason: null,
      usageLimitReached: false,
    });
  vi.setSystemTime(TODAY);
  return id;
}

const RANGE = { startDate: '2025-01-01', endDate: '2026-06-30' };

function sections(): MetricsPanelSections {
  const s = getPanelMetrics(db, boardId, RANGE, TODAY).sections;
  if (!s) throw new Error('sem seções');
  return s;
}

const cut = (dim: MetricsBreakdownDim) => sections().breakdowns.find((b) => b.dim === dim)!;

describe('tokens medidos, custo não medido', () => {
  it('getMetrics: tokens com número, custo null, custo parcial e tokens completos', () => {
    run(at(2026, 6, 2), 1000, { tokens: 100 });
    run(at(2026, 6, 3), 2000, { tokens: 50 });
    const result = getMetrics(db, boardId, RANGE);
    expect(result.rows).toEqual([{ label: 'total', runs: 2, durationMs: 3000, tokens: 150, costUsd: null }]);
    expect(result.costPartial).toBe(true);
    expect(result.tokensPartial).toBe(false);
  });

  it('getMetrics: custo parcial soma só o que tem custo; tokens somam todas as medidas', () => {
    run(at(2026, 6, 2), 1000, { tokens: 100, costUsd: 0.5 });
    run(at(2026, 6, 3), 1000, { tokens: 40 });
    run(at(2026, 6, 4), 1000);
    const result = getMetrics(db, boardId, { ...RANGE, groupBy: 'model' });
    expect(result.rows).toEqual([{ label: 'opus', runs: 3, durationMs: 3000, tokens: 140, costUsd: 0.5 }]);
    expect(result.costPartial).toBe(true);
    expect(result.tokensPartial).toBe(true);
  });

  it('execução não medida não soma tokens, mesmo com a coluna preenchida', () => {
    run(at(2026, 6, 2), 1000, { tokens: 100 });
    const stray = run(at(2026, 6, 3), 1000);
    db.run('UPDATE ai_runs SET input_tokens = 999 WHERE id = ?', [stray]);
    expect(getMetrics(db, boardId, RANGE).rows[0]).toMatchObject({ runs: 2, tokens: 100, costUsd: null });
  });

  it('painel: corte e ranking por card mostram os tokens e o custo como não medido', () => {
    run(at(2026, 6, 2), 1000, { cardNumber: 7, tokens: 100 });
    run(at(2026, 6, 3), 1000, { cardNumber: 7 });
    const model = cut('model');
    expect(model.cells).toEqual([
      { value: 'opus', runs: 2, measuredRuns: 1, costedRuns: 0, durationMs: 2000, tokens: 100, costUsd: null, costEstimatedUsd: null },
    ]);
    expect(model.covered).toMatchObject({ measuredRuns: 1, tokens: 100, costUsd: null });
    expect(sections().cards.cells[0]).toMatchObject({ value: '#7 Card', measuredRuns: 1, tokens: 100, costUsd: null });
  });

  it('o mesmo número antes e depois de consolidar, em getMetrics e no corte do painel', () => {
    // março de 2025 sai da janela; junho de 2026 continua em detalhe
    run(at(2025, 3, 2), 1000, { model: 'opus', tokens: 100 });
    run(at(2025, 3, 3), 1000, { model: 'opus', tokens: 20, costUsd: 0.25 });
    run(at(2025, 3, 4), 1000, { model: 'sonnet', tokens: 7 });
    run(at(2025, 3, 5), 1000, { model: 'haiku' });
    run(at(2026, 6, 2), 1000, { model: 'sonnet', tokens: 3 });
    const snapshot = () => {
      const mcp = getMetrics(db, boardId, { ...RANGE, groupBy: 'model' });
      const panel = cut('model');
      return {
        mcp: mcp.rows,
        costPartial: mcp.costPartial,
        tokensPartial: mcp.tokensPartial,
        panel: panel.cells.map(({ value, runs: n, measuredRuns, tokens, costUsd }) => ({ value, runs: n, measuredRuns, tokens, costUsd })),
      };
    };
    const before = snapshot();
    expect(consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS)).toEqual(['2025-03']);
    const after = snapshot();
    expect(after).toEqual(before);
    expect(after.mcp.find((r) => r.label === 'sonnet')).toMatchObject({ runs: 2, tokens: 10, costUsd: null });
    expect(after.mcp.find((r) => r.label === 'opus')).toMatchObject({ runs: 2, tokens: 120, costUsd: 0.25 });
    expect(after.mcp.find((r) => r.label === 'haiku')).toMatchObject({ runs: 1, tokens: null, costUsd: null });
    expect(after.panel.find((c) => c.value === 'sonnet')).toEqual({ value: 'sonnet', runs: 2, measuredRuns: 2, tokens: 10, costUsd: null });
  });

  it('mês arquivado sem custo: a parte estimada do corte também fica não medida', () => {
    run(at(2025, 3, 2), 1000, { tokens: 100 });
    consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);
    expect(cut('model').cells[0]).toMatchObject({ measuredRuns: 1, tokens: 100, costUsd: null, costEstimatedUsd: null });
  });
});

describe('formatMetrics: tokens medidos, custo não medido', () => {
  it('tokens com número, custo "-" e a nota de custo não medido', () => {
    run(at(2026, 6, 2), 1000, { tokens: 1234 });
    const text = formatMetrics(getMetrics(db, boardId, RANGE), undefined);
    const line = text.split('\n').find((l) => l.startsWith('total'))!;
    expect(line).toMatch(/\b1234\b/);
    expect(line.trimEnd()).toMatch(/-$/);
    expect(text).toContain('custo não medido');
    expect(text).not.toContain('tokens parciais');
  });

  it('custo parcial e tokens parciais aparecem como notas separadas', () => {
    run(at(2026, 6, 2), 1000, { tokens: 10, costUsd: 0.1 });
    run(at(2026, 6, 3), 1000, { tokens: 10 });
    run(at(2026, 6, 4), 1000);
    const text = formatMetrics(getMetrics(db, boardId, RANGE), undefined);
    expect(text).toContain('custo parcial');
    expect(text).toContain('tokens parciais');
  });
});
