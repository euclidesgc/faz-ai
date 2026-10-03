import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { Heartbeat, heartbeatTargets } from '../src/extension/heartbeat';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { BUG_TYPE } from '../src/shared/priority';
import type { CardStatus } from '../src/shared/status';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const MIN = 60_000;

let router: MessageRouter;
let heartbeat: Heartbeat;
let now: number;
let log: string[];
/** executor simulado: registra o que foi iniciado; `finish` encerra a execução em andamento */
let runner: {
  running: string[];
  started: string[];
  fail: boolean;
  start(id: string): void;
  stop(id: string): void;
  onDidFinish(fn: (id: string) => void): void;
  finish(status?: CardStatus): void;
};

const number = (id: string) => router.snapshot().cards.find((c) => c.id === id)!.number;
const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const setStatus = (n: number, status: CardStatus | null, note?: string) =>
  router.handle({ type: 'card.status.set', cardId: card(n).id, status, note });
const create = (title: string, column: string, parent?: number) => {
  const s = router.snapshot();
  const kind = parent ? 'child' : 'parent';
  const wf = s.workflows.find((w) => w.kind === kind)!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
/** Cria o tipo que fura a fila (Bug) no workflow de histórias e devolve o id dele. */
const createBugType = (): string => {
  const wf = router.snapshot().workflows.find((w) => w.kind === 'parent')!;
  router.handle({ type: 'settings.type.create', name: BUG_TYPE, color: '#e11d48', defaultWorkflowId: wf.id });
  return router.snapshot().cardTypes.find((t) => t.name === BUG_TYPE)!.id;
};
/** Cria uma história com o tipo escolhido (ex.: Bug), na coluna dada. */
const createTyped = (typeId: string, title: string, column: string) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return router.createCard({
    typeId,
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
    attachmentsDir: path.join(os.tmpdir(), 'fazai-hb'),
  });
  now = 1_000_000;
  log = [];
  let listener: (id: string) => void = () => {};
  runner = {
    running: [],
    started: [],
    fail: false,
    start(id) {
      if (this.fail) throw new Error('ferramenta indisponível');
      this.running.push(id);
      this.started.push(id);
      router.handle({ type: 'card.status.set', cardId: id, status: 'running' }, { source: 'ai' });
    },
    stop(id) {
      this.running = this.running.filter((x) => x !== id);
      listener(id);
    },
    onDidFinish(fn) {
      listener = fn;
    },
    finish(status = 'waiting_review') {
      const id = this.running.shift()!;
      router.handle({ type: 'card.status.set', cardId: id, status, note: status === 'blocked' ? 'erro' : undefined }, { source: 'ai' });
      listener(id);
    },
  };
  heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => now, log: (l) => log.push(l) });
  router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat: true, heartbeatMinutes: 60 } } });
});

describe('heartbeat', () => {
  it('escolhe uma execução por história, na ordem da fila', () => {
    create('A', 'PRD'); // #1 pronto
    create('Sub de A', 'A fazer', 1); // #2: tratada junto com #1
    create('B', 'Spec'); // #3
    create('C', 'Backlog'); // #4: a IA não atua
    create('D', 'Plan'); // #5
    setStatus(3, 'approved');
    setStatus(5, 'waiting_review');
    create('Sub de D', 'A fazer', 5); // #6: a história está com a pessoa
    // ordem de execução: de cima para baixo no board, não por categoria (PRD vem antes de Spec)
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([1, 3]);

    // mensagem da pessoa sem resposta traz a história para a fila, mesmo aguardando revisão
    router.handle({ type: 'comment.add', cardId: card(5).id, body: 'Por quê?' });
    router.handle({ type: 'comment.add', cardId: card(2).id, body: 'Detalhe na sub-tarefa' });
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([1, 3, 5]); // PRD, Spec, Plan: de cima para baixo
  });

  it('bug fura a fila: entra na frente mesmo estando mais abaixo no board', () => {
    const bugTypeId = createBugType();
    create('A', 'PRD'); // #1 pronto, perto do topo
    createTyped(bugTypeId, 'Bug', 'Plan'); // #2 pronto, mais abaixo
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([2, 1]);
  });

  it('o bug muda a ordem, mas não o conjunto de histórias pendentes', () => {
    const bugTypeId = createBugType();
    create('A', 'PRD'); // #1 pronto
    create('B', 'Spec'); // #2: vai ser aprovado
    createTyped(bugTypeId, 'Bug', 'Implementação'); // #3: mais abaixo que A e B
    setStatus(2, 'approved');
    const targets = heartbeatTargets(router.snapshot()).map((c) => c.number);
    expect([...targets].sort((a, b) => a - b)).toEqual([1, 2, 3]); // mesmo conjunto de antes
    expect(targets).toEqual([3, 1, 2]); // só a ordem muda: bug primeiro, depois de cima para baixo
  });

  it('bug "Pronto" vem antes de um card "Aprovado" que está mais abaixo no board', () => {
    const bugTypeId = createBugType();
    createTyped(bugTypeId, 'Bug', 'PRD'); // #1: pronto, perto do topo
    create('Aprovada', 'Homologação'); // #2: aprovado, mas bem mais abaixo
    setStatus(2, 'approved');
    // antes, a categoria "approved" venceria mesmo mais abaixo; agora a posição no board decide
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([1, 2]);
  });

  it('só roda quando o intervalo passa, e nunca sem pendência', () => {
    heartbeat.tick();
    now += 59 * MIN;
    heartbeat.tick();
    expect(log).toEqual([]);
    now += MIN;
    heartbeat.tick();
    expect(log).toEqual(['Heartbeat: nada pendente com a IA.']);
    expect(runner.started).toEqual([]);

    create('A', 'PRD');
    heartbeat.tick(); // o intervalo recomeçou na rodada anterior
    expect(runner.started).toEqual([]);
    now += 60 * MIN;
    heartbeat.tick();
    expect(runner.started.map(number)).toEqual([1]);
    expect(heartbeat.nextRoundAt).toBe(now + 60 * MIN);
  });

  it('executa uma história por vez e não sobrepõe rodadas', () => {
    create('A', 'PRD');
    create('B', 'Spec');
    create('C', 'Plan');
    expect(heartbeat.runNow()).toBe(3);
    expect(runner.started.map(number)).toEqual([1]);
    expect(heartbeat.queued).toBe(2);

    now += 120 * MIN;
    heartbeat.tick(); // rodada em andamento: não começa outra
    expect(runner.started).toHaveLength(1);

    setStatus(2, 'blocked', 'a pessoa travou este'); // mudou enquanto esperava na fila: é pulado
    runner.finish();
    expect(runner.started.map(number)).toEqual([1, 3]);
    runner.finish();
    expect(heartbeat.busy).toBe(false);

    heartbeat.tick(); // intervalo já passou: nova rodada, mas tudo está com a pessoa
    expect(runner.started).toHaveLength(2);
    expect(log.at(-1)).toBe('Heartbeat: nada pendente com a IA.');
  });

  it('desligado não roda sozinho; parar esvazia a fila; falha ao iniciar encerra a rodada', () => {
    create('A', 'PRD');
    create('B', 'Spec');
    router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat: false } } });
    now += 600 * MIN;
    heartbeat.tick();
    expect(runner.started).toEqual([]);
    expect(heartbeat.nextRoundAt).toBeNull();

    expect(heartbeat.runNow()).toBe(2); // "rodar agora" vale mesmo desligado
    heartbeat.stop();
    expect(heartbeat.busy).toBe(false);
    expect(runner.started).toHaveLength(1);

    setStatus(1, 'ready');
    runner.fail = true;
    heartbeat.runNow();
    expect(log.at(-1)).toBe('Heartbeat: ferramenta indisponível');
    expect(heartbeat.busy).toBe(false);
  });
});
