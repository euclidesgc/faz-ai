// Cenários de ponta a ponta do Gemini pela API (épica "ferramenta por modo", história 10): o Conectar de
// verdade pelo cartão API (a chave no cofre de verdade, `ToolKeys`, conferida na hora pela lista de modelos da
// API; o modo `api` gravado no perfil; os modelos no catálogo) e um card por esse perfil, do `runner.start`
// (plano de execution.ts, gateway, admissão do modo API com a evidência por construção afirmada pelo host, o
// laço de chamadas de função do driver, o servidor MCP do board de verdade como cliente de si mesmo, o
// relatório, a conferência) até a mensagem gravada na conversa do card. Só a API do Gemini é falsa: um
// servidor HTTP no próprio computador (ver cardWorld.ts). Na história 11, o mesmo card com as ferramentas
// locais: editar um arquivo em edits, rodar um comando em full, a fuga da pasta negada, o deniedTools do card
// valendo e a conferência sem desvio falso e com o desvio real. Os arquivos e o comando são de verdade.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Connector } from '../../src/extension/ai/connect';
import { CHAT_BOARD_TOOLS, ChatSession } from '../../src/extension/chat';
import { createAiProfileRuntime } from '../../src/extension/panel/handlers/aiProfiles';
import { driverOf } from '../../src/extension/ai/drivers';
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
    // em `board`, além das do servidor do board, só as ferramentas locais de leitura (história 11)
    expect(declared.filter((name) => !name.startsWith('mcp__faz-ai__'))).toEqual(['read_file', 'glob', 'grep']);
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
});

/** As funções locais declaradas no primeiro pedido ao modelo. */
const localDeclared = (s: FakeGemini): string[] =>
  s.requests
    .find((r) => r.method === 'POST')!
    .body.tools[0].functionDeclarations.map((d: { name: string }) => d.name)
    .filter((n: string) => !n.startsWith('mcp__'));
/** As respostas das funções que o board mandou de volta no pedido `n` (1 = o primeiro `generateContent`). */
const responsesIn = (s: FakeGemini, n: number): any[] => {
  const request = s.requests.filter((r) => r.method === 'POST')[n - 1]!;
  return request.body.contents.at(-1).parts.map((p: any) => p.functionResponse.response);
};

describe('cenário: o card pela API com arquivos e comandos (história 11)', () => {
  it('C: em edits, o card edita um arquivo do projeto pelo board, sem desvio, e o comando não existe para o modelo', async () => {
    calls = 0;
    server = await fakeGemini(
      api((n) =>
        n === 1
          ? modelTurn([
              { functionCall: { id: 'r', name: 'read_file', args: { path: 'notas.md' } } },
              { functionCall: { id: 'e', name: 'edit_file', args: { path: 'notas.md', old_string: 'pendente', new_string: 'feito' } } },
            ])
          : n === 2
            ? modelTurn([{ functionCall: { id: 'c', name: 'run_command', args: { command: 'touch', args: ['invadido'] } } }])
            : modelTurn([{ text: 'Notas atualizadas.' }]),
      ),
    );
    world = await cardWorld({
      profile: 'gemini-api',
      tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
      permission: 'edits',
      api: { endpoint: server.endpoint },
    });
    fs.writeFileSync(path.join(world.project, 'notas.md'), '# Notas\n\nstatus: pendente\n');
    await connectApi(world);

    const end = await world.run();

    expect(end.outcome).toBe('done');
    expect(world.aiRun()).toMatchObject({ mode: 'api', outcome: 'done', permission: 'edits' });
    expect(world.aiRun()!.admission).toMatchObject({ state: 'admitted', tools: ['Read', 'Glob', 'Grep', 'Write', 'Edit'] });
    expect(localDeclared(server)).toEqual(['read_file', 'glob', 'grep', 'write_file', 'edit_file']);
    // a lista do card vai pelo pedido, e o pedido diz qual função é qual ferramenta do card
    const system = server.requests
      .find((r) => r.method === 'POST')!
      .body.systemInstruction.parts.map((p: { text: string }) => p.text)
      .join('\n');
    expect(system).toContain('Use só estas ferramentas: Read, Grep, Glob, Edit, Write.');
    expect(system).toContain('edit_file (Edit)');
    expect(fs.readFileSync(path.join(world.project, 'notas.md'), 'utf8')).toBe('# Notas\n\nstatus: feito\n');
    // o comando pedido em edits não foi declarado: volta como erro, sem rodar
    expect(responsesIn(server, 3)[0].error).toMatch(/não existe nesta execução/);
    expect(fs.existsSync(path.join(world.project, 'invadido'))).toBe(false);
    expect(end.report.inventory).toEqual([
      { kind: 'tool', name: 'Read', calls: 1 },
      { kind: 'tool', name: 'Edit', calls: 1 },
    ]);
    // Read e Edit são do card: a conferência não inventa desvio
    expect(end.check).toEqual({ status: 'ok' });
    expect(world.lines.some((l) => l.endsWith('Conferência: sem desvio.'))).toBe(true);
    expect(world.lines.some((l) => l.endsWith('→ Edit notas.md'))).toBe(true);
  });

  it('D: em full, o card roda um comando na pasta do projeto, sem shell e sem a chave no ambiente, sem desvio', async () => {
    calls = 0;
    const script =
      'process.stdout.write(JSON.stringify({ cwd: process.cwd(), key: Object.values(process.env).some((v) => v.includes(process.argv[1])) }))';
    server = await fakeGemini(
      api((n) =>
        n === 1
          ? modelTurn([{ functionCall: { id: 'c', name: 'run_command', args: { command: process.execPath, args: ['-e', script, KEY] } } }])
          : modelTurn([{ text: 'Comando rodado.' }]),
      ),
    );
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'full', api: { endpoint: server.endpoint } });
    await connectApi(world);

    const end = await world.run();

    expect(end.outcome).toBe('done');
    expect(localDeclared(server)).toEqual(['read_file', 'glob', 'grep', 'write_file', 'edit_file', 'run_command']);
    const result = responsesIn(server, 2)[0];
    expect(result.exit_code).toBe(0);
    // o comando rodou na pasta do projeto, e nenhuma variável do ambiente dele trazia a chave (o script a recebe
    // de argumento só para procurá-la)
    expect(JSON.parse(result.stdout)).toEqual({ cwd: world.project, key: false });
    expect(end.report).toMatchObject({ inventory: [{ kind: 'tool', name: 'Bash', calls: 1 }], bashCommands: [{ command: 'node' }] });
    // Bash está nas ferramentas do condutor: sem desvio
    expect(end.check).toEqual({ status: 'ok' });
    expect(world.comments().some((b) => b.startsWith(DEVIATION))).toBe(false);
    expect(world.lines.join('\n')).not.toContain(KEY);
  });

  it('E: a tentativa de escapar da pasta do card é negada: `..`, caminho absoluto fora e o .git', async () => {
    calls = 0;
    let outside = '';
    server = await fakeGemini(
      api((n) =>
        n === 1
          ? modelTurn([
              { functionCall: { id: 'a', name: 'write_file', args: { path: '../fora.txt', content: 'escapei' } } },
              { functionCall: { id: 'b', name: 'write_file', args: { path: outside, content: 'escapei' } } },
              { functionCall: { id: 'c', name: 'read_file', args: { path: '../home/segredo.txt' } } },
              { functionCall: { id: 'd', name: 'write_file', args: { path: '.git/hooks/pre-commit', content: 'echo invadido' } } },
            ])
          : modelTurn([{ text: 'Não consegui.' }]),
      ),
    );
    world = await cardWorld({
      profile: 'gemini-api',
      tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
      permission: 'edits',
      api: { endpoint: server.endpoint },
    });
    outside = path.join(world.home, 'absoluto.txt');
    fs.writeFileSync(path.join(world.home, 'segredo.txt'), 'segredo do host');
    fs.mkdirSync(path.join(world.project, '.git', 'hooks'), { recursive: true });
    await connectApi(world);

    const end = await world.run();

    expect(end.outcome).toBe('done');
    const errors = responsesIn(server, 2).map((r) => r.error);
    expect(errors[0]).toMatch(/^Fora das pastas do card/);
    expect(errors[1]).toMatch(/^Fora das pastas do card/);
    expect(errors[2]).toMatch(/^Fora das pastas do card/);
    expect(errors[3]).toMatch(/é do git/);
    expect(fs.existsSync(path.join(world.root, 'fora.txt'))).toBe(false);
    expect(fs.existsSync(outside)).toBe(false);
    expect(fs.existsSync(path.join(world.project, '.git', 'hooks', 'pre-commit'))).toBe(false);
    expect(JSON.stringify(server.requests)).not.toContain('segredo do host');
  });

  it('F: o deniedTools do card vale no modo API: Bash negado não é declarado nem roda, mesmo em full', async () => {
    calls = 0;
    server = await fakeGemini(
      api((n) =>
        n === 1
          ? modelTurn([
              {
                functionCall: {
                  id: 'c',
                  name: 'run_command',
                  args: { command: process.execPath, args: ['-e', 'require("fs").writeFileSync("rodou", "")'] },
                },
              },
            ])
          : modelTurn([{ text: 'Sem comando.' }]),
      ),
    );
    world = await cardWorld({
      profile: 'gemini-api',
      tools: CONDUTOR_TOOLS,
      deniedTools: ['Bash'],
      permission: 'full',
      api: { endpoint: server.endpoint },
    });
    await connectApi(world);

    const end = await world.run();

    expect(end.outcome).toBe('done');
    expect(localDeclared(server)).toEqual(['read_file', 'glob', 'grep', 'write_file', 'edit_file']);
    expect(responsesIn(server, 2)[0].error).toMatch(/não existe nesta execução/);
    expect(fs.existsSync(path.join(world.project, 'rodou'))).toBe(false);
    expect(world.aiRun()!.admission!.deniedTools).toContain('Bash');
    expect(world.aiRun()!.admission!.tools).not.toContain('Bash');
  });

  it('G: o desvio real continua sendo pego: em full, Write sem estar nas ferramentas do card vira mensagem na conversa', async () => {
    calls = 0;
    server = await fakeGemini(
      api((n) =>
        n === 1
          ? modelTurn([
              { functionCall: { id: 'r', name: 'grep', args: { pattern: 'TODO' } } },
              { functionCall: { id: 'w', name: 'write_file', args: { path: 'saida.txt', content: 'gravado' } } },
            ])
          : modelTurn([{ text: 'Feito.' }]),
      ),
    );
    // o condutor não lista Write: o nível full libera, o board executa, e a conferência acusa
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'full', api: { endpoint: server.endpoint } });
    await connectApi(world);

    const end = await world.run();

    expect(end.outcome).toBe('done');
    expect(fs.readFileSync(path.join(world.project, 'saida.txt'), 'utf8')).toBe('gravado');
    expect(end.check).toEqual({ status: 'deviation', deviations: [{ kind: 'tool', name: 'Write', calls: 1 }] });
    expect(world.comments().some((b) => b.startsWith(DEVIATION) && b.includes('ferramenta Write'))).toBe(true);
  });
});

describe('cenário: o chat do board e o teste rápido pelo Gemini da API', () => {
  const answer = () => api(() => modelTurn([{ text: 'OK\n' }], { promptTokenCount: 50, candidatesTokenCount: 2, totalTokenCount: 52 }));

  it('o chat roda na permissão do board (aqui, full): o pedido de admissão sem card leva o nível dela, não "board"', async () => {
    calls = 0;
    server = await fakeGemini(answer());
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'full', api: { endpoint: server.endpoint } });
    const w = world;
    await connectApi(w);
    const chat = new ChatSession(w.router, { ...w.runnerDeps, file: path.join(w.root, 'chat.json') });

    chat.send('Olá', GEMINI_MODEL.id);
    await vi.waitFor(() => expect(chat.busy).toBe(false));

    // o chat declara ao modelo só as ferramentas do que ele faz, não as 81 do servidor do board
    const declared = server!.requests
      .filter((r) => r.url.includes(':generateContent'))
      .flatMap((r) => ((r.body as any).tools?.[0]?.functionDeclarations ?? []).map((d: { name: string }) => d.name));
    expect(declared.map((n: string) => n.replace('mcp__faz-ai__', '')).sort()).toEqual([...CHAT_BOARD_TOOLS].sort());

    expect(w.lines.some((l) => l.startsWith('[chat] Chamando Gemini (API): modelo gemini-2.5-pro'))).toBe(true);
    expect(w.router.snapshot().board.runner.permission).toBe('full');
    expect(calls).toBe(1);
  });

  it('o modelo que a lista da API traz mas a conta não pode usar (404) sai da lista, com a mensagem do Google', async () => {
    calls = 0;
    server = await fakeGemini((_body, _n, url) =>
      url.startsWith('/v1beta/models?')
        ? modelsList(GEMINI_MODEL.model, 'gemini-2.5-flash')
        : {
            status: 404,
            json: {
              error: { code: 404, status: 'NOT_FOUND', message: 'This model models/gemini-2.5-pro is no longer available to new users.' },
            },
          },
    );
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    const w = world;
    await connectApi(w);
    const chat = new ChatSession(w.router, { ...w.runnerDeps, file: path.join(w.root, 'chat.json') });
    const geminiModels = () =>
      w.router
        .snapshot()
        .board.modelCatalog.filter((o) => o.tool === 'gemini')
        .map((o) => o.model);
    expect(geminiModels()).toContain(GEMINI_MODEL.model);

    chat.send('Olá', GEMINI_MODEL.id);
    await vi.waitFor(() => expect(chat.busy).toBe(false));

    expect(geminiModels()).toEqual(['gemini-2.5-flash']);
    expect(JSON.stringify((chat as unknown as { messages: unknown }).messages)).toContain('no longer available to new users');
  });

  it('o teste rápido no modo API roda no modelo escolhido na aba e recusa sem modelo, sem chamar a API', async () => {
    calls = 0;
    server = await fakeGemini(answer());
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    const w = world;
    await connectApi(w);
    const logged: string[] = [];
    const runtime = createAiProfileRuntime({
      repo: new AiProfileRepo(w.db),
      gateway: w.runnerDeps.gateway,
      boardId: () => w.router.boardId,
      cwd: w.project,
      homeDir: w.home,
      pathEnv: () => undefined,
      runner: () => w.router.snapshot().board.runner,
      hasApiKey: () => true,
      log: (line) => logged.push(line),
    });

    const missing = await runtime.test('gemini');
    expect(missing).toMatchObject({ ok: false, error: 'Escolha o modelo do teste: no modo API a ferramenta não tem modelo padrão.' });
    expect(calls).toBe(0);

    const done = await runtime.test('gemini', GEMINI_MODEL.model);
    expect(done).toMatchObject({ ok: true });
    expect(calls).toBe(1);
    // o resultado fica no canal, não só na tela
    expect(logged).toEqual([
      'Teste rápido do Gemini CLI: falhou: Escolha o modelo do teste: no modo API a ferramenta não tem modelo padrão.',
      `Teste rápido do Gemini CLI (${GEMINI_MODEL.model}): respondeu`,
    ]);
  });
});
