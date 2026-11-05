// Cenário do contrato MCP de um card ACP sob a unidade de trabalho do board: do `runner.start` com o token
// (plano, gateway, admissão, registro na ponte, transporte ACP) até as chamadas do agente ao servidor do board,
// que roda de verdade, em memória, com o token que o board pôs no `session/new`. Só o processo do agente é
// falso. Antes da correção o pedido de admissão do ACP saía sem nenhuma ferramenta do board, a ponte
// registrava um contrato explícito vazio e toda chamada (`get_card`, `move_card`) voltava "fora do contrato":
// o agente não lia nem o próprio card.
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/extension/mcp/server';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import type { RunnerPermission } from '../../src/shared/runner';
import { FakeAgent } from '../fakes/acpAgent';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

/** O texto da resposta de uma ferramenta MCP, com o erro marcado. */
type Reply = { error: boolean; text: string };

/** Abre um cliente MCP no servidor do board com o token da execução, como a ponte faz para o agente. */
async function boardClient(w: CardWorld, token: string): Promise<Client> {
  const [client, server] = InMemoryTransport.createLinkedPair();
  await createMcpServer(
    { getRouter: async () => w.router, getRunner: async () => w.runner, workspaceDir: w.project, version: '0.0.0-cenario' },
    () => token,
  ).connect(server);
  const c = new Client({ name: 'agente-falso', version: '0.0.0' });
  await c.connect(client);
  return c;
}

async function call(c: Client, name: string, args: Record<string, unknown>): Promise<Reply> {
  const result = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text?: string }[] };
  return { error: !!result.isError, text: result.content.map((p) => p.text ?? '').join('\n') };
}

/** Roda o card como o orquestrador roda uma unidade: reserva a unidade e passa o token ao runner. */
async function runAsUnit(
  permission: RunnerPermission,
): Promise<{ end: AiRunEnd; replies: Record<string, Reply>; token: string; column: string }> {
  const replies: Record<string, Reply> = {};
  let token = '';
  const agent = new FakeAgent({
    onPrompt: async (a) => {
      // o token chega ao agente só pelo servidor do board no `session/new`, como no processo real
      const session = a.received.find((m) => m.method === 'session/new')!;
      const board = (session.params.mcpServers as { name: string; env: { name: string; value: string }[] }[]).find(
        (s) => s.name === 'faz-ai',
      )!;
      token = board.env.find((e) => e.name === 'FAZAI_RUN_TOKEN')!.value;
      const c = await boardClient(world!, token);
      const card = world!.router.snapshot().cards.find((x) => x.id === world!.cardId)!;
      replies.get_card = await call(c, 'get_card', { card: card.number });
      const next = world!.router
        .snapshot()
        .columns.filter((col) => col.workflowId === world!.router.snapshot().columns.find((x) => x.id === card.columnId)!.workflowId)
        .sort((x, y) => x.position - y.position)
        .find((col) => col.position > world!.router.snapshot().columns.find((x) => x.id === card.columnId)!.position)!;
      // a fase pede aprovação: o agente pediu a revisão, a pessoa aprovou, e o move_card é o passo seguinte
      world!.router.handle({ type: 'card.status.set', cardId: card.id, status: 'approved' });
      replies.move_card = await call(c, 'move_card', { card: card.number, column: next.name, comment: 'Fase concluída.' });
      await c.close();
      a.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Fase concluída.\n' } });
      return { stopReason: 'end_turn' };
    },
  });
  world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, permission, spawnAcp: agent.spawn, snapshots: true });
  const w = world;
  const card = w.router.snapshot().cards.find((x) => x.id === w.cardId)!;
  const claim = w.router.work.claim(
    { kind: 'activity', storyId: null, cardId: w.cardId, columnId: card.columnId, key: `cenario:${w.cardId}` },
    w.router.executions.owner,
    w.project,
  )!;
  const end = await new Promise<AiRunEnd>((resolve) =>
    w.runner.start(w.cardId, { origin: 'autopilot', mode: 'phase', workId: claim.work.id, token: claim.token, onExit: resolve }),
  );
  return { end, replies, token, column: card.columnId };
}

describe('cenário: agente ACP sob a unidade de trabalho chama as ferramentas do board', () => {
  for (const permission of ['board', 'full'] as const) {
    it(`no nível ${permission}, get_card e move_card passam pela ponte com o token da execução`, async () => {
      const { end, replies, token, column } = await runAsUnit(permission);

      expect(token).not.toBe('');
      expect(world!.lines.join('\n')).not.toMatch(/bloqueada pela admissão|Não foi possível executar/);
      expect(replies.get_card).toMatchObject({ error: false });
      expect(replies.get_card!.text).toContain('Card do cenário');
      // a ponte conferiu o contrato e aceitou: o que a ponte recusa por contrato nunca chega ao board
      expect(replies.move_card!.text).not.toContain('fora do contrato');
      expect(replies.move_card, replies.move_card!.text).toMatchObject({ error: false });
      expect(end.outcome).toBe('done');
      expect(world!.router.snapshot().cards.find((x) => x.id === world!.cardId)!.columnId).not.toBe(column);
    });
  }

  it('o token não vaza no canal de log', async () => {
    const { token } = await runAsUnit('full');
    expect(world!.lines.join('\n')).not.toContain(token);
  });
});
