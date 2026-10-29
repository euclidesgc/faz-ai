// Cenário da trilha direta: uma história de esforço Baixo, com a regra Trilha curta ligada e sem sub-tarefas na
// Implementação, roda como sessão da história com o pedido da trilha direta. Só o processo da CLI é falso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessCommand } from '../../src/extension/headless';
import { DIRECT_TRACK_ADVICE, STORY_SESSION_ADVICE } from '../../src/extension/unitAdvice';
import { EFFORT_FIELD } from '../../src/shared/models';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const promptOf = (c: HeadlessCommand): string => c.stdin ?? c.args.join(' ');
const AI = { author: 'Claude Code', source: 'ai' } as const;

function setup(w: StoryWorld, shortTrack: boolean): void {
  w.router.handle({ type: 'settings.rules.update', patch: { shortTrack } });
  const effort = w.router.snapshot().fieldDefs.find((f) => f.name === EFFORT_FIELD)!;
  w.router.handle({ type: 'field.setValue', cardId: w.storyId, fieldId: effort.id, value: 'Baixo' });
}
function moveStoryTo(w: StoryWorld, next: 'review'): void {
  const s = w.router.snapshot();
  const story = s.cards.find((c) => c.id === w.storyId)!;
  const cols = s.columns.filter((c) => c.workflowId === story.workflowId).sort((a, b) => a.position - b.position);
  const at = cols.findIndex((c) => c.id === story.columnId);
  const target = cols[at + 1]!;
  expect(next).toBe('review');
  w.router.handle({ type: 'card.move', cardId: w.storyId, columnId: target.id, position: 0 }, AI);
}
/** a execução da sub-tarefa a conclui, como o ciclo dela manda: mover para a coluna de conclusão */
function finish(w: StoryWorld, cardId: string): void {
  const s = w.router.snapshot();
  const card = s.cards.find((c) => c.id === cardId)!;
  const done = s.columns.find((c) => c.workflowId === card.workflowId && c.category === 'done')!;
  w.router.handle({ type: 'card.move', cardId, columnId: done.id, position: 0 }, AI);
}
const until = (cond: () => boolean): Promise<void> => vi.waitFor(() => expect(cond()).toBe(true), { timeout: 5000, interval: 25 });

describe('cenário: trilha direta', () => {
  it('a Implementação recebe DIRECT_TRACK_ADVICE e a Revisão seguinte recebe STORY_SESSION_ADVICE', async () => {
    world = await storyWorld((id, w) => {
      if (id === w.storyId && w.cliCommands.length === 1) moveStoryTo(w, 'review');
    });
    setup(world, true);
    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    // o orquestrador segue a história para a Revisão logo que a sessão da Implementação a move
    await until(() => world!.cliCommands.length >= 2);
    expect(promptOf(world.cliCommands[0]!)).toContain(DIRECT_TRACK_ADVICE);
    const review = promptOf(world.cliCommands[1]!);
    expect(review).toContain(STORY_SESSION_ADVICE);
    expect(review).not.toContain(DIRECT_TRACK_ADVICE);
  });

  it('a sessão cria sub-tarefas com as seções: o board as executa uma por vez e chama o fechamento', async () => {
    const created: string[] = [];
    world = await storyWorld((id, w) => {
      if (id === w.storyId && created.length === 0) created.push(w.subtask('A', validBrief()), w.subtask('B', validBrief()));
      else if (created.includes(id)) finish(w, id);
    });
    setup(world, true);
    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    await until(() => world!.starts.length >= 4);
    await world.orchestrator.settled();
    expect(promptOf(world.cliCommands[0]!)).toContain(DIRECT_TRACK_ADVICE);
    expect(world.starts).toEqual([world.storyId, ...created, world.storyId]);
    expect(promptOf(world.cliCommands[3]!)).toContain('As sub-tarefas desta fase');
  });

  it('com a regra desligada a mesma história recebe STORY_SESSION_ADVICE', async () => {
    world = await storyWorld(() => {});
    setup(world, false);
    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    const prompt = promptOf(world.cliCommands[0]!);
    expect(prompt).toContain(STORY_SESSION_ADVICE);
    expect(prompt).not.toContain(DIRECT_TRACK_ADVICE);
  });
});
