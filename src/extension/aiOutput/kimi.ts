// Leitor do `stream-json` do Kimi Code (`kimi -p --output-format stream-json`), conferido contra a
// CLI 2.1.1 (test/fixtures/kimi-stream-json.jsonl) e 2.3.0 (test/fixtures/kimi-stream-json-2.3.0.jsonl;
// a documentação mostra o formato, mas não detalha consumo):
// - cada linha é um JSON com `role`: `meta` (`system.version` na abertura, `session.resume_hint` no
//   fim, com o `session_id`), `assistant` (texto em `content` e/ou `tool_calls` no estilo OpenAI, com
//   `function: { name, arguments }`) e `tool` (o resultado, ligado pelo `tool_call_id`);
// - a CLI não emite totais de uso no stream. Os tokens vêm do registro da sessão que ela grava em disco
//   (`kimiSession.ts`), achado pelo `session_id` do `resume_hint`: lido uma vez, no `report()`. Sem o
//   registro, a execução fica medida só pelo inventário (`partial`), sem estimar valores;
// - a cota esgotada chega no `stderr`, como texto: `error: failed to run prompt: provider.api_error: 429
//   You've reached your 5-hour usage limit…` (CLI 2.1.x–2.3.0; a 2.1.1 também escreveu `provider.auth_error:
//   403` com o mesmo texto). O transporte passa o `stderr` ao leitor só para este sinal.
import type { InventoryItem, InventoryKind, RunReport } from '../../shared/log';
import { asList, asObject, asText, cut, type Json } from './json';
import { readKimiSessionUsage, type KimiSessionUsage } from './kimiSession';
import { skillReadBy } from './skills';

/** Os argumentos da chamada, que o Kimi manda como texto JSON; lixo ou ausência vale `null`. */
function parseArgs(raw: unknown): Json | null {
  const text = asText(raw);
  if (!text) return asObject(raw);
  try {
    return asObject(JSON.parse(text));
  } catch {
    return null;
  }
}
import type { OutputReader, OutputStream, ReaderDeps, ReaderEvent } from './reader';
import { isTransientText } from './transient';

/** Tamanho de uma linha que não é JSON, como o modo texto já corta hoje. */
const RAW_MAX = 300;
/** As ferramentas que lançam uma filha (documentação "Agents" da 2.4.1: `Agent` e `AgentSwarm`). */
const AGENT_TOOLS = ['Agent', 'AgentSwarm'];

/** `mcp__servidor__ferramenta` → `servidor/ferramenta`: a mesma regra do leitor do Cursor. */
function mcpSplit(name: string): string {
  const rest = name.slice('mcp__'.length);
  const at = rest.indexOf('__');
  return at < 0 ? rest : `${rest.slice(0, at)}/${rest.slice(at + 2)}`;
}

/**
 * O erro de cota da CLI: `provider.api_error: 429 You've reached your 5-hour usage limit...` (o que a 2.3.0
 * escreve) ou `provider.auth_error: 403 ...usage limit...` (a 2.1.1). O status sozinho não basta: um 429 de
 * rate limit curto é passageiro, e só o texto de limite de uso é cota.
 */
const USAGE_LIMIT = /provider\.\w*error[\s\S]*\b(403|429)\b[\s\S]*usage limit/i;

/** O que o leitor precisa além do `ReaderDeps` comum: onde achar a sessão gravada (nos testes, uma home falsa). */
export interface KimiReaderDeps extends Partial<ReaderDeps> {
  /** lê os tokens da sessão gravada; o padrão é o arquivo da home. Trocável nos testes do leitor. */
  sessionUsage?: (sessionId: string) => KimiSessionUsage | null;
}

export function kimiReader(deps: KimiReaderDeps = {}): OutputReader {
  let sawEvent = false;
  let usageLimitReached = false;
  // falha passageira: linha de erro fora do stream (stderr/texto cru); a fala da IA nunca liga
  let transientFailure = false;
  /** o id da sessão que a CLI gravou (`session.resume_hint`), chave do registro de consumo */
  let sessionId: string | null = null;
  // a sessão da História: a CLI só escreve o id no fim (`resume_hint`), então na retomada vale o id que o board
  // já sabe, avisado no primeiro evento; na criação, a sessão aberta é avisada no fim, pelo hint
  let opened = false;
  const emit = (event: ReaderEvent): void => deps.onEvent?.(event);
  const announceSession = (id: string): void => {
    if (opened) return;
    opened = true;
    // a CLI não informa na largada o estado dos servidores: a evidência é o arquivo que o board gravou (`mcp.json`)
    emit({ kind: 'mcp-servers', sessionId: id, servers: (deps.mcpServers ?? []).map((name) => ({ name, status: 'configured-by-board' })) });
    emit({ kind: 'session-opened', sessionId: id });
  };
  /** `tool_call_id` de cada chamada de `Agent` à espera do resultado, com o tipo pedido e a descrição */
  const pendingAgentCalls = new Map<string, { name?: string; task?: string }>();
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
      const kind = name.startsWith('mcp__') ? 'mcp_tool' : 'tool';
      count(kind, display);
      const args = parseArgs(fn?.arguments);
      // a skill lida pelo `get_skill` ou pela leitura do SKILL.md conta também como skill; os argumentos vêm em JSON (texto)
      const skill = skillReadBy(kind, display, args);
      if (skill) count('skill', skill);
      // a chamada de `Agent` é a candidata a filha; ela nasce no resultado, que diz o tipo efetivo e o estado
      const callId = asText(call?.id);
      if (AGENT_TOOLS.includes(name) && callId) {
        const type = asText(args?.subagent_type);
        const description = asText(args?.description);
        pendingAgentCalls.set(callId, { ...(type ? { name: type } : {}), ...(description ? { task: description } : {}) });
      }
      lines.push(display);
    }
    return lines;
  };

  /**
   * O resultado da chamada de `Agent` (CLI 2.4.1, sonda de 2026-11-02): texto com `agent_id: agent-0`,
   * `actual_subagent_type: <tipo>`, `status: completed` e `stop_reason`, seguido do resumo da filha.
   */
  const onToolResult = (o: Json): void => {
    const callId = asText(o.tool_call_id);
    const pending = callId ? pendingAgentCalls.get(callId) : undefined;
    if (!callId || !pending) return;
    pendingAgentCalls.delete(callId);
    const content = asText(o.content) ?? '';
    const actual = /^actual_subagent_type:\s*(\S+)/m.exec(content)?.[1];
    const status = /^status:\s*(\S+)/m.exec(content)?.[1]?.toLowerCase();
    // sem tipo efetivo nem estado, a CLI recusou a chamada (tipo desconhecido): nunca houve filha
    if (!actual && !status) return;
    const parent = sessionId ?? deps.resumedSessionId ?? null;
    if (!parent) return;
    const name = actual ?? pending.name;
    emit({
      kind: 'subagent',
      event: {
        source: 'cli',
        kind: 'spawned',
        parentSessionId: parent,
        sessionId: callId,
        ...(name ? { name } : {}),
        ...(pending.task ? { task: pending.task } : {}),
      },
    });
    const state = status === 'completed' ? 'completed' : 'failed';
    emit({ kind: 'subagent', event: { source: 'cli', kind: 'state', parentSessionId: parent, sessionId: callId, state } });
    if (state === 'completed')
      emit({
        kind: 'child-configuration',
        // a filha roda no modelo da sessão: o arquivo de agente do Kimi Code não tem modelo
        configuration: { parentSessionId: parent, sessionId: callId, model: deps.model ?? 'padrão do perfil', effort: null },
      });
  };

  const sessionUsage = (id: string): KimiSessionUsage | null => {
    try {
      if (deps.sessionUsage) return deps.sessionUsage(id);
      return deps.homeDir ? readKimiSessionUsage(id, { homeDir: deps.homeDir }) : null;
    } catch {
      // o registro da sessão é da CLI, não do board: falhar em lê-lo nunca derruba o relatório
      return null;
    }
  };

  return {
    push(line: string, stream: OutputStream): string[] {
      // a cota esgotada vem como texto (stderr) ou como linha fora do stream: vale nos dois
      if (USAGE_LIMIT.test(line)) usageLimitReached = true;
      else if (stream === 'stderr' && isTransientText(line)) transientFailure = true;
      // stderr é texto de gente, nunca passa pelo interpretador
      if (stream === 'stderr') return line ? [cut(line, RAW_MAX)] : [];
      if (!line.trim()) return [];
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // uma linha ruim não invalida as outras: vai para o canal como texto e a leitura segue
        if (isTransientText(line)) transientFailure = true;
        return [cut(line, RAW_MAX)];
      }
      const o = asObject(parsed);
      const role = o && asText(o.role);
      if (!o || !role) return [cut(line, RAW_MAX)];
      sawEvent = true;
      // na retomada, o primeiro evento é a prova de que a sessão conhecida abriu de novo
      if (deps.resumedSessionId && !opened) {
        sessionId = deps.resumedSessionId;
        announceSession(sessionId);
      }
      switch (role) {
        case 'assistant':
          return onAssistant(o);
        case 'tool':
          onToolResult(o);
          return [];
        case 'meta':
          // o `session.resume_hint` fecha o stream com o id da sessão gravada; é por ele que os tokens são lidos
          if (asText(o.type) === 'session.resume_hint') {
            sessionId = asText(o.session_id) || sessionId;
            if (sessionId) announceSession(sessionId);
          }
          return [];
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
      const transient = transientFailure && !usageLimitReached ? { transientFailure: true } : {};
      // a sessão gravada só existe fechada: o `resume_hint` é a última linha, e a CLI já escreveu os pedidos
      const usage = sessionId ? sessionUsage(sessionId) : null;
      if (usage)
        return {
          // o registro da sessão é o total dos pedidos ao modelo; sem custo (a CLI não informa; o catálogo estima)
          measure: 'full',
          consumption: { ...usage.tokens, turns: usage.requests, sessionId, costUsd: null },
          inventory: items,
          answer,
          reason: null,
          nativeSessionId: sessionId,
          usageLimitReached,
          ...transient,
        };
      // sem consumo da CLI: com inventário, `partial` diz o que houve (inventário sim, consumo não);
      // a invariante do RunReport proíbe `none` com inventário não vazio (ver o leitor do Cursor)
      if (items.length)
        return {
          measure: 'partial',
          consumption: null,
          inventory: items,
          answer,
          reason: null,
          nativeSessionId: sessionId,
          usageLimitReached,
          ...transient,
        };
      return {
        measure: 'none',
        consumption: null,
        inventory: [],
        answer,
        reason: null,
        nativeSessionId: sessionId,
        usageLimitReached,
        ...transient,
      };
    },

    get sawEvent(): boolean {
      return sawEvent;
    },
  };
}
