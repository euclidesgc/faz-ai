import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAgent } from '../fakes/acpAgent';
import { StorySessionController } from '../../src/extension/storySessionController';
import { StorySessionRepo } from '../../src/extension/repositories/storySessionRepo';
import { Orchestrator } from '../../src/extension/orchestrator';
import { CommentRepo } from '../../src/extension/repositories/commentRepo';
import { terminateProcessGroup } from '../../src/extension/processIdentity';
import { cardWorld, CONDUTOR_TOOLS, GEMINI_MODEL, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
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

  it('retoma a sessão da História para uma sub-tarefa e exige filha ACP concluída', async () => {
    vi.stubEnv('FAZAI_INTERNAL_STORY_SESSIONS', '1');
    const agents = [
      new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) }),
      new FakeAgent({
        sessionLoad: (params) => ({ sessionId: params.sessionId }),
        onPrompt: (agent, params) => {
          if (params.prompt[0].text === '/mcp') {
            agent.update({
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '**MCP servers:** 1 (1 connected)\n\n**Connected**\n- `faz-ai`: 1 tool\n' },
            });
            return { stopReason: 'end_turn' };
          }
          agent.update({
            sessionUpdate: 'subagent_spawned',
            subagentSessionId: 'native-child',
            name: 'especialista',
            task: 'Implementar a unidade Subtarefa de cenário com verificação.',
          });
          agent.update({ sessionUpdate: 'subagent_state_update', subagentSessionId: 'native-child', state: 'completed' });
          return { stopReason: 'end_turn' };
        },
      }),
      new FakeAgent({
        sessionLoad: (params) => ({ sessionId: params.sessionId }),
        onPrompt: (agent, params) => {
          if (params.prompt[0].text === '/mcp') {
            agent.update({
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '**MCP servers:** 1 (1 connected)\n\n**Connected**\n- `faz-ai`: 1 tool\n' },
            });
            return { stopReason: 'end_turn' };
          }
          // `session/load` may replay old native child events; they cannot satisfy this new work attempt.
          agent.update({ sessionUpdate: 'subagent_state_update', subagentSessionId: 'native-child', state: 'completed' });
          return { stopReason: 'end_turn' };
        },
      }),
    ];
    let next = 0;
    world = await cardWorld({
      profile: 'gemini',
      tools: CONDUTOR_TOOLS,
      snapshots: true,
      spawnAcp: (command, cwd, out) => agents[next++]!.spawn(command, cwd, out),
    });
    const repo = new StorySessionRepo(world.db);
    const sessions = new StorySessionController(repo);
    world.runnerDeps.storySessions = sessions;
    expect((await world.run()).outcome).toBe('done');

    const state = world.router.snapshot();
    const phase = state.cards.find((card) => card.id === world!.cardId)!.columnId;
    const childFlow = state.workflows.find((workflow) => workflow.kind === 'child')!;
    const subtaskColumn = state.columns.find((column) => column.workflowId === childFlow.id && column.category === 'open')!;
    const subtaskType = state.cardTypes.find((type) => type.defaultWorkflowId === childFlow.id)!;
    const childId = world.router.createCard({
      typeId: subtaskType.id,
      columnId: subtaskColumn.id,
      parentId: world.cardId,
      title: 'Subtarefa de cenário',
    });
    const claim = world.router.work.claim(
      { key: `scenario:${childId}`, kind: 'subtask', storyId: world.cardId, cardId: childId, columnId: phase },
      world.router.executions.owner,
      world.project,
    )!;
    const end = await new Promise<import('../../src/extension/ai/gateway').AiRunEnd>((resolve) => {
      world!.runner.start(childId, { origin: 'manual', mode: 'phase', workId: claim.work.id, token: claim.token, onExit: resolve });
    });

    expect(end.outcome).toBe('done');
    expect(agents[1]!.methods()).toContain('session/load');
    expect(agents[1]!.received.find((message) => message.method === 'session/load')?.params.sessionId).toBe('sess-1');
    expect(agents[1]!.received.find((message) => message.method === 'initialize')?.params.clientCapabilities.subagents).toEqual({});
    expect(repo.listChildren(repo.latestForStory(world.cardId)!.id)).toMatchObject([
      { intent: { workId: claim.work.id, status: 'completed' }, child: { nativeSessionId: 'native-child', status: 'completed' } },
    ]);

    const secondChildId = world.router.createCard({
      typeId: subtaskType.id,
      columnId: subtaskColumn.id,
      parentId: world.cardId,
      title: 'Subtarefa sem filha',
    });
    const secondClaim = world.router.work.claim(
      { key: `scenario:${secondChildId}`, kind: 'subtask', storyId: world.cardId, cardId: secondChildId, columnId: phase },
      world.router.executions.owner,
      null,
    )!;
    const missingChildEnd = await new Promise<import('../../src/extension/ai/gateway').AiRunEnd>((resolve) => {
      world!.runner.start(secondChildId, {
        origin: 'manual',
        mode: 'phase',
        workId: secondClaim.work.id,
        token: secondClaim.token,
        onExit: resolve,
      });
    });
    expect(missingChildEnd.outcome).toBe('failed');
    expect(repo.latestForStory(world.cardId)?.status).toBe('reconciling');
  });
});

describe('cenário: Discovery cria subtarefa documental e o board a reserva como filha nativa', () => {
  it('coordena, agenda pela orquestração real e conclui o card na mesma sessão principal', async () => {
    vi.stubEnv('FAZAI_INTERNAL_STORY_SESSIONS', '1');
    let childId: string | undefined;
    const agents = [
      new FakeAgent({
        onPrompt: () => {
          const state = world!.router.snapshot();
          const childFlow = state.workflows.find((workflow) => workflow.kind === 'child')!;
          const childType = state.cardTypes.find((type) => type.defaultWorkflowId === childFlow.id)!;
          const firstColumn = state.columns
            .filter((column) => column.workflowId === childFlow.id && column.category === 'open')
            .sort((left, right) => left.position - right.position)[0]!;
          childId = world!.router.createCard({
            typeId: childType.id,
            columnId: firstColumn.id,
            parentId: world!.cardId,
            title: 'Mapear a fase Discovery',
          });
          world!.router.handle(
            {
              type: 'card.update',
              cardId: childId,
              patch: {
                description:
                  '### Objetivo\nMapear o problema.\n\n### Pronto quando\nRegistrar evidências.\n\n### Pode tocar\n- docs/discovery.md\n\n### Não pode tocar\n- src/',
              },
            },
            { author: 'Gemini', source: 'ai' },
          );
          const phase = state.fieldDefs.find((field) => field.name === 'Fase')!;
          world!.router.handle(
            { type: 'field.setValue', cardId: childId, fieldId: phase.id, value: 'Discovery' },
            { author: 'Gemini', source: 'ai' },
          );
          return { stopReason: 'end_turn' };
        },
      }),
      new FakeAgent({
        sessionLoad: (params) => ({ sessionId: params.sessionId }),
        onPrompt: (agent, params) => {
          if (params.prompt?.[0]?.text === '/mcp') {
            agent.update({
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '**MCP servers:** 1 (1 connected)\n\n**Connected**\n- `faz-ai`: 1 tool\n' },
            });
            return { stopReason: 'end_turn' };
          }
          agent.update({
            sessionUpdate: 'subagent_spawned',
            subagentSessionId: 'discovery-native-child',
            name: 'especialista-discovery',
            task: 'Mapear a fase Discovery e documentar o resultado no card reservado.',
          });
          agent.update({ sessionUpdate: 'subagent_state_update', subagentSessionId: 'discovery-native-child', state: 'completed' });
          const state = world!.router.snapshot();
          const card = state.cards.find((item) => item.id === childId)!;
          const done = state.columns.find((column) => column.workflowId === card.workflowId && column.category === 'done')!;
          world!.router.handle({ type: 'card.move', cardId: card.id, columnId: done.id, position: 0 }, { author: 'Gemini', source: 'ai' });
          world!.router.handle(
            { type: 'comment.add', cardId: card.id, body: 'Mapa Discovery documentado e verificado.' },
            { author: 'Gemini', source: 'ai' },
          );
          return { stopReason: 'end_turn' };
        },
      }),
    ];
    let nextAgent = 0;
    world = await cardWorld({
      profile: 'gemini',
      boardDefault: true,
      tools: CONDUTOR_TOOLS,
      snapshots: true,
      spawnAcp: (command, cwd, out) => agents[nextAgent++]!.spawn(command, cwd, out),
    });
    const repo = new StorySessionRepo(world.db);
    const sessions = new StorySessionController(repo);
    world.runnerDeps.storySessions = sessions;
    const comments = new CommentRepo(world.db);
    const orchestrator = new Orchestrator({
      repo: () => world!.router.work,
      state: () => world!.router.snapshot(),
      sessions: world.router.executions,
      starter: world.runner,
      storySessionsEnabled: () => true,
      ownsBoard: () => true,
      flush: async () => {},
      workspace: async () => world!.project,
      fingerprint: async () => 'initial-workspace',
      terminate: terminateProcessGroup,
      comment: (work, _outcome, body) => comments.add(work.storyId ?? work.cardId!, 'Faz AI', body, 'ai'),
      publish: () => {},
      log: (line) => world!.lines.push(line),
      gitMode: () => 'branch',
      otherProcesses: () => [],
    });
    await orchestrator.reconcileOnOpen();

    expect((await world.run()).outcome).toBe('done');
    expect(childId).toBeDefined();
    expect(repo.latestForStory(world.cardId)).toMatchObject({ nativeSessionId: 'sess-1', status: 'active' });

    const result = await orchestrator.drive(world.cardId, 'manual');
    expect(result.kind).toBe('started');
    await vi.waitFor(async () => {
      await orchestrator.settled();
      expect(world!.router.work.records().find((work) => work.cardId === childId)?.state).toBe('done');
    });

    const latest = repo.latestForStory(world.cardId)!;
    const linked = repo.listChildren(latest.id);
    const child = world.router.snapshot().cards.find((card) => card.id === childId)!;
    expect(agents[1]!.received.find((message) => message.method === 'session/load')?.params.sessionId).toBe('sess-1');
    expect(linked).toMatchObject([
      {
        intent: { workId: world.router.work.records().find((work) => work.cardId === childId)?.id, status: 'completed' },
        child: { nativeSessionId: 'discovery-native-child', status: 'completed' },
      },
    ]);
    expect(world.router.snapshot().columns.find((column) => column.id === child.columnId)?.category).toBe('done');
    expect(child.status).not.toBe('running');
    expect(world.router.snapshot().comments.some((comment) => comment.cardId === child.id && comment.body.includes('documentado'))).toBe(
      true,
    );
  }, 30_000);
});
