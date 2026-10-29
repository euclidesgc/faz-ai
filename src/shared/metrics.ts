import { presetRange } from './filters';
import type { CostBuckets } from './cost';
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
  /**
   * Execuções medidas com leitura de cache acima de `RUN_CACHE_READ_LIMIT`. Opcional: o mês arquivado não
   * guarda detalhe por execução e fica sem o campo.
   */
  overLimitRuns?: number;
  durationMs: number;
  measuredRuns: number;
  /**
   * Execuções com custo (`cost_usd` gravado; no mês arquivado, o `n` da linha de custo). Contado à parte
   * de `measuredRuns`, como em `MetricsCell`: uma execução pode ter tokens e não ter custo (sem preço no
   * catálogo). `0 < costedRuns < runs` = custo parcial; 0 ⇔ `costUsd` null. Mês arquivado visto com um
   * workflow escolhido vem 0: o arquivo não guarda custo por workflow.
   * `getPanelMetrics` sempre preenche, nos meses e nos totais.
   */
  costedRuns: number;
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

/**
 * As dimensões do seletor (RF-01). `phase` é a única fonte de "fase" (RF-05). `mode` (história 12) é o modo em que
 * a ferramenta rodou (`cli`, `acp`, `api`): o mesmo Gemini mede de formas diferentes em cada um, e misturar os três
 * na linha da ferramenta esconderia de onde veio o consumo. Execução anterior à migração 48 fica sem modo ('').
 */
export type MetricsBreakdownDim = 'phase' | 'card_type' | 'model' | 'tool' | 'mode' | 'effort' | 'profile';

/** Na ordem do seletor. */
export const METRICS_BREAKDOWN_DIMS: MetricsBreakdownDim[] = ['phase', 'card_type', 'model', 'tool', 'mode', 'effort', 'profile'];

/** As quatro medidas de cada categoria (RF-02). A barra mostra uma; as quatro vão em texto. */
export type MetricsMeasure = 'cost' | 'tokens' | 'runs' | 'duration';

/**
 * Mostrar o custo em dólar. Por enquanto o board mostra só tokens: o Claude Code informa o custo, mas o
 * Cursor não, e um total em dólar que cobre só parte das execuções confunde mais do que ajuda. O valor
 * informado continua gravado no log (`cost_usd`); ligar de novo é só trocar esta constante.
 */
export const SHOW_COST = false;

export const METRICS_MEASURES: MetricsMeasure[] = (['cost', 'tokens', 'runs', 'duration'] as MetricsMeasure[]).filter(
  (m) => SHOW_COST || m !== 'cost',
);

/** A conferência da execução (o que foi usado contra o que o card pediu) contada por estado. */
export interface RunChecks {
  ok: number;
  deviation: number;
  unchecked: number;
}

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
  /**
   * Custo por bucket de token (soma pelo preço do catálogo), só no detalhe (`ai_runs`). Ausente no mês
   * arquivado, que guarda só o total por origem; null no bucket = nenhuma execução o tinha.
   */
  costBuckets?: CostBuckets;
  /** só no corte por ferramenta de IA: execuções conferidas, com desvio e não conferidas (as sem conferência contam em não conferidas) */
  checks?: RunChecks;
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

/**
 * O retrabalho de uma fase: o que a IA entregou para revisão e o que a pessoa fez com isso. Só conta a
 * resposta de uma pessoa (aprovar ou pedir ajustes); a aprovação automática do modo autônomo não entra.
 */
export interface MetricsReworkPhase {
  phase: string;
  /** pedidos de revisão: o card foi para "Aguardando revisão" */
  reviews: number;
  /** revisões aprovadas por uma pessoa */
  approved: number;
  /** revisões devolvidas com pedido de ajuste */
  adjusted: number;
  /** cards cuja primeira resposta da pessoa nesta fase caiu no período */
  resolved: number;
  /** desses, os aprovados de primeira, sem nenhum pedido de ajuste antes */
  firstPass: number;
  /** execuções da fase com registro de comandos de Bash no período; 0 = sinais da IA não medidos nesta fase */
  bashRuns: number;
  /** commits em execuções da fase Revisão (≈ achados corrigidos); zero nas outras fases */
  reviewFixes: MetricsAiSignal;
  /** chamadas de `npm test` que voltaram com erro */
  testFailures: MetricsAiSignal;
  /** commits depois de a história registrar o pull request; `runs` = execuções */
  commitsAfterPr: MetricsAiSignal;
}

/**
 * Um sinal de precisão medido do lado da IA (#605): o total e a parte que veio de execuções (ou
 * histórias) em modo autônomo, que a revisão de uma pessoa não cobre.
 */
export interface MetricsAiSignal {
  /** ocorrências (commits, falhas) */
  count: number;
  /** execuções em que aconteceu (histórias, em `aiSignals.commitsAfterPr`) */
  runs: number;
  /** das ocorrências, as de execuções/histórias autônomas */
  autonomousCount: number;
  /** das execuções/histórias, as autônomas */
  autonomousRuns: number;
}

export const ZERO_SIGNAL: MetricsAiSignal = { count: 0, runs: 0, autonomousCount: 0, autonomousRuns: 0 };

/** Os pedidos de revisão e de ajuste pelo modelo da execução que entregou o trabalho; '' = não definido. */
export interface MetricsReworkModel {
  model: string;
  reviews: number;
  adjusted: number;
}

/** Os pedidos de revisão e de ajuste pelo agente da execução que pediu a revisão; '' = sem agente. */
export interface MetricsReworkAgent {
  agent: string;
  reviews: number;
  adjusted: number;
}

/** Execuções terminadas do período por modelo ou agente, e quantas não terminaram com resultado (RF7). */
export interface MetricsUnfinishedRow {
  /** o modelo ou o agente; '' = não definido / sem agente */
  value: string;
  /** execuções do período com resultado registrado (`outcome` não nulo; as em andamento não entram) */
  runs: number;
  /** destas, as com `outcome` failed, timeout ou stopped */
  unfinished: number;
  failed: number;
  timeout: number;
  stopped: number;
}

/** O retrabalho do período: o sinal de qualidade que o consumo e o tempo não mostram. */
export interface MetricsRework {
  phases: MetricsReworkPhase[];
  models: MetricsReworkModel[];
  /** o mesmo corte pelo agente da execução (RF6) */
  agents: MetricsReworkAgent[];
  /** execuções sem resultado por modelo e por agente (RF7; aproximação) */
  unfinished: { models: MetricsUnfinishedRow[]; agents: MetricsUnfinishedRow[] };
  /**
   * histórias concluídas no período e quantas delas já têm um bug vinculado (o defeito que escapou);
   * `autonomous*` é a parte das histórias que tiveram alguma execução em modo autônomo
   */
  escapes: {
    stories: number;
    withBugs: number;
    bugs: number;
    autonomousStories: number;
    autonomousWithBugs: number;
    autonomousBugs: number;
  };
  /** os sinais do lado da IA no período inteiro, para medir a precisão também no modo autônomo (#605) */
  aiSignals: {
    /** execuções do período com registro de comandos de Bash, a base dos três sinais; 0 = não medido, não zero */
    bashRuns: number;
    reviewFixes: MetricsAiSignal;
    testFailures: MetricsAiSignal;
    /** `runs` = histórias distintas com commit depois do pull request */
    commitsAfterPr: MetricsAiSignal;
  };
}

export const EMPTY_REWORK: MetricsRework = {
  phases: [],
  models: [],
  agents: [],
  unfinished: { models: [], agents: [] },
  escapes: { stories: 0, withBugs: 0, bugs: 0, autonomousStories: 0, autonomousWithBugs: 0, autonomousBugs: 0 },
  aiSignals: { bashRuns: 0, reviewFixes: ZERO_SIGNAL, testFailures: ZERO_SIGNAL, commitsAfterPr: ZERO_SIGNAL },
};

/** Um grupo de histórias concluídas: tipo × "Esforço da atividade" (RF2–RF4). */
export interface MetricsDeliveryGroup {
  /** o tipo atual da história */
  type: string;
  /** o valor atual do "Esforço da atividade"; '' = não definido */
  effort: string;
  stories: number;
  /** histórias com pelo menos uma execução medida (`measure <> 'none'`) */
  measured: number;
  /** null = nenhuma história medida, nunca 0 */
  tokens: number | null;
  meanTokens: number | null;
  medianTokens: number | null;
}

/** Um par tipo × modelo ou tipo × agente entre as histórias concluídas (RF9–RF10). */
export interface MetricsDeliveryCross {
  type: string;
  /** o modelo ou o agente; '' = não definido / sem agente */
  value: string;
  /** histórias em que o modelo/agente rodou (a história e as sub-tarefas) */
  stories: number;
  /** destas, as com alguma execução medida dele */
  measured: number;
  tokens: number | null;
  /** tokens / measured; null sem medida */
  tokensPerStory: number | null;
  /** pedidos de ajuste nas revisões pedidas por execuções dele nessas histórias */
  adjusted: number;
}

export interface MetricsDelivery {
  /** histórias concluídas no período e no workflow (RF1) */
  stories: number;
  measured: number;
  /** soma das histórias medidas; null = nenhuma */
  tokens: number | null;
  groups: MetricsDeliveryGroup[];
  byModel: MetricsDeliveryCross[];
  byAgent: MetricsDeliveryCross[];
  /** linhas além de METRICS_ROW_CAP, por tabela (RF13) */
  omitted: { groups: number; byModel: number; byAgent: number };
}

export const EMPTY_DELIVERY: MetricsDelivery = {
  stories: 0,
  measured: 0,
  tokens: null,
  groups: [],
  byModel: [],
  byAgent: [],
  omitted: { groups: 0, byModel: 0, byAgent: 0 },
};

/** As seções que acompanham `MetricsPanelResult`. */
export interface MetricsPanelSections {
  /** um por dimensão de `METRICS_BREAKDOWN_DIMS`, na ordem */
  breakdowns: MetricsBreakdown[];
  dwell: MetricsDwell[];
  lead: MetricsLead;
  cards: MetricsRanking;
  inventory: MetricsInventory;
  rework: MetricsRework;
  delivery: MetricsDelivery;
}

/** Teto de linhas por tabela, no host. Acima dele a resposta conta o que ficou fora (RF-33). */
export const METRICS_ROW_CAP = 200;
