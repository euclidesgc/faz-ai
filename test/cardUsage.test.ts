import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { cardUsage } from '../src/extension/log/cardUsage';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { RunReport } from '../src/shared/log';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let db: Database;
let boardId: string;
let runs: AiRunRepo;

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  boardId = new BoardRepo(db).getOrCreate('ws', 'Projeto').id;
  runs = new AiRunRepo(db);
});

const tokens = (input: number, output: number, cacheRead: number, cacheWrite: number): RunReport => ({
  measure: 'full',
  consumption: {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    turns: 1,
    sessionId: 's',
    costUsd: null,
  },
  inventory: [],
  answer: '',
  reason: null,
  usageLimitReached: false,
});
const NOT_MEASURED: RunReport = {
  measure: 'none',
  consumption: null,
  inventory: [],
  answer: '',
  reason: 'sem medida',
  usageLimitReached: false,
};

/** Uma execução do card `cardNumber` na fase `phase`; sem `report`, fica em andamento. */
function run(cardNumber: number, phase: string, report?: RunReport): void {
  const id = runs.start({
    boardId,
    startedAt: Date.now(),
    origin: 'manual',
    tool: 'claude',
    cardId: `c${cardNumber}`,
    cardNumber,
    cardTitle: 'Login',
    cardType: 'História',
    workflow: 'Histórias',
    columnName: phase,
    phase,
  });
  if (!report) return;
  runs.measure(id, report);
  runs.finish(id, 'done', 0);
}

describe('consumo de um card', () => {
  it('soma por fase, na ordem das colunas; execução sem medição conta nas execuções e não nos tokens', () => {
    run(1, 'PRD', tokens(100, 200, 300, 400));
    run(1, 'Discovery', tokens(10, 20, 30, 40));
    run(1, 'Discovery', NOT_MEASURED);
    run(1, 'Coluna antiga', tokens(1, 1, 1, 1));
    run(1, 'PRD'); // em andamento
    run(9, 'PRD', tokens(5000, 0, 0, 0)); // outro card
    const u = cardUsage(db, boardId, 1, ['Backlog', 'Discovery', 'PRD']);
    expect(u.phases.map((p) => [p.phase, p.runs, p.measuredRuns, p.open, p.tokens?.total ?? null])).toEqual([
      ['Discovery', 2, 1, 0, 100],
      ['PRD', 2, 1, 1, 1000],
      ['Coluna antiga', 1, 1, 0, 4],
    ]);
    expect(u.phases[0]!.tokens).toEqual({ input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 });
    expect(u.subtasks).toBeNull();
    expect(u.total).toMatchObject({ runs: 5, measuredRuns: 3, open: 1 });
    expect(u.total.tokens).toEqual({ input: 111, output: 221, cacheRead: 331, cacheWrite: 441, total: 1104 });
    expect(u.archivedUntil).toBe('');
  });

  it('fase sem nenhuma execução medida fica "não medido" (null), nunca zero', () => {
    run(1, 'Discovery', NOT_MEASURED);
    const u = cardUsage(db, boardId, 1, ['Discovery']);
    expect(u.phases[0]).toMatchObject({ runs: 1, measuredRuns: 0, tokens: null });
    expect(u.total.tokens).toBeNull();
  });

  it('numa história, as sub-tarefas entram numa linha à parte e no total', () => {
    run(1, 'Implementação', tokens(10, 10, 10, 10));
    run(2, 'A fazer', tokens(1, 2, 3, 4));
    run(3, 'Em andamento', tokens(1, 1, 1, 1));
    const u = cardUsage(db, boardId, 1, ['Implementação'], [2, 3]);
    expect(u.subtasks).toMatchObject({ runs: 2, tokens: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, total: 14 } });
    expect(u.total.tokens?.total).toBe(54);
  });

  it('sem execução nenhuma, tudo zerado e sem tokens; o mês arquivado avisa até quando o detalhe sumiu', () => {
    db.run("INSERT INTO log_months (board_id, month, metric, dim, value, n, total) VALUES (?, '2025-11', 'runs', '', '', 3, 1000)", [
      boardId,
    ]);
    db.run("INSERT INTO log_months (board_id, month, metric, dim, value, n, total) VALUES (?, '2025-12', 'runs', '', '', 1, 10)", [
      boardId,
    ]);
    const u = cardUsage(db, boardId, 1, []);
    expect(u.phases).toEqual([]);
    expect(u.total).toMatchObject({ runs: 0, tokens: null });
    expect(u.archivedUntil).toBe('2025-12');
  });
});
