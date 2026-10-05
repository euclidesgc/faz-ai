// Leitor do `stream-json` do Claude Code — o único formato desta entrega verificado contra saída
// REAL (`claude 2.1.278`, execução de prova com subagente, 219 eventos, dois eventos `result`). O
// fixture `test/fixtures/claude-stream-json.jsonl` é essa saída, enxugada e anonimizada.
//
// Sete medições do probe que parecem erro para quem chega aqui sem ler a Spec e que, "corrigidas"
// por simetria, produzem número errado com cara de certo:
//
// 1. O consumo sai de `modelUsage`, NÃO da soma dos `usage` dos eventos `result`. No probe a soma
//    dos `usage` dava 910 tokens de saída contra 1.221 reais: `usage` é do SEGMENTO e o consumo do
//    subagente não está em nenhum dos dois. `modelUsage` é cumulativo da sessão e é o único bloco
//    que inclui o subagente.
// 2. `modelUsage` é idêntico nos dois eventos `result`: toma-se o ÚLTIMO, nunca a soma.
// 3. `total_cost_usd` também é cumulativo e idêntico nos dois: somar dobraria o custo.
// 4. `num_turns` é do segmento (4 e 1) e é o ÚNICO campo do `result` que se soma — e é justamente o
//    que mais parece que não se deveria somar.
// 5. `thinkingTokens` (593) já está DENTRO de `outputTokens` (1.221): somar inflaria a saída em
//    mais de 50%.
// 6. O inventário sai só dos blocos `tool_use`, nunca de `system/init`. O `init` lista o que
//    ESTAVA disponível (no probe, dezenas de skills, nenhuma usada) e apareceu DUAS vezes na mesma
//    sessão: tratá-lo como "começo da sessão" erra duas vezes.
// 7. A ferramenta de subagente é `Agent` nesta versão e era `Task` na anterior: os dois valem.
//    Trocar o nome de uma ferramenta é exatamente a mudança de versão que não pode apagar o
//    inventário.
//
// O `reason` do relatório fica sempre `null` aqui: o leitor não sabe o rótulo da ferramenta nem por
// que a medição não aconteceu — quem sabe é o transporte (`measured.ts`), que põe ali a frase do
// erro de domínio. Não complete este campo neste arquivo.
import type { AiRunTokens, InventoryItem, InventoryKind, RunReport } from '../../shared/log';
import { asList, asNumber, asObject, asText, cut, type Json } from './json';
import { costOf } from './price';
import type { OutputReader, OutputStream, ReaderDeps } from './reader';

/** Tamanho do argumento mostrado na linha de uma chamada de ferramenta. */
const ARG_MAX = 80;
/** Tamanho do começo da mensagem de erro de uma ferramenta, no canal de log. */
const ERROR_MAX = 200;
/** Tamanho de uma linha que não é JSON, como o modo texto já corta hoje. */
const RAW_MAX = 300;

/** Os nomes da ferramenta de subagente: `Agent` nesta versão da CLI, `Task` na anterior. */
const AGENT_TOOLS = ['Agent', 'Task'];

/**
 * O argumento que identifica a chamada, na ordem em que vale a pena mostrar. `file_path` aparece
 * só pelo nome do arquivo: o caminho inteiro empurraria o resto da linha para fora. `subagent_type`
 * e `skill` vêm antes de `description` porque identificam melhor a chamada — uma chamada de
 * subagente tem as duas coisas, e `Agent(Explore)` diz mais que `Agent(Listar arquivos markdown)`.
 */
const ARG_FIELDS = ['file_path', 'subagent_type', 'skill', 'pattern', 'description', 'command'];

/** O que vai em `name` no inventário, a partir do nome da ferramenta e dos argumentos da chamada. */
function inventoryOf(name: string, input: Json | null): { kind: InventoryKind; name: string } {
  if (AGENT_TOOLS.includes(name)) {
    const type = asText(input?.subagent_type);
    // sem o tipo do subagente a chamada ainda aconteceu: entra como ferramenta, para o fato não se perder
    return type ? { kind: 'agent', name: type } : { kind: 'tool', name };
  }
  if (name === 'Skill') {
    const skill = asText(input?.skill);
    return skill ? { kind: 'skill', name: skill } : { kind: 'tool', name };
  }
  if (name.startsWith('mcp__')) {
    const rest = name.slice('mcp__'.length);
    // o separador é o PRIMEIRO `__` depois do prefixo: nome de servidor com `_` é comum, com `/` não
    const at = rest.indexOf('__');
    return { kind: 'mcp_tool', name: at < 0 ? rest : `${rest.slice(0, at)}/${rest.slice(at + 2)}` };
  }
  return { kind: 'tool', name };
}

/** A linha legível de uma chamada de ferramenta: o nome e um argumento conhecido. */
function toolLine(name: string, input: Json | null): string {
  // o nome do servidor MCP já está no nome da ferramenta, e é assim que a pessoa o vê na CLI
  if (name.startsWith('mcp__')) return name;
  for (const field of ARG_FIELDS) {
    const value = asText(input?.[field]);
    if (!value) continue;
    const shown = field === 'file_path' ? value.split(/[/\\]/).pop() || value : value;
    return `${name}(${cut(shown, ARG_MAX)})`;
  }
  return name;
}

/** O texto de um `tool_result`, que vem como string ou como lista de blocos. */
function resultText(content: unknown): string {
  const text = asText(content);
  if (text) return text;
  return asList(content)
    .map((b) => asText(asObject(b)?.text) ?? '')
    .filter(Boolean)
    .join(' ');
}

/** Os quatro contadores de um bloco `modelUsage` (nomes em camelCase, como a CLI escreve). */
function tokensFromModelUsage(v: Json): AiRunTokens {
  return {
    inputTokens: asNumber(v.inputTokens) ?? 0,
    outputTokens: asNumber(v.outputTokens) ?? 0,
    cacheReadTokens: asNumber(v.cacheReadInputTokens) ?? 0,
    cacheWriteTokens: asNumber(v.cacheCreationInputTokens) ?? 0,
  };
}

/** Os quatro contadores de um bloco `usage` (nomes em snake_case, como a API escreve). */
function tokensFromUsage(v: Json): AiRunTokens {
  return {
    inputTokens: asNumber(v.input_tokens) ?? 0,
    outputTokens: asNumber(v.output_tokens) ?? 0,
    cacheReadTokens: asNumber(v.cache_read_input_tokens) ?? 0,
    cacheWriteTokens: asNumber(v.cache_creation_input_tokens) ?? 0,
  };
}

const addTokens = (a: AiRunTokens, b: AiRunTokens): AiRunTokens => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

const ZERO: AiRunTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** O evento `result` de um segmento de turno, reduzido ao que é medida. */
interface ResultEvent {
  /** consumo cumulativo da sessão, por modelo; `null` quando a versão da CLI não trouxe o bloco */
  byModel: Map<string, AiRunTokens> | null;
  /** consumo do segmento, a reserva de quando `modelUsage` não existe */
  segment: AiRunTokens | null;
  costUsd: number | null;
  turns: number | null;
  text: string;
}

export function claudeReader(deps: ReaderDeps): OutputReader {
  let sawEvent = false;
  let sessionId: string | null = null;
  let introduced = false;
  const results: ResultEvent[] = [];
  /** `tool_use_id` → nome da ferramenta, para a linha que explica o erro dela */
  const calledTools = new Map<string, string>();
  /** `task_id` → tipo do subagente, porque o evento de conclusão não repete o tipo */
  const tasks = new Map<string, string>();
  /** `kind\0name` → chamadas */
  const inventory = new Map<string, number>();
  /** os blocos de texto do assistente, que são a resposta quando nenhum `result` chegou */
  const saidText: string[] = [];
  /** `message.id` → consumo daquela mensagem, para o caso de o fluxo truncar antes do `result` */
  const byMessage = new Map<string, { model: string; tokens: AiRunTokens }>();

  const remember = (o: Json): void => {
    sessionId ??= asText(o.session_id);
  };

  const count = (kind: InventoryKind, name: string): void => {
    const key = `${kind}\u0000${name}`;
    inventory.set(key, (inventory.get(key) ?? 0) + 1);
  };

  const onAssistant = (o: Json): string[] => {
    const message = asObject(o.message);
    if (!message) return [];
    const id = asText(message.id);
    const usage = asObject(message.usage);
    // a última versão de cada mensagem vale: o `usage` do evento é o acumulado até ali
    if (id && usage) byMessage.set(id, { model: asText(message.model) ?? '', tokens: tokensFromUsage(usage) });
    const lines: string[] = [];
    for (const raw of asList(message.content)) {
      const block = asObject(raw);
      const type = asText(block?.type);
      if (!block || !type) continue;
      // o raciocínio não é acontecimento: não vira linha
      if (type === 'text') {
        const text = asText(block.text);
        if (text) {
          saidText.push(text);
          lines.push(...text.split('\n'));
        }
      } else if (type === 'tool_use') {
        const name = asText(block.name);
        if (!name) continue;
        const input = asObject(block.input);
        const id = asText(block.id);
        if (id) calledTools.set(id, name);
        const item = inventoryOf(name, input);
        // a chamada de `Agent` conta uma vez, como subagente, e não também como ferramenta
        count(item.kind, item.name);
        lines.push(toolLine(name, input));
      }
    }
    return lines;
  };

  const onUser = (o: Json): string[] => {
    const message = asObject(o.message);
    const lines: string[] = [];
    for (const raw of asList(message?.content)) {
      const block = asObject(raw);
      if (asText(block?.type) !== 'tool_result' || block?.is_error !== true) continue;
      const name = calledTools.get(asText(block.tool_use_id) ?? '') ?? 'uma ferramenta';
      const text = resultText(block.content);
      // é esta linha que explica a falha nas últimas linhas que vão para a conversa do card
      lines.push(text ? `Erro em ${name}: ${cut(text, ERROR_MAX)}` : `Erro em ${name}.`);
    }
    return lines;
  };

  const onSystem = (o: Json): string[] => {
    switch (asText(o.subtype)) {
      case 'init': {
        // o `init` aparece mais de uma vez na mesma sessão: a apresentação é uma só
        if (introduced) return [];
        introduced = true;
        const parts = [
          sessionId ? `Sessão ${sessionId.slice(0, 8)}` : null,
          asText(o.model),
          asText(o.claude_code_version) ? `CLI ${asText(o.claude_code_version)!}` : null,
        ].filter(Boolean);
        return parts.length ? [parts.join(' · ')] : [];
      }
      case 'task_started': {
        const type = asText(o.subagent_type);
        const id = asText(o.task_id);
        if (type && id) tasks.set(id, type);
        const description = asText(o.description);
        const who = `Subagente ${type ?? 'em segundo plano'}`;
        return [description ? `${who} iniciado: ${cut(description, ARG_MAX)}` : `${who} iniciado.`];
      }
      case 'task_updated': {
        if (asText(asObject(o.patch)?.status) !== 'completed') return [];
        const type = tasks.get(asText(o.task_id) ?? '');
        return [`Subagente ${type ?? 'em segundo plano'} concluído`];
      }
      // `thinking_tokens` (84% do fluxo no probe), `hook_*`, `background_tasks_changed`,
      // `task_progress` e `task_notification` não são acontecimento que a pessoa precise ler
      default:
        return [];
    }
  };

  const onResult = (o: Json): string[] => {
    const modelUsage = asObject(o.modelUsage);
    const byModel = modelUsage
      ? new Map(
          Object.entries(modelUsage).flatMap(([name, raw]) => {
            const v = asObject(raw);
            return v ? [[name, tokensFromModelUsage(v)] as [string, AiRunTokens]] : [];
          }),
        )
      : null;
    const usage = asObject(o.usage);
    results.push({
      byModel: byModel?.size ? byModel : null,
      segment: usage ? tokensFromUsage(usage) : null,
      costUsd: asNumber(o.total_cost_usd),
      turns: asNumber(o.num_turns),
      text: asText(o.result) ?? '',
    });
    return [o.is_error === true || asText(o.subtype) === 'error' ? 'Terminou com erro' : 'Pronto'];
  };

  return {
    push(line: string, stream: OutputStream): string[] {
      // o stderr é texto de gente: nunca passa pelo interpretador, senão todo aviso da ferramenta
      // viraria "saída estruturada quebrada"
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
      remember(o);
      switch (type) {
        case 'system':
          return onSystem(o);
        case 'assistant':
          return onAssistant(o);
        case 'user':
          return onUser(o);
        case 'result':
          return onResult(o);
        // `rate_limit_event` e o que a próxima versão trouxer: evento entendido que não vira linha
        default:
          return [];
      }
    },

    report(): RunReport {
      const items: InventoryItem[] = [...inventory.entries()].map(([key, calls]) => {
        const [kind, name] = key.split('\u0000');
        return { kind: kind as InventoryKind, name: name!, calls };
      });
      // `num_turns` é do segmento: é o único campo do `result` que se soma
      const turned = results.filter((r) => r.turns !== null);
      const turns = turned.length ? turned.reduce((sum, r) => sum + r.turns!, 0) : null;
      const last = results.at(-1);
      // o texto do ÚLTIMO `result` que tem texto: no probe o primeiro dizia "o subagente foi lançado e
      // está trabalhando" e o segundo trazia a resposta de verdade
      const reversed = [...results].reverse();
      const answer = reversed.find((r) => r.text)?.text ?? saidText.join('\n');

      // o consumo da sessão: `modelUsage` do ÚLTIMO `result` (é cumulativo e igual nos dois) e, de
      // reserva, a soma dos `usage` dos segmentos — que não cobre o subagente, mas é melhor que nada
      const byModel =
        last?.byModel ??
        (results.some((r) => r.segment)
          ? new Map([[deps.model ?? '', results.reduce((sum, r) => addTokens(sum, r.segment ?? ZERO), ZERO)]])
          : null);

      if (byModel) {
        const tokens = [...byModel.values()].reduce(addTokens, ZERO);
        const informed = reversed.find((r) => r.costUsd !== null)?.costUsd ?? null;
        const estimated = informed === null ? costOf(deps.catalog, byModel) : null;
        return {
          measure: 'full',
          consumption: {
            ...tokens,
            turns,
            sessionId,
            costUsd: informed ?? estimated,
            costEstimated: informed === null && estimated !== null,
          },
          inventory: items,
          answer,
          reason: null,
        };
      }

      // o fluxo truncou antes do evento final. O que foi lido vale e não é total: a entrada e o
      // cache saem certos dos eventos do assistente, mas a SAÍDA é a contagem corrente do fluxo e
      // fica muito abaixo da real (no probe, 11 contra 1.221) — é exatamente por isso que isto é
      // `partial` e não tem custo: um custo parcial seria somável com os completos no painel.
      if (byMessage.size) {
        const perModel = new Map<string, AiRunTokens>();
        for (const { model, tokens } of byMessage.values()) perModel.set(model, addTokens(perModel.get(model) ?? ZERO, tokens));
        const tokens = [...perModel.values()].reduce(addTokens, ZERO);
        return {
          measure: 'partial',
          consumption: { ...tokens, turns, sessionId, costUsd: null, costEstimated: false },
          inventory: items,
          answer,
          reason: null,
        };
      }

      // leu eventos e chamadas de ferramenta, mas nenhum número: o inventário vale, o consumo não
      // existe. `none` só quando não há nem uma coisa nem a outra — é a invariante que impede "não
      // medido" de parecer "medido e zero".
      if (items.length) return { measure: 'partial', consumption: null, inventory: items, answer, reason: null };
      return { measure: 'none', consumption: null, inventory: [], answer, reason: null };
    },

    get sawEvent(): boolean {
      return sawEvent;
    },
  };
}
