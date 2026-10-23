// Cenários de ponta a ponta do Gemini pela API (épica "ferramenta por modo", história 10): o Conectar de
// verdade pelo cartão API (a chave no cofre de verdade, `ToolKeys`, conferida na hora pela lista de modelos da
// API; o modo `api` gravado no perfil; os modelos no catálogo) e um card por esse perfil, do `runner.start`
// (plano de execution.ts, gateway, admissão do modo API com a evidência por construção afirmada pelo host, o
// laço de chamadas de função do driver, o servidor MCP do board de verdade como cliente de si mesmo, o
// relatório, a conferência) até a mensagem gravada na conversa do card. Só a API do Gemini é falsa: um
// servidor HTTP no próprio computador (ver cardWorld.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { Connector } from '../../src/extension/ai/connect';
import { driverOf } from '../../src/extension/ai/drivers';
import { API_BOARD_ONLY } from '../../src/extension/ai/drivers/gemini/api';
import { profileApiKey } from '../../src/extension/ai/apiKey';
import { exportBoard } from '../../src/extension/db/boardExport';
import { rememberModels } from '../../src/extension/models';
import { AiProfileRepo } from '../../src/extension/repositories/aiProfileRepo';
import { recommendedOffered, toolEntry } from '../../src/shared/aiTools';
import type { ConnectState } from '../../src/shared/connect';
import { cardWorld, CONDUTOR_TOOLS, GEMINI_MODEL, type CardWorld } from './cardWorld';
import { fakeGemini, modelsList, modelTurn, type FakeGemini, type GeminiTurn } from '../fakes/geminiServer';

const KEY = 'AIzaChaveDoCenario-nunca-no-board-000111';
const DEVIATION = 'Conferência: a execução usou algo fora';

let world: CardWorld | undefined;
let server: FakeGemini | undefined;
afterEach(async () => {
  world?.dispose();
  world = undefined;
  await server?.close();
  server = undefined;
});

/**
 * O Conectar montado como o host monta (`host/boardHost.ts`) para o modo API: a chave conferida pelo driver
 * (a lista de modelos da conta), o modo gravado pelo router, os modelos lidos pela API para o catálogo. O
 * modo API não tem binário, login de agente nem sonda: o que chamaria um processo lança.
 */
function connectorOf(w: CardWorld, published: ConnectState[] = []): Connector {
  const repo = new AiProfileRepo(w.db);
  const never = (what: string) => () => {
    throw new Error(`o modo API não ${what}`);
  };
  const connector: Connector = new Connector({
    profile: (id) => w.router.snapshot().board.aiProfiles.find((p) => p.id === id) ?? null,
    enable: (id) => void w.router.handle({ type: 'settings.aiProfiles.setEnabled', id, enabled: true }),
    resolve: (id) => repo.resolveProfile(w.router.boardId, id),
    locate: never('procura binário'),
    version: never('lê versão'),
    signedIn: never('sonda login'),
    keys: w.keys,
    authenticate: never('autentica agente'),
    checkApiKey: async (_profile, apiKey) => (await w.apiDriver!.apiModels!(apiKey)).length,
    setMode: (id, mode) => w.router.setProfileMode(id, mode),
    verify: never('roda o verificador'),
    reviewOf: (id) => w.router.snapshot().board.runner.compatibilityReviews[id] ?? null,
    recordReview: (id) => w.router.recordCompatibilityReview(id),
    revokeReview: (id) => w.router.revokeCompatibilityReview(id),
    listModels: async (profile) => {
      expect(driverOf(profile)?.transport).toBe('api');
      const found = await w.apiDriver!.apiModels!(profileApiKey(w.keys, profile)!);
      rememberModels(profile.id, found);
      w.router.handle({ type: 'settings.models.detect', tool: profile.id });
      return found.length;
    },
    save: (id, summary) => w.router.saveConnection(id, summary),
    saved: (id) => w.router.savedConnections()[id] ?? null,
    publish: (state) => {
      published.push(state);
      w.router.setConnections(connector.snapshot(['gemini']));
    },
    redact: (text) => w.router.redactCredentials(text),
  });
  return connector;
}

/** A API falsa: a lista de modelos responde a conferência da chave; o `generateContent` segue o roteiro. */
const api =
  (script: (n: number) => GeminiTurn) =>
  (_body: unknown, _n: number, url: string): GeminiTurn => {
    if (url.startsWith('/v1beta/models?')) return modelsList(GEMINI_MODEL.model, 'gemini-2.5-flash');
    calls++;
    return script(calls);
  };
let calls = 0;

/** Conecta o Gemini pelo cartão API e escolhe no card um modelo que a conexão trouxe da conta. */
async function connectApi(w: CardWorld, published: ConnectState[] = []) {
  const connector = connectorOf(w, published);
  expect(await connector.connect('gemini', { mode: 'api' })).toMatchObject({ mode: 'api', step: 'signIn', needs: 'api-key' });
  const done = await connector.connect('gemini', { mode: 'api', apiKey: KEY });
  const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value: GEMINI_MODEL.id });
  return done;
}

describe('cenário: Conectar o Gemini pelo cartão API e rodar um card por ele, permissão board', () => {
  it('A: a chave conferida na hora, o modo api no perfil; o card lê e responde pelo servidor do board, sem desvio', async () => {
    calls = 0;
    let number = 0;
    server = await fakeGemini(
      api((n) =>
        n === 1
          ? modelTurn([
              { functionCall: { id: 'c1', name: 'mcp__faz-ai__get_card', args: { card: number } }, thoughtSignature: 'YXNzaW5hdHVyYQ==' },
            ])
          : n === 2
            ? modelTurn([
                { functionCall: { id: 'c2', name: 'mcp__faz-ai__add_comment', args: { card: number, body: 'Trabalho da fase feito.' } } },
              ])
            : modelTurn([{ text: 'Fase concluída.\n' }], { promptTokenCount: 900, candidatesTokenCount: 60, totalTokenCount: 960 }),
      ),
    );
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    const w = world;
    number = w.router.snapshot().cards.find((c) => c.id === w.cardId)!.number;
    // o selo Recomendado do Gemini está no cartão API
    expect(recommendedOffered(toolEntry('gemini')!)).toBe('api');
    const published: ConnectState[] = [];

    const done = await connectApi(w, published);

    expect(done).toMatchObject({
      mode: 'api',
      status: 'connected',
      summary: { version: null, signIn: 'api-key-checked', regime: 'exclusive', reviewed: null, models: 2 },
    });
    const profile = w.router.snapshot().board.aiProfiles.find((p) => p.id === 'gemini')!;
    expect(profile).toMatchObject({ mode: 'api', enabled: true });
    expect(w.keys.get('gemini')).toBe(KEY);
    expect(w.router.snapshot().board.modelCatalog.map((m) => m.id)).toEqual(
      expect.arrayContaining(['gemini:gemini-2.5-pro', 'gemini:gemini-2.5-flash']),
    );
    // a conferência foi uma leitura da lista de modelos, com a chave só no cabeçalho
    expect(server.requests[0]).toMatchObject({ method: 'GET', url: '/v1beta/models?pageSize=1000' });

    const end = await w.run();

    expect(w.lines.join('\n')).not.toMatch(/Não foi possível executar|bloqueada pela admissão|capability-not-verified/);
    expect(end.outcome).toBe('done');
    expect(w.aiRun()).toMatchObject({ tool: 'gemini', mode: 'api', outcome: 'done', permission: 'board' });
    expect(w.aiRun()!.admission).toMatchObject({ state: 'admitted', regime: 'exclusive' });
    const generate = server.requests.filter((r) => r.method === 'POST');
    expect(generate).toHaveLength(3);
    expect(generate[0]!.url).toBe(`/v1beta/models/${GEMINI_MODEL.model}:generateContent`);
    expect(server.requests.every((r) => r.headers['x-goog-api-key'] === KEY && !r.url.includes(KEY))).toBe(true);
    // o pedido do board, com o agente da fase pelo pedido, é a systemInstruction
    const system = generate[0]!.body.systemInstruction.parts.map((p: { text: string }) => p.text).join('\n');
    expect(system).toContain('Você atua como o agente "condutor-do-board"');
    // as ferramentas declaradas são as do servidor do board, do servidor de verdade
    const declared: string[] = generate[0]!.body.tools[0].functionDeclarations.map((d: { name: string }) => d.name);
    expect(declared).toContain('mcp__faz-ai__get_card');
    expect(declared).toContain('mcp__faz-ai__add_comment');
    expect(declared.every((name) => name.startsWith('mcp__faz-ai__'))).toBe(true);
    // a resposta do get_card voltou ao modelo, e a parte com a assinatura voltou como veio
    expect(generate[1]!.body.contents[1].parts[0].thoughtSignature).toBe('YXNzaW5hdHVyYQ==');
    expect(JSON.stringify(generate[1]!.body.contents[2])).toContain('Card do cenário');

    // a mensagem na conversa veio pelo servidor do board, assinada pelo cliente: o Gemini
    const comment = w.router.snapshot().comments.find((c) => c.cardId === w.cardId && c.body === 'Trabalho da fase feito.');
    expect(comment).toMatchObject({ author: 'Gemini', source: 'ai' });
    expect(end.report.inventory.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { kind: 'mcp_tool', name: 'faz-ai/add_comment', calls: 1 },
      { kind: 'mcp_tool', name: 'faz-ai/get_card', calls: 1 },
    ]);
    expect(end.report).toMatchObject({ measure: 'full', consumption: { turns: 3 } });
    expect(end.check).toEqual({ status: 'ok' });
    expect(w.lines.some((l) => l.endsWith('Conferência: sem desvio.'))).toBe(true);
    expect(w.comments().some((b) => b.startsWith(DEVIATION))).toBe(false);
    // respondeu na conversa e passou a vez à pessoa
    expect(w.router.snapshot().cards.find((c) => c.id === w.cardId)?.status).toBe('waiting_answer');

    // a chave não aparece no canal, nos passos publicados, no log de uso, no estado da tela nem na exportação
    expect(w.lines.join('\n')).not.toContain(KEY);
    expect(JSON.stringify(published)).not.toContain(KEY);
    expect(JSON.stringify(w.db.exec('SELECT * FROM ai_runs'))).not.toContain(KEY);
    expect(JSON.stringify(w.router.snapshot())).not.toContain(KEY);
    const { file } = exportBoard(w.db, w.router.boardId, { pathOf: () => '' }, { extensionVersion: 'test' });
    expect(JSON.stringify(file)).not.toContain(KEY);
  });

  it('B: a API recusa a chave nova: a guardada continua e o perfil não muda de modo', async () => {
    calls = 0;
    server = await fakeGemini((_b, _n, url) =>
      url.startsWith('/v1beta/models?')
        ? { status: 400, json: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid.' } } }
        : 'hang',
    );
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    world.keys.set('gemini', 'AIzaSy-a-chave-que-o-acp-ja-usa');
    const state = await connectorOf(world).connect('gemini', { mode: 'api', apiKey: KEY });
    expect(state).toMatchObject({ step: 'signIn', status: 'waiting', needs: 'api-key' });
    expect(state.error).toBe('A API do Gemini recusou a chave (HTTP 400, INVALID_ARGUMENT): API key not valid.');
    expect(world.keys.get('gemini')).toBe('AIzaSy-a-chave-que-o-acp-ja-usa');
    expect(world.router.snapshot().board.aiProfiles.find((p) => p.id === 'gemini')?.mode).toBe('acp');
  });

  it('C: com a permissão full o card não roda pela API ainda (história 11), com a causa no canal', async () => {
    calls = 0;
    server = await fakeGemini(api(() => 'hang'));
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'full', api: { endpoint: server.endpoint } });
    await connectApi(world);

    await expect(world.run()).rejects.toThrow(API_BOARD_ONLY);

    expect(server.requests.filter((r) => r.method === 'POST')).toEqual([]);
    expect(world.lines.some((l) => l.includes('Não foi possível executar') && l.includes('Só o board'))).toBe(true);
    expect(world.aiRun()).toMatchObject({ mode: 'api', outcome: 'unsupported' });
  });
});
