// O driver do Gemini pela API (épica "ferramenta por modo", história 10) contra um servidor HTTP falso
// no próprio computador: o ciclo de chamadas de função do `generateContent`, o cancelamento no meio, o 429,
// o limite de pedidos e o que nunca pode vazar (a chave). Os servidores MCP são falsos, em memória. Na
// história 11, as ferramentas locais no mesmo laço: arquivos em edits, o comando em full e Parar no meio dele.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MeasureEndedError } from '../src/extension/aiOutput/errors';
import {
  MISSING_API_KEY,
  apiCallDecision,
  createGeminiApiDriver,
  limitMessage,
  type McpConnect,
  type McpConnection,
  type McpTool,
} from '../src/extension/ai/drivers/gemini/api';
import { classifyGeminiFailure } from '../src/extension/ai/drivers/gemini/limit';
import type { ExecutorContext } from '../src/extension/ai/drivers';
import type { HeadlessInput } from '../src/extension/headless';
import { API_CAPABILITY_CHECKS } from '../src/shared/executionAdmission';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import { fakeGemini, modelTurn, type FakeGemini } from './fakes/geminiServer';

const KEY = 'AIzaChaveDeTeste-nunca-no-log-0123456789';
const PROFILE: AiProfile = { ...structuredClone(BUILTIN_PROFILES.find((p) => p.id === 'gemini')!), mode: 'api' };
const MODEL = { name: 'gemini-2.5-pro', effort: null };

const input = (over: Partial<HeadlessInput> = {}): HeadlessInput => ({
  prompt: 'Pedido do board: trabalhe no card #7.',
  permission: 'board',
  exec: {
    agent: '',
    agentDefinition: null,
    mcpAllowed: ['docs'],
    mcpBlocked: [],
    mcpConfig: JSON.stringify({
      mcpServers: { 'faz-ai': { type: 'stdio', command: 'node', args: ['bridge.js'] }, docs: { command: 'docs-mcp', args: [] } },
    }),
    tools: [],
    toolSet: 'explicit',
    mcpTools: [],
    deniedTools: ['Agent', 'Task', 'SendMessage', 'ListAgents'],
    model: MODEL,
  },
  ...over,
});

/** Servidores MCP falsos: cada um com as suas ferramentas e um registro do que o board chamou. */
function fakeMcp(
  tools: Record<string, McpTool[]>,
  results: Record<string, (args: any, signal: AbortSignal) => Promise<any> | any> = {},
  /** a listagem de um servidor no lugar da lista fixa (falha, demora) */
  lists: Record<string, (signal?: AbortSignal) => Promise<McpTool[]>> = {},
) {
  const calls: { server: string; tool: string; args: unknown }[] = [];
  const connected: string[] = [];
  const closed: string[] = [];
  const connect: McpConnect = async (server) => {
    connected.push(server);
    const connection: McpConnection = {
      listTools: async (signal) => (lists[server] ? lists[server](signal) : (tools[server] ?? [])),
      callTool: async (tool, args, signal) => {
        calls.push({ server, tool, args });
        const fn = results[`${server}/${tool}`];
        return fn ? fn(args, signal) : { content: [{ type: 'text', text: `ok ${tool}` }] };
      },
      instructions: () => (server === 'faz-ai' ? 'Instruções do board para todo cliente.' : undefined),
      close: async () => void closed.push(server),
    };
    return connection;
  };
  return { connect, calls, connected, closed };
}

const TOOLS = {
  'faz-ai': [
    { name: 'get_card', description: 'Lê um card.', inputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' } },
    { name: 'add_comment', description: 'Comenta.', inputSchema: { type: 'object', properties: { body: { type: 'string' } } } },
  ],
  docs: [{ name: 'search', description: 'Busca.', inputSchema: { type: 'object' } }],
};

let server: FakeGemini | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/**
 * `apiKey`: a chave que o gateway entrega do cofre (`ToolKeys`); null = o perfil sem chave conectada. `cwd`: a
 * pasta do card (as ferramentas locais trabalham nela); `baseEnv`: o ambiente de onde sai o do comando.
 */
function start(o: {
  input?: HeadlessInput;
  connect: McpConnect;
  maxTurns?: number;
  requestTimeoutMs?: number;
  apiKey?: string | null;
  cwd?: string;
  baseEnv?: NodeJS.ProcessEnv;
}) {
  const driver = createGeminiApiDriver({
    endpoint: server!.endpoint,
    connect: o.connect,
    maxTurns: o.maxTurns,
    requestTimeoutMs: o.requestTimeoutMs,
    pathEnv: async () => process.env.PATH,
    ...(o.baseEnv ? { baseEnv: o.baseEnv } : {}),
  });
  const lines: string[] = [];
  let checks = 0;
  const ctx = {
    profile: PROFILE,
    ...(o.apiKey === null ? {} : { apiKey: o.apiKey ?? KEY }),
    cwd: o.cwd ?? '/projeto',
    spawn: () => {
      throw new Error('o modo API não inicia processo');
    },
    log: (line: string) => lines.push(line),
    runId: 'r1',
    beforeRequest: () => void checks++,
  } as unknown as ExecutorContext;
  const measured = driver.run(o.input ?? input(), ctx);
  const exit = new Promise<{ code: number | null; error?: Error }>((resolve) =>
    measured.proc.onExit((code, error) => resolve({ code, error })),
  );
  return { measured, exit, lines, checks: () => checks };
}

describe('Gemini pela API: o ciclo de chamadas de função', () => {
  it('duas chamadas: functionCall executada pelo board, depois o texto; thoughtSignature volta inalterado', async () => {
    const callPart = {
      functionCall: { id: 'c1', name: 'mcp__faz-ai__get_card', args: { card: 7 } },
      thoughtSignature: 'c2lnbmF0dXJhLW9wYWNh',
    };
    const thoughtPart = { text: 'pensando no card', thought: true };
    server = await fakeGemini([
      modelTurn([thoughtPart, callPart], {
        promptTokenCount: 1000,
        cachedContentTokenCount: 200,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 30,
        toolUsePromptTokenCount: 10,
        totalTokenCount: 1090,
      }),
      modelTurn([{ text: 'Fase concluída.\n' }], { promptTokenCount: 1200, candidatesTokenCount: 40, totalTokenCount: 1240 }),
    ]);
    const mcp = fakeMcp(TOOLS);
    const { measured, exit, lines, checks } = start({ connect: mcp.connect });

    expect(await exit).toEqual({ code: 0, error: undefined });
    expect(server.requests).toHaveLength(2);
    const [first, second] = server.requests;
    // a chave vai só no cabeçalho, nunca na URL
    expect(first!.method).toBe('POST');
    expect(first!.url).toBe('/v1beta/models/gemini-2.5-pro:generateContent');
    expect(first!.headers['x-goog-api-key']).toBe(KEY);
    expect(server.requests.every((r) => !r.url.includes('key='))).toBe(true);
    // o pedido do board é a systemInstruction, com as instruções do servidor do board
    expect(first!.body.systemInstruction.parts[0].text).toBe('Pedido do board: trabalhe no card #7.');
    expect(first!.body.systemInstruction.parts[1].text).toContain('Instruções do board para todo cliente.');
    expect(first!.body.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
    const declared = first!.body.tools[0].functionDeclarations;
    expect(declared.map((d: { name: string }) => d.name)).toEqual([
      'mcp__faz-ai__get_card',
      'mcp__faz-ai__add_comment',
      'mcp__docs__search',
    ]);
    // o JSON Schema do MCP vai como parametersJsonSchema, sem o $schema
    expect(declared[0].parametersJsonSchema).toEqual({ type: 'object' });
    // a conversa inteira em cada pedido: a parte do modelo como veio, a resposta da função com id e nome
    expect(second!.body.contents[0]).toEqual(first!.body.contents[0]);
    expect(second!.body.contents[1]).toEqual({ role: 'model', parts: [thoughtPart, callPart] });
    expect(second!.body.contents[2]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { id: 'c1', name: 'mcp__faz-ai__get_card', response: { output: 'ok get_card' } } }],
    });
    expect(mcp.calls).toEqual([{ server: 'faz-ai', tool: 'get_card', args: { card: 7 } }]);
    expect(mcp.closed.sort()).toEqual(['docs', 'faz-ai']);
    // as conferências do gateway antes de cada pedido e de cada chamada
    expect(checks()).toBe(3);

    const report = measured.report();
    expect(report).toMatchObject({
      measure: 'full',
      answer: 'Fase concluída.\n',
      inventory: [{ kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 }],
      consumption: {
        // o cache sai da entrada; o pedido das ferramentas entra nela; o pensamento conta como saída
        inputTokens: 800 + 10 + 1200,
        cacheReadTokens: 200,
        outputTokens: 50 + 30 + 40,
        cacheWriteTokens: 0,
        turns: 2,
        costUsd: null,
      },
    });
    expect(measured.failure()).toBeNull();
    expect(lines).toContain('→ faz-ai/get_card');
    expect(lines).toContain('Fase concluída.');
    expect(lines.join('\n')).not.toContain('pensando no card');
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('cancelamento no meio: o pedido em curso é abortado e não há próximo', async () => {
    server = await fakeGemini([modelTurn([{ functionCall: { name: 'mcp__docs__search', args: {} } }]), 'hang']);
    const mcp = fakeMcp(TOOLS);
    const { measured, exit } = start({ connect: mcp.connect });
    await server.waitRequest(2);

    measured.proc.kill();

    expect(await exit).toEqual({ code: 143, error: undefined });
    await new Promise((r) => setTimeout(r, 20));
    expect(server.requests).toHaveLength(2);
    expect(server.aborted).toBe(1);
    // o que já foi medido e executado fica no relatório
    expect(measured.report()).toMatchObject({ measure: 'full', inventory: [{ name: 'docs/search', calls: 1 }] });
    // sem functionResponse no id: a parte sem id volta sem id
    expect(server.requests[1]!.body.contents[2].parts[0]).toEqual({
      functionResponse: { name: 'mcp__docs__search', response: { output: 'ok search' } },
    });
  });

  it('cancelamento durante uma chamada MCP: a chamada recebe o aborto e o modelo não é chamado de novo', async () => {
    server = await fakeGemini([modelTurn([{ functionCall: { name: 'mcp__docs__search', args: {} } }])]);
    let started!: () => void;
    const running = new Promise<void>((r) => (started = r));
    const mcp = fakeMcp(TOOLS, {
      'docs/search': (_args, signal) =>
        new Promise((_resolve, reject) => {
          started();
          signal.addEventListener('abort', () => reject(new Error('abortada')));
        }),
    });
    const { measured, exit } = start({ connect: mcp.connect });
    await running;
    measured.proc.kill();
    expect((await exit).code).toBe(143);
    expect(server.requests).toHaveLength(1);
  });

  it('429: falha com o limite de uso e o retryDelay (a pausa curta, história 12), sem consumo medido e sem tentar de novo', async () => {
    server = await fakeGemini([
      {
        status: 429,
        json: {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'You exceeded your current quota.',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }],
          },
        },
      },
    ]);
    const { measured, exit, lines } = start({ connect: fakeMcp(TOOLS).connect });

    const end = await exit;
    expect(end.code).toBe(1);
    // o relógio local de quando volta, não os segundos crus do retryDelay
    expect(end.error?.message).toMatch(
      /^A API do Gemini recusou o pedido por limite de uso do modelo [\w.-]+ \(HTTP 429\)\. Ela volta às \d\d:\d\d\.$/,
    );
    expect(server.requests).toHaveLength(1);
    expect(lines).toContain(end.error!.message);
    expect(measured.report()).toMatchObject({
      measure: 'none',
      consumption: null,
      usageLimitReached: true,
      usageLimitHint: { retryAfterMs: 37_000 },
    });
    expect(measured.failure()).toBeInstanceOf(MeasureEndedError);
  });

  it('404: o modelo que saiu da API diz para atualizar a lista e escolher outro', async () => {
    server = await fakeGemini([{ status: 404, json: { error: { code: 404, status: 'NOT_FOUND', message: 'models/x is not found' } } }]);
    const { exit } = start({ connect: fakeMcp(TOOLS).connect });
    const end = await exit;
    expect(end.code).toBe(1);
    expect(end.error?.message).toMatch(/^O modelo [\w.-]+ não está mais disponível na API do Gemini \(HTTP 404\)\. Use "Detectar modelos"/);
  });

  it('a mensagem da cota diária diz que é a do dia, quando volta e o que fazer até lá', () => {
    const now = new Date(2026, 9, 28, 13, 38).getTime();
    const daily = limitMessage(
      'gemini-4-argon',
      classifyGeminiFailure({ code: 429, message: 'You have exhausted your daily quota on this model.' }),
      now,
    );
    expect(daily).toMatch(
      /^A cota diária do modelo gemini-4-argon na API do Gemini acabou \(HTTP 429\)\. Ela volta às (\d\d\/\d\d )?\d\d:\d\d\./,
    );
    expect(daily).toContain('Até lá, use outro modelo ou outro agente.');
    expect(daily).not.toMatch(/\d{4,}s/);
  });

  it('o erro do servidor que repete a chave chega ao log sem ela', async () => {
    server = await fakeGemini([{ status: 400, json: { error: { status: 'INVALID_ARGUMENT', message: `API key ${KEY} not valid.` } } }]);
    const { exit, lines } = start({ connect: fakeMcp(TOOLS).connect });
    const end = await exit;
    expect(end.error!.message).toContain('HTTP 400, INVALID_ARGUMENT');
    expect(end.error!.message).not.toContain(KEY);
    expect(lines.join('\n')).not.toContain(KEY);
  });

  it('a chave ecoada atravessando o limite do corte (300) não deixa pedaço dela passar', async () => {
    // a chave começa perto do fim do que cabe: cortar antes de mascarar deixaria o começo dela no log
    const echoed = `${'x'.repeat(290)} ${KEY} fim`;
    server = await fakeGemini([{ status: 400, json: { error: { status: 'INVALID_ARGUMENT', message: echoed } } }]);
    const { exit, lines } = start({ connect: fakeMcp(TOOLS).connect });
    const end = await exit;
    for (const text of [end.error!.message, ...lines]) {
      expect(text).not.toContain(KEY.slice(0, 8));
    }
    // mascarada antes do corte: o que o corte leva é o pedaço da máscara, não o da chave
    expect(end.error!.message).toMatch(/x \[chave/);
  });

  it('o texto do modelo que repete a chave sai do log mascarado, mesmo cortado no meio dela', async () => {
    server = await fakeGemini([modelTurn([{ text: `${'y'.repeat(295)}${KEY}` }])]);
    const { exit, lines } = start({ connect: fakeMcp(TOOLS).connect });
    expect((await exit).code).toBe(0);
    expect(lines.join('\n')).not.toContain(KEY.slice(0, 8));
  });

  it('um MCP do card que falha ao listar as ferramentas fica de fora, com o motivo no log; o do board, não', async () => {
    server = await fakeGemini([modelTurn([{ text: 'ok' }])]);
    const docsFails = fakeMcp(TOOLS, {}, { docs: () => Promise.reject(new Error('lista quebrada')) });
    const ok = start({ connect: docsFails.connect });
    expect((await ok.exit).code).toBe(0);
    expect(server.requests[0]!.body.tools[0].functionDeclarations.map((d: { name: string }) => d.name)).toEqual([
      'mcp__faz-ai__get_card',
      'mcp__faz-ai__add_comment',
    ]);
    expect(ok.lines).toContain('Servidor MCP docs não listou as ferramentas: lista quebrada. A execução segue sem ele.');
    // a conexão que falhou ao listar também é fechada no fim
    expect(docsFails.closed.sort()).toEqual(['docs', 'faz-ai']);
    const boardFails = start({ connect: fakeMcp(TOOLS, {}, { 'faz-ai': () => Promise.reject(new Error('sem lista')) }).connect });
    const end = await boardFails.exit;
    expect(end.code).toBe(1);
    expect(end.error?.message).toBe('O servidor do board não listou as ferramentas: sem lista');
  });

  it('Parar durante a listagem das ferramentas: o sinal chega à listagem e a execução termina na hora', async () => {
    server = await fakeGemini([]);
    let listing!: () => void;
    const started = new Promise<void>((r) => (listing = r));
    const slow = fakeMcp(
      TOOLS,
      {},
      {
        // só termina se receber o Parar: sem o sinal, a execução ficaria presa aqui
        docs: (signal) =>
          new Promise((_resolve, reject) => {
            listing();
            signal?.addEventListener('abort', () => reject(new Error('listagem abortada')));
          }),
      },
    );
    const { measured, exit } = start({ connect: slow.connect });
    await started;
    const at = Date.now();
    measured.proc.kill();
    expect(await exit).toEqual({ code: 143, error: undefined });
    expect(Date.now() - at).toBeLessThan(1000);
    expect(server.requests).toEqual([]);
  });

  it('limite de pedidos: o modelo que não para de chamar funções termina com falha', async () => {
    server = await fakeGemini(() => modelTurn([{ functionCall: { name: 'mcp__faz-ai__get_card', args: {} } }]));
    const { exit } = start({ connect: fakeMcp(TOOLS).connect, maxTurns: 3 });
    const end = await exit;
    expect(end.code).toBe(1);
    expect(end.error?.message).toContain('limite de 3 pedidos');
    expect(server.requests).toHaveLength(3);
  });

  it('tempo limite por pedido: o pedido parado é abortado com a causa', async () => {
    server = await fakeGemini(['hang']);
    const { exit } = start({ connect: fakeMcp(TOOLS).connect, requestTimeoutMs: 50 });
    const end = await exit;
    expect(end.code).toBe(1);
    expect(end.error?.message).toBe('A API do Gemini não respondeu em 0.05 s.');
  });

  it('uma chamada a função não declarada é recusada sem rodar e não entra no inventário', async () => {
    server = await fakeGemini([
      modelTurn([{ functionCall: { id: 'x', name: 'mcp__intruso__apagar_tudo', args: {} } }]),
      modelTurn([{ text: 'ok' }]),
    ]);
    const mcp = fakeMcp(TOOLS);
    const { measured, exit } = start({ connect: mcp.connect });
    expect((await exit).code).toBe(0);
    expect(mcp.calls).toEqual([]);
    expect(measured.report().inventory).toEqual([]);
    expect(server.requests[1]!.body.contents[2].parts[0].functionResponse).toMatchObject({
      id: 'x',
      response: { error: 'A função mcp__intruso__apagar_tudo não existe nesta execução.' },
    });
  });

  it('sem o servidor do board a execução falha; um MCP do card fora do ar só deixa as ferramentas dele de fora', async () => {
    server = await fakeGemini([modelTurn([{ text: 'ok' }])]);
    const base = fakeMcp(TOOLS);
    const docsDown: McpConnect = (s, d, c) => (s === 'docs' ? Promise.reject(new Error('docs fora do ar')) : base.connect(s, d, c));
    const ok = start({ connect: docsDown });
    expect((await ok.exit).code).toBe(0);
    expect(server.requests[0]!.body.tools[0].functionDeclarations.map((d: { name: string }) => d.name)).toEqual([
      'mcp__faz-ai__get_card',
      'mcp__faz-ai__add_comment',
    ]);
    expect(ok.lines.some((l) => l.includes('Servidor MCP docs indisponível'))).toBe(true);

    const boardDown: McpConnect = () => Promise.reject(new Error('socket fechado'));
    const failed = start({ connect: boardDown });
    const end = await failed.exit;
    expect(end.code).toBe(1);
    expect(end.error?.message).toBe('Não foi possível falar com o servidor do board: socket fechado');
  });
});

describe('Gemini pela API: recusas antes do primeiro pedido e o vínculo', () => {
  it('sem chave, a causa; sem modelo, a causa', async () => {
    server = await fakeGemini([]);
    const connect = fakeMcp(TOOLS).connect;
    expect(() => start({ connect, apiKey: null })).toThrow(MISSING_API_KEY);
    expect(() => start({ connect, input: input({ exec: { ...input().exec!, model: null } }) })).toThrow('precisa de um modelo');
    expect(server.requests).toEqual([]);
  });

  it('o vínculo é o do modo API (endpoint, modelo, versão, digest da chave) e o laço garante os cinco checks', () => {
    const driver = createGeminiApiDriver({ endpoint: 'https://generativelanguage.googleapis.com/v1beta' });
    const bound = driver.bindingContext(input(), { profile: PROFILE, cwd: null, apiKey: KEY });
    expect(bound).toMatchObject({
      api: { transport: 'api', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-pro' },
    });
    expect(JSON.stringify(bound)).not.toContain(KEY);
    expect(() => driver.bindingContext(input(), { profile: PROFILE, cwd: null, apiKey: null })).toThrow(MISSING_API_KEY);
    expect([...driver.guarantees!(input())].sort()).toEqual(Object.values(API_CAPABILITY_CHECKS).flat().sort());
  });

  it('a conferência da chave no Conectar: a lista de modelos da conta, com a chave só no cabeçalho', async () => {
    server = await fakeGemini([
      {
        json: {
          models: [
            {
              name: 'models/gemini-2.5-pro',
              displayName: 'Gemini 2.5 Pro',
              supportedGenerationMethods: ['generateContent', 'countTokens'],
            },
            { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
            // geram voz, imagem ou música: a lista da API os traz com generateContent, mas o board não conversa com eles
            { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/lyria-3.5', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/deep-research-preview-04-2026', supportedGenerationMethods: ['generateContent'] },
          ],
          nextPageToken: 'pagina-2',
        },
      },
      { json: { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] } },
      { status: 400, json: { error: { status: 'INVALID_ARGUMENT', message: `API key ${KEY} not valid. Please pass a valid API key.` } } },
    ]);
    const driver = createGeminiApiDriver({ endpoint: server.endpoint });
    const models = await driver.apiModels!(KEY);
    expect(models.map((m) => [m.id, m.label])).toEqual([
      ['gemini:gemini-2.5-pro', 'Gemini 2.5 Pro'],
      ['gemini:gemini-2.5-flash', 'gemini-2.5-flash'],
    ]);
    expect(server.requests.map((r) => [r.method, r.url])).toEqual([
      ['GET', '/v1beta/models?pageSize=1000'],
      ['GET', '/v1beta/models?pageSize=1000&pageToken=pagina-2'],
    ]);
    expect(server.requests.every((r) => r.headers['x-goog-api-key'] === KEY)).toBe(true);
    const refused = await driver.apiModels!(KEY).catch((e: Error) => e);
    expect((refused as Error).message).toBe(
      'A API do Gemini recusou a chave (HTTP 400, INVALID_ARGUMENT): API key [chave da API] not valid. Please pass a valid API key.',
    );
  });

  it('a conferência da chave: a chave ecoada atravessando o limite do corte sai mascarada inteira', async () => {
    server = await fakeGemini([{ status: 400, json: { error: { status: 'INVALID_ARGUMENT', message: `${'z'.repeat(292)} ${KEY}` } } }]);
    const refused = (await createGeminiApiDriver({ endpoint: server.endpoint }).apiModels!(KEY).catch((e: Error) => e)) as Error;
    expect(refused.message).toContain('HTTP 400, INVALID_ARGUMENT');
    expect(refused.message).not.toContain(KEY.slice(0, 8));
  });

  it('a decisão de cada função: servidor fora da execução, delegação e o escopo de operações do contrato', () => {
    const servers = ['faz-ai', 'docs'];
    expect(apiCallDecision(input(), servers, 'docs', 'search')).toEqual({ allow: true, reason: null });
    expect(apiCallDecision(input(), servers, 'intruso', 'x').allow).toBe(false);
    // com o escopo de operações (runtime v1), só as operações dele
    const scoped = input({ exec: { ...input().exec!, mcpTools: ['mcp__faz-ai__get_card'] } });
    expect(apiCallDecision(scoped, servers, 'faz-ai', 'get_card').allow).toBe(true);
    expect(apiCallDecision(scoped, servers, 'faz-ai', 'add_comment')).toEqual({
      allow: false,
      reason: 'a operação não está no contrato da execução',
    });
  });
});

/** Uma execução admitida com as ferramentas locais do nível, como a admissão do modo API as lista (no vocabulário do card). */
const localInput = (permission: HeadlessInput['permission'], tools: string[], deniedTools: string[] = []): HeadlessInput =>
  input({ permission, exec: { ...input().exec!, tools, deniedTools: ['Agent', 'Task', 'SendMessage', 'ListAgents', ...deniedTools] } });

describe('Gemini pela API: as ferramentas locais (história 11)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-api-local-')));
    fs.mkdirSync(path.join(dir, 'card'));
    fs.writeFileSync(path.join(dir, 'card', 'a.txt'), 'linha um\nlinha dois\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('em edits: lê, escreve e edita na pasta do card; escapar dela volta como erro; o inventário traz Read, Write e Edit', async () => {
    server = await fakeGemini([
      modelTurn([
        { functionCall: { id: 'r', name: 'read_file', args: { path: 'a.txt' } } },
        { functionCall: { id: 'w', name: 'write_file', args: { path: 'novo/b.txt', content: 'oi' } } },
        { functionCall: { id: 'e', name: 'edit_file', args: { path: 'a.txt', old_string: 'dois', new_string: 'DOIS' } } },
        { functionCall: { id: 'x', name: 'write_file', args: { path: '../fora.txt', content: 'escapei' } } },
      ]),
      modelTurn([{ text: 'Arquivos editados.' }]),
    ]);
    const { measured, exit, lines } = start({
      connect: fakeMcp(TOOLS).connect,
      cwd: path.join(dir, 'card'),
      input: localInput('edits', ['Read', 'Glob', 'Grep', 'Write', 'Edit']),
    });

    expect(await exit).toEqual({ code: 0, error: undefined });
    const declared = server.requests[0]!.body.tools[0].functionDeclarations.map((d: { name: string }) => d.name);
    expect(declared.filter((n: string) => !n.startsWith('mcp__'))).toEqual(['read_file', 'glob', 'grep', 'write_file', 'edit_file']);
    expect(fs.readFileSync(path.join(dir, 'card', 'a.txt'), 'utf8')).toBe('linha um\nlinha DOIS\n');
    expect(fs.readFileSync(path.join(dir, 'card', 'novo', 'b.txt'), 'utf8')).toBe('oi');
    expect(fs.existsSync(path.join(dir, 'fora.txt'))).toBe(false);
    const responses = server.requests[1]!.body.contents.at(-1).parts.map((p: any) => p.functionResponse);
    expect(responses[0].response.output).toContain('     2\tlinha dois');
    expect(responses[3].response.error).toMatch(/^Fora das pastas do card/);
    expect(measured.report().inventory).toEqual([
      { kind: 'tool', name: 'Read', calls: 1 },
      { kind: 'tool', name: 'Write', calls: 2 },
      { kind: 'tool', name: 'Edit', calls: 1 },
    ]);
    // o canal mostra a ferramenta e o caminho, nunca o conteúdo
    expect(lines).toContain('→ Write novo/b.txt');
    expect(lines.join('\n')).not.toContain('escapei');
  });

  it('a decisão de novo na hora: run_command em edits não é declarado e a chamada a ele não roda', async () => {
    server = await fakeGemini([
      modelTurn([{ functionCall: { id: 'c', name: 'run_command', args: { command: 'touch', args: ['feito'] } } }]),
      modelTurn([{ text: 'ok' }]),
    ]);
    const { measured, exit } = start({
      connect: fakeMcp(TOOLS).connect,
      cwd: path.join(dir, 'card'),
      // a lista traz Bash, mas o nível edits não libera comandos
      input: localInput('edits', ['Read', 'Write', 'Edit', 'Bash']),
    });
    expect((await exit).code).toBe(0);
    expect(fs.existsSync(path.join(dir, 'card', 'feito'))).toBe(false);
    expect(measured.report().inventory).toEqual([]);
  });

  it('em full: o comando roda sem shell, com o ambiente filtrado (sem a chave nem segredos do host)', async () => {
    server = await fakeGemini([
      modelTurn([
        {
          functionCall: {
            id: 'c',
            name: 'run_command',
            args: {
              command: process.execPath,
              args: ['-e', 'console.log(JSON.stringify(process.env)); console.log(process.argv[1])', '$HOME; echo x'],
            },
          },
        },
      ]),
      modelTurn([{ text: 'Comando rodado.' }]),
    ]);
    const { measured, exit } = start({
      connect: fakeMcp(TOOLS).connect,
      cwd: path.join(dir, 'card'),
      input: localInput('full', ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash']),
      baseEnv: {
        PATH: process.env.PATH,
        HOME: dir,
        GEMINI_API_KEY: KEY,
        MEU_TOKEN: 'segredo-do-host',
        OUTRA: `x${KEY}`,
        LANG: 'pt_BR.UTF-8',
      },
    });

    expect((await exit).code).toBe(0);
    const response = server.requests[1]!.body.contents.at(-1).parts[0].functionResponse.response;
    expect(response.exit_code).toBe(0);
    const [envLine, argLine] = response.stdout.trim().split('\n');
    const env = JSON.parse(envLine);
    expect(env).toMatchObject({ HOME: dir, LANG: 'pt_BR.UTF-8', GIT_TERMINAL_PROMPT: '0' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.MEU_TOKEN).toBeUndefined();
    expect(env.OUTRA).toBeUndefined();
    // o argumento chega como veio: nenhum shell expandiu `$HOME` nem cortou no `;`
    expect(argLine).toBe('$HOME; echo x');
    expect(JSON.stringify(server.requests)).not.toContain('segredo-do-host');
    expect(measured.report()).toMatchObject({
      inventory: [{ kind: 'tool', name: 'Bash', calls: 1 }],
      bashCommands: [{ command: 'node', calls: 1, failed: 0 }],
    });
  });

  it('Parar no meio de um comando mata a árvore inteira (o neto também) e a execução sai com 143', async () => {
    const pidFile = path.join(dir, 'neto.pid');
    // o comando inicia um neto que grava o pid e fica rodando; o filho também fica
    fs.writeFileSync(
      path.join(dir, 'card', 'neto.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
    );
    fs.writeFileSync(
      path.join(dir, 'card', 'filho.js'),
      `require('node:child_process').spawn(process.execPath, [require('node:path').join(__dirname, 'neto.js')], { stdio: 'ignore' }); setInterval(() => {}, 1000);`,
    );
    server = await fakeGemini([
      modelTurn([{ functionCall: { id: 'c', name: 'run_command', args: { command: process.execPath, args: ['filho.js'] } } }]),
      'hang',
    ]);
    const { measured, exit } = start({
      connect: fakeMcp(TOOLS).connect,
      cwd: path.join(dir, 'card'),
      input: localInput('full', ['Bash']),
    });
    await vi.waitFor(() => expect(fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8')).toBeTruthy(), { timeout: 10_000 });
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));

    measured.proc.kill();

    expect((await exit).code).toBe(143);
    // nenhum pedido depois do Parar, e o neto não sobrevive
    expect(server.requests).toHaveLength(1);
    await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 10_000 });
    expect(measured.proc.terminationConfirmed!()).toBe(true);
  }, 30_000);
});
