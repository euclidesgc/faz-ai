import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import { LARGE_EXPORT_BYTES } from '../../shared/backup';
import { parseExportFile } from '../db/boardExport';
import { HostBridge, exportNotice, type HostEnv } from '../host/hostBridge';
import type { MessageRouter } from '../panel/messageRouter';
import type { ViewStateStore } from '../viewState';

export interface WebServerOptions {
  /** pasta com o bundle da interface (dist/webview) */
  webviewDir: string;
  router: MessageRouter;
  viewState: ViewStateStore;
  /** o que a página pede ao sistema; anexos, filtros e escolha de arquivos são resolvidos na própria página */
  env: Omit<HostEnv, 'attachmentsBaseUri' | 'showFilters' | 'pickFiles' | 'openInBrowser' | 'openIdeSettings'>;
  /** porta preferida; ocupada, o sistema escolhe outra */
  port?: number;
  /** arquivo que guarda o segredo de acesso, para o endereço continuar valendo entre reinícios */
  tokenFile: string;
  iconFile?: string;
}

export interface WebServer {
  /** endereço completo, com o segredo: é o que se abre no navegador */
  url: string;
  port: number;
  close(): void;
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};
const COOKIE = 'fazai_session';
/** anexos chegam em base64 dentro da mensagem: 20 MB de arquivo viram ~27 MB de texto */
const MAX_BODY = 30 * 1024 * 1024;
/** o arquivo de export do board inteiro, com os anexos embutidos; separado do limite das mensagens */
const MAX_IMPORT_BODY = LARGE_EXPORT_BYTES;

/** Lê o corpo até `max` bytes; acima disso responde 413 e devolve null. */
function readBody(req: http.IncomingMessage, res: http.ServerResponse, max: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        res.writeHead(413).end('Mensagem grande demais');
        req.destroy();
        resolve(null);
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(size > max ? null : Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
  });
}

function readToken(file: string): string {
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{48}$/.test(saved)) return saved;
  } catch {
    /* ainda não existe */
  }
  const token = randomBytes(24).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, token, { mode: 0o600 });
  return token;
}

const sameSecret = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function page(title: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" href="/icon.png" />
<link rel="stylesheet" href="/index.css" />
<title>${escapeHtml(title)} · Faz AI</title>
</head>
<body>
<div id="root" data-view="board" data-host="web"></div>
<script type="module" src="/main.js"></script>
</body>
</html>`;
}

const DENIED = `<!DOCTYPE html><html lang="pt-BR"><meta charset="UTF-8"><title>Faz AI</title><body style="font:14px system-ui;padding:40px;max-width:520px;margin:auto">
<h2>Board do Faz AI</h2><p>Este endereço precisa do link de acesso completo. Abra o board de novo pelo editor (comando <b>Faz AI: Abrir board no navegador</b>) ou pelo terminal (<code>faz-ai</code>), que o link certo é aberto para você.</p></body></html>`;

/**
 * Serve o board numa página local (só em 127.0.0.1), para usar no navegador, fora do editor. A
 * página é a mesma interface do webview; as mensagens trafegam por SSE (host → página) e POST
 * (página → host). O acesso exige o segredo do link, guardado depois num cookie.
 */
export async function startWebServer(o: WebServerOptions): Promise<WebServer> {
  const token = readToken(o.tokenFile);
  const clients = new Map<string, { bridge: HostBridge; res: http.ServerResponse }>();
  let port = 0;

  const env: HostEnv = { ...o.env, attachmentsBaseUri: () => '/attachments', showFilters: () => {}, pickFiles: async () => undefined };

  const sendFile = (res: http.ServerResponse, file: string, cache = false) => {
    fs.readFile(file, (err, data) => {
      if (err) return void res.writeHead(404).end('Não encontrado');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': cache ? 'private, max-age=3600' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
    });
  };

  /** Caminho dentro de `base`, ou null se o pedido tentar sair dela. */
  const inside = (base: string, rel: string): string | null => {
    const file = path.resolve(base, `.${path.sep}${rel}`);
    return file === base || file.startsWith(base + path.sep) ? file : null;
  };

  const server = http.createServer((req, res) => {
    try {
      serve(req, res);
    } catch {
      // pedido malformado (ex.: % inválido no caminho) não pode derrubar quem serve o board
      if (!res.headersSent) res.writeHead(400);
      res.end();
    }
  });

  const serve = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // só atende quem chega pelo endereço local: barra páginas de fora que apontem um domínio para 127.0.0.1
    if (!new Set([`127.0.0.1:${port}`, `localhost:${port}`]).has(req.headers.host ?? ''))
      return void res.writeHead(403).end('Endereço não permitido');

    const given = url.searchParams.get('t');
    if (given !== null) {
      if (!sameSecret(given, token)) return void res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' }).end(DENIED);
      url.searchParams.delete('t');
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
        Location: url.pathname + url.search,
      });
      return void res.end();
    }
    const cookie = /(?:^|;\s*)fazai_session=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';
    if (!sameSecret(cookie, token)) return void res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' }).end(DENIED);

    const id = url.searchParams.get('c') ?? '';
    if (req.method === 'POST' && url.pathname === '/message') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) return void res.writeHead(403).end();
      const client = clients.get(id);
      if (!client) return void res.writeHead(409).end('Sessão encerrada');
      void readBody(req, res, MAX_BODY).then((body) => {
        if (!body) return;
        let msg: WebviewToHost;
        try {
          msg = JSON.parse(body.toString('utf8')) as WebviewToHost;
        } catch {
          return void res.writeHead(400).end('Mensagem inválida');
        }
        res.writeHead(204).end();
        void client.bridge.handle(msg);
      });
      return;
    }
    // importação do board em duas etapas: o arquivo sobe aqui, é validado e fica estacionado com um resumo;
    // a confirmação segue pela mensagem backup.import.apply normal, como no editor
    if (req.method === 'POST' && url.pathname === '/backup/import') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) return void res.writeHead(403).end();
      const client = clients.get(id);
      if (!client) return void res.writeHead(409).end('Sessão encerrada');
      void readBody(req, res, MAX_IMPORT_BODY).then((body) => {
        if (!body) return;
        try {
          const parsed = parseExportFile(body.toString('utf8'));
          const result = o.router.parkImport(parsed, body.length);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(e instanceof Error ? e.message : String(e));
        }
      });
      return;
    }
    if (req.method !== 'GET') return void res.writeHead(405).end();

    // exportação: a página navega até aqui e o navegador baixa o arquivo; o aviso vai pelo canal de eventos
    if (url.pathname === '/backup/export') {
      const client = clients.get(id);
      if (!client) return void res.writeHead(409).end('Sessão encerrada');
      try {
        const { text, name, warnings } = o.router.exportBoardFile();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name.replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(text);
        client.bridge.post({ type: 'notice', message: exportNotice(name, warnings) });
      } catch (e) {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(e instanceof Error ? e.message : String(e));
        client.bridge.post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    if (url.pathname === '/events') {
      if (!/^[\w-]{8,64}$/.test(id)) return void res.writeHead(400).end();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.socket?.setNoDelay(true);
      res.write('retry: 2000\n\n');
      const previous = clients.get(id);
      previous?.bridge.dispose();
      previous?.res.end();
      const bridge = new HostBridge((msg: HostToWebview) => void res.write(`data: ${JSON.stringify(msg)}\n\n`), o.router, o.viewState, env);
      const client = { bridge, res };
      clients.set(id, client);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        bridge.dispose();
        if (clients.get(id) === client) clients.delete(id);
      });
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
      });
      return void res.end(page(o.router.snapshot().board.name));
    }
    if (url.pathname === '/icon.png' && o.iconFile) return sendFile(res, o.iconFile, true);
    if (url.pathname.startsWith('/attachments/')) {
      const [cardId, storedName] = decodeURIComponent(url.pathname.slice('/attachments/'.length)).split('/');
      // só entrega anexos de cards deste board
      const known = o.router.snapshot().attachments.find((a) => a.cardId === cardId && a.storedName === storedName);
      const file = known && inside(path.resolve(o.router.store.baseDir), path.join(known.cardId, known.storedName));
      return file ? sendFile(res, file, true) : void res.writeHead(404).end('Não encontrado');
    }
    const asset = inside(path.resolve(o.webviewDir), decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    return asset ? sendFile(res, asset) : void res.writeHead(404).end('Não encontrado');
  };

  const listen = (p: number) =>
    new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(p, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  try {
    await listen(o.port ?? 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    await listen(0);
  }
  port = (server.address() as { port: number }).port;

  return {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    port,
    close() {
      for (const { bridge, res } of clients.values()) {
        bridge.dispose();
        res.end();
      }
      clients.clear();
      server.close();
      server.closeAllConnections();
    },
  };
}

/** Porta preferida do board de uma pasta: estável, para o endereço poder ficar nos favoritos. */
export const preferredPort = (workspaceKey: string): number => 47000 + (parseInt(workspaceKey.slice(0, 4), 16) % 1000);
