import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import * as net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import type { Database } from 'sql.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { startMcpServer } from '../src/extension/mcp/server';
import { socketPath } from '../src/extension/mcp/socketPath';
import { ENDED_RUN } from '../src/extension/mcp/runSessions';
import { AiRunRepo } from '../src/extension/log/aiRunRepo';
import { CardEventRepo } from '../src/extension/log/cardEventRepo';
import { AiGateway, NO_CARD, type AiRunEnd } from '../src/extension/ai/gateway';
import { createRunLog } from '../src/extension/log/runLog';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { WorkRepo, type WorkClaim } from '../src/extension/repositories/workRepo';
import { RunArtifactSnapshots } from '../src/extension/runArtifactSnapshot';
import { bareExec } from '../src/extension/execution';
import { exportBoard } from '../src/extension/db/boardExport';
import { run } from '../src/extension/db/query';
import { monthOf } from '../src/shared/log';
import type { HeadlessCommand } from '../src/extension/headless';
import { AiRunner } from '../src/extension/runner';

let dir: string;
let db: Database;
let router: MessageRouter;
let cardId: string;
let otherId: string;
let artifacts: ArtifactRepo;
let snapshots: RunArtifactSnapshots;
let skillId: string;
let stop: (() => void) | undefined;
let clients: Client[];
const ref = (id: string) => router.snapshot().cards.find((c) => c.id === id)!.number;
const bridge = path.resolve(__dirname, '../dist/mcp-bridge.js');
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const result = await client.callTool({ name, arguments: args });
  return { error: result.isError === true, text: (result.content as { text: string }[]).map((c) => c.text).join('\n') };
};
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-run-mcp-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'run',
    folderName: 'Teste',
    author: 'Pessoa',
    workspaceDir: dir,
    attachmentsDir: path.join(dir, 'attachments'),
    homeDir: path.join(dir, 'home'),
  });
  const state = router.snapshot();
  const type = state.cardTypes[0]!;
  const columnId = state.columns.find((c) => c.workflowId === type.defaultWorkflowId)!.id;
  cardId = router.createCard({ typeId: type.id, columnId, title: 'Controlada', parentId: null });
  otherId = router.createCard({ typeId: type.id, columnId, title: 'Outra', parentId: null });
  router.handle({ type: 'harness.library.save', input: { kind: 'skill', name: 'selected', description: 'Selecionada', body: 'Skill v1' } });
  artifacts = new ArtifactRepo(db);
  skillId = artifacts.get(router.boardId, 'skill', 'selected')!.id;
  snapshots = new RunArtifactSnapshots(path.join(dir, 'snapshots'), artifacts, router.boardId);
  clients = [];
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(clients.map((client) => client.close().catch(() => {})));
  stop?.();
  stop = undefined;
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function claim(owner: string = router.executions.owner) {
  const card = router.snapshot().cards.find((c) => c.id === cardId)!;
  return router.work.claim({ kind: 'story', key: 'one', storyId: cardId, cardId, columnId: card.columnId }, owner, null)!;
}
function bind(c: WorkClaim, tools?: string[]) {
  const runId = new AiRunRepo(db).start({
    ...NO_CARD,
    cardId,
    boardId: router.boardId,
    startedAt: Date.now(),
    origin: 'manual',
    tool: 'claude',
  });
  router.executions.bind(c.token, c.work.id, runId);
  const library = router.snapshot().harness.library!;
  const snapshot = snapshots.capture(runId, { directory: library.directory, artifacts: library.artifacts.filter((a) => a.id === skillId) });
  const input = {
    prompt: 'Teste',
    permission: 'board' as const,
    exec: { ...bareExec(null), ...(tools ? { toolSet: 'explicit' as const, mcpTools: tools } : {}) },
  };
  router.executions.register(runId, snapshot, input);
  return { runId, snapshot };
}
async function connect(token?: string) {
  stop ??= await startMcpServer(socketPath(dir), {
    getRouter: async () => router,
    getRunner: async () => undefined,
    workspaceDir: dir,
    version: 'test',
  });
  const client = new Client({ name: 'claude-code', version: 'test' });
  clients.push(client);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridge, dir],
    env: { ...getDefaultEnvironment(), ...(token === undefined ? {} : { FAZAI_RUN_TOKEN: token }) },
    stderr: 'pipe',
  });
  await client.connect(transport);
  return client;
}

describe('identidade MCP com servidor e ponte reais', () => {
  it('fixa a definição do MCP externo e recusa servidor ou operação fora da seleção', async () => {
    const sdk = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk/dist/esm');
    const fixture = path.join(dir, 'remote.mjs');
    fs.writeFileSync(
      fixture,
      `import { McpServer } from ${JSON.stringify('file://' + sdk + '/server/mcp.js')};
import { StdioServerTransport } from ${JSON.stringify('file://' + sdk + '/server/stdio.js')};
const server = new McpServer({ name: 'fixture', version: '1' });
server.registerTool('ping', { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: process.env.REVISION }] }));
await server.connect(new StdioServerTransport());`,
    );
    const save = (revision: string) =>
      router.handle({
        type: 'harness.library.save',
        input: {
          id: artifacts.get(router.boardId, 'mcp', 'selected-remote')?.id,
          kind: 'mcp',
          name: 'selected-remote',
          description: '',
          body: '',
          server: { command: process.execPath, args: [fixture], env: { REVISION: revision } },
        },
      });
    save('v1');
    router.handle({ type: 'harness.selection.set', items: [{ kind: 'mcp', location: 'board:selected-remote' }], usage: 'always' });
    const c = claim();
    const runId = new AiRunRepo(db).start({
      ...NO_CARD,
      cardId,
      boardId: router.boardId,
      startedAt: Date.now(),
      origin: 'manual',
      tool: 'claude',
    });
    router.executions.bind(c.token, c.work.id, runId);
    const snapshot = snapshots.capture(runId, { directory: '', artifacts: [] });
    router.executions.register(runId, snapshot, {
      prompt: 'Teste',
      permission: 'board',
      exec: {
        ...bareExec(null),
        mcpAllowed: ['selected-remote'],
        toolSet: 'explicit',
        mcpTools: ['mcp__faz-ai__call_board_mcp_tool', 'mcp__selected-remote__ping'],
      },
    });
    save('v2');
    const client = await connect(c.token);
    expect(await call(client, 'call_board_mcp_tool', { server: 'selected-remote', name: 'ping', arguments: {} })).toEqual({
      error: false,
      text: 'v1',
    });
    expect((await call(client, 'call_board_mcp_tool', { server: 'other', name: 'ping', arguments: {} })).error).toBe(true);
    expect((await call(client, 'call_board_mcp_tool', { server: 'selected-remote', name: 'other', arguments: {} })).error).toBe(true);
    router.executions.revoke(c.token);
    expect((await call(client, 'call_board_mcp_tool', { server: 'selected-remote', name: 'ping', arguments: {} })).text).toContain(
      ENDED_RUN,
    );
  });
  it('um token ainda vivo no banco, mas pertencente a outra instância, não autentica esta janela', async () => {
    const c = claim('another-host');
    expect(router.work.tokenAlive(c.token)).toBe(true);
    expect(await call(await connect(c.token), 'get_board')).toEqual({ error: true, text: ENDED_RUN });
  });
  it('token vivo conta mutações, atribui o run e recusa a mesma conexão depois da revogação', async () => {
    const c = claim();
    const { runId } = bind(c);
    const client = await connect(c.token);
    expect((await call(client, 'get_board')).error).toBe(false);
    expect(router.work.latest(c.work.id)!.mutations).toBe(0);
    expect((await call(client, 'add_comment', { card: ref(cardId), body: 'Resultado' })).error).toBe(false);
    expect(router.work.latest(c.work.id)!.mutations).toBe(1);
    const event = new CardEventRepo(db).byMonth(monthOf(Date.now())).find((e) => e.kind === 'comment')!;
    expect(event).toMatchObject({ runId, source: 'ai' });
    router.executions.revoke(c.token);
    const before = router.snapshot().comments.length;
    expect(await call(client, 'add_comment', { card: ref(cardId), body: 'Tardia' })).toEqual({ error: true, text: ENDED_RUN });
    expect(router.snapshot().comments).toHaveLength(before);
    expect(await call(client, 'get_board')).toEqual({ error: true, text: ENDED_RUN });
  });
  it('geração antiga, token desconhecido e owner anterior são recusados sem alterar o board', async () => {
    const first = claim();
    bind(first);
    const old = await connect(first.token);
    router.work.transition(first.work.id, 1, router.executions.owner, 'reconciling');
    router.work.finish(first.work.id, 1, router.executions.owner, { kind: 'retry-safe', reason: 'Sem efeito' });
    const next = claim();
    bind(next);
    run(db, 'UPDATE ai_work_attempts SET token_hash = ? WHERE id = ?', [
      createHash('sha256').update(first.token).digest('hex'),
      first.attempt.id,
    ]);
    expect(await call(old, 'add_comment', { card: ref(cardId), body: 'Antiga' })).toEqual({ error: true, text: ENDED_RUN });
    expect((await call(await connect(next.token), 'get_board')).error).toBe(false);
    expect(await call(await connect('a'.repeat(64)), 'get_board')).toEqual({ error: true, text: ENDED_RUN });
    router.work.recoverOwner('new-host');
    expect(await call(await connect(next.token), 'get_board')).toEqual({ error: true, text: ENDED_RUN });
    expect(router.snapshot().comments).toEqual([]);
  });
  it('sessão externa continua funcionando, sem herdar run_id, mas não toma um card com unidade viva', async () => {
    const c = claim();
    const { runId } = bind(c);
    router.setRunResolver(() => runId);
    const external = await connect();
    expect((await call(external, 'get_board')).error).toBe(false);
    expect((await call(external, 'add_comment', { card: ref(cardId), body: 'Externa' })).error).toBe(false);
    const event = new CardEventRepo(db).byMonth(monthOf(Date.now())).find((e) => e.kind === 'comment')!;
    expect(event.runId).toBeNull();
    expect((await call(external, 'start_work', { card: ref(cardId) })).text).toContain('O board está executando');
    expect(router.work.latest(c.work.id)!.mutations).toBe(0);
  });
  it('get_skill e get_board_artifact preservam v1 após edição/exclusão, sem ler o cache nem aceitar artefato extra', async () => {
    const c = claim();
    const { snapshot } = bind(c);
    const client = await connect(c.token);
    router.handle({
      type: 'harness.library.save',
      input: { id: skillId, kind: 'skill', name: 'selected', description: 'Nova', body: 'Skill v2' },
    });
    router.handle({
      type: 'harness.library.save',
      input: { kind: 'skill', name: 'outside', description: 'Fora', body: 'CORPO FORA DO SNAPSHOT' },
    });
    expect((await call(client, 'get_skill', { skill: 'selected' })).text).toBe(snapshot.artifact(skillId).body);
    expect((await call(client, 'get_board_artifact', { id: skillId })).text).toContain('Skill v1');
    artifacts.remove(router.boardId, skillId);
    fs.rmSync(router.snapshot().harness.library!.directory, { recursive: true, force: true });
    expect((await call(client, 'get_skill', { skill: 'selected' })).text).toBe(snapshot.artifact(skillId).body);
    const outside = await call(client, 'get_skill', { skill: 'outside' });
    expect(outside.error).toBe(true);
    expect(outside.text).not.toContain('CORPO FORA');
    snapshot.validate();
  });
  it('operações fora do contrato e comentários de outro card são recusados', async () => {
    const c = claim();
    bind(c, ['mcp__faz-ai__get_board', 'mcp__faz-ai__add_comment']);
    const client = await connect(c.token);
    expect((await call(client, 'get_board')).error).toBe(false);
    expect((await call(client, 'get_skill', { skill: 'selected' })).text).toContain('fora do contrato');
    expect((await call(client, 'add_comment', { card: ref(otherId), body: 'Não gravar' })).text).toContain('fora do escopo');
    expect(router.snapshot().comments).toEqual([]);
    expect(router.work.latest(c.work.id)!.mutations).toBe(0);
  });
  it('o bearer não é persistido nem devolvido se vier num argumento de ferramenta', async () => {
    const c = claim();
    bind(c);
    const client = await connect(c.token);
    const result = await call(client, 'add_comment', { card: ref(cardId), body: `Segredo: ${c.token}` });
    expect(result.error).toBe(false);
    expect(result.text).not.toContain(c.token);
    expect(JSON.stringify(router.snapshot())).not.toContain(c.token);
    expect(JSON.stringify(exportBoard(db, router.boardId, router.store, { extensionVersion: 'test' }).file)).not.toContain(c.token);
  });
  it('apresentação depois de initialize fecha a conexão em vez de mudar sua identidade', async () => {
    await connect();
    const socket = net.connect(socketPath(dir));
    await once(socket, 'connect');
    const closed = once(socket, 'close');
    socket.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      }) + '\n',
    );
    socket.write(JSON.stringify({ fazai: { run: 'a'.repeat(64) } }) + '\n');
    await closed;
    expect(router.snapshot().comments).toEqual([]);
  });
  it('a ponte recusa token malformado sem expor seu valor nem virar uma sessão externa', async () => {
    const secret = 'TOKEN-INVALIDO-SENTINELA';
    const child = spawn(process.execPath, [bridge, dir], {
      env: { ...getDefaultEnvironment(), FAZAI_RUN_TOKEN: secret },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      error += String(chunk);
    });
    const [code] = await once(child, 'exit');
    expect(code).toBe(1);
    expect(output).toBe('');
    expect(error).toContain('token de execução inválido');
    expect(error).not.toContain(secret);
  });
  it('read_rule_file também lê somente a versão fixada', async () => {
    router.handle({ type: 'harness.library.save', input: { kind: 'rule', name: 'CLAUDE.md', description: '', body: 'Regra v1' } });
    const c = claim();
    const runId = new AiRunRepo(db).start({
      ...NO_CARD,
      cardId,
      boardId: router.boardId,
      startedAt: Date.now(),
      origin: 'manual',
      tool: 'claude',
    });
    router.executions.bind(c.token, c.work.id, runId);
    const library = router.snapshot().harness.library!;
    const rule = library.artifacts.find((a) => a.kind === 'rule' && a.name === 'CLAUDE.md')!;
    // Rules novas nascem desligadas; a pessoa as seleciona antes da execução.
    artifacts.setUsage(router.boardId, rule.id, 'contextual');
    router.refreshHarness();
    const current = router.snapshot().harness.library!;
    const snapshot = snapshots.capture(runId, {
      directory: current.directory,
      artifacts: current.artifacts.filter((a) => a.id === rule.id),
    });
    router.executions.register(runId, snapshot, { prompt: 'Regra', permission: 'board' });
    router.handle({
      type: 'harness.library.save',
      input: { id: rule.id, kind: 'rule', name: 'CLAUDE.md', description: '', body: 'Regra v2' },
    });
    expect((await call(await connect(c.token), 'read_rule_file', { file: 'CLAUDE.md' })).text).toBe('Regra v1');
  });
});

describe('guardas do host depois de await', () => {
  it('o runner recebe identidade e orientação, devolve o resultado ao dono e não aplica o desfecho legado', () => {
    const c = claim();
    let exit!: (code: number) => void;
    let output!: (text: string, stream: 'stdout' | 'stderr') => void;
    const commands: HeadlessCommand[] = [];
    const gateway = new AiGateway({
      boardId: router.boardId,
      runLog: createRunLog(db),
      snapshots,
      sessions: router.executions,
      spawn: (command, _cwd, out) => {
        commands.push(command);
        output = out;
        return {
          kill: () => exit(143),
          onExit: (fn) => {
            exit = fn;
          },
        };
      },
    });
    const runner = new AiRunner(router, {
      gateway,
      cwd: dir,
      homeDir: path.join(dir, 'home'),
      bridgePath: bridge,
      nodePath: process.execPath,
      log: () => {},
    });
    const done = vi.fn();
    expect(() => runner.start(cardId, { origin: 'manual', workId: c.work.id })).toThrow('token e identidade');
    expect(() => runner.start(otherId, { origin: 'manual', workId: c.work.id, token: c.token })).toThrow('não pertence');
    expect(commands).toHaveLength(0);
    runner.start(cardId, { origin: 'manual', workId: c.work.id, token: c.token, advice: ['ORIENTAÇÃO DO ORQUESTRADOR'], onExit: done });
    expect(commands).toHaveLength(1);
    expect(commands[0]!.stdin).toContain('ORIENTAÇÃO DO ORQUESTRADOR');
    const comments = router.snapshot().comments.length;
    output(
      JSON.stringify({ type: 'result', subtype: 'success', result: 'Concluído', usage: { input_tokens: 2, output_tokens: 1 } }) + '\n',
      'stdout',
    );
    exit(0);
    expect(done).toHaveBeenCalledOnce();
    expect(runner.isRunning(cardId)).toBe(false);
    expect(router.work.tokenAlive(c.token)).toBe(false);
    expect(router.snapshot().comments).toHaveLength(comments);
    // A reconciliação pertence ao orquestrador; código zero não conclui a unidade persistida.
    expect(router.work.live()).toHaveLength(1);
  });
  it('generate_summary não inicia outra IA se a revogação ocorrer enquanto aguarda o runner', async () => {
    router.handle({ type: 'comment.add', cardId, body: 'Um' });
    router.handle({ type: 'comment.add', cardId, body: 'Dois' });
    const c = claim();
    bind(c);
    let unblock!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const start = vi.fn();
    stop = await startMcpServer(socketPath(dir), {
      getRouter: async () => router,
      workspaceDir: dir,
      version: 'test',
      getRunner: async () => {
        entered();
        await waiting;
        return { start } as unknown as AiRunner;
      },
    });
    const client = await connect(c.token);
    const response = call(client, 'generate_summary', { card: ref(cardId) });
    await reached;
    router.executions.revoke(c.token);
    unblock();
    expect((await response).text).toBe(ENDED_RUN);
    expect(start).not.toHaveBeenCalled();
    expect(router.snapshot().comments).toHaveLength(2);
  });
  it('um router retido por uma ferramenta assíncrona recusa a gravação tardia', async () => {
    const c = claim();
    bind(c);
    const operation = router.executions.tool(router, c.token, 'delayed', {}, false, 'IA');
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const late = (async () => {
      await wait;
      operation.router.handle({ type: 'comment.add', cardId, body: 'Tardia' });
    })();
    router.executions.revoke(c.token);
    release();
    await expect(late).rejects.toThrow(ENDED_RUN);
    expect(router.snapshot().comments).toEqual([]);
  });
  it('IDs indiretos de comentário/checklist também respeitam o card do run', () => {
    const c = claim();
    bind(c);
    router.handle({ type: 'comment.add', cardId: otherId, body: 'Original' });
    router.handle({ type: 'checklist.add', cardId: otherId, text: 'Original' });
    const state = router.snapshot();
    const proxy = router.executions.tool(router, c.token, 'edit', {}, false, 'IA').router;
    expect(() => proxy.handle({ type: 'comment.update', commentId: state.comments[0]!.id, body: 'Alterada' })).toThrow('fora do escopo');
    expect(() => proxy.handle({ type: 'checklist.delete', itemId: state.checklistItems[0]!.id })).toThrow('fora do escopo');
    expect(router.snapshot().comments[0]!.body).toBe('Original');
  });
});

describe('gateway com identidade de unidade', () => {
  it('injeta somente no env do MCP, oculta saída com token e revoga antes dos ouvintes', () => {
    const c = claim();
    const commands: HeadlessCommand[] = [];
    const logs: string[] = [];
    let feed!: (text: string, stream: 'stdout' | 'stderr') => void;
    let exit!: (code: number) => void;
    const gateway = new AiGateway({
      boardId: router.boardId,
      runLog: createRunLog(db),
      snapshots,
      sessions: router.executions,
      spawn: (command, _cwd, out) => {
        commands.push(command);
        feed = out;
        return {
          kill: () => exit(143),
          onExit: (fn) => {
            exit = fn;
          },
        };
      },
    });
    const execution = gateway.run({
      origin: 'manual',
      tool: 'claude',
      context: { ...NO_CARD, cardId },
      cwd: dir,
      timeoutMinutes: 1,
      log: (line) => logs.push(line),
      prepare: () => ({
        work: { id: c.work.id, token: c.token },
        artifacts: { directory: '', artifacts: [] },
        input: { permission: 'board', prompt: 'Teste', boardServer: { command: 'node', args: ['bridge.js'] } },
        config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: true, skills: [], mcp: [] },
      }),
    });
    const command = commands[0]!;
    expect(JSON.stringify(command.args)).not.toContain(c.token);
    expect(command.stdin).not.toContain(c.token);
    expect(JSON.parse(command.tempFiles!['mcp.json']!).mcpServers['faz-ai'].env.FAZAI_RUN_TOKEN).toBe(c.token);
    let end: AiRunEnd | undefined;
    execution.onExit((result) => {
      end = result;
      expect(router.work.tokenAlive(c.token)).toBe(false);
    });
    feed(c.token.slice(0, 20), 'stderr');
    feed(c.token.slice(20) + '\n', 'stderr');
    feed(
      JSON.stringify({ type: 'result', subtype: 'success', result: `Resposta ${c.token}`, usage: { input_tokens: 1, output_tokens: 1 } }) +
        '\n',
      'stdout',
    );
    exit(0);
    expect(logs.join('\n')).not.toContain(c.token);
    expect(end!.report.answer).not.toContain(c.token);
    expect(JSON.stringify(router.snapshot())).not.toContain(c.token);
  });
  it('Parar recusa a sessão mesmo se a gravação da revogação falhar e ainda mata o processo', () => {
    const c = claim();
    let exit!: (code: number) => void;
    const kill = vi.fn(() => exit(143));
    const gateway = new AiGateway({
      boardId: router.boardId,
      runLog: createRunLog(db),
      snapshots,
      sessions: router.executions,
      spawn: () => ({
        kill,
        onExit: (fn) => {
          exit = fn;
        },
      }),
    });
    const execution = gateway.run({
      origin: 'manual',
      tool: 'claude',
      context: { ...NO_CARD, cardId },
      cwd: dir,
      timeoutMinutes: 1,
      log: () => {},
      prepare: () => ({
        work: { id: c.work.id, token: c.token },
        artifacts: { directory: '', artifacts: [] },
        input: { permission: 'board', prompt: 'Teste', boardServer: { command: 'node', args: ['bridge.js'] } },
        config: { model: null, effort: null, profile: null, agent: null, autonomous: false, clean: true, skills: [], mcp: [] },
      }),
    });
    vi.spyOn(WorkRepo.prototype, 'revoke').mockImplementationOnce(() => {
      throw new Error('EIO');
    });
    execution.stop();
    expect(kill).toHaveBeenCalledOnce();
    expect(() => router.executions.assert(c.token)).toThrow(ENDED_RUN);
  });
});
