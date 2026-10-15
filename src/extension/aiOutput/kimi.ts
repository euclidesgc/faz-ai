// Leitor do `stream-json` do Kimi Code (`kimi -p --output-format stream-json`), conferido contra a
// CLI 2.1.1 (test/fixtures/kimi-stream-json.jsonl; a documentação mostra o formato, mas não detalha
// consumo):
// - cada linha é um JSON com `role`: `meta` (`system.version` na abertura, `session.resume_hint` no
//   fim), `assistant` (texto em `content` e/ou `tool_calls` no estilo OpenAI, com
//   `function: { name, arguments }`) e `tool` (o resultado, ligado pelo `tool_call_id`);
// - a CLI não emite totais de uso: sem custo nem tokens, a execução fica sem consumo medido. Se uma
//   versão futura trouxer um bloco de uso, é aqui que ele entra.
import type { InventoryItem, InventoryKind, RunReport } from '../../shared/log';
import { asList, asObject, asText, cut, type Json } from './json';
import type { OutputReader, OutputStream } from './reader';

/** Tamanho de uma linha que não é JSON, como o modo texto já corta hoje. */
const RAW_MAX = 300;

/** `mcp__servidor__ferramenta` → `servidor/ferramenta`: a mesma regra do leitor do Cursor. */
function mcpSplit(name: string): string {
  const rest = name.slice('mcp__'.length);
  const at = rest.indexOf('__');
  return at < 0 ? rest : `${rest.slice(0, at)}/${rest.slice(at + 2)}`;
}

/** O erro de cota da CLI: `provider.auth_error: 403 You've reached your 5-hour usage limit...`. */
const USAGE_LIMIT = /provider\.auth_error[\s\S]*\b403\b[\s\S]*usage limit/i;

export function kimiReader(): OutputReader {
  let sawEvent = false;
  let usageLimitReached = false;
  /** `kind\0name` → chamadas */
  const inventory = new Map<string, number>();
  /** os textos que o assistente escreveu, na ordem; a resposta é o último (a mensagem final é a entrega) */
  const saidText: string[] = [];

  const count = (kind: InventoryKind, name: string): void => {
    const key = `${kind}\u0000${name}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
  };

  const onAssistant = (o: Json): string[] => {
    const lines: string[] = [];
    const text = asText(o.content);
    if (text) {
      saidText.push(text);
      lines.push(...text.split('\n'));
    }
    for (const raw of asList(o.tool_calls)) {
      const call = asObject(raw);
      const fn = asObject(call?.function);
      const name = asText(fn?.name);
      if (!name) continue;
      // no canal e no inventário o nome legível: `mcp__faz-ai__get_board` vira `faz-ai/get_board`
      const display = name.startsWith('mcp__') ? mcpSplit(name) : name;
      count(name.startsWith('mcp__') ? 'mcp_tool' : 'tool', display);
      lines.push(display);
    }
    return lines;
  };

  return {
    push(line: string, stream: OutputStream): string[] {
      // a cota esgotada vem como texto (stderr) ou como linha fora do stream: vale nos dois
      if (USAGE_LIMIT.test(line)) usageLimitReached = true;
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
      const role = o && asText(o.role);
      if (!o || !role) return [cut(line, RAW_MAX)];
      sawEvent = true;
      switch (role) {
        case 'assistant':
          return onAssistant(o);
        // `tool` (o resultado de cada chamada) é detalhe de execução, não linha de canal; `meta`
        // (versão, id da sessão) é ruído para quem lê
        default:
          return [];
      }
    },

    report(): RunReport {
      const items: InventoryItem[] = [...inventory.entries()].map(([key, calls]) => {
        const [kind, name] = key.split('\u0000');
        return { kind: kind as InventoryKind, name: name!, calls };
      });
      const answer = saidText.at(-1) ?? '';
      // sem consumo da CLI: com inventário, `partial` diz o que houve (inventário sim, consumo não);
      // a invariante do RunReport proíbe `none` com inventário não vazio (ver o leitor do Cursor)
      if (items.length) return { measure: 'partial', consumption: null, inventory: items, answer, reason: null, usageLimitReached };
      return { measure: 'none', consumption: null, inventory: [], answer, reason: null, usageLimitReached };
    },

    get sawEvent(): boolean {
      return sawEvent;
    },
  };
}
