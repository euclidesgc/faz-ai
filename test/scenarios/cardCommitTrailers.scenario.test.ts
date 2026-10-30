// Cenário de ponta a ponta dos trailers de rastreio (história #1101): do `runner.start` ao `git commit` que a
// ferramenta faz dentro da execução. Só o processo da IA é falso: ele roda `git commit` de verdade no projeto do
// cenário, com o ambiente que o gateway entregou ao `spawn`. Confere os três trailers, que a sub-tarefa leva o
// card dela e a fase da história, e que a pasta dos hooks some no fim.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { CONDUTOR_TOOLS, cardWorld, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

const git = (cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

/** O processo da IA: um commit vazio de verdade, e o que os hooks viram guardado para o teste. */
function committing(project: string, kitsDuring: string[][], world: () => CardWorld): SpawnFn {
  return (command) => {
    kitsDuring.push(world().kits());
    git(project, ['commit', '--allow-empty', '-m', 'x'], { ...process.env, ...command.env });
    let exit: (code: number | null) => void = () => {};
    queueMicrotask(() => exit(0));
    return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
  };
}

const trailers = (project: string) => {
  const raw = git(project, ['log', '-1', '--format=%(trailers:only,unfold)']);
  return Object.fromEntries(
    raw
      .split('\n')
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]),
  );
};

describe('os commits de uma execução de card levam os trailers de rastreio', () => {
  it('a história e a sub-tarefa: card, coluna da história e id da execução; a pasta dos hooks some', async () => {
    const kitsDuring: string[][] = [];
    const held: { world?: CardWorld } = {};
    world = await cardWorld({
      profile: 'claude',
      tools: CONDUTOR_TOOLS,
      commitTrailers: true,
      spawn: (command, cwd, out, control) => committing(project, kitsDuring, () => held.world!)(command, cwd, out, control),
    });
    held.world = world;
    const project = world.project;
    git(project, ['init', '-q']);
    git(project, ['config', 'user.name', 'Cenário']);
    git(project, ['config', 'user.email', 'cenario@example.com']);
    git(project, ['config', 'commit.gpgsign', 'false']);

    const snapshot = world.router.snapshot();
    const story = snapshot.cards.find((c) => c.id === world!.cardId)!;
    const storyColumn = snapshot.columns.find((c) => c.id === story.columnId)!.name;

    // 1) a história
    await world.run();
    const first = trailers(project);
    expect(first['Faz-AI-Card']).toBe(`#${story.number}`);
    expect(first['Faz-AI-Phase']).toBe(storyColumn);
    expect(first['Faz-AI-Run']).toBe(world.aiRun()!.id);
    expect(kitsDuring[0]).toHaveLength(1);
    expect(world.kits()).toEqual([]);
    const firstRun = first['Faz-AI-Run'];

    // 2) uma sub-tarefa dela: o card é o da sub-tarefa, a fase continua a da história
    const child = snapshot.workflows.find((w) => w.kind === 'child')!;
    const column = snapshot.columns.find((c) => c.workflowId === child.id && c.category === 'open')!;
    const subId = world.router.createCard({
      typeId: snapshot.cardTypes.find((t) => t.defaultWorkflowId === child.id)!.id,
      columnId: column.id,
      parentId: world.cardId,
      title: 'Sub-tarefa do cenário',
    });
    const sub = world.router.snapshot().cards.find((c) => c.id === subId)!;
    await new Promise((resolve, reject) => {
      try {
        world!.runner.start(subId, { origin: 'manual', onExit: resolve });
      } catch (e) {
        reject(e);
      }
    });
    const second = trailers(project);
    expect(second['Faz-AI-Card']).toBe(`#${sub.number}`);
    expect(second['Faz-AI-Phase']).toBe(storyColumn);
    expect(second['Faz-AI-Run']).not.toBe(firstRun);
    expect(storyColumn).not.toBe(world.router.snapshot().columns.find((c) => c.id === sub.columnId)!.name);
    expect(world.kits()).toEqual([]);
    expect(fs.existsSync(path.join(project, '.git', 'hooks', 'prepare-commit-msg'))).toBe(false);
  }, 30_000);

  it('sem a opção (o host sem os trailers), o commit sai sem trailer nenhum', async () => {
    const kitsDuring: string[][] = [];
    const held: { world?: CardWorld } = {};
    world = await cardWorld({
      profile: 'claude',
      tools: CONDUTOR_TOOLS,
      spawn: (command, cwd, out, control) => committing(project, kitsDuring, () => held.world!)(command, cwd, out, control),
    });
    held.world = world;
    const project = world.project;
    git(project, ['init', '-q']);
    git(project, ['config', 'user.name', 'Cenário']);
    git(project, ['config', 'user.email', 'cenario@example.com']);
    git(project, ['config', 'commit.gpgsign', 'false']);
    await world.run();
    expect(trailers(project)).toEqual({});
  }, 30_000);
});
