// Cenário da sub-tarefa cujo agente ACP termina só com o erro de inicialização do MCP (#1386, parte 5): do relatório
// do leitor ACP até o bloqueio da história, pelo orquestrador real. Só o processo do agente é falso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeAgent } from '../fakes/acpAgent';
import { validBrief } from '../fixtures/subtaskBrief';
import { PARTIAL_WORK_NOTE } from '../../src/shared/orchestration';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const MCP_ERROR = 'MCP load failed: orkestra-ide: connection refused';

describe('cenário: agente ACP que termina só com o erro do MCP', () => {
  it('a história bloqueia com o erro nomeado e sem a frase de trabalho parcial', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => {
        a.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `${MCP_ERROR}\n    at stack (x.js:1)\n` } });
        return { stopReason: 'end_turn' };
      },
    });
    world = await storyWorld(() => {}, undefined, { profile: 'gemini', spawnAcp: agent.spawn });
    const sub = world.subtask('Implementar', validBrief());

    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    await vi.waitFor(() => expect(world!.storyComments().join('')).toContain('Resultado de'), { timeout: 5000, interval: 25 });
    await world.orchestrator.settled();
    // o drive seguinte vê a sub-tarefa parada e bloqueia a história com o motivo
    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();

    const all = [
      ...world.storyComments(),
      ...world.router
        .snapshot()
        .comments.filter((c) => c.cardId === sub)
        .map((c) => c.body),
    ].join('\n');
    expect(all).toContain(MCP_ERROR);
    expect(world.storyComments().find((c) => c.startsWith('Resultado de'))).toContain(MCP_ERROR);
    expect(
      world
        .storyComments()
        .filter((c) => c.includes('está parada'))
        .join('\n'),
    ).toContain(MCP_ERROR);
    expect(world.router.snapshot().cards.find((c) => c.id === world!.storyId)!.statusReason).toContain(MCP_ERROR);
    expect(all).not.toContain(PARTIAL_WORK_NOTE);
    expect(all).not.toContain('pode ter feito parte do trabalho');
    expect(world.story().status).toBe('blocked');
    expect(world.starts).toEqual([sub]);
  });
});
