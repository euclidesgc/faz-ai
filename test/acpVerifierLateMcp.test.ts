import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { runAcpProbes } from '../src/extension/ai/capabilityVerifier';
import { acpAgent } from '../src/extension/ai/acp/agents';
import { FakeAgent } from './fakes/acpAgent';

type Server = { command: string; args: string[]; env: { name: string; value: string }[] };

/**
 * Um Codex falso, como o codex-acp 2.2.2 de verdade: responde o `session/new` na hora e só depois inicia os
 * servidores MCP, com o ambiente filtrado (só o PATH e o que a entrada do servidor traz). Fechar o processo antes
 * cancela o início.
 */
function fakeCodex(delayMs: number) {
  const servers: Server[] = [];
  const spawnAgent = (command: any, cwd: string, out: any) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const agent: FakeAgent = new FakeAgent({
      sessionNew: (params) => {
        for (const server of (params?.mcpServers ?? []) as Server[]) {
          servers.push(server);
          timer = setTimeout(() => {
            if (agent.ended || agent.killed) return;
            const env = { PATH: process.env.PATH ?? '', ...Object.fromEntries(server.env.map((e) => [e.name, e.value])) };
            const child = spawn(server.command, server.args, { env, stdio: ['pipe', 'pipe', 'ignore'] });
            child.stdout.once('data', () => child.stdin.end());
            child.stdin.write(
              `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`,
            );
          }, delayMs);
        }
        return { sessionId: 'sess-1' };
      },
    });
    const running = agent.spawn(command, cwd, out);
    return {
      ...running,
      end: () => {
        clearTimeout(timer);
        running.end();
      },
    };
  };
  return { servers, spawnAgent };
}

const deps = (spawnAgent: unknown, mcpWaitMs?: number) => ({
  spawnAgent: spawnAgent as never,
  admission: { environmentDigest: () => 'a'.repeat(64) },
  ...(mcpWaitMs !== undefined ? { mcpWaitMs } : {}),
});

describe('sondagem ACP: servidor MCP que o agente inicia depois da sessão', () => {
  it('espera o Codex conectar no servidor de teste antes de fechar o processo', async () => {
    const codex = fakeCodex(300);
    const run = await runAcpProbes(deps(codex.spawnAgent), acpAgent('codex-acp')!, 'codex-acp');
    expect(run.first.sessionId).toBe('sess-1');
    expect(run.mcpConnected).toBe(true);
  });

  it('o servidor de teste leva ELECTRON_RUN_AS_NODE na própria entrada: o ambiente filtrado do agente não o derruba', async () => {
    const codex = fakeCodex(0);
    await runAcpProbes(deps(codex.spawnAgent), acpAgent('codex-acp')!, 'codex-acp');
    expect(codex.servers[0]!.env).toEqual([{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }]);
  });

  it('um agente que nunca conecta não prova o MCP, e a espera tem limite', async () => {
    const codex = fakeCodex(60_000);
    const started = Date.now();
    const run = await runAcpProbes(deps(codex.spawnAgent, 400), acpAgent('codex-acp')!, 'codex-acp');
    expect(run.mcpConnected).toBe(false);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
