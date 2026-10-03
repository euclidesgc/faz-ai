import { afterEach, beforeEach, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { boardDbFile } from '../src/extension/host/boardHost';
import { workspaceKey } from '../src/extension/mcp/socketPath';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { ViewStateStore } from '../src/extension/viewState';
import { startWebServer, type WebServer } from '../src/extension/web/webServer';
import type { HostToWebview, WebviewToHost } from '../src/shared/messages';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let dir: string;
let router: MessageRouter;
let web: WebServer;
let calls: string[];
let cookie: string;

/** Requisição crua: o fetch do Node não deixa trocar o cabeçalho Host. */
function request(
  method: string,
  target: string,
  opts: { headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: web.port, path: target, method, headers: opts.headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

/** Abre o canal de eventos e devolve as mensagens recebidas e como fechá-lo. */
function events(
  id: string,
): Promise<{ messages: HostToWebview[]; next(type: HostToWebview['type']): Promise<HostToWebview>; close(): void }> {
  return new Promise((resolve, reject) => {
    const messages: HostToWebview[] = [];
    const waiting: { type: string; done(m: HostToWebview): void }[] = [];
    const req = http.get({ host: '127.0.0.1', port: web.port, path: `/events?c=${id}`, headers: { cookie } }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (!block.startsWith('data: ')) continue;
          const msg = JSON.parse(block.slice(6)) as HostToWebview;
          messages.push(msg);
          const at = waiting.findIndex((w) => w.type === msg.type);
          if (at >= 0) waiting.splice(at, 1)[0]!.done(msg);
        }
      });
      resolve({ messages, next: (type) => new Promise((done) => waiting.push({ type, done })), close: () => req.destroy() });
    });
    req.on('error', reject);
  });
}

const post = (id: string, msg: WebviewToHost, headers: Record<string, string> = {}) =>
  request('POST', `/message?c=${id}`, { headers: { cookie, 'content-type': 'application/json', ...headers }, body: JSON.stringify(msg) });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-web-'));
  fs.mkdirSync(path.join(dir, 'webview'));
  fs.writeFileSync(path.join(dir, 'webview', 'main.js'), 'console.log("board")');
  fs.writeFileSync(path.join(dir, 'segredo.txt'), 'fora da pasta da interface');
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
  });
  calls = [];
  const memory = new Map<string, unknown>();
  web = await startWebServer({
    webviewDir: path.join(dir, 'webview'),
    router,
    viewState: new ViewStateStore({ get: <T>(k: string) => memory.get(k) as T | undefined, update: (k, v) => memory.set(k, v) }),
    tokenFile: path.join(dir, 'token'),
    env: {
      connectAI: () => 'Servidor registrado.',
      runAi: (cardId) => void calls.push(`run:${cardId}`),
      stopAi: (cardId) => void calls.push(`stop:${cardId}`),
      pauseAutopilot: () => {},
      resumeAutopilot: () => {},
      runHeartbeat: () => 'Nada pendente com a IA.',
      openFolder: (d) => void calls.push(`folder:${d}`),
      openFile: (f) => void calls.push(`file:${f}`),
      openExternal: (f) => void calls.push(`external:${f}`),
      revealFile: (f) => void calls.push(`reveal:${f}`),
    },
  });
  const login = await request('GET', new URL(web.url).pathname + new URL(web.url).search);
  cookie = String(login.headers['set-cookie']?.[0]).split(';')[0]!;
});

afterEach(() => {
  web.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('só entrega o board a quem chega com o segredo do link, pelo endereço local', async () => {
  expect((await request('GET', '/')).status).toBe(401);
  expect((await request('GET', '/?t=errado')).status).toBe(403);
  expect((await request('GET', '/', { headers: { cookie, host: 'site-de-fora.example' } })).status).toBe(403);

  const page = await request('GET', '/', { headers: { cookie } });
  expect(page.status).toBe(200);
  expect(page.body).toContain('data-host="web"');
  expect(page.body).toContain('Projeto · Faz AI');
  expect((await request('GET', '/main.js', { headers: { cookie } })).body).toContain('board');
  // nada fora da pasta da interface
  expect((await request('GET', '/../segredo.txt', { headers: { cookie } })).status).toBe(404);
  expect((await request('GET', '/%2e%2e/segredo.txt', { headers: { cookie } })).status).toBe(404);
  // caminho malformado é recusado sem derrubar o servidor
  expect((await request('GET', '/%E0%A4%A', { headers: { cookie } })).status).toBe(400);
  expect((await request('GET', '/main.js', { headers: { cookie } })).status).toBe(200);
  // o segredo continua o mesmo entre reinícios, para o endereço salvo seguir valendo
  expect(fs.readFileSync(path.join(dir, 'token'), 'utf8')).toBe(new URL(web.url).searchParams.get('t'));
});

it('a página recebe o board, cria um card e vê a mudança chegar', async () => {
  const page = await events('cliente-um-1234');
  const first = page.next('boardState');
  expect((await post('cliente-um-1234', { type: 'ready' })).status).toBe(204);
  const initial = (await first) as Extract<HostToWebview, { type: 'boardState' }>;
  expect(initial.attachmentsBaseUri).toBe('/attachments');
  expect(page.messages.some((m) => m.type === 'viewState')).toBe(true);

  const s = initial.state;
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  const changed = page.next('boardState');
  await post('cliente-um-1234', {
    type: 'card.create',
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
    parentId: null,
    title: 'Pelo navegador',
  });
  const after = (await changed) as Extract<HostToWebview, { type: 'boardState' }>;
  const card = after.state.cards.find((c) => c.title === 'Pelo navegador')!;
  expect(card).toBeTruthy();

  // chamar a IA e os avisos passam pelo ambiente de quem serve a página
  await post('cliente-um-1234', { type: 'ai.run', cardId: card.id });
  const notice = page.next('notice');
  await post('cliente-um-1234', { type: 'ui.connectAI' });
  expect(await notice).toEqual({ type: 'notice', message: 'Servidor registrado.' });
  expect(calls).toEqual([`run:${card.id}`]);

  // erro de regra do board volta como mensagem de erro, não derruba a página
  const error = page.next('error');
  await post('cliente-um-1234', { type: 'card.pr.set', cardId: 'nao-existe', url: 'x' });
  expect((await error).type).toBe('error');

  // anexo enviado como dados é servido de volta só para cards deste board
  const withFile = page.next('boardState');
  await post('cliente-um-1234', {
    type: 'attachment.addData',
    cardId: card.id,
    filename: 'nota.txt',
    base64: Buffer.from('olá').toString('base64'),
  });
  const attachment = ((await withFile) as Extract<HostToWebview, { type: 'boardState' }>).state.attachments[0]!;
  expect(
    (await request('GET', `/attachments/${attachment.cardId}/${encodeURIComponent(attachment.storedName)}`, { headers: { cookie } })).body,
  ).toBe('olá');
  expect((await request('GET', `/attachments/${attachment.cardId}/outro.txt`, { headers: { cookie } })).status).toBe(404);
  page.close();
});

it('recusa mensagens de outra origem e de sessões que não existem', async () => {
  const page = await events('cliente-dois-1234');
  expect((await post('cliente-dois-1234', { type: 'ready' }, { origin: 'https://site-de-fora.example' })).status).toBe(403);
  expect((await post('sessao-desconhecida', { type: 'ready' })).status).toBe(409);
  expect((await request('POST', '/message?c=cliente-dois-1234', { headers: { cookie }, body: 'não é json' })).status).toBe(400);
  page.close();
});

it('cada pasta tem o seu banco, partindo de uma cópia do banco único das versões anteriores', () => {
  const storage = path.join(dir, 'dados');
  fs.mkdirSync(storage);
  const fresh = boardDbFile(storage, '/projetos/a');
  expect(fresh).toBe(path.join(storage, 'boards', `${workspaceKey('/projetos/a')}.db`));
  expect(fs.existsSync(fresh)).toBe(false);

  fs.writeFileSync(path.join(storage, 'fazai.db'), 'banco antigo');
  const migrated = boardDbFile(storage, '/projetos/b');
  expect(fs.readFileSync(migrated, 'utf8')).toBe('banco antigo');
  // o banco antigo fica intacto e o da pasta não é sobrescrito de novo
  fs.writeFileSync(migrated, 'board atual');
  expect(fs.readFileSync(boardDbFile(storage, '/projetos/b'), 'utf8')).toBe('board atual');
  expect(fs.readFileSync(path.join(storage, 'fazai.db'), 'utf8')).toBe('banco antigo');
});
