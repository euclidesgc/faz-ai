import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FakeAgent } from '../fakes/acpAgent';
import { StorySessionController } from '../../src/extension/storySessionController';
import { StorySessionRepo } from '../../src/extension/repositories/storySessionRepo';
import { Orchestrator } from '../../src/extension/orchestrator';
import { CommentRepo } from '../../src/extension/repositories/commentRepo';
import { storyPlan } from '../../src/shared/orchestration';
import { terminateProcessGroup } from '../../src/extension/processIdentity';
import { cardWorld, CONDUTOR_TOOLS, GEMINI_MODEL, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
let sessionOrchestrator: Orchestrator | undefined;
const loadedNativeChild = (params: { sessionId?: string }) =>
  params.sessionId?.startsWith('native-')
    ? {
        sessionId: params.sessionId,
        configOptions: [{ id: 'model', name: 'Modelo', category: 'model', type: 'select', currentValue: GEMINI_MODEL.model }],
      }
    : { sessionId: params.sessionId };
afterEach(async () => {
  await sessionOrchestrator?.settled();
  vi.unstubAllEnvs();
  sessionOrchestrator = undefined;
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
    world.router.handle({ type: 'comment.add', cardId: world.cardId, body: 'Prioridade inicial.' }, { author: 'Pessoa', source: 'human' });
    const firstHuman = world.router.snapshot().comments.at(-1)!.id;

    expect((await world.run()).outcome).toBe('done');
    const snapshot = world.router.snapshot();
    const parent = snapshot.workflows.find((workflow) => workflow.kind === 'parent')!;
    const nextPhase = snapshot.columns
      .filter((column) => column.workflowId === parent.id && column.category === 'open' && column.aiActive)
      .sort((left, right) => left.position - right.position)[1]!;
    world.router.handle({ type: 'settings.models.set', catalog: [GEMINI_MODEL, { ...GEMINI_MODEL, id: 'gemini:other', model: 'other' }] });
    world.router.handle({ type: 'settings.column.update', columnId: nextPhase.id, patch: { phaseModel: 'gemini:other' } });
    world.router.handle({ type: 'card.move', cardId: world.cardId, columnId: nextPhase.id, position: 0 });
    world.router.handle({ type: 'comment.add', cardId: world.cardId, body: 'Ajuste para o PRD.' }, { author: 'Pessoa', source: 'human' });
    const secondHuman = world.router.snapshot().comments.at(-1)!.id;
    expect((await world.run()).outcome).toBe('done');

    expect(agents[0]!.methods()).toContain('session/new');
    expect(agents[1]!.methods()).toContain('session/load');
    expect(agents[1]!.received.find((message) => message.method === 'session/load')?.params.sessionId).toBe('sess-1');
    expect(agents[1]!.command?.args).toContain(GEMINI_MODEL.model);
    expect(repo.latestForStory(world.cardId)).toMatchObject({ generation: 1, nativeSessionId: 'sess-1', status: 'active' });
    const secondPrompt = agents[1]!.received.find((message) => message.method === 'session/prompt')?.params.prompt[0].text as string;
    expect(secondPrompt).toContain(`[${secondHuman}]`);
    expect(secondPrompt).not.toContain(`[${firstHuman}]`);
    expect(world.comments()).toEqual(expect.arrayContaining(['Discovery pronto.', 'PRD pronto.']));
  });

  it('retoma a sessão da História para uma sub-tarefa e exige filha ACP concluída', async () => {
    vi.stubEnv('FAZAI_INTERNAL_STORY_SESSIONS', '1');
    const agents = [
      new FakeAgent({ onPrompt: () => ({ stopReason: 'end_turn' }) }),
      new FakeAgent({
        sessionLoad: (params) =>
          params.sessionId === 'native-child'
            ? {
                sessionId: params.sessionId,
                configOptions: [{ id: 'model', name: 'Modelo', category: 'model', type: 'select', currentValue: 'gemini-2.5-flash' }],
              }
            : loadedNativeChild(params),
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
        sessionLoad: loadedNativeChild,
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
    const modelField = state.fieldDefs.find((field) => field.kind === 'model')!;
    const specialistModel = { ...GEMINI_MODEL, id: 'gemini:gemini-2.5-flash', model: 'gemini-2.5-flash', label: 'Gemini Flash' };
    world.router.handle({ type: 'settings.models.set', catalog: [...state.board.modelCatalog, specialistModel] });
    world.router.handle({ type: 'field.setValue', cardId: childId, fieldId: modelField.id, value: specialistModel.id });
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
    expect(agents[1]!.command?.args).toContain(GEMINI_MODEL.model);
    expect(agents[1]!.command?.args).not.toContain(specialistModel.model);
    expect(world.aiRun()).toMatchObject({ model: specialistModel.model });
    expect(
      agents[1]!.received.find((message) => message.method === 'session/prompt' && message.params.prompt[0].text !== '/mcp')?.params
        .prompt[0].text,
    ).toContain(`Solicite à filha o modelo ${specialistModel.model}`);
    expect(repo.listChildren(repo.latestForStory(world.cardId)!.id)).toMatchObject([
      {
        intent: {
          workId: claim.work.id,
          status: 'completed',
          config: { model: { name: specialistModel.model } },
        },
        child: {
          nativeSessionId: 'native-child',
          status: 'completed',
          result: { modelVerified: true, effectiveModel: specialistModel.model },
        },
      },
    ]);

    const secondChildId = world.router.createCard({
      typeId: subtaskType.id,
      columnId: subtaskColumn.id,
      parentId: world.cardId,
      title: 'Subtarefa sem filha',
    });
    world.router.handle({ type: 'field.setValue', cardId: secondChildId, fieldId: modelField.id, value: GEMINI_MODEL.id });
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
        sessionLoad: loadedNativeChild,
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

describe('cenário: falha controlada, diagnóstico, decisão e correção ficam na sessão da História', () => {
  it('duas implementações, revisão reprovada, diagnóstico com decisão humana, correção e nova revisão', async () => {
    vi.stubEnv('FAZAI_INTERNAL_STORY_SESSIONS', '1');
    const acceptance = 'A função total(a, b) devolve a soma dos dois números.';
    const titles = ['Implementação da função total', 'Teste de aceitação da função total'];
    const childIds: Record<string, string> = {};
    const reviewIds: string[] = [];
    const childModelBySession = new Map<string, string>();
    const roleNames = [
      'parent',
      'impl-1',
      'impl-2',
      'close-implementation',
      'review-1',
      'close-review-1',
      'diagnosis',
      'parent-after-decision',
      'correction',
      'close-correction',
      'review-2',
      'close-review-2',
      'post-review',
    ];
    let nextRole = 0;

    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Scenario', '-c', 'user.email=scenario@example.test', ...args], {
        cwd: world!.project,
        encoding: 'utf8',
      }).trim();
    const state = () => world!.router.snapshot();
    const phaseId = (name: string) => {
      const story = state().cards.find((card) => card.id === world!.cardId)!;
      const column = state().columns.find((item) => item.workflowId === story.workflowId && item.name === name);
      if (!column) throw new Error(`A coluna ${name} não existe no cenário.`);
      return column.id;
    };
    const fieldId = (name: string) => {
      const field = state().fieldDefs.find((item) => item.name === name);
      if (!field) throw new Error(`O campo ${name} não existe no cenário.`);
      return field.id;
    };
    const finishCard = (id: string, comment: string) => {
      const current = state();
      const card = current.cards.find((item) => item.id === id)!;
      const done = current.columns.find((item) => item.workflowId === card.workflowId && item.category === 'done')!;
      world!.router.handle({ type: 'card.move', cardId: id, columnId: done.id, position: 0 }, { author: 'Gemini', source: 'ai' });
      world!.router.handle({ type: 'comment.add', cardId: id, body: comment }, { author: 'Gemini', source: 'ai' });
    };
    const createTask = (title: string, phase: string, description: string, options: { reviewer?: boolean; dependsOn?: string[] } = {}) => {
      const current = state();
      const childFlow = current.workflows.find((workflow) => workflow.kind === 'child')!;
      const column = current.columns
        .filter((item) => item.workflowId === childFlow.id && item.category === 'open')
        .sort((left, right) => left.position - right.position)[0]!;
      const type = current.cardTypes.find((item) => item.defaultWorkflowId === childFlow.id)!;
      const id = world!.router.createCard({ typeId: type.id, columnId: column.id, parentId: world!.cardId, title });
      world!.router.handle({ type: 'card.update', cardId: id, patch: { description } });
      world!.router.handle(
        { type: 'field.setValue', cardId: id, fieldId: fieldId('Fase'), value: phase },
        { author: 'Gemini', source: 'ai' },
      );
      world!.router.handle(
        {
          type: 'field.setValue',
          cardId: id,
          fieldId: state().fieldDefs.find((field) => field.kind === 'model')!.id,
          value: GEMINI_MODEL.id,
        },
        { author: 'Gemini', source: 'ai' },
      );
      if (options.reviewer) {
        const profile = state().board.execProfiles.find((item) => item.name.toLowerCase() === 'revisor-de-codigo');
        if (!profile) throw new Error('O perfil revisor-de-codigo não foi criado.');
        world!.router.handle({ type: 'card.execProfile.set', cardId: id, profileId: profile.id });
        world!.router.applyReviewerModelToNewCard(id, true);
      }
      for (const dependency of options.dependsOn ?? [])
        world!.router.handle({ type: 'link.add', fromId: dependency, toId: id, kind: 'precedes' });
      if (options.reviewer) world!.router.appendReviewRoundBlock(id);
      return id;
    };
    const createImplementations = () => {
      childIds.impl1 = createTask(
        titles[0]!,
        'Implementação',
        `### Objetivo\nImplementar total(a, b).\n\n### Pronto quando\n${acceptance}\n\n### Pode tocar\n- src/calculator.js\n\n### Não pode tocar\n- aceite original`,
      );
      childIds.impl2 = createTask(
        titles[1]!,
        'Implementação',
        `### Objetivo\nCriar um teste de aceitação.\n\n### Pronto quando\n${acceptance}\n\n### Pode tocar\n- test/calculator.test.js\n\n### Não pode tocar\n- aceite original`,
        { dependsOn: [childIds.impl1] },
      );
    };
    const createReviewer = (round: number, dependencies: string[]) => {
      const id = createTask(
        `Revisão independente ${round}`,
        'Revisão',
        `### Objetivo\nRevise a implementação contra o aceite original: ${acceptance}\n\n### Pronto quando\nRegistre achados, itens não checados e um veredito.\n\n### Pode tocar\n- src/calculator.js\n- test/calculator.test.js\n\n### Não pode tocar\n- aceite original`,
        { reviewer: true, dependsOn: dependencies },
      );
      reviewIds.push(id);
      return id;
    };

    const agents = roleNames.map(
      (role) =>
        new FakeAgent({
          sessionLoad: (params) => {
            const modelValue = childModelBySession.get(params.sessionId);
            return {
              sessionId: params.sessionId,
              ...(modelValue
                ? {
                    configOptions: [
                      {
                        id: 'model',
                        name: 'Modelo',
                        category: 'model',
                        type: 'select',
                        currentValue: modelValue.slice(modelValue.indexOf(':') + 1).split('@')[0],
                      },
                    ],
                  }
                : {}),
            };
          },
          onPrompt: (agent, params) => {
            if (params.prompt?.[0]?.text === '/mcp') {
              agent.update({
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: '**MCP servers:** 1 (1 connected)\n\n**Connected**\n- `faz-ai`: 1 tool\n' },
              });
              return { stopReason: 'end_turn' };
            }
            if (role === 'parent') {
              createImplementations();
            } else if (role === 'impl-1' || role === 'impl-2' || role === 'correction') {
              const cardId = role === 'impl-1' ? childIds.impl1 : role === 'impl-2' ? childIds.impl2 : childIds.correction;
              const card = state().cards.find((item) => item.id === cardId)!;
              const modelField = state().fieldDefs.find((field) => field.kind === 'model')!;
              childModelBySession.set(
                `native-${role}`,
                state().fieldValues.find((value) => value.cardId === card.id && value.fieldId === modelField.id)?.value as string,
              );
              agent.update({
                sessionUpdate: 'subagent_spawned',
                subagentSessionId: `native-${role}`,
                name: 'especialista',
                task: `Executar ${card.title}`,
              });
              agent.update({ sessionUpdate: 'subagent_state_update', subagentSessionId: `native-${role}`, state: 'completed' });
              fs.mkdirSync(path.join(world!.project, 'src'), { recursive: true });
              if (role === 'impl-1')
                fs.writeFileSync(path.join(world!.project, 'src/calculator.js'), 'export const total = (a, b) => a - b;\n');
              if (role === 'impl-2') {
                fs.mkdirSync(path.join(world!.project, 'test'), { recursive: true });
                fs.writeFileSync(path.join(world!.project, 'test/calculator.test.js'), 'expect(total(2, 3)).toBe(5);\n');
              }
              if (role === 'correction')
                fs.writeFileSync(path.join(world!.project, 'src/calculator.js'), 'export const total = (a, b) => a + b;\n');
              finishCard(card.id, `Verificação concluída para: ${acceptance}`);
            } else if (role === 'close-implementation') {
              world!.router.handle({
                type: 'harness.agent.create',
                input: {
                  name: 'revisor-de-codigo',
                  description: 'Revisão independente.',
                  body: 'Revise o diff.',
                  model: '',
                  tools: ['Read'],
                  deniedTools: [],
                  skills: [],
                  mcp: [],
                },
              });
              childIds.review1 = createReviewer(1, [childIds.impl1!, childIds.impl2!]);
              world!.router.handle(
                { type: 'card.move', cardId: world!.cardId, columnId: phaseId('Revisão'), position: 0 },
                { author: 'Gemini', source: 'ai' },
              );
              const story = state().cards.find((item) => item.id === world!.cardId)!;
              const plan = storyPlan(state(), story, { byCard: new Map() }, new Set(), true);
              if (plan.kind !== 'units' || plan.units[0]?.cardId !== childIds.review1)
                throw new Error(
                  `A revisão não entrou na fila do board: ${JSON.stringify({ story: story.columnId, review: childIds.review1, plan })}`,
                );
            } else if (role === 'review-1' || role === 'review-2') {
              const id = role === 'review-1' ? childIds.review1 : childIds.review2;
              const review = state().cards.find((item) => item.id === id)!;
              const modelField = state().fieldDefs.find((field) => field.kind === 'model')!;
              childModelBySession.set(
                `native-${role}`,
                state().fieldValues.find((value) => value.cardId === review.id && value.fieldId === modelField.id)?.value as string,
              );
              agent.update({
                sessionUpdate: 'subagent_spawned',
                subagentSessionId: `native-${role}`,
                name: 'revisor',
                task: `Revisar ${review.title}`,
              });
              agent.update({ sessionUpdate: 'subagent_state_update', subagentSessionId: `native-${role}`, state: 'completed' });
              const verdict = role === 'review-1' ? 'REPROVADO' : 'APROVADO';
              const report =
                role === 'review-1'
                  ? '- A1 [bloqueia] src/calculator.js:1: usa subtração, mas o aceite original exige soma.\nNão checado: nada\nVEREDITO: REPROVADO'
                  : '- A1 [bloqueia] src/calculator.js:1: usa subtração [RESOLVIDO]\nNão checado: nada\nVEREDITO: APROVADO';
              const closed = world!.router.closeReviewSubtask(review.id, report);
              if (!closed.ok) throw new Error(closed.problem);
              finishCard(review.id, report);
              expect(verdict).toMatch(/REPROVADO|APROVADO/);
            } else if (role === 'close-review-1') {
              childIds.diagnosis = createTask(
                'Diagnosticar o achado A1',
                'Revisão',
                `### Objetivo\nConfirmar a causa de A1.\n\n### Pronto quando\nRelatar causa e alternativa de correção.\n\n### Pode tocar\n- src/calculator.js\n\n### Não pode tocar\n- aceite original`,
                { dependsOn: [childIds.review1!] },
              );
            } else if (role === 'diagnosis') {
              const card = state().cards.find((item) => item.id === childIds.diagnosis)!;
              const modelField = state().fieldDefs.find((field) => field.kind === 'model')!;
              childModelBySession.set(
                'native-diagnosis',
                state().fieldValues.find((value) => value.cardId === card.id && value.fieldId === modelField.id)?.value as string,
              );
              agent.update({
                sessionUpdate: 'subagent_spawned',
                subagentSessionId: 'native-diagnosis',
                name: 'diagnostico',
                task: `Diagnosticar ${card.title}`,
              });
              agent.update({ sessionUpdate: 'subagent_state_update', subagentSessionId: 'native-diagnosis', state: 'completed' });
              world!.router.handle(
                {
                  type: 'card.status.set',
                  cardId: world!.cardId,
                  status: 'waiting_answer',
                  note: `Diagnóstico: A1 ocorre porque total usa subtração. O aceite original continua sendo: ${acceptance}. Posso corrigir essa função?`,
                },
                { author: 'Gemini', source: 'ai' },
              );
              finishCard(card.id, 'Causa confirmada: a função usa subtração no lugar de soma.');
            } else if (role === 'parent-after-decision') {
              expect(
                state().comments.some(
                  (comment) => comment.cardId === world!.cardId && comment.source === 'human' && comment.body.includes('Pode corrigir'),
                ),
              ).toBe(true);
              childIds.correction = createTask(
                'Corrigir a função total conforme A1',
                'Revisão',
                `### Objetivo\nCorrigir A1 sem alterar o aceite.\n\n### Pronto quando\n${acceptance}\n\n### Pode tocar\n- src/calculator.js\n\n### Não pode tocar\n- critérios de aceite originais`,
                { dependsOn: [childIds.diagnosis!] },
              );
            } else if (role === 'close-correction') {
              childIds.review2 = createReviewer(2, [childIds.correction!]);
            } else if (role === 'close-review-2') {
              const story = state().cards.find((item) => item.id === world!.cardId)!;
              const next = state()
                .columns.filter(
                  (column) =>
                    column.workflowId === story.workflowId &&
                    column.position > state().columns.find((item) => item.id === story.columnId)!.position,
                )
                .sort((left, right) => left.position - right.position)[0]!;
              world!.router.handle(
                { type: 'card.move', cardId: story.id, columnId: next.id, position: 0 },
                { author: 'Gemini', source: 'ai' },
              );
            }
            return { stopReason: 'end_turn' };
          },
        }),
    );
    world = await cardWorld({
      profile: 'gemini',
      tools: CONDUTOR_TOOLS,
      snapshots: true,
      spawnAcp: (command, cwd, out) => agents[nextRole++]!.spawn(command, cwd, out),
    });
    const geminiFlash = {
      ...GEMINI_MODEL,
      id: 'gemini:gemini-2.5-flash',
      model: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
    };
    const geminiReviewer = {
      ...GEMINI_MODEL,
      id: 'gemini:gemini-3.0-pro',
      model: 'gemini-3.0-pro',
      label: 'Gemini 3.0 Pro',
    };
    world.router.handle({ type: 'settings.models.set', catalog: [geminiFlash, GEMINI_MODEL, geminiReviewer] });
    world.router.handle({ type: 'models.ladder.set', tool: 'gemini', ladder: [geminiFlash.id, GEMINI_MODEL.id, geminiReviewer.id] });
    const board = state();
    const implementation = board.columns.find(
      (column) =>
        column.workflowId === board.cards.find((card) => card.id === world!.cardId)!.workflowId && column.name === 'Implementação',
    )!;
    const acceptanceDescription = `## Aceite original\n${acceptance}`;
    world.router.handle({ type: 'card.update', cardId: world.cardId, patch: { description: acceptanceDescription } });
    world.router.handle({ type: 'card.move', cardId: world.cardId, columnId: implementation.id, position: 0 });
    git('init', '-q');
    fs.mkdirSync(path.join(world.project, 'src'), { recursive: true });
    fs.writeFileSync(path.join(world.project, 'src/calculator.js'), 'export const total = (a, b) => a - b;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base with controlled defect');

    const sessionRepo = new StorySessionRepo(world.db);
    world.runnerDeps.storySessions = new StorySessionController(sessionRepo);
    sessionOrchestrator = new Orchestrator({
      repo: () => world!.router.work,
      state,
      sessions: world.router.executions,
      starter: world.runner,
      storySessionsEnabled: () => true,
      ownsBoard: () => true,
      flush: async () => {},
      workspace: async () => world!.project,
      fingerprint: async () => 'controlled-r4',
      terminate: terminateProcessGroup,
      comment: (work, outcome, body) => new CommentRepo(world!.db).add(work.storyId ?? work.cardId!, 'Faz AI', body, 'ai'),
      publish: () => {},
      log: (line) => world!.lines.push(line),
      gitMode: () => 'branch',
      otherProcesses: () => [],
    });
    await sessionOrchestrator.reconcileOnOpen();

    expect((await world.run()).outcome).toBe('done');
    expect(Object.keys(childIds)).toEqual(expect.arrayContaining(['impl1', 'impl2']));
    await sessionOrchestrator.drive(world.cardId, 'manual');
    await vi.waitFor(
      async () => {
        await sessionOrchestrator!.settled();
        expect(state().cards.find((card) => card.id === world!.cardId)?.columnId).toBe(phaseId('Revisão'));
        expect(sessionRepo.listChildren(sessionRepo.latestForStory(world!.cardId)!.id).length).toBeGreaterThanOrEqual(3);
      },
      { timeout: 30_000, interval: 25 },
    );

    await sessionOrchestrator.settled();
    const diagnosis = state().cards.find((card) => card.id === childIds.diagnosis)!;
    expect(state().columns.find((column) => column.id === diagnosis.columnId)?.category).toBe('done');
    expect(state().cards.find((card) => card.id === world!.cardId)?.status).toBe('waiting_answer');
    const unchangedAcceptance = state().cards.find((card) => card.id === world!.cardId)!.description;
    expect(unchangedAcceptance).toBe(acceptanceDescription);
    world.router.handle(
      { type: 'comment.add', cardId: world.cardId, body: 'Pode corrigir conforme o aceite original.' },
      { author: 'Pessoa', source: 'human' },
    );
    expect((await world.run()).outcome).toBe('done');
    await sessionOrchestrator.drive(world.cardId, 'manual');
    await vi.waitFor(
      async () => {
        await sessionOrchestrator!.settled();
        expect(state().cards.find((card) => card.id === childIds.review2)?.columnId).toBeDefined();
        expect(fs.readFileSync(path.join(world!.project, 'src/calculator.js'), 'utf8')).toContain('a + b');
        expect(state().cards.find((card) => card.id === world!.cardId)?.columnId).not.toBe(phaseId('Revisão'));
      },
      { timeout: 30_000, interval: 25 },
    );

    const latestSession = sessionRepo.latestForStory(world.cardId)!;
    expect(latestSession.nativeSessionId).toBe('sess-1');
    expect(sessionRepo.listChildren(latestSession.id).map(({ child }) => child?.nativeSessionId)).toEqual(
      expect.arrayContaining([
        'native-impl-1',
        'native-impl-2',
        'native-review-1',
        'native-diagnosis',
        'native-correction',
        'native-review-2',
      ]),
    );
    expect(state().links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromId: childIds.impl1, toId: childIds.impl2, kind: 'precedes' }),
        expect.objectContaining({ fromId: childIds.impl1, toId: childIds.review1, kind: 'precedes' }),
        expect.objectContaining({ fromId: childIds.impl2, toId: childIds.review1, kind: 'precedes' }),
        expect.objectContaining({ fromId: childIds.diagnosis, toId: childIds.correction, kind: 'precedes' }),
        expect.objectContaining({ fromId: childIds.correction, toId: childIds.review2, kind: 'precedes' }),
      ]),
    );
    expect(state().cards.find((card) => card.id === world!.cardId)?.description).toBe(acceptanceDescription);
    const modelField = state().fieldDefs.find((field) => field.kind === 'model')!;
    for (const reviewId of reviewIds)
      expect(state().fieldValues.find((value) => value.cardId === reviewId && value.fieldId === modelField.id)?.value).toBe(
        'gemini:gemini-3.0-pro',
      );
    expect(world.comments().join('\n')).toContain('Veredito da revisão: REPROVADO.');
    expect(world.comments().join('\n')).toContain('Veredito da revisão: APROVADO.');
    expect(reviewIds).toEqual([childIds.review1, childIds.review2]);
  }, 120_000);
});
