import { presetRange } from './filters';
import { dayOf } from './log';

/** Os sete períodos do painel. Os quatro primeiros são o vocabulário de `filters.ts`. */
export type MetricsPeriod = 'today' | '7d' | '30d' | 'thisMonth' | '12m' | 'all' | 'custom';

export interface MetricsFilters {
  period: MetricsPeriod;
  /** 'AAAA-MM-DD', usados com period = 'custom'; '' = lado aberto */
  from: string;
  to: string;
  /** nome do workflow, como o log o guardou; '' = todos */
  workflow: string;
}

export const EMPTY_METRICS_FILTERS: MetricsFilters = { period: '12m', from: '', to: '', workflow: '' };

const DAY = 24 * 60 * 60 * 1000;

/**
 * O recorte de dias pedido, em 'AAAA-MM-DD' no fuso da máquina, antes de qualquer corte pelo início da série.
 * Lado ausente = aberto; `all` não recorta nada.
 */
export function resolvePeriod(f: MetricsFilters, now: number): { startDate?: string; endDate?: string } {
  const d = new Date(now);
  switch (f.period) {
    case 'all':
      return {};
    case 'thisMonth':
      return { startDate: dayOf(new Date(d.getFullYear(), d.getMonth(), 1).getTime()), endDate: dayOf(now) };
    case '12m':
      // dia 1 de onze meses atrás: com o mês corrente, são exatamente doze meses
      return { startDate: dayOf(new Date(d.getFullYear(), d.getMonth() - 11, 1).getTime()), endDate: dayOf(now) };
    default: {
      const range = presetRange(f.period, f.from, f.to, now);
      if (!range) return {};
      const [from, to] = range;
      const out: { startDate?: string; endDate?: string } = {};
      if (Number.isFinite(from)) out.startDate = dayOf(from);
      // o fim é o último milissegundo do dia; recuar meio dia mantém o dia certo mesmo num dia de 23 ou 25 horas
      if (Number.isFinite(to)) out.endDate = dayOf(to - DAY / 2);
      return out;
    }
  }
}

/** O recorte pedido ao log. Cada lado ausente é um lado aberto. */
export interface MetricsPanelQuery {
  startDate?: string;
  endDate?: string;
  workflow?: string;
}

export interface MetricsTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/** Um mês da série. `null` em tokens/custo = não medido; `present: false` = lacuna. */
export interface MetricsMonth {
  /** 'AAAA-MM' */
  month: string;
  /** houve qualquer dado neste mês */
  present: boolean;
  /** só total mensal, sem detalhe */
  archived: boolean;
  /** o mês corrente, o primeiro da série, ou mês cortado pelo recorte */
  partial: boolean;
  cardsDone: number;
  runs: number;
  runsOpen: number;
  durationMs: number;
  measuredRuns: number;
  tokens: MetricsTokens | null;
  costUsd: number | null;
  costEstimatedUsd: number | null;
  costInformedUsd: number | null;
}

export interface MetricsPanelResult {
  /** o recorte efetivamente consultado, já cortado pelo início da série */
  range: { startDate: string; endDate: string };
  /** true quando o período pedido começava antes do início da série */
  clamped: boolean;
  totals: Omit<MetricsMonth, 'month' | 'present' | 'archived' | 'partial'>;
  /** a espinha completa de meses do recorte, em ordem; mês sem dado vem com present:false */
  months: MetricsMonth[];
  /** os workflows com log no recorte, por nome, em ordem alfabética */
  workflows: string[];
  /** 'AAAA-MM-DD'; '' quando o board não tem log nenhum */
  logSince: string;
  /** o mês mais antigo que ainda tem detalhe; '' quando não há detalhe */
  detailFrom: string;
  /** meses do recorte que só têm total mensal */
  archivedMonths: string[];
  /** a janela em vigor e o que ela está guardando */
  retention: { months: number; detailMonths: number; detailRows: number };
}
