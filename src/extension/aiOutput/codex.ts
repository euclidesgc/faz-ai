// Leitor do `codex exec --json`. ATENÇÃO para quem mexer aqui: ao contrário de `claude.ts` (passo 4),
// que foi medido contra saída real de `claude 2.1.278`, o Codex não está instalado nesta máquina —
// não há nenhuma execução de prova. Este leitor é construído só pela documentação de referência que
// `headless.ts` já cita (learn.chatgpt.com/docs/non-interactive-mode: eventos `thread.started`,
// `turn.started`, `turn.completed`/`turn.failed` e `item.started`/`item.updated`/`item.completed`).
// É best-effort por desenho: onde a doc não promete um campo, a ausência dele fica ausente
// (`measure` sem aquele consumo), nunca um zero — um `0` soma e parece certo, que é exatamente o
// erro que a skill `error-handling` pede para não cometer com dinheiro.
//
// Diferença mais importante em relação ao Claude, e o ponto onde é fácil errar por simetria: aqui o
// `usage` de `turn.completed` é POR TURNO e os turnos SE SOMAM. No Claude, `modelUsage` é cumulativo
// da sessão inteira e se toma só o ÚLTIMO. São o oposto um do outro — e é por isso que existe um
// leitor por formato, em vez de um leitor genérico "que entende todos".
import type { AiRunTokens, InventoryItem, InventoryKind, RunReport } from '../../shared/log';
import { asList, asNumber, asObject, asText, cut, type Json } from './json';
import { costOf } from './price';
import type { OutputReader, OutputStream, ReaderDeps } from './reader';

/** Tamanho do comando mostrado na linha de uma execução de shell. */
const ARG_MAX = 80;
/** Tamanho de uma linha que não é JSON, como o modo texto já corta hoje. */
const RAW_MAX = 300;

const ZERO: AiRunTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

const addTokens = (a: AiRunTokens, b: AiRunTokens): AiRunTokens => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

/**
 * Os contadores de um bloco `usage` de `turn.completed`. Dois pontos que a doc apresenta de um jeito
 * que convida a errar:
 * - `reasoning_output_tokens` NÃO entra na soma: a mesma coisa foi medida duas vezes no probe do
 *   Claude Code (o `thinkingTokens` já vem DENTRO do `outputTokens`) e a doc do Codex expõe o campo
 *   do mesmo jeito, como irmão de `output_tokens` e não como extra. Somar aqui infla a saída.
 * - a criação de cache: a página de referência do modo não interativo não lista o campo, mas o
 *   fonte da CLI (`exec_events.rs`) tem `cache_write_input_tokens` no `usage`. Lemos o campo quando
 *   ele vier, em vez de fixar 0: fixar 0 subnotificaria a criação de cache em toda execução, e o
 *   cache é justamente o que pesa na conta. Quando o campo não vier, 0 é o único valor que o tipo
 *   permite — e aí é o `measure` da execução, não este número, que diz se houve medição.
 */
function tokensFromUsage(v: Json): AiRunTokens {
  const cached = asNumber(v.cached_input_tokens) ?? 0;
  return {
    // no Codex `input_tokens` JÁ inclui `cached_input_tokens` (no Claude são contadores separados):
    // a entrada gravada é só o que não veio do cache, senão o cache conta duas vezes — nos tokens e no
    // custo estimado, que cobraria esses tokens pelo preço cheio e pelo de cache. Nunca negativo.
    inputTokens: Math.max(0, (asNumber(v.input_tokens) ?? 0) - cached),
    outputTokens: asNumber(v.output_tokens) ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: asNumber(v.cache_write_input_tokens) ?? 0,
  };
}

/**
 * O inventário de um `item.completed`, pelo mapa que a doc descreve — e só pelo que ela descreve:
 * tipo desconhecido (incluindo `reasoning`, `agent_message` e `todo_list`, que a doc também lista,
 * só que como "não é ferramenta") não conta nada, em vez de virar lixo no painel.
 */
function inventoryOf(item: Json): { kind: InventoryKind; name: string } | null {
  switch (asText(item.type)) {
    case 'command_execution':
      return { kind: 'tool', name: 'Shell' };
    case 'file_change':
      return { kind: 'tool', name: 'Edit' };
    case 'web_search':
      return { kind: 'tool', name: 'WebSearch' };
    case 'mcp_tool_call': {
      const server = asText(item.server);
      const tool = asText(item.tool);
      // se faltar um dos dois, usa o que houver: a chamada aconteceu e não pode se perder por causa
      // de um campo que faltou
      return { kind: 'mcp_tool', name: server && tool ? `${server}/${tool}` : (server ?? tool ?? 'mcp_tool_call') };
    }
    default:
      return null;
  }
}

/** A linha legível de um `item.completed` que não é `agent_message` (que tem tratamento próprio). */
function lineOf(item: Json): string | null {
  switch (asText(item.type)) {
    case 'command_execution': {
      const command = asText(item.command);
      return command ? `Shell(${cut(command, ARG_MAX)})` : 'Shell';
    }
    case 'file_change': {
      const first = asObject(asList(item.changes)[0]);
      const path = first && asText(first.path);
      const name = path ? (path.split(/[/\\]/).pop() ?? path) : null;
      return name ? `Edit(${name})` : 'Edit';
    }
    case 'mcp_tool_call': {
      const server = asText(item.server);
      const tool = asText(item.tool);
      return server && tool ? `${server}/${tool}` : (server ?? tool ?? null);
    }
    // `web_search`, `reasoning`, `agent_message` (tratado à parte), `todo_list` e qualquer tipo que
    // a próxima versão trouxer: evento entendido que não vira linha
    default:
      return null;
  }
}

export function codexReader(deps: ReaderDeps): OutputReader {
  let sawEvent = false;
  let sessionId: string | null = null;
  /** quantidade de eventos `turn.completed`; é o único campo do turno que se soma (ao contrário do Claude) */
  let turns = 0;
  /** se ao menos um `turn.completed` trouxe um bloco `usage` legível */
  let sawUsage = false;
  let tokens = ZERO;
  /** `kind\0name` → chamadas */
  const inventory = new Map<string, number>();
  /** o texto do último `agent_message`; vazio se nenhum chegou */
  let lastAnswer = '';

  const count = (kind: InventoryKind, name: string): void => {
    const key = `${kind}\u0000${name}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
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
      switch (type) {
        case 'thread.started': {
          sessionId ??= asText(o.thread_id) ?? asText(o.id);
          return sessionId ? [`Sessão ${sessionId.slice(0, 8)}`] : [];
        }
        case 'turn.completed': {
          turns += 1;
          const usage = asObject(o.usage);
          if (usage) {
            sawUsage = true;
            tokens = addTokens(tokens, tokensFromUsage(usage));
          }
          return ['Pronto'];
        }
        case 'turn.failed':
          return ['Terminou com erro'];
        case 'item.completed': {
          const item = asObject(o.item);
          if (!item) return [];
          if (asText(item.type) === 'agent_message') {
            const text = asText(item.text);
            if (!text) return [];
            lastAnswer = text;
            return text.split('\n');
          }
          const inv = inventoryOf(item);
          if (inv) count(inv.kind, inv.name);
          const shown = lineOf(item);
          return shown ? [shown] : [];
        }
        // `item.started`, `item.updated` e `turn.started`: o acontecimento ainda não terminou, nada
        // para mostrar; e qualquer tipo que a próxima versão trouxer
        default:
          return [];
      }
    },

    report(): RunReport {
      const items: InventoryItem[] = [...inventory.entries()].map(([key, calls]) => {
        const [kind, name] = key.split('\u0000');
        return { kind: kind as InventoryKind, name: name!, calls };
      });

      if (sawUsage) {
        // o Codex não informa custo: a estimativa sai do preço do catálogo, pelo modelo que o board
        // pediu na linha de comando (o fluxo não diz qual modelo rodou). Sem `deps.model`, não há de
        // onde estimar — os tokens continuam gravados, só o dinheiro fica sem número.
        const byModel = deps.model !== null ? new Map([[deps.model, tokens]]) : null;
        const estimated = byModel ? costOf(deps.catalog, byModel) : null;
        return {
          measure: 'full',
          consumption: {
            ...tokens,
            turns,
            sessionId,
            costUsd: estimated,
            costEstimated: estimated !== null,
          },
          inventory: items,
          answer: lastAnswer,
          reason: null,
        };
      }

      // leu eventos (inventário e/ou texto) mas nenhum `turn.completed` trouxe `usage`: o inventário
      // vale, o consumo não existe. Não é `none` — a invariante de `RunReport` é que `none` só vale
      // quando consumo E inventário estão vazios junto; jogar o inventário fora para caber no rótulo
      // mais simples perderia um fato verdadeiro de graça.
      if (sawEvent) return { measure: 'partial', consumption: null, inventory: items, answer: lastAnswer, reason: null };
      return { measure: 'none', consumption: null, inventory: [], answer: lastAnswer, reason: null };
    },

    get sawEvent(): boolean {
      return sawEvent;
    },
  };
}
