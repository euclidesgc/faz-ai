// Leitor do `stream-json` do Gemini CLI (`gemini -p --output-format stream-json`), conferido contra a CLI
// 0.65.0 rodando de verdade contra uma API local (test/fixtures/gemini-stream-json*.jsonl; a documentação,
// geminicli.com/docs/cli/headless, lista os eventos mas não os campos):
// - cada linha é um JSON com `type`: `init` (`session_id`, `model`), `message` (`role` `user` ou `assistant`;
//   o texto do assistente chega em pedaços, com `delta: true`), `tool_use` (`tool_name`, `tool_id`,
//   `parameters`), `tool_result` (`tool_id`, `status` `success` ou `error`, e `error.type` na falha), `error`
//   (aviso ou erro não fatal: `severity`, `message`) e `result` (`status`, `error { type, message }` e `stats`);
// - `result.stats` traz os totais (`total_tokens`, `input_tokens`, `output_tokens`, `cached`, `input`) e o mesmo
//   por modelo em `models`. `input_tokens` inclui o cache; `input` é o que não veio dele. O raciocínio do modelo
//   não tem campo próprio: é a diferença entre o total e a soma de entrada e saída, cobrada como saída;
// - a CLI não informa custo em dólar, e o board não o calcula: só os tokens são medidos;
// - as ferramentas MCP têm o nome `mcp_<servidor>_<operação>` (o `generateValidName` da CLI);
// - a chamada que a CLI recusa antes de rodar (`tool_not_registered`: a ferramenta não está no `tools.core` da
//   home do board; `policy_violation`; parâmetros inválidos) não entra no inventário: nada rodou, e contá-la
//   faria a conferência acusar um desvio que não houve.
import type { AiRunTokens, InventoryItem, InventoryKind, RunReport } from '../../shared/log';
import { asNumber, asObject, asText, cut, type Json } from './json';
import type { OutputReader, OutputStream, ReaderDeps } from './reader';

/** Tamanho de uma linha que não é JSON, como o modo texto já corta hoje. */
const RAW_MAX = 300;

/** Os tipos de erro da CLI que recusam a chamada antes de a ferramenta rodar (`ToolErrorType` da 0.65.0). */
const REFUSED = new Set(['tool_not_registered', 'policy_violation', 'invalid_tool_params']);

/**
 * A cota esgotada, como a CLI a descreve (`TerminalQuotaError`, `RetryableQuotaError` depois das tentativas
 * dela, o 429 da API com `RESOURCE_EXHAUSTED`). Vale no erro do `result` e nos avisos (`error`).
 */
const USAGE_LIMIT =
  /exhausted your (daily )?quota|exhausted your capacity|quota exceeded|RESOURCE_EXHAUSTED|INSUFFICIENT_G1_CREDITS_BALANCE|\b429\b/i;

/** `mcp_<servidor>_<operação>` → `servidor/operação`, pelo servidor conhecido mais longo; sem ele, o primeiro `_`. */
export function geminiMcpName(name: string, servers: readonly string[] = []): string | null {
  if (!name.startsWith('mcp_')) return null;
  const rest = name.slice('mcp_'.length);
  const known = [...servers].sort((a, b) => b.length - a.length).find((s) => rest.startsWith(`${s}_`) && rest.length > s.length + 1);
  if (known) return `${known}/${rest.slice(known.length + 1)}`;
  const at = rest.indexOf('_');
  return at > 0 && at < rest.length - 1 ? `${rest.slice(0, at)}/${rest.slice(at + 1)}` : null;
}

/** Os tokens de um bloco de `stats` (o total ou o de um modelo); null quando o bloco não traz nenhum. */
function tokensOf(stats: Json | null): AiRunTokens | null {
  if (!stats) return null;
  const total = asNumber(stats.total_tokens);
  const input = asNumber(stats.input_tokens);
  const output = asNumber(stats.output_tokens);
  const cached = asNumber(stats.cached);
  const fresh = asNumber(stats.input);
  if ([total, input, output, cached, fresh].every((v) => v === null)) return null;
  // o raciocínio é o resto do total: entra na saída, como na cobrança
  const thoughts = total !== null && input !== null && output !== null ? Math.max(0, total - input - output) : 0;
  return {
    inputTokens: fresh ?? Math.max(0, (input ?? 0) - (cached ?? 0)),
    outputTokens: (output ?? 0) + thoughts,
    cacheReadTokens: cached ?? 0,
    cacheWriteTokens: 0,
  };
}

const addTokens = (a: AiRunTokens, b: AiRunTokens): AiRunTokens => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

export function geminiReader(deps: ReaderDeps = { model: null }): OutputReader {
  let sawEvent = false;
  let sessionId: string | null = null;
  let usageLimitReached = false;
  /** `kind\0name` → chamadas */
  const inventory = new Map<string, number>();
  /** as chamadas anunciadas que ainda não tiveram resultado: `tool_id` → (kind, nome) */
  const pending = new Map<string, { kind: InventoryKind; name: string }>();
  /** os trechos de texto do assistente, separados pelas chamadas de ferramenta; a resposta é o último */
  const segments: string[] = [''];
  /** o pedaço de linha que ainda não fechou (o texto chega em pedaços) */
  let partial = '';
  let tokens: AiRunTokens | null = null;

  const count = (kind: InventoryKind, name: string): void => {
    const key = `${kind}\u0000${name}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
  };
  /** fecha a linha de texto em aberto: o canal mostra linhas inteiras, não os pedaços do `delta` */
  const flushText = (): string[] => {
    const rest = partial;
    partial = '';
    return rest ? [rest] : [];
  };

  const onMessage = (o: Json): string[] => {
    if (asText(o.role) !== 'assistant') return [];
    const text = asText(o.content);
    if (!text) return [];
    segments[segments.length - 1] += text;
    const lines = (partial + text).split('\n');
    partial = lines.pop() ?? '';
    return lines;
  };

  const onToolUse = (o: Json): string[] => {
    const name = asText(o.tool_name);
    if (!name) return flushText();
    const mcp = geminiMcpName(name, deps.mcpServers);
    const item = { kind: (mcp ? 'mcp_tool' : 'tool') as InventoryKind, name: mcp ?? name };
    const id = asText(o.tool_id);
    // sem id não há como saber o resultado: conta já (pode ter rodado)
    if (id) pending.set(id, item);
    else count(item.kind, item.name);
    // o texto depois da chamada é outro trecho: a resposta final é o que vem depois da última
    if (segments.at(-1)) segments.push('');
    return [...flushText(), item.name];
  };

  const onToolResult = (o: Json): string[] => {
    const id = asText(o.tool_id);
    const item = id ? pending.get(id) : undefined;
    if (!id || !item) return [];
    pending.delete(id);
    const error = asObject(o.error);
    const refused = asText(o.status) === 'error' && REFUSED.has(asText(error?.type) ?? '');
    if (!refused) count(item.kind, item.name);
    return refused ? [`${item.name}: recusada pela CLI (${asText(error?.type)})`] : [];
  };

  const onError = (o: Json): string[] => {
    const message = asText(o.message);
    if (!message) return [];
    if (USAGE_LIMIT.test(message)) usageLimitReached = true;
    return [...flushText(), cut(`Aviso do Gemini: ${message}`, RAW_MAX)];
  };

  const onResult = (o: Json): string[] => {
    const stats = asObject(o.stats);
    const models = asObject(stats?.models);
    // por modelo quando a CLI separa (o roteador pode usar mais de um); senão, o total
    const perModel = models
      ? Object.values(models)
          .map((m) => tokensOf(asObject(m)))
          .filter((t): t is AiRunTokens => t !== null)
      : [];
    const read = perModel.length ? perModel.reduce(addTokens) : tokensOf(stats);
    if (read) tokens = read;
    const lines = flushText();
    if (asText(o.status) === 'error') {
      const message = asText(asObject(o.error)?.message) ?? 'erro sem mensagem';
      if (USAGE_LIMIT.test(message)) usageLimitReached = true;
      lines.push(cut(`Terminou com erro: ${message}`, RAW_MAX));
    } else lines.push('Pronto');
    return lines;
  };

  return {
    push(line: string, stream: OutputStream): string[] {
      // a cota esgotada também aparece no `stderr` (o relatório de erro da CLI): vale nos dois
      if (USAGE_LIMIT.test(line) && /quota|RESOURCE_EXHAUSTED/i.test(line)) usageLimitReached = true;
      // stderr é texto de gente, nunca passa pelo interpretador
      if (stream === 'stderr') return line ? [cut(line, RAW_MAX)] : [];
      if (!line.trim()) return [];
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // uma linha ruim não invalida as outras: vai para o canal como texto e a leitura segue
        return [cut(line, RAW_MAX)];
      }
      const o = asObject(parsed);
      const type = o && asText(o.type);
      if (!o || !type) return [cut(line, RAW_MAX)];
      sawEvent = true;
      sessionId ??= asText(o.session_id);
      switch (type) {
        case 'message':
          return onMessage(o);
        case 'tool_use':
          return onToolUse(o);
        case 'tool_result':
          return onToolResult(o);
        case 'error':
          return onError(o);
        case 'result':
          return onResult(o);
        // `init` (a sessão e o modelo, já lidos acima) e o que uma versão nova trouxer
        default:
          return [];
      }
    },

    report(): RunReport {
      // a chamada anunciada sem resultado (o processo caiu no meio) pode ter rodado: conta
      for (const item of pending.values()) count(item.kind, item.name);
      pending.clear();
      const items: InventoryItem[] = [...inventory.entries()].map(([key, calls]) => {
        const [kind, name] = key.split('\u0000');
        return { kind: kind as InventoryKind, name: name!, calls };
      });
      const answer = (segments.filter((s) => s.trim()).at(-1) ?? '').trim();
      if (tokens)
        return {
          measure: 'full',
          consumption: { ...tokens, turns: null, sessionId, costUsd: null },
          inventory: items,
          answer,
          reason: null,
          usageLimitReached,
        };
      // sem `result` com `stats` (a CLI caiu antes): o inventário lido vale, sem consumo (ver o leitor do Cursor)
      if (items.length) return { measure: 'partial', consumption: null, inventory: items, answer, reason: null, usageLimitReached };
      return { measure: 'none', consumption: null, inventory: [], answer, reason: null, usageLimitReached };
    },

    get sawEvent(): boolean {
      return sawEvent;
    },
  };
}
