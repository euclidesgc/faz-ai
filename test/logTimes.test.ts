// Os tempos do painel (`times.ts`): permanência por fase e lead time, sobre linhas montadas à mão.
// Funções puras, então nada de banco aqui — o que se fixa são as regras da Spec de #105: cada
// passagem é uma permanência (RF-12), a fase atual fica fora da média (RF-13), saída sem entrada é
// desconhecida (RF-14), lead time até a primeira conclusão (RF-17) e desconhecido nunca vira 0
// (RF-16, RF-32).
import { describe, expect, it } from 'vitest';
import type { CardEventKind } from '../src/shared/log';
import { leadTimes, phaseDwell, type MetricsDwell, type TimesEventRow, type TimesPeriod } from '../src/extension/log/times';

const H = 60 * 60 * 1000;

function ev(
  cardNumber: number,
  at: number,
  kind: CardEventKind,
  fromValue = '',
  toValue = '',
  cardTitle = `Card ${cardNumber}`,
): TimesEventRow {
  return { cardNumber, at, kind, fromValue, toValue, cardTitle };
}

/** Período largo o bastante para conter tudo dos testes que não falam de período. */
const ALL: TimesPeriod = { start: 0, end: 1000 * H };

function phase(result: MetricsDwell[], name: string): MetricsDwell {
  const found = result.find((d) => d.phase === name);
  if (!found) throw new Error(`fase ${name} ausente em ${JSON.stringify(result)}`);
  return found;
}

describe('phaseDwell', () => {
  it('conta duas passagens pela mesma fase como duas permanências, não uma soma (RF-12)', () => {
    const rows = [
      ev(1, 0, 'created', '', 'A'),
      ev(1, 2 * H, 'column_changed', 'A', 'B'),
      ev(1, 3 * H, 'column_changed', 'B', 'A'),
      ev(1, 9 * H, 'column_changed', 'A', 'C'),
    ];
    const a = phase(phaseDwell(rows, ALL), 'A');
    expect(a.permanences).toBe(2);
    expect(a.meanMs).toBe(4 * H); // (2h + 6h) / 2
    expect(a.medianMs).toBe(4 * H);
    expect(phase(phaseDwell(rows, ALL), 'B').permanences).toBe(1);
  });

  it('deixa a permanência aberta fora da média e a conta em openNow (RF-13)', () => {
    const rows = [
      ev(1, 0, 'created', '', 'A'),
      ev(1, 1 * H, 'column_changed', 'A', 'B'),
      // card 2 está parado em A há muito tempo: não pode puxar a média de A
      ev(2, 0, 'created', '', 'A'),
    ];
    const result = phaseDwell(rows, ALL);
    const a = phase(result, 'A');
    expect(a.permanences).toBe(1);
    expect(a.meanMs).toBe(1 * H);
    expect(a.openNow).toBe(1);
    const b = phase(result, 'B');
    expect(b.openNow).toBe(1);
    expect(b.permanences).toBe(0);
    expect(b.meanMs).toBeNull();
    expect(b.medianMs).toBeNull();
  });

  it('transforma a saída sem entrada em permanência desconhecida na fase do fromValue (RF-14)', () => {
    const rows = [ev(1, 5 * H, 'column_changed', 'A', 'B'), ev(1, 7 * H, 'column_changed', 'B', 'C')];
    const result = phaseDwell(rows, ALL);
    const a = phase(result, 'A');
    expect(a.unknown).toBe(1);
    expect(a.permanences).toBe(0);
    expect(a.meanMs).toBeNull(); // nunca zero nem curta
    expect(phase(result, 'B').meanMs).toBe(2 * H); // a próxima, com entrada conhecida, conta
    expect(phase(result, 'C').openNow).toBe(1);
  });

  it('fecha a permanência em trashed e deleted sem abrir outra', () => {
    const rows = [
      ev(1, 0, 'created', '', 'A'),
      ev(1, 3 * H, 'trashed'),
      ev(2, 0, 'created', '', 'A'),
      ev(2, 1 * H, 'column_changed', 'A', 'B'),
      ev(2, 6 * H, 'deleted'),
    ];
    const result = phaseDwell(rows, ALL);
    const a = phase(result, 'A');
    expect(a.permanences).toBe(2);
    expect(a.openNow).toBe(0); // card da lixeira não está "aqui agora"
    expect(a.medianMs).toBe(2 * H); // (3h + 1h) / 2
    const b = phase(result, 'B');
    expect(b.permanences).toBe(1);
    expect(b.meanMs).toBe(5 * H);
    expect(b.openNow).toBe(0);
  });

  it('atribui a permanência ao período pela saída, com a entrada podendo ser anterior', () => {
    const rows = [
      ev(1, 0, 'created', '', 'A'),
      ev(1, 10 * H, 'column_changed', 'A', 'B'), // sai de A dentro do período
      ev(1, 30 * H, 'column_changed', 'B', 'C'), // sai de B depois do período
      ev(2, 6 * H, 'created', '', 'A'),
      ev(2, 7 * H, 'column_changed', 'A', 'B'), // sai de A antes do período
    ];
    const period: TimesPeriod = { start: 8 * H, end: 20 * H };
    const result = phaseDwell(rows, period);
    const a = phase(result, 'A');
    expect(a.permanences).toBe(1);
    expect(a.meanMs).toBe(10 * H); // a entrada às 0h, fora do período, ainda é conhecida
    // no fim do período os dois cards estão em B; a saída das 30h fica fora da varredura
    const b = phase(result, 'B');
    expect(b.permanences).toBe(0);
    expect(b.openNow).toBe(2);
    expect(result.find((d) => d.phase === 'C')).toBeUndefined();
  });

  it('não conta desconhecida cuja saída cai fora do período', () => {
    const rows = [ev(1, 2 * H, 'column_changed', 'A', 'B')];
    const result = phaseDwell(rows, { start: 5 * H, end: 10 * H });
    expect(result.find((d) => d.phase === 'A')).toBeUndefined();
    expect(phase(result, 'B').openNow).toBe(1);
  });

  it('mediana com número ímpar é o valor central; com número par, a média dos dois centrais', () => {
    const passes = (durations: number[]) =>
      durations.flatMap((d, i) => [ev(i + 1, 0, 'created', '', 'A'), ev(i + 1, d, 'column_changed', 'A', 'B')]);
    const odd = phase(phaseDwell(passes([1 * H, 9 * H, 2 * H]), ALL), 'A');
    expect(odd.medianMs).toBe(2 * H);
    expect(odd.meanMs).toBe(4 * H);
    const even = phase(phaseDwell(passes([1 * H, 10 * H, 2 * H, 5 * H]), ALL), 'A');
    expect(even.medianMs).toBe(3.5 * H); // (2h + 5h) / 2, não 2h nem 5h
    expect(even.meanMs).toBe(4.5 * H);
  });

  it('ordena as linhas por at antes de parear, mesmo que cheguem fora de ordem', () => {
    const rows = [ev(1, 4 * H, 'column_changed', 'A', 'B'), ev(1, 0, 'created', '', 'A')];
    const a = phase(phaseDwell(rows, ALL), 'A');
    expect(a.permanences).toBe(1);
    expect(a.unknown).toBe(0);
    expect(a.meanMs).toBe(4 * H);
  });

  it('ignora os eventos que não são de movimentação e devolve as fases na ordem de aparição', () => {
    const rows = [
      ev(1, 0, 'created', '', 'Backlog'),
      ev(1, 1 * H, 'comment'),
      ev(1, 2 * H, 'column_changed', 'Backlog', 'Feito'),
      ev(1, 2 * H, 'done'),
    ];
    expect(phaseDwell(rows, ALL).map((d) => d.phase)).toEqual(['Backlog', 'Feito']);
    expect(phase(phaseDwell(rows, ALL), 'Backlog').meanMs).toBe(2 * H);
  });

  it('sem nenhuma linha devolve lista vazia', () => {
    expect(phaseDwell([], ALL)).toEqual([]);
  });

  it('só desconhecidas no período: média e mediana null, nunca 0 (RF-32)', () => {
    const rows = [ev(1, 1 * H, 'column_changed', 'A', 'B'), ev(2, 2 * H, 'column_changed', 'A', 'B')];
    expect(phase(phaseDwell(rows, ALL), 'A')).toEqual({
      phase: 'A',
      permanences: 0,
      meanMs: null,
      medianMs: null,
      unknown: 2,
      openNow: 0,
    });
  });
});

describe('leadTimes', () => {
  it('mede da criação até a primeira conclusão, mesmo com reabertura no meio (RF-17)', () => {
    const rows = [ev(1, 0, 'created'), ev(1, 10 * H, 'done'), ev(1, 20 * H, 'done')];
    const lead = leadTimes(rows, ALL);
    expect(lead.rows).toEqual([{ cardNumber: 1, title: 'Card 1', leadMs: 10 * H, doneAt: 10 * H }]);
    expect(lead.counted).toBe(1);
    expect(lead.medianMs).toBe(10 * H);
  });

  it('sem created o lead time é null, nunca 0, e fica fora da mediana e da média (RF-16)', () => {
    const rows = [ev(1, 0, 'created'), ev(1, 4 * H, 'done'), ev(2, 5 * H, 'done')];
    const lead = leadTimes(rows, ALL);
    const unknown = lead.rows.find((r) => r.cardNumber === 2)!;
    expect(unknown.leadMs).toBeNull();
    expect(unknown.leadMs).not.toBe(0);
    expect(lead.unknown).toBe(1);
    expect(lead.counted).toBe(1);
    expect(lead.medianMs).toBe(4 * H);
    expect(lead.meanMs).toBe(4 * H);
  });

  it('nenhum lead time conhecido no período: mediana e média null (RF-32)', () => {
    const lead = leadTimes([ev(1, 5 * H, 'done'), ev(2, 6 * H, 'done')], ALL);
    expect(lead).toMatchObject({ medianMs: null, meanMs: null, counted: 0, unknown: 2, omitted: 0 });
    expect(lead.rows).toHaveLength(2);
  });

  it('sem nenhuma conclusão no período devolve tudo vazio', () => {
    expect(leadTimes([ev(1, 0, 'created')], ALL)).toEqual({ medianMs: null, meanMs: null, counted: 0, unknown: 0, rows: [], omitted: 0 });
  });

  it('o card entra no período pela primeira conclusão, não pela segunda', () => {
    const rows = [
      ev(1, 0, 'created'),
      ev(1, 2 * H, 'done'), // primeira conclusão antes do período
      ev(1, 12 * H, 'done'), // reconclusão dentro dele: não traz o card
      ev(2, 1 * H, 'created'),
      ev(2, 11 * H, 'done'),
    ];
    const lead = leadTimes(rows, { start: 10 * H, end: 20 * H });
    expect(lead.rows.map((r) => r.cardNumber)).toEqual([2]);
    expect(lead.medianMs).toBe(10 * H);
  });

  it('mediana com número par de cards é a média dos dois centrais', () => {
    const rows = [1, 3, 6, 10].flatMap((d, i) => [ev(i + 1, 0, 'created'), ev(i + 1, d * H, 'done')]);
    const lead = leadTimes(rows, ALL);
    expect(lead.medianMs).toBe(4.5 * H); // (3h + 6h) / 2
    expect(lead.meanMs).toBe(5 * H);
  });

  it('usa o título do evento mais recente do card', () => {
    const rows = [ev(1, 0, 'created', '', '', 'Nome antigo'), ev(1, 3 * H, 'done', '', '', 'Nome novo')];
    expect(leadTimes(rows, ALL).rows[0]!.title).toBe('Nome novo');
  });

  it('ordena da conclusão mais recente para a mais antiga e conta o que passa do teto em omitted', () => {
    const rows = [1, 2, 3].flatMap((n) => [ev(n, 0, 'created'), ev(n, n * H, 'done')]);
    const lead = leadTimes(rows, ALL, 2);
    expect(lead.rows.map((r) => r.cardNumber)).toEqual([3, 2]);
    expect(lead.omitted).toBe(1);
    // o card cortado da lista continua na conta
    expect(lead.counted).toBe(3);
    expect(lead.medianMs).toBe(2 * H);
  });
});

describe('phaseDwell: arquivar e desarquivar (revisão 0.32.0)', () => {
  it('archived fecha a permanência sem abrir outra: card arquivado não fica "aqui agora" para sempre', () => {
    const rows = [ev(1, 0, 'created', '', 'A'), ev(1, 2 * H, 'column_changed', 'A', 'B'), ev(1, 5 * H, 'archived')];
    const b = phase(phaseDwell(rows, ALL), 'B');
    expect(b.openNow).toBe(0);
    expect(b.permanences).toBe(1);
    expect(b.meanMs).toBe(3 * H);
  });

  it('unarchived e restored voltam sem permanência aberta: a próxima saída é desconhecida', () => {
    const rows = [
      ev(1, 0, 'created', '', 'A'),
      ev(1, 1 * H, 'archived'),
      ev(1, 4 * H, 'unarchived'),
      ev(1, 6 * H, 'column_changed', 'A', 'B'),
      ev(2, 0, 'created', '', 'A'),
      ev(2, 1 * H, 'trashed'),
      ev(2, 2 * H, 'restored'),
      ev(2, 3 * H, 'column_changed', 'A', 'B'),
    ];
    const result = phaseDwell(rows, ALL);
    const a = phase(result, 'A');
    expect(a.permanences).toBe(2); // 1h de cada card, até arquivar/apagar
    expect(a.unknown).toBe(2); // a saída depois da volta não tem entrada conhecida
    expect(a.openNow).toBe(0);
    expect(phase(result, 'B').openNow).toBe(2);
  });

  it('restored sem archived/trashed antes (o evento de saída se perdeu): descarta a aberta, não a conta', () => {
    const rows = [ev(1, 0, 'created', '', 'A'), ev(1, 5 * H, 'restored'), ev(1, 6 * H, 'column_changed', 'A', 'B')];
    const a = phase(phaseDwell(rows, ALL), 'A');
    expect(a.permanences).toBe(0);
    expect(a.unknown).toBe(1);
  });
});
