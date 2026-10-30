// O `EvalBoard` do teste: o mesmo mundo do `storyWorld` (cardWorld com o perfil `claude`, `spawn` falso e recibos
// de capacidade), mais o `Orchestrator` e o `Autopilot` como o host os monta. O `act` do `spawn` faz o papel da IA
// e escreve a linha `result` do stream-json do Claude, com o consumo, para o log medir.
import { Autopilot } from '../../src/extension/autopilot';
import type { HeadlessCommand } from '../../src/extension/headless';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { panelRework } from '../../src/extension/log/rework';
import { Orchestrator } from '../../src/extension/orchestrator';
import { terminateProcessGroup } from '../../src/extension/processIdentity';
import { CommentRepo } from '../../src/extension/repositories/commentRepo';
import { monthOf } from '../../src/shared/log';
import { configureBoard, type EvalBoard, type EvalLog } from '../../evals/lib/evalBoard';
import type { EvalConfig } from '../../evals/lib/types';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from '../scenarios/cardWorld';
import * as fs from 'node:fs';

/** O consumo que a execução falsa declara na linha `result`; `costUsd` ausente = custo não informado. */
export interface FakeUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  costUsd?: number;
}

/** O que a IA falsa pode fazer numa execução: mexer no board e na pasta do projeto. */
export interface EvalAct {
  /** o card cuja execução começou */
  cardId: string;
  world: EvalWorld;
  command: HeadlessCommand;
  /** a IA escreve a linha `result` com o consumo (padrão: tokens fixos, sem custo) */
  usage(u?: FakeUsage): void;
  /** a execução não termina sozinha: só `kill` (o tempo limite) a encerra */
  hang(): void;
}

export interface EvalWorld extends EvalBoard {
  world: CardWorld;
  orchestrator: Orchestrator;
  autopilot: Autopilot;
  /** cada card cuja execução o runner abriu, na ordem */
  starts: string[];
  /** os nomes das colunas em que cada execução começou (a coluna da história no início da execução) */
  startColumns: string[];
  dispose(): void;
}

const DEFAULT_USAGE: Required<Omit<FakeUsage, 'costUsd'>> = { input: 100, output: 50, cacheRead: 1000, cacheWrite: 200 };

export async function evalWorld(config: EvalConfig, act: (a: EvalAct) => void): Promise<EvalWorld> {
  const held: { world?: EvalWorld } = {};
  const starts: string[] = [];
  const startColumns: string[] = [];
  const spawn: SpawnFn = (command, _cwd, out) => {
    const cardId = starts.at(-1)!;
    let exit: (code: number | null) => void = () => {};
    let hanging = false;
    let wrote = false;
    const usage = (u: FakeUsage = {}): void => {
      wrote = true;
      const t = { ...DEFAULT_USAGE, ...u };
      out(
        JSON.stringify({
          type: 'result',
          session_id: `sessao-${starts.length}`,
          num_turns: 1,
          result: 'Pronto.',
          usage: {
            input_tokens: t.input,
            output_tokens: t.output,
            cache_read_input_tokens: t.cacheRead,
            cache_creation_input_tokens: t.cacheWrite,
          },
          ...(u.costUsd === undefined ? {} : { total_cost_usd: u.costUsd }),
        }) + '\n',
        'stdout',
      );
    };
    act({ cardId, world: held.world!, command, usage, hang: () => (hanging = true) });
    if (!wrote && !hanging) usage();
    if (!hanging) queueMicrotask(() => exit(0));
    return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
  };

  const base = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, spawn, snapshots: true });
  const { router, runner, db } = base;
  // o board da rodada, configurado como o real: modelo fixo, permissão `full`, git em `branch`
  configureBoard(router, config);

  const orchestrator = new Orchestrator({
    repo: () => router.work,
    state: () => router.snapshot(),
    sessions: router.executions,
    starter: {
      start: (id, options) => runner.start(id, options),
      stop: (id) => runner.stop(id),
    },
    ownsBoard: () => true,
    flush: async () => {},
    workspace: async () => base.project,
    fingerprint: async () => 'fixo',
    terminate: terminateProcessGroup,
    comment: (work, _outcome, body) => new CommentRepo(db).add(work.storyId ?? work.cardId!, 'Faz AI', body, 'ai'),
    publish: () => {},
    note: (id, body) => {
      new CommentRepo(db).add(id, 'Faz AI', body, 'ai');
    },
    block: (id, reason) =>
      router.handle({ type: 'card.status.set', cardId: id, status: 'blocked', note: reason }, { author: 'Faz AI', source: 'ai' }),
    log: (line) => base.lines.push(line),
    gitMode: () => router.snapshot().board.git.mode,
    otherProcesses: () => [],
    coordinationDir: `${base.root}/locks`,
  });
  fs.mkdirSync(`${base.root}/locks`, { recursive: true });

  /** a coluna da história (ou do pai da sub-tarefa) quando a execução começa */
  function recordColumn(id: string): void {
    const s = router.snapshot();
    const card = s.cards.find((c) => c.id === id);
    const story = card?.parentId ? s.cards.find((c) => c.id === card.parentId) : card;
    startColumns.push(s.columns.find((c) => c.id === story?.columnId)?.name ?? '?');
  }

  // toda execução, venha do autopiloto ou do orquestrador, passa por aqui: guarda o card e a coluna em que começou
  const originalStart = runner.start.bind(runner);
  runner.start = (id, options) => {
    starts.push(id);
    recordColumn(id);
    return originalStart(id, options);
  };

  const driver = {
    drive: (storyId: string, origin: 'manual' | 'autopilot' | 'heartbeat') => orchestrator.drive(storyId, origin),
  };
  const autopilot = new Autopilot(router, runner, { log: (line) => base.lines.push(line), canRun: () => true, driver });

  const world: EvalWorld = {
    world: base,
    router,
    runner,
    orchestrator,
    autopilot,
    starts,
    startColumns,
    projectDir: base.project,
    close: async (period): Promise<EvalLog> => {
      autopilot.stop();
      await orchestrator.settled();
      const runs = new AiRunRepo(db).byMonth(monthOf(period.start));
      if (monthOf(period.end) !== monthOf(period.start)) runs.push(...new AiRunRepo(db).byMonth(monthOf(period.end)));
      const { aiSignals } = panelRework(db, router.boardId, period, '');
      return {
        runs: runs.filter((r) => r.boardId === router.boardId && r.startedAt >= period.start && r.startedAt <= period.end),
        signals: {
          reviewFixes: aiSignals.reviewFixes.count,
          testFailures: aiSignals.testFailures.count,
          commitsAfterPr: aiSignals.commitsAfterPr.count,
        },
      };
    },
    dispose: () => base.dispose(),
  };
  held.world = world;
  await orchestrator.reconcileOnOpen();
  return world;
}
