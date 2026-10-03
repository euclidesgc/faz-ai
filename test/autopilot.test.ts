import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Autopilot, MAX_RUNS_WITHOUT_PROGRESS, autopilotStep } from '../src/extension/autopilot';
import { openInMemory } from '../src/extension/db/database';
import { heartbeatTargets } from '../src/extension/heartbeat';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { CardStatus } from '../src/shared/status';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let autopilot: Autopilot;
let log: string[];
let owns: boolean;
/** o que o autopiloto adiou para depois do passo atual; `flush` executa */
let deferred: (() => void)[];
const flush = () => {
  while (deferred.length) deferred.shift()!();
};
/** executor simulado: `finish` encerra a execução em andamento, aplicando o que a IA faria nela */
let runner: {
  running: string[];
  started: string[];
  failToStart: string | null;
  start(id: string): void;
  stop(id: string): void;
  onDidFinish(fn: (id: string) => void): void;
  finish(act?: () => void): void;
};

const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const columnName = (n: number) => router.snapshot().columns.find((c) => c.id === card(n).columnId)!.name;
const ai = (msg: Parameters<MessageRouter['handle']>[0]) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
const move = (n: number, column: string) =>
  ai({
    type: 'card.move',
    cardId: card(n).id,
    columnId: router.snapshot().columns.find((c) => c.name === column && c.workflowId === card(n).workflowId)!.id,
    position: 0,
  });
const status = (n: number, s: CardStatus | null, note?: string) => ai({ type: 'card.status.set', cardId: card(n).id, status: s, note });
const yolo = (n: number, enabled = true) => router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled });
const create = (title: string, column: string, parent?: number) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-ap'),
  });
  log = [];
  owns = true;
  deferred = [];
  let listener: (id: string) => void = () => {};
  runner = {
    running: [],
    started: [],
    failToStart: null,
    start(id) {
      if (this.failToStart) throw new Error(this.failToStart);
      this.running.push(id);
      this.started.push(id);
      router.handle({ type: 'card.status.set', cardId: id, status: 'running' }, { source: 'ai' });
    },
    stop(id) {
      this.running = this.running.filter((x) => x !== id);
      router.handle({ type: 'card.status.set', cardId: id, status: 'ready' }, { source: 'ai' });
      listener(id);
    },
    onDidFinish(fn) {
      listener = fn;
    },
    finish(act = () => {}) {
      const id = this.running.shift()!;
      act();
      // a execução termina com o card ainda "Em execução" se a IA não mexeu no status
      listener(id);
      flush(); // o que o board avisou durante a execução, já depois do aviso de que ela terminou
    },
  };
  autopilot = new Autopilot(router, runner, { log: (l) => log.push(l), canRun: () => owns, defer: (fn) => deferred.push(fn) });
});

describe('autopilotStep', () => {
  beforeEach(() => {
    owns = false; // só olha o passo; quem decide não age
  });

  it('trata uma história de cada vez, na ordem do número', () => {
    create('A', 'Backlog'); // #1
    create('B', 'PRD'); // #2
    yolo(2);
    yolo(1);
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'advance', story: { number: 1 }, column: { name: 'Discovery' } });
  });

  it('história que a IA ainda não pode tocar é avançada; sem nada em modo autônomo, não há o que fazer', () => {
    create('A', 'Backlog');
    expect(autopilotStep(router.snapshot()).kind).toBe('idle');
    yolo(1);
    expect(autopilotStep(router.snapshot()).kind).toBe('advance');
  });

  it('o card bloqueado segura a fila, e a sub-tarefa vai junto da história', () => {
    create('A', 'Implementação'); // #1
    create('B', 'PRD'); // #2
    create('Passo', 'A fazer', 1); // #3
    yolo(1);
    yolo(2);
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'run', story: { number: 1 } });
    status(1, 'blocked', 'Sem acesso ao repositório');
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'paused', reason: expect.stringContaining('Sem acesso') });
  });

  it('a história concluída deixa a fila andar', () => {
    create('A', 'Homologação'); // #1
    create('B', 'PRD'); // #2
    yolo(1);
    yolo(2);
    move(1, 'Concluído');
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'run', story: { number: 2 } });
  });
});

describe('autopiloto', () => {
  it('ao ligar o modo numa história, leva do Backlog até a IA trabalhar, sem esperar nenhum intervalo', () => {
    create('A', 'Backlog');
    yolo(1);
    expect(autopilot.isActive).toBe(true);
    expect(columnName(1)).toBe('Discovery');
    expect(runner.started).toEqual([card(1).id]);
    expect(router.snapshot().autopilot).toEqual({ active: true, note: null });
  });

  it('segue de execução em execução e passa para a próxima história quando a atual conclui', () => {
    create('A', 'Backlog'); // #1
    create('B', 'Backlog'); // #2
    yolo(1);
    yolo(2);
    expect(runner.started).toEqual([card(1).id]);

    runner.finish(() => {
      status(1, 'ready');
      move(1, 'PRD'); // sem aprovação, porque a história é YOLO
    });
    expect(columnName(1)).toBe('PRD');
    expect(runner.started).toEqual([card(1).id, card(1).id]); // a mesma história segue; a B espera

    runner.finish(() => move(1, 'Concluído'));
    expect(runner.started.at(-1)).toBe(card(2).id);
    expect(columnName(2)).toBe('Discovery');
  });

  it('acaba a fila e se desliga; uma nova história em modo autônomo o liga de novo', () => {
    create('A', 'PRD');
    yolo(1);
    runner.finish(() => move(1, 'Concluído'));
    expect(autopilot.isActive).toBe(false);
    expect(log.at(-1)).toContain('nenhuma história em modo autônomo pendente');

    create('B', 'PRD');
    yolo(2);
    expect(autopilot.isActive).toBe(true);
    expect(runner.started.at(-1)).toBe(card(2).id);
  });

  it('para quando a IA bloqueia o card, e volta quando a pessoa o libera', () => {
    create('A', 'PRD');
    yolo(1);
    runner.finish(() => status(1, 'blocked', 'Sem acesso'));
    expect(runner.running).toEqual([]);
    expect(router.snapshot().autopilot).toEqual({ active: true, note: expect.stringContaining('Sem acesso') });

    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'ready' });
    flush();
    expect(runner.running).toEqual([card(1).id]);
    expect(router.snapshot().autopilot.note).toBeNull();
  });

  it(`o disjuntor bloqueia a história depois de ${MAX_RUNS_WITHOUT_PROGRESS} execuções que não avançam nada`, () => {
    create('A', 'PRD');
    yolo(1);
    for (let i = 0; i < MAX_RUNS_WITHOUT_PROGRESS; i++) {
      expect(runner.running).toHaveLength(1);
      runner.finish(() => status(1, 'ready')); // a IA só respondeu: nada mudou
    }
    expect(card(1).status).toBe('blocked');
    expect(card(1).statusReason).toContain('autopiloto parou');
    expect(runner.running).toEqual([]);
    expect(runner.started).toHaveLength(MAX_RUNS_WITHOUT_PROGRESS);
  });

  it('um avanço entre as execuções zera a contagem do disjuntor', () => {
    create('A', 'Discovery');
    yolo(1);
    runner.finish(() => status(1, 'ready'));
    runner.finish(() => status(1, 'ready'));
    runner.finish(() => move(1, 'PRD')); // avançou
    runner.finish(() => status(1, 'ready'));
    runner.finish(() => status(1, 'ready'));
    expect(card(1).status).not.toBe('blocked');
  });

  it('pausar interrompe a execução e não deixa recomeçar sozinho', () => {
    create('A', 'PRD');
    yolo(1);
    expect(runner.running).toHaveLength(1);
    autopilot.pause();
    expect(runner.running).toEqual([]);
    expect(autopilot.isActive).toBe(false);
    expect(runner.started).toHaveLength(1);
    expect(router.snapshot().autopilot.active).toBe(false);

    autopilot.resume();
    expect(runner.started).toHaveLength(2);
  });

  it('não liga sozinho ao abrir o editor com história em modo autônomo; precisa retomar', () => {
    owns = false;
    create('A', 'PRD');
    yolo(1);
    // o editor abre (a janela passa a ser a dona) com a história já em modo autônomo: nada começa
    owns = true;
    router.handle({ type: 'card.update', cardId: card(1).id, patch: { title: 'A!' } });
    flush();
    expect(autopilot.isActive).toBe(false);
    expect(runner.started).toEqual([]);

    autopilot.resume();
    expect(runner.started).toEqual([card(1).id]);
  });

  it('só a janela dona do board roda', () => {
    owns = false;
    create('A', 'PRD');
    yolo(1);
    expect(runner.started).toEqual([]);
    expect(autopilot.isActive).toBe(false);
  });

  it('falha ao iniciar a ferramenta desliga o autopiloto com o motivo', () => {
    runner.failToStart = 'O Claude Code não está instalado.';
    create('A', 'PRD');
    yolo(1);
    expect(autopilot.isActive).toBe(false);
    expect(router.snapshot().autopilot).toEqual({ active: false, note: 'O Claude Code não está instalado.' });
  });

  it('um "Em execução" sem execução de verdade volta para a IA', () => {
    create('A', 'PRD');
    status(1, 'running'); // a sessão caiu sem avisar
    yolo(1);
    expect(runner.started).toEqual([card(1).id]);
  });
});

describe('heartbeat e autopiloto', () => {
  it('o heartbeat deixa as histórias em modo autônomo para o autopiloto', () => {
    create('A', 'PRD'); // #1
    create('B', 'PRD'); // #2
    owns = false; // o autopiloto não age: o card fica pendente com a IA
    yolo(1);
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([2]);
  });
});

describe('autopiloto com o executor de verdade', () => {
  it('a IA que só responde na conversa é chamada de novo até o disjuntor bloquear a história', async () => {
    const { AiRunner } = await import('../src/extension/runner');
    const exits: ((code: number | null) => void)[] = [];
    const real = new AiRunner(router, {
      cwd: os.tmpdir(),
      log: () => {},
      spawn: () => ({
        onExit: (fn) => exits.push((code) => fn(code)),
        kill: () => {},
      }),
    });
    const ap = new Autopilot(router, real, { log: () => {} });
    create('A', 'PRD');
    yolo(1);
    await Promise.resolve();
    expect(ap.isActive).toBe(true);
    for (let i = 0; i < MAX_RUNS_WITHOUT_PROGRESS; i++) {
      expect(exits).toHaveLength(i + 1);
      ai({ type: 'comment.add', cardId: card(1).id, body: 'Entendi, vou pensar.' });
      exits[i]!(0);
      await Promise.resolve();
    }
    expect(card(1).status).toBe('blocked');
    expect(card(1).statusReason).toContain('autopiloto parou');
    expect(exits).toHaveLength(MAX_RUNS_WITHOUT_PROGRESS);
  });
});
