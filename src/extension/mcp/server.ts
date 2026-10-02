import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { MessageRouter } from '../panel/messageRouter';
import { registerTools } from './tools';

export interface McpOptions {
  getRouter: () => Promise<MessageRouter | undefined>;
  /** pasta do projeto, base para caminhos relativos de anexos */
  workspaceDir: string;
  version: string;
}

const CLIENT_NAMES: Record<string, string> = { 'claude-code': 'Claude Code', 'claude-ai': 'Claude', cursor: 'Cursor', 'cursor-vscode': 'Cursor' };

/** Cria um servidor MCP (uma sessão) com as ferramentas do board. */
export function createMcpServer(opts: McpOptions): McpServer {
  const server = new McpServer(
    { name: 'faz-ai', version: opts.version },
    {
      instructions:
        'Board kanban do projeto (Faz AI). Histórias ficam no workflow pai e sub-tarefas no workflow filho, ligadas a uma história. ' +
        'Cards são identificados pelo número (#12). Comece por get_board para conhecer colunas, tipos e campos. ' +
        'Sinalize o progresso movendo os cards entre colunas e registre decisões e resultados em comentários ou anexos. ' +
        'get_card devolve em `model` a ferramenta, o modelo e o nível de esforço que devem executar o card: antes de trabalhar nele, ' +
        'se o modelo ou o esforço forem diferentes dos seus, delegue o trabalho a um subagente com esse modelo e esforço; ' +
        'se não for possível, avise a pessoa em vez de executar com outra configuração. ' +
        'O campo "Esforço da atividade" é o tamanho da tarefa (não é o esforço do modelo); as regras do board sugerem o modelo a partir dele (get_models). ' +
        'O campo "Skills" lista as skills obrigatórias do card: get_card devolve `requiredSkills` com o caminho de cada SKILL.md, ' +
        'e todas devem ser carregadas antes de executar o card (outras skills continuam podendo ser usadas normalmente). ' +
        'As colunas das histórias são as fases do SDD; mova a história para a próxima coluna ao concluir cada fase. ' +
        'O harness do projeto (arquivos de regras e skills) também é gerenciado por aqui: veja get_harness.',
    },
  );
  registerTools(server, {
    getRouter: async () => {
      const router = await opts.getRouter();
      if (!router) throw new Error('Nenhuma pasta aberta no VSCode.');
      return router;
    },
    workspaceDir: opts.workspaceDir,
    author: () => {
      const client = server.server.getClientVersion();
      // o VS Code se apresenta pelo nome do produto ("Visual Studio Code", "Visual Studio Code - Insiders"); quem fala por ele é o Copilot
      if (client?.name.startsWith('Visual Studio Code')) return 'GitHub Copilot';
      return (client && (CLIENT_NAMES[client.name] ?? client.title ?? client.name)) || 'IA';
    },
  });
  return server;
}

/** Transporte MCP sobre um socket: uma mensagem JSON por linha, como no stdio. */
class SocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private buf = '';

  constructor(private socket: net.Socket) {}

  async start(): Promise<void> {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buf += chunk;
      let i: number;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        try {
          this.onmessage?.(JSON.parse(line) as JSONRPCMessage);
        } catch (e) {
          this.onerror?.(e instanceof Error ? e : new Error(String(e)));
        }
      }
    });
    this.socket.on('error', (e) => this.onerror?.(e));
    this.socket.on('close', () => this.onclose?.());
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.socket.destroyed) this.socket.write(JSON.stringify(message) + '\n');
  }

  async close(): Promise<void> {
    this.socket.end();
  }
}

function isAlive(address: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.connect(address);
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });
}

/**
 * Escuta no socket local e atende cada conexão com uma sessão MCP própria.
 * Devolve uma função que encerra o servidor.
 */
export async function startMcpServer(address: string, opts: McpOptions): Promise<() => void> {
  const isPipe = address.startsWith('\\\\');
  if (!isPipe) {
    fs.mkdirSync(path.dirname(address), { recursive: true, mode: 0o700 });
    if (fs.existsSync(address)) {
      // outra janela do VSCode já atende esta pasta; um socket sem dono é resto de uma sessão anterior
      if (await isAlive(address)) throw new Error('Já existe um servidor MCP do Faz AI para esta pasta.');
      fs.rmSync(address, { force: true });
    }
  }
  const sockets = new Set<net.Socket>();
  const listener = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    void createMcpServer(opts)
      .connect(new SocketTransport(socket))
      .catch(() => socket.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(address, () => {
      listener.off('error', reject);
      resolve();
    });
  });
  if (!isPipe) fs.chmodSync(address, 0o600);
  return () => {
    sockets.forEach((s) => s.destroy());
    listener.close();
    if (!isPipe) fs.rmSync(address, { force: true });
  };
}
