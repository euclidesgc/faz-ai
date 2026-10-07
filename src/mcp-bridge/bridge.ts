/**
 * Ponte stdio → socket local. O cliente de IA (Claude Code, Cursor…) inicia este script e fala MCP
 * por stdin/stdout; aqui as mensagens são só repassadas ao servidor que roda dentro da extensão.
 */
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { socketPath } from '../extension/mcp/socketPath';

/**
 * Valor que a ferramenta deveria ter trocado e não trocou (`${workspaceFolder}` numa ferramenta que
 * não interpola variáveis): vale como ausente.
 */
const given = (value: string | undefined): string | undefined => (value && !/\$\{[^}]*\}/.test(value) ? value : undefined);

/**
 * Pasta do board: o argumento, a variável FAZAI_WORKSPACE ou a pasta do projeto que a ferramenta
 * informa (o Claude Code passa `CLAUDE_PROJECT_DIR` aos servidores), e na falta dela o diretório
 * atual. Nos dois últimos casos sobe pelos diretórios pais até achar uma pasta com servidor ativo,
 * para funcionar em clientes configurados globalmente (sem a pasta fixa) e iniciados de dentro de uma
 * subpasta do projeto.
 */
function resolveFolder(): string {
  const explicit = given(process.argv[2]) ?? given(process.env.FAZAI_WORKSPACE);
  if (explicit) return path.resolve(explicit);
  const start = path.resolve(given(process.env.CLAUDE_PROJECT_DIR) ?? process.cwd());
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(socketPath(dir))) return dir;
    if (dir === path.dirname(dir)) return start;
  }
}

const folder = resolveFolder();
const target = socketPath(folder);
const OFFLINE = `O board do Faz AI não está acessível. Abra a pasta "${folder}" no editor com a extensão Faz AI ativa, ou rode "faz-ai" nessa pasta, e reconecte.`;

function connect(attempt = 0): void {
  const socket = net.connect(target);
  const onFail = () => {
    // o VSCode pode ainda estar abrindo: tenta por alguns segundos antes de desistir
    if (attempt < 10) setTimeout(() => connect(attempt + 1), 500);
    else offline();
  };
  socket.once('error', onFail);
  socket.once('connect', () => {
    socket.off('error', onFail);
    socket.on('error', (err) => {
      process.stderr.write(`faz-ai: ${err.message}\n`);
      process.exit(1);
    });
    socket.on('close', () => process.exit(0));
    process.stdin.on('end', () => socket.end());
    process.stdin.pipe(socket);
    socket.pipe(process.stdout);
  });
}

/** Sem servidor: responde cada requisição com um erro que explica o que fazer. */
function offline(): void {
  process.stderr.write(`faz-ai: ${OFFLINE}\n`);
  let buf = '';
  const answer = (line: string) => {
    try {
      const msg = JSON.parse(line) as { id?: unknown };
      if (msg.id !== undefined)
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: OFFLINE } }) + '\n');
    } catch {
      /* linha inválida: ignora */
    }
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) answer(line);
    }
  });
  process.stdin.on('end', () => process.exit(1));
  process.stdin.resume();
}

// segura o stdin até conectar, para não perder o `initialize`
process.stdin.pause();
connect();
