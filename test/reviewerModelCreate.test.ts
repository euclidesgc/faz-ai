import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openInMemory } from '../src/extension/db/database';
import { createMcpServer } from '../src/extension/mcp/server';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import type { ModelOption } from '../src/shared/models';
import { valueOf } from '../src/shared/selectors';

// O create_card da IA numa sub-tarefa de Revisão passa pelo gancho do modelo do revisor (#1111).

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const opt = (model: string): ModelOption => ({
  id: `claude:${model}`,
  tool: 'claude',
  model,
  label: model,
  efforts: [],
  defaultEffort: null,
});

let dir: string;
let router: MessageRouter;
let client: Client;
let db: Awaited<ReturnType<typeof openInMemory>>;
let logged: string[];

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* texto simples */
  }
  return { error: res.isError === true, text, data };
};
/** o card pelo "#12" que o MCP devolve */
const cardOf = (ref: string) => router.snapshot().cards.find((c) => c.number === Number(ref.replace('#', '')))!;
/** o modelo gravado no campo Modelo do card, ou null */
const modelOf = (ref: string): string | null => {
  const s = router.snapshot();
  const f = s.fieldDefs.find((x) => x.name === 'Modelo')!;
  return (valueOf(s, cardOf(ref).id, f.id) as string | null) ?? null;
};
const comments = (ref: string) =>
  router
    .snapshot()
    .comments.filter((c) => c.cardId === cardOf(ref).id)
    .map((c) => c.body);
const review = (fields: Record<string, string>) =>
  call('create_card', { title: 'Revisão', parent: 1, fields: { Fase: 'Revisão', ...fields } });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-reviewer-create-'));
  db = await openInMemory(WASM_DIR);
  logged = [];
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home-do-usuario'),
    log: (l) => logged.push(l),
  });
  router.handle({ type: 'settings.models.set', catalog: [opt('haiku'), opt('sonnet'), opt('opus')] });
  router.handle({ type: 'models.ladder.set', tool: 'claude', ladder: ['claude:haiku', 'claude:sonnet', 'claude:opus'] });
  const server = createMcpServer({ getRouter: async () => router, getRunner: async () => undefined, workspaceDir: dir, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);
  const story = (await call('create_card', { title: 'História' })).data;
  expect(story.id).toBe('#1');
  await call('create_card', { title: 'Passo', parent: 1, fields: { Fase: 'Implementação', Modelo: 'claude:opus' } });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('create_card de Revisão', () => {
  it('sem Modelo: o board escolhe outro, nunca o barato, e comenta', async () => {
    const r = await review({});
    expect(r.error).toBe(false);
    expect(modelOf(r.data.id)).toBe('claude:sonnet');
    expect(comments(r.data.id).some((b) => b.startsWith('Revisor definido pelo board'))).toBe(true);
  });

  it('o Modelo barato que a IA passou é trocado', async () => {
    const r = await review({ Modelo: 'claude:haiku' });
    expect(modelOf(r.data.id)).toBe('claude:sonnet');
  });

  it('o Modelo independente que a IA passou é mantido', async () => {
    const r = await review({ Modelo: 'claude:sonnet' });
    expect(modelOf(r.data.id)).toBe('claude:sonnet');
    expect(comments(r.data.id)).toEqual([]);
  });

  it('outra Fase não é tocada', async () => {
    const r = await call('create_card', { title: 'Outro', parent: 1, fields: { Fase: 'Implementação' } });
    expect(modelOf(r.data.id)).toBeNull();
  });

  it('a descrição do create_card avisa que o modelo da Revisão é do board', async () => {
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === 'create_card')!.description).toContain('Na sub-tarefa de Revisão o board escolhe o modelo');
  });
});
