import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { runAcpProbes } from '../src/extension/ai/capabilityVerifier';
import { acpAgent } from '../src/extension/ai/acp/agents';
import { FakeAgent } from './fakes/acpAgent';

type Server = { command: string; args: string[]; env: { name: string; value: string }[] };

/**
 * Um agente ACP falso que liga o servidor MCP da sessão em outro momento, com o ambiente filtrado (só o PATH e o
 * que a entrada do servidor traz), como os agentes de verdade:
 * - `session`: responde o `session/new` na hora e liga o servidor depois de `delayMs` (o codex-acp 2.2.2);
 * - `prompt`: só liga o servidor no primeiro `session/prompt` (o Antigravity 1.4.1).
 * Fechar o processo antes cancela o início.
 */
function fakeAgent(delayMs: number, startOn: 'session' | 'prompt' = 'session') {
  const servers: Server[] = [];
  let prompts = 0;
  const spawnAgent = (command: any, cwd: string, out: any) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = (server: Server) =>
      timers.push(
        setTimeout(() => {
          if (agent.ended || agent.killed) return;
          const env = { PATH: process.env.PATH ?? '', ...Object.fromEntries(server.env.map((e) => [e.name, e.value])) };
          const child = spawn(server.command, server.args, { env, stdio: ['pipe', 'pipe', 'ignore'] });
          child.stdout.once('data', () => child.stdin.end());
          child.stdin.write(
            `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`,
          );
        }, delayMs),
      );
    const mine: Server[] = [];
    const agent: FakeAgent = new FakeAgent({
      sessionNew: (params) => {
        for (const server of (params?.mcpServers ?? []) as Server[]) {
          servers.push(server);
          mine.push(server);
          if (startOn === 'session') start(server);
        }
        return { sessionId: 'sess-1' };
      },
      onPrompt: () => {
        prompts++;
        if (startOn === 'prompt') mine.forEach(start);
        return { stopReason: 'end_turn' };
      },
    });
    const running = agent.spawn(command, cwd, out);
    return {
      ...running,
      end: () => {
        timers.forEach(clearTimeout);
        running.end();
      },
    };
  };
  return { servers, spawnAgent, prompts: () => prompts };
}

const deps = (spawnAgent: unknown, mcpWaitMs?: number) => ({
  spawnAgent: spawnAgent as never,
  admission: { environmentDigest: () => 'a'.repeat(64) },
  ...(mcpWaitMs !== undefined ? { mcpWaitMs } : {}),
});
const probe = (agent: ReturnType<typeof fakeAgent>, mcpWaitMs?: number) =>
  runAcpProbes(deps(agent.spawnAgent, mcpWaitMs), acpAgent('codex-acp')!, 'agente');

describe('sondagem ACP: servidor MCP que o agente liga em outro momento', () => {
  it('espera o agente que liga o servidor depois da sessão (Codex), sem pedir turno', async () => {
    const codex = fakeAgent(300);
    const run = await probe(codex);
    expect(run.first.sessionId).toBe('sess-1');
    expect(run.mcpConnected).toBe(true);
    // conectou sozinho: nenhum pedido gasta a conta
    expect(codex.prompts()).toBe(0);
  });

  it('pede um turno mínimo ao agente que só liga o servidor no primeiro pedido (Antigravity)', async () => {
    const antigravity = fakeAgent(50, 'prompt');
    const run = await probe(antigravity, 300);
    expect(run.mcpConnected).toBe(true);
    // um turno só, no primeiro handshake
    expect(antigravity.prompts()).toBe(1);
  });

  it('o servidor de teste leva ELECTRON_RUN_AS_NODE na própria entrada: o ambiente filtrado do agente não o derruba', async () => {
    const codex = fakeAgent(0);
    await probe(codex);
    expect(codex.servers[0]!.env).toEqual([{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }]);
  });

  it('um agente que nunca liga o servidor não prova o MCP, e as esperas têm limite', async () => {
    const never = fakeAgent(60_000, 'prompt');
    const started = Date.now();
    const run = await probe(never, 300);
    expect(run.mcpConnected).toBe(false);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
