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

/** O que o servidor MCP ensina a toda sessão, antes de qualquer ferramenta. */
export const MCP_INSTRUCTIONS =
  'Board kanban do projeto (Faz AI). Histórias ficam no workflow pai e sub-tarefas no workflow filho, ligadas a uma história. ' +
  'Cards são identificados pelo número (#12). Comece por get_board para conhecer colunas, tipos e campos. ' +
  'Sinalize o progresso movendo os cards entre colunas e registre decisões e resultados em comentários ou anexos. ' +
  'Toda conversa com a pessoa sobre um card acontece na conversa do card (add_comment, request_review, ask_question). ' +
  'Uma imagem ou arquivo colado numa mensagem aparece como `attachment:<nome>`: o arquivo é o anexo de mesmo nome em `attachments` de get_card, e pode ser lido pelo `path`. ' +
  'Cada card tem um status de trabalho em `work`: "ready" e "approved" estão com você, "waiting_review", "waiting_answer" e "blocked" estão com a pessoa. ' +
  'Ao começar um card chame start_work. Nas colunas com `requiresApproval`, ao terminar o trabalho da fase chame request_review e PARE: ' +
  'só mova o card quando o status for "approved". Se a pessoa pedir ajustes, o card volta para "ready" com o pedido na conversa. ' +
  'Faltou informação: ask_question. Impedimento que você não resolve: block_card. ' +
  'Ficou algo dependendo da pessoa (decisão, dado, ponto em aberto que ela precisa avaliar)? Não registre só num comentário: entregue com request_review e `pending`, e o card fica com ela (status "waiting_review"), mesmo em modo autônomo. ' +
  'Sem um pedido específico, comece por get_pending_work: ele lista o que está com você (aprovados para avançar, mensagens sem resposta, cards prontos). ' +
  'Para perguntas de uso, tokens e tempo (quantos tokens gastou, qual fase/modelo consome mais, quanto tempo levou), use get_metrics em vez de abrir o painel. ' +
  'get_card devolve em `model` a ferramenta, o modelo e o nível de esforço que devem executar o card: antes de trabalhar nele, ' +
  'se o modelo ou o esforço forem diferentes dos seus, delegue o trabalho a um subagente com esse modelo e esforço; ' +
  'se não for possível, avise a pessoa em vez de executar com outra configuração. ' +
  'O campo "Esforço da atividade" é o tamanho da tarefa (não é o esforço do modelo); as regras do board sugerem o modelo a partir dele (get_models). ' +
  'Toda execução pelo board parte de contexto vazio: o que a IA deve conhecer vem no pedido e no get_card, pelo caminho dos arquivos. ' +
  'Os campos "Rules" e "Skills" listam o que o card exige: get_card devolve `requiredRules` e `requiredSkills` com o caminho de cada arquivo, ' +
  'e todos devem ser lidos nesse caminho antes de executar o card, mesmo que não apareçam na sua lista de skills. As opções desses campos e os agentes de get_board são tudo o que o board marcou em Configurações → Harness; não indique nada fora deles. ' +
  'As colunas das histórias são as fases do fluxo; sua intenção é sempre levar a história até a conclusão, uma coluna por vez. ' +
  'get_card devolve em `phase` o que fazer na fase atual e o modelo do documento que ela produz. ' +
  'Sub-tarefas podem depender umas das outras (create_card com depends_on, ou link_cards com "depends_on"): declare a dependência quando uma usa o que a outra produz ou quando as duas alteram os mesmos arquivos. ' +
  'Na Implementação, get_card na história devolve em `subtasksNow.canRunTogether` as sub-tarefas sem dependência pendente: se você tem subagentes, delegue cada uma a um subagente, todos lançados na mesma mensagem para rodarem ao mesmo tempo, cada um com o modelo do card dele, na pasta de trabalho da história e sem fazer commit; ao fim da rodada, verifique o conjunto, faça o commit e leia a história de novo para a próxima rodada. ' +
  'Isso vale mesmo que a skill do fluxo instalada ainda diga para executar uma sub-tarefa por vez. start_work recusa a sub-tarefa que depende de outra ainda em aberto (`waitingFor`). ' +
  'Repita até não sobrar nenhuma que você possa tocar agora: as que estão com a pessoa (`subtasksNow.withPerson`) ou já em execução (`subtasksNow.running`) não são suas; se só restarem as que estão com a pessoa, pare. ' +
  'Testes, build e commit dependem do terminal: sem permissão para rodar comandos, implemente e registre na conversa o que falta rodar; essa parte fica para quem tem permissão. ' +
  'O documento de cada fase é construído numa sub-tarefa (campo Fase = nome da coluna), mas fica anexado à história: grave-o com add_attachment e artifact: true. ' +
  'O harness do projeto (arquivos de regras e skills) também é gerenciado por aqui: veja get_harness.';

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
