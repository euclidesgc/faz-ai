// Leitor genérico de `stream-json`, usado por Cursor e Kimi. Os eventos `system`, `assistant`,
// `tool_call` e `result` seguem o espírito do formato do Claude Code. O do Cursor foi conferido
// contra execuções reais da CLI 2026.10.01 (test/fixtures/cursor-stream-json.jsonl; a documentação
// pública não descreve o consumo):
// - `system`/`init` traz em `model` o nome de exibição do modelo que rodou ("Composer 2.5");
// - `tool_call` sai duas vezes por chamada (`started` e `completed`), com a ferramenta como a chave de
//   `tool_call` (`{"readToolCall": {...}}`; MCP é `{"mcpToolCall": {"args": {"providerIdentifier",
//   "toolName"}}}`);
// - `result` traz `usage` em camelCase (`inputTokens` já sem o cache, `outputTokens`,
//   `cacheReadTokens`, `cacheWriteTokens`).
// O Kimi continua só pela documentação, que não promete bloco de consumo: por isso a ausência de
// `usage` é tratada como caso normal — ver o comentário em `report()`.
import type { AiRunTokens, InventoryItem, InventoryKind, RunReport } from '../../shared/log';
import { asList, asNumber, asObject, asText, cut, type Json } from './json';
import type { OutputReader, OutputStream } from './reader';

/** Tamanho de uma linha que não é JSON, como o modo texto já corta hoje. */
const RAW_MAX = 300;

/** `mcp__servidor__ferramenta` → `servidor/ferramenta`: o mesmo corte no primeiro `__` depois do
 * prefixo que `claude.ts` usa, porque nome de servidor com `_` é comum e com `/` não é. */
function mcpSplit(name: string): string {
  const rest = name.slice('mcp__'.length);
  const at = rest.indexOf('__');
  return at < 0 ? rest : `${rest.slice(0, at)}/${rest.slice(at + 2)}`;
}

export function streamReader(): OutputReader {
  let sawEvent = false;
  let sessionId: string | null = null;
  /** `kind\0name` → chamadas */
  const inventory = new Map<string, number>();
  /** os blocos de texto do assistente, reserva da resposta para quando nenhum `result` trouxe texto */
  const saidText: string[] = [];
  /** o texto de cada `result` que trouxe um (na ordem de chegada); a resposta é o último */
  const resultTexts: string[] = [];
  /** o consumo do último `result` que trouxe um bloco `usage`; `null` enquanto nenhum trouxe */
  let tokens: AiRunTokens | null = null;

  const count = (kind: InventoryKind, name: string): void => {
    const key = `${kind}\u0000${name}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
  };

  const onAssistant = (o: Json): string[] => {
    const message = asObject(o.message);
    const blocks = asList(message?.content)
      .map((b) => asObject(b))
      .filter((b): b is Json => !!b && asText(b.type) === 'text');
    // forma 1 (como no Claude): blocos de texto em `message.content`; forma 2, de reserva: uma
    // string solta em `message.text` ou em `text`, no nível do evento
    const texts = blocks.length ? blocks.map((b) => asText(b.text)) : [asText(message?.text) ?? asText(o.text)];
    const lines: string[] = [];
    for (const text of texts) {
      if (!text) continue;
      saidText.push(text);
      lines.push(...text.split('\n'));
    }
    return lines;
  };

  const onToolCall = (o: Json): string[] => {
    // o Cursor manda cada chamada ao começar e de novo ao terminar: conta só o começo
    if (asText(o.subtype) === 'completed') return [];
    const call = asObject(o.tool_call);
    if (call) return onCursorCall(call);
    // os três nomes que aparecem por aí para a mesma coisa; sem nenhum deles, a chamada não conta
    const name = asText(o.name) ?? asText(o.tool_name) ?? asText(o.tool);
    if (!name) return [];
    if (name.startsWith('mcp__')) count('mcp_tool', mcpSplit(name));
    else count('tool', name);
    return [name];
  };

  /** `{"readToolCall": {...}}` → `read`; `{"mcpToolCall": {"args": {...}}}` → `servidor/ferramenta`. */
  const onCursorCall = (call: Json): string[] => {
    // o objeto traz outras chaves junto da ferramenta (`toolCallId`, `startedAtMs`,
    // `hookAdditionalContexts`): vale a que nomeia a ferramenta, não a primeira
    const [key, value] = Object.entries(call).find(([k]) => k.endsWith('ToolCall') || k === 'function') ?? [];
    if (!key) return [];
    const body = asObject(value);
    // forma de reserva da documentação para as demais: `{"function": {"name": ...}}`
    if (key === 'function') {
      const name = asText(body?.name);
      if (!name) return [];
      count('tool', name);
      return [name];
    }
    if (key === 'mcpToolCall') {
      const args = asObject(body?.args);
      const server = asText(args?.providerIdentifier) ?? asText(args?.serverIdentifier);
      const tool = asText(args?.toolName) ?? asText(args?.name);
      if (!tool) return [];
      const name = server ? `${server}/${tool}` : tool;
      count('mcp_tool', name);
      return [name];
    }
    const name = key.replace(/ToolCall$/, '');
    count('tool', name);
    return [name];
  };

  const onResult = (o: Json): string[] => {
    const text = asText(o.result) ?? asText(o.text);
    if (text) resultTexts.push(text);
    const usage = asObject(o.usage);
    if (usage) {
      // os nomes no estilo do Claude ou em camelCase (o Cursor); sem nenhum conhecido, o bloco não
      // vira um consumo de zero, que pareceria medido
      const pick = (...names: string[]) => names.map((n) => asNumber(usage[n])).find((v) => v !== null && v !== undefined);
      const read = {
        inputTokens: pick('input_tokens', 'inputTokens'),
        outputTokens: pick('output_tokens', 'outputTokens'),
        cacheReadTokens: pick('cache_read_input_tokens', 'cache_read_tokens', 'cacheReadTokens'),
        cacheWriteTokens: pick('cache_creation_input_tokens', 'cache_write_tokens', 'cacheWriteTokens'),
      };
      if (Object.values(read).some((v) => v !== undefined))
        tokens = {
          inputTokens: read.inputTokens ?? 0,
          outputTokens: read.outputTokens ?? 0,
          cacheReadTokens: read.cacheReadTokens ?? 0,
          cacheWriteTokens: read.cacheWriteTokens ?? 0,
        };
    }
    const failed = o.is_error === true || asText(o.subtype) === 'error';
    return [failed ? 'Terminou com erro' : 'Pronto'];
  };

  return {
    push(line: string, stream: OutputStream): string[] {
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
      // o id da sessão pode vir em qualquer evento; captura o primeiro que trouxer
      sessionId ??= asText(o.session_id);
      switch (type) {
        case 'assistant':
          return onAssistant(o);
        case 'tool_call':
          return onToolCall(o);
        case 'result':
          return onResult(o);
        // `system`: não há como saber que campos cada CLI põe ali além do `session_id`, já
        // capturado acima; e qualquer tipo que a próxima versão trouxer
        default:
          return [];
      }
    },

    report(): RunReport {
      const items: InventoryItem[] = [...inventory.entries()].map(([key, calls]) => {
        const [kind, name] = key.split('\u0000');
        return { kind: kind as InventoryKind, name: name!, calls };
      });
      // a resposta é o texto do ÚLTIMO `result`; sem nenhum `result` com texto, cai para o que o
      // assistente disse
      const answer = resultTexts.at(-1) ?? saidText.join('\n');

      if (tokens) {
        // nem Cursor nem Kimi informam custo, e o board não o calcula: só os tokens são medidos
        return {
          measure: 'full',
          consumption: {
            ...tokens,
            // nenhum dos dois formatos promete contagem de turno
            turns: null,
            sessionId,
            costUsd: null,
          },
          inventory: items,
          answer,
          reason: null,
        };
      }

      // O CASO CENTRAL deste leitor, e não a exceção: a documentação de Cursor e Kimi não promete
      // bloco de uso, então ler eventos e montar inventário sem nenhum `usage` é o que normalmente
      // vai acontecer. `measure: 'none'` exigiria jogar fora um inventário verdadeiro só para caber
      // no rótulo mais simples — e a invariante do `RunReport` (em `src/shared/log.ts`) proíbe isso:
      // `measure === 'none'` só vale quando consumo E inventário estão vazios JUNTO. Com inventário
      // não vazio e consumo nulo, o rótulo correto é `partial`: ele diz exatamente o que houve
      // (inventário sim, consumo não) sem inventar nem apagar fato. Resista à tentação de "simplificar"
      // isto para `none` — perderia informação real de graça.
      if (items.length) return { measure: 'partial', consumption: null, inventory: items, answer, reason: null };
      return { measure: 'none', consumption: null, inventory: [], answer, reason: null };
    },

    get sawEvent(): boolean {
      return sawEvent;
    },
  };
}
