import { describe, expect, it } from 'vitest';
import { rpcConnection } from '../src/extension/ai/acp/connection';
import { openAcpSession, sendAcpTurn } from '../src/extension/ai/acp/session';

function client(methods: string[]) {
  const rpc: ReturnType<typeof rpcConnection> = rpcConnection({
    send: (line) => {
      const message = JSON.parse(line);
      methods.push(message.method);
      const result =
        message.method === 'session/load'
          ? { modes: {} }
          : message.method === 'session/new'
            ? { sessionId: 'created' }
            : { stopReason: 'end_turn' };
      queueMicrotask(() => rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })));
    },
    onRequest: () => ({}),
    onNotification: () => undefined,
  });
  return rpc;
}

describe('ACP reusable session operations', () => {
  it('creates a session, sends multiple turns, and leaves process lifetime to its owner', async () => {
    const methods: string[] = [];
    const rpc = client(methods);
    const session = await openAcpSession(rpc, { agentCapabilities: { loadSession: true } }, { cwd: '/work', mcpServers: [] });
    await sendAcpTurn(rpc, session.sessionId, 'first');
    await sendAcpTurn(rpc, session.sessionId, 'second');
    expect(session).toMatchObject({ sessionId: 'created', resumed: false });
    expect(methods).toEqual(['session/new', 'session/prompt', 'session/prompt']);
  });

  it('loads an existing native session only when the server advertises loadSession', async () => {
    const methods: string[] = [];
    const rpc = client(methods);
    const resumed = await openAcpSession(rpc, { agentCapabilities: { loadSession: true } }, { cwd: '/work', mcpServers: [] }, 'saved');
    expect(resumed).toMatchObject({ sessionId: 'saved', resumed: true });
    await expect(openAcpSession(rpc, { agentCapabilities: {} }, { cwd: '/work', mcpServers: [] }, 'unsupported')).rejects.toThrow(
      /não anunciou suporte a session\/load/,
    );
    expect(methods).toEqual(['session/load']);
  });
});
