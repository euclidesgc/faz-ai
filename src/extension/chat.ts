import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MAX_CHAT_MESSAGES, type ChatMessage } from '../shared/chat';
import { aiToolInfo } from '../shared/harness';
import type { AiRunOutcome } from '../shared/log';
import { parseModelValue } from '../shared/models';
import type { BoardState } from '../shared/model';
import { BOARD_SERVER, type ExecInput } from './execution';
import { headlessCommand, tmpArg, type HeadlessCommand } from './headless';
import type { MessageRouter } from './panel/messageRouter';
import { PERMISSION_ADVICE, type RunnerDeps, type RunningProcess } from './runner';

/** Quantas mensagens anteriores entram no prompt, e o tamanho máximo de cada uma. */
const HISTORY = 12;
const MAX_CHARS = 2000;
const TAIL_LINES = 12;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

const newId = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** O que a IA recebe a cada mensagem do chat: o papel dela, o limite da execução, a conversa até aqui e a pergunta nova. */
export function chatPrompt(history: ChatMessage[], text: string, advice: string | null): string {
  const past = history
    .filter((m) => m.role !== 'error')
    .slice(-HISTORY)
    .map((m) => `${m.role === 'user' ? 'Pessoa' : 'Assistente'}: ${m.text.length > MAX_CHARS ? `${m.text.slice(0, MAX_CHARS)}…` : m.text}`);
  return [
    `Você é o assistente do board Faz AI deste projeto e está conversando com a pessoa pelo chat do board. Use as ferramentas do servidor MCP "${BOARD_SERVER}" para consultar e alterar o board (por exemplo get_board, list_cards, get_card, create_card, update_card, move_card, link_cards).`,
    'Responda em português do Brasil, de forma curta e direta. Quando criar ou alterar cards, diga o que fez e cite os IDs (#n). Se o pedido for ambíguo, pergunte antes de agir. Não altere arquivos do projeto: seu trabalho aqui é o board.',
    ...(advice ? [advice] : []),
    ...(past.length ? ['Conversa até agora:', ...past] : []),
    `Pessoa: ${text}`,
  ].join('\n');
}

/** Troca os `{tmp:nome}` dos argumentos por arquivos temporários, como no executor de cards. */
function materialize(command: HeadlessCommand): { command: HeadlessCommand; cleanup: () => void } {
  const files = Object.entries(command.tempFiles ?? {});
  if (!files.length) return { command, cleanup: () => {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-chat-'));
  let args = command.args;
  for (const [name, content] of files) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content, { mode: 0o600 });
    args = args.map((a) => a.split(tmpArg(name)).join(file));
  }
  return { command: { ...command, args }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** O modelo escolhido no chat, no formato que a linha de comando da ferramenta pede; null = o padrão dela. */
function execFor(s: BoardState, model: string | null): ExecInput {
  const chosen = parseModelValue(model);
  const option = chosen ? s.board.modelCatalog.find((o) => o.id === chosen.id && o.tool === s.board.aiTool) : undefined;
  return {
    agent: '',
    mcpAllowed: null,
    mcpBlocked: [],
    mcpConfig: null,
    tools: [],
    deniedTools: [],
    model: option
      ? { name: option.model, effort: chosen!.effort && option.efforts.includes(chosen!.effort) ? chosen!.effort : null }
      : null,
    clean: false,
  };
}

/**
 * Chat com a IA do projeto. Cada mensagem roda a ferramenta em segundo plano (a mesma do executor de
 * cards, com o servidor MCP do board), levando a conversa recente no prompt; a resposta vira uma
 * mensagem. O histórico fica num arquivo da pasta de dados. Não depende da API do VSCode.
 */
export class ChatSession {
  private messages: ChatMessage[];
  private proc: RunningProcess | null = null;
  private stopped = false;

  constructor(
    private router: MessageRouter,
    private deps: RunnerDeps & { file: string },
  ) {
    this.messages = this.load();
    router.setChatHandler((msg) => {
      if (msg.type === 'chat.send') this.send(msg.text, msg.model);
      else if (msg.type === 'chat.stop') this.stop();
      else this.clear();
    });
    this.publish();
  }

  get busy(): boolean {
    return this.proc !== null;
  }

  send(text: string, model: string | null): void {
    const body = text.trim();
    if (!body) return;
    if (this.proc) throw new Error('A IA ainda está respondendo. Espere ou interrompa.');
    const state = this.router.snapshot();
    const tool = aiToolInfo(state.board.aiTool);
    const permission = state.board.runner.permission;
    const exec = execFor(state, model);
    // o chat é a quarta origem de execução, e a única sem card: nenhuma execução nasce da conversa de
    // um card (ela devolve o card para "pronto" e quem executa depois é o heartbeat ou o autopiloto)
    const logId = this.deps.runLog
      ? this.deps.runLog.start({
          boardId: this.router.boardId,
          startedAt: Date.now(),
          origin: 'chat',
          tool: state.board.aiTool,
          cardId: null,
          cardNumber: null,
          cardTitle: '',
          cardType: '',
          workflow: '',
          columnName: '',
          phase: '',
        })
      : '';
    let built;
    try {
      built = headlessCommand(state.board.aiTool, {
        prompt: chatPrompt(this.messages, body, PERMISSION_ADVICE[permission]),
        permission,
        addDirs: this.router.aiWorkDirs(),
        exec,
        boardServer: this.deps.bridgePath ? { command: 'node', args: [this.deps.bridgePath, this.deps.cwd] } : undefined,
      });
      if ('unsupported' in built) throw new Error(built.unsupported);
    } catch (e) {
      this.deps.runLog?.finish(logId, 'unsupported');
      throw e;
    }
    const { command, cleanup } = materialize(built);
    // no chat não há agente do board nem subagente escolhido: `null` é "não definido", não "vazio"
    this.deps.runLog?.describe(logId, {
      model: exec.model?.name ?? null,
      effort: exec.model?.effort ?? null,
      profile: null,
      agent: null,
      permission,
      autonomous: false,
      clean: false,
      skills: [],
      mcp: null,
    });

    this.add({ role: 'user', text: body, ...(model ? { model } : {}) });
    const out: string[] = [];
    let proc: RunningProcess;
    try {
      proc = this.deps.spawn(command, this.deps.cwd, (chunk) => out.push(chunk));
    } catch (e) {
      cleanup();
      // sem processo não há desfecho a medir: o mesmo `unsupported` do executor de cards
      this.deps.runLog?.finish(logId, 'unsupported');
      this.add({ role: 'error', text: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.proc = proc;
    this.stopped = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, state.board.runner.timeoutMinutes * 60_000);
    this.publish();
    this.deps.log(`[chat] Chamando ${tool.label}`);

    proc.onExit((code, error) => {
      clearTimeout(timer);
      cleanup();
      this.proc = null;
      const text = out.join('').replace(ANSI, '').trim();
      const outcome: AiRunOutcome = this.stopped ? 'stopped' : timedOut ? 'timeout' : error || code !== 0 ? 'failed' : 'done';
      this.deps.runLog?.finish(logId, outcome, code);
      if (this.stopped) this.add({ role: 'error', text: 'Interrompido.' });
      else if (timedOut)
        this.add({ role: 'error', text: `A resposta passou do tempo limite (${state.board.runner.timeoutMinutes} min) e foi encerrada.` });
      else if (error) this.add({ role: 'error', text: `Não foi possível executar o ${tool.label}: ${error.message}` });
      else if (code !== 0) {
        const tail = text.split(/\r?\n/).slice(-TAIL_LINES).join('\n');
        this.add({ role: 'error', text: `O ${tool.label} terminou com erro (código ${code}).${tail ? `\n\n${tail}` : ''}` });
      } else this.add({ role: 'assistant', text: text || 'A IA terminou sem escrever uma resposta.' });
    });
  }

  stop(): void {
    if (!this.proc) return;
    this.stopped = true;
    this.proc.kill();
  }

  clear(): void {
    this.stop();
    this.messages = [];
    this.save();
    this.publish();
  }

  dispose(): void {
    this.stop();
  }

  private add(m: Omit<ChatMessage, 'id' | 'at'>): void {
    this.messages = [...this.messages, { id: newId(), at: Date.now(), ...m }].slice(-MAX_CHAT_MESSAGES);
    this.save();
    this.publish();
  }

  private publish(): void {
    this.router.setChat({ messages: this.messages, busy: this.proc !== null });
  }

  private load(): ChatMessage[] {
    try {
      const raw: unknown = JSON.parse(fs.readFileSync(this.deps.file, 'utf8'));
      return Array.isArray(raw)
        ? raw
            .filter(
              (m): m is ChatMessage =>
                !!m && typeof m.id === 'string' && typeof m.text === 'string' && ['user', 'assistant', 'error'].includes(m.role),
            )
            .slice(-MAX_CHAT_MESSAGES)
        : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.deps.file), { recursive: true });
      fs.writeFileSync(this.deps.file, JSON.stringify(this.messages));
    } catch (e) {
      this.deps.log(`[chat] Não foi possível guardar a conversa: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
