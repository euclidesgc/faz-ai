// Gemini pela API (épica "ferramenta por modo", história 10, parte 1: o ciclo com MCP). Não há processo
// da ferramenta: o board faz o ciclo de chamadas de função do `generateContent`
// (ai.google.dev/api/generate-content, conferido em 2026-10-23), e é isso que dá ao modo o regime
// exclusivo por construção.
//
// O ciclo, uma execução do card:
// - o pedido do board vai em `systemInstruction` (com as instruções que o servidor do board dá a todo
//   cliente MCP), e a conversa inteira vai em cada pedido (`contents`): o servidor não guarda sessão;
// - `tools.functionDeclarations` são as ferramentas do servidor do board e dos MCPs do card que a decisão
//   do card admite (`apiCallDecision`, que passa por `boardDecision`, a mesma regra do ACP). A que a
//   decisão recusa nunca é declarada; uma chamada a uma função não declarada é recusada sem rodar;
// - o board é o cliente MCP: do próprio servidor que atende a pasta (pelo socket dele, `selfClient.ts`,
//   sem abrir um segundo servidor) e dos MCPs do card (stdio ou HTTP, como o `call_board_mcp_tool`);
// - a parte do modelo volta inalterada no pedido seguinte, com o `thoughtSignature` que vier nela, e as
//   respostas das funções vão numa parte `user` com `functionResponse { id, name, response }`;
// - o ciclo acaba quando o modelo responde só com texto, no limite de pedidos, num erro ou ao Parar.
//
// O `Measured` é construído aqui, sem JSONL falso: `onExit(0)` no fim, `kill()` aborta o pedido em curso
// e impede o próximo, `report()` soma o `usageMetadata` de cada pedido, e o inventário é a lista das
// chamadas que o board executou. A chave vai só no cabeçalho `x-goog-api-key`, nunca na URL nem no log.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { version as EXTENSION_VERSION } from '../../../../../package.json';
import { API_CAPABILITY_CHECKS } from '../../../../shared/executionAdmission';
import { toolModeEntry } from '../../../../shared/aiTools';
import type { InventoryItem, RunReport } from '../../../../shared/log';
import { MeasureEndedError } from '../../../aiOutput/errors';
import { asList, asNumber, asObject, asText, cut, type Json } from '../../../aiOutput/json';
import type { Measured } from '../../../aiOutput/measured';
import { BOARD_SERVER } from '../../../execution';
import type { HeadlessInput } from '../../../headless';
import { libraryMcpTransport } from '../../../mcp/boardGateway';
import { boardSelfTransport } from '../../../mcp/selfClient';
import { boardDecision, type AcpDecision } from '../../acp/run';
import { apiBinding, apiEndpoint } from '../../apiBinding';
import type { ModelOption } from '../../../../shared/models';
import type { ExecutorContext, ToolDriver } from '../types';

/** A raiz da API do Gemini (a versão `v1beta`, a que tem `systemInstruction`, ferramentas e o pensamento). */
export const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
/** Quanto o board espera cada pedido ao modelo antes de desistir dele. */
const REQUEST_TIMEOUT_MS = 120_000;
/**
 * Quantos pedidos ao modelo uma execução faz no máximo: o ciclo para aí com falha, em vez de gastar a conta
 * num modelo que não para de chamar funções. É o par do `max_turn_requests` do ACP.
 */
const MAX_TURNS = 40;
/** O que cabe de resultado de uma função no pedido seguinte; o resto é cortado com aviso. */
const RESULT_MAX = 60_000;
/** O nome com que o board se apresenta aos servidores MCP no modo API; o servidor do board o mostra como "Gemini". */
export const API_CLIENT_NAME = 'faz-ai-gemini-api';
const LABEL = 'Gemini (API)';
/** A primeira mensagem da conversa: o pedido em si vai em `systemInstruction`. */
const START = 'Trabalhe no pedido do board descrito nas instruções e responda quando terminar.';
/**
 * O nome de uma função para o Gemini: começa com letra ou sublinhado, com letras, dígitos, `_ . : -`, até 64
 * (o limite mais curto que a documentação do Gemini e do Vertex dão). O que não cabe recebe um apelido.
 */
const FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;

/** A causa, quando o perfil no modo API não tem chave no cofre: o que a pessoa faz para resolver. */
export const MISSING_API_KEY =
  'Falta a chave de API do Gemini: conecte o Gemini pelo cartão API em Configurações › Ferramentas de IA › Conectar ferramenta.';

/** Até a história 11 o laço só tem as ferramentas MCP: arquivo e comando ainda não existem nele. */
export const API_BOARD_ONLY =
  'O Gemini pela API ainda roda só com a permissão "Só o board" (Refinar, Resumir e Trabalhar na fase sem arquivos nem comandos). Para editar arquivos ou rodar comandos, use o Gemini pelo ACP.';

/** Uma ferramenta que um servidor MCP lista. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Json;
}
/** O resultado de uma chamada MCP, no formato do `CallToolResult`. */
export interface McpToolResult {
  content?: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
}
/** Uma conexão MCP aberta pelo board, como cliente. */
export interface McpConnection {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Json, signal: AbortSignal): Promise<McpToolResult>;
  /** as instruções que o servidor dá a todo cliente no `initialize` */
  instructions(): string | undefined;
  close(): Promise<void>;
}
/** Como o board abre a conexão com um servidor da execução (nos testes, um servidor em memória). */
export type McpConnect = (server: string, definition: Json, cwd: string) => Promise<McpConnection>;

export interface GeminiApiOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
  maxTurns?: number;
  connect?: McpConnect;
}

/** O nome da operação MCP como a admissão e a sessão MCP o escrevem (`mcp__servidor__ferramenta`). */
export const mcpOperation = (server: string, tool: string): string => `mcp__${server.replace(/[^A-Za-z0-9_-]/g, '_')}__${tool}`;

/**
 * A decisão do board para uma ferramenta MCP no modo API: a mesma pergunta antes de declarar a função ao
 * modelo e na hora de executar a chamada, então uma ferramenta fora da decisão nunca chega ao modelo. Vale
 * a regra do ACP (`boardDecision`: servidor do card, ferramentas negadas, delegação, nível) e, quando a
 * execução traz o escopo de operações do contrato (`mcpTools`, no runtime v1), só as operações dele. Sem
 * esse escopo (o runtime legado não o monta), o limite é o do servidor, como no ACP.
 */
export function apiCallDecision(input: HeadlessInput, servers: readonly string[], server: string, tool: string): AcpDecision {
  const operation = mcpOperation(server, tool);
  const exec = input.exec;
  if (exec?.toolSet === 'explicit' && exec.mcpTools?.length && !exec.mcpTools.includes(operation))
    return { allow: false, reason: 'a operação não está no contrato da execução' };
  return boardDecision(input.permission, { toolCallId: operation, title: operation, kind: null }, { server }, [...servers], exec);
}

/** Os servidores MCP da execução admitida: o do board e os do card, com a definição de cada um. */
export function apiMcpServers(input: HeadlessInput): Record<string, Json> {
  const config = input.exec?.mcpConfig ? asObject(asObject(JSON.parse(input.exec.mcpConfig))?.mcpServers) : null;
  const defs = config ?? (input.boardServer ? { [BOARD_SERVER]: input.boardServer } : {});
  const out: Record<string, Json> = {};
  for (const [name, raw] of Object.entries(defs)) {
    const def = asObject(raw);
    if (def) out[name] = def;
  }
  return out;
}

/** O modelo da execução: o do card; o modo API não tem modelo padrão escondido. */
function modelOf(input: HeadlessInput): string {
  const name = input.exec?.model?.name?.replace(/^models\//, '');
  if (!name) throw new Error('O Gemini pela API precisa de um modelo: escolha um modelo do Gemini no campo Modelo do card.');
  return name;
}

/** Abre a conexão MCP por um transporte, com o board como cliente. */
export async function clientConnection(transport: Transport): Promise<McpConnection> {
  const client = new Client({ name: API_CLIENT_NAME, title: LABEL, version: EXTENSION_VERSION });
  await client.connect(transport, { timeout: 15_000 });
  return {
    listTools: async () => {
      const tools: McpTool[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools({ cursor }, { timeout: 15_000 });
        tools.push(...(page.tools as McpTool[]));
        cursor = page.nextCursor;
      } while (cursor && tools.length < 1000);
      return tools;
    },
    callTool: async (name, args, signal) =>
      CallToolResultSchema.parse(await client.callTool({ name, arguments: args }, CallToolResultSchema, { signal, timeout: 60_000 })),
    instructions: () => client.getInstructions(),
    close: () => client.close(),
  };
}

/**
 * A conexão padrão: o servidor do board pelo socket da pasta (o mesmo que a ponte usa, com o token da
 * execução que a sessão MCP pôs na definição) e os MCPs do card pela definição da biblioteca.
 */
export const defaultConnect: McpConnect = (server, definition, cwd) => {
  const env = asObject(definition.env);
  const token = asText(env?.FAZAI_RUN_TOKEN) ?? undefined;
  return clientConnection(server === BOARD_SERVER ? boardSelfTransport(cwd, token) : libraryMcpTransport(definition, cwd));
};

interface Declared {
  name: string;
  server: string;
  tool: string;
  connection: McpConnection;
  declaration: Json;
}

/** O esquema dos argumentos como o Gemini aceita (`parametersJsonSchema`): o JSON Schema do MCP, sem o `$schema`. */
function parametersOf(schema: Json | undefined): Json {
  const { $schema: _ignored, ...rest } = schema ?? {};
  return Object.keys(rest).length ? rest : { type: 'object', properties: {} };
}

/** O resultado MCP como a `response` de um `functionResponse`: `output`, ou `error` quando a ferramenta falhou. */
function functionResponseOf(result: McpToolResult): Json {
  const texts = asList(result.content).map((c) => {
    const item = asObject(c);
    return asText(item?.type) === 'text' ? (asText(item?.text) ?? '') : `[conteúdo ${asText(item?.type) ?? 'desconhecido'} omitido]`;
  });
  const joined = texts.join('\n');
  const output = joined.length > RESULT_MAX ? `${joined.slice(0, RESULT_MAX)}\n[resultado cortado pelo board]` : joined;
  if (result.isError) return { error: output };
  const structured = asObject(result.structuredContent);
  return structured && !texts.length ? { output: structured } : { output };
}

/** O erro da API em JSON (`{ error: { code, message, status, details } }`); null quando o corpo não é esse. */
function apiError(text: string): { message: string; status: string | null; retryDelay: string | null } | null {
  try {
    const error = asObject(asObject(JSON.parse(text) as unknown)?.error);
    if (!error) return null;
    const retry = asList(error.details)
      .map((d) => asObject(d))
      .find((d) => asText(d?.['@type'])?.endsWith('google.rpc.RetryInfo'));
    return { message: asText(error.message) ?? '', status: asText(error.status), retryDelay: asText(retry?.retryDelay) };
  } catch {
    return null;
  }
}

/** A execução foi parada: o ciclo sai sem mandar mais nada. */
class Stopped extends Error {}

function runGeminiApi(input: HeadlessInput, ctx: ExecutorContext, o: Required<GeminiApiOptions>): Measured {
  // as recusas antes de qualquer pedido: o gateway fecha a linha do log como "não suportada"
  if (input.permission !== 'board') throw new Error(API_BOARD_ONLY);
  // a chave da ferramenta, do cofre (`ToolKeys`), que o gateway entrega e mascara em toda linha do log
  const key = ctx.apiKey;
  if (!key) throw new Error(MISSING_API_KEY);
  const model = modelOf(input);
  const endpoint = apiEndpoint(o.endpoint);
  const url = `${endpoint}/models/${encodeURIComponent(model)}:generateContent`;
  /** nenhuma mensagem que sai daqui repete a chave, nem a que veio de fora (rede, servidor MCP) */
  const scrub = (text: string): string => text.split(key).join('[chave da API]');

  const listeners: ((code: number | null, error?: Error) => void)[] = [];
  const stop = new AbortController();
  let exit: { code: number; error?: Error } | null = null;
  let failure: Error | undefined;
  const answer: string[] = [];
  const inventory = new Map<string, number>();
  const tokens = { input: 0, output: 0, cacheRead: 0 };
  let measured = false;
  let requests = 0;

  const fail = (message: string): number => {
    const safe = scrub(message);
    ctx.log(safe);
    failure = new Error(safe);
    return 1;
  };
  const stopped = (): void => {
    if (stop.signal.aborted) throw new Stopped();
  };

  /** Um pedido ao `generateContent`, com o tempo limite próprio e o Parar. */
  const post = async (body: Json): Promise<{ status: number; text: string }> => {
    const call = new AbortController();
    const onStop = () => call.abort();
    stop.signal.addEventListener('abort', onStop, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      call.abort();
    }, o.requestTimeoutMs);
    try {
      const res = await o.fetch(url, {
        method: 'POST',
        // a chave só no cabeçalho: a URL vai para logs de proxy e de erro; e sem seguir redirecionamento, para
        // o cabeçalho nunca ir a outro endereço
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: call.signal,
        redirect: 'error',
      });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      stopped();
      if (timedOut) throw new Error(`A API do Gemini não respondeu em ${o.requestTimeoutMs / 1000} s.`);
      throw new Error(`Falha de rede ao chamar a API do Gemini: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      stop.signal.removeEventListener('abort', onStop);
    }
  };

  const loop = async (): Promise<number> => {
    const servers = apiMcpServers(input);
    const names = Object.keys(servers);
    const connections: McpConnection[] = [];
    try {
      const declared: Declared[] = [];
      const instructions: string[] = [];
      for (const [server, definition] of Object.entries(servers)) {
        stopped();
        let connection: McpConnection;
        try {
          connection = await o.connect(server, definition, ctx.cwd);
        } catch (e) {
          // sem o servidor do board o card não tem como trabalhar; um MCP do card fora do ar, como numa
          // CLI, só deixa as ferramentas dele de fora
          const why = e instanceof Error ? e.message : String(e);
          if (server === BOARD_SERVER) return fail(`Não foi possível falar com o servidor do board: ${why}`);
          ctx.log(scrub(`Servidor MCP ${server} indisponível: ${why}. A execução segue sem ele.`));
          continue;
        }
        connections.push(connection);
        const note = connection.instructions();
        if (server === BOARD_SERVER && note) instructions.push(`Instruções do servidor MCP ${server}:\n${note}`);
        for (const tool of await connection.listTools()) {
          // a decisão antes de declarar: a ferramenta que o card não admite nunca chega ao modelo
          if (!apiCallDecision(input, names, server, tool.name).allow) continue;
          const wanted = mcpOperation(server, tool.name);
          const name = FUNCTION_NAME.test(wanted) && !declared.some((d) => d.name === wanted) ? wanted : `mcp_fn_${declared.length + 1}`;
          declared.push({
            name,
            server,
            tool: tool.name,
            connection,
            declaration: {
              name,
              description: cut(`${server}/${tool.name}: ${tool.description ?? ''}`, 1000),
              parametersJsonSchema: parametersOf(tool.inputSchema),
            },
          });
        }
      }
      ctx.log(
        `Chamando ${LABEL}: modelo ${model} em ${new URL(endpoint).host}, ${declared.length} função(ões) de ${names.length ? names.join(', ') : 'nenhum servidor MCP'}.`,
      );
      const byName = new Map(declared.map((d) => [d.name, d]));
      const systemInstruction = { parts: [input.prompt, ...instructions].map((text) => ({ text })) };
      const tools = declared.length
        ? {
            tools: [{ functionDeclarations: declared.map((d) => d.declaration) }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          }
        : {};
      const contents: Json[] = [{ role: 'user', parts: [{ text: START }] }];

      for (;;) {
        stopped();
        if (requests >= o.maxTurns) return fail(`O ${LABEL} chegou ao limite de ${o.maxTurns} pedidos ao modelo sem terminar o trabalho.`);
        ctx.beforeRequest?.();
        requests++;
        const res = await post({ systemInstruction, contents, ...tools });
        stopped();
        if (res.status < 200 || res.status >= 300) {
          const err = apiError(res.text);
          if (res.status === 429)
            return fail(
              `A API do Gemini recusou o pedido por limite de uso (HTTP 429${err?.status ? `, ${err.status}` : ''})${err?.retryDelay ? `; tente de novo em ${err.retryDelay}` : ''}.`,
            );
          return fail(
            `A API do Gemini recusou o pedido (HTTP ${res.status}${err?.status ? `, ${err.status}` : ''}): ${cut(err?.message || res.text, 300)}`,
          );
        }
        let data: Json;
        try {
          data = asObject(JSON.parse(res.text) as unknown) ?? {};
        } catch {
          return fail('A API do Gemini respondeu algo que não é JSON.');
        }
        const usage = asObject(data.usageMetadata);
        const prompt = asNumber(usage?.promptTokenCount);
        if (usage && prompt !== null) {
          measured = true;
          const cached = asNumber(usage.cachedContentTokenCount) ?? 0;
          // o `promptTokenCount` já inclui o cache lido: guardado à parte, para não contar duas vezes no total
          tokens.input += Math.max(0, prompt - cached) + (asNumber(usage.toolUsePromptTokenCount) ?? 0);
          tokens.cacheRead += cached;
          tokens.output += (asNumber(usage.candidatesTokenCount) ?? 0) + (asNumber(usage.thoughtsTokenCount) ?? 0);
        }
        const candidate = asObject(asList(data.candidates)[0]);
        if (!candidate) {
          const blocked = asText(asObject(data.promptFeedback)?.blockReason);
          return fail(`A API do Gemini não devolveu resposta${blocked ? ` (pedido bloqueado: ${blocked})` : ''}.`);
        }
        const parts = asList(asObject(candidate.content)?.parts)
          .map((p) => asObject(p))
          .filter((p): p is Json => !!p);
        // a parte do modelo volta como veio, inclusive o `thoughtSignature`: o modelo de pensamento recusa a
        // conversa em que ele foi tirado ou mudado
        contents.push({ role: 'model', parts });
        for (const part of parts) {
          const text = part.thought === true ? null : asText(part.text);
          if (!text) continue;
          answer.push(text);
          for (const line of text.split('\n')) if (line.trim()) ctx.log(cut(line, 300));
        }
        const calls = parts.map((p) => asObject(p.functionCall)).filter((c): c is Json => !!c);
        if (!calls.length) {
          const reason = asText(candidate.finishReason);
          if (!reason || reason === 'STOP') {
            ctx.log('Pronto');
            return 0;
          }
          return fail(`O ${LABEL} parou sem terminar: ${reason}.`);
        }
        const responses: Json[] = [];
        for (const call of calls) {
          stopped();
          const name = asText(call.name) ?? '';
          const id = asText(call.id);
          const target = byName.get(name);
          let response: Json;
          if (!target) {
            ctx.log(`${LABEL} chamou ${cut(name, 120)}: negado (a função não foi declarada pelo board).`);
            response = { error: `A função ${name} não existe nesta execução.` };
          } else {
            // a mesma decisão da declaração, de novo na hora: nada muda no meio da execução sem passar por ela
            const decision = apiCallDecision(input, names, target.server, target.tool);
            if (!decision.allow) {
              ctx.log(
                `${LABEL} chamou ${target.server}/${target.tool}: negado (${decision.reason}) pelo board (nível ${input.permission}).`,
              );
              response = { error: `O board negou a chamada: ${decision.reason}.` };
            } else {
              ctx.beforeRequest?.();
              const item = `${target.server}/${target.tool}`;
              inventory.set(item, (inventory.get(item) ?? 0) + 1);
              ctx.log(`→ ${item}`);
              try {
                response = functionResponseOf(await target.connection.callTool(target.tool, asObject(call.args) ?? {}, stop.signal));
              } catch (e) {
                stopped();
                response = { error: scrub(e instanceof Error ? e.message : String(e)) };
              }
            }
          }
          responses.push({ functionResponse: { ...(id ? { id } : {}), name, response } });
        }
        contents.push({ role: 'user', parts: responses });
      }
    } finally {
      await Promise.all(connections.map((c) => c.close().catch(() => {})));
    }
  };

  const finish = (code: number, error?: Error): void => {
    if (exit) return;
    exit = { code, error };
    for (const fn of listeners) fn(code, error);
  };
  loop().then(
    (code) => finish(stop.signal.aborted ? 143 : code, code === 0 ? undefined : failure),
    (e: unknown) => {
      if (e instanceof Stopped || stop.signal.aborted) return finish(143);
      fail(e instanceof Error ? e.message : String(e));
      finish(1, failure);
    },
  );

  const report = (): RunReport => {
    const items: InventoryItem[] = [...inventory.entries()].map(([name, calls]) => ({ kind: 'mcp_tool', name, calls }));
    const base = { inventory: items, answer: answer.join(''), reason: null, usageLimitReached: false };
    if (measured)
      return {
        ...base,
        measure: 'full',
        consumption: {
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          cacheReadTokens: tokens.cacheRead,
          cacheWriteTokens: 0,
          turns: requests,
          sessionId: null,
          // o board nunca calcula custo: a API não o informa
          costUsd: null,
        },
      };
    if (items.length) return { ...base, measure: 'partial', consumption: null };
    return { ...base, measure: 'none', consumption: null, inventory: [], reason: new MeasureEndedError().message };
  };

  return {
    proc: {
      onExit: (fn) => {
        listeners.push(fn);
        if (exit) fn(exit.code, exit.error);
      },
      kill: () => stop.abort(),
      // não há árvore de processos: terminado o ciclo, nada da execução segue rodando
      terminationConfirmed: () => exit !== null,
    },
    report,
    failure: () => (measured ? null : new MeasureEndedError()),
  };
}

/**
 * Os modelos da conta pela API (`GET {endpoint}/models`, ai.google.dev/api/models), com a chave no cabeçalho:
 * é a conferência da chave no Conectar (não gasta a conta) e a leitura do catálogo. Só os que fazem
 * `generateContent`, que é o que o laço chama. Lança com o motivo da API, sem a chave.
 */
async function listApiModels(apiKey: string, o: Required<GeminiApiOptions>): Promise<ModelOption[]> {
  const endpoint = apiEndpoint(o.endpoint);
  const scrub = (text: string): string => text.split(apiKey).join('[chave da API]');
  const options: ModelOption[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 20; page++) {
    const url = `${endpoint}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    let status: number;
    let text: string;
    try {
      const res = await o.fetch(url, {
        headers: { 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(o.requestTimeoutMs),
        redirect: 'error',
      });
      status = res.status;
      text = await res.text();
    } catch (e) {
      throw new Error(scrub(`Não foi possível falar com a API do Gemini: ${e instanceof Error ? e.message : String(e)}`));
    }
    if (status < 200 || status >= 300) {
      const err = apiError(text);
      throw new Error(
        scrub(
          `A API do Gemini recusou a chave (HTTP ${status}${err?.status ? `, ${err.status}` : ''})${err?.message ? `: ${cut(err.message, 300)}` : ''}`,
        ),
      );
    }
    let data: Json;
    try {
      data = asObject(JSON.parse(text) as unknown) ?? {};
    } catch {
      throw new Error('A API do Gemini respondeu algo que não é JSON.');
    }
    for (const raw of asList(data.models)) {
      const m = asObject(raw);
      const name = asText(m?.name)?.replace(/^models\//, '');
      if (!m || !name || !asList(m.supportedGenerationMethods).includes('generateContent')) continue;
      options.push({
        id: `gemini:${name}`,
        tool: 'gemini',
        model: name,
        label: asText(m.displayName) ?? name,
        efforts: [],
        defaultEffort: null,
        fromTool: true,
      });
    }
    pageToken = asText(data.nextPageToken);
    if (!pageToken) break;
  }
  return options;
}

/** O driver do Gemini pela API. As opções são para o teste (servidor HTTP falso, MCP em memória). */
export function createGeminiApiDriver(options: GeminiApiOptions = {}): ToolDriver {
  const o: Required<GeminiApiOptions> = {
    endpoint: options.endpoint ?? GEMINI_API_ENDPOINT,
    fetch: options.fetch ?? ((...args) => fetch(...args)),
    requestTimeoutMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    maxTurns: options.maxTurns ?? MAX_TURNS,
    connect: options.connect ?? defaultConnect,
  };
  return {
    tool: 'gemini',
    mode: 'api',
    // sem binário: o modo está sempre presente, e quem fala com a rede é a extensão
    command: '',
    locate: () => null,
    versionArgs: [],
    docs: 'https://ai.google.dev/gemini-api/docs',
    install: () => [],
    auth: { kind: 'api-key', docs: 'https://aistudio.google.com/apikey' },
    // a chave do cofre é o login: conferida pelo Conectar, aqui só a presença (sem rede). Sem ela o modo API
    // não tem como rodar (não há agente com login próprio), então a falta é "sem login", não "não verificado"
    signedIn: async (probe) => (probe.hasApiKey === undefined ? null : probe.hasApiKey),
    apiModels: (apiKey) => listApiModels(apiKey, o),
    measure: 'tokens',
    enforcement: toolModeEntry('gemini', 'api')!.enforcement,
    transport: 'api',
    run: (input, ctx) => runGeminiApi(input, ctx, o),
    // a admissão entrega a chave do mesmo cofre: do vínculo só sai o digest dela
    bindingContext: (input, { apiKey }) => {
      if (!apiKey) throw new Error(MISSING_API_KEY);
      return apiBinding({ endpoint: o.endpoint, model: modelOf(input), extensionVersion: EXTENSION_VERSION, apiKey });
    },
    // o que o laço acima cumpre, check a check: monta a conversa inteira em cada pedido, sem sessão no
    // servidor (`board-built-request`); o modelo só recebe o que está no pedido (`no-own-context-files`);
    // só declara e só executa o que `apiCallDecision` admite (`declared-functions`); é o cliente MCP de
    // cada servidor da execução admitida (`board-mcp-client`); e não há função de delegação nem subagente
    // nativo (`no-native-delegation`, e `boardDecision` nega a delegação)
    guarantees: () => Object.values(API_CAPABILITY_CHECKS).flat(),
  };
}

export const geminiApiDriver = createGeminiApiDriver();
