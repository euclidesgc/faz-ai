// Os tempos do painel de métricas: permanência por fase e lead time por card. Funções puras sobre
// linhas de `card_events` já lidas — nunca recebem `Database`. Quem traz as linhas do banco é
// `getPanelMetrics` (passo 8 do plano de #105); aqui só o pareamento dos eventos e as contas.
//
// Por que não é SQL agregado: a Spec mediu agregar com `LEAD()` no banco (40 contra 44 ms, empate) e
// a consulta agregada PERDE A MEDIANA — devolve uma linha por fase, não os valores individuais —,
// além de levar para dentro de `CASE` as regras de "desconhecida", "aberta", `trashed` e atribuição
// ao período. Não "melhore" isto para uma consulta agregada.
//
// Desconhecido é `null` (ou uma contagem à parte), nunca 0: RF-14, RF-16 e RF-32.
import type { CardEventKind } from '../../shared/log';

/** O mínimo de uma linha de `card_events` de que os tempos precisam. */
export interface TimesEventRow {
  cardNumber: number;
  at: number;
  kind: CardEventKind;
  fromValue: string;
  toValue: string;
  cardTitle: string;
}

/** Período em ms, meio aberto: `start` <= at < `end` (o mesmo `at < ?` da consulta da Spec). */
export interface TimesPeriod {
  start: number;
  end: number;
}

// Os três tipos abaixo são os de `src/shared/metrics.ts` na Spec de #105, com os nomes e campos
// exatos dela. Moram aqui provisoriamente: sobem para o contrato compartilhado na sub-tarefa #170, e
// este arquivo passa a importá-los de lá.

/** Uma fase nos tempos. `permanences` conta passagens, não cards (RF-12). */
export interface MetricsDwell {
  phase: string;
  permanences: number;
  meanMs: number | null;
  medianMs: number | null;
  /** permanências cuja entrada está fora do horizonte do detalhe (RF-14) */
  unknown: number;
  /** cards que estão nesta fase agora: contados, fora da média (RF-13) */
  openNow: number;
}

export interface MetricsLead {
  medianMs: number | null;
  meanMs: number | null;
  counted: number;
  /** concluídos sem `created` no horizonte: detalhe descartado ou card anterior ao log (RF-16) */
  unknown: number;
  rows: MetricsLeadRow[];
  /** cards concluídos além do teto de linhas; nunca somados, só contados (RF-33) */
  omitted: number;
}

export interface MetricsLeadRow {
  cardNumber: number;
  title: string;
  /** null = DESCONHECIDO, nunca 0 (RF-16) */
  leadMs: number | null;
  doneAt: number;
}

/** Média dos valores; `null` sem nenhum valor (RF-32: nada medido não é média zero). */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Mediana; com número par de valores é a média dos dois centrais. `null` sem nenhum valor. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Agrupa as linhas por card, cada grupo em ordem de `at` (empate: a ordem em que chegaram). */
function byCard(rows: TimesEventRow[]): Map<number, TimesEventRow[]> {
  const cards = new Map<number, TimesEventRow[]>();
  for (const r of rows) {
    const list = cards.get(r.cardNumber);
    if (list) list.push(r);
    else cards.set(r.cardNumber, [r]);
  }
  // `sort` é estável: dois eventos no mesmo ms ficam na ordem da gravação.
  for (const list of cards.values()) list.sort((a, b) => a.at - b.at);
  return cards;
}

interface PhaseAcc {
  durations: number[];
  unknown: number;
  openNow: number;
}

/**
 * Permanência por fase no período. Varre cada card em ordem de `at`:
 * - `created` abre uma permanência em `toValue`;
 * - `column_changed` fecha a aberta (a fase é a do `fromValue`) e abre uma em `toValue`; sem
 *   permanência aberta, a saída vira uma permanência DESCONHECIDA na fase do `fromValue` — a entrada
 *   ficou fora do horizonte do detalhe (RF-14);
 * - `trashed` e `deleted` fecham a aberta sem abrir outra: o card saiu do fluxo. É uma escolha (a
 *   alternativa poria cards da lixeira em "está aqui agora"); por consequência, um card restaurado
 *   volta sem permanência aberta e a próxima saída dele conta como desconhecida;
 * - o que continua aberto no fim do período é "o card está nesta fase agora": conta em `openNow`,
 *   fora da média (RF-13).
 *
 * Uma permanência pertence ao período quando a SAÍDA dela cai no período; a entrada pode ser
 * anterior e ainda assim conhecida. Por isso as linhas devem cobrir todo o horizonte do detalhe até o
 * fim do período, não só o período. Linhas com `at` >= `period.end` são ignoradas. Cada passagem pela
 * fase é uma permanência, inclusive o retorno (RF-12).
 *
 * Devolve uma entrada por fase que teve alguma permanência terminada, desconhecida ou aberta no
 * período, na ordem em que a fase aparece pela primeira vez na varredura cronológica (que tende a ser
 * a ordem do workflow, já que os cards nascem na primeira coluna).
 */
export function phaseDwell(rows: TimesEventRow[], period: TimesPeriod): MetricsDwell[] {
  const relevant = rows.filter(
    (r) => r.at < period.end && (r.kind === 'created' || r.kind === 'column_changed' || r.kind === 'trashed' || r.kind === 'deleted'),
  );
  const inPeriod = (at: number) => at >= period.start && at < period.end;

  // A ordem das fases é a da primeira aparição em ordem cronológica global, não por card.
  const firstSeen = new Map<string, number>();
  for (const r of [...relevant].sort((a, b) => a.at - b.at)) {
    for (const phase of r.kind === 'column_changed' ? [r.fromValue, r.toValue] : r.kind === 'created' ? [r.toValue] : []) {
      if (!firstSeen.has(phase)) firstSeen.set(phase, firstSeen.size);
    }
  }

  const phases = new Map<string, PhaseAcc>();
  const acc = (phase: string): PhaseAcc => {
    let a = phases.get(phase);
    if (!a) phases.set(phase, (a = { durations: [], unknown: 0, openNow: 0 }));
    return a;
  };

  for (const events of byCard(relevant).values()) {
    let open: { phase: string; since: number } | null = null;
    for (const e of events) {
      if (e.kind === 'created') {
        // `created` duplicado não tem saída conhecida para o que estava aberto: descarta e recomeça.
        open = { phase: e.toValue, since: e.at };
      } else if (e.kind === 'column_changed') {
        if (inPeriod(e.at)) {
          if (open) acc(e.fromValue).durations.push(e.at - open.since);
          else acc(e.fromValue).unknown += 1;
        }
        open = { phase: e.toValue, since: e.at };
      } else {
        // trashed / deleted: fecha a aberta sem abrir outra. A permanência terminada conta no período.
        if (open && inPeriod(e.at)) acc(open.phase).durations.push(e.at - open.since);
        open = null;
      }
    }
    if (open) acc(open.phase).openNow += 1;
  }

  return [...phases.entries()]
    .sort(([a], [b]) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0))
    .map(([phase, a]) => ({
      phase,
      permanences: a.durations.length,
      meanMs: mean(a.durations),
      medianMs: median(a.durations),
      unknown: a.unknown,
      openNow: a.openNow,
    }));
}

/**
 * Lead time por card: de `created` até a PRIMEIRA conclusão (`done`), RF-17 — concluir de novo depois
 * de reaberto não cria um segundo lead time nem substitui o primeiro. O card entra no período quando a
 * primeira conclusão cai nele. Sem `created` nas linhas (o mês foi descartado ou o card é anterior ao
 * log), `leadMs` é `null` = DESCONHECIDO, nunca 0 (RF-16): contado em `unknown`, fora da mediana e da
 * média. Nenhum valor conhecido ⇒ `medianMs` e `meanMs` `null` (RF-32).
 *
 * O título é o do evento mais recente do card (o mesmo `card_title` com `MAX(at)` da consulta da Spec).
 * `rows` vem da conclusão mais recente para a mais antiga e é cortado em `cap` linhas (o chamador passa
 * `METRICS_ROW_CAP`); as que ficam fora são contadas em `omitted` mas entram na mediana e na média.
 */
export function leadTimes(rows: TimesEventRow[], period: TimesPeriod, cap = Infinity): MetricsLead {
  const all: MetricsLeadRow[] = [];
  for (const [cardNumber, events] of byCard(rows)) {
    let createdAt: number | null = null;
    let doneAt: number | null = null;
    for (const e of events) {
      if (e.kind === 'created' && createdAt === null) createdAt = e.at;
      if (e.kind === 'done' && doneAt === null) doneAt = e.at;
    }
    if (doneAt === null || doneAt < period.start || doneAt >= period.end) continue;
    const title = events[events.length - 1]!.cardTitle;
    all.push({ cardNumber, title, leadMs: createdAt === null ? null : doneAt - createdAt, doneAt });
  }

  const known = all.flatMap((r) => (r.leadMs === null ? [] : [r.leadMs]));
  all.sort((a, b) => b.doneAt - a.doneAt || a.cardNumber - b.cardNumber);
  const shown = all.slice(0, Math.max(0, cap));
  return {
    medianMs: median(known),
    meanMs: mean(known),
    counted: known.length,
    unknown: all.length - known.length,
    rows: shown,
    omitted: all.length - shown.length,
  };
}
