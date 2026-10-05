import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { getMetrics } from '../src/extension/log/metrics';
import { consolidate } from '../src/extension/log/rollup';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import { DEFAULT_LOG_RETENTION_MONTHS } from '../src/shared/rules';

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
  phase?: string;
  cardType?: string;
  model?: string | null;
  tool?: string;
  tokens?: number;
  costUsd?: number;
  skills?: string[];
  agent?: string;
}

/** Uma execução fechada, com duração exata e, opcionalmente, consumo (como só #70 vai gravar). */
function run(startedAt: number, durationMs: number, opts: RunOpts = {}): string {
  vi.setSystemTime(startedAt);
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool: opts.tool ?? 'claude',
    cardId: opts.cardNumber ? `c${opts.cardNumber}` : null,
    cardNumber: opts.cardNumber ?? null,
    cardTitle: opts.cardTitle ?? '',
    cardType: opts.cardType ?? 'História',
    workflow: 'Histórias',
    columnName: opts.phase ?? 'Implementação',
    phase: opts.phase ?? 'Implementação',
  });
  runs.describe(id, {
    model: opts.model === undefined ? 'opus' : opts.model,
    effort: 'high',
    profile: 'Agente padrão',
    agent: opts.agent ?? '',
    permission: 'full',
    autonomous: false,
    clean: false,
    skills: opts.skills ?? [],
    mcp: null,
  });
  vi.setSystemTime(startedAt + durationMs);
  runs.finish(id, 'done', 0);
  if (opts.tokens !== undefined || opts.costUsd !== undefined)
    db.run(
      'UPDATE ai_runs SET input_tokens = ?, output_tokens = 0, cache_read_tokens = 0, cache_write_tokens = 0, cost_usd = ? WHERE id = ?',
      [opts.tokens ?? 0, opts.costUsd ?? 0, id],
    );
  for (const skill of opts.skills ?? [])
    db.run('INSERT INTO ai_run_usage(run_id, kind, name, calls) VALUES (?,?,?,?)', [id, 'skill', skill, 1]);
  if (opts.agent) db.run('INSERT INTO ai_run_usage(run_id, kind, name, calls) VALUES (?,?,?,?)', [id, 'agent', opts.agent, 1]);
  vi.setSystemTime(TODAY);
  return id;
}

const row = (result: ReturnType<typeof getMetrics>, label: string) => result.rows.find((r) => r.label === label);

describe('getMetrics', () => {
  it('sem group_by, devolve um total só', () => {
    run(at(2026, 6), 1000, { tokens: 100, costUsd: 0.01 });
    run(at(2026, 6), 2000, { tokens: 200, costUsd: 0.02 });
    const result = getMetrics(db, boardId, {});
    expect(result.rows).toHaveLength(1);
    expect(row(result, 'total')).toMatchObject({ runs: 2, durationMs: 3000, tokens: 300, costUsd: 0.03 });
  });

  it('agrupa por fase, com uma linha por valor', () => {
    run(at(2026, 6), 1000, { phase: 'Discovery' });
    run(at(2026, 6), 2000, { phase: 'Spec' });
    run(at(2026, 6), 500, { phase: 'Spec' });
    const result = getMetrics(db, boardId, { groupBy: 'phase' });
    expect(row(result, 'Discovery')).toMatchObject({ runs: 1, durationMs: 1000 });
    expect(row(result, 'Spec')).toMatchObject({ runs: 2, durationMs: 2500 });
  });

  it('agrupa por modelo', () => {
    run(at(2026, 6), 1000, { model: 'opus' });
    run(at(2026, 6), 3000, { model: 'haiku' });
    const result = getMetrics(db, boardId, { groupBy: 'model' });
    expect(row(result, 'opus')).toMatchObject({ runs: 1, durationMs: 1000 });
    expect(row(result, 'haiku')).toMatchObject({ runs: 1, durationMs: 3000 });
  });

  it('agrupa por card, com rótulo "#número título"', () => {
    run(at(2026, 6), 1000, { cardNumber: 72, cardTitle: 'Consulta das métricas' });
    run(at(2026, 6), 500, { cardNumber: 72, cardTitle: 'Consulta das métricas' });
    run(at(2026, 6), 2000, { cardNumber: 71 });
    const result = getMetrics(db, boardId, { groupBy: 'card' });
    expect(row(result, '#72 Consulta das métricas')).toMatchObject({ runs: 2, durationMs: 1500 });
    expect(result.rows.find((r) => r.label.startsWith('#71'))).toMatchObject({ runs: 1 });
  });

  it('filtra por card além de agrupar por outra dimensão', () => {
    run(at(2026, 6), 1000, { cardNumber: 72, phase: 'Discovery' });
    run(at(2026, 6), 500, { cardNumber: 72, phase: 'Spec' });
    run(at(2026, 6), 2000, { cardNumber: 71, phase: 'Discovery' });
    const result = getMetrics(db, boardId, { groupBy: 'phase', card: 72 });
    expect(result.rows).toHaveLength(2);
    expect(row(result, 'Discovery')).toMatchObject({ runs: 1, durationMs: 1000 });
  });

  it('recorte de datas exclui execuções fora do intervalo', () => {
    run(at(2026, 6, 5), 1000);
    run(at(2026, 6, 20), 2000);
    const result = getMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-10' });
    expect(row(result, 'total')).toMatchObject({ runs: 1, durationMs: 1000 });
  });

  it('recorte de datas vazio devolve zero linhas, não um erro', () => {
    run(at(2026, 6), 1000);
    const result = getMetrics(db, boardId, { startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(result.rows).toHaveLength(0);
  });

  it('start_date depois de end_date é erro', () => {
    expect(() => getMetrics(db, boardId, { startDate: '2026-06-10', endDate: '2026-06-01' })).toThrow();
  });

  describe('mês consolidado (sem detalhe)', () => {
    it('phase/model devolvem o total arquivado', () => {
      run(at(2024, 3), 1000, { phase: 'Discovery', model: 'opus' });
      run(at(2024, 3), 3000, { phase: 'Discovery', model: 'opus' });
      consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);

      const byPhase = getMetrics(db, boardId, { groupBy: 'phase' });
      expect(row(byPhase, 'Discovery')).toMatchObject({ runs: 2, durationMs: 4000 });
      expect(byPhase.archivedMonths).toEqual(['2024-03']);

      const byModel = getMetrics(db, boardId, { groupBy: 'model' });
      expect(row(byModel, 'opus')).toMatchObject({ runs: 2, durationMs: 4000 });
    });

    it('card/agent/skill não têm resposta num mês consolidado, e o mês aparece em archivedMonths', () => {
      run(at(2024, 3), 1000, { cardNumber: 72, skills: ['sql-queries'] });
      consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);

      const byCard = getMetrics(db, boardId, { groupBy: 'card' });
      expect(byCard.rows).toHaveLength(0);
      expect(byCard.archivedMonths).toEqual(['2024-03']);

      const bySkill = getMetrics(db, boardId, { groupBy: 'skill' });
      expect(bySkill.rows).toHaveLength(0);
    });

    it('um filtro além de período/card também tira o mês consolidado da conta', () => {
      run(at(2024, 3), 1000, { phase: 'Discovery', model: 'opus' });
      consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);
      const result = getMetrics(db, boardId, { groupBy: 'phase', model: 'opus' });
      expect(result.rows).toHaveLength(0);
      expect(result.archivedMonths).toEqual(['2024-03']);
    });

    it('recorte parcial de um mês consolidado devolve o mês inteiro e marca partialMonths', () => {
      run(at(2024, 3, 5), 1000);
      run(at(2024, 3, 25), 2000);
      consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);
      const result = getMetrics(db, boardId, { startDate: '2024-03-10', endDate: '2024-03-20' });
      expect(row(result, 'total')).toMatchObject({ runs: 2, durationMs: 3000 });
      expect(result.partialMonths).toEqual(['2024-03']);
    });
  });

  describe('dimensões de inventário', () => {
    it('agente e skill têm só contagem de execuções e de usos, sem tokens nem custo', () => {
      run(at(2026, 6), 1000, { skills: ['sql-queries', 'unit-testing'], tokens: 500, costUsd: 0.5 });
      run(at(2026, 6), 1000, { skills: ['sql-queries'], tokens: 500, costUsd: 0.5 });

      const result = getMetrics(db, boardId, { groupBy: 'skill' });
      const sql = row(result, 'sql-queries');
      expect(sql).toMatchObject({ runs: 2, calls: 2 });
      expect(sql?.tokens).toBeUndefined();
      expect(sql?.costUsd).toBeUndefined();
      expect(row(result, 'unit-testing')).toMatchObject({ runs: 1, calls: 1 });
    });

    it('não conta a mesma execução duas vezes em `runs` quando ela usa a mesma skill mais de uma vez', () => {
      const id = run(at(2026, 6), 1000, { skills: ['sql-queries'] });
      db.run('UPDATE ai_run_usage SET calls = 3 WHERE run_id = ? AND name = ?', [id, 'sql-queries']);
      const result = getMetrics(db, boardId, { groupBy: 'skill' });
      expect(row(result, 'sql-queries')).toMatchObject({ runs: 1, calls: 3 });
    });
  });

  describe('não medido', () => {
    it('execução sem consumo aparece como null, nunca como zero, e marca o total como parcial', () => {
      run(at(2026, 6), 1000, { tokens: 100, costUsd: 0.1 });
      run(at(2026, 6), 1000); // sem tokens/custo (pré-#70 ou run não medido)
      const result = getMetrics(db, boardId, {});
      const total = row(result, 'total')!;
      expect(total.tokens).toBe(100);
      expect(total.costUsd).toBeCloseTo(0.1);
      expect(result.costPartial).toBe(true);
    });

    it('grupo sem nenhuma execução medida devolve tokens e custo null, não zero', () => {
      run(at(2026, 6), 1000, { phase: 'PRD' });
      const result = getMetrics(db, boardId, { groupBy: 'phase' });
      const prd = row(result, 'PRD')!;
      expect(prd.tokens).toBeNull();
      expect(prd.costUsd).toBeNull();
    });
  });

  describe('limite de linhas', () => {
    it('corta no limite, soma o resto em "outros" e informa quantos ficaram de fora', () => {
      for (let i = 0; i < 5; i++) run(at(2026, 6), 1000 * (i + 1), { phase: `Fase ${i}` });
      const result = getMetrics(db, boardId, { groupBy: 'phase', limit: 3 });
      expect(result.rows).toHaveLength(4); // 3 + "outros"
      expect(result.othersCount).toBe(2);
      const outros = row(result, 'outros')!;
      // as duas fases com menor duração (1000 e 2000) ficam de fora dos 3 primeiros, ordenados por runs/duração
      expect(outros.runs).toBe(2);
    });
  });

  it('board sem nenhum log: total vazio', () => {
    const result = getMetrics(db, boardId, {});
    expect(result.rows).toHaveLength(0);
  });

  it('log_since zerado (board que existia antes do log) devolve logSince vazio, não uma data sem sentido', () => {
    db.run('UPDATE boards SET log_since = 0 WHERE id = ?', [boardId]);
    const result = getMetrics(db, boardId, {});
    expect(result.logSince).toBe('');
  });

  it('logSince vem no formato AAAA-MM-DD do início real da série', () => {
    expect(getMetrics(db, boardId, {}).logSince).toBe('2026-06-15');
  });

  it('logSince é o dia no fuso da máquina, não em UTC (board aberto às 22h30 em Brasília)', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      // 22h30 de 15/6 em Brasília já é 16/6 em UTC
      const lateNight = new Date(2026, 5, 15, 22, 30, 0).getTime();
      expect(new Date(lateNight).toISOString().slice(0, 10)).toBe('2026-06-16');
      db.run('UPDATE boards SET log_since = ? WHERE id = ?', [lateNight, boardId]);
      expect(getMetrics(db, boardId, {}).logSince).toBe('2026-06-15');
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});
