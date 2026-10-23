// O leitor do ACP: transforma os `session/update` e a resposta do `session/prompt` nas linhas do canal
// de log e no mesmo `RunReport` que os leitores das CLIs devolvem ao gateway. Um só para todo agente
// ACP — o formato é do protocolo —, com o registro do agente dizendo só o que é dele (a ferramenta MCP
// no título, o formato próprio de tokens, se o `inputTokens` já traz o cache).
//
// O que o protocolo dá para medir (agentclientprotocol.com, conferido em 2026-10-18):
// - `usage_update` (estável desde 2026-06-05): o contexto ocupado (`used` de `size`) e, opcional, o
//   custo ACUMULADO da sessão (`cost: { amount, currency }`). O contexto não é consumo: não vai para
//   o log. O custo vai, se vier em dólar — o board nunca converte nem calcula;
// - `usage` na resposta do `session/prompt` (RFD "end turn token usage", ainda em Draft): os tokens do
//   turno (`inputTokens`, `outputTokens`, `cachedReadTokens`, `cachedWriteTokens`, `thoughtTokens`).
//   Lido se vier; nenhum agente é obrigado a mandar, e o rascunho ainda pode mudar de nome.
// Sem nenhum dos dois, sobra o inventário de ferramentas: `partial`, como o Cursor sem `usage`.
import type { AiRunTokens, InventoryItem, InventoryKind, RunReport } from '../../../shared/log';
import type { FailureClass, ToolFailure, UsageLimitHint } from '../../../shared/usageLimit';
import { asNumber, asObject, asText, cut, type Json } from '../../aiOutput/json';
import type { AcpToolCall } from './provider';

export interface AcpReaderOptions {
  mcpToolOf(call: AcpToolCall): { server: string; tool: string } | null;
  /** tokens num formato próprio do agente, quando a resposta não traz o `usage` do protocolo */
  quota?(result: Json): AiRunTokens | null;
  /** o `inputTokens` do agente já inclui o cache lido (o board guarda os dois separados e os soma) */
  inputIncludesCache?: boolean;
  /**
   * O `usage` do agente conta a menos (só o último pedido ao modelo, como o adaptador do Codex): não é
   * gravado, para o painel não mostrar menos do que foi gasto. O nome vai na linha que explica.
   */
  undercounts?: string;
  /** o limite de uso no erro do `session/prompt`, como o agente o escreve (`AcpAgent.classifyFailure`) */
  classifyFailure?(failure: ToolFailure): FailureClass;
}

const LINE_MAX = 300;

export interface AcpReader {
  /** As linhas legíveis de um `session/update`. */
  update(update: Json): string[];
  /** A resposta do `session/prompt`: o motivo do fim e, se vier, o consumo do turno. */
  finish(result: Json): string[];
  /** O texto que ficou sem quebra de linha, no fim. */
  flush(): string[];
  /** O erro JSON-RPC do `session/prompt` (o turno falhou): o agente que sabe dizer o limite de uso o classifica. */
  fail(failure: ToolFailure): void;
  report(sessionId: string | null): RunReport;
  readonly sawEvent: boolean;
}

export const toolCallOf = (o: Json | null): AcpToolCall | null => {
  const id = asText(o?.toolCallId);
  return id ? { toolCallId: id, title: asText(o?.title), kind: asText(o?.kind) } : null;
};

export function acpReader(opts: AcpReaderOptions): AcpReader {
  let sawEvent = false;
  /** o texto do agente ainda sem `\n`, para o canal não receber um pedaço por linha */
  let pending = '';
  const answer: string[] = [];
  /** `kind\0name` → chamadas */
  const inventory = new Map<string, number>();
  let tokens: AiRunTokens | null = null;
  let costUsd: number | null = null;
  let otherCurrency: string | null = null;
  let usageLimitReached = false;
  let usageLimitHint: UsageLimitHint | undefined;

  const count = (kind: InventoryKind, name: string): void => {
    const key = `${kind}\u0000${name}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
  };

  const drain = (all: boolean): string[] => {
    const parts = pending.split('\n');
    pending = all ? '' : parts.pop()!;
    if (all && parts.at(-1) === '') parts.pop();
    return parts.filter((l) => l.trim()).map((l) => cut(l, LINE_MAX));
  };

  const onToolCall = (o: Json): string[] => {
    const call = toolCallOf(o);
    if (!call) return [];
    const mcp = opts.mcpToolOf(call);
    // a categoria do protocolo é o nome estável; o título é texto para gente e muda a cada chamada
    if (mcp) count('mcp_tool', `${mcp.server}/${mcp.tool}`);
    else count('tool', call.kind ?? 'other');
    return [
      ...drain(true),
      `→ ${mcp ? `${mcp.server}/${mcp.tool}` : (call.kind ?? 'other')}${call.title ? `: ${cut(call.title, LINE_MAX)}` : ''}`,
    ];
  };

  const onUsage = (o: Json): void => {
    const cost = asObject(o.cost);
    const amount = asNumber(cost?.amount);
    const currency = asText(cost?.currency);
    if (amount === null || !currency) return;
    // o custo é acumulado da sessão: vale o último
    if (currency.toUpperCase() === 'USD') costUsd = amount;
    else otherCurrency = currency;
  };

  return {
    update(u) {
      const kind = asText(u.sessionUpdate);
      if (!kind) return [];
      sawEvent = true;
      switch (kind) {
        case 'agent_message_chunk': {
          const content = asObject(u.content);
          const text = asText(content?.type) === 'text' ? asText(content?.text) : null;
          if (!text) return [];
          answer.push(text);
          pending += text;
          return drain(false);
        }
        case 'tool_call':
          return onToolCall(u);
        case 'usage_update':
          onUsage(u);
          return [];
        // `tool_call_update` (andamento), `agent_thought_chunk` (raciocínio), `plan` e o que a
        // próxima versão trouxer: não viram linha nem medida
        default:
          return [];
      }
    },

    finish(result) {
      const lines = drain(true);
      const usage = asObject(result.usage);
      if (usage && opts.undercounts)
        lines.push(
          `O ${opts.undercounts} informa só o último pedido ao modelo; o board não grava esses tokens para não mostrar menos do que foi gasto.`,
        );
      else if (usage) {
        const input = asNumber(usage.inputTokens);
        const output = asNumber(usage.outputTokens);
        // os dois obrigatórios no rascunho; sem eles o bloco não vira um consumo de zero, que pareceria medido
        if (input !== null && output !== null) {
          const cacheRead = asNumber(usage.cachedReadTokens) ?? 0;
          tokens = {
            // sem o desconto, o cache contaria duas vezes no total do painel
            inputTokens: opts.inputIncludesCache ? Math.max(0, input - cacheRead) : input,
            outputTokens: output + (asNumber(usage.thoughtTokens) ?? 0),
            cacheReadTokens: cacheRead,
            cacheWriteTokens: asNumber(usage.cachedWriteTokens) ?? 0,
          };
        }
      }
      tokens ??= opts.quota?.(result) ?? null;
      if (otherCurrency) lines.push(`O agente informou o custo em ${otherCurrency}; o board só grava custo em dólar e não converte.`);
      const stop = asText(result.stopReason);
      lines.push(stop === 'end_turn' ? 'Pronto' : `Terminou: ${stop ?? 'sem motivo informado'}`);
      return lines;
    },

    flush: () => drain(true),

    fail(failure) {
      const found = opts.classifyFailure?.(failure);
      if (!found?.usageLimitReached) return;
      usageLimitReached = true;
      usageLimitHint = found.usageLimitHint ?? usageLimitHint;
    },

    report(sessionId) {
      const items: InventoryItem[] = [...inventory.entries()].map(([key, calls]) => {
        const [kind, name] = key.split('\u0000');
        return { kind: kind as InventoryKind, name: name!, calls };
      });
      const base = {
        inventory: items,
        answer: answer.join(''),
        reason: null,
        usageLimitReached,
        ...(usageLimitHint ? { usageLimitHint } : {}),
      };
      if (tokens) return { ...base, measure: 'full', consumption: { ...tokens, turns: null, sessionId, costUsd } };
      // sem tokens não há `consumption` (o tipo exige os quatro contadores): o custo sozinho fica de fora
      if (items.length) return { ...base, measure: 'partial', consumption: null };
      return { ...base, measure: 'none', consumption: null, inventory: [] };
    },

    get sawEvent() {
      return sawEvent;
    },
  };
}
