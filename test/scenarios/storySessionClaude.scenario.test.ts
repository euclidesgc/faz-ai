// A sessão da História pelo Claude Code (CLI): a principal é retomada por `--resume`, a filha de uma sub-tarefa
// vai no `--agents` com o escopo do card (ferramentas, MCPs, modelo) e só a principal pode lançá-la. O processo
// é falso e emite o `stream-json` no formato da saída real (fixture `claude-stream-json.jsonl`): a chamada de
// `Agent`, o resultado com `resolvedModel` e o `result` com `modelUsage`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessCommand } from '../../src/extension/headless';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import { StorySessionController } from '../../src/extension/storySessionController';
import { StorySessionRepo } from '../../src/extension/repositories/storySessionRepo';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';
import type { ModelOption } from '../../src/shared/models';

const SESSION = '11111111-2222-3333-4444-555555555555';
const CHILD_CALL = 'toolu_01FilhaDaHistoria';
const HAIKU: ModelOption = {
  id: 'claude:claude-haiku-4-5',
  tool: 'claude',
  model: 'claude-haiku-4-5',
  label: 'Haiku 4.5',
  efforts: [],
  defaultEffort: null,
  fromTool: true,
};

let world: CardWorld | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  world?.dispose();
  world = undefined;
});

const line = (event: Record<string, unknown>) => `${JSON.stringify({ session_id: SESSION, ...event })}\n`;
const init = () =>
  line({
    type: 'system',
    subtype: 'init',
    cwd: '/tmp/projeto',
    tools: ['Read', 'Glob', 'Grep', 'Agent'],
    mcp_servers: [{ name: 'faz-ai', status: 'connected' }],
    model: 'claude-opus-5-5',
    claude_code_version: '2.1.316',
  });
/** O `result` da CLI, com o bloco final do card (sem ele o runner pede o reparo, numa nova chamada). */
/** `modelUsage` e `total_cost_usd` são cumulativos da sessão retomada: cada chamada informa o total até ali. */
const result = (text: string, cumulative = { input: 10, output: 20, cost: 0.01 }) =>
  line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 1,
    result: `${text}\n\`\`\`json\n${JSON.stringify({ outcome: 'DONE', summary: text, failure_reason: null, pending: null })}\n\`\`\``,
    total_cost_usd: cumulative.cost,
    modelUsage: {
      'claude-opus-5-5': {
        inputTokens: cumulative.input,
        outputTokens: cumulative.output,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: cumulative.cost,
      },
    },
  });

/** A filha lançada e concluída no primeiro plano, como a CLI escreve quando o modelo não a põe em segundo plano. */
const childRun = (childName: string, resolvedModel: string) => [
  line({
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      model: 'claude-opus-5-5',
      id: 'msg_1',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: CHILD_CALL,
          name: 'Agent',
          input: { description: 'Executar a sub-tarefa', subagent_type: childName, prompt: 'Faça a sub-tarefa.' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  }),
  line({
    type: 'assistant',
    parent_tool_use_id: CHILD_CALL,
    subagent_type: childName,
    message: { model: resolvedModel, id: 'msg_2', role: 'assistant', content: [{ type: 'text', text: 'Trabalhando.' }], usage: {} },
  }),
  line({
    type: 'user',
    parent_tool_use_id: null,
    message: { role: 'user', content: [{ tool_use_id: CHILD_CALL, type: 'tool_result', content: 'Sub-tarefa concluída.' }] },
    tool_use_result: { status: 'completed', resolvedModel, agentId: 'a1' },
  }),
];

/** O processo falso: o roteiro de cada chamada, pela ordem; guarda os comandos para as asserções. */
function fakeClaude(scripts: ((command: HeadlessCommand) => string[])[]): { spawn: SpawnFn; commands: HeadlessCommand[] } {
  const commands: HeadlessCommand[] = [];
  const spawn: SpawnFn = (command, _cwd, out) => {
    commands.push(command);
    const script = scripts[commands.length - 1];
    if (!script) throw new Error('chamada da CLI além do roteiro');
    let exit: (code: number | null) => void = () => {};
    queueMicrotask(() => {
      for (const chunk of script(command)) out(chunk, 'stdout');
      exit(0);
    });
    return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
  };
  return { spawn, commands };
}

const agentsOf = (command: HeadlessCommand): Record<string, Record<string, unknown>> => {
  const inline = command.args[command.args.indexOf('--agents') + 1]!;
  const raw = command.tempFiles?.['agents.json'] ?? inline;
  return JSON.parse(raw) as Record<string, Record<string, unknown>>;
};

describe('cenário: a História pelo Claude Code retoma a sessão e delega a sub-tarefa a uma filha definida pelo board', () => {
  it('a principal volta por --resume, a filha vai no --agents com o escopo do card e o modelo efetivo é conferido', async () => {
    vi.stubEnv('FAZAI_INTERNAL_STORY_SESSIONS', '1');
    let childName = '';
    const cli = fakeClaude([
      // o turno da História: abre a sessão e responde
      () => [init(), result('Discovery coordenado.')],
      // a filha da sub-tarefa: a principal a lança com a ferramenta Agent e espera
      (command) => {
        const agents = agentsOf(command);
        childName = Object.keys(agents).find((name) => name.startsWith('filha-'))!;
        return [
          init(),
          ...childRun(childName, 'claude-haiku-4-5-20251001'),
          result('Sub-tarefa delegada e concluída.', { input: 30, output: 50, cost: 0.03 }),
        ];
      },
      // a segunda sub-tarefa: a principal termina sem lançar filha nenhuma
      () => [init(), result('Nada delegado.')],
    ]);
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, snapshots: true, spawn: cli.spawn });
    const repo = new StorySessionRepo(world.db);
    world.runnerDeps.storySessions = new StorySessionController(repo);

    expect((await world.run()).outcome).toBe('done');
    const opening = cli.commands[0]!;
    expect(opening.args).not.toContain('--resume');
    expect(opening.args).toContain('--agent');
    expect(opening.args[opening.args.indexOf('--agent') + 1]).toBe('condutor-do-board');
    // sem filha, a delegação segue negada na principal
    expect(opening.args.slice(opening.args.indexOf('--disallowedTools'))).toEqual(expect.arrayContaining(['Agent', 'Task']));
    expect(repo.latestForStory(world.cardId)).toMatchObject({ transport: 'cli', nativeSessionId: SESSION, status: 'active' });

    // a sub-tarefa, com um modelo próprio no card
    const state = world.router.snapshot();
    const phase = state.cards.find((card) => card.id === world!.cardId)!.columnId;
    const childFlow = state.workflows.find((workflow) => workflow.kind === 'child')!;
    const subtaskColumn = state.columns.find((column) => column.workflowId === childFlow.id && column.category === 'open')!;
    const subtaskType = state.cardTypes.find((type) => type.defaultWorkflowId === childFlow.id)!;
    const modelField = state.fieldDefs.find((field) => field.kind === 'model')!;
    world.router.handle({ type: 'settings.models.set', catalog: [...state.board.modelCatalog, HAIKU] });
    const childId = world.router.createCard({
      typeId: subtaskType.id,
      columnId: subtaskColumn.id,
      parentId: world.cardId,
      title: 'Subtarefa de cenário',
    });
    world.router.handle({ type: 'field.setValue', cardId: childId, fieldId: modelField.id, value: HAIKU.id });
    const claim = world.router.work.claim(
      { key: `scenario:${childId}`, kind: 'subtask', storyId: world.cardId, cardId: childId, columnId: phase },
      world.router.executions.owner,
      world.project,
    )!;
    const end = await new Promise<AiRunEnd>((resolve) => {
      world!.runner.start(childId, {
        origin: 'manual',
        mode: 'phase',
        workId: claim.work.id,
        token: claim.token,
        advice: ['Você é a filha nativa delegada para a sub-tarefa.'],
        onExit: resolve,
      });
    });
    expect(end.error?.message).toBeUndefined();
    expect(end.outcome).toBe('done');

    const delegating = cli.commands[1]!;
    expect(delegating.args).toContain('--resume');
    expect(delegating.args[delegating.args.indexOf('--resume') + 1]).toBe(SESSION);
    expect(delegating.env?.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS).toBe('1');
    // a delegação fica liberada só para a filha autorizada: `Agent` solto não é negado, os embutidos saem pelo ambiente
    const denied = delegating.args.includes('--disallowedTools')
      ? delegating.args.slice(delegating.args.indexOf('--disallowedTools') + 1)
      : [];
    expect(denied).not.toContain('Agent');
    const agents = agentsOf(delegating);
    expect(childName).toMatch(/^filha-\d+$/);
    expect(agents['condutor-do-board']!.tools).toEqual(expect.arrayContaining([`Agent(${childName})`, 'Read']));
    expect(agents['condutor-do-board']!.tools).not.toContain('Agent');
    expect(agents[childName]).toMatchObject({
      model: 'claude-haiku-4-5',
      mcpServers: ['faz-ai'],
      disallowedTools: expect.arrayContaining(['Agent', 'Task']),
    });
    expect(agents[childName]!.prompt).toContain('Você é a filha nativa delegada para a sub-tarefa.');
    // o pedido da unidade foi para a filha; a principal recebe só a ordem de delegar a ela
    expect(delegating.stdin).toContain(`subagent_type "${childName}"`);
    expect(delegating.stdin).not.toContain('Você é a filha nativa delegada');
    // o consumo gravado é só o desta execução: o acumulado da sessão (30/50, US$ 0,03) menos o da anterior (10/20, US$ 0,01)
    expect(world.aiRun()).toMatchObject({ model: 'claude-haiku-4-5', inputTokens: 20, outputTokens: 30 });
    expect(world.aiRun()!.costUsd).toBeCloseTo(0.02, 6);
    expect(repo.latestForStory(world.cardId)!.checkpoint.sessionCumulative).toMatchObject({
      inputTokens: 30,
      outputTokens: 50,
      costUsd: 0.03,
    });
    // a filha autorizada não é desvio na conferência
    expect(world.lines.filter((line) => line.includes('Conferência:')).at(-1)).toContain('sem desvio');
    expect(repo.listChildren(repo.latestForStory(world.cardId)!.id)).toMatchObject([
      {
        intent: { workId: claim.work.id, status: 'completed', config: { childAgent: childName, model: { name: 'claude-haiku-4-5' } } },
        child: {
          nativeSessionId: CHILD_CALL,
          transport: 'cli',
          status: 'completed',
          result: { modelVerified: true, effectiveModel: 'claude-haiku-4-5-20251001' },
        },
      },
    ]);

    // a sub-tarefa sem filha não conclui: a sessão vai para reconciliação e o card volta para a pessoa
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
    const missing = await new Promise<AiRunEnd>((resolve) => {
      world!.runner.start(secondChildId, {
        origin: 'manual',
        mode: 'phase',
        workId: secondClaim.work.id,
        token: secondClaim.token,
        onExit: resolve,
      });
    });
    expect(missing.outcome).toBe('failed');
    expect(repo.latestForStory(world.cardId)?.status).toBe('reconciling');
  });

  it('recusa a filha que a principal lançou com outro tipo e encerra a execução', async () => {
    vi.stubEnv('FAZAI_INTERNAL_STORY_SESSIONS', '1');
    const cli = fakeClaude([
      () => [init(), result('Discovery coordenado.')],
      // a principal lança um subagente que não é a filha autorizada
      () => [init(), ...childRun('outro-agente', 'claude-haiku-4-5-20251001'), result('Delegado a outro.')],
    ]);
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, snapshots: true, spawn: cli.spawn });
    const repo = new StorySessionRepo(world.db);
    world.runnerDeps.storySessions = new StorySessionController(repo);
    expect((await world.run()).outcome).toBe('done');

    const state = world.router.snapshot();
    const phase = state.cards.find((card) => card.id === world!.cardId)!.columnId;
    const childFlow = state.workflows.find((workflow) => workflow.kind === 'child')!;
    const subtaskColumn = state.columns.find((column) => column.workflowId === childFlow.id && column.category === 'open')!;
    const subtaskType = state.cardTypes.find((type) => type.defaultWorkflowId === childFlow.id)!;
    const childId = world.router.createCard({ typeId: subtaskType.id, columnId: subtaskColumn.id, parentId: world.cardId, title: 'Sub' });
    const claim = world.router.work.claim(
      { key: `scenario:${childId}`, kind: 'subtask', storyId: world.cardId, cardId: childId, columnId: phase },
      world.router.executions.owner,
      world.project,
    )!;
    const end = await new Promise<AiRunEnd>((resolve) => {
      world!.runner.start(childId, { origin: 'manual', mode: 'phase', workId: claim.work.id, token: claim.token, onExit: resolve });
    });
    expect(end.outcome).toBe('failed');
    expect(world.lines.join('\n')).toContain('Delegação nativa incompatível');
    expect(repo.latestForStory(world.cardId)?.status).toBe('reconciling');
  });
});
