import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics, getPanelMetrics } from '../src/extension/log/metrics';
import { consolidate } from '../src/extension/log/rollup';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { DEFAULT_LOG_RETENTION_MONTHS } from '../src/shared/rules';
import { METRICS_BREAKDOWN_DIMS, METRICS_ROW_CAP } from '../src/shared/metrics';
import type { MetricsBreakdown, MetricsBreakdownDim, MetricsPanelQuery, MetricsPanelSections } from '../src/shared/metrics';

// #171: os seis cortes e o ranking por card em `getPanelMetrics`. Montagem de test/panelMetrics.test.ts,
// com a configuração da execução (modelo, esforço, perfil) entrando por `AiRunRepo.describe`.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
/** data fixa de referência: 15 de junho de 2026, meio-dia, no fuso da máquina */
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
  // a série começa em janeiro de 2025: março de 2025 já está fora da janela de seis meses
  db.run('UPDATE boards SET log_since = ? WHERE id = ?', [at(2025, 1, 1), boardId]);
});

afterEach(() => vi.useRealTimers());

interface RunOpts {
  workflow?: string;
  phase?: string;
  cardType?: string;
  tool?: string;
  cardNumber?: number | null;
  cardTitle?: string;
  /** presentes = `describe()`; `null` = não definido, `''` = definido e vazio */
  model?: string | null;
  effort?: string | null;
  profile?: string | null;
  /** sem consumo, a execução não é medida; `costUsd` omitido = medida sem custo */
  tokens?: number;
  costUsd?: number;
  /** padrão true (preço do catálogo); false = informado pela ferramenta */
  estimated?: boolean;
}

function run(startedAt: number, durationMs: number, opts: RunOpts = {}): string {
  vi.setSystemTime(startedAt);
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool: opts.tool ?? 'claude',
    cardId: opts.cardNumber == null ? null : `c${opts.cardNumber}`,
    cardNumber: opts.cardNumber ?? null,
    cardTitle: opts.cardTitle ?? '',
    cardType: opts.cardType ?? 'História',
    workflow: opts.workflow ?? 'Histórias',
    columnName: opts.phase ?? 'Implementação',
    phase: opts.phase ?? 'Implementação',
  });
  if ('model' in opts || 'effort' in opts || 'profile' in opts)
    runs.describe(id, {
      model: opts.model ?? null,
      effort: opts.effort ?? null,
      profile: opts.profile ?? null,
      agent: null,
      permission: 'default',
      autonomous: false,
      clean: false,
      skills: [],
      mcp: null,
    });
  vi.setSystemTime(startedAt + durationMs);
  runs.finish(id, 'done', 0);
  if (opts.tokens !== undefined || opts.costUsd !== undefined)
    runs.measure(id, {
      measure: 'full',
      consumption: {
        inputTokens: opts.tokens ?? 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        turns: 1,
        sessionId: null,
        costUsd: opts.costUsd ?? null,
        costEstimated: opts.estimated ?? true,
      },
      inventory: [],
      answer: '',
      reason: null,
    });
  vi.setSystemTime(TODAY);
  return id;
}

const consolidateNow = () => consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);

function sections(query: MetricsPanelQuery = { startDate: '2025-01-01', endDate: '2026-06-30' }): MetricsPanelSections {
  const s = getPanelMetrics(db, boardId, query, TODAY).sections;
  if (!s) throw new Error('sem seções');
  return s;
}

const cut = (s: MetricsPanelSections, dim: MetricsBreakdownDim): MetricsBreakdown => {
  const found = s.breakdowns.find((b) => b.dim === dim);
  if (!found) throw new Error(`sem corte ${dim}`);
  return found;
};
const cell = (b: MetricsBreakdown, value: string) => b.cells.find((c) => c.value === value);

/** Um mês variado nas seis dimensões: medidas com custo, medidas sem custo e não medidas. */
function seedMonth(year: number, month: number): void {
  run(at(year, month, 2), 1000, { model: 'opus', effort: 'high', profile: 'Agente padrão', tokens: 100, costUsd: 0.5 });
  run(at(year, month, 3), 2000, { model: 'opus', effort: 'low', profile: 'Revisor', tokens: 40 });
  run(at(year, month, 4), 4000, { model: 'sonnet', effort: 'high', phase: 'Revisão', cardType: 'Sub-tarefa', tokens: 10, costUsd: 0.25 });
  run(at(year, month, 5), 8000, { model: null, tool: 'codex', phase: 'Revisão' });
  run(at(year, month, 6), 16000, { cardType: 'Sub-tarefa' });
}

describe('getPanelMetrics: os seis cortes', () => {
  it('RF-03: cada um dos seis cortes soma o total do período', () => {
    seedMonth(2026, 6);
    const result = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' }, TODAY);
    const s = result.sections!;
    expect(s.breakdowns.map((b) => b.dim)).toEqual(METRICS_BREAKDOWN_DIMS);
    for (const b of s.breakdowns) {
      const sum = (pick: (c: (typeof b.cells)[number]) => number) => b.cells.reduce((acc, c) => acc + pick(c), 0);
      expect(b.covered.runs).toBe(result.totals.runs);
      expect(b.covered.durationMs).toBe(result.totals.durationMs);
      expect(sum((c) => c.runs)).toBe(b.covered.runs);
      expect(sum((c) => c.durationMs)).toBe(b.covered.durationMs);
      expect(sum((c) => c.measuredRuns)).toBe(b.covered.measuredRuns);
      expect(sum((c) => c.costUsd ?? 0)).toBeCloseTo(b.covered.costUsd ?? 0);
      expect(b.covered.costUsd).toBeCloseTo(0.75);
    }
  });

  it('RF-04: NULL e "" caem na mesma categoria "não definido"', () => {
    run(at(2026, 6), 1000, { model: null, effort: null, profile: null });
    run(at(2026, 6), 2000, { model: '', effort: '', profile: '' });
    run(at(2026, 6), 4000); // sem describe(): as três colunas ficam NULL
    run(at(2026, 6), 500, { model: 'opus', effort: 'high', profile: 'Revisor' });
    const s = sections();
    for (const dim of ['model', 'effort', 'profile'] as const) {
      const b = cut(s, dim);
      expect(b.cells.filter((c) => c.value === '')).toHaveLength(1);
      expect(cell(b, '')).toMatchObject({ runs: 3, durationMs: 7000 });
      expect(b.covered.runs).toBe(4);
    }
  });

  it('RF-23: o corte por fase é o ranking de fases — os mesmos números de get_metrics por fase', () => {
    seedMonth(2026, 6);
    const phase = cut(sections(), 'phase');
    const mcp = getMetrics(db, boardId, { groupBy: 'phase', startDate: '2025-01-01', endDate: '2026-06-30' });
    expect(
      phase.cells.map((c) => ({ label: c.value, runs: c.runs, durationMs: c.durationMs, tokens: c.tokens, costUsd: c.costUsd })),
    ).toEqual(mcp.rows.map(({ label, runs: n, durationMs, tokens, costUsd }) => ({ label, runs: n, durationMs, tokens, costUsd })));
  });

  it('RF-06: coluna renomeada aparece como duas categorias, sem fundir nem mudar o total', () => {
    run(at(2026, 6, 2), 1000, { phase: 'Revisão' });
    run(at(2026, 6, 3), 2000, { phase: 'Review' });
    const phase = cut(sections(), 'phase');
    expect(phase.cells.map((c) => c.value).sort()).toEqual(['Review', 'Revisão']);
    expect(phase.covered.runs).toBe(2);
    expect(phase.ambiguous).toEqual([]);
  });

  it('RF-07: nome igual em workflows diferentes é somado e listado em ambiguous; escolher o workflow separa', () => {
    run(at(2026, 6, 2), 1000, { workflow: 'Histórias', phase: 'Implementação' });
    run(at(2026, 6, 3), 2000, { workflow: 'Sub-tarefas', phase: 'Implementação' });
    run(at(2026, 6, 4), 4000, { workflow: 'Sub-tarefas', phase: 'Em andamento' });
    const all = cut(sections(), 'phase');
    expect(cell(all, 'Implementação')).toMatchObject({ runs: 2, durationMs: 3000 });
    expect(all.ambiguous).toEqual(['Implementação']);
    // só o corte por fase carrega o aviso
    expect(cut(sections(), 'model').ambiguous).toEqual([]);

    const one = cut(sections({ startDate: '2025-01-01', endDate: '2026-06-30', workflow: 'Sub-tarefas' }), 'phase');
    expect(cell(one, 'Implementação')).toMatchObject({ runs: 1, durationMs: 2000 });
    expect(one.ambiguous).toEqual([]);
  });

  it('RF-08: as seis dimensões continuam com os mesmos números depois de consolidar', () => {
    seedMonth(2025, 3);
    seedMonth(2026, 6);
    const before = sections();
    expect(consolidateNow()).toEqual(['2025-03']);
    const after = sections();
    for (const dim of METRICS_BREAKDOWN_DIMS) {
      expect(cut(after, dim).cells).toEqual(cut(before, dim).cells);
      expect(cut(after, dim).covered).toEqual(cut(before, dim).covered);
      expect(cut(after, dim).includesArchive).toBe(true);
      expect(cut(after, dim).excludedMonths).toEqual([]);
    }
    expect(cut(before, 'model').includesArchive).toBe(false);
  });

  it('RF-10: com um workflow escolhido, os meses arquivados saem do corte e são listados', () => {
    run(at(2025, 3), 1000, { workflow: 'Histórias', model: 'opus' });
    run(at(2026, 6), 2000, { workflow: 'Histórias', model: 'opus' });
    consolidateNow();
    const chosen = cut(sections({ startDate: '2025-01-01', endDate: '2026-06-30', workflow: 'Histórias' }), 'model');
    expect(chosen.excludedMonths).toEqual(['2025-03']);
    expect(chosen.includesArchive).toBe(false);
    expect(cell(chosen, 'opus')).toMatchObject({ runs: 1, durationMs: 2000 });

    const everyone = cut(sections(), 'model');
    expect(everyone.excludedMonths).toEqual([]);
    expect(everyone.includesArchive).toBe(true);
    expect(cell(everyone, 'opus')).toMatchObject({ runs: 2, durationMs: 3000 });
  });

  it('RF-09/RF-30: grupo sem medição tem tokens e custo null, nunca 0 — também depois de consolidar', () => {
    run(at(2025, 3), 1000, { model: 'haiku' });
    run(at(2026, 6), 2000, { model: 'haiku' });
    run(at(2026, 6), 4000, { model: 'opus', tokens: 10, costUsd: 0.5 });
    const check = () => {
      const haiku = cell(cut(sections(), 'model'), 'haiku');
      expect(haiku).toMatchObject({ runs: 2, measuredRuns: 0, tokens: null, costUsd: null, costEstimatedUsd: null });
    };
    check();
    consolidateNow();
    check();
  });

  it('RF-31: a parte estimada do custo chega a cada linha', () => {
    run(at(2026, 6), 1000, { model: 'opus', tokens: 10, costUsd: 0.5 });
    run(at(2026, 6), 1000, { model: 'opus', tokens: 10, costUsd: 0.25, estimated: false });
    run(at(2026, 6), 1000, { model: 'sonnet', tokens: 10, costUsd: 0.125, estimated: false });
    const model = cut(sections(), 'model');
    expect(cell(model, 'opus')).toMatchObject({ costUsd: 0.75, costEstimatedUsd: 0.5 });
    expect(cell(model, 'sonnet')).toMatchObject({ costUsd: 0.125, costEstimatedUsd: null });
  });

  it('período sem dado nenhum: seções vazias, sem zeros inventados', () => {
    const s = sections({ startDate: '2024-01-01', endDate: '2024-12-31' });
    for (const b of s.breakdowns) expect(b.cells).toEqual([]);
    expect(s.cards.cells).toEqual([]);
    expect(s.cards.omitted).toBe(0);
  });
});

describe('getPanelMetrics: a divergência com get_metrics', () => {
  it('getMetrics({groupBy:"model"}) e o corte por modelo devolvem os mesmos números, antes e depois de consolidar', () => {
    seedMonth(2025, 3);
    seedMonth(2026, 6);
    const range = { startDate: '2025-01-01', endDate: '2026-06-30' };
    const compare = () => {
      const panel = cut(sections(range), 'model').cells.map((c) => ({
        label: c.value,
        runs: c.runs,
        durationMs: c.durationMs,
        tokens: c.tokens,
        costUsd: c.costUsd,
      }));
      const mcp = getMetrics(db, boardId, { groupBy: 'model', ...range }).rows.map(({ label, runs: n, durationMs, tokens, costUsd }) => ({
        label,
        runs: n,
        durationMs,
        tokens,
        costUsd,
      }));
      expect(panel).toEqual(mcp);
      return panel;
    };
    const before = compare();
    expect(consolidateNow()).toEqual(['2025-03']);
    const after = compare();
    expect(after).toEqual(before);
    // o mês arquivado entrou de fato: opus tem as execuções dos dois meses
    expect(after.find((r) => r.label === 'opus')).toMatchObject({ runs: 4, tokens: 280, costUsd: 1 });
  });
});

describe('getPanelMetrics: ranking por card', () => {
  it('um grupo por número com o título mais recente; "sem card" viaja como value ""', () => {
    run(at(2026, 6, 2), 1000, { cardNumber: 7, cardTitle: 'Título antigo' });
    run(at(2026, 6, 3), 2000, { cardNumber: 7, cardTitle: 'Título novo', tokens: 5, costUsd: 0.5 });
    run(at(2026, 6, 4), 4000, { cardNumber: null });
    const { cards } = sections();
    expect(cards.cells).toEqual([
      { value: '#7 Título novo', runs: 2, measuredRuns: 1, durationMs: 3000, tokens: 5, costUsd: 0.5, costEstimatedUsd: 0.5 },
      { value: '', runs: 1, measuredRuns: 0, durationMs: 4000, tokens: null, costUsd: null, costEstimatedUsd: null },
    ]);
    expect(cards.covered).toMatchObject({ runs: 3, durationMs: 7000, measuredRuns: 1 });
    expect(cards.omitted).toBe(0);
  });

  it('RF-33: acima do teto, as linhas de mais execuções vêm, o resto fica em covered e omitted', () => {
    const total = METRICS_ROW_CAP + 5;
    // o card 1 tem duas execuções: precisa estar entre as linhas enviadas
    run(at(2026, 6, 1), 1000, { cardNumber: 1, cardTitle: 'Card 1' });
    for (let n = 1; n <= total; n++) run(at(2026, 6, 2), 1000, { cardNumber: n, cardTitle: `Card ${n}` });
    const { cards } = sections();
    expect(cards.cells).toHaveLength(METRICS_ROW_CAP);
    expect(cards.cells[0]).toMatchObject({ value: '#1 Card 1', runs: 2 });
    expect(cards.omitted).toBe(5);
    expect(cards.covered.runs).toBe(total + 1);
    expect(cards.covered.durationMs).toBe((total + 1) * 1000);
  });
});
