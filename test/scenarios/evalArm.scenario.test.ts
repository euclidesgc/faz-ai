// A rodada com `--arm` até a execução do card: o `evalWorld` (só o processo da CLI é falso) recebe o Harness do braço
// e o comando que o `spawn` falso recebeu o reflete: as ferramentas do agente e o MCP do braço.
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseModel } from '../../evals/lib/evalBoard';
import { loadArm, type Arm } from '../../evals/lib/harnessArm';
import { runStory } from '../../evals/lib/runStory';
import type { ReferenceStory } from '../../evals/lib/stories';
import { evalWorld, type EvalWorld } from '../evals/evalWorld';

const CONFIG = parseModel('claude:sonnet@high');
const story: ReferenceStory = {
  id: 'exemplo',
  title: 'História de exemplo',
  description: 'Faça algo.',
  startPhase: 'Plan',
  timeoutMinutes: 1,
  acceptance: { command: ['node', '-e', ''], timeoutSeconds: 10 },
  requiredArtifacts: [],
  dir: path.resolve(__dirname, '../fixtures/stories'),
};

let world: EvalWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

/** Carrega o braço, roda a história até a primeira execução e devolve o que o `spawn` falso recebeu. */
async function firstCommand(arm: Arm) {
  world = await evalWorld(CONFIG, () => {});
  loadArm(world.router, arm);
  await runStory(world, story, CONFIG, { timeoutMs: 3000 });
  const command = world.world.cliCommands[0]!;
  const arg = (flag: string): string | undefined => command.args[command.args.indexOf(flag) + 1];
  const mcp = JSON.parse(command.tempFiles?.['mcp.json'] ?? '{}') as { mcpServers?: Record<string, unknown> };
  return { command, arg, servers: Object.keys(mcp.mcpServers ?? {}) };
}

describe('rodada com --arm', () => {
  it('B: o condutor sem Agent e o code-review-graph fora do MCP dele (Pelo card)', async () => {
    const b = await firstCommand('B');
    expect(b.arg('--agent')).toBe('condutor-do-board');
    expect(b.arg('--tools')).not.toContain('Agent');
    expect(b.servers).not.toContain('code-review-graph');
  });

  it('A: recebe o seu Harness (code-review-graph "Sempre" no MCP da execução)', async () => {
    const a = await firstCommand('A');
    expect(a.arg('--agent')).toBe('condutor-do-board');
    expect(a.servers).toContain('code-review-graph');
  });
});
