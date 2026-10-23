// O board como cliente do próprio servidor MCP, no modo API (épica "ferramenta por modo", história 10):
// o laço fala com o servidor que já atende a pasta, pelo socket dela e pelo protocolo da ponte (token da
// execução na primeira linha). Nada abre um segundo servidor para a mesma pasta.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Database } from 'sql.js';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { startMcpServer } from '../src/extension/mcp/server';
import { socketPath } from '../src/extension/mcp/socketPath';
import { ENDED_RUN } from '../src/extension/mcp/runSessions';
import { BoardSocketClientTransport, boardSelfTransport } from '../src/extension/mcp/selfClient';
import { clientConnection, defaultConnect } from '../src/extension/ai/drivers/gemini/api';

let dir: string;
let db: Database;
let router: MessageRouter;
let stop: (() => void) | undefined;

beforeEach(async () => {
  // a pasta curta: o caminho do socket tem limite de tamanho no macOS
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fz-self-')));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'self',
    folderName: 'Teste',
    author: 'Pessoa',
    workspaceDir: dir,
    attachmentsDir: path.join(dir, 'attachments'),
    homeDir: path.join(dir, 'home'),
  });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const serve = async () =>
  (stop = await startMcpServer(socketPath(dir), {
    getRouter: async () => router,
    getRunner: async () => undefined,
    workspaceDir: dir,
    version: 'test',
  }));

describe('o board como cliente do próprio servidor MCP', () => {
  it('lista e chama as ferramentas do servidor que atende a pasta, apresentando-se como o Gemini', async () => {
    await serve();
    const connection = await clientConnection(boardSelfTransport(dir));
    try {
      const names = (await connection.listTools()).map((t) => t.name);
      expect(names).toContain('get_card');
      expect(names).toContain('add_comment');
      expect(connection.instructions()).toContain('Board kanban do projeto (Faz AI)');
      const s = router.snapshot();
      const type = s.cardTypes[0]!;
      const columnId = s.columns.find((c) => c.workflowId === type.defaultWorkflowId)!.id;
      const cardId = router.createCard({ typeId: type.id, columnId, title: 'Pelo modo API', parentId: null });
      const number = router.snapshot().cards.find((c) => c.id === cardId)!.number;
      const result = await connection.callTool('add_comment', { card: number, body: 'Oi do laço.' }, new AbortController().signal);
      expect(result.isError).not.toBe(true);
      expect(router.snapshot().comments.find((c) => c.cardId === cardId)).toMatchObject({ body: 'Oi do laço.', author: 'Gemini' });
    } finally {
      await connection.close();
    }
  });

  it('o token da execução vai na primeira linha, como na ponte: um token que o board não emitiu é recusado', async () => {
    await serve();
    const connection = await defaultConnect('faz-ai', { command: 'node', args: [], env: { FAZAI_RUN_TOKEN: 'f'.repeat(64) } }, dir);
    try {
      const result = await connection.callTool('get_board', {}, new AbortController().signal);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(ENDED_RUN);
    } finally {
      await connection.close();
    }
    expect(() => new BoardSocketClientTransport(socketPath(dir), 'token-fora-do-formato')).toThrow('Token de execução inválido.');
  });

  it('sem servidor na pasta, a conexão falha com a causa e nenhum servidor é aberto', async () => {
    await expect(clientConnection(boardSelfTransport(dir))).rejects.toThrow('O servidor MCP do board desta pasta não está acessível.');
    expect(fs.existsSync(socketPath(dir))).toBe(false);
    // com o servidor da pasta no ar, um segundo não sobe: o cliente usa o que existe
    await serve();
    await expect(
      startMcpServer(socketPath(dir), { getRouter: async () => router, getRunner: async () => undefined, workspaceDir: dir, version: 'x' }),
    ).rejects.toThrow('Já existe um servidor MCP do Faz AI para esta pasta.');
  });
});
