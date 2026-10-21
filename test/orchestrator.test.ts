import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { openFile, type DbHandle } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { Orchestrator, type OrchestratorOptions } from '../src/extension/orchestrator';
import { AiGateway, NO_CARD, type AiExecution } from '../src/extension/ai/gateway';
import { ArtifactRepo } from '../src/extension/repositories/artifactRepo';
import { CommentRepo } from '../src/extension/repositories/commentRepo';
import { createRunLog } from '../src/extension/log/runLog';
import { RunArtifactSnapshots } from '../src/extension/runArtifactSnapshot';
import { spawnHeadless } from '../src/extension/spawn';
import { startMcpServer } from '../src/extension/mcp/server';
import { socketPath } from '../src/extension/mcp/socketPath';
import { acquireWorkspace } from '../src/extension/workspaceLock';
import { processGroupState, terminateProcessGroup } from '../src/extension/processIdentity';

let dir: string;
let workspace: string;
let handle: DbHandle;
let router: MessageRouter;
let storyId: string;
let codeColumn: string;
let doneColumn: string;
let stopMcp: (() => void) | undefined;
let orchestrator: Orchestrator;
let options: OrchestratorOptions;
let executions: Map<string, AiExecution>;
let starts: string[];
let mode: 'done' | 'partial' | 'hold';
let logs: string[];
const wasm = path.resolve(__dirname, '../node_modules/sql.js/dist');
const fixture = path.resolve(__dirname, 'fixtures/orchestrator-cli.mjs');
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-orchestrator-'));
  workspace = path.join(dir, 'workspace');
  fs.mkdirSync(workspace);
  handle = await openFile(path.join(dir, 'board.db'), wasm);
  router = new MessageRouter(handle, {
    workspaceKey: 'test',
    folderName: 'Teste',
    author: 'Pessoa',
    workspaceDir: workspace,
    homeDir: path.join(dir, 'home'),
    attachmentsDir: path.join(dir, 'attachments'),
  });
  const s = router.snapshot();
  const parent = s.workflows.find((w) => w.kind === 'parent')!;
  codeColumn = s.columns.find((c) => c.workflowId === parent.id && c.category === 'open' && c.aiActive && !c.artifactName)!.id;
  doneColumn = s.columns.find((c) => c.workflowId === parent.id && c.category === 'done')!.id;
  const type = s.cardTypes.find((t) => t.defaultWorkflowId === parent.id)!;
  storyId = router.createCard({ typeId: type.id, columnId: codeColumn, parentId: null, title: 'Orquestrar' });
  executions = new Map();
  starts = [];
  logs = [];
  mode = 'done';
  stopMcp = await startMcpServer(socketPath(workspace), {
    getRouter: async () => router,
    getRunner: async () => undefined,
    workspaceDir: workspace,
    version: 'test',
  });
  const gateway = new AiGateway({
    boardId: router.boardId,
    runLog: createRunLog(handle.db),
    sessions: router.executions,
    snapshots: new RunArtifactSnapshots(path.join(dir, 'snapshots'), new ArtifactRepo(handle.db), router.boardId),
    spawn: (command, cwd, out, control) => {
      const id = starts.at(-1)!;
      const state = router.snapshot();
      const card = state.cards.find((c) => c.id === id)!;
      const column = state.columns.find((c) => c.workflowId === card.workflowId && c.category === 'done')!;
      const config = command.args[command.args.indexOf('--mcp-config') + 1]!;
      return spawnHeadless(
        { command: process.execPath, args: [fixture, config, String(card.number), column.name, mode], format: command.format },
        cwd,
        out,
        undefined,
        control,
      );
    },
  });
  options = {
    repo: () => router.work,
    state: () => router.snapshot(),
    sessions: router.executions,
    ownsBoard: () => true,
    flush: () => handle.flush(),
    workspace: async () => workspace,
    fingerprint: async (folder) =>
      createHash('sha256')
        .update(
          JSON.stringify(
            fs
              .readdirSync(folder)
              .sort()
              .map((f) => [f, fs.readFileSync(path.join(folder, f), 'utf8')]),
          ),
        )
        .digest('hex'),
    terminate: terminateProcessGroup,
    comment: (_work, _outcome, body) => new CommentRepo(handle.db).add(storyId, 'Faz AI', body, 'ai'),
    publish: () => {},
    log: (line) => logs.push(line),
    gitMode: () => 'worktree',
    otherProcesses: () => [],
    coordinationDir: path.join(dir, 'locks'),
    starter: {
      start(id, opts) {
        starts.push(id);
        const execution = gateway.run({
          origin: opts.origin,
          tool: 'claude',
          context: { ...NO_CARD, cardId: id },
          cwd: workspace,
          timeoutMinutes: 1,
          log: (line) => logs.push(line),
          beforeStart: opts.beforeStart,
          prepare: () => ({
            work: { id: opts.workId!, token: opts.token! },
            artifacts: { directory: '', artifacts: [] },
            input: {
              prompt: 'Teste',
              permission: 'board',
              boardServer: { command: process.execPath, args: [path.resolve(__dirname, '../dist/mcp-bridge.js'), workspace] },
            },
            config: { model: null, effort: null, agent: null, profile: null, autonomous: false, clean: true, skills: [], mcp: [] },
          }),
        });
        executions.set(id, execution);
        execution.onExit((end) => {
          executions.delete(id);
          opts.onExit?.(end);
        });
      },
      stop(id) {
        executions.get(id)?.stop();
      },
    },
  };
  orchestrator = new Orchestrator(options);
  await orchestrator.reconcileOnOpen();
});
afterEach(async () => {
  for (const execution of executions.values()) execution.stop();
  await vi.waitFor(() => expect(executions.size).toBe(0));
  await orchestrator.settled();
  stopMcp?.();
  await handle.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
function subtask(title: string) {
  const state = router.snapshot();
  const child = state.workflows.find((w) => w.kind === 'child')!;
  const type = state.cardTypes.find((t) => t.defaultWorkflowId === child.id)!;
  const column = state.columns.find((c) => c.workflowId === child.id && c.category === 'open')!;
  const id = router.createCard({ typeId: type.id, columnId: column.id, parentId: storyId, title });
  const phase = state.fieldDefs.find((f) => f.name === 'Fase');
  if (phase)
    router.handle(
      { type: 'field.setValue', cardId: id, fieldId: phase.id, value: state.columns.find((c) => c.id === codeColumn)!.name },
      { author: 'Fixture', source: 'ai' },
    );
  return id;
}
async function completed(count: number) {
  await vi.waitFor(() => expect(router.work.records().filter((w) => w.state === 'done')).toHaveLength(count), {
    timeout: 10_000,
    interval: 50,
  });
  await orchestrator.settled();
}
describe('orquestrador com processo, ponte, disco e trava reais', () => {
  it('dois gatilhos disputam uma posse; três filhas escrevem em sequência e o fechamento roda uma vez', async () => {
    const a = subtask('A');
    const b = subtask('B');
    const c = subtask('C');
    router.handle({ type: 'link.add', fromId: a, toId: c, kind: 'precedes' });
    const results = await Promise.all([orchestrator.drive(storyId, 'manual'), orchestrator.drive(storyId, 'heartbeat')]);
    expect(results.map((r) => r.kind)).toEqual(['started', 'wait']);
    await completed(4);
    expect(starts).toEqual([a, b, c, storyId]);
    expect(router.snapshot().cards.find((c) => c.id === storyId)?.columnId).toBe(doneColumn);
    expect(router.work.records().filter((w) => w.kind === 'closing')).toHaveLength(1);
    expect(router.work.live()).toEqual([]);
    expect(router.work.reservations()).toEqual([]);
    expect(router.snapshot().comments.filter((c) => c.author === 'Faz AI')).toHaveLength(4);
    expect((await orchestrator.drive(storyId, 'manual')).kind).toBe('idle');
    expect(starts).toHaveLength(4);
    const reopened = await openFile(path.join(dir, 'board.db'), wasm);
    expect(reopened.db.exec('SELECT state FROM ai_work')[0]!.values.flat()).toEqual(['done', 'done', 'done', 'done']);
    await reopened.close();
  }, 15_000);
  it('arquivo alterado e queda sem JSON exigem decisão; a filha não é repetida nem fechada pelo código de saída', async () => {
    const id = subtask('Parcial');
    mode = 'partial';
    await orchestrator.drive(storyId, 'manual');
    await vi.waitFor(() => expect(router.work.records()[0]?.state).toBe('failed'), { timeout: 5000 });
    await orchestrator.settled();
    expect(starts).toEqual([id]);
    expect(fs.readFileSync(path.join(workspace, 'work.txt'), 'utf8')).toMatch(/\d/);
    expect((await orchestrator.drive(storyId, 'heartbeat')).kind).toBe('paused');
    expect(router.work.latest(router.work.records()[0]!.id)?.outcome).toBe('needs-decision');
    expect(router.work.reservations()).toEqual([]);
  });
  it('falha do flush impede a CLI e uma tentativa de outra janela não passa pela barreira de dono', async () => {
    subtask('Sem spawn');
    const realFlush = options.flush;
    let first = true;
    options.flush = async () => {
      if (first) {
        first = false;
        throw new Error('disco cheio');
      }
      await realFlush();
    };
    await expect(orchestrator.drive(storyId, 'manual')).rejects.toThrow('disco cheio');
    expect(starts).toEqual([]);
    expect(router.work.records()[0]?.state).toBe('failed');
    expect(orchestrator.liveTokens().size).toBe(0);
    options.ownsBoard = () => false;
    await expect(orchestrator.drive(storyId, 'manual')).rejects.toThrow('Outro lugar atende');
  });
  it('cancelar durante o flush revoga antes de matar e impede a liberação atrasada do comando', async () => {
    subtask('Cancelar antes');
    let confirm!: () => void;
    const pending = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    const realFlush = options.flush;
    let waiting = false;
    options.flush = async () => {
      await realFlush();
      if (!waiting && router.work.records().some((w) => w.state === 'started')) {
        waiting = true;
        await pending;
      }
    };
    await orchestrator.drive(storyId, 'manual');
    await vi.waitFor(() => expect(waiting).toBe(true));
    const token = [...orchestrator.liveTokens()][0]!;
    expect(router.work.tokenAlive(token)).toBe(true);
    const cancelled = orchestrator.onCardsCancelled([storyId]);
    expect(() => router.executions.assert(token)).toThrow('encerrada');
    confirm();
    await cancelled;
    await vi.waitFor(() => expect(router.work.records()[0]?.state).toBe('cancelled'), { timeout: 5000 });
    await orchestrator.settled();
    expect(fs.readdirSync(workspace)).toEqual([]);
    expect(router.work.reservations()).toEqual([]);
    expect(router.snapshot().comments).toHaveLength(1);
  });
  it('cancelamento só libera a pasta depois de encerrar o grupo com um descendente que ignora SIGTERM', async () => {
    if (process.platform === 'win32') return; // A árvore Windows exige evidência própria; não declarar validada.
    subtask('Descendente');
    mode = 'hold';
    await orchestrator.drive(storyId, 'manual');
    await vi.waitFor(() => expect(fs.existsSync(path.join(workspace, 'descendant'))).toBe(true), { timeout: 5000 });
    const work = router.work.records()[0]!;
    const identity = router.work.latest(work.id)!.process!;
    const token = [...orchestrator.liveTokens()][0]!;
    const cancelled = orchestrator.onCardsCancelled([storyId]);
    expect(() => router.executions.assert(token)).toThrow('encerrada');
    expect(acquireWorkspace(workspace, 'outro', 1, 'outro', options.coordinationDir)).toBeNull();
    await cancelled;
    await vi.waitFor(() => expect(router.work.records()[0]?.state).toBe('cancelled'), { timeout: 5000 });
    await orchestrator.settled();
    expect(processGroupState(identity)).toBe('dead');
    expect(router.work.reservations()).toEqual([]);
    expect(router.snapshot().comments).toHaveLength(1);
  }, 10_000);
  it('o estado final chega ao disco antes da liberação; falha do flush conserva a trava para a varredura', async () => {
    const id = subtask('Guardar posse');
    const realFlush = options.flush;
    let failed = false;
    options.flush = async () => {
      if (!failed && router.work.records().some((w) => w.state === 'done')) {
        failed = true;
        throw new Error('publicação falhou');
      }
      await realFlush();
    };
    await orchestrator.drive(storyId, 'manual');
    await vi.waitFor(() => expect(failed).toBe(true), { timeout: 5000 });
    await orchestrator.settled();
    expect(starts).toEqual([id]);
    expect(router.work.reservations()).toHaveLength(1);
    expect(acquireWorkspace(workspace, 'outra', 1, 'outro', options.coordinationDir)).toBeNull();
    await orchestrator.sweep();
    await completed(2);
    expect(router.work.reservations()).toEqual([]);
    expect(router.snapshot().comments).toHaveLength(2);
    expect(starts).toEqual([id, storyId]);
  });
  it('reabrir os bytes anteriores ao último flush recupera a reserva cuja trava já foi liberada', async () => {
    subtask('Liberação confirmada');
    const realFlush = options.flush;
    let failed = false;
    options.flush = async () => {
      if (!failed && router.work.records().some((w) => w.state === 'done' && w.workspace === null)) {
        failed = true;
        throw new Error('queda antes de confirmar liberação');
      }
      await realFlush();
    };
    await orchestrator.drive(storyId, 'manual');
    await vi.waitFor(() => expect(failed).toBe(true), { timeout: 5000 });
    await orchestrator.settled();
    const crashFile = path.join(dir, 'crash.db');
    fs.copyFileSync(path.join(dir, 'board.db'), crashFile);
    await handle.close();
    handle = await openFile(crashFile, wasm);
    router = new MessageRouter(handle, {
      workspaceKey: 'test',
      folderName: 'Teste',
      author: 'Pessoa',
      workspaceDir: workspace,
      homeDir: path.join(dir, 'home'),
      attachmentsDir: path.join(dir, 'attachments'),
    });
    expect(router.work.reservations()).toHaveLength(1);
    options.sessions = router.executions;
    options.flush = () => handle.flush();
    orchestrator = new Orchestrator(options);
    await orchestrator.reconcileOnOpen();
    expect(router.work.reservations()).toEqual([]);
    expect(router.snapshot().comments).toHaveLength(1);
    expect(starts).toHaveLength(1);
    const next = acquireWorkspace(workspace, 'seguinte', 1, 'seguinte', options.coordinationDir)!;
    expect(next).not.toBeNull();
    expect(next.release()).toBe(true);
  });
});
