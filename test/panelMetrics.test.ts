import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { getPanelMetrics } from '../src/extension/log/metrics';
import { consolidate } from '../src/extension/log/rollup';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { MetricsMonth, MetricsPanelResult } from '../src/shared/metrics';

// #155: `getPanelMetrics`, a consulta do painel de métricas (#71). Um teste por requisito do PRD; a
// montagem é a de test/metrics.test.ts, com o consumo entrando pelo caminho real (`AiRunRepo.measure`).

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
/** data fixa de referência: 15 de junho de 2026, meio-dia, no fuso da máquina */
const TODAY = new Date(2026, 5, 15, 12, 0, 0).getTime();
const at = (year: number, month: number, day = 10) => new Date(year, month - 1, day, 12, 0, 0).getTime();

let db: Database;
let boardId: string;
let boards: BoardRepo;
let runs: AiRunRepo;
let events: CardEventRepo;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  db = await openInMemory(WASM_DIR);
  boards = new BoardRepo(db);
  boardId = boards.getOrCreate('ws', 'Projeto').id;
  runs = new AiRunRepo(db);
  events = new CardEventRepo(db);
  // a série começa em 1º de janeiro: os testes que olham o início da série o redefinem
  setLogSince(at(2026, 1, 1));
});

afterEach(() => vi.useRealTimers());

interface Consumption {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** omitido = medida sem custo (sem preço no catálogo) */
  costUsd?: number;
  /** padrão true (preço do catálogo); false = informado pela ferramenta */
  estimated?: boolean;
}

interface RunOpts {
  workflow?: string;
  /** sem `consumption`, a execução não é medida (`measure: 'none'`) */
  consumption?: Consumption;
  /** true = em andamento (sem `finish`) */
  open?: boolean;
}

/** Uma execução com duração exata; o consumo, quando há, entra por `AiRunRepo.measure`. */
function run(startedAt: number, durationMs: number, opts: RunOpts = {}): string {
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
    workflow: opts.workflow ?? 'Histórias',
    columnName: 'Implementação',
    phase: 'Implementação',
  });
  if (!opts.open) {
    vi.setSystemTime(startedAt + durationMs);
    runs.finish(id, 'done', 0);
  }
  const c = opts.consumption;
  if (c)
    runs.measure(id, {
      measure: 'full',
      consumption: {
        inputTokens: c.input ?? 0,
        outputTokens: c.output ?? 0,
        cacheReadTokens: c.cacheRead ?? 0,
        cacheWriteTokens: c.cacheWrite ?? 0,
        turns: 1,
        sessionId: null,
        costUsd: c.costUsd ?? null,
        costEstimated: c.estimated ?? true,
      },
      inventory: [{ kind: 'tool', name: 'Read', calls: 1 }],
      answer: '',
      reason: null,
      usageLimitReached: false,
    });
  vi.setSystemTime(TODAY);
  return id;
}

/** Um evento de card; `done` é o que conta como atividade concluída. */
function event(when: number, kind: 'done' | 'comment' = 'done', workflow = 'Histórias'): void {
  events.add({
    boardId,
    at: when,
    kind,
    cardId: 'c1',
    cardNumber: 1,
    cardTitle: 'Card',
    cardType: 'História',
    workflow,
    columnName: 'Concluído',
    fromValue: '',
    toValue: '',
    subject: '',
    author: 'pessoa',
    source: 'human',
    runId: null,
  });
}

function setLogSince(ts: number): void {
  db.run('UPDATE boards SET log_since = ? WHERE id = ?', [ts, boardId]);
}

const month = (result: MetricsPanelResult, m: string): MetricsMonth => {
  const found = result.months.find((x) => x.month === m);
  if (!found) throw new Error(`mês ${m} fora da espinha`);
  return found;
};

describe('getPanelMetrics', () => {
  it('RF-04: data final antes da inicial lança', () => {
    expect(() => getPanelMetrics(db, boardId, { startDate: '2026-06-10', endDate: '2026-06-01' })).toThrow();
  });

  it('RF-09: os cinco totais batem com o log montado à mão', () => {
    run(at(2026, 6, 2), 1000, { consumption: { input: 100, output: 20, costUsd: 0.5 } });
    run(at(2026, 6, 3), 2000, { consumption: { input: 50, output: 10, costUsd: 0.25 } });
    run(at(2026, 6, 4), 4000);
    event(at(2026, 6, 5));
    event(at(2026, 6, 6));
    event(at(2026, 6, 6), 'comment');
    const { totals } = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(totals.cardsDone).toBe(2);
    expect(totals.runs).toBe(3);
    expect(totals.durationMs).toBe(7000);
    expect(totals.tokens?.total).toBe(180);
    expect(totals.costUsd).toBe(0.75);
  });

  it('total = soma da série, mês a mês', () => {
    setLogSince(at(2026, 3, 1));
    run(at(2026, 3), 1000, { consumption: { input: 10, costUsd: 0.5 } });
    run(at(2026, 4), 2000);
    run(at(2026, 6), 4000, { consumption: { input: 30, output: 5, costUsd: 0.25, estimated: false } });
    event(at(2026, 4));
    event(at(2026, 6));
    const result = getPanelMetrics(db, boardId, { startDate: '2026-03-01', endDate: '2026-06-30' });
    const sum = (pick: (m: MetricsMonth) => number) => result.months.reduce((s, m) => s + pick(m), 0);
    expect(result.totals.runs).toBe(sum((m) => m.runs));
    expect(result.totals.durationMs).toBe(sum((m) => m.durationMs));
    expect(result.totals.cardsDone).toBe(sum((m) => m.cardsDone));
    expect(result.totals.measuredRuns).toBe(sum((m) => m.measuredRuns));
    expect(result.totals.tokens?.total).toBe(sum((m) => m.tokens?.total ?? 0));
    expect(result.totals.costUsd).toBe(sum((m) => m.costUsd ?? 0));
    expect(result.totals.costEstimatedUsd).toBe(0.5);
    expect(result.totals.costInformedUsd).toBe(0.25);
  });

  it('RF-13: mês sem dado volta present:false, distinto de mês com dado e valor zero', () => {
    setLogSince(at(2026, 2, 1));
    run(at(2026, 2), 1000);
    event(at(2026, 4), 'comment'); // houve log em abril, mas nenhuma execução nem conclusão
    const result = getPanelMetrics(db, boardId, { startDate: '2026-02-01', endDate: '2026-06-30' });
    expect(result.months.map((m) => m.month)).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    expect(month(result, '2026-03')).toMatchObject({ present: false, runs: 0, cardsDone: 0, tokens: null, costUsd: null });
    expect(month(result, '2026-04')).toMatchObject({ present: true, runs: 0, cardsDone: 0 });
    expect(month(result, '2026-02')).toMatchObject({ present: true, runs: 1 });
  });

  it('RF-07: período inteiro sem dado não produz zeros medidos', () => {
    setLogSince(at(2026, 1, 1));
    run(at(2026, 6), 1000, { consumption: { input: 10, costUsd: 0.5 } });
    const result = getPanelMetrics(db, boardId, { startDate: '2026-02-01', endDate: '2026-03-31' });
    expect(result.months).toHaveLength(2);
    expect(result.months.every((m) => !m.present)).toBe(true);
    expect(result.totals).toMatchObject({ runs: 0, tokens: null, costUsd: null, costEstimatedUsd: null, costInformedUsd: null });
  });

  it('RF-15: recorte de um mês só devolve um mês na espinha', () => {
    run(at(2026, 6, 15), 1000);
    const result = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(result.months.map((m) => m.month)).toEqual(['2026-06']);
    expect(result.totals.runs).toBe(1);
  });

  it('RF-17: o mês corrente e o primeiro da série são parciais; os do meio, não', () => {
    setLogSince(at(2026, 3, 20));
    const result = getPanelMetrics(db, boardId, {});
    expect(result.months.map((m) => [m.month, m.partial])).toEqual([
      ['2026-03', true],
      ['2026-04', false],
      ['2026-05', false],
      ['2026-06', true],
    ]);
  });

  it('o mês que o recorte corta pela metade é parcial', () => {
    setLogSince(at(2026, 1, 1));
    const result = getPanelMetrics(db, boardId, { startDate: '2026-02-10', endDate: '2026-04-30' });
    expect(result.months.map((m) => [m.month, m.partial])).toEqual([
      ['2026-02', true],
      ['2026-03', false],
      ['2026-04', false],
    ]);
  });

  describe('RF-18: medição', () => {
    it('nada medido: tokens e custo null, nunca zero', () => {
      run(at(2026, 6), 1000);
      run(at(2026, 6), 1000);
      const result = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' });
      expect(result.totals).toMatchObject({ runs: 2, measuredRuns: 0, tokens: null, costUsd: null });
      expect(month(result, '2026-06')).toMatchObject({ present: true, tokens: null, costUsd: null });
    });

    it('parte medida: soma o que foi medido e denuncia a parcialidade em measuredRuns', () => {
      run(at(2026, 6), 1000, { consumption: { input: 100, costUsd: 0.5 } });
      run(at(2026, 6), 1000);
      const { totals } = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' });
      expect(totals).toMatchObject({ runs: 2, measuredRuns: 1, costUsd: 0.5, costEstimatedUsd: 0.5, costInformedUsd: null });
      expect(totals.tokens?.total).toBe(100);
    });

    it('medido sem custo: tokens somados, custo null', () => {
      run(at(2026, 6), 1000, { consumption: { input: 40 } });
      const { totals } = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' });
      expect(totals.tokens?.total).toBe(40);
      expect(totals.costUsd).toBeNull();
    });
  });

  it('RF-11: execução em andamento conta em runs e runsOpen, sem entrar em durationMs', () => {
    run(at(2026, 6), 3000);
    run(at(2026, 6, 14), 0, { open: true });
    const { totals } = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(totals).toMatchObject({ runs: 2, runsOpen: 1, durationMs: 3000 });
  });

  it('RF-12: a quebra dos tokens soma o total', () => {
    run(at(2026, 6), 1000, { consumption: { input: 100, output: 20, cacheRead: 300, cacheWrite: 4 } });
    run(at(2026, 6), 1000, { consumption: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } });
    const { tokens } = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30' }).totals;
    expect(tokens).toEqual({ input: 101, output: 22, cacheRead: 303, cacheWrite: 8, total: 434 });
  });

  describe('RF-20: início da série', () => {
    beforeEach(() => setLogSince(TODAY));

    it('período que começa antes do logSince é cortado nele, com clamped', () => {
      const result = getPanelMetrics(db, boardId, { startDate: '2026-01-01', endDate: '2026-06-30' });
      expect(result.logSince).toBe('2026-06-15');
      expect(result.range).toEqual({ startDate: '2026-06-15', endDate: '2026-06-30' });
      expect(result.clamped).toBe(true);
      expect(result.months.map((m) => m.month)).toEqual(['2026-06']);
    });

    it('período dentro da série não é cortado', () => {
      const result = getPanelMetrics(db, boardId, { startDate: '2026-06-15', endDate: '2026-06-20' });
      expect(result.range).toEqual({ startDate: '2026-06-15', endDate: '2026-06-20' });
      expect(result.clamped).toBe(false);
    });

    it('sem datas, vai do logSince até hoje', () => {
      setLogSince(at(2026, 4, 3));
      const result = getPanelMetrics(db, boardId, {});
      expect(result.range).toEqual({ startDate: '2026-04-03', endDate: '2026-06-15' });
      expect(result.clamped).toBe(false);
    });

    it('período inteiro antes da série: espinha vazia, sem erro', () => {
      const result = getPanelMetrics(db, boardId, { startDate: '2026-01-01', endDate: '2026-02-28' });
      expect(result.clamped).toBe(true);
      expect(result.months).toEqual([]);
      expect(result.totals.runs).toBe(0);
    });
  });

  describe('RF-21: detalhe e arquivo', () => {
    beforeEach(() => setLogSince(at(2025, 10, 1)));

    it('detailFrom é o mês mais antigo com detalhe; archivedMonths, os do recorte só com total mensal', () => {
      run(at(2025, 11), 1000);
      run(at(2026, 6), 1000);
      consolidate(db, boardId, TODAY, 6); // guarda de dez/2025 a jun/2026
      const result = getPanelMetrics(db, boardId, {});
      expect(result.detailFrom).toBe('2026-06');
      expect(result.archivedMonths).toEqual(['2025-11']);
      expect(month(result, '2025-11')).toMatchObject({ archived: true, present: true, runs: 1 });
      expect(month(result, '2025-10')).toMatchObject({ archived: false, present: false });
      expect(month(result, '2026-06').archived).toBe(false);
    });

    it('consolidar não muda os números do mês (RF-14), quebra dos tokens e origem do custo incluídas', () => {
      run(at(2025, 11), 1000, { consumption: { input: 100, output: 20, cacheRead: 3, cacheWrite: 4, costUsd: 0.5 } });
      run(at(2025, 11), 2000, { consumption: { input: 1, costUsd: 0.25, estimated: false } });
      run(at(2025, 11), 4000);
      event(at(2025, 11));
      const before = month(getPanelMetrics(db, boardId, {}), '2025-11');
      consolidate(db, boardId, TODAY, 6);
      const after = month(getPanelMetrics(db, boardId, {}), '2025-11');
      expect(before.archived).toBe(false);
      expect(after.archived).toBe(true);
      expect({ ...after, archived: false }).toEqual(before);
      expect(after.tokens).toEqual({ input: 101, output: 20, cacheRead: 3, cacheWrite: 4, total: 128 });
      expect(after).toMatchObject({ costUsd: 0.75, costEstimatedUsd: 0.5, costInformedUsd: 0.25, measuredRuns: 2, runs: 3, cardsDone: 1 });
    });

    it('mês com detalhe vale pelo detalhe e o arquivo dele é ignorado', () => {
      run(at(2025, 11), 1000);
      consolidate(db, boardId, TODAY, 6);
      run(at(2025, 11, 20), 2000); // execução atrasada num mês já consolidado
      const result = getPanelMetrics(db, boardId, {});
      expect(month(result, '2025-11')).toMatchObject({ archived: false, runs: 1, durationMs: 2000 });
      expect(result.archivedMonths).toEqual([]);
    });
  });

  describe('RF-05: filtro de workflow', () => {
    it('no detalhe', () => {
      run(at(2026, 6), 1000, { workflow: 'Histórias' });
      run(at(2026, 6), 2000, { workflow: 'Sub-tarefas' });
      event(at(2026, 6), 'done', 'Sub-tarefas');
      event(at(2026, 6), 'done', 'Histórias');
      const { totals } = getPanelMetrics(db, boardId, { startDate: '2026-06-01', endDate: '2026-06-30', workflow: 'Sub-tarefas' });
      expect(totals).toMatchObject({ runs: 1, durationMs: 2000, cardsDone: 1 });
    });

    it('no arquivo: contagem, tempo e conclusões do workflow; consumo fica "não medido no recorte"', () => {
      setLogSince(at(2025, 10, 1));
      run(at(2025, 11), 1000, { workflow: 'Histórias', consumption: { input: 10, costUsd: 0.5 } });
      run(at(2025, 11), 2000, { workflow: 'Sub-tarefas', consumption: { input: 20, costUsd: 0.25 } });
      event(at(2025, 11), 'done', 'Sub-tarefas');
      consolidate(db, boardId, TODAY, 6);
      const result = getPanelMetrics(db, boardId, { workflow: 'Sub-tarefas' });
      expect(month(result, '2025-11')).toMatchObject({
        archived: true,
        present: true,
        runs: 1,
        durationMs: 2000,
        cardsDone: 1,
        measuredRuns: 0,
        tokens: null,
        costUsd: null,
      });
    });

    it('workflow sem dado no mês arquivado: lacuna, não zero', () => {
      setLogSince(at(2025, 10, 1));
      run(at(2025, 11), 1000, { workflow: 'Histórias' });
      consolidate(db, boardId, TODAY, 6);
      const result = getPanelMetrics(db, boardId, { workflow: 'Sub-tarefas' });
      expect(month(result, '2025-11')).toMatchObject({ archived: true, present: false, runs: 0 });
    });
  });

  it('workflows: os do recorte, do detalhe e do arquivo, em ordem alfabética, sem o vazio', () => {
    setLogSince(at(2025, 10, 1));
    run(at(2025, 11), 1000, { workflow: 'Antigo' });
    consolidate(db, boardId, TODAY, 6);
    run(at(2026, 6), 1000, { workflow: 'Sub-tarefas' });
    run(at(2026, 6), 1000, { workflow: '' });
    event(at(2026, 5), 'comment', 'Histórias');
    run(at(2026, 1), 1000, { workflow: 'Fora do recorte' });
    expect(getPanelMetrics(db, boardId, {}).workflows).toEqual(['Antigo', 'Fora do recorte', 'Histórias', 'Sub-tarefas']);
    expect(getPanelMetrics(db, boardId, { startDate: '2026-05-01', endDate: '2026-06-30' }).workflows).toEqual([
      'Histórias',
      'Sub-tarefas',
    ]);
    // a lista não encolhe quando um workflow é escolhido
    expect(getPanelMetrics(db, boardId, { startDate: '2026-05-01', workflow: 'Histórias' }).workflows).toEqual([
      'Histórias',
      'Sub-tarefas',
    ]);
  });

  it('retention: a janela das regras, os meses com detalhe e as linhas guardadas', () => {
    boards.updateRules(boardId, { logRetentionMonths: 3 });
    run(at(2026, 5), 1000, { consumption: { input: 1 } }); // 1 linha em ai_runs + 1 em ai_run_usage
    run(at(2026, 6), 1000);
    event(at(2026, 6));
    expect(getPanelMetrics(db, boardId, {}).retention).toEqual({ months: 3, detailMonths: 2, detailRows: 4 });
  });

  it('board sem log nenhum: logSince vazio e nada inventado', () => {
    setLogSince(0);
    const result = getPanelMetrics(db, boardId, {});
    expect(result.logSince).toBe('');
    expect(result.detailFrom).toBe('');
    expect(result.months.every((m) => !m.present)).toBe(true);
    expect(result.totals.tokens).toBeNull();
  });
});

describe('getPanelMetrics: revisão 0.32.0', () => {
  it('período inteiro antes do início da série: recorte vazio, nunca invertido', () => {
    setLogSince(TODAY);
    const result = getPanelMetrics(db, boardId, { startDate: '2026-01-01', endDate: '2026-02-28' });
    expect(result.range).toEqual({ startDate: '', endDate: '' });
    expect(result.clamped).toBe(true);
    expect(result.months).toEqual([]);
    expect(result.workflows).toEqual([]);
    expect(result.archivedMonths).toEqual([]);
  });

  it('costedRuns nos totais e em cada mês: execuções com custo, contadas à parte das medidas', () => {
    run(at(2026, 5), 1000, { consumption: { input: 10, costUsd: 0.25 } });
    run(at(2026, 6), 1000, { consumption: { input: 10, costUsd: 0.5, estimated: false } });
    run(at(2026, 6), 1000, { consumption: { input: 10 } }); // medida sem custo
    run(at(2026, 6), 1000); // não medida
    const result = getPanelMetrics(db, boardId, { startDate: '2026-05-01', endDate: '2026-06-30' });
    expect(result.totals).toMatchObject({ runs: 4, measuredRuns: 3, costedRuns: 2 });
    expect(month(result, '2026-05')).toMatchObject({ costedRuns: 1 });
    expect(month(result, '2026-06')).toMatchObject({ costedRuns: 1, measuredRuns: 2 });
  });

  it('costedRuns sobrevive à consolidação (mês arquivado)', () => {
    run(at(2026, 3), 1000, { consumption: { input: 10, costUsd: 0.25 } });
    run(at(2026, 3), 1000, { consumption: { input: 10 } });
    consolidate(db, boardId, TODAY, 1);
    const result = getPanelMetrics(db, boardId, { startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(month(result, '2026-03')).toMatchObject({ archived: true, runs: 2, measuredRuns: 2, costedRuns: 1 });
    expect(result.totals.costedRuns).toBe(1);
  });
});
