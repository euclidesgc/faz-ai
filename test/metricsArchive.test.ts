import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics, type MetricsDim } from '../src/extension/log/metrics';
import { consolidate } from '../src/extension/log/rollup';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { DEFAULT_LOG_RETENTION_MONTHS } from '../src/shared/rules';

// #166: `effort`/`profile` em `getMetrics` e a leitura de tokens e custo dos meses arquivados — o número
// tem de ser o mesmo antes e depois de consolidar (RF-08), "não medido" continua null (RF-09, RF-30) e
// o arquivo não serve a um corte com workflow escolhido (RF-10).

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
});

afterEach(() => vi.useRealTimers());

interface RunOpts {
  workflow?: string;
  phase?: string;
  cardType?: string;
  model?: string;
  tool?: string;
  effort?: string;
  profile?: string;
  /** tokens de entrada; com `costUsd` omitido, a execução é medida mas sem custo */
  tokens?: number;
  /** custo (múltiplos de potência de 2, para a soma em ponto flutuante ser exata nos dois caminhos) */
  costUsd?: number;
}

/**
 * Uma execução fechada, com duração exata. Com `tokens`, o consumo entra pelo caminho real
 * (`AiRunRepo.measure`, `measure: 'full'`) — é o `measure` que a consolidação olha para arquivar tokens.
 */
function run(startedAt: number, durationMs: number, opts: RunOpts = {}): string {
  vi.setSystemTime(startedAt);
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool: opts.tool ?? 'claude',
    cardId: null,
    cardNumber: null,
    cardTitle: '',
    cardType: opts.cardType ?? 'História',
    workflow: opts.workflow ?? 'Histórias',
    columnName: opts.phase ?? 'Implementação',
    phase: opts.phase ?? 'Implementação',
  });
  runs.describe(id, {
    model: opts.model ?? 'opus',
    effort: opts.effort ?? 'high',
    profile: opts.profile ?? 'Agente padrão',
    agent: '',
    permission: 'full',
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
    });
  vi.setSystemTime(TODAY);
  return id;
}

const row = (result: ReturnType<typeof getMetrics>, label: string) => result.rows.find((r) => r.label === label);
const consolidateNow = () => consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);

describe('getMetrics: effort e profile', () => {
  it('group_by=effort agrupa pelo esforço do modelo, com tokens e custo', () => {
    run(at(2026, 6), 1000, { effort: 'high', tokens: 100, costUsd: 0.25 });
    run(at(2026, 6), 2000, { effort: 'high' });
    run(at(2026, 6), 500, { effort: 'low', tokens: 40, costUsd: 0.5 });
    const result = getMetrics(db, boardId, { groupBy: 'effort' });
    expect(row(result, 'high')).toMatchObject({ runs: 2, durationMs: 3000, tokens: 100, costUsd: 0.25 });
    expect(row(result, 'low')).toMatchObject({ runs: 1, durationMs: 500, tokens: 40, costUsd: 0.5 });
  });

  it('group_by=profile agrupa pelo perfil de execução', () => {
    run(at(2026, 6), 1000, { profile: 'Agente padrão' });
    run(at(2026, 6), 3000, { profile: 'Revisor' });
    run(at(2026, 6), 1000, { profile: 'Revisor' });
    const result = getMetrics(db, boardId, { groupBy: 'profile' });
    expect(row(result, 'Agente padrão')).toMatchObject({ runs: 1, durationMs: 1000 });
    expect(row(result, 'Revisor')).toMatchObject({ runs: 2, durationMs: 4000 });
  });
});

describe('getMetrics: mês arquivado com tokens e custo', () => {
  /** um mês variado nas seis dimensões, com execuções medidas com custo, medidas sem custo e não medidas */
  function seedMixedMonth(year: number, month: number): void {
    run(at(year, month, 3), 1000, {
      phase: 'Discovery',
      cardType: 'História',
      model: 'opus',
      tool: 'claude',
      effort: 'high',
      profile: 'Agente padrão',
      tokens: 100,
      costUsd: 0.25,
    });
    run(at(year, month, 4), 2000, {
      phase: 'Discovery',
      cardType: 'Bug',
      model: 'sonnet',
      tool: 'codex',
      effort: 'low',
      profile: 'Revisor',
      tokens: 300,
      costUsd: 0.5,
    });
    run(at(year, month, 5), 4000, { phase: 'Spec', cardType: 'Bug', model: 'opus', tool: 'claude', effort: 'medium', profile: 'Revisor' });
    run(at(year, month, 6), 8000, {
      phase: 'Spec',
      cardType: 'História',
      model: 'haiku',
      tool: 'claude',
      effort: 'high',
      profile: 'Agente padrão',
      tokens: 50,
    });
    run(at(year, month, 7), 500, {
      phase: 'Implementação',
      cardType: 'Sub-tarefa',
      model: 'opus',
      tool: 'codex',
      effort: 'low',
      profile: 'Agente padrão',
      tokens: 20,
      costUsd: 0.125,
    });
  }

  const DIMS: (MetricsDim | undefined)[] = [undefined, 'phase', 'card_type', 'model', 'tool', 'effort', 'profile'];

  it('regressão das seis dimensões (RF-08): execuções, duração, tokens e custo iguais antes e depois de consolidar', () => {
    seedMixedMonth(2024, 3);
    // um mês ainda em detalhe junto, para o arquivo somar com ele e não substituí-lo
    run(at(2026, 6), 700, { phase: 'Spec', model: 'opus', effort: 'high', tokens: 10, costUsd: 0.0625 });

    const before = DIMS.map((dim) => getMetrics(db, boardId, { groupBy: dim, limit: 100 }));
    expect(before[0]!.archivedMonths).toEqual([]);
    expect(consolidateNow()).toEqual(['2024-03']);
    const after = DIMS.map((dim) => getMetrics(db, boardId, { groupBy: dim, limit: 100 }));

    DIMS.forEach((dim, i) => {
      expect(after[i]!.archivedMonths, `group_by=${dim ?? '(total)'}`).toEqual(['2024-03']);
      expect(after[i]!.rows, `group_by=${dim ?? '(total)'}`).toEqual(before[i]!.rows);
      expect(after[i]!.costPartial, `group_by=${dim ?? '(total)'}`).toBe(before[i]!.costPartial);
    });
    // uma conferência com números à mão, para o teste não passar com os dois lados igualmente errados
    expect(row(after[0]!, 'total')).toEqual({ label: 'total', runs: 6, durationMs: 16200, tokens: 480, costUsd: 0.9375 });
    expect(row(after[5]!, 'low')).toEqual({ label: 'low', runs: 2, durationMs: 2500, tokens: 320, costUsd: 0.625 });
  });

  it('mês arquivado sem nenhuma medição devolve tokens e custo null, nunca zero (RF-09, RF-30)', () => {
    run(at(2024, 3), 1000, { effort: 'high' });
    run(at(2024, 3), 2000, { effort: 'high' });
    consolidateNow();
    for (const dim of DIMS) {
      const result = getMetrics(db, boardId, { groupBy: dim });
      const only = result.rows[0]!;
      expect(only, `group_by=${dim ?? '(total)'}`).toMatchObject({ runs: 2, durationMs: 3000, tokens: null, costUsd: null });
      expect(result.costPartial).toBe(true);
    }
  });

  it('mês consolidado antes de #71 (só `runs` no arquivo) também sai como não medido', () => {
    db.run("INSERT INTO log_months(board_id, month, metric, dim, value, n, total) VALUES (?, '2024-03', 'runs', '', '', 3, 9000)", [
      boardId,
    ]);
    const result = getMetrics(db, boardId, {});
    expect(row(result, 'total')).toMatchObject({ runs: 3, durationMs: 9000, tokens: null, costUsd: null });
    expect(result.costPartial).toBe(true);
  });

  it('mês arquivado com parte medida devolve a parte medida e marca costPartial', () => {
    run(at(2024, 3), 1000, { profile: 'Revisor', tokens: 100, costUsd: 0.25 });
    run(at(2024, 3), 2000, { profile: 'Revisor' });
    consolidateNow();
    const result = getMetrics(db, boardId, { groupBy: 'profile' });
    expect(row(result, 'Revisor')).toMatchObject({ runs: 2, durationMs: 3000, tokens: 100, costUsd: 0.25 });
    expect(result.costPartial).toBe(true);
  });

  it('mês arquivado todo medido não marca costPartial — o arquivo já não é "sempre parcial"', () => {
    run(at(2024, 3), 1000, { tokens: 100, costUsd: 0.25 });
    run(at(2024, 3), 2000, { tokens: 200, costUsd: 0.5 });
    consolidateNow();
    const result = getMetrics(db, boardId, { groupBy: 'model' });
    expect(row(result, 'opus')).toMatchObject({ runs: 2, tokens: 300, costUsd: 0.75 });
    expect(result.costPartial).toBe(false);
  });
});

describe('getMetrics: workflow escolhido e o arquivo (RF-10)', () => {
  it('com um workflow escolhido, o mês arquivado não é somado no corte, e aparece em archivedMonths', () => {
    run(at(2024, 3), 1000, { workflow: 'Histórias', model: 'opus', tokens: 100, costUsd: 0.25 });
    run(at(2024, 3), 2000, { workflow: 'Sub-tarefas', model: 'opus', tokens: 200, costUsd: 0.5 });
    run(at(2026, 6), 500, { workflow: 'Histórias', model: 'opus', tokens: 10, costUsd: 0.125 });
    consolidateNow();

    const filtered = getMetrics(db, boardId, { groupBy: 'model', workflow: 'Histórias' });
    // só o detalhe de junho: somar o arquivo daria 3 execuções, das duas trilhas
    expect(row(filtered, 'opus')).toMatchObject({ runs: 1, durationMs: 500, tokens: 10, costUsd: 0.125 });
    expect(filtered.archivedMonths).toEqual(['2024-03']);

    const total = getMetrics(db, boardId, { workflow: 'Histórias' });
    expect(row(total, 'total')).toMatchObject({ runs: 1, durationMs: 500 });
    expect(total.archivedMonths).toEqual(['2024-03']);
  });

  it('sem workflow escolhido, o mesmo arquivo entra no corte', () => {
    run(at(2024, 3), 1000, { workflow: 'Histórias', model: 'opus', tokens: 100, costUsd: 0.25 });
    run(at(2024, 3), 2000, { workflow: 'Sub-tarefas', model: 'opus', tokens: 200, costUsd: 0.5 });
    consolidateNow();
    const result = getMetrics(db, boardId, { groupBy: 'model' });
    expect(row(result, 'opus')).toMatchObject({ runs: 2, durationMs: 3000, tokens: 300, costUsd: 0.75 });
  });
});
