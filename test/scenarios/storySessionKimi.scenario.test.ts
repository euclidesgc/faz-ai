// A sessão da História pelo Kimi Code (CLI): a principal nasce com `--agent-file` e volta com `--session <id>`;
// a filha de uma sub-tarefa é um agente que o board grava em `.kimi-code/agents/` do projeto só durante a execução,
// e a principal a lança pela ferramenta `Agent`. O processo é falso e emite o `stream-json` no formato da saída real
// da 2.4.1 (sonda de 2026-11-02): a chamada de `Agent` e o resultado com `actual_subagent_type` e `status`.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessCommand } from '../../src/extension/headless';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import { StorySessionController } from '../../src/extension/storySessionController';
import { StorySessionRepo } from '../../src/extension/repositories/storySessionRepo';
import { cardWorld, CONDUTOR_TOOLS, KIMI_MODEL, type CardWorld } from './cardWorld';

const SESSION = 'session_0003-0000-4000-8000-000000000003';
const CHILD_CALL = 'tool_FilhaDaHistoria';
const DONE = JSON.stringify({ outcome: 'DONE', summary: 'Pronto.', failure_reason: null, pending: null });

let world: CardWorld | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  world?.dispose();
  world = undefined;
});

const line = (event: Record<string, unknown>) => `${JSON.stringify(event)}\n`;
const version = () => line({ role: 'meta', type: 'system.version', version: '2.4.1' });
const hint = () => line({ role: 'meta', type: 'session.resume_hint', session_id: SESSION, command: `kimi -r ${SESSION}` });
const answer = (text: string) => line({ role: 'assistant', content: `${text}\n\`\`\`json\n${DONE}\n\`\`\`` });
const childRun = (childName: string, actual = childName) => [
  line({
    role: 'assistant',
    content: 'Delegando.',
    tool_calls: [
      {
        type: 'function',
        id: CHILD_CALL,
        function: {
          name: 'Agent',
          arguments: JSON.stringify({ prompt: 'Faça a sub-tarefa.', description: 'Sub-tarefa', subagent_type: childName }),
        },
      },
    ],
  }),
  line({
    role: 'tool',
    tool_call_id: CHILD_CALL,
    content: `agent_id: agent-0\nactual_subagent_type: ${actual}\nstatus: completed\nstop_reason: completed\n\n[summary]\nFeito.`,
  }),
];

/** O processo falso: cada roteiro recebe o comando e o que havia em `.kimi-code/agents/` do projeto na hora. */
function fakeKimi(scripts: ((command: HeadlessCommand, agents: Record<string, string>) => string[])[]): {
  spawn: SpawnFn;
  commands: HeadlessCommand[];
  agentsSeen: Record<string, string>[];
} {
  const commands: HeadlessCommand[] = [];
  const agentsSeen: Record<string, string>[] = [];
  const spawn: SpawnFn = (command, cwd, out) => {
    commands.push(command);
    const dir = path.join(cwd, '.kimi-code', 'agents');
    const agents = fs.existsSync(dir)
      ? Object.fromEntries(fs.readdirSync(dir).map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')]))
      : {};
    agentsSeen.push(agents);
    const script = scripts[commands.length - 1];
    if (!script) throw new Error('chamada da CLI além do roteiro');
    let exit: (code: number | null) => void = () => {};
    queueMicrotask(() => {
      for (const chunk of script(command, agents)) out(chunk, 'stdout');
      exit(0);
    });
    return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
  };
  return { spawn, commands, agentsSeen };
}

describe('cenário: a História pelo Kimi Code retoma a sessão e delega a sub-tarefa a uma filha gravada no projeto', () => {
  it('a principal nasce com --agent-file e volta com --session; a filha existe só durante a execução e é conferida pelo nome', async () => {
    vi.stubEnv('FAZAI_INTERNAL_STORY_SESSIONS', '1');
    let childName = '';
    const cli = fakeKimi([
      () => [version(), answer('Discovery coordenado.'), hint()],
      (_command, agents) => {
        childName = Object.keys(agents)
          .find((file) => file.startsWith('filha-'))!
          .replace(/\.md$/, '');
        return [version(), ...childRun(childName), answer('Delegado e concluído.'), hint()];
      },
      () => [version(), answer('Nada delegado.'), hint()],
    ]);
    world = await cardWorld({ profile: 'kimi', tools: CONDUTOR_TOOLS, snapshots: true, spawn: cli.spawn });
    const repo = new StorySessionRepo(world.db);
    world.runnerDeps.storySessions = new StorySessionController(repo);

    expect((await world.run()).outcome).toBe('done');
    const opening = cli.commands[0]!;
    expect(opening.args).toContain('--agent-file');
    expect(opening.args).not.toContain('--session');
    expect(opening.env?.KIMI_CODE_TRUST_WORKSPACE).toBe('1');
    const principal = opening.tempFiles?.['condutor.md'] ?? '';
    expect(principal).toContain('name: "condutor-da-historia"');
    expect(principal).toContain('subagents: ["*"]');
    expect(repo.latestForStory(world.cardId)).toMatchObject({ transport: 'cli', nativeSessionId: SESSION, status: 'active' });

    const state = world.router.snapshot();
    const phase = state.cards.find((card) => card.id === world!.cardId)!.columnId;
    const childFlow = state.workflows.find((workflow) => workflow.kind === 'child')!;
    const subtaskColumn = state.columns.find((column) => column.workflowId === childFlow.id && column.category === 'open')!;
    const subtaskType = state.cardTypes.find((type) => type.defaultWorkflowId === childFlow.id)!;
    const modelField = state.fieldDefs.find((field) => field.kind === 'model')!;
    const childId = world.router.createCard({
      typeId: subtaskType.id,
      columnId: subtaskColumn.id,
      parentId: world.cardId,
      title: 'Subtarefa de cenário',
    });
    // o mesmo modelo da sessão: a filha do Kimi Code herda o modelo da principal
    world.router.handle({ type: 'field.setValue', cardId: childId, fieldId: modelField.id, value: KIMI_MODEL.id });
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
    expect(delegating.args).toContain('--session');
    expect(delegating.args[delegating.args.indexOf('--session') + 1]).toBe(SESSION);
    expect(delegating.args).not.toContain('--agent-file');
    expect(childName).toMatch(/^filha-\d+$/);
    const childFile = cli.agentsSeen[1]![`${childName}.md`]!;
    expect(childFile).toContain(`name: "${childName}"`);
    expect(childFile).toContain('"mcp__faz-ai__*"');
    expect(childFile).toContain('Você é a filha nativa delegada para a sub-tarefa.');
    expect(childFile).toMatch(/disallowedTools: \[.*"Agent".*\]/);
    // o arquivo da filha morre com a execução
    expect(fs.existsSync(path.join(world.project, '.kimi-code', 'agents'))).toBe(false);
    expect(delegating.args[1]).toContain(`subagent_type "${childName}"`);
    expect(world.lines.join('\n')).toContain('Prontidão MCP sem confirmação da CLI');
    expect(repo.listChildren(repo.latestForStory(world.cardId)!.id)).toMatchObject([
      {
        intent: { workId: claim.work.id, status: 'completed', config: { childAgent: childName } },
        child: {
          nativeSessionId: CHILD_CALL,
          transport: 'cli',
          status: 'completed',
          result: { modelVerified: true, effectiveModel: KIMI_MODEL.model },
        },
      },
    ]);

    // a sub-tarefa que pede outro modelo é recusada antes de delegar: a filha do Kimi roda no modelo da sessão
    const otherModel = { ...KIMI_MODEL, id: 'kimi:kimi-code/k2', model: 'kimi-code/k2', label: 'K2' };
    world.router.handle({ type: 'settings.models.set', catalog: [...world.router.snapshot().board.modelCatalog, otherModel] });
    const otherId = world.router.createCard({
      typeId: subtaskType.id,
      columnId: subtaskColumn.id,
      parentId: world.cardId,
      title: 'Outro modelo',
    });
    world.router.handle({ type: 'field.setValue', cardId: otherId, fieldId: modelField.id, value: otherModel.id });
    const otherClaim = world.router.work.claim(
      { key: `scenario:${otherId}`, kind: 'subtask', storyId: world.cardId, cardId: otherId, columnId: phase },
      world.router.executions.owner,
      null,
    )!;
    expect(() =>
      world!.runner.start(otherId, { origin: 'manual', mode: 'phase', workId: otherClaim.work.id, token: otherClaim.token }),
    ).toThrow(/roda no modelo da sessão principal/);
    expect(cli.commands).toHaveLength(2);
  });
});
