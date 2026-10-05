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
  /**
   * Execuções com custo (`cost_usd` gravado; no mês arquivado, o `n` da linha de custo). Contado à parte
   * de `measuredRuns`, como em `MetricsCell`: uma execução pode ter tokens e não ter custo (sem preço no
   * catálogo). `0 < costedRuns < runs` = custo parcial; 0 ⇔ `costUsd` null. Mês arquivado visto com um
   * workflow escolhido vem 0: o arquivo não guarda custo por workflow.
   *
   * Opcional só por compatibilidade com quem monta o tipo à mão (fixtures da tela): `getPanelMetrics`
   * sempre preenche, nos meses e nos totais.
   */
  costedRuns?: number;
  tokens: MetricsTokens | null;
  costUsd: number | null;
  costEstimatedUsd: number | null;
  costInformedUsd: number | null;
}

export interface MetricsPanelResult {
  /**
   * o recorte efetivamente consultado, já cortado pelo início da série. Pedido inteiro antes do início
   * da série: os dois lados '' (nada foi consultado), com `clamped: true` e `months` vazio.
   */
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
  /** os cortes, os tempos, o ranking por card e o inventário (as quatro seções do painel) */
  // getPanelMetrics sempre devolve as seções (#171, #172); período sem dado = seções vazias (RF-34)
  sections: MetricsPanelSections;
}

// ---------------------------------------------------------------------------------------------
// As quatro seções do painel (#105). Entram em `MetricsPanelResult.sections`: as mensagens
// `metrics.query` -> `metrics.result` não mudam, é um pedido, uma resposta, um `requestId`.
// ---------------------------------------------------------------------------------------------

/** As seis dimensões do seletor (RF-01). `phase` é a única fonte de "fase" (RF-05). */
export type MetricsBreakdownDim = 'phase' | 'card_type' | 'model' | 'tool' | 'effort' | 'profile';

/** Na ordem do seletor. */
export const METRICS_BREAKDOWN_DIMS: MetricsBreakdownDim[] = ['phase', 'card_type', 'model', 'tool', 'effort', 'profile'];

/** As quatro medidas de cada categoria (RF-02). A barra mostra uma; as quatro vão em texto. */
export type MetricsMeasure = 'cost' | 'tokens' | 'runs' | 'duration';

export const METRICS_MEASURES: MetricsMeasure[] = ['cost', 'tokens', 'runs', 'duration'];

/** Uma categoria de um corte ou de um ranking. */
export interface MetricsCell {
  /**
   * O valor da dimensão como o log o guardou; '' = "não definido" (RF-04). É uma categoria só:
   * NULL e '' não se distinguem, porque o arquivo mensal já os colapsa e a distinção morreria na
   * consolidação.
   */
  value: string;
  runs: number;
  /**
   * Execuções do grupo que tinham medição de consumo. `< runs` = medição parcial. Com 0, `tokens` e
   * `costUsd` são `null`, nunca 0: nada medido não é consumo zero (RF-30).
   */
  measuredRuns: number;
  /**
   * Execuções do grupo que tinham custo. É contado à parte de `measuredRuns` porque uma execução pode
   * ter tokens e não ter custo (#70 ainda não grava custo): `0 < costedRuns < runs` = custo parcial, e a
   * tela marca a linha (RF-30). Com 0, `costUsd` é `null`.
   */
  costedRuns: number;
  durationMs: number;
  /** null = nenhuma execução do grupo foi medida; nunca 0 (RF-30) */
  tokens: number | null;
  costUsd: number | null;
  /** a parte estimada do custo, no vocabulário de #71 (RF-31) */
  costEstimatedUsd: number | null;
}

export interface MetricsBreakdown {
  dim: MetricsBreakdownDim;
  cells: MetricsCell[];
  /**
   * O total do que este corte cobre, inclusive o que não veio em `cells`. É daqui que o cliente
   * calcula "outros" = `covered` menos a soma das linhas exibidas (RF-03, RF-33): por isso o total
   * viaja no contrato, em vez de a tela somar as linhas que recebeu.
   */
  covered: Omit<MetricsCell, 'value'>;
  /** true quando os meses arquivados entraram (workflow em "Todos") */
  includesArchive: boolean;
  /** meses do período que ficaram fora deste corte, e só dele (RF-10) */
  excludedMonths: string[];
  /** valores de fase que existem em mais de um workflow no período (RF-07) */
  ambiguous: string[];
}

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

/** Ranking por card. `cells[].value` é '#N título' e '' é a linha "sem card" (RF-20). */
export interface MetricsRanking {
  cells: MetricsCell[];
  /** o total do que o ranking cobre; "outros" = `covered` menos a soma de `cells` (RF-33) */
  covered: Omit<MetricsCell, 'value'>;
  /** grupos fora do teto, somados em `covered` e contados aqui (RF-33) */
  omitted: number;
}

export interface MetricsInventory {
  /** false = `ai_run_usage` nunca teve linha neste board: "não medido", não "nada usado" (RF-27) */
  measured: boolean;
  tools: MetricsUsage[];
  mcpTools: MetricsUsage[];
  agents: MetricsUsage[];
  skills: MetricsUsage[];
}

export interface MetricsUsage {
  name: string;
  /** só em `mcpTools`; '' = o registro não trouxe o servidor (RF-26) */
  server: string;
  /** execuções em que apareceu */
  runs: number;
  /** soma de usos; pode ser > runs */
  calls: number;
}

/** As seções que acompanham `MetricsPanelResult`. */
export interface MetricsPanelSections {
  /** um por dimensão de `METRICS_BREAKDOWN_DIMS`, na ordem */
  breakdowns: MetricsBreakdown[];
  dwell: MetricsDwell[];
  lead: MetricsLead;
  cards: MetricsRanking;
  inventory: MetricsInventory;
}

/** Teto de linhas por tabela, no host. Acima dele a resposta conta o que ficou fora (RF-33). */
export const METRICS_ROW_CAP = 200;
