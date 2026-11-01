import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics, type MetricsResult } from '../src/extension/log/metrics';
import { consolidate } from '../src/extension/log/rollup';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { AiRunOrigin, AiRunOutcome } from '../src/shared/log';
import { DEFAULT_LOG_RETENTION_MONTHS } from '../src/shared/rules';

// A dimensão `origin` do `get_metrics`: separa o chat do board e o teste de conexão (sem card nem agente) das
// execuções de card, no detalhe e no mês arquivado. Antes as três populações só se distinguiam por fora.

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

/** Uma execução fechada com a origem dada; o chat e o teste de conexão não têm card nem agente. */
function run(startedAt: number, durationMs: number, origin: AiRunOrigin, outcome: AiRunOutcome = 'done'): void {
  vi.setSystemTime(startedAt);
  const cardless = origin === 'chat' || origin === 'test';
  const id = runs.start({
    boardId,
    startedAt,
    origin,
    tool: 'claude',
    cardId: cardless ? null : 'c1',
    cardNumber: cardless ? null : 1,
    cardTitle: cardless ? '' : 'História',
    cardType: cardless ? '' : 'História',
    workflow: cardless ? '' : 'Histórias',
    columnName: cardless ? '' : 'Implementação',
    phase: cardless ? '' : 'Implementação',
  });
  runs.describe(id, {
    model: 'opus',
    effort: null,
    profile: cardless ? null : 'Agente padrão',
    agent: cardless ? null : 'condutor-do-board',
    permission: 'full',
    autonomous: false,
    clean: false,
    skills: [],
    mcp: null,
  });
  vi.setSystemTime(startedAt + durationMs);
  runs.finish(id, outcome, null, null);
  vi.setSystemTime(TODAY);
}

const row = (result: MetricsResult, label: string) => result.rows.find((r) => r.label === label);
const consolidateNow = () => consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);

describe('getMetrics: origin', () => {
  it('agrupa pela origem da execução: o chat e o teste de conexão saem das linhas dos cards', () => {
    run(at(2026, 6), 1000, 'autopilot');
    run(at(2026, 6), 2000, 'autopilot', 'failed');
    run(at(2026, 6), 500, 'manual');
    run(at(2026, 6), 300, 'chat', 'failed');
    run(at(2026, 6), 200, 'test', 'failed');

    const result = getMetrics(db, boardId, { groupBy: 'origin' });

    expect(row(result, 'autopilot')).toMatchObject({ runs: 2, durationMs: 3000 });
    expect(row(result, 'manual')).toMatchObject({ runs: 1, durationMs: 500 });
    expect(row(result, 'chat')).toMatchObject({ runs: 1, durationMs: 300 });
    expect(row(result, 'test')).toMatchObject({ runs: 1, durationMs: 200 });
    expect(row(result, '')).toBeUndefined();
  });

  it('a origem segue no corte depois de o mês ser consolidado (mês arquivado)', () => {
    run(at(2025, 1), 1000, 'chat');
    run(at(2025, 1), 2000, 'autopilot');
    run(at(2026, 6), 700, 'chat');
    consolidateNow();

    const result = getMetrics(db, boardId, { groupBy: 'origin' });

    expect(result.archivedMonths).toEqual(['2025-01']);
    expect(row(result, 'chat')).toMatchObject({ runs: 2, durationMs: 1700 });
    expect(row(result, 'autopilot')).toMatchObject({ runs: 1, durationMs: 2000 });
  });

  it('o mês arquivado antes do corte por origem entra inteiro como "não definido", sem sumir', () => {
    run(at(2025, 1), 1000, 'chat');
    run(at(2025, 1), 2000, 'autopilot');
    run(at(2026, 6), 700, 'test');
    consolidateNow();
    // o arquivo de uma versão anterior não tem a dimensão
    db.run("DELETE FROM log_months WHERE board_id = ? AND month = '2025-01' AND dim = 'origin'", [boardId]);

    const result = getMetrics(db, boardId, { groupBy: 'origin' });

    expect(row(result, '')).toMatchObject({ runs: 2, durationMs: 3000 });
    expect(row(result, 'test')).toMatchObject({ runs: 1, durationMs: 700 });
    expect(row(result, 'chat')).toBeUndefined();
  });
});
