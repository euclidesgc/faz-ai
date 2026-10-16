import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { Heartbeat, STALE_DAYS, heartbeatQueue, heartbeatTargets, refineTargets, summaryTargets } from '../src/extension/heartbeat';
import type { AiRunMode } from '../src/shared/runner';
import type { AiRunOrigin } from '../src/shared/log';
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
  /** a origem que o heartbeat informou em cada start, na mesma ordem de `started` */
  origins: (AiRunOrigin | undefined)[];
  /** o modo de cada start, na mesma ordem de `started` */
  modes: (AiRunMode | undefined)[];
  fail: boolean;
  usageLimited: boolean;
  start(id: string, origin?: AiRunOrigin, mode?: AiRunMode): void;
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
    origins: [],
    modes: [],
    fail: false,
    usageLimited: false,
    start(id, origin, mode) {
      if (this.fail) throw new Error('ferramenta indisponível');
      this.running.push(id);
      this.started.push(id);
      this.origins.push(origin);
      this.modes.push(mode);
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
  it('cada rodada, automática ou pedida, confere os merges, mesmo sem nada pendente com a IA', () => {
    let rounds = 0;
    heartbeat = new Heartbeat(runner, { snapshot: () => router.snapshot(), now: () => now, log: () => {}, onRound: () => void rounds++ });
    heartbeat.tick();
    expect(rounds).toBe(0); // o intervalo ainda não passou
    now += 60 * 60_000;
    heartbeat.tick();
    expect(rounds).toBe(1);
    heartbeat.runNow();
    expect(rounds).toBe(2);
    // com o heartbeat desligado, só a rodada pedida confere
    router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat: false } } });
    now += 60 * 60_000;
    heartbeat.tick();
    expect(rounds).toBe(2);
  });

  it('limite de uso esgotado: a rodada testa uma história e deixa as outras para a próxima rodada (#551)', () => {
    create('A', 'Implementação'); // #1
    create('B', 'Implementação'); // #2
    setStatus(1, 'ready');
    setStatus(2, 'ready');
    runner.usageLimited = true;
    heartbeat.runNow();
    expect(runner.started.map(number)).toEqual([1]);
    // a execução termina por limite: o card volta para a IA e a fila é descartada, sem iniciar a B
    runner.finish('ready');
    expect(runner.started.map(number)).toEqual([1]);
    expect(heartbeat.queued).toBe(0);
    expect(log.some((l) => /limite de uso/.test(l))).toBe(true);
    // o limite renovou: a próxima rodada executa de novo
    runner.usageLimited = false;
    heartbeat.runNow();
    expect(runner.started.map(number)).toEqual([1, 1]); // a A é a primeira da fila e tem a vaga
  });

  it('enqueue inicia a história na hora, mesmo com o heartbeat desligado, sem duplicar', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { heartbeat: false } } });
    create('A', 'Implementação'); // #1
    heartbeat.enqueue(card(1).id);
    heartbeat.enqueue(card(1).id);
    expect(runner.started.map(number)).toEqual([1]);
    expect(runner.origins).toEqual(['heartbeat']);
  });

  it('enqueue respeita o teto: o que não cabe espera na fila, na ordem', () => {
    create('A', 'Implementação'); // #1
    create('B', 'Implementação'); // #2
    create('C', 'Implementação'); // #3
    heartbeat.enqueue(card(1).id);
    heartbeat.enqueue(card(3).id);
    heartbeat.enqueue(card(2).id);
    expect(runner.started.map(number)).toEqual([1]);
    expect(heartbeat.queued).toBe(2);
    runner.finish();
    expect(runner.started.map(number)).toEqual([1, 3]);
    runner.finish();
    expect(runner.started.map(number)).toEqual([1, 3, 2]);
  });

  it('escolhe uma execução por história, na ordem da fila', () => {
    create('A', 'PRD'); // #1 pronto
    create('Sub de A', 'A fazer', 1); // #2: tratada junto com #1
    create('B', 'Spec'); // #3
    create('C', 'Backlog'); // #4: a IA não atua
    create('D', 'Plan'); // #5
    setStatus(3, 'approved');
    setStatus(5, 'waiting_review');
    create('Sub de D', 'A fazer', 5); // #6: a história está com a pessoa
    // ordem de execução: a coluna mais à direita primeiro, não por categoria (Spec vem antes de PRD)
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([3, 1]);

    // mensagem da pessoa sem resposta traz a história para a fila, mesmo aguardando revisão
    router.handle({ type: 'comment.add', cardId: card(5).id, body: 'Por quê?' });
    router.handle({ type: 'comment.add', cardId: card(2).id, body: 'Detalhe na sub-tarefa' });
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([5, 3, 1]); // Plan, Spec, PRD: da direita para a esquerda
  });

  it('bug fura a fila: entra na frente mesmo estando numa coluna anterior', () => {
    const bugTypeId = createBugType();
    create('A', 'Plan'); // #1 pronto, mais adiante no fluxo
    createTyped(bugTypeId, 'Bug', 'PRD'); // #2 pronto, numa coluna anterior
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([2, 1]);
  });

  it('o bug muda a ordem, mas não o conjunto de histórias pendentes', () => {
    const bugTypeId = createBugType();
    create('A', 'Spec'); // #1 pronto, mais adiante
    create('B', 'PRD'); // #2: vai ser aprovado
    createTyped(bugTypeId, 'Bug', 'Discovery'); // #3: na coluna mais à esquerda das três
    setStatus(2, 'approved');
    const targets = heartbeatTargets(router.snapshot()).map((c) => c.number);
    expect([...targets].sort((a, b) => a - b)).toEqual([1, 2, 3]); // mesmo conjunto de antes
    expect(targets).toEqual([3, 1, 2]); // só a ordem muda: bug primeiro, depois da coluna mais à direita para a esquerda
  });

  it('bug "Pronto" vem antes de um card "Aprovado" que está mais adiante no board', () => {
    const bugTypeId = createBugType();
    createTyped(bugTypeId, 'Bug', 'PRD'); // #1: pronto, numa coluna anterior
    create('Aprovada', 'Revisão'); // #2: aprovado, e bem mais adiante
    setStatus(2, 'approved');
    // a aprovação da pessoa leva o card à coluna seguinte (Homologação), pronto para a IA (#441)
    expect(router.snapshot().columns.find((c) => c.id === card(2).columnId)!.name).toBe('Homologação');
    expect(card(2).status).toBe('ready');
    // o bug vence até a coluna mais à direita
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

  it('a rodada que não executa nada diz o motivo no log', () => {
    create('A', 'Implementação'); // #1
    create('Tarefa', 'A fazer', 1); // #2
    setStatus(1, 'running'); // uma sessão já trabalha na história
    setStatus(2, 'ready');
    expect(heartbeat.runNow()).toBe(0);
    expect(log.at(-1)).toMatch(/^Heartbeat: nenhuma história pode executar agora: #1 .*já há uma execução nela/);
  });

  it('a execução que o heartbeat inicia é registrada no log com a origem "heartbeat"', () => {
    create('A', 'PRD');
    expect(heartbeat.runNow()).toBe(1);
    expect(runner.started).toHaveLength(1);
    expect(runner.origins).toEqual(['heartbeat']);
  });

  it('executa uma história com branch por vez e não sobrepõe rodadas', () => {
    create('A', 'Implementação'); // #1: no topo da coluna
    create('B', 'Implementação'); // #2
    create('C', 'Implementação'); // #3
    expect(heartbeat.runNow()).toBe(3);
    expect(runner.started.map(number)).toEqual([1]); // mexem em código: uma por vez
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

  it('no modo worktree toca até o limite de histórias com branch ao mesmo tempo e preenche a vaga quando uma termina', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallel: true }, git: { mode: 'worktree' } } });
    create('A', 'Implementação'); // #1
    create('B', 'Implementação'); // #2
    create('C', 'Implementação'); // #3
    expect(heartbeat.runNow()).toBe(3);
    expect(runner.started.map(number)).toEqual([1, 2]); // limite padrão: duas
    expect(heartbeat.queued).toBe(1);
    runner.finish(); // a primeira termina: a vaga vai para a terceira, com a segunda ainda rodando
    expect(runner.started.map(number)).toEqual([1, 2, 3]);
    expect(runner.running).toHaveLength(2);
  });

  it('com o paralelo desligado (o padrão), mesmo no modo worktree é uma história com branch por vez', () => {
    router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree' } } });
    create('A', 'Implementação');
    create('B', 'Implementação');
    heartbeat.runNow();
    expect(runner.started.map(number)).toEqual([1]);
  });

  it('fora do modo worktree o limite não vale para histórias com branch: uma por vez', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallel: true, parallelStories: 3 }, git: { mode: 'branch' } } });
    create('A', 'Implementação');
    create('B', 'Implementação');
    heartbeat.runNow();
    expect(runner.started.map(number)).toEqual([1]);
    expect(log.at(-1)).toBe('Heartbeat: 1 história(s) com branch esperando vaga.');
  });

  it('RF2: histórias em fase de texto rodam juntas até parallelStories, mesmo no modo branch e com o paralelo desligado', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallel: false, parallelStories: 2 }, git: { mode: 'branch' } } });
    create('A', 'Discovery'); // #1
    create('B', 'Discovery'); // #2
    create('C', 'Discovery'); // #3
    expect(heartbeat.runNow()).toBe(3);
    expect(runner.started.map(number)).toEqual([1, 2]); // só produzem documento: duas de uma vez
    expect(heartbeat.queued).toBe(1);
    expect(log.at(-1)).toBe('Heartbeat: 1 história(s) em fase de texto esperando vaga.');
    runner.finish(); // a terceira entra na vaga que abriu
    expect(runner.started.map(number)).toEqual([1, 2, 3]);
    expect(runner.running).toHaveLength(2);
  });

  /** Marca a história como em execução no board e no executor, como uma chamada à mão. */
  const running = (n: number) => {
    runner.running.push(card(n).id);
    router.handle({ type: 'card.status.set', cardId: card(n).id, status: 'running' }, { source: 'ai' });
  };

  it('RF4: uma história com branch em execução não segura a de texto', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallelStories: 2 }, git: { mode: 'branch' } } });
    create('A', 'Implementação'); // #1
    create('B', 'PRD'); // #2
    running(1);
    expect(heartbeat.runNow()).toBe(1);
    expect(runner.started.map(number)).toEqual([2]); // a vaga com branch está ocupada, mas a de texto não
  });

  it('RF4: o teto de texto cheio não segura a história com branch', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallelStories: 2 }, git: { mode: 'branch' } } });
    create('A', 'PRD'); // #1
    create('B', 'PRD'); // #2
    create('C', 'Implementação'); // #3
    create('D', 'PRD'); // #4
    running(1);
    running(2);
    expect(heartbeat.runNow()).toBe(2);
    expect(runner.started.map(number)).toEqual([3]); // a de código entra; a de texto espera a vaga do tipo dela
    expect(heartbeat.queued).toBe(1);
  });

  it('RF6: fila mista: a história com branch sem vaga espera, as de texto passam, e ela entra quando a vaga abre', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallelStories: 2 }, git: { mode: 'branch' } } });
    create('A', 'Implementação'); // #1
    create('B', 'Discovery'); // #2
    create('C', 'Discovery'); // #3
    create('D', 'Implementação'); // #4
    expect(heartbeat.runNow()).toBe(4);
    expect(runner.started.map(number)).toEqual([1, 2, 3]); // D fica na fila, sem travar B e C
    expect(heartbeat.queued).toBe(1);
    runner.finish(); // A termina: a vaga com branch vai para D
    expect(runner.started.map(number)).toEqual([1, 2, 3, 4]);
    expect(heartbeat.queued).toBe(0);
  });

  it('história que depende de outra ainda em aberto não entra na rodada', () => {
    create('A', 'PRD'); // #1
    create('B', 'Spec'); // #2: só começa depois de #1
    router.handle({ type: 'link.add', fromId: card(1).id, toId: card(2).id, kind: 'precedes' });
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([1]);
    // nem pela sub-tarefa pronta: quem executa é a história, que ainda espera #1
    create('Sub de B', 'A fazer', 2); // #3
    setStatus(3, 'ready');
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([1]);
  });

  it('história com sub-tarefa em execução não é iniciada de novo', () => {
    create('A', 'Implementação'); // #1 pronta
    create('Sub', 'A fazer', 1); // #2
    create('Outra sub', 'A fazer', 1); // #3
    router.handle({ type: 'card.status.set', cardId: card(2).id, status: 'running' }, { source: 'ai' });
    expect(heartbeatTargets(router.snapshot())).toEqual([]);
  });

  it('com execução em andamento, a rodada usa as vagas livres e "rodar agora" conta as histórias', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallel: true, parallelStories: 3 }, git: { mode: 'worktree' } } });
    runner.running.push('chamada-a-mao'); // uma execução que o heartbeat não iniciou (conta como branch)
    create('A', 'Implementação');
    create('B', 'Implementação');
    create('C', 'Implementação');
    expect(heartbeat.runNow()).toBe(3);
    expect(runner.started.map(number)).toEqual([1, 2]); // três vagas, uma já ocupada
    expect(heartbeat.queued).toBe(1);
  });

  it('com execução em andamento e o intervalo passado, a rodada automática começa nas vagas livres', () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallel: true }, git: { mode: 'worktree' } } });
    runner.running.push('chamada-a-mao');
    create('A', 'PRD');
    now += 60 * MIN;
    heartbeat.tick();
    expect(runner.started.map(number)).toEqual([1]);
  });

  it('desligado não roda sozinho; parar esvazia a fila; falha ao iniciar encerra a rodada', () => {
    create('A', 'Implementação');
    create('B', 'Implementação');
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

  it('com o login vencido (preventivo ou reativo), não inicia nenhuma história e esvazia a rodada', () => {
    create('A', 'PRD');
    create('B', 'Spec');
    router.setRequirements([{ id: 'signin', tool: 'claude', cli: 'claude', action: { kind: 'command', command: 'claude login' } }]);
    heartbeat.runNow();
    expect(runner.started).toEqual([]);

    router.setRequirements([]);
    router.setAuthExpired('claude');
    heartbeat.runNow();
    expect(runner.started).toEqual([]);

    router.setAuthExpired(null);
    heartbeat.runNow();
    // as duas estão em fase de texto e cabem no teto de texto (2): o login de volta libera as duas
    expect(runner.started).toHaveLength(2);
  });
});

describe('heartbeat: refinar, resumir e arrumar o board', () => {
  const comments = (n: number) => router.snapshot().comments.filter((c) => c.cardId === card(n).id);
  const ai = (n: number, body: string, kind?: 'summary') =>
    router.handle({ type: 'comment.add', cardId: card(n).id, body, kind }, { author: 'Claude Code', source: 'ai' });
  const withAct = () => {
    heartbeat = new Heartbeat(runner, {
      snapshot: () => router.snapshot(),
      now: () => now,
      log: (l) => log.push(l),
      act: (msg) => router.handle(msg, { author: 'Faz AI', source: 'ai' }),
    });
  };

  it('refina os cards do Backlog ainda não refinados, um modo de texto, e deixa de refinar depois de marcado', () => {
    create('Nova', 'Backlog'); // #1
    create('Já refinada', 'Backlog'); // #2
    router.handle({ type: 'card.refined.set', cardId: card(2).id });
    create('Autônoma', 'Backlog'); // #3: é do autopiloto
    router.handle({ type: 'card.yolo.set', cardId: card(3).id, enabled: true });
    create('Em fase', 'PRD'); // #4: não é Backlog
    create('Sub', 'A fazer', 4); // #5: sub-tarefa não é refinada sozinha
    expect(refineTargets(router.snapshot()).map((c) => c.number)).toEqual([1]);
    expect(heartbeat.runNow()).toBe(2); // #4 (fase) e #1 (refinar)
    expect(runner.started.map(number)).toEqual([4, 1]);
    expect(runner.modes).toEqual(['phase', 'refine']);
    expect(runner.origins).toEqual(['heartbeat', 'heartbeat']);
    expect(log.some((l) => l.includes('#1 (refinar)'))).toBe(true);
    // refinado e entregue para a revisão da pessoa: não entra de novo
    runner.running = [];
    router.handle({ type: 'card.refined.set', cardId: card(1).id });
    router.handle({ type: 'card.status.set', cardId: card(1).id, status: 'waiting_review' }, { source: 'ai' });
    expect(refineTargets(router.snapshot())).toEqual([]);
    // com o refinamento automático desligado, nada do Backlog entra
    create('Outra', 'Backlog'); // #6
    router.handle({ type: 'settings.board.update', patch: { runner: { heartbeatRefine: false } } });
    expect(refineTargets(router.snapshot())).toEqual([]);
  });

  it('resume a conversa que cresceu (3+ mensagens desde o último resumo, ao menos uma da IA) antes de trabalhar a fase', () => {
    create('A', 'PRD'); // #1 pronta
    router.handle({ type: 'comment.add', cardId: card(1).id, body: 'Quero CSV.' });
    ai(1, 'Entendi.');
    ai(1, 'Documento pronto.');
    expect(summaryTargets(router.snapshot()).map((c) => c.number)).toEqual([1]);
    expect(heartbeatQueue(router.snapshot())).toEqual([{ id: card(1).id, mode: 'summarize' }]);
    heartbeat.runNow();
    expect(runner.modes).toEqual(['summarize']);
    // o resumo gravado zera a contagem: a próxima rodada trabalha a fase
    runner.finish('ready');
    ai(1, 'Decisões: CSV.', 'summary');
    expect(summaryTargets(router.snapshot())).toEqual([]);
    heartbeat.runNow();
    expect(runner.modes).toEqual(['summarize', 'phase']);
  });

  it('a pergunta da pessoa feita antes do resumo continua sem resposta: o resumo não conta como resposta da IA', () => {
    create('A', 'PRD'); // #1
    setStatus(1, 'waiting_review');
    ai(1, 'Pronto para revisar.');
    ai(1, 'Mais um detalhe.');
    router.handle({ type: 'comment.add', cardId: card(1).id, body: 'E o formato?' });
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([1]); // sem resposta
    ai(1, 'Decisões: nada; Pendências: o formato.', 'summary');
    expect(heartbeatTargets(router.snapshot()).map((c) => c.number)).toEqual([1]); // segue sem resposta
  });

  it('devolve para a IA o card bloqueado por limite de uso, com aviso na conversa, e o executa na rodada', () => {
    withAct();
    create('A', 'Implementação'); // #1
    setStatus(1, 'blocked', "O Claude Code encerrou sem responder. Fim da saída:\n\nYou've hit your limit · resets 3pm");
    create('B', 'Implementação'); // #2: bloqueio comum fica
    setStatus(2, 'blocked', 'Falta acesso ao repositório.');
    heartbeat.runNow();
    expect(card(1).status).toBe('running');
    expect(card(2).status).toBe('blocked');
    expect(comments(1).at(-1)!.body).toContain('o limite de uso renova sozinho');
    expect(runner.started.map(number)).toEqual([1]);
  });

  it('avisa uma vez por parada que o card está com a pessoa há dias', () => {
    withAct();
    // o status guarda o relógio real do banco: o relógio do teste parte dele
    now = Date.now() + MIN;
    create('A', 'PRD'); // #1
    setStatus(1, 'waiting_review');
    heartbeat.runNow();
    expect(comments(1)).toEqual([]); // recente: nada a avisar
    now += STALE_DAYS * 24 * 60 * MIN;
    heartbeat.runNow();
    expect(comments(1).map((c) => c.body)).toEqual([
      `Este card está com você há ${STALE_DAYS} dia(s), esperando a sua revisão. A IA só segue depois que você resolver.`,
    ]);
    // a rodada seguinte não repete; um status novo (a pessoa agiu e o card parou de novo) avisa de novo
    now += MIN;
    heartbeat.runNow();
    expect(comments(1)).toHaveLength(1);
    setStatus(1, 'ready');
    runner.running = [];
    setStatus(1, 'waiting_answer');
    now = Date.now() + STALE_DAYS * 24 * 60 * MIN + MIN;
    heartbeat.runNow();
    expect(comments(1)).toHaveLength(2);
    expect(comments(1).at(-1)!.body).toContain('esperando a sua resposta');
  });
});

describe('heartbeat: a manutenção da rodada vem antes da fila da IA (#722)', () => {
  /** a manutenção simulada: cada rodada devolve uma promessa que o teste resolve ou rejeita */
  let rounds: { resolve: () => void; reject: (e: unknown) => void }[];
  /** o que aconteceu, em ordem: a arrumação (status do card devolvido) e o começo da manutenção */
  let order: string[];
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const withMaintenance = () => {
    rounds = [];
    order = [];
    heartbeat = new Heartbeat(runner, {
      snapshot: () => router.snapshot(),
      now: () => now,
      log: (l) => log.push(l),
      act: (msg) => {
        if (msg.type === 'card.status.set') order.push(`arrumação ${msg.status}`);
        router.handle(msg, { author: 'Faz AI', source: 'ai' });
      },
      onRound: () => {
        order.push('manutenção');
        return new Promise<void>((resolve, reject) => rounds.push({ resolve, reject }));
      },
    });
  };
  beforeEach(withMaintenance);

  it('com a manutenção pendente, o número sai na hora e nada começa; ao resolver, a fila começa (RF1, RF2)', async () => {
    create('A', 'Implementação'); // #1
    create('B', 'PRD'); // #2: fase de texto
    expect(heartbeat.runNow()).toBe(2);
    expect(runner.started).toEqual([]);
    expect(heartbeat.busy).toBe(true);
    expect(heartbeat.queued).toBe(2);
    rounds[0]!.resolve();
    await flush();
    expect(runner.started.map(number)).toEqual([1, 2]);
  });

  it('uma manutenção que rejeita também libera a fila', async () => {
    create('A', 'Implementação'); // #1
    heartbeat.runNow();
    rounds[0]!.reject(new Error('falhou'));
    await flush();
    expect(runner.started.map(number)).toEqual([1]);
  });

  it('a arrumação acontece antes da manutenção', () => {
    create('A', 'Implementação'); // #1
    setStatus(1, 'blocked', "O Claude Code encerrou sem responder. Fim da saída:\n\nYou've hit your limit · resets 3pm");
    heartbeat.runNow();
    expect(order).toEqual(['arrumação ready', 'manutenção']);
  });

  it('uma execução que termina durante a manutenção não inicia nada, e busy segue verdadeiro', async () => {
    create('A', 'Implementação'); // #1
    heartbeat.runNow();
    rounds[0]!.resolve();
    await flush();
    expect(runner.started.map(number)).toEqual([1]);
    // a próxima rodada começa com #1 ainda rodando; #1 termina durante a manutenção dela
    create('B', 'Implementação'); // #2
    heartbeat.runNow();
    runner.finish();
    expect(runner.started.map(number)).toEqual([1]);
    expect(heartbeat.busy).toBe(true);
    rounds[1]!.resolve();
    await flush();
    expect(runner.started.map(number)).toEqual([1, 2]);
  });

  it('um enqueue durante a manutenção espera o fim dela', async () => {
    create('A', 'Implementação'); // #1
    setStatus(1, 'waiting_review');
    heartbeat.runNow();
    heartbeat.enqueue(card(1).id);
    expect(runner.started).toEqual([]);
    setStatus(1, 'ready');
    rounds[0]!.resolve();
    await flush();
    expect(runner.started.map(number)).toEqual([1]);
  });

  it('as execuções da IA seguem nos tetos do board, não no teto da manutenção (RF6)', async () => {
    router.handle({ type: 'settings.board.update', patch: { runner: { parallel: false, parallelStories: 2 }, git: { mode: 'branch' } } });
    create('A', 'Discovery'); // #1
    create('B', 'Discovery'); // #2
    create('C', 'Discovery'); // #3
    create('D', 'Implementação'); // #4
    create('E', 'Implementação'); // #5
    heartbeat.runNow();
    rounds[0]!.resolve();
    await flush();
    // duas de texto ("Histórias ao mesmo tempo") e uma com branch, mesmo com a manutenção podendo 4
    expect(runner.started.map(number).sort()).toEqual([1, 2, 4]);
    expect(heartbeat.queued).toBe(2);
  });

  it('só o fim da manutenção mais recente libera a fila', async () => {
    create('A', 'Implementação'); // #1
    heartbeat.runNow();
    heartbeat.stop(); // esvazia a fila; a próxima rodada monta outra
    heartbeat.runNow();
    rounds[0]!.resolve();
    await flush();
    expect(runner.started).toEqual([]);
    rounds[1]!.resolve();
    await flush();
    expect(runner.started.map(number)).toEqual([1]);
  });
});
