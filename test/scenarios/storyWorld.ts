// O mundo de uma história conduzida pelo orquestrador, sobre o `cardWorld`: o `Orchestrator` é montado como o
// `boardHost` o monta (`router.work`, `router.executions`, o runner como starter e `comment`, `note` e `block`
// pelo router/repositórios). Só o processo da CLI é falso: o `spawn` do cenário decide o que cada sessão faz.
import * as fs from 'node:fs';
import type { HeadlessCommand } from '../../src/extension/headless';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { Orchestrator } from '../../src/extension/orchestrator';
import { sameAsLastNote } from '../../src/shared/orchestration';
import { terminateProcessGroup } from '../../src/extension/processIdentity';
import { CommentRepo } from '../../src/extension/repositories/commentRepo';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

export interface StoryWorld extends CardWorld {
  orchestrator: Orchestrator;
  /** a história na fase de código (a IA conduz as sub-tarefas) */
  storyId: string;
  /** cada card cuja execução o starter abriu, na ordem */
  starts: string[];
  /** cria uma sub-tarefa da fase de código; `description` null deixa a descrição vazia */
  subtask(title: string, description: string | null): string;
  /** quem escreve na conversa da história */
  storyComments(): string[];
  story(): { status: string | null; columnId: string };
}

/** O que o `act` devolve para o processo falso falhar: escreve `stdout` e sai com `code` (sem retorno, sai com 0 e sem saída). */
export interface ProcessFailure {
  stdout: string;
  code: number;
}

/** `act(cardId, command)` roda no lugar do processo da CLI (antes de ele terminar com sucesso, sem saída). */
export async function storyWorld(
  act: (cardId: string, world: StoryWorld, command: HeadlessCommand) => void | ProcessFailure,
  /** a pasta de trabalho da história; sem ela, a do projeto */
  workspace?: () => string,
): Promise<StoryWorld> {
  // `world` só existe depois do `cardWorld`; o spawn é chamado mais tarde, com ele já montado
  const held: { world?: StoryWorld } = {};
  const starts: string[] = [];
  const spawn: SpawnFn = (command, _cwd, out) => {
    const failure = act(starts.at(-1)!, held.world!, command);
    let exit: (code: number | null) => void = () => {};
    queueMicrotask(() => {
      if (failure) out(failure.stdout, 'stdout');
      exit(failure ? failure.code : 0);
    });
    return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
  };
  const base = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, spawn, snapshots: true });
  const { router, runner, db } = base;
  const s = router.snapshot();
  const parent = s.workflows.find((w) => w.kind === 'parent')!;
  const code = s.columns.find((c) => c.workflowId === parent.id && c.category === 'open' && c.aiActive && !c.artifactName)!;
  const storyId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === parent.id)!.id,
    columnId: code.id,
    parentId: null,
    title: 'História do cenário',
  });
  const orchestrator = new Orchestrator({
    repo: () => router.work,
    state: () => router.snapshot(),
    sessions: router.executions,
    starter: {
      start: (id, options) => {
        starts.push(id);
        runner.start(id, options);
      },
      stop: (id) => runner.stop(id),
    },
    ownsBoard: () => true,
    flush: async () => {},
    workspace: async () => workspace?.() ?? base.project,
    fingerprint: async () => 'fixo',
    terminate: terminateProcessGroup,
    comment: (work, _outcome, body) => {
      const target = work.storyId ?? work.cardId!;
      return sameAsLastNote(router.snapshot(), target, body) ?? new CommentRepo(db).add(target, 'Faz AI', body, 'ai');
    },
    publish: () => {},
    note: (id, body) => {
      new CommentRepo(db).add(id, 'Faz AI', body, 'ai');
    },
    block: (id, reason, quiet) =>
      router.handle(
        { type: 'card.status.set', cardId: id, status: 'blocked', note: reason, ...(quiet ? { quiet } : {}) },
        { author: 'Faz AI', source: 'ai' },
      ),
    log: (line) => base.lines.push(line),
    gitMode: () => router.snapshot().board.git.mode,
    otherProcesses: () => [],
    coordinationDir: `${base.root}/locks`,
  });
  fs.mkdirSync(`${base.root}/locks`, { recursive: true });
  const world: StoryWorld = {
    ...base,
    orchestrator,
    storyId,
    starts,
    subtask: (title, description) => {
      const st = router.snapshot();
      const child = st.workflows.find((w) => w.kind === 'child')!;
      const column = st.columns.find((c) => c.workflowId === child.id && c.category === 'open')!;
      const id = router.createCard({
        typeId: st.cardTypes.find((t) => t.defaultWorkflowId === child.id)!.id,
        columnId: column.id,
        parentId: storyId,
        title,
      });
      if (description !== null)
        router.handle({ type: 'card.update', cardId: id, patch: { description } }, { author: 'Fixture', source: 'ai' });
      const phase = st.fieldDefs.find((f) => f.name === 'Fase');
      if (phase)
        router.handle({ type: 'field.setValue', cardId: id, fieldId: phase.id, value: code.name }, { author: 'Fixture', source: 'ai' });
      return id;
    },
    storyComments: () =>
      router
        .snapshot()
        .comments.filter((c) => c.cardId === storyId)
        .map((c) => c.body),
    story: () => {
      const c = router.snapshot().cards.find((x) => x.id === storyId)!;
      return { status: c.status, columnId: c.columnId };
    },
    dispose: () => base.dispose(),
  };
  held.world = world;
  await orchestrator.reconcileOnOpen();
  return world;
}
