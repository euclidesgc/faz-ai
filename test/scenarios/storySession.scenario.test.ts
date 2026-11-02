import { afterEach, describe, expect, it } from 'vitest';
import { FakeAgent } from '../fakes/acpAgent';
import { StorySessionController } from '../../src/extension/storySessionController';
import { StorySessionRepo } from '../../src/extension/repositories/storySessionRepo';
import { cardWorld, CONDUTOR_TOOLS, GEMINI_MODEL, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

describe('cenário: a História retoma a sessão nativa entre dois pedidos', () => {
  it('carrega o mesmo ID no segundo processo e mantém a conversa do card', async () => {
    const agents = [
      new FakeAgent({
        onPrompt: () => {
          world!.router.handle(
            { type: 'comment.add', cardId: world!.cardId, body: 'Discovery pronto.' },
            { author: 'Gemini', source: 'ai' },
          );
          return { stopReason: 'end_turn' };
        },
      }),
      new FakeAgent({
        sessionLoad: () => ({ configOptions: [], models: [] }),
        onPrompt: () => {
          world!.router.handle({ type: 'comment.add', cardId: world!.cardId, body: 'PRD pronto.' }, { author: 'Gemini', source: 'ai' });
          return { stopReason: 'end_turn' };
        },
      }),
    ];
    let next = 0;
    world = await cardWorld({
      profile: 'gemini',
      tools: CONDUTOR_TOOLS,
      spawnAcp: (command, cwd, out) => agents[next++]!.spawn(command, cwd, out),
    });
    const repo = new StorySessionRepo(world.db);
    world.runnerDeps.storySessions = new StorySessionController(repo);

    expect((await world.run()).outcome).toBe('done');
    const snapshot = world.router.snapshot();
    const parent = snapshot.workflows.find((workflow) => workflow.kind === 'parent')!;
    const nextPhase = snapshot.columns
      .filter((column) => column.workflowId === parent.id && column.category === 'open' && column.aiActive)
      .sort((left, right) => left.position - right.position)[1]!;
    world.router.handle({ type: 'settings.models.set', catalog: [GEMINI_MODEL, { ...GEMINI_MODEL, id: 'gemini:other', model: 'other' }] });
    world.router.handle({ type: 'settings.column.update', columnId: nextPhase.id, patch: { phaseModel: 'gemini:other' } });
    world.router.handle({ type: 'card.move', cardId: world.cardId, columnId: nextPhase.id, position: 0 });
    expect((await world.run()).outcome).toBe('done');

    expect(agents[0]!.methods()).toContain('session/new');
    expect(agents[1]!.methods()).toContain('session/load');
    expect(agents[1]!.received.find((message) => message.method === 'session/load')?.params.sessionId).toBe('sess-1');
    expect(agents[1]!.command?.args).toContain(GEMINI_MODEL.model);
    expect(repo.latestForStory(world.cardId)).toMatchObject({ generation: 1, nativeSessionId: 'sess-1', status: 'active' });
    expect(world.comments()).toEqual(expect.arrayContaining(['Discovery pronto.', 'PRD pronto.']));
  });
});
