import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { consolidate, detailMonths, keepMonths, monthlyTotals } from '../src/extension/log/rollup';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { CardEvent, InventoryItem, LogMetric, RunReport } from '../src/shared/log';
import { DEFAULT_LOG_RETENTION_MONTHS } from '../src/shared/rules';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
/** data fixa de referência dos testes: 15 de junho de 2026, meio-dia, no fuso da máquina */
const TODAY = new Date(2026, 5, 15, 12, 0, 0).getTime();
/** meio-dia do dia 10 de um mês qualquer, no fuso da máquina (nunca UTC) */
const at = (year: number, month: number, day = 10) => new Date(year, month - 1, day, 12, 0, 0).getTime();

let db: Database;
let boardId: string;
let events: CardEventRepo;
let runs: AiRunRepo;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  db = await openInMemory(WASM_DIR);
  boardId = new BoardRepo(db).getOrCreate('ws', 'Projeto').id;
  events = new CardEventRepo(db);
  runs = new AiRunRepo(db);
});

afterEach(() => vi.useRealTimers());

const event = (when: number, over: Partial<CardEvent> = {}): string =>
  events.add({
    boardId,
    at: when,
    kind: 'column_changed',
    cardId: 'c1',
    cardNumber: 1,
    cardTitle: 'Login',
    cardType: 'História',
    workflow: 'Histórias',
    columnName: 'Discovery',
    fromValue: 'Backlog',
    toValue: 'Discovery',
    subject: '',
    author: 'Ana',
    source: 'human',
    runId: null,
    ...over,
  });

/** uma execução já fechada, com duração exata: `vi.setSystemTime` fixa o instante do `finish` */
const run = (startedAt: number, durationMs: number, over: Partial<Parameters<AiRunRepo['describe']>[1]> = {}): string => {
  vi.setSystemTime(startedAt);
  const id = runs.start({
    boardId,
    startedAt,
    origin: 'manual',
    tool: 'claude',
    cardId: 'c1',
    cardNumber: 1,
    cardTitle: 'Login',
    cardType: 'História',
    workflow: 'Histórias',
    columnName: 'Discovery',
    phase: 'Discovery',
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
    ...over,
  });
  vi.setSystemTime(startedAt + durationMs);
  runs.finish(id, 'done', 0);
  vi.setSystemTime(TODAY);
  return id;
};

/** relatório de uma execução medida: 10+20+30+40 = 100 tokens e US$ 0,50, salvo o que `over` trocar */
const measured = (over: Partial<NonNullable<RunReport['consumption']>> = {}, inventory: InventoryItem[] = []): RunReport => ({
  measure: 'full',
  consumption: {
    inputTokens: 10,
    outputTokens: 20,
    cacheReadTokens: 30,
    cacheWriteTokens: 40,
    turns: 3,
    sessionId: 's1',
    costUsd: 0.5,
    costEstimated: false,
    ...over,
  },
  inventory,
  answer: '',
  reason: null,
});

const notMeasured = (): RunReport => ({ measure: 'none', consumption: null, inventory: [], answer: '', reason: 'sem medida' });

const of = (totals: LogMetric[], metric: string, dim = '', value = '') =>
  totals.find((t) => t.metric === metric && t.dim === dim && t.value === value);

describe('keepMonths', () => {
  const keepMonthsDefault = (now: number) => keepMonths(now, DEFAULT_LOG_RETENTION_MONTHS);

  it('RF-32: guarda o mês corrente e os seis anteriores, sete marcadores', () => {
    const keep = keepMonthsDefault(TODAY);
    expect(DEFAULT_LOG_RETENTION_MONTHS).toBe(6);
    expect(keep).toHaveLength(DEFAULT_LOG_RETENTION_MONTHS + 1);
    expect(keep[0]).toBe('2026-06');
    expect(keep.at(-1)).toBe('2025-12');
  });

  it('a janela recebida manda: 3, 6, 12 e 24 meses dão janela + 1 marcadores, sem repetir nenhum', () => {
    for (const months of [3, 6, 12, 24]) {
      const keep = keepMonths(TODAY, months);
      expect(keep).toHaveLength(months + 1);
      expect(new Set(keep).size).toBe(months + 1);
      expect(keep[0]).toBe('2026-06');
    }
    expect(keepMonths(TODAY, 3).at(-1)).toBe('2026-03');
    expect(keepMonths(TODAY, 12).at(-1)).toBe('2025-06');
    expect(keepMonths(TODAY, 24).at(-1)).toBe('2024-06');
  });

  it('atravessa a virada do ano', () => {
    const keep = keepMonthsDefault(at(2026, 1, 5));
    expect(keep).toContain('2025-07');
    expect(keep).not.toContain('2025-06');
    expect(keep[1]).toBe('2025-12');
  });

  it('num dia 31 não deixa fevereiro escapar do descarte', () => {
    // passar de 31/03 para "31/02" empurraria a conta de volta para março e um mês sobraria
    const keep = keepMonthsDefault(new Date(2026, 2, 31, 12).getTime());
    expect(keep).toEqual([...new Set(keep)]);
    expect(keep).toContain('2026-02');
    expect(keep).toContain('2025-09');
  });

  it('num dia 31 anda pelo dia 1 em qualquer janela: 12 e 24 meses também não repetem nem pulam mês', () => {
    const now = new Date(2026, 2, 31, 12).getTime();
    for (const months of [3, 12, 24]) {
      const keep = keepMonths(now, months);
      expect(keep).toHaveLength(months + 1);
      expect(new Set(keep).size).toBe(months + 1);
      expect(keep).toContain('2026-02');
    }
    expect(keepMonths(now, 12).at(-1)).toBe('2025-03');
    expect(keepMonths(now, 24).at(-1)).toBe('2024-03');
  });

  it('não depende do fuso: o mês é o da máquina, como o `month` gravado', () => {
    // último instante do mês no fuso local já é o mês seguinte em UTC; o marcador segue o local
    expect(keepMonthsDefault(new Date(2026, 5, 30, 23, 59).getTime())[0]).toBe('2026-06');
  });
});

describe('monthlyTotals', () => {
  it('conta os eventos do mês no total, por tipo, por fase e por tipo de card', () => {
    event(at(2026, 6), { kind: 'created' });
    event(at(2026, 6), { kind: 'column_changed' });
    event(at(2026, 6), { kind: 'column_changed', columnName: 'PRD' });
    const totals = monthlyTotals(db, boardId, ['2026-06']);

    expect(of(totals, 'events')).toMatchObject({ n: 3, total: 3 });
    expect(of(totals, 'events', 'kind', 'column_changed')).toMatchObject({ n: 2 });
    expect(of(totals, 'events', 'kind', 'created')).toMatchObject({ n: 1 });
    expect(of(totals, 'events', 'phase', 'Discovery')).toMatchObject({ n: 2 });
    expect(of(totals, 'events', 'phase', 'PRD')).toMatchObject({ n: 1 });
    expect(of(totals, 'events', 'card_type', 'História')).toMatchObject({ n: 3 });
  });

  it('as atividades concluídas são contagem direta do evento `done`, não de categoria de coluna', () => {
    event(at(2026, 6), { kind: 'done', columnName: 'Concluído' });
    event(at(2026, 6), { kind: 'done', columnName: 'Concluído', cardType: 'Bug' });
    event(at(2026, 6), { kind: 'cancelled', columnName: 'Cancelado' });
    const totals = monthlyTotals(db, boardId, ['2026-06']);

    expect(of(totals, 'cards_done')).toMatchObject({ n: 2 });
    expect(of(totals, 'cards_done', 'card_type', 'Bug')).toMatchObject({ n: 1 });
    expect(of(totals, 'cards_done', 'phase', 'Concluído')).toMatchObject({ n: 2 });
  });

  it('a unidade de `runs` é o tempo: conta as execuções e soma a duração, por todos os cortes', () => {
    run(at(2026, 6), 1000);
    run(at(2026, 6), 3000, { model: 'haiku', effort: null, profile: null });
    const totals = monthlyTotals(db, boardId, ['2026-06']);

    expect(of(totals, 'runs')).toMatchObject({ n: 2, total: 4000 });
    expect(of(totals, 'runs', 'outcome', 'done')).toMatchObject({ n: 2, total: 4000 });
    expect(of(totals, 'runs', 'model', 'opus')).toMatchObject({ n: 1, total: 1000 });
    expect(of(totals, 'runs', 'model', 'haiku')).toMatchObject({ n: 1, total: 3000 });
    expect(of(totals, 'runs', 'tool', 'claude')).toMatchObject({ n: 2 });
    expect(of(totals, 'runs', 'phase', 'Discovery')).toMatchObject({ n: 2 });
    // o não definido tem lugar próprio (''), e continua sendo uma execução contada — não um zero
    expect(of(totals, 'runs', 'effort', '')).toMatchObject({ n: 1, total: 3000 });
    expect(of(totals, 'runs', 'profile', '')).toMatchObject({ n: 1 });
  });

  it('a execução sem duração entra na contagem sem inflar o tempo', () => {
    const id = runs.start({
      boardId,
      startedAt: at(2026, 6),
      origin: 'manual',
      tool: 'claude',
      cardId: null,
      cardNumber: null,
      cardTitle: '',
      cardType: '',
      workflow: '',
      columnName: '',
      phase: '',
    });
    runs.finish(id, 'unknown');
    expect(of(monthlyTotals(db, boardId, ['2026-06']), 'runs')).toMatchObject({ n: 1, total: 0 });
  });

  it('separa os meses e devolve em ordem crescente, sem precisar da lista de meses', () => {
    event(at(2026, 5));
    event(at(2026, 6));
    event(at(2026, 6));
    const totals = monthlyTotals(db, boardId).filter((t) => t.metric === 'events' && t.dim === '');
    expect(totals.map((t) => [t.month, t.n])).toEqual([
      ['2026-05', 1],
      ['2026-06', 2],
    ]);
  });

  it('mês sem nada não aparece e não vira linha de zeros', () => {
    event(at(2026, 6));
    expect([...new Set(monthlyTotals(db, boardId).map((t) => t.month))]).toEqual(['2026-06']);
    expect(monthlyTotals(db, boardId, ['2026-01'])).toEqual([]);
  });
});

describe('consolidate', () => {
  it('RF-21: os totais arquivados são idênticos aos que o detalhe daria antes do descarte', () => {
    event(at(2024, 3), { kind: 'created' });
    event(at(2024, 3), { kind: 'done', columnName: 'Concluído' });
    run(at(2024, 3), 5000);
    const before = monthlyTotals(db, boardId, ['2024-03']);

    expect(consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS)).toEqual(['2024-03']);
    expect(events.byMonth('2024-03')).toEqual([]);
    expect(runs.byMonth('2024-03')).toEqual([]);
    expect(monthlyTotals(db, boardId, ['2024-03'])).toEqual(before);
  });

  it('RF-22 e RF-32: nove meses de detalhe ficam sete; os de dentro da janela não são tocados', () => {
    // um evento por mês, de outubro de 2025 a junho de 2026: nove meses
    for (let i = 0; i < 9; i++) event(at(2025, 10 + i));
    expect(detailMonths(db, boardId)).toHaveLength(9);

    // os seis completos (2025-12 a 2026-05) e o corrente ficam; outubro e novembro são arquivados
    expect(consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS)).toEqual(['2025-10', '2025-11']);
    expect(detailMonths(db, boardId)).toHaveLength(7);
    expect(detailMonths(db, boardId)[0]).toBe('2025-12');
    // o mês descartado continua somando, pelo arquivo
    expect(of(monthlyTotals(db, boardId, ['2025-10']), 'events')).toMatchObject({ n: 1 });
  });

  it('descarta conforme a janela recebida: com 3 meses sobram quatro marcadores, com 24 nada sai', () => {
    // um evento por mês, de outubro de 2025 a junho de 2026: nove meses
    for (let i = 0; i < 9; i++) event(at(2025, 10 + i));

    // 3 completos (2026-03 a 2026-05) e o corrente ficam; de outubro a fevereiro são arquivados
    expect(consolidate(db, boardId, TODAY, 3)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(detailMonths(db, boardId)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);

    // alargar a janela depois não traz o detalhe de volta, mas também não arquiva mais nada
    expect(consolidate(db, boardId, TODAY, 24)).toEqual([]);
    expect(detailMonths(db, boardId)).toHaveLength(4);
  });

  it('a janela de 24 meses guarda dois anos de detalhe', () => {
    event(at(2024, 6));
    event(at(2024, 5));
    expect(consolidate(db, boardId, TODAY, 24)).toEqual(['2024-05']);
    expect(detailMonths(db, boardId)).toEqual(['2024-06']);
  });

  it('os totais por mês nunca expiram: consolidar de novo não apaga arquivo nem duplica linha', () => {
    event(at(2024, 3));
    consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);
    const first = monthlyTotals(db, boardId, ['2024-03']);
    consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);
    expect(monthlyTotals(db, boardId, ['2024-03'])).toEqual(first);
  });

  it('o mês que voltou a ter detalhe vale pelo detalhe, para não contar duas vezes', () => {
    event(at(2024, 3));
    consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);
    // um evento atrasado cai num mês já arquivado
    event(at(2024, 3));
    expect(of(monthlyTotals(db, boardId, ['2024-03']), 'events')).toMatchObject({ n: 1 });
  });

  it('o inventário da execução vai por cascata quando o detalhe é descartado', () => {
    const id = run(at(2024, 3), 1000);
    db.run('INSERT INTO ai_run_usage(run_id, kind, name, calls) VALUES (?,?,?,?)', [id, 'tool', 'Bash', 7]);
    consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS);
    expect(db.exec('SELECT COUNT(*) FROM ai_run_usage')[0]!.values[0]![0]).toBe(0);
  });

  it('nada a consolidar: grava o dia e não mexe no detalhe', () => {
    event(at(2026, 6));
    expect(consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS)).toEqual([]);
    expect(events.byMonth('2026-06')).toHaveLength(1);
    expect(new BoardRepo(db).openedNow(boardId, TODAY).rollupDay).toBe('2026-06-15');
  });
});

describe('tokens, custo e inventário (#70)', () => {
  const inventory: InventoryItem[] = [
    { kind: 'tool', name: 'Read', calls: 5 },
    { kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 2 },
    { kind: 'agent', name: 'Explore', calls: 1 },
    { kind: 'skill', name: 'unit-testing', calls: 1 },
  ];

  /** março de 2024 (fora da janela): 3 execuções, 2 medidas, uma delas sem custo */
  const seedMarch = (): void => {
    runs.measure(run(at(2024, 3), 1000), measured({}, inventory));
    runs.measure(
      run(at(2024, 3), 2000, { model: 'haiku' }),
      measured({ inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: null }, [
        { kind: 'tool', name: 'Read', calls: 3 },
      ]),
    );
    runs.measure(run(at(2024, 3), 3000), notMeasured());
  };

  it('tokens: soma os quatro tipos, por todos os cortes, e `n` conta só a execução medida', () => {
    seedMarch();
    const totals = monthlyTotals(db, boardId, ['2024-03']);

    expect(of(totals, 'runs')).toMatchObject({ n: 3 });
    expect(of(totals, 'tokens')).toMatchObject({ n: 2, total: 200 });
    expect(of(totals, 'tokens', 'model', 'opus')).toMatchObject({ n: 1, total: 100 });
    expect(of(totals, 'tokens', 'model', 'haiku')).toMatchObject({ n: 1, total: 100 });
    for (const dim of ['outcome', 'phase', 'card_type', 'tool', 'effort', 'profile'])
      expect(totals.filter((t) => t.metric === 'tokens' && t.dim === dim).length).toBeGreaterThan(0);
  });

  it('cost: a execução sem custo não entra, e `n` conta só as que têm custo', () => {
    seedMarch();
    const totals = monthlyTotals(db, boardId, ['2024-03']);

    expect(of(totals, 'cost')).toMatchObject({ n: 1, total: 0.5 });
    expect(of(totals, 'cost', 'model', 'opus')).toMatchObject({ n: 1, total: 0.5 });
    expect(of(totals, 'cost', 'model', 'haiku')).toBeUndefined();
  });

  it('a execução não medida não gera linha de tokens nem de custo, e não vira zero', () => {
    runs.measure(run(at(2024, 3), 1000), notMeasured());
    const totals = monthlyTotals(db, boardId, ['2024-03']);

    expect(of(totals, 'runs')).toMatchObject({ n: 1 });
    expect(totals.filter((t) => t.metric === 'tokens' || t.metric === 'cost' || t.metric === 'usage')).toEqual([]);
  });

  it('usage: um `dim` por tipo do inventário, `value` é o nome, `n` são as execuções e `total` as chamadas', () => {
    seedMarch();
    const totals = monthlyTotals(db, boardId, ['2024-03']);

    expect(of(totals, 'usage', 'tool', 'Read')).toMatchObject({ n: 2, total: 8 });
    expect(of(totals, 'usage', 'mcp_tool', 'faz-ai/get_card')).toMatchObject({ n: 1, total: 2 });
    expect(of(totals, 'usage', 'agent', 'Explore')).toMatchObject({ n: 1, total: 1 });
    expect(of(totals, 'usage', 'skill', 'unit-testing')).toMatchObject({ n: 1, total: 1 });
  });

  it('o inventário de um mês não entra no total de outro', () => {
    runs.measure(run(at(2024, 3), 1000), measured({}, inventory));
    runs.measure(run(at(2024, 4), 1000), measured({}, [{ kind: 'tool', name: 'Read', calls: 1 }]));

    expect(of(monthlyTotals(db, boardId, ['2024-04']), 'usage', 'tool', 'Read')).toMatchObject({ n: 1, total: 1 });
  });

  it('o arquivo guarda o mesmo que o detalhe daria: tokens, custo e inventário sobrevivem ao descarte', () => {
    seedMarch();
    const before = monthlyTotals(db, boardId, ['2024-03']);

    expect(consolidate(db, boardId, TODAY, DEFAULT_LOG_RETENTION_MONTHS)).toEqual(['2024-03']);
    expect(runs.byMonth('2024-03')).toEqual([]);
    expect(db.exec('SELECT COUNT(*) FROM ai_run_usage')[0]!.values[0]![0]).toBe(0);

    const after = monthlyTotals(db, boardId, ['2024-03']);
    expect(after).toEqual(before);
    expect(of(after, 'tokens')).toMatchObject({ n: 2, total: 200 });
    expect(of(after, 'cost')).toMatchObject({ n: 1, total: 0.5 });
    expect(of(after, 'usage', 'tool', 'Read')).toMatchObject({ n: 2, total: 8 });
  });

  it('RF-21 de #37 não regride: num mês com detalhe, os totais de `runs` e `events` continuam batendo', () => {
    event(at(2026, 6));
    runs.measure(run(at(2026, 6), 4000), measured({}, inventory));
    const totals = monthlyTotals(db, boardId, ['2026-06']);

    expect(of(totals, 'events')).toMatchObject({ n: 1, total: 1 });
    expect(of(totals, 'runs')).toMatchObject({ n: 1, total: 4000 });
    expect(of(totals, 'tokens')).toMatchObject({ n: 1, total: 100 });
  });
});

describe('a consolidação na abertura do board', () => {
  /** o que o `boardHost` decide na abertura: roda a consolidação só quando o dia virou */
  const openBoard = (now: number): string[] => {
    const boards = new BoardRepo(db);
    const { rollupDay } = boards.openedNow(boardId, now);
    const day = new Date(now);
    const today = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return rollupDay === today ? [] : consolidate(db, boardId, now, boards.retentionMonths(boardId));
  };

  it('RF-23: abrir duas vezes no mesmo dia consolida uma vez; no dia seguinte consolida de novo', () => {
    event(at(2024, 3));
    event(at(2024, 4));
    expect(openBoard(TODAY)).toEqual(['2024-03', '2024-04']);
    // nada mudou, mas o ponto é não repetir o trabalho no mesmo dia
    expect(openBoard(TODAY + 60_000)).toEqual([]);
    expect(openBoard(at(2026, 6, 16))).toEqual([]);
    expect(new BoardRepo(db).openedNow(boardId, TODAY).rollupDay).toBe('2026-06-16');
  });

  it('RF-24: num board que já existia antes do log, a série começa na primeira abertura', () => {
    db.run('UPDATE boards SET log_since = 0 WHERE id = ?', [boardId]);
    const boards = new BoardRepo(db);
    expect(boards.openedNow(boardId, TODAY).logSince).toBe(TODAY);
    // a abertura seguinte não move o início da série
    expect(boards.openedNow(boardId, TODAY + 86_400_000).logSince).toBe(TODAY);
  });

  it('RF-24: num board criado agora, a série começa na criação', () => {
    expect(new BoardRepo(db).openedNow(boardId, TODAY + 86_400_000).logSince).toBe(TODAY);
  });
});
