import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { getPanelMetrics } from '../src/extension/log/metrics';
import { BoardRepo } from '../src/extension/repositories/boardRepo';
import type { CardEventKind, InventoryKind } from '../src/shared/log';
import type { MetricsDwell, MetricsPanelQuery } from '../src/shared/metrics';

// #172: os tempos (permanência por fase e lead time) e o inventário em `getPanelMetrics` (#105). As
// regras finas dos tempos têm teste puro em test/logTimes.test.ts; aqui o que importa é a consulta:
// que linhas chegam a `phaseDwell`/`leadTimes`, com que período, e o inventário do JOIN. A montagem é a
// de test/panelMetrics.test.ts.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
/** data fixa de referência: 15 de julho de 2026, meio-dia, no fuso da máquina */
const TODAY = new Date(2026, 6, 15, 12, 0, 0).getTime();
const at = (year: number, month: number, day = 10) => new Date(year, month - 1, day, 12, 0, 0).getTime();
const JUNE: MetricsPanelQuery = { startDate: '2026-06-01', endDate: '2026-06-30' };

let db: Database;
let boardId: string;
let runs: AiRunRepo;
let events: CardEventRepo;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  db = await openInMemory(WASM_DIR);
  boardId = new BoardRepo(db).getOrCreate('ws', 'Projeto').id;
  runs = new AiRunRepo(db);
  events = new CardEventRepo(db);
  db.run('UPDATE boards SET log_since = ? WHERE id = ?', [at(2026, 1, 1), boardId]);
});

afterEach(() => vi.useRealTimers());

interface EventOpts {
  from?: string;
  to?: string;
  workflow?: string;
  title?: string;
}

function ev(when: number, kind: CardEventKind, card: number, opts: EventOpts = {}): void {
  events.add({
    boardId,
    at: when,
    kind,
    cardId: `c${card}`,
    cardNumber: card,
    cardTitle: opts.title ?? `Card ${card}`,
    cardType: 'História',
    workflow: opts.workflow ?? 'Histórias',
    columnName: opts.to ?? '',
    fromValue: opts.from ?? '',
    toValue: opts.to ?? '',
    subject: '',
    author: 'pessoa',
    source: 'human',
    runId: null,
  });
}

/** Uma execução medida com o inventário dado (o caminho real: `AiRunRepo.measure`). */
function runWith(startedAt: number, inventory: { kind: InventoryKind; name: string; calls: number }[], workflow = 'Histórias'): void {
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
    workflow,
    columnName: 'Implementação',
    phase: 'Implementação',
  });
  vi.setSystemTime(startedAt + 1000);
  runs.finish(id, 'done', 0);
  runs.measure(id, {
    measure: 'full',
    consumption: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: 1,
      sessionId: null,
      costUsd: null,
      costEstimated: true,
    },
    inventory,
    answer: '',
    reason: null,
  });
  vi.setSystemTime(TODAY);
}

function sections(query: MetricsPanelQuery = JUNE) {
  const s = getPanelMetrics(db, boardId, query, TODAY).sections;
  if (!s) throw new Error('sem sections');
  return s;
}

const phase = (dwell: MetricsDwell[], name: string): MetricsDwell => {
  const found = dwell.find((d) => d.phase === name);
  if (!found) throw new Error(`fase ${name} fora da lista`);
  return found;
};

describe('getPanelMetrics: permanência por fase', () => {
  it('RF-14: entrada anterior ao período é conhecida; anterior ao horizonte é desconhecida', () => {
    // card 1 entrou em "A fazer" em maio (antes do período, dentro do horizonte) e saiu em junho
    ev(at(2026, 5, 20), 'created', 1, { to: 'A fazer' });
    ev(at(2026, 6, 5), 'column_changed', 1, { from: 'A fazer', to: 'Em andamento' });
    // card 2 saiu de "A fazer" sem `created` no log: a entrada está fora do horizonte
    ev(at(2026, 6, 10), 'column_changed', 2, { from: 'A fazer', to: 'Em andamento' });

    const aFazer = phase(sections().dwell, 'A fazer');
    expect(aFazer.permanences).toBe(1);
    expect(aFazer.medianMs).toBe(at(2026, 6, 5) - at(2026, 5, 20));
    expect(aFazer.meanMs).toBe(at(2026, 6, 5) - at(2026, 5, 20));
    expect(aFazer.unknown).toBe(1);
  });

  it('RF-14: encurtar o período não encurta a varredura', () => {
    ev(at(2026, 5, 20), 'created', 1, { to: 'A fazer' });
    ev(at(2026, 6, 5), 'column_changed', 1, { from: 'A fazer', to: 'Em andamento' });
    const aFazer = phase(sections({ startDate: '2026-06-05', endDate: '2026-06-05' }).dwell, 'A fazer');
    expect(aFazer.permanences).toBe(1);
    expect(aFazer.unknown).toBe(0);
    expect(aFazer.medianMs).toBe(at(2026, 6, 5) - at(2026, 5, 20));
  });

  it('fase sem permanência terminada no período continua na lista, com mediana null', () => {
    ev(at(2026, 6, 2), 'created', 1, { to: 'A fazer' });
    ev(at(2026, 6, 5), 'column_changed', 1, { from: 'A fazer', to: 'Em andamento' });
    const emAndamento = phase(sections().dwell, 'Em andamento');
    expect(emAndamento).toEqual({ phase: 'Em andamento', permanences: 0, meanMs: null, medianMs: null, unknown: 0, openNow: 1 });
  });

  it('card na lixeira fecha a permanência ali e não fica em "aqui agora"', () => {
    ev(at(2026, 6, 2), 'created', 3, { to: 'A fazer' });
    ev(at(2026, 6, 4), 'trashed', 3);
    const aFazer = phase(sections().dwell, 'A fazer');
    expect(aFazer.permanences).toBe(1);
    expect(aFazer.medianMs).toBe(at(2026, 6, 4) - at(2026, 6, 2));
    expect(aFazer.openNow).toBe(0);
  });

  it('movimentação depois do fim do período fica de fora', () => {
    ev(at(2026, 6, 2), 'created', 1, { to: 'A fazer' });
    ev(at(2026, 7, 2), 'column_changed', 1, { from: 'A fazer', to: 'Em andamento' });
    const dwell = sections().dwell;
    expect(phase(dwell, 'A fazer')).toMatchObject({ permanences: 0, openNow: 1 });
    expect(dwell.find((d) => d.phase === 'Em andamento')).toBeUndefined();
  });

  it('RF-34: o filtro de workflow do painel separa as movimentações', () => {
    ev(at(2026, 6, 2), 'created', 1, { to: 'A fazer' });
    ev(at(2026, 6, 3), 'created', 2, { to: 'Backlog', workflow: 'Sub-tarefas' });
    expect(sections({ ...JUNE, workflow: 'Sub-tarefas' }).dwell.map((d) => d.phase)).toEqual(['Backlog']);
  });
});

describe('getPanelMetrics: lead time', () => {
  it('RF-16 e RF-17: conhecido, desconhecido e só a primeira conclusão conta', () => {
    ev(at(2026, 5, 1), 'created', 4);
    ev(at(2026, 6, 10), 'done', 4, { title: 'Quatro renomeado' });
    // concluído sem `created` no horizonte
    ev(at(2026, 6, 12), 'done', 5);
    // primeira conclusão em maio, fora do período: concluir de novo em junho não o traz
    ev(at(2026, 5, 2), 'created', 6);
    ev(at(2026, 5, 30), 'done', 6);
    ev(at(2026, 6, 15), 'done', 6);

    const lead = sections().lead;
    expect(lead.counted).toBe(1);
    expect(lead.unknown).toBe(1);
    expect(lead.medianMs).toBe(at(2026, 6, 10) - at(2026, 5, 1));
    expect(lead.omitted).toBe(0);
    expect(lead.rows).toEqual([
      { cardNumber: 5, title: 'Card 5', leadMs: null, doneAt: at(2026, 6, 12) },
      { cardNumber: 4, title: 'Quatro renomeado', leadMs: at(2026, 6, 10) - at(2026, 5, 1), doneAt: at(2026, 6, 10) },
    ]);
  });

  it('RF-34: o filtro de workflow separa o lead time das histórias do das sub-tarefas', () => {
    ev(at(2026, 6, 1), 'created', 7, { workflow: 'Sub-tarefas' });
    ev(at(2026, 6, 3), 'done', 7, { workflow: 'Sub-tarefas' });
    ev(at(2026, 6, 4), 'done', 8);
    expect(sections({ ...JUNE, workflow: 'Sub-tarefas' }).lead.rows.map((r) => r.cardNumber)).toEqual([7]);
    expect(sections({ ...JUNE, workflow: 'Histórias' }).lead.rows.map((r) => r.cardNumber)).toEqual([8]);
  });
});

describe('getPanelMetrics: inventário', () => {
  it('RF-27: measured falso num board que nunca teve linha', () => {
    expect(sections().inventory).toEqual({ measured: false, tools: [], mcpTools: [], agents: [], skills: [] });
  });

  it('RF-25 e RF-26: os quatro grupos, com o servidor separado do nome', () => {
    runWith(at(2026, 6, 2), [
      { kind: 'tool', name: 'Read', calls: 3 },
      { kind: 'mcp_tool', name: 'mcp__faz-ai__get_card', calls: 2 },
      { kind: 'mcp_tool', name: 'semservidor', calls: 1 },
      { kind: 'agent', name: 'Explore', calls: 1 },
      { kind: 'skill', name: 'sql-queries', calls: 1 },
    ]);
    runWith(at(2026, 6, 3), [
      { kind: 'tool', name: 'Read', calls: 1 },
      { kind: 'tool', name: 'Bash', calls: 5 },
    ]);
    const inv = sections().inventory;
    expect(inv.measured).toBe(true);
    expect(inv.tools).toEqual([
      { name: 'Bash', server: '', runs: 1, calls: 5 },
      { name: 'Read', server: '', runs: 2, calls: 4 },
    ]);
    expect(inv.mcpTools).toEqual([
      { name: 'get_card', server: 'faz-ai', runs: 1, calls: 2 },
      { name: 'semservidor', server: '', runs: 1, calls: 1 },
    ]);
    expect(inv.agents).toEqual([{ name: 'Explore', server: '', runs: 1, calls: 1 }]);
    expect(inv.skills).toEqual([{ name: 'sql-queries', server: '', runs: 1, calls: 1 }]);
  });

  it('RF-27: com linha fora do período, measured verdadeiro e os grupos vazios', () => {
    runWith(at(2026, 5, 2), [{ kind: 'tool', name: 'Read', calls: 1 }]);
    expect(sections().inventory).toEqual({ measured: true, tools: [], mcpTools: [], agents: [], skills: [] });
  });

  it('o filtro de workflow do painel vale também para o inventário', () => {
    runWith(at(2026, 6, 2), [{ kind: 'tool', name: 'Read', calls: 1 }], 'Histórias');
    runWith(at(2026, 6, 3), [{ kind: 'tool', name: 'Bash', calls: 1 }], 'Sub-tarefas');
    expect(sections({ ...JUNE, workflow: 'Sub-tarefas' }).inventory.tools.map((t) => t.name)).toEqual(['Bash']);
  });
});

describe('getPanelMetrics: período sem dado', () => {
  it('RF-32: as três seções vêm vazias, sem zeros inventados', () => {
    const s = sections();
    expect(s.dwell).toEqual([]);
    expect(s.lead).toEqual({ medianMs: null, meanMs: null, counted: 0, unknown: 0, rows: [], omitted: 0 });
    expect(s.inventory.measured).toBe(false);
  });

  it('recorte inteiro antes do início da série: seções vazias', () => {
    ev(at(2026, 6, 2), 'created', 1, { to: 'A fazer' });
    db.run('UPDATE boards SET log_since = ? WHERE id = ?', [at(2026, 7, 1), boardId]);
    const s = sections({ startDate: '2026-06-01', endDate: '2026-06-10' });
    expect(s.dwell).toEqual([]);
    expect(s.lead.rows).toEqual([]);
  });
});

describe('getPanelMetrics: card arquivado nos tempos (revisão 0.32.0)', () => {
  it('a consulta traz archived: card arquivado sai de "aqui agora"', () => {
    ev(at(2026, 6, 2), 'created', 1, { to: 'A fazer' });
    ev(at(2026, 6, 5), 'archived', 1);
    const dwell = sections(JUNE).dwell;
    expect(dwell.find((d) => d.phase === 'A fazer')).toMatchObject({ permanences: 1, openNow: 0 });
  });
});
