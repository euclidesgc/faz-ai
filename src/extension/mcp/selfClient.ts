// O board como cliente do próprio servidor MCP (épica "ferramenta por modo", história 10). No modo API
// não há ferramenta para iniciar a ponte `mcp-bridge.js`: quem chama as ferramentas do board é o laço da
// extensão. Ele fala com o MESMO servidor que atende a pasta (`startMcpServer`, um por pasta, no socket
// de `socketPath`), pelo mesmo protocolo da ponte: uma mensagem JSON por linha, com o token da execução
// na primeira linha quando houver. Nada aqui inicia um servidor: se nenhum atende a pasta, a conexão
// falha, como a ponte falharia, e o board nunca fica com dois servidores para a mesma pasta.
import * as net from 'node:net';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { socketPath } from './socketPath';

const RUN_TOKEN = /^[a-f0-9]{64}$/;

export class BoardSocketClientTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private socket: net.Socket | null = null;
  private buf = '';

  constructor(
    private readonly address: string,
    private readonly runToken?: string,
  ) {
    // o token vai na primeira linha, como a ponte manda; um valor fora do formato nunca sai daqui
    if (runToken !== undefined && !RUN_TOKEN.test(runToken)) throw new Error('Token de execução inválido.');
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.address);
      socket.setEncoding('utf8');
      // a mensagem não repete o endereço nem o token: ela pode ir para o log da execução
      socket.once('error', () => reject(new Error('O servidor MCP do board desta pasta não está acessível.')));
      socket.once('connect', () => {
        socket.removeAllListeners('error');
        socket.on('error', (e) => this.onerror?.(e));
        socket.on('close', () => this.onclose?.());
        socket.on('data', (chunk: string) => this.receive(chunk));
        if (this.runToken !== undefined) socket.write(JSON.stringify({ fazai: { run: this.runToken } }) + '\n');
        this.socket = socket;
        resolve();
      });
    });
  }

  private receive(chunk: string): void {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      try {
        this.onmessage?.(JSON.parse(line) as JSONRPCMessage);
      } catch {
        this.onerror?.(new Error('Mensagem MCP inválida do servidor do board.'));
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.socket && !this.socket.destroyed) this.socket.write(JSON.stringify(message) + '\n');
  }

  async close(): Promise<void> {
    this.socket?.end();
  }
}

/** O transporte até o servidor do board que atende a pasta, com o token da execução quando ela tem um. */
export const boardSelfTransport = (folder: string, runToken?: string): Transport =>
  new BoardSocketClientTransport(socketPath(folder), runToken);
