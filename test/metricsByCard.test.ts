import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics, NO_CARD_LABEL } from '../src/extension/log/metrics';
import { BoardRepo } from '../src/extension/repositories/boardRepo';

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
  cardNumber?: number;
  cardTitle?: string;
  tokens?: number;
  costUsd?: number;
}

/** Uma execução fechada, com duração exata e, opcionalmente, consumo. */
function run(startedAt: number, durationMs: number, opts: RunOpts = {}): string {
  vi.setSystemTime(startedAt);
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool: 'claude',
    cardId: opts.cardNumber ? `c${opts.cardNumber}` : null,
    cardNumber: opts.cardNumber ?? null,
    cardTitle: opts.cardTitle ?? '',
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
  runs.finish(id, 'done', 0);
  if (opts.tokens !== undefined || opts.costUsd !== undefined)
    db.run(
      "UPDATE ai_runs SET input_tokens = ?, output_tokens = 0, cache_read_tokens = 0, cache_write_tokens = 0, cost_usd = ?, measure = 'full' WHERE id = ?",
      [opts.tokens ?? 0, opts.costUsd ?? 0, id],
    );
  vi.setSystemTime(TODAY);
  return id;
}

const row = (result: ReturnType<typeof getMetrics>, label: string) => result.rows.find((r) => r.label === label);

describe('getMetrics por card', () => {
  it('card renomeado vira uma linha só, com o título da execução mais recente (RF-19)', () => {
    run(at(2026, 6, 2), 1000, { cardNumber: 72, cardTitle: 'Título antigo' });
    run(at(2026, 6, 9), 3000, { cardNumber: 72, cardTitle: 'Título novo' });
    run(at(2026, 6, 5), 500, { cardNumber: 72, cardTitle: 'Título intermediário' });
    const result = getMetrics(db, boardId, { groupBy: 'card' });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ label: '#72 Título novo', runs: 3, durationMs: 4500 });
  });

  it('o título mais recente vale mesmo quando a execução mais recente foi gravada antes', () => {
    // a ordem de inserção não manda: manda o `started_at`
    run(at(2026, 6, 9), 1000, { cardNumber: 72, cardTitle: 'Título novo' });
    run(at(2026, 6, 2), 1000, { cardNumber: 72, cardTitle: 'Título antigo' });
    const result = getMetrics(db, boardId, { groupBy: 'card' });
    expect(result.rows.map((r) => r.label)).toEqual(['#72 Título novo']);
  });

  it('execução sem card aparece na linha "sem card", à parte e nunca como "#0" (RF-20)', () => {
    run(at(2026, 6), 1000, { cardNumber: 72, cardTitle: 'Com card' });
    run(at(2026, 6), 2000);
    run(at(2026, 6), 500);
    const result = getMetrics(db, boardId, { groupBy: 'card' });
    expect(result.rows).toHaveLength(2);
    expect(row(result, NO_CARD_LABEL)).toMatchObject({ runs: 2, durationMs: 2500 });
    expect(row(result, '#72 Com card')).toMatchObject({ runs: 1, durationMs: 1000 });
    expect(result.rows.some((r) => r.label.startsWith('#0'))).toBe(false);
  });

  it('só execuções sem card: a linha "sem card" é a única', () => {
    run(at(2026, 6), 1000);
    const result = getMetrics(db, boardId, { groupBy: 'card' });
    expect(result.rows.map((r) => r.label)).toEqual([NO_CARD_LABEL]);
  });

  it('a soma das linhas por card fecha com o total do período, sem card incluído', () => {
    run(at(2026, 6, 2), 1000, { cardNumber: 72, cardTitle: 'A', tokens: 100, costUsd: 0.01 });
    run(at(2026, 6, 9), 2000, { cardNumber: 72, cardTitle: 'B', tokens: 200, costUsd: 0.02 });
    run(at(2026, 6, 3), 4000, { cardNumber: 71, cardTitle: 'C', tokens: 300, costUsd: 0.03 });
    run(at(2026, 6, 4), 8000, { tokens: 400, costUsd: 0.04 });
    run(at(2026, 6, 5), 16000);
    const query = { startDate: '2026-06-01', endDate: '2026-06-30' };
    const byCard = getMetrics(db, boardId, { ...query, groupBy: 'card' });
    const total = row(getMetrics(db, boardId, query), 'total')!;
    const sum = (pick: (r: (typeof byCard.rows)[number]) => number | null | undefined) =>
      byCard.rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    expect(sum((r) => r.runs)).toBe(total.runs);
    expect(sum((r) => r.durationMs)).toBe(total.durationMs);
    expect(sum((r) => r.tokens)).toBe(total.tokens);
    expect(sum((r) => r.costUsd)).toBeCloseTo(total.costUsd!);
    expect(byCard.costPartial).toBe(true);
  });

  it('a linha "sem card" respeita o recorte de datas', () => {
    run(at(2026, 6, 5), 1000);
    run(at(2026, 6, 25), 2000);
    const result = getMetrics(db, boardId, { groupBy: 'card', startDate: '2026-06-01', endDate: '2026-06-10' });
    expect(row(result, NO_CARD_LABEL)).toMatchObject({ runs: 1, durationMs: 1000 });
  });

  it('filtrar por um card exclui a linha "sem card"', () => {
    run(at(2026, 6), 1000, { cardNumber: 72, cardTitle: 'Com card' });
    run(at(2026, 6), 2000);
    const result = getMetrics(db, boardId, { groupBy: 'card', card: 72 });
    expect(result.rows.map((r) => r.label)).toEqual(['#72 Com card']);
  });

  it('card sem título aparece só com o número', () => {
    run(at(2026, 6), 1000, { cardNumber: 71 });
    expect(getMetrics(db, boardId, { groupBy: 'card' }).rows.map((r) => r.label)).toEqual(['#71']);
  });
});
