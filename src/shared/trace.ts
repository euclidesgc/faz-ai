// Vocabulário do rastreio do board: uma linha por coisa que aconteceu (clique na tela, mensagem ao host,
// mudança aplicada, ferramenta MCP chamada pela IA, execução de IA, erro), para reconstruir depois o que
// houve quando algo falha. Puro, como o resto de `shared`: quem grava fica em `src/extension/log/trace.ts`.

/** De onde veio a linha: a tela, a ponte com a tela, o router, o servidor MCP ou o executor da IA. */
export type TraceSource = 'ui' | 'bridge' | 'router' | 'mcp' | 'run' | 'host';

/** Uma linha do rastreio. Só `at`, `src` e `ev` são obrigatórios; o resto depende do evento. */
export interface TraceEntry {
  /** epoch em ms */
  at: number;
  src: TraceSource;
  /** o que aconteceu: 'click', 'recv', 'done', 'apply', 'tool', 'run.start', 'error'... */
  ev: string;
  /** o tipo da mensagem, o nome da ferramenta MCP */
  type?: string;
  /** o `requestId` da ação, que liga o envio da tela ao `done` do host */
  rid?: string;
  /** duração em ms */
  ms?: number;
  ok?: boolean;
  err?: string;
  /** o conteúdo resumido (ver `summarize`) */
  data?: unknown;
}

/** Campos cujo valor nunca entra no rastreio, em qualquer nível. */
// `token` só sozinho ou como credencial (`accessToken`, `authToken`): `tokens` e `inputTokens` são consumo, não segredo
const SECRET = /(api.?key|(^|access|refresh|auth|session|bearer|web).?token$|secret|password|senha|credential|authorization|cookie)/i;
/** Campos de conteúdo bruto: entram só com o tamanho. */
const BULK = /^(base64|content|data|text|body|markdown|prompt|description)$/i;
const MAX_STRING = 160;
const MAX_ITEMS = 8;
const MAX_DEPTH = 4;

/**
 * Resume um valor para o rastreio: corta textos longos, listas e profundidade, troca segredos por
 * `[oculto]` e conteúdo bruto (arquivo, texto do comentário) pelo tamanho. O rastreio serve para ver o
 * caminho das ações, não para guardar o que a pessoa escreveu.
 */
export function summarize(value: unknown, depth = 0, key = ''): unknown {
  if (key && SECRET.test(key)) return '[oculto]';
  if (typeof value === 'string') {
    if (key && BULK.test(key)) return `[${value.length} caracteres]`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING})` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return Array.isArray(value) ? `[lista de ${value.length}]` : '[objeto]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => summarize(v, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `…(+${value.length - MAX_ITEMS})`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = summarize(v, depth + 1, k);
  return out;
}

/** O conteúdo de uma mensagem da tela para o rastreio: sem `type` e `requestId`, que já vão na linha. */
export function messageData(msg: { type: string; requestId?: string }): unknown {
  const { type: _type, requestId: _rid, ...rest } = msg as Record<string, unknown>;
  return Object.keys(rest).length ? summarize(rest) : undefined;
}

/** Uma linha do rastreio como texto legível, para o canal de log quando o espelho está ligado. */
export function formatTrace(e: TraceEntry): string {
  const parts = [`[rastreio] ${e.src} ${e.ev}`];
  if (e.type) parts.push(e.type);
  if (e.ms !== undefined) parts.push(`${e.ms}ms`);
  if (e.ok === false) parts.push('FALHOU');
  if (e.err) parts.push(`— ${e.err}`);
  if (e.data !== undefined) parts.push(JSON.stringify(e.data));
  return parts.join(' ');
}
