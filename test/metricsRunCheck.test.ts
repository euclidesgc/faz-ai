import { beforeEach, describe, expect, it } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics } from '../src/extension/log/metrics';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { RunCheck } from '../src/shared/runCheck';
import { monthOf, type RunReport } from '../src/shared/log';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let db: Database;
let boardId: string;
let runs: AiRunRepo;

beforeEach(async () => {
  db = await openInMemory(WASM_DIR);
  boardId = new BoardRepo(db).getOrCreate('ws', 'Projeto').id;
  runs = new AiRunRepo(db);
});

const report: RunReport = { measure: 'partial', consumption: null, inventory: [], answer: '', reason: null } as unknown as RunReport;

/** Uma execução fechada da ferramenta; `check` ausente deixa a conferência nula, como a anterior à migração. */
function run(tool: string, check?: RunCheck): void {
  const startedAt = Date.now();
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool,
    cardId: null,
    cardNumber: null,
    cardTitle: '',
    cardType: 'História',
    workflow: 'Histórias',
    columnName: 'Implementação',
    phase: 'Implementação',
  });
  runs.finish(id, 'done', 0);
  if (check) runs.measure(id, report, check);
}

describe('conferência da execução por ferramenta', () => {
  it('grava e lê a conferência; linha sem conferência lê como não conferida', () => {
    run('claude', { status: 'deviation', deviations: [{ kind: 'mcp_server', name: 'github', calls: 2 }] });
    run('claude');
    const [a, b] = runs.byMonth(monthOf(Date.now()));
    expect(a!.check.status).toBe('deviation');
    expect(b!.check.status).toBe('unchecked');
  });

  it('agrega por ferramenta: sem desvio, com desvio e não conferidas', () => {
    run('claude', { status: 'ok' });
    run('claude', { status: 'deviation', deviations: [{ kind: 'agent', name: 'X', calls: 1 }] });
    run('claude');
    run('cursor', { status: 'unchecked', reason: 'no_inventory' });
    const rows = getMetrics(db, boardId, { groupBy: 'tool' }).rows;
    expect(rows.find((r) => r.label === 'claude')!.checks).toEqual({ ok: 1, deviation: 1, unchecked: 1 });
    expect(rows.find((r) => r.label === 'cursor')!.checks).toEqual({ ok: 0, deviation: 0, unchecked: 1 });
    expect(getMetrics(db, boardId, { groupBy: 'phase' }).rows[0]!.checks).toBeUndefined();
  });
});
