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
  /** null = não há custo: a ferramenta não o informou (o board nunca calcula por tabela de preços) */
  costUsd: number | null;
  /**
   * Só linhas antigas: true = o custo foi calculado pela tabela de preços que o board tinha. Nenhum leitor
   * preenche isto mais; ausente = informado pela ferramenta.
   */
  costEstimated?: boolean;
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
 * Separa o servidor da ferramenta no nome de uma ferramenta MCP do inventário. Reconhece as duas
 * formas que existem: `mcp__<servidor>__<ferramenta>` (a do Claude Code) e `<servidor>/<ferramenta>`
 * (como o leitor da saída grava em `ai_run_usage`). O corte é no PRIMEIRO separador — nome de servidor
 * com `_` é comum e com `/` não é —, então um separador repetido fica na ferramenta. Não casou (sem
 * servidor, ou com servidor ou ferramenta vazios): devolve o nome como veio e `server: ''`, que a tela
 * lê como "servidor não registrado" — nunca se adivinha o servidor (RF-26).
 */
export function splitMcpName(name: string): { server: string; tool: string } {
  const notFound = { server: '', tool: name };
  let sep: string;
  let from: number;
  if (name.startsWith('mcp__')) {
    sep = '__';
    from = 'mcp__'.length;
  } else {
    sep = '/';
    from = 0;
  }
  const at = name.indexOf(sep, from);
  if (at < 0) return notFound;
  const server = name.slice(from, at);
  const tool = name.slice(at + sep.length);
  return server && tool ? { server, tool } : notFound;
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
  /**
   * true = o leitor detectou, na própria saída da CLI, que o modelo esgotou o limite de uso do
   * plano (não confundir com `reason`, que é do transporte e nunca é preenchido pelo leitor). Sinal
   * estrutural, específico: nenhuma outra condição de erro (código de saída, timeout, erro genérico)
   * liga esta flag — o runner decide a retentativa com o modelo reserva a partir dela.
   */
  usageLimitReached: boolean;
}

/** Uma linha de `log_months`: o total de uma métrica (e, opcionalmente, um corte dela) num mês já arquivado. */
export interface LogMetric {
  boardId: string;
  month: string;
  metric: 'events' | 'runs' | 'cards_done' | 'tokens' | 'cost' | 'usage';
  /**
   * '' (total) | 'kind' | 'workflow' | 'outcome' | 'phase' | 'card_type' | 'model' | 'tool' | 'effort' | 'profile'
   * | 'source' (só em 'cost': `estimated` | `informed`) | os tipos do inventário (só em 'usage').
   * Em 'tokens', `kind` é o tipo de token: `input` | `output` | `cache_read` | `cache_write`.
   */
  dim: string;
  /** o valor da dimensão; '' quando `dim` é '' */
  value: string;
  /** contagem; em 'tokens' e 'cost' é quantas execuções tinham o número (medidas / com custo), não quantas houve */
  n: number;
  /**
   * soma na unidade da métrica: ms para 'runs'; tokens para 'tokens' (a soma dos quatro tipos, ou só a
   * do tipo na linha `dim='kind'`); dólares para 'cost'; chamadas para 'usage'
   */
  total: number;
}

/** Primeiro e último dia (inclusive) do mês 'AAAA-MM'. */
export function monthSpan(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y!, m!, 0).getDate();
  return [`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`];
}

/**
 * Meses 'AAAA-MM' entre dois outros, inclusive, em ordem crescente. Única cópia de propósito: duas
 * respostas para "quais meses há entre A e B" é como a lacuna vira zero num dos lados.
 */
export function monthRange(from: string, to: string): string[] {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  const out: string[] = [];
  let y = y1!;
  let m = m1!;
  while (y < y2! || (y === y2 && m <= m2!)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * Bytes aproximados que uma linha de detalhe (`card_events`, `ai_runs` ou `ai_run_usage`) ocupa no
 * arquivo do board, para mostrar o preço da janela de retenção (RF-25 de #71). Medido num banco em
 * memória com um mês de uso intenso (30 dias × 50 eventos + 20 execuções medidas por dia, cada uma com
 * 8 itens de inventário), depois de `VACUUM`: 1,64 MB para 6.900 linhas. É estimativa para a tela,
 * não conta de disco: o arquivo real varia com o tamanho dos títulos e do inventário.
 */
export const LOG_BYTES_PER_ROW = 240;

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
