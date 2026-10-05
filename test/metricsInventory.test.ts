import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics } from '../src/extension/log/metrics';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { InventoryKind } from '../src/shared/log';

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

/** Uma execução fechada, com o inventário dado (`[kind, nome, usos]`) e, opcionalmente, consumo medido. */
function run(startedAt: number, inventory: [InventoryKind, string, number][], tokens?: number, costUsd?: number): string {
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
  vi.setSystemTime(startedAt + 1000);
  runs.finish(id, 'done', 0);
  if (tokens !== undefined)
    db.run(
      "UPDATE ai_runs SET input_tokens = ?, output_tokens = 0, cache_read_tokens = 0, cache_write_tokens = 0, cost_usd = ?, measure = 'full' WHERE id = ?",
      [tokens, costUsd ?? 0, id],
    );
  for (const [kind, name, calls] of inventory)
    db.run('INSERT INTO ai_run_usage(run_id, kind, name, calls) VALUES (?,?,?,?)', [id, kind, name, calls]);
  vi.setSystemTime(TODAY);
  return id;
}

const row = (result: ReturnType<typeof getMetrics>, label: string) => result.rows.find((r) => r.label === label);

describe('getMetrics: inventário', () => {
  it('used_tool lê só o kind "tool", contando execuções distintas e somando usos', () => {
    run(at(2026, 6), [
      ['tool', 'Read', 3],
      ['tool', 'Bash', 1],
      ['skill', 'sql-queries', 1],
    ]);
    run(at(2026, 6), [['tool', 'Read', 2]]);
    const result = getMetrics(db, boardId, { groupBy: 'used_tool' });
    expect(result.rows.map((r) => r.label)).toEqual(['Read', 'Bash']);
    expect(row(result, 'Read')).toMatchObject({ runs: 2, calls: 5 });
    expect(row(result, 'Bash')).toMatchObject({ runs: 1, calls: 1 });
  });

  it('mcp_tool lê só o kind "mcp_tool" e separa o servidor do nome', () => {
    run(at(2026, 6), [
      ['mcp_tool', 'faz-ai/get_card', 4],
      ['mcp_tool', 'faz-ai/move_card', 1],
      ['tool', 'Read', 9],
    ]);
    run(at(2026, 6), [['mcp_tool', 'faz-ai/get_card', 2]]);
    const result = getMetrics(db, boardId, { groupBy: 'mcp_tool' });
    expect(result.rows).toHaveLength(2);
    expect(row(result, 'faz-ai/get_card')).toMatchObject({ runs: 2, calls: 6, server: 'faz-ai' });
    expect(row(result, 'faz-ai/move_card')).toMatchObject({ runs: 1, calls: 1, server: 'faz-ai' });
  });

  it('o nome de MCP sem servidor reconhecível fica como veio, com server vazio', () => {
    run(at(2026, 6), [['mcp_tool', 'mcp_tool_call', 1]]);
    const result = getMetrics(db, boardId, { groupBy: 'mcp_tool' });
    expect(row(result, 'mcp_tool_call')).toMatchObject({ runs: 1, calls: 1, server: '' });
  });

  it('só as linhas de mcp_tool têm server', () => {
    run(at(2026, 6), [
      ['tool', 'Read', 1],
      ['agent', 'Explore', 1],
      ['skill', 'sql-queries', 1],
      ['mcp_tool', 'a/b', 1],
    ]);
    for (const groupBy of ['used_tool', 'agent', 'skill'] as const) {
      const result = getMetrics(db, boardId, { groupBy });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).not.toHaveProperty('server');
    }
    expect(getMetrics(db, boardId, { groupBy: 'mcp_tool' }).rows[0]).toHaveProperty('server', 'a');
  });

  it('as quatro dimensões não têm tokens nem custo: undefined, não null', () => {
    run(
      at(2026, 6),
      [
        ['tool', 'Read', 1],
        ['mcp_tool', 'a/b', 1],
        ['agent', 'Explore', 1],
        ['skill', 'sql-queries', 1],
      ],
      500,
      0.5,
    );
    for (const groupBy of ['used_tool', 'mcp_tool', 'agent', 'skill'] as const) {
      const result = getMetrics(db, boardId, { groupBy });
      expect(result.rows[0]!.tokens).toBeUndefined();
      expect(result.rows[0]!.costUsd).toBeUndefined();
      expect(result.costPartial).toBe(false);
    }
  });

  it('respeita o período e os filtros da consulta (o JOIN com ai_runs)', () => {
    run(at(2026, 6), [['tool', 'Read', 1]]);
    run(at(2026, 5), [['tool', 'Read', 7]]);
    const result = getMetrics(db, boardId, { groupBy: 'used_tool', startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(row(result, 'Read')).toMatchObject({ runs: 1, calls: 1 });
    expect(getMetrics(db, boardId, { groupBy: 'used_tool', model: 'inexistente' }).rows).toEqual([]);
  });

  it('sem nenhuma linha de inventário no período, devolve zero grupos', () => {
    run(at(2026, 6), []);
    for (const groupBy of ['used_tool', 'mcp_tool'] as const) {
      const result = getMetrics(db, boardId, { groupBy });
      expect(result.rows).toEqual([]);
      expect(result.othersCount).toBe(0);
    }
  });

  it('mais grupos que o limite viram "outros", sem server', () => {
    run(at(2026, 6), [
      ['mcp_tool', 'a/um', 3],
      ['mcp_tool', 'a/dois', 2],
      ['mcp_tool', 'b/tres', 1],
    ]);
    const result = getMetrics(db, boardId, { groupBy: 'mcp_tool', limit: 1 });
    expect(result.othersCount).toBe(2);
    expect(result.rows.map((r) => r.label)).toEqual(['a/um', 'outros']);
    expect(row(result, 'outros')).toMatchObject({ calls: 3 });
    expect(row(result, 'outros')).not.toHaveProperty('server');
  });
});
