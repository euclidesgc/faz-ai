// Vocabulário e tipos puros do log de utilização do board: eventos do card e execuções de IA.
// Sem dependência de banco nem de VSCode, como o resto de `shared`. O que grava e lê este vocabulário
// fica em `src/extension/log`; aqui só o contrato.

/**
 * O que pode acontecer com um card. Fixo: depois de gravado, meses arquivados passam a depender
 * destes valores — renomear um deles quebra as séries antigas. `done` e `cancelled` são derivados e
 * redundantes com `column_changed` (entrar numa coluna dessas categorias gera os dois).
 */
export type CardEventKind =
  | 'created'
  | 'column_changed'
  | 'status_changed'
  | 'comment'
  | 'question'
  | 'review_requested'
  | 'blocked'
  | 'attachment_added'
  | 'artifact_saved'
  | 'subtask_created'
  | 'subtask_done'
  | 'link_added'
  | 'link_removed'
  | 'pull_request_set'
  | 'workspace_prepared'
  | 'yolo_changed'
  | 'field_changed'
  | 'archived'
  | 'unarchived'
  | 'trashed'
  | 'restored'
  | 'deleted'
  | 'done'
  | 'cancelled';

/** Quem disparou a execução de IA: manual (botão/comando), heartbeat, autopiloto ou o chat do board. */
export type AiRunOrigin = 'manual' | 'heartbeat' | 'autopilot' | 'chat';

/** Como uma execução de IA terminou. `unknown` é só para execuções que a sessão anterior não chegou a fechar (ver `closeOpen`). */
export type AiRunOutcome = 'done' | 'failed' | 'unsupported' | 'timeout' | 'stopped' | 'unknown';

/** Uma linha de `card_events`: o que aconteceu com um card, quem fez e em que execução de IA (se houve). */
export interface CardEvent {
  id: string;
  boardId: string;
  at: number;
  /** 'YYYY-MM' no fuso da máquina, calculado na hora da gravação */
  month: string;
  kind: CardEventKind;
  /** sem FK: o evento sobrevive ao card apagado */
  cardId: string | null;
  cardNumber: number;
  /** cortado em `CARD_TITLE_MAX_LENGTH` caracteres */
  cardTitle: string;
  cardType: string;
  workflow: string;
  /** a coluna (fase) em que o card estava */
  columnName: string;
  fromValue: string;
  toValue: string;
  /** nome do campo, do arquivo, '#n' do outro card, URL do PR */
  subject: string;
  author: string;
  source: 'human' | 'ai';
  /** a execução de IA que produziu o evento; `null` quando não houve (ou a sessão não foi aberta pelo board) */
  runId: string | null;
}

/** O que `AiRunRepo.start()` grava ao iniciar a execução: contexto no momento da chamada, congelado. */
export interface AiRunStart {
  boardId: string;
  startedAt: number;
  origin: AiRunOrigin;
  tool: string;
  cardId: string | null;
  cardNumber: number | null;
  cardTitle: string;
  cardType: string;
  workflow: string;
  columnName: string;
  /** nome da fase; hoje igual à coluna, guardado à parte de propósito */
  phase: string;
}

/**
 * O que `AiRunRepo.describe()` completa depois do plano de execução. `null` = não definido nesta
 * execução; `''` (em `profile`/`agent`) = definido e vazio. Distinção que RF-15 pede.
 */
export interface AiRunConfig {
  model: string | null;
  effort: string | null;
  profile: string | null;
  agent: string | null;
  permission: string;
  autonomous: boolean;
  clean: boolean;
  skills: string[];
  /** `null` = sem restrição de servidores MCP */
  mcp: string[] | null;
}

/**
 * Se a execução foi medida. `none` = não houve medição (caiu para texto, a ferramenta não tem saída
 * estruturada, ou a execução é anterior a esta entrega): tokens e custo ficam NULL e o inventário não
 * tem linha. `partial` = o fluxo começou e truncou antes do evento final: o que foi lido vale e não é
 * total. `full` = o evento final foi lido; o número é o da sessão.
 * Não é um booleano de propósito: "medido e zero" e "não medido" são coisas diferentes.
 */
export type AiRunMeasure = 'none' | 'partial' | 'full';

/** Os quatro contadores de token de uma execução (ou de um modelo dentro dela, para calcular o custo). */
export interface AiRunTokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** O consumo de uma execução medida. Existe só quando `measure` é 'partial' ou 'full'. */
export interface AiRunConsumption extends AiRunTokens {
  /** soma dos turnos de todos os segmentos; null = a ferramenta não informa */
  turns: number | null;
  sessionId: string | null;
  /** null = não há custo: nem informado pela ferramenta, nem calculável pelo preço do catálogo */
  costUsd: number | null;
  /** true = saiu da tabela de preços do catálogo; irrelevante quando `costUsd` é null */
  costEstimated: boolean;
}

/** O que uma linha do inventário da execução conta. */
export type InventoryKind = 'tool' | 'mcp_tool' | 'agent' | 'skill';

/** Uma linha de `ai_run_usage`: o que a sessão usou e quantas vezes. */
export interface InventoryItem {
  kind: InventoryKind;
  /** ferramenta nativa (`Read`), ferramenta MCP (`<servidor>/<ferramenta>`), subagente ou skill */
  name: string;
  calls: number;
}

/**
 * O que a camada de leitura da saída da CLI entrega ao log no fim da execução.
 * Duas invariantes, que são o requisito de honestidade do PRD em forma de tipo:
 * - `measure === 'none'` ⇔ `consumption === null` E `inventory.length === 0`. Zero medido é
 *   `measure: 'full'` com zeros; não medido é `null`.
 * - `costUsd === null` quando não há custo. Nunca `0` por falta de preço.
 */
export interface RunReport {
  measure: AiRunMeasure;
  consumption: AiRunConsumption | null;
  inventory: InventoryItem[];
  /** o texto final da resposta, para o chat; '' quando não houve */
  answer: string;
  /** por que não houve medição, em português, para o canal de log — nunca para o banco */
  reason: string | null;
}

/** Uma linha de `log_months`: o total de uma métrica (e, opcionalmente, um corte dela) num mês já arquivado. */
export interface LogMetric {
  boardId: string;
  month: string;
  metric: 'events' | 'runs' | 'cards_done' | 'tokens' | 'cost' | 'usage';
  /** '' (total) | 'kind' | 'outcome' | 'phase' | 'card_type' | 'model' | 'tool' | 'effort' | 'profile' */
  dim: string;
  /** o valor da dimensão; '' quando `dim` é '' */
  value: string;
  n: number;
  /** soma na unidade da métrica (ms para 'runs'; soma dos quatro tipos de token para 'tokens'; soma de cost_usd para 'cost'; soma de calls para 'usage') */
  total: number;
}

/** 'YYYY-MM' de `ts`, no fuso da máquina (nunca UTC: mudar o fuso depois não reescreve o passado). */
export function monthOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' de `ts`, no fuso da máquina. */
export function dayOf(ts: number): string {
  const d = new Date(ts);
  return `${monthOf(ts)}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tamanho máximo de `card_title` em `card_events` e `ai_runs`: mantém as linhas do log pequenas. */
export const CARD_TITLE_MAX_LENGTH = 120;

/** Corta `title` em `CARD_TITLE_MAX_LENGTH` caracteres, usada pelos repositórios do log (card_events e ai_runs). */
export function truncateTitle(title: string): string {
  return title.length > CARD_TITLE_MAX_LENGTH ? title.slice(0, CARD_TITLE_MAX_LENGTH) : title;
}
