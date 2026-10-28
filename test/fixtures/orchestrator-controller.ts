// Controlador separado para que SIGKILL realmente perca memória e deixe descendentes vivos.
import { validBrief } from './subtaskBrief';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { openFile } from '../../src/extension/db/database';
import { MessageRouter } from '../../src/extension/panel/messageRouter';
import { Orchestrator } from '../../src/extension/orchestrator';
import { AiGateway, NO_CARD, type AiExecution } from '../../src/extension/ai/gateway';
import { RunArtifactSnapshots } from '../../src/extension/runArtifactSnapshot';
import { ArtifactRepo } from '../../src/extension/repositories/artifactRepo';
import { CommentRepo } from '../../src/extension/repositories/commentRepo';
import { createRunLog } from '../../src/extension/log/runLog';
import { spawnHeadless } from '../../src/extension/spawn';
import { startMcpServer } from '../../src/extension/mcp/server';
import { socketPath } from '../../src/extension/mcp/socketPath';
import { terminateProcessGroup } from '../../src/extension/processIdentity';

async function main() {
  const [dir, wasm, cliFixture, bridge, mode] = process.argv.slice(2) as [string, string, string, string, string];
  const workspace = path.join(dir, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const slot: { router?: MessageRouter } = {};
  // A posse do socket precede a abertura do banco e qualquer mutação do controlador.
  const stopMcp = await startMcpServer(socketPath(workspace), {
    getRouter: async () => slot.router,
    getRunner: async () => undefined,
    workspaceDir: workspace,
    version: 'test',
  });
  const handle = await openFile(path.join(dir, 'board.db'), wasm);
  const router = new MessageRouter(handle, {
    workspaceKey: 'test',
    folderName: 'Teste',
    author: 'Pessoa',
    workspaceDir: workspace,
    homeDir: path.join(dir, 'home'),
    attachmentsDir: path.join(dir, 'attachments'),
  });
  slot.router = router;
  const board = router;
  const executions = new Map<string, AiExecution>();
  let currentCard = '';
  const gateway = new AiGateway({
    boardId: board.boardId,
    runLog: createRunLog(handle.db),
    sessions: board.executions,
    snapshots: new RunArtifactSnapshots(path.join(dir, 'snapshots'), new ArtifactRepo(handle.db), board.boardId),
    spawn: (command, cwd, out, control) => {
      const card = board.snapshot().cards.find((c) => c.id === currentCard)!;
      const column = board.snapshot().columns.find((c) => c.workflowId === card.workflowId && c.category === 'done')!;
      return spawnHeadless(
        {
          command: process.execPath,
          args: [cliFixture, command.args[command.args.indexOf('--mcp-config') + 1]!, String(card.number), column.name, 'hold'],
          format: command.format,
        },
        cwd,
        out,
        undefined,
        control,
      );
    },
  });
  const orchestrator = new Orchestrator({
    repo: () => board.work,
    state: () => board.snapshot(),
    sessions: board.executions,
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
    comment: (work, _outcome, body) => new CommentRepo(handle.db).add(work.storyId!, 'Faz AI', body, 'ai'),
    publish: () => {},
    log: () => {},
    gitMode: () => 'worktree',
    otherProcesses: () => [],
    coordinationDir: path.join(dir, 'locks'),
    starter: {
      start(id, opts) {
        currentCard = id;
        const execution = gateway.run({
          origin: opts.origin,
          tool: 'claude',
          context: { ...NO_CARD, cardId: id },
          cwd: workspace,
          timeoutMinutes: 1,
          log: () => {},
          beforeStart: opts.beforeStart,
          prepare: () => ({
            work: { id: opts.workId!, token: opts.token! },
            artifacts: { directory: '', artifacts: [] },
            input: { permission: 'board', prompt: 'Teste', boardServer: { command: process.execPath, args: [bridge, workspace] } },
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
  });
  await orchestrator.reconcileOnOpen();
  if (mode === 'run') {
    const s = board.snapshot();
    const parent = s.workflows.find((w) => w.kind === 'parent')!;
    const column = s.columns.find((c) => c.workflowId === parent.id && c.aiActive && !c.artifactName && c.category === 'open')!;
    const story = board.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === parent.id)!.id,
      columnId: column.id,
      parentId: null,
      title: 'Recuperar',
    });
    const child = s.workflows.find((w) => w.kind === 'child')!;
    const card = board.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === child.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === child.id && c.category === 'open')!.id,
      parentId: story,
      title: 'Órfã',
    });
    board.handle({ type: 'card.update', cardId: card, patch: { description: validBrief() } }, { source: 'ai' });
    const phase = s.fieldDefs.find((f) => f.name === 'Fase');
    if (phase) board.handle({ type: 'field.setValue', cardId: card, fieldId: phase.id, value: column.name }, { source: 'ai' });
    await orchestrator.drive(story, 'manual');
    const until = Date.now() + 5000;
    while (!fs.existsSync(path.join(workspace, 'descendant'))) {
      if (Date.now() > until) throw new Error('A CLI de teste não iniciou.');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await handle.flush();
    process.stdout.write(JSON.stringify({ ready: true, process: board.work.latest(board.work.live()[0]!.id)!.process }) + '\n');
  } else {
    process.stdout.write(
      JSON.stringify({
        ready: true,
        states: board.work.records().map((w) => w.state),
        reservations: board.work.reservations().length,
        comments: board.snapshot().comments.length,
      }) + '\n',
    );
    stopMcp();
    await handle.close();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(String(error));
  process.exit(1);
});
