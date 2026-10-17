import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MessageRouter } from '../panel/messageRouter';
import { manifestOf } from '../../shared/execution';
import { findCard } from './format';

/** Cada chamada tem uma conexão curta: alterações e remoções valem já, sem processos órfãos no host. */
export async function withBoardMcp<T>(
  router: MessageRouter,
  name: string,
  card: string | number | undefined,
  workspaceDir: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const state = router.snapshot();
  const artifact = state.harness.library?.artifacts.find((a) => a.kind === 'mcp' && a.name === name && !a.missing);
  if (!artifact || artifact.usage === 'off') throw new Error('Servidor MCP indisponível ou desligado na biblioteca.');
  if (artifact.usage !== 'always' && (card === undefined || !manifestOf(state, findCard(state, card)).mcpServers.includes(name)))
    throw new Error('Este MCP está no modo Pelo card. Informe um card que o selecione, diretamente ou pelo agente.');
  const definition = router.libraryMcpDefinitions()[name] as Record<string, unknown> | undefined;
  if (!definition) throw new Error('Definição MCP não encontrada.');
  const client = new Client({ name: 'faz-ai-board', version: '1.0.0' });
  let transport: Transport;
  if (typeof definition.command === 'string') {
    transport = new StdioClientTransport({
      command: definition.command,
      args: (definition.args ?? []) as string[],
      env: { ...getDefaultEnvironment(), ...((definition.env as Record<string, string>) ?? {}) },
      cwd: workspaceDir || undefined,
      stderr: 'ignore',
    });
  } else {
    const url = new URL(String(definition.url));
    const options = { requestInit: { headers: definition.headers as Record<string, string> | undefined } };
    transport = definition.type === 'sse' ? new SSEClientTransport(url, options) : new StreamableHTTPClientTransport(url, options);
  }
  try {
    await client.connect(transport, { timeout: 15_000 });
    return await run(client);
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}
