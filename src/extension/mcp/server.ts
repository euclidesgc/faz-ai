import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { MessageRouter } from '../panel/messageRouter';
import type { AiRunner } from '../runner';
import { registerTools } from './tools';

export interface McpOptions {
  getRouter: () => Promise<MessageRouter | undefined>;
  /** o runner da pasta, para ferramentas que disparam e aguardam uma execução de IA (ex.: generate_summary) */
  getRunner: () => Promise<AiRunner | undefined>;
  /** pasta do projeto, base para caminhos relativos de anexos */
  workspaceDir: string;
  version: string;
}

const CLIENT_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude',
  cursor: 'Cursor',
  'cursor-vscode': 'Cursor',
};

/**
 * O que o servidor MCP ensina a toda sessão, antes de qualquer ferramenta. O Claude Code corta as instruções
 * de cada servidor em 2.048 caracteres (documentação de 2026-10-13), então elas trazem só o ciclo, com o mais
 * crítico no começo; o detalhe de cada passo vai onde a IA o lê quando precisa: a descrição da ferramenta,
 * as notas do get_card e a skill do fluxo.
 */
export const MCP_INSTRUCTIONS =
  'Board kanban do projeto (Faz AI). As histórias (workflow pai) passam pelas fases do fluxo, que são as colunas, uma por vez até a conclusão; ' +
  'as sub-tarefas (workflow filho) ficam ligadas a uma história. Cards são identificados pelo número (#12). Sinalize o progresso movendo os cards (move_card). ' +
  'Sem um pedido específico, comece por get_pending_work: ele lista o que está com você. get_board mostra colunas, tipos, campos e agentes. ' +
  'Cada card tem um status de trabalho em `work`: "ready" e "approved" estão com você; "waiting_review", "waiting_answer" e "blocked" estão com a pessoa. ' +
  'Ao começar um card chame start_work e siga `phase` do get_card. Nas colunas com `requiresApproval`, ao terminar o trabalho da fase chame request_review e PARE: ' +
  'só mova o card quando o status for "approved". Se a pessoa pedir ajustes, o card volta para "ready" com o pedido na conversa. ' +
  'get_card devolve em `model` o modelo e o esforço que devem executar o card: se forem diferentes dos seus, delegue o trabalho a um subagente com essa configuração; ' +
  'se não for possível, avise a pessoa em vez de executar com outra. ' +
  'Antes de executar, leia os arquivos de `requiredRules` e `requiredSkills` do get_card, mesmo os que não estão na sua lista de skills. ' +
  'Toda conversa com a pessoa sobre um card acontece na conversa do card (add_comment, request_review, ask_question); registre ali decisões e resultados. ' +
  'Faltou informação: ask_question. Impedimento que você não resolve: block_card. ' +
  'Ficou algo dependendo da pessoa (decisão, dado, ponto em aberto que ela precisa avaliar)? Não registre só num comentário: entregue com request_review e `pending`, e o card fica com ela. No modo autônomo nada disso segura o card: decida você, registre e siga. ' +
  'Pull request: sempre com --base em workspace.prBase do get_card. ' +
  'Uso, tokens e tempo: get_metrics. Rules, skills e agentes do projeto: get_harness. Modelos e regras de sugestão: get_models. ' +
  'O detalhe vem onde você precisa: na descrição de cada ferramenta, nas notas do get_card e na skill faz-ai-fluxo.';

/** Cria um servidor MCP (uma sessão) com as ferramentas do board. */
export function createMcpServer(opts: McpOptions): McpServer {
  const server = new McpServer(
    { name: 'faz-ai', version: opts.version },
    {
      instructions: MCP_INSTRUCTIONS,
    },
  );
  registerTools(server, {
    getRouter: async () => {
      const router = await opts.getRouter();
      if (!router) throw new Error('Nenhuma pasta aberta no VSCode.');
      return router;
    },
    getRunner: async () => {
      const runner = await opts.getRunner();
      if (!runner) throw new Error('Nenhuma pasta aberta no VSCode.');
      return runner;
    },
    workspaceDir: opts.workspaceDir,
    author: () => {
      const client = server.server.getClientVersion();
      // o VS Code se apresenta pelo nome do produto ("Visual Studio Code", "Visual Studio Code - Insiders")
      if (client?.name.startsWith('Visual Studio Code')) return 'VS Code';
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
    // no Windows o pipe nomeado em uso por outra janela falha com EADDRINUSE: é o mesmo caso do socket vivo
    listener.once('error', (e: NodeJS.ErrnoException) =>
      reject(isPipe && e.code === 'EADDRINUSE' ? new Error('Já existe um servidor MCP do Faz AI para esta pasta.') : e),
    );
    listener.listen(address, () => {
      listener.removeAllListeners('error');
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
