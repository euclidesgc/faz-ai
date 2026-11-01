// Cenários de ponta a ponta do board multiagente (docs/decisoes/board-multiagente.md): dois cards, cada um no agente
// do próprio modelo, sem trocar o padrão. O card com o modelo do Gemini vai pelo ACP; o card sem modelo, pelo
// padrão (o Claude Code pela CLI). Só os processos das ferramentas são falsos (ver cardWorld.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import { heartbeatTargets } from '../../src/extension/heartbeat';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { monthOf } from '../../src/shared/log';
import { cardRunUnsupported } from '../../src/shared/requirements';
import { runTargetOf } from '../../src/shared/runTarget';
import { FakeAgent } from '../fakes/acpAgent';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  world?.dispose();
  world = undefined;
});

/** O turno do Gemini: só termina quando o teste solta, para as duas execuções ficarem abertas ao mesmo tempo. */
function heldAgent() {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  const agent = new FakeAgent({
    onPrompt: async (a) => {
      await held;
      a.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Fase concluída.\n' } });
      return { stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 20 } };
    },
  });
  return { agent, release };
}

/** Um segundo card, sem modelo, na mesma fase do card do cenário: ele vai para o padrão do board. */
function cardWithoutModel(w: CardWorld): string {
  const first = w.router.snapshot().cards.find((c) => c.id === w.cardId)!;
  return w.router.createCard({ typeId: first.typeId, columnId: first.columnId, parentId: null, title: 'Card no padrão' });
}

const start = (w: CardWorld, cardId: string) =>
  new Promise<AiRunEnd>((resolve, reject) => {
    try {
      w.runner.start(cardId, { origin: 'manual', onExit: resolve });
    } catch (e) {
      reject(e);
    }
  });

describe('cenário: board multiagente, cada card no agente do próprio modelo', () => {
  it('A: o card do Gemini (ACP) e o do Claude Code (o padrão, CLI) rodam ao mesmo tempo, sem trocar o padrão', async () => {
    const { agent, release } = heldAgent();
    world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn });
    const other = cardWithoutModel(world);
    const s = world.router.snapshot();
    expect(s.board.aiTool).toBe('claude');
    expect(
      runTargetOf(
        s,
        s.cards.find((c) => c.id === world!.cardId)!,
      ),
    ).toMatchObject({ cli: { id: 'gemini' }, source: 'card' });
    expect(
      runTargetOf(
        s,
        s.cards.find((c) => c.id === other)!,
      ),
    ).toMatchObject({ cli: { id: 'claude' }, source: 'default' });

    const gemini = world.run();
    const claude = start(world, other);
    // as duas execuções abertas juntas, uma por agente
    expect(world.runner.running.sort()).toEqual([world.cardId, other].sort());
    await claude;
    release();
    await gemini;

    expect(agent.command!.args).toContain('--acp');
    expect(world.cliCommands.map((c) => c.command)).toEqual(['claude']);
    const runs = new AiRunRepo(world.db).byMonth(monthOf(Date.now()));
    expect(runs.map((r) => r.tool).sort()).toEqual(['claude', 'gemini']);
    // o padrão continua o mesmo: nada foi trocado para o card do Gemini rodar
    expect(world.router.snapshot().board.aiTool).toBe('claude');
  });

  it('B: o padrão que não roda pelo board (root com "Sem restrições") não segura o card do Gemini', async () => {
    vi.spyOn(process as { getuid: () => number }, 'getuid').mockReturnValue(0);
    const { agent, release } = heldAgent();
    world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn, permission: 'full' });
    const other = cardWithoutModel(world);
    const s = world.router.snapshot();
    // o motivo é do Claude Code; o board não para (o Gemini roda)
    expect(s.aiRunUnsupportedBy?.claude).toContain('root');
    expect(s.aiRunUnsupportedBy?.gemini).toBeUndefined();
    expect(s.aiRunUnsupported).toBeNull();
    const card = (id: string) => s.cards.find((c) => c.id === id)!;
    expect(cardRunUnsupported(s, card(world.cardId))).toBeNull();
    expect(cardRunUnsupported(s, card(other))).toContain('root');
    // a rodada do heartbeat leva só o card do Gemini
    expect(heartbeatTargets(s).map((c) => c.id)).toEqual([world.cardId]);

    // o card no padrão recusa antes de abrir processo; o do Gemini roda
    await expect(start(world, other)).rejects.toThrow('root');
    expect(world.cliCommands).toHaveLength(0);
    const gemini = world.run();
    release();
    expect((await gemini).outcome).toBe('done');
    expect(world.aiRun()).toMatchObject({ tool: 'gemini', outcome: 'done' });
  });
});
