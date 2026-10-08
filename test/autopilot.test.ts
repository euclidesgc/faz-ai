import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { Autopilot, MAX_RUNS_WITHOUT_PROGRESS, autopilotStep } from '../src/extension/autopilot';
import { openInMemory } from '../src/extension/db/database';
import { heartbeatTargets } from '../src/extension/heartbeat';
import type { AiRunOrigin } from '../src/shared/log';
import type { AiRunMode } from '../src/shared/runner';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { gatewayFor } from './helpers/gateway';
import type { CardStatus } from '../src/shared/status';
import type { Database } from 'sql.js';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
let db: Database;
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
  /** a origem que o autopiloto informou em cada start, na mesma ordem de `started` */
  origins: (AiRunOrigin | undefined)[];
  failToStart: string | null;
  start(id: string, origin?: AiRunOrigin): void;
  stop(id: string): void;
  onDidFinish(fn: (id: string, mode?: AiRunMode) => void): void;
  finish(act?: () => void, mode?: AiRunMode): void;
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
/**
 * Marca a história como entregue: na última coluna da IA, com pull request e aguardando revisão. Usa
 * `card.status.set` direto (sem `source: 'ai'`) para não cair no auto-aprovar do modo autônomo, que
 * trocaria `waiting_review` por `approved`.
 */
const deliver = (n: number) => {
  router.handle({ type: 'card.status.set', cardId: card(n).id, status: 'waiting_review' });
  ai({ type: 'card.pr.set', cardId: card(n).id, url: `https://github.com/org/repo/pull/${n}` });
};
/** Cria uma história com um tipo escolhido pelo nome (ex.: Bug), na coluna dada. */
const createTyped = (typeName: string, title: string, column: string) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.name === typeName && t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: null,
    title,
  });
};
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
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-ap'),
  });
  log = [];
  owns = true;
  deferred = [];
  let listener: (id: string, mode?: AiRunMode) => void = () => {};
  runner = {
    running: [],
    started: [],
    origins: [],
    failToStart: null,
    start(id, origin) {
      if (this.failToStart) throw new Error(this.failToStart);
      this.running.push(id);
      this.started.push(id);
      this.origins.push(origin);
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
    finish(act = () => {}, mode) {
      const id = this.running.shift()!;
      act();
      // a execução termina com o card ainda "Em execução" se a IA não mexeu no status
      listener(id, mode);
      flush(); // o que o board avisou durante a execução, já depois do aviso de que ela terminou
    },
  };
  autopilot = new Autopilot(router, runner, { log: (l) => log.push(l), canRun: () => owns, defer: (fn) => deferred.push(fn) });
});

describe('autopilotStep', () => {
  beforeEach(() => {
    owns = false; // só olha o passo; quem decide não age
  });

  it('trata uma história de cada vez, a mais à direita do board primeiro: a adiantada termina antes de a nova começar', () => {
    create('A', 'Backlog'); // #1, no topo da primeira coluna
    create('B', 'PRD'); // #2, mais adiante
    yolo(1);
    yolo(2);
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'run', story: { number: 2 } });
    move(2, 'Concluído');
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'advance', story: { number: 1 }, column: { name: 'Discovery' } });
  });

  it('história que depende de outro card em aberto não roda: a fila para dizendo de quem ela depende', () => {
    create('Base', 'PRD'); // #1, fora do modo autônomo
    create('Y', 'PRD'); // #2
    ai({ type: 'link.add', fromId: card(1).id, toId: card(2).id, kind: 'precedes' });
    yolo(2);
    const step = autopilotStep(router.snapshot());
    expect(step).toMatchObject({ kind: 'paused', story: { number: 2 } });
    expect(step.kind === 'paused' && step.reason).toContain('#1');
  });

  it('história que espera outra da própria fila não a segura: a vez passa para a dependência, logo abaixo no board', () => {
    create('Y', 'PRD'); // #1, depende da #2 e está no topo da própria coluna
    create('Base', 'PRD'); // #2, logo abaixo
    ai({ type: 'link.add', fromId: card(2).id, toId: card(1).id, kind: 'precedes' });
    owns = false;
    yolo(1);
    yolo(2);
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'run', story: { number: 2 } });
    owns = true;
    autopilot.resume();
    expect(runner.started).toEqual([card(2).id]);
    // a dependência concluiu: a história que esperava ganha a vez
    runner.finish(() => move(2, 'Concluído'));
    flush();
    expect(runner.started).toEqual([card(2).id, card(1).id]);
  });

  it('com todas as histórias esperando dependência, a fila para com o motivo da primeira', () => {
    create('Base', 'PRD'); // #1, fora do modo autônomo
    create('Y', 'PRD'); // #2
    create('Z', 'PRD'); // #3
    ai({ type: 'link.add', fromId: card(1).id, toId: card(2).id, kind: 'precedes' });
    ai({ type: 'link.add', fromId: card(1).id, toId: card(3).id, kind: 'precedes' });
    yolo(2);
    yolo(3);
    const step = autopilotStep(router.snapshot());
    expect(step).toMatchObject({ kind: 'paused', story: { number: 2 } });
    expect(step.kind === 'paused' && step.reason).toContain('#1');
  });

  it('mover a história de baixo para o topo da coluna dá a vez a ela, mesmo com número maior', () => {
    create('A', 'PRD'); // #1, linha de cima
    create('B', 'PRD'); // #2, logo abaixo
    yolo(1);
    yolo(2);
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'run', story: { number: 1 } });

    move(2, 'PRD'); // a B vai para o topo da mesma coluna
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'run', story: { number: 2 } });
  });

  it('o bug fura a fila, mesmo estando mais abaixo no board', () => {
    create('A', 'PRD'); // #1, perto do topo
    createTyped('Bug', 'Bug', 'Implementação'); // #2, bem mais abaixo
    yolo(1);
    yolo(2);
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'run', story: { number: 2 } });
  });

  it('história que a IA ainda não pode tocar é avançada; sem nada em modo autônomo, não há o que fazer', () => {
    create('A', 'Backlog');
    expect(autopilotStep(router.snapshot()).kind).toBe('idle');
    yolo(1);
    expect(autopilotStep(router.snapshot()).kind).toBe('advance');
  });

  it('o card bloqueado segura a fila, e a sub-tarefa vai junto da história', () => {
    create('A', 'Implementação'); // #1, a mais à direita: a vez é dela
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

  it('a história entregue deixa a fila andar: a vez passa para a próxima, aberta no Backlog', () => {
    create('A', 'Homologação'); // #1
    create('B', 'Backlog'); // #2
    yolo(1);
    yolo(2);
    deliver(1);
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'advance', story: { number: 2 } });
  });

  it('história bloqueada segura a fila mesmo com pull request registrado na última coluna da IA', () => {
    createTyped('Bug', 'A', 'Homologação'); // #1, bug: garante a vez dela na fila, qualquer que seja a coluna
    create('B', 'Backlog'); // #2
    yolo(1);
    yolo(2);
    deliver(1); // bloqueio é exceção: entrega não vale enquanto houver impedimento
    status(1, 'blocked', 'Sem acesso ao repositório');
    expect(autopilotStep(router.snapshot())).toMatchObject({
      kind: 'paused',
      story: { number: 1 },
      reason: expect.stringContaining('Sem acesso'),
    });
  });

  it('história aguardando resposta segura a fila', () => {
    createTyped('Bug', 'A', 'PRD'); // #1, bug: garante a vez dela na fila
    create('B', 'Backlog'); // #2
    yolo(1);
    yolo(2);
    status(1, 'waiting_answer');
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'paused', story: { number: 1 } });
  });

  it('história aguardando revisão numa coluna antes da última da IA segura a fila: ainda não chegou à entrega', () => {
    createTyped('Bug', 'A', 'Implementação'); // #1, bug: garante a vez dela na fila
    create('B', 'Backlog'); // #2
    yolo(1);
    yolo(2);
    // card.status.set direto, sem source 'ai': o autoaprovar do modo autônomo só vale para a IA
    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review' });
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'paused', story: { number: 1 } });
  });

  it('história na última coluna da IA aguardando revisão sem pull request segura a fila: falta a entrega', () => {
    createTyped('Bug', 'A', 'Homologação'); // #1, bug: garante a vez dela na fila
    create('B', 'Backlog'); // #2
    yolo(1);
    yolo(2);
    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review' });
    expect(autopilotStep(router.snapshot())).toMatchObject({ kind: 'paused', story: { number: 1 } });
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
    // a execução é registrada no log com a origem do autopiloto, não como chamada manual
    expect(runner.origins).toEqual(['autopilot']);
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
    // a A avançou e agora é a mais à direita: continua com ela até concluir, a B espera
    expect(runner.started).toEqual([card(1).id, card(1).id]);

    runner.finish(() => move(1, 'Concluído'));
    expect(runner.started).toEqual([card(1).id, card(1).id, card(2).id]); // só então a B entra
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

  it('refinar não conta como execução sem progresso para o disjuntor', () => {
    create('A', 'PRD');
    yolo(1);
    for (let i = 0; i < MAX_RUNS_WITHOUT_PROGRESS + 1; i++) runner.finish(() => status(1, 'ready'), 'refine');
    expect(card(1).status).not.toBe('blocked');
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

  it('liga sozinho ao abrir o editor com história em modo autônomo pendente', () => {
    owns = false;
    create('A', 'PRD');
    yolo(1);
    expect(runner.started).toEqual([]);
    // o editor abre (a janela passa a ser a dona) com a história já em modo autônomo: a fila segue sem clique
    owns = true;
    router.handle({ type: 'card.update', cardId: card(1).id, patch: { title: 'A!' } });
    flush();
    expect(autopilot.isActive).toBe(true);
    expect(runner.started).toEqual([card(1).id]);
    expect(log).toContain('Autopiloto: histórias em modo autônomo pendentes; retomando.');
  });

  it('ao abrir o editor, a construção já retoma a fila pendente, sem esperar uma mudança no board', () => {
    // a história entrou em modo autônomo numa janela que não é a dona: nada começou
    owns = false;
    create('A', 'PRD');
    yolo(1);
    flush();
    expect(runner.started).toEqual([]);
    // o editor reabre como dono: um autopiloto novo sobre o mesmo board, com a história pendente
    owns = true;
    const fresh = new Autopilot(router, runner, { log: (l) => log.push(l), canRun: () => owns, defer: (fn) => deferred.push(fn) });
    expect(fresh.isActive).toBe(false);
    flush();
    expect(fresh.isActive).toBe(true);
    expect(runner.started).toEqual([card(1).id]);
  });

  it('a pausa da pessoa segura a fila: uma mudança no board não religa, só retomar', () => {
    create('A', 'PRD');
    yolo(1);
    autopilot.pause();
    router.handle({ type: 'card.update', cardId: card(1).id, patch: { title: 'A!' } });
    flush();
    expect(autopilot.isActive).toBe(false);
    expect(runner.started).toEqual([card(1).id]);
    autopilot.resume();
    expect(runner.started).toEqual([card(1).id, card(1).id]);
  });

  it('fila só de histórias entregues não religa o autopiloto ao abrir o editor', () => {
    create('A', 'Homologação');
    yolo(1);
    runner.finish(() => deliver(1));
    flush();
    expect(autopilot.isActive).toBe(false);
    router.handle({ type: 'card.update', cardId: card(1).id, patch: { title: 'A!' } });
    flush();
    expect(autopilot.isActive).toBe(false);
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

  it('história entregue: a IA não a retoma, não a move, e o disjuntor de falta de progresso não a alcança', () => {
    create('A', 'Homologação'); // #1
    status(1, 'blocked', 'Preparando'); // estado neutro: ligar o modo autônomo não dispara nada nela ainda
    yolo(1);
    deliver(1); // só depois de ligado: registra o pull request e libera para waiting_review
    create('B', 'PRD'); // #2
    yolo(2);
    flush();
    expect(runner.started).not.toContain(card(1).id);
    expect(columnName(1)).toBe('Homologação');
    expect(card(1).status).toBe('waiting_review');

    for (let i = 0; i < MAX_RUNS_WITHOUT_PROGRESS; i++) runner.finish(() => status(2, 'ready')); // B sem progresso
    expect(card(2).status).toBe('blocked'); // o disjuntor agiu sobre B, a história da vez
    expect(card(1).status).toBe('waiting_review'); // A nunca foi tocada
    expect(runner.started).not.toContain(card(1).id);
  });

  it('todas as histórias entregues: o autopiloto fica inativo e o log registra o fim da fila', () => {
    create('A', 'Homologação'); // #1
    status(1, 'blocked', 'Preparando');
    yolo(1);
    deliver(1);
    flush();
    expect(autopilotStep(router.snapshot()).kind).toBe('idle');
    expect(autopilot.isActive).toBe(false);
    expect(log.at(-1)).toContain('nenhuma história em modo autônomo pendente');
  });

  it('a linha de log de história entregue é registrada uma vez, não a cada mudança do board', () => {
    create('A', 'Homologação'); // #1
    status(1, 'blocked', 'Preparando');
    yolo(1);
    deliver(1);
    flush();
    ai({ type: 'comment.add', cardId: card(1).id, body: 'Mais uma mudança qualquer no board.' });
    flush();
    const deliveredLines = log.filter((l) => l.includes('entregue'));
    expect(deliveredLines).toHaveLength(1);
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
      gateway: gatewayFor(router, db, () => ({
        onExit: (fn) => exits.push((code) => fn(code)),
        kill: () => {},
      })),
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
