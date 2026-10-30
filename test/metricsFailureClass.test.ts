import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics, getPanelMetrics, type MetricsResult } from '../src/extension/log/metrics';
import { consolidate } from '../src/extension/log/rollup';
import { formatMetrics } from '../src/extension/mcp/tools/metrics';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { FailureClass } from '../src/shared/failureClass';
import type { MetricsBreakdown } from '../src/shared/metrics';
import type { AiRunOutcome } from '../src/shared/log';
import { DEFAULT_LOG_RETENTION_MONTHS } from '../src/shared/rules';

// #1099: a dimensão `failure_class` no `getMetrics` (detalhe e mês arquivado) e o rótulo "sem classe" no
// `get_metrics`. A execução que terminou bem, sem desfecho ou anterior à migração 55 tem a classe vazia.

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

/** Uma execução fechada com a classe da falha dada (`null` = terminou bem ou sem classe). */
function run(startedAt: number, durationMs: number, failureClass: FailureClass | null, outcome: AiRunOutcome = 'failed'): void {
  vi.setSystemTime(startedAt);
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool: 'claude',
    cardId: null,
    cardNumber: null,
    cardTitle: '',
    cardType: 'História',
    workflow: 'Histórias',
    columnName: 'Implementação',
    phase: 'Implementação',
  });
  runs.describe(id, {
    model: 'opus',
    effort: 'high',
    profile: 'Agente padrão',
    agent: '',
    permission: 'full',
    autonomous: false,
    clean: false,
    skills: [],
    mcp: null,
  });
  vi.setSystemTime(startedAt + durationMs);
  runs.finish(id, outcome, null, failureClass);
  vi.setSystemTime(TODAY);
}

const row = (result: MetricsResult, label: string) => result.rows.find((r) => r.label === label);
const consolidateNow = () => consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);

describe('getMetrics: failure_class', () => {
  it('agrupa pela classe da falha; a execução sem classe fica com o valor vazio, contada e não perdida', () => {
    run(at(2026, 6), 1000, 'transient');
    run(at(2026, 6), 2000, 'transient');
    run(at(2026, 6), 500, 'deterministic');
    run(at(2026, 6), 300, null, 'done');

    const result = getMetrics(db, boardId, { groupBy: 'failure_class' });

    expect(row(result, 'transient')).toMatchObject({ runs: 2, durationMs: 3000 });
    expect(row(result, 'deterministic')).toMatchObject({ runs: 1, durationMs: 500 });
    expect(row(result, '')).toMatchObject({ runs: 1, durationMs: 300 });
  });

  it('a classe segue no detalhe depois de o mês ser consolidado (mês arquivado)', () => {
    run(at(2025, 1), 1000, 'transient');
    run(at(2025, 1), 2000, 'transient');
    run(at(2025, 1), 500, 'deterministic');
    run(at(2026, 6), 700, 'transient');
    consolidateNow();

    const result = getMetrics(db, boardId, { groupBy: 'failure_class' });

    expect(result.archivedMonths).toEqual(['2025-01']);
    expect(row(result, 'transient')).toMatchObject({ runs: 3, durationMs: 3700 });
    expect(row(result, 'deterministic')).toMatchObject({ runs: 1, durationMs: 500 });
  });
});

describe('painel de Métricas: corte por failure_class', () => {
  it('traz a dimensão no painel, com a classe vazia contada, e ela segue igual depois de consolidar', () => {
    db.run('UPDATE boards SET log_since = ? WHERE id = ?', [at(2025, 1, 1), boardId]);
    run(at(2025, 1), 1000, 'transient');
    run(at(2026, 6), 2000, 'transient');
    run(at(2026, 6), 500, 'deterministic');
    run(at(2026, 6), 300, null, 'done');
    const value = (b: MetricsBreakdown) => Object.fromEntries(b.cells.map((c) => [c.value, c.runs]));
    const before = getPanelMetrics(db, boardId, { startDate: '2025-01-01', endDate: '2026-06-30' }, TODAY).sections.breakdowns.find(
      (b) => b.dim === 'failure_class',
    )!;
    expect(value(before)).toMatchObject({ transient: 2, deterministic: 1, '': 1 });
    consolidateNow();
    const after = getPanelMetrics(db, boardId, { startDate: '2025-01-01', endDate: '2026-06-30' }, TODAY).sections.breakdowns.find(
      (b) => b.dim === 'failure_class',
    )!;
    expect(value(after)).toEqual(value(before));
  });
});

describe('formatMetrics: failure_class', () => {
  it('mostra "sem classe" no lugar do valor vazio, sem mexer nas outras dimensões', () => {
    const result: MetricsResult = {
      rows: [
        { label: 'transient', runs: 2, durationMs: 3000, tokens: null, costUsd: null },
        { label: '', runs: 1, durationMs: 300, tokens: null, costUsd: null },
      ],
      othersCount: 0,
      logSince: '2026-06-01',
      archivedMonths: [],
      partialMonths: [],
      costPartial: false,
      tokensPartial: false,
    };

    const text = formatMetrics(result, 'failure_class', false);
    const lines = text.split('\n');

    expect(lines.find((l) => l.startsWith('sem classe'))).toBeDefined();
    expect(lines.find((l) => l.startsWith('transient'))).toBeDefined();
  });
});
