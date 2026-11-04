import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { MessageRouter } from '../panel/messageRouter';
import type { AiRunner } from '../runner';
import { registerTools, type ToolAudience } from './tools';

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
  // o nome que a CLI do Kimi Code manda no clientInfo; a calibrar se uma versão nova usar outro
  'kimi-code': 'Kimi Code',
  kimi: 'Kimi Code',
  // o próprio board no modo API (`drivers/gemini/api.ts`): quem escreve na conversa é o Gemini
  'faz-ai-gemini-api': 'Gemini',
};

/**
 * O que o servidor MCP ensina a toda sessão, antes de qualquer ferramenta. O Claude Code corta as instruções
 * de cada servidor em 2.048 caracteres (documentação de 2026-10-13), então elas trazem só o ciclo, com o mais
 * crítico no começo; o detalhe de cada passo vai onde a IA o lê quando precisa: a descrição da ferramenta,
 * as notas do get_card e a skill do fluxo (get_skill). Nem toda ferramenta lê estas instruções: o fluxo também
 * chega pelo `flowNote` e por `requiredSkills`. O texto é neutro: sem nome de ferramenta nem pasta dela.
 */
export const MCP_INSTRUCTIONS =
  'Board kanban do projeto (Faz AI). Antes de trabalhar nele, leia o fluxo com get_skill faz-ai-fluxo e siga-o. As histórias (workflow pai) passam pelas fases do fluxo, que são as colunas, uma por vez até a conclusão; ' +
  'as sub-tarefas (workflow filho) ficam ligadas a uma história. Sinalize o progresso com move_card. ' +
  'Sem pedido, comece por get_pending_work: ele lista o que está com você. get_board: Plan, refinar, editar board. ' +
  '`work`: "ready" e "approved" estão com você ("verifying": só o board mexe); "waiting_review", "waiting_answer" e "blocked", com a pessoa. ' +
  'Ao começar um card chame start_work (numa sub-tarefa, já a move para Em andamento) e siga `phase` do get_card; conclua com move_card e `comment`. Nas colunas com `requiresApproval`, ao terminar o trabalho da fase chame request_review e PARE: ' +
  'só mova o card quando o status for "approved". Se a pessoa pedir ajustes, o card volta para "ready" com o pedido na conversa. ' +
  '`model` do get_card é o modelo que deve executar o card, e `tool` o perfil de CLI da execução: se for outro, avise a pessoa. ' +
  'Antes de executar, leia as `requiredRules` do get_card e as `requiredSkills` (o arquivo em `path` ou, sem `path`, por get_skill). ' +
  'Toda conversa com a pessoa sobre um card acontece na conversa do card (add_comment, request_review, ask_questions); registre ali decisões e resultados. ' +
  'Pergunta com alternativas: ask_questions; aberta: ask_question. Impedimento que você não resolve: block_card. ' +
  'Ponto em aberto da pessoa: request_review e `pending`. No modo autônomo nada disso segura o card: decida, registre e siga. ' +
  'Pull request: sempre com --base em workspace.prBase do get_card. ' +
  'Termine a resposta de um card com um bloco JSON {"outcome": DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED, "summary", "failure_reason", "pending"}; as ferramentas vencem, o bloco é conferido no fim. ' +
  'Uso: get_metrics. Regras, skills, agentes e MCPs do board: get_harness. Perfil de CLI e modelos: get_models. ' +
  'O detalhe vem na descrição de cada ferramenta, nas notas do get_card e nas skills faz-ai-* (get_skill).';

/**
 * Cria um servidor MCP (uma sessão) com as ferramentas do board. A sessão de uma execução (a que se apresenta com o
 * token do run) recebe só as ferramentas da execução; a da pessoa, o board inteiro.
 */
export function createMcpServer(
  opts: McpOptions,
  sessionToken: () => string | undefined = () => undefined,
  audience: ToolAudience = 'interactive',
): McpServer {
  const server = new McpServer(
    { name: 'faz-ai', version: opts.version },
    {
      instructions: MCP_INSTRUCTIONS,
    },
  );
  registerTools(
    server,
    {
      getRouter: async () => {
        const router = await opts.getRouter();
        if (!router) throw new Error('Nenhuma pasta aberta no VSCode.');
        return router;
      },
      getRunner: async () => {
        const runner = await opts.getRunner();
        if (!runner) throw new Error('Nenhuma pasta aberta no VSCode.');
        const token = sessionToken();
        if (token === undefined) return runner;
        const router = await opts.getRouter();
        if (!router) throw new Error('Nenhuma pasta aberta no VSCode.');
        router.executions.assert(token);
        return new Proxy(runner, {
          get(target, key) {
            const value = Reflect.get(target, key, target);
            return typeof value === 'function'
              ? (...args: unknown[]) => {
                  router.executions.assert(token);
                  return Reflect.apply(value, target, args);
                }
              : value;
          },
        });
      },
      workspaceDir: opts.workspaceDir,
      sessionToken,
      author: () => {
        const client = server.server.getClientVersion();
        // o VS Code se apresenta pelo nome do produto ("Visual Studio Code", "Visual Studio Code - Insiders")
        if (client?.name.startsWith('Visual Studio Code')) return 'VS Code';
        return (client && (CLIENT_NAMES[client.name] ?? client.title ?? client.name)) || 'IA';
      },
    },
    audience,
  );
  return server;
}

/** O formato do token com que a ponte de uma execução se apresenta na primeira linha do socket. */
const RUN_TOKEN = /^[a-f0-9]{64}$/;

/**
 * A primeira linha de uma conexão: a apresentação da execução (`{"fazai":{"run":"<token>"}}`, nada mais), uma
 * mensagem MCP comum (a sessão da pessoa) ou lixo. A apresentação só vale nessa linha: depois dela, qualquer
 * mensagem com `fazai` fecha a conexão, para a identidade da sessão não mudar no meio.
 */
export function parseFirstLine(line: string): { kind: 'run'; token: string } | { kind: 'message' } | { kind: 'invalid' } {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return { kind: 'invalid' };
  }
  if (!message || typeof message !== 'object') return { kind: 'invalid' };
  if (!('fazai' in message)) return { kind: 'message' };
  const header = (message as { fazai?: { run?: unknown } }).fazai;
  if (
    Object.keys(message).length !== 1 ||
    !header ||
    typeof header !== 'object' ||
    Object.keys(header).length !== 1 ||
    typeof header.run !== 'string' ||
    !RUN_TOKEN.test(header.run)
  )
    return { kind: 'invalid' };
  return { kind: 'run', token: header.run };
}

/**
 * Transporte MCP sobre um socket: uma mensagem JSON por linha, como no stdio. `initial` é o que o socket já
 * entregou antes de a sessão existir (a primeira linha decide que sessão criar) e é lido antes do resto.
 */
class SocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private buf: string;

  constructor(
    private socket: net.Socket,
    initial = '',
  ) {
    this.buf = initial;
  }

  async start(): Promise<void> {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buf += chunk;
      this.drain();
    });
    this.socket.on('error', (e) => this.onerror?.(e));
    this.socket.on('close', () => this.onclose?.());
    this.socket.resume();
    this.drain();
  }

  private drain(): void {
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      try {
        const message: unknown = JSON.parse(line);
        // a apresentação só vale na primeira linha da conexão, lida antes de a sessão existir
        if (message && typeof message === 'object' && 'fazai' in message) {
          this.socket.destroy();
          return;
        }
        this.onmessage?.(message as JSONRPCMessage);
      } catch {
        // Erros do parser podem incluir a linha original; nunca registrar um bearer do run.
        this.onerror?.(new Error('Mensagem MCP inválida.'));
        this.socket.destroy();
        return;
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.socket.destroyed) this.socket.write(JSON.stringify(message) + '\n');
  }

  async close(): Promise<void> {
    this.socket.end();
  }
}

export const SERVED_ELSEWHERE = 'Já existe um servidor MCP do Faz AI para esta pasta.';

/**
 * `startMcpServer` que espera o socket liberar antes de concluir que outro lugar serve a pasta. Ao recarregar a
 * janela ou reinstalar a extensão, o editor sobe o host novo antes de o anterior terminar de sair, e o socket
 * dele ainda responde por alguns segundos: sem esperar, a janela avisava "já está aberto em outro lugar" e
 * ficava sem servir o board até recarregar de novo.
 */
export async function startMcpServerWhenFree(
  address: string,
  opts: McpOptions,
  wait: { attempts: number; delayMs: number } = { attempts: 15, delayMs: 1000 },
): Promise<() => void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await startMcpServer(address, opts);
    } catch (e) {
      if (!(e instanceof Error && e.message === SERVED_ELSEWHERE) || attempt >= wait.attempts) throw e;
      await new Promise((r) => setTimeout(r, wait.delayMs));
    }
  }
}

/**
 * Enquanto outro lugar serve a pasta, confere de tempos em tempos se ele saiu. Sem isso, a janela que desistiu de
 * servir o board ficava sem servidor depois de a outra fechar, e a IA de toda execução encontrava o board
 * inacessível até alguém recarregar a janela. `takeOver` sobe o servidor aqui (falhar deixa conferindo de novo);
 * quando a janela não pode assumir sozinha (`canTakeOver` falso: o board dela já foi carregado e pode estar
 * desatualizado em relação ao que a outra gravou), `released` avisa e a conferência para.
 */
export function watchBoardRelease(
  address: string,
  o: { canTakeOver: () => boolean; takeOver: () => Promise<void>; released: () => void; intervalMs?: number },
): () => void {
  let checking = false;
  const timer = setInterval(() => {
    if (checking) return;
    checking = true;
    void (async () => {
      if (await isAlive(address)) return;
      if (!o.canTakeOver()) {
        clearInterval(timer);
        return o.released();
      }
      try {
        await o.takeOver();
        clearInterval(timer);
      } catch {
        // outra janela assumiu antes: continua conferindo
      }
    })().finally(() => (checking = false));
  }, o.intervalMs ?? 10_000);
  return () => clearInterval(timer);
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
      if (await isAlive(address)) throw new Error(SERVED_ELSEWHERE);
      fs.rmSync(address, { force: true });
    }
  }
  const sockets = new Set<net.Socket>();
  const listener = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    // a primeira linha diz que sessão é: a execução de um card (com o token do run) recebe só as ferramentas da
    // execução, e isso tem de estar decidido antes do initialize, porque o tools/list vem logo depois
    socket.setEncoding('utf8');
    let head = '';
    const onFirst = (chunk: string) => {
      head += chunk;
      const i = head.indexOf('\n');
      if (i < 0) return;
      socket.off('data', onFirst);
      socket.pause();
      const first = parseFirstLine(head.slice(0, i).trim());
      if (first.kind === 'invalid') {
        socket.destroy();
        return;
      }
      const token = first.kind === 'run' ? first.token : undefined;
      const rest = first.kind === 'run' ? head.slice(i + 1) : head;
      void createMcpServer(opts, () => token, token ? 'execution' : 'interactive')
        .connect(new SocketTransport(socket, rest))
        .catch(() => socket.destroy());
    };
    socket.on('data', onFirst);
  });
  await new Promise<void>((resolve, reject) => {
    // no Windows o pipe nomeado em uso por outra janela falha com EADDRINUSE: é o mesmo caso do socket vivo
    listener.once('error', (e: NodeJS.ErrnoException) => reject(isPipe && e.code === 'EADDRINUSE' ? new Error(SERVED_ELSEWHERE) : e));
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
