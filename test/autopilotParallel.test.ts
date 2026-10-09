import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Autopilot } from '../src/extension/autopilot';
import { openInMemory } from '../src/extension/db/database';
import { Heartbeat } from '../src/extension/heartbeat';
import { MessageRouter } from '../src/extension/panel/messageRouter';

// O autopiloto e o heartbeat dividindo o mesmo executor e o mesmo limite de execuções.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let heartbeat: Heartbeat;
let autopilot: Autopilot;
let deferred: (() => void)[];
const flush = () => {
  while (deferred.length) deferred.shift()!();
};
/** executor simulado com vários ouvintes, como o de verdade; `finish(id)` encerra aquela execução */
let runner: {
  running: string[];
  started: string[];
  listeners: ((id: string) => void)[];
  start(id: string): void;
  stop(id: string): void;
  onDidFinish(fn: (id: string) => void): void;
  finish(id: string): void;
};

const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const number = (id: string) => router.snapshot().cards.find((c) => c.id === id)!.number;
const create = (title: string, column: string) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: null,
    title,
  });
};

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-ap-par'),
  });
  deferred = [];
  runner = {
    running: [],
    started: [],
    listeners: [],
    start(id) {
      this.running.push(id);
      this.started.push(id);
      router.handle({ type: 'card.status.set', cardId: id, status: 'running' }, { source: 'ai' });
    },
    stop(id) {
      this.running = this.running.filter((x) => x !== id);
      this.listeners.forEach((fn) => fn(id));
    },
    onDidFinish(fn) {
      this.listeners.push(fn);
    },
    finish(id) {
      this.running = this.running.filter((x) => x !== id);
      // a IA terminou a fase e pediu revisão (fora do modo autônomo) ou registrou algo (no modo autônomo)
      router.handle({ type: 'card.status.set', cardId: id, status: 'ready' }, { source: 'ai' });
      router.handle({ type: 'comment.add', cardId: id, body: 'feito' }, { author: 'Claude Code', source: 'ai' });
      this.listeners.forEach((fn) => fn(id));
      flush();
    },
  };
  // o heartbeat é ouvinte antes do autopiloto: sem a reserva, ele pegaria a vaga primeiro
  heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => 0, log: () => {} });
  autopilot = new Autopilot(router, runner, { log: () => {}, defer: (fn) => deferred.push(fn) });
});

describe('autopiloto e heartbeat no mesmo limite', () => {
  it('o autopiloto começa numa vaga livre mesmo com execução do heartbeat em andamento', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallel: true }, git: { mode: 'worktree' } } });
    create('A', 'PRD'); // #1: do heartbeat
    heartbeat.runNow();
    expect(runner.started.map(number)).toEqual([1]);
    create('Y', 'PRD'); // #2: modo autônomo
    router.handle({ type: 'card.yolo.set', cardId: card(2).id, enabled: true });
    flush();
    expect(autopilot.isActive).toBe(true);
    expect(runner.started.map(number)).toEqual([1, 2]);
  });

  it('com o limite cheio, a vaga que abre vai para o autopiloto, e as duas filas se intercalam', () => {
    create('A', 'Implementação'); // #1
    create('B', 'Implementação'); // #2
    create('Y', 'Implementação'); // #3: modo autônomo
    heartbeat.runNow(); // limite 1: só #1 roda, #2 fica na fila
    router.handle({ type: 'card.yolo.set', cardId: card(3).id, enabled: true });
    flush();
    expect(runner.started.map(number)).toEqual([1]); // sem vaga: o autopiloto espera
    runner.finish(card(1).id);
    expect(runner.started.map(number)).toEqual([1, 3]); // a vaga é do autopiloto, não da fila do heartbeat
    runner.finish(card(3).id);
    expect(runner.started.map(number)).toEqual([1, 3, 2]); // agora é a vez do heartbeat
    expect(runner.running).toHaveLength(1);
  });

  it('a intercalação não depende de quem ouve o fim da execução primeiro', () => {
    // o autopiloto ouvindo antes do heartbeat
    runner.listeners = [];
    autopilot = new Autopilot(router, runner, { log: () => {}, defer: (fn) => deferred.push(fn) });
    heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => 0, log: () => {} });
    create('A', 'Implementação'); // #1
    create('B', 'Implementação'); // #2
    create('Y', 'Implementação'); // #3: modo autônomo
    heartbeat.runNow();
    router.handle({ type: 'card.yolo.set', cardId: card(3).id, enabled: true });
    flush();
    runner.finish(card(1).id);
    expect(runner.started.map(number)).toEqual([1, 3]);
    runner.finish(card(3).id); // o autopiloto ainda quer rodar, mas a vez é do heartbeat
    expect(runner.started.map(number)).toEqual([1, 3, 2]);
    expect(runner.running).toHaveLength(1);
  });

  it('a reserva para o autopiloto é no tipo que ele quer: a vaga de texto fica guardada e a de branch segue livre', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallelStories: 2 }, git: { mode: 'branch' } } });
    create('A', 'PRD'); // #1
    create('B', 'PRD'); // #2
    create('C', 'PRD'); // #3
    create('Y', 'PRD'); // #4: modo autônomo
    create('D', 'Implementação'); // #5
    create('E', 'Implementação'); // #6
    heartbeat.runNow(); // fila: D, E (código, teto 1) e A, B, C (texto, teto 2)
    expect(runner.started.map(number)).toEqual([5, 1, 2]);
    router.handle({ type: 'card.yolo.set', cardId: card(4).id, enabled: true });
    flush();
    expect(runner.started.map(number)).toEqual([5, 1, 2]); // teto de texto cheio: o autopiloto espera
    runner.finish(card(5).id); // abre uma vaga com branch: a reserva é de texto, então E começa
    expect(runner.started.map(number)).toEqual([5, 1, 2, 6]);
    runner.finish(card(1).id); // abre uma vaga de texto: é do autopiloto, não de C
    expect(runner.started.map(number)).toEqual([5, 1, 2, 6, 4]);
    runner.finish(card(4).id); // agora é a vez de C
    expect(runner.started.map(number)).toEqual([5, 1, 2, 6, 4, 3]);
    expect(runner.running.map(number).sort((a, b) => a - b)).toEqual([2, 3, 6]);
  });
});
