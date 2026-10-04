// Leitor genérico de `stream-json`, usado por Cursor e Kimi. Como `codex.ts` (passo 5), construído
// só pela documentação de referência — nenhuma das duas CLIs está instalada nesta máquina, não há
// execução de prova. A diferença para o Claude (único formato medido contra saída real, em
// `claude.ts`) e para o Codex (que ao menos promete um bloco `usage` por turno) é que a documentação
// de Cursor e Kimi descreve os eventos `system`, `assistant`, `tool_call` e `result` no espírito do
// formato do Claude Code, mas NÃO promete nenhum bloco de consumo. Por isso este leitor trata a
// ausência de `usage` como o caso normal, não como exceção — ver o comentário em `report()`.
import type { AiRunTokens, InventoryItem, InventoryKind, RunReport } from '../../shared/log';
import { asList, asNumber, asObject, asText, cut, type Json } from './json';
import { costOf } from './price';
import type { OutputReader, OutputStream, ReaderDeps } from './reader';

/** Tamanho de uma linha que não é JSON, como o modo texto já corta hoje. */
const RAW_MAX = 300;

/** `mcp__servidor__ferramenta` → `servidor/ferramenta`: o mesmo corte no primeiro `__` depois do
 * prefixo que `claude.ts` usa, porque nome de servidor com `_` é comum e com `/` não é. */
function mcpSplit(name: string): string {
  const rest = name.slice('mcp__'.length);
  const at = rest.indexOf('__');
  return at < 0 ? rest : `${rest.slice(0, at)}/${rest.slice(at + 2)}`;
}

export function streamReader(deps: ReaderDeps): OutputReader {
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
    // os três nomes que aparecem por aí para a mesma coisa; sem nenhum deles, a chamada não conta
    const name = asText(o.name) ?? asText(o.tool_name) ?? asText(o.tool);
    if (!name) return [];
    if (name.startsWith('mcp__')) count('mcp_tool', mcpSplit(name));
    else count('tool', name);
    return [name];
  };

  const onResult = (o: Json): string[] => {
    const text = asText(o.result) ?? asText(o.text);
    if (text) resultTexts.push(text);
    const usage = asObject(o.usage);
    if (usage) {
      tokens = {
        inputTokens: asNumber(usage.input_tokens) ?? 0,
        outputTokens: asNumber(usage.output_tokens) ?? 0,
        cacheReadTokens: asNumber(usage.cache_read_input_tokens) ?? 0,
        cacheWriteTokens: asNumber(usage.cache_creation_input_tokens) ?? 0,
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
        // nem Cursor nem Kimi informam custo: a estimativa sai do preço do catálogo, pelo modelo que
        // o board pediu (o fluxo não diz qual rodou); sem `deps.model`, não há de onde estimar
        const byModel = deps.model !== null ? new Map([[deps.model, tokens]]) : null;
        const estimated = byModel ? costOf(deps.catalog, byModel) : null;
        return {
          measure: 'full',
          consumption: {
            ...tokens,
            // nenhum dos dois formatos promete contagem de turno
            turns: null,
            sessionId,
            costUsd: estimated,
            costEstimated: estimated !== null,
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
