import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { toolDefinitions } from '../src/extension/mcp/tools';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { GateRepo } from '../src/extension/repositories/gateRepo';
import type { WebviewToHost } from '../src/shared/messages';

// O portão pelo MCP: move_card e request_review em coluna com checagens não movem nem entregam o card; o resultado
// traz `gate` e `next` mandando parar, e a mensagem de conclusão do move_card não é gravada. Coluna sem checagens
// segue como antes, e o desfecho (completeGate/failGate) não é ferramenta nem aparece em texto da IA.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let router: MessageRouter;
let client: Client;
let db: Awaited<ReturnType<typeof openInMemory>>;
let repo: GateRepo;

const snap = () => router.snapshot();
const card = (n: number) => snap().cards.find((c) => c.number === n)!;
const column = (name: string) => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  return s.columns.find((c) => c.workflowId === wf.id && c.name === name)!;
};
const colName = (n: number) => snap().columns.find((c) => c.id === card(n).columnId)!.name;
const human = (msg: WebviewToHost) => router.handle(msg);
const comments = (n: number) =>
  snap()
    .comments.filter((c) => c.cardId === card(n).id)
    .map((c) => c.body);
const withChecks = (name: string) =>
  human({
    type: 'settings.column.update',
    columnId: column(name).id,
    patch: { checks: [{ name: 'Typecheck', command: 'true', timeoutSec: 30 }] },
  });
const story = (title: string, columnName: string) => {
  const s = snap();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: column(columnName).id,
    parentId: null,
    title,
  });
};
const call = async (name: string, args: Record<string, unknown>) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  return { error: res.isError === true, text, data: (res.isError ? text : JSON.parse(text)) as any };
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-mcp-gate-'));
  db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
  repo = new GateRepo(db);
  const server = createMcpServer({ getRouter: async () => router, getRunner: async () => undefined, workspaceDir: dir, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('move_card em coluna com checagens', () => {
  it('não move: devolve o gate e o next mandando parar, e não grava o comment', async () => {
    withChecks('Implementação');
    story('H', 'Implementação');
    await call('start_work', { card: 1 });
    const r = await call('move_card', { card: 1, column: 'Revisão', comment: 'Feito.' });
    expect(r.error).toBe(false);
    const run = repo.runningFor(card(1).id)!;
    expect(r.data.gate).toEqual({ id: run.id, status: 'verifying' });
    expect(r.data.card.column).toBe('Implementação');
    expect(r.data.card.work.status).toBe('verifying');
    expect(r.data.next).toContain('Pare aqui');
    expect(r.data.next).toContain('a mensagem de conclusão não foi gravada: grave-a de novo quando o card chegar ao destino');
    expect(colName(1)).toBe('Implementação');
    expect(comments(1)).not.toContain('Feito.');
  });

  it('sem comment, o next não fala de mensagem de conclusão', async () => {
    withChecks('Implementação');
    story('H', 'Implementação');
    const r = await call('move_card', { card: 1, column: 'Revisão' });
    expect(r.data.gate.status).toBe('verifying');
    expect(r.data.next).toContain('Pare aqui');
    expect(r.data.next).not.toContain('mensagem de conclusão');
  });

  it('pedido repetido durante a verificação é recusado', async () => {
    withChecks('Implementação');
    story('H', 'Implementação');
    await call('move_card', { card: 1, column: 'Revisão' });
    const again = await call('move_card', { card: 1, column: 'Revisão' });
    expect(again.error).toBe(true);
    expect(again.text).toContain('O card já está sendo verificado.');
    expect(repo.listFor(card(1).id)).toHaveLength(1);
  });

  it('coluna sem checagens: move, grava o comment e não traz gate', async () => {
    story('H', 'Implementação');
    const r = await call('move_card', { card: 1, column: 'Revisão', comment: 'Feito.' });
    expect(r.data.gate).toBeUndefined();
    expect(r.data.next).toBeUndefined();
    expect(colName(1)).toBe('Revisão');
    expect(comments(1)).toContain('Feito.');
  });
});

describe('request_review em coluna com checagens', () => {
  it('fica em Verificando com gate e next de parar; o resumo já está na conversa', async () => {
    withChecks('Implementação');
    story('H', 'Implementação');
    await call('start_work', { card: 1 });
    const r = await call('request_review', { card: 1, summary: 'Resumo do trabalho' });
    const run = repo.runningFor(card(1).id)!;
    expect(r.data.gate).toEqual({ id: run.id, status: 'verifying' });
    expect(r.data.card.work.status).toBe('verifying');
    expect(r.data.next).toContain('Verificando');
    expect(r.data.next).toContain('Pare aqui');
    expect(comments(1).join('\n')).toContain('Resumo do trabalho');
  });

  it('no modo autônomo o "aprovado automaticamente" só vale sem portão', async () => {
    withChecks('Implementação');
    story('H', 'Implementação');
    story('I', 'Implementação');
    human({ type: 'card.yolo.set', cardId: card(1).id, enabled: true });
    human({ type: 'card.yolo.set', cardId: card(2).id, enabled: true });
    const gated = await call('request_review', { card: 1, summary: 'Resumo' });
    expect(gated.data.card.work.status).toBe('verifying');
    expect(gated.data.next).toContain('Pare aqui');
    expect(gated.data.next).not.toContain('aprovado automaticamente');
    // sem checagens na coluna, o ramo autônomo segue como antes
    human({ type: 'settings.column.update', columnId: column('Implementação').id, patch: { checks: [] } });
    const free = await call('request_review', { card: 2, summary: 'Resumo' });
    expect(free.data.gate).toBeUndefined();
    expect(free.data.next).toContain('aprovado automaticamente');
  });

  it('coluna sem checagens: entrega como sempre', async () => {
    story('H', 'Implementação');
    const r = await call('request_review', { card: 1, summary: 'Resumo' });
    expect(r.data.gate).toBeUndefined();
    expect(r.data.card.work.status).toBe('waiting_review');
    expect(r.data.next).toContain('uma pessoa aprovar');
  });
});

describe('desfecho do portão fora do MCP', () => {
  it('nenhuma ferramenta nem texto que a IA lê expõe completeGate/failGate', async () => {
    const listed = await client.listTools();
    const text = JSON.stringify([...toolDefinitions(), ...listed.tools]);
    expect(text).not.toMatch(/completeGate|failGate/);
    withChecks('Implementação');
    story('H', 'Implementação');
    const r = await call('move_card', { card: 1, column: 'Revisão', comment: 'Feito.' });
    expect(r.text).not.toMatch(/completeGate|failGate/);
    const denied = await client.callTool({ name: 'completeGate', arguments: { id: r.data.gate.id } }).catch((e: unknown) => e);
    expect(denied instanceof Error || (denied as { isError?: boolean }).isError === true).toBe(true);
  });
});
