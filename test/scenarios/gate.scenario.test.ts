// O portão das checagens da coluna, de ponta a ponta: o router de verdade (banco em memória), o repositório
// `gate_runs` de verdade, o executor de verdade rodando um `node -e` numa pasta git de verdade. Só o runner da IA é
// falso (nenhuma sessão em curso). A IA tenta mover o card da Implementação para a Revisão: a primeira tentativa
// falha (Verificando → Pronto + saída na conversa), a segunda passa (card no destino + "Checagens passaram em `<sha>`")
// e arrastar à mão não passa pelo portão (nenhuma linha em `gate_runs`).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../../src/extension/db/database';
import { GateExecutor } from '../../src/extension/gate';
import { MessageRouter } from '../../src/extension/panel/messageRouter';
import { GateRepo } from '../../src/extension/repositories/gateRepo';
import { shellQuote } from '../../src/shared/gate';
import type { WebviewToHost } from '../../src/shared/messages';

const WASM_DIR = path.resolve(__dirname, '../../node_modules/sql.js/dist');
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' }).trim();

interface World {
  root: string;
  project: string;
  router: MessageRouter;
  repo: GateRepo;
  executor: GateExecutor;
  /** os portões abertos pelo gatilho, na ordem */
  opened: string[];
  card: () => ReturnType<MessageRouter['snapshot']>['cards'][number];
  column: (name: string) => ReturnType<MessageRouter['snapshot']>['columns'][number];
  columnName: () => string;
  comments: () => string[];
  ai: (msg: WebviewToHost) => unknown;
  human: (msg: WebviewToHost) => unknown;
}

async function gateWorld(command: (marker: string) => string): Promise<World> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-cenario-portao-')));
  const project = path.join(root, 'projeto');
  fs.mkdirSync(project);
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'config', 'user.email', 't@t');
  git(project, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(project, 'base.txt'), 'x');
  git(project, 'add', '.');
  git(project, 'commit', '-qm', 'base');
  git(project, 'checkout', '-qb', 'feature/h1');
  fs.writeFileSync(path.join(project, 'mudanca.txt'), 'x');
  git(project, 'add', '.');
  git(project, 'commit', '-qm', 'mudança');

  const db = await openInMemory(WASM_DIR);
  const router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(root, 'anexos'),
    workspaceDir: project,
  });
  const repo = new GateRepo(db);
  const snap = () => router.snapshot();
  const column = (name: string) => {
    const s = snap();
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    return s.columns.find((c) => c.workflowId === wf.id && c.name === name)!;
  };
  const ai = (msg: WebviewToHost) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
  const human = (msg: WebviewToHost) => router.handle(msg);

  const marker = path.join(root, 'tentativa');
  human({
    type: 'settings.column.update',
    columnId: column('Implementação').id,
    patch: { checks: [{ name: 'Testes', command: command(marker), timeoutSec: 30 }] },
  });
  const s = snap();
  const story = s.workflows.find((w) => w.kind === 'parent')!;
  const cardId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === story.id)!.id,
    columnId: column('Implementação').id,
    parentId: null,
    title: 'Card do cenário',
  });

  const executor = new GateExecutor({
    repo,
    router,
    runner: { isRunning: () => false, onDidFinish: () => () => {} },
    state: () => router.snapshot(),
    ownsBoard: () => true,
    workspaceOf: () => project,
    instance: 'cenario',
    log: () => {},
    git: (args, cwd) =>
      new Promise((resolve, reject) => execFile('git', args, { cwd }, (e, out) => (e ? reject(e) : resolve(String(out))))),
    shellPath: async () => undefined,
    coordinationDir: path.join(root, 'locks'),
    acquireTries: 2,
    acquireDelayMs: 10,
  });
  const opened: string[] = [];
  router.onGate((id) => opened.push(id));

  const card = () => snap().cards.find((c) => c.id === cardId)!;
  return {
    root,
    project,
    router,
    repo,
    executor,
    opened,
    card,
    column,
    columnName: () => snap().columns.find((c) => c.id === card().columnId)!.name,
    comments: () =>
      snap()
        .comments.filter((c) => c.cardId === cardId)
        .map((c) => c.body),
    ai,
    human,
  };
}

/** `node -e` que falha na primeira tentativa (cria o marcador e imprime o motivo) e passa na segunda. */
const flaky = (marker: string) =>
  `${shellQuote(process.execPath)} -e ${shellQuote(
    `const fs=require('fs');const m=${JSON.stringify(marker)};if(fs.existsSync(m)){process.exit(0)}fs.writeFileSync(m,'1');console.error('esperado 2, recebeu 3');process.exit(1)`,
  )}`;

let w: World;
afterEach(() => {
  w.executor.dispose();
  fs.rmSync(w.root, { recursive: true, force: true });
});

describe('cenário: o portão das checagens da coluna', () => {
  beforeEach(async () => {
    w = await gateWorld(flaky);
    w.ai({ type: 'card.status.set', cardId: w.card().id, status: 'running' });
  });

  const tryMove = () => w.ai({ type: 'card.move', cardId: w.card().id, columnId: w.column('Revisão').id, position: 0 });

  it('a checagem falha na primeira tentativa e passa na segunda, com o sha na conversa', async () => {
    tryMove();
    expect(w.card().status).toBe('verifying');
    expect(w.columnName()).toBe('Implementação');
    expect(w.opened).toHaveLength(1);

    await w.executor.run(w.opened[0]!);
    expect(w.card().status).toBe('ready');
    expect(w.columnName()).toBe('Implementação');
    // depois da falha vem o aviso da subida de modelo (#1108): a saída da checagem está num comentário anterior
    expect(w.comments().some((c) => c.includes('esperado 2, recebeu 3'))).toBe(true);
    const [first] = w.repo.listFor(w.card().id);
    expect(first).toMatchObject({ kind: 'move', result: 'failed' });
    expect(first!.outputTail).toContain('esperado 2, recebeu 3');

    tryMove();
    expect(w.card().status).toBe('verifying');
    expect(w.opened).toHaveLength(2);
    await w.executor.run(w.opened[1]!);

    const sha = git(w.project, 'rev-parse', 'HEAD');
    expect(w.columnName()).toBe('Revisão');
    expect(w.comments()).toContain(`Checagens passaram em \`${sha}\`.`);
    const runs = w.repo.listFor(w.card().id);
    expect(runs.map((r) => r.result)).toEqual(['failed', 'passed']);
    expect(runs[1]!.sha).toBe(sha);
  });

  it('arrastar à mão não passa pelo portão: o card move e nenhuma linha de gate_runs nasce', () => {
    w.human({ type: 'card.move', cardId: w.card().id, columnId: w.column('Revisão').id, position: 0 });
    expect(w.columnName()).toBe('Revisão');
    expect(w.repo.listFor(w.card().id)).toHaveLength(0);
    expect(w.opened).toEqual([]);
  });
});
