// O gateway com o perfil do Gemini no modo API (épica "ferramenta por modo", história 10): a admissão
// de verdade (vínculo do modo API, evidência por construção afirmada e assinada pelo host), o log de uso
// de verdade e o driver contra o servidor HTTP falso. O que se prova aqui é a fronteira: uma ferramenta
// fora da decisão do card nunca é declarada ao modelo, e a chave nunca sai para log, `ai_runs` nem evidência.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { AiGateway, NO_CARD, type AiCall, type AiRunEnd } from '../src/extension/ai/gateway';
import { ExecutionAdmission } from '../src/extension/ai/admission';
import { CapabilityEvidenceStore } from '../src/extension/ai/capabilityEvidence';
import { executorOf } from '../src/extension/ai/drivers';
import { createGeminiApiDriver, type McpConnect, type McpTool } from '../src/extension/ai/drivers/gemini/api';
import { legacyStrictRequest } from '../src/extension/ai/v1Prepare';
import { profileApiKey } from '../src/extension/ai/apiKey';
import { ToolKeys } from '../src/extension/toolKeys';
import { credentialsFor } from '../src/extension/credentials';
import { openInMemory } from '../src/extension/db/database';
import type { HeadlessInput } from '../src/extension/headless';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BUILTIN_PROFILES, type AiProfile } from '../src/shared/aiProfiles';
import { monthOf } from '../src/shared/log';
import type { RunnerPermission } from '../src/shared/runner';
import { fakeGemini, modelTurn, type FakeGemini } from './fakes/geminiServer';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const KEY = 'AIzaChaveDoGateway-nunca-sai-9876543210';
let dir: string;
let db: Database;
let router: MessageRouter;
let server: FakeGemini | undefined;

beforeEach(async () => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-gw-api-')));
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
});
afterEach(async () => {
  await server?.close();
  server = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

/** O Gemini pronto no modo API, como o host o resolve: a configuração é a do catálogo; a chave fica no cofre da ferramenta. */
const PROFILE: AiProfile = {
  ...structuredClone(BUILTIN_PROFILES.find((p) => p.id === 'gemini')!),
  enabled: true,
  mode: 'api',
  credentials: { secretRef: '', review: 'reviewed', available: true },
};

/** Os servidores do board, do card (`docs`) e um que o card não seleciona (`intruso`). */
const TOOLS: Record<string, McpTool[]> = {
  'faz-ai': [
    { name: 'get_card', inputSchema: { type: 'object' } },
    { name: 'add_comment', inputSchema: { type: 'object' } },
  ],
  docs: [{ name: 'search', inputSchema: { type: 'object' } }],
  intruso: [{ name: 'exfiltrar', inputSchema: { type: 'object' } }],
};

/** `deniedTools`: as ferramentas que o card nega (o manifesto, no vocabulário do card). */
function world(permission: RunnerPermission = 'board', deniedTools: string[] = []) {
  const connected: string[] = [];
  const executed: string[] = [];
  const connect: McpConnect = async (name) => {
    connected.push(name);
    return {
      listTools: async () => TOOLS[name] ?? [],
      callTool: async (tool) => {
        executed.push(`${name}/${tool}`);
        return { content: [{ type: 'text', text: 'feito' }] };
      },
      instructions: () => undefined,
      close: async () => {},
    };
  };
  const driver = createGeminiApiDriver({ endpoint: server!.endpoint, connect });
  const evidenceDir = path.join(dir, 'evidencias');
  const pick = (p: AiProfile) => (p.mode === 'api' ? driver : executorOf(p));
  // o cofre de verdade da ferramenta, sobre o cofre do banco, como o host: o Conectar já guardou a chave
  const keys = new ToolKeys(credentialsFor(db), path.join(dir, 'tool-keys.json'));
  keys.set('gemini', KEY);
  const apiKey = (p: AiProfile) => profileApiKey(keys, p);
  const admission = new ExecutionAdmission({
    pathEnv: () => dir,
    homeDir: dir,
    evidence: new CapabilityEvidenceStore(evidenceDir),
    environmentEvidence: () => ({ state: 'complete', digest: 'a'.repeat(64) }),
    executorOf: pick,
    apiKey,
  });
  const lines: string[] = [];
  const gateway = new AiGateway({
    boardId: router.boardId,
    runLog: createRunLog(db),
    admission,
    executorOf: pick,
    apiKey,
    resolveProfile: () => structuredClone(PROFILE),
    spawn: () => {
      throw new Error('o modo API não inicia processo');
    },
  });
  const input: HeadlessInput = {
    prompt: 'Refine o card #1.',
    permission,
    boardServer: { command: 'node', args: ['bridge.js', dir] },
    exec: {
      agent: '',
      agentDefinition: null,
      mcpAllowed: ['docs', 'intruso'],
      mcpBlocked: [],
      // a configuração traz um servidor a mais do que o card admitiu: a admissão o tira
      mcpConfig: JSON.stringify({
        mcpServers: {
          'faz-ai': { type: 'stdio', command: 'node', args: ['bridge.js', dir] },
          docs: { command: 'docs-mcp', args: [] },
          intruso: { command: 'intruso-mcp', args: [] },
        },
      }),
      tools: [],
      deniedTools,
      model: { name: 'gemini-2.5-pro', effort: null },
    },
  };
  const call: AiCall = {
    origin: 'manual',
    tool: 'gemini',
    profile: PROFILE,
    context: NO_CARD,
    cwd: dir,
    timeoutMinutes: 30,
    prepare: () => ({
      strict: { profileId: 'gemini', request: legacyStrictRequest(router.snapshot().board.runner, permission, ['docs']) },
      conference: { manifest: { agent: '', skills: [], mcpServers: ['docs'], tools: [], deniedTools }, boardServer: 'faz-ai' },
      input,
      config: {
        model: 'gemini-2.5-pro',
        effort: null,
        profile: null,
        agent: null,
        autonomous: false,
        clean: false,
        skills: [],
        mcp: ['docs'],
      },
    }),
    log: (line) => lines.push(line),
  };
  const run = () =>
    new Promise<AiRunEnd>((resolve, reject) => {
      try {
        gateway.run(call).onExit(resolve);
      } catch (e) {
        reject(e);
      }
    });
  return { run, connected, executed, lines, evidenceDir };
}

const declaredIn = (body: any): string[] => body.tools?.[0]?.functionDeclarations.map((d: { name: string }) => d.name) ?? [];

describe('gateway no modo API: a decisão do card é a fronteira do que o modelo vê', () => {
  it('uma ferramenta fora da decisão nunca é declarada ao modelo, e a chamada a ela não roda', async () => {
    server = await fakeGemini([
      modelTurn([
        { functionCall: { id: 'a', name: 'mcp__intruso__exfiltrar', args: {} } },
        { functionCall: { id: 'b', name: 'mcp__docs__search', args: { q: 'x' } } },
      ]),
      modelTurn([{ text: 'Card refinado.' }]),
    ]);
    const w = world();

    const end = await w.run();

    expect(end.outcome).toBe('done');
    // o servidor que o card não admitiu nem é conectado: as ferramentas dele não existem para o modelo
    expect(w.connected.sort()).toEqual(['docs', 'faz-ai']);
    for (const request of server.requests) {
      // em `board`, as ferramentas locais de leitura (história 11) e as MCP admitidas
      expect(declaredIn(request.body)).toEqual([
        'read_file',
        'glob',
        'grep',
        'mcp__faz-ai__get_card',
        'mcp__faz-ai__add_comment',
        'mcp__docs__search',
      ]);
      expect(declaredIn(request.body)).not.toContain('mcp__intruso__exfiltrar');
    }
    expect(w.executed).toEqual(['docs/search']);
    expect(end.report.inventory).toEqual([{ kind: 'mcp_tool', name: 'docs/search', calls: 1 }]);
    // o MCP do card conta na conferência como liberado: sem desvio
    expect(end.check).toEqual({ status: 'ok' });
  });

  it('o host afirma a evidência por construção, a execução é admitida no regime exclusivo e o log grava o modo api', async () => {
    server = await fakeGemini([
      modelTurn([{ text: 'pronto' }], { promptTokenCount: 300, candidatesTokenCount: 30, totalTokenCount: 330 }),
      modelTurn([{ text: 'de novo' }]),
    ]);
    const w = world();

    const end = await w.run();

    const row = new AiRunRepo(db).byMonth(monthOf(Date.now()))[0]!;
    expect(row).toMatchObject({ tool: 'gemini', mode: 'api', outcome: 'done', permission: 'board' });
    expect(row.admission).toMatchObject({ state: 'admitted', regime: 'exclusive' });
    expect(row.admission!.capabilities.every((c) => c.state === 'verified')).toBe(true);
    expect(end.report).toMatchObject({ measure: 'full', consumption: { inputTokens: 300, outputTokens: 30 } });
    // um recibo por capacidade, todos da fonte por construção e assinados pelo host
    const files = fs.readdirSync(w.evidenceDir).filter((f) => /^[a-f0-9]{64}-.*\.json$/.test(f));
    expect(files).toHaveLength(5);
    for (const f of files) expect(JSON.parse(fs.readFileSync(path.join(w.evidenceDir, f), 'utf8')).evidence.source).toBe('by-construction');

    // a segunda execução no mesmo vínculo usa a prova em vigor: nada novo é afirmado
    expect((await w.run()).outcome).toBe('done');
    expect(fs.readdirSync(w.evidenceDir).filter((f) => /^[a-f0-9]{64}-.*\.json$/.test(f))).toHaveLength(5);
  });

  it('a chave nunca vai para o log, o ai_runs, a evidência, a URL ou o erro', async () => {
    server = await fakeGemini([{ status: 403, json: { error: { status: 'PERMISSION_DENIED', message: `chave ${KEY} sem acesso` } } }]);
    const w = world();

    const end = await w.run();

    expect(end.outcome).toBe('failed');
    expect(server.requests[0]!.headers['x-goog-api-key']).toBe(KEY);
    expect(server.requests[0]!.url).not.toContain(KEY);
    const everything = [
      ...w.lines,
      end.error?.message ?? '',
      JSON.stringify(end.report),
      JSON.stringify(db.exec('SELECT * FROM ai_runs')),
      ...fs.readdirSync(w.evidenceDir).map((f) => f + fs.readFileSync(path.join(w.evidenceDir, f), 'latin1')),
      JSON.stringify(router.snapshot()),
    ].join('\n');
    expect(everything).not.toContain(KEY);
  });

  it('as ferramentas locais seguem o nível (história 11): edits ganha escrita, full ganha o comando', async () => {
    for (const [permission, expected] of [
      ['edits', ['read_file', 'glob', 'grep', 'write_file', 'edit_file']],
      ['full', ['read_file', 'glob', 'grep', 'write_file', 'edit_file', 'run_command']],
    ] as const) {
      server = await fakeGemini([modelTurn([{ text: 'pronto' }])]);
      const end = await world(permission).run();
      expect(end.outcome).toBe('done');
      expect(declaredIn(server.requests[0]!.body).filter((n) => !n.startsWith('mcp__'))).toEqual(expected);
      const row = new AiRunRepo(db).byMonth(monthOf(Date.now())).at(-1)!;
      expect(row).toMatchObject({ outcome: 'done', mode: 'api', permission });
      // o registro da admissão diz o que foi declarado, no vocabulário do card
      expect(row.admission!.tools).toEqual(
        permission === 'edits' ? ['Read', 'Glob', 'Grep', 'Write', 'Edit'] : ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash'],
      );
      await server.close();
      server = undefined;
    }
  });

  it('as ferramentas que o card nega não são declaradas, mesmo com o nível full', async () => {
    server = await fakeGemini([
      modelTurn([{ functionCall: { id: 'x', name: 'run_command', args: { command: 'echo', args: ['oi'] } } }]),
      modelTurn([{ text: 'pronto' }]),
    ]);
    const w = world('full', ['Bash', 'Write']);

    const end = await w.run();

    expect(end.outcome).toBe('done');
    // Write negado tira as duas de escrita (o grupo de edição), Bash tira o comando
    expect(declaredIn(server.requests[0]!.body).filter((n) => !n.startsWith('mcp__'))).toEqual(['read_file', 'glob', 'grep']);
    // a chamada à função não declarada volta como erro, sem rodar e sem entrar no inventário
    expect(JSON.stringify(server.requests[1]!.body.contents.at(-1))).toContain('não existe nesta execução');
    expect(end.report.inventory).toEqual([]);
    const row = new AiRunRepo(db).byMonth(monthOf(Date.now())).at(-1)!;
    expect(row.admission!.tools).toEqual(['Read', 'Glob', 'Grep']);
    expect(row.admission!.deniedTools).toEqual(expect.arrayContaining(['Bash', 'Write', 'Agent']));
  });

  it('a negação do card no vocabulário do Gemini e sem maiúsculas vale; um nome desconhecido recusa a execução', async () => {
    server = await fakeGemini([modelTurn([{ text: 'pronto' }])]);
    expect((await world('full', ['run_shell_command', 'replace']).run()).outcome).toBe('done');
    expect(declaredIn(server.requests[0]!.body).filter((n) => !n.startsWith('mcp__'))).toEqual(['read_file', 'glob', 'grep']);
    await server.close();

    server = await fakeGemini([modelTurn([{ text: 'pronto' }])]);
    await expect(world('full', ['FerramentaInventada']).run()).rejects.toThrow(/nega "FerramentaInventada", que o modo API não reconhece/);
    expect(server.requests).toEqual([]);
    const row = new AiRunRepo(db).byMonth(monthOf(Date.now())).at(-1)!;
    expect(row).toMatchObject({ outcome: 'unsupported', mode: 'api' });
    expect(row.admission!.reasons).toEqual([{ code: 'unsupported-native-restriction', resourceId: 'FerramentaInventada' }]);
  });
});
