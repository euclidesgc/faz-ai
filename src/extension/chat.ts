import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_CHAT_MESSAGES, type ChatMessage } from '../shared/chat';
import { aiToolInfo } from '../shared/harness';
import type { AiRunOutcome, RunReport } from '../shared/log';
import { effortToRun } from '../shared/execution';
import { parseModelValue } from '../shared/models';
import type { BoardState } from '../shared/model';
import { spawnMeasured, type SpawnFn } from './aiOutput/measured';
import { BOARD_SERVER, type ExecInput } from './execution';
import { isCliNoise } from './cliNoise';
import { headlessUnsupported } from './headless';
import type { MessageRouter } from './panel/messageRouter';
import { boardServer, PERMISSION_ADVICE, type RunnerDeps, type RunningProcess } from './runner';

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
    model: option ? { name: option.model, effort: effortToRun(option, chosen!.effort) } : null,
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
    // a ferramenta sem suporte para esta permissão nem começa: confere antes de gravar a configuração
    const unsupported = headlessUnsupported(state.board.aiTool, permission);
    if (unsupported) {
      this.deps.runLog?.finish(logId, 'unsupported');
      throw new Error(unsupported);
    }
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

    // o prompt sai da conversa ANTES de a pergunta entrar nela: senão ela iria duas vezes (no histórico e no fim)
    const prompt = chatPrompt(this.messages, body, PERMISSION_ADVICE[permission]);
    this.add({ role: 'user', text: body, ...(model ? { model } : {}) });
    // as últimas linhas legíveis, para explicar um erro; nunca a saída crua, que no modo estruturado é JSONL
    const tail: string[] = [];
    const spawn: SpawnFn = (command, cwd, out) => {
      // a linha da chamada e, na volta para texto, a tentativa recusada não explicam o erro do processo
      tail.length = 0;
      return this.deps.spawn(command, cwd, out);
    };
    let proc: RunningProcess;
    let report: () => RunReport;
    try {
      ({ proc, report } = spawnMeasured(
        state.board.aiTool,
        {
          prompt,
          permission,
          addDirs: this.router.aiWorkDirs(),
          exec,
          boardServer: boardServer(this.deps),
        },
        this.deps.cwd,
        {
          spawn,
          log: (raw) => {
            const line = raw.replace(ANSI, '');
            this.deps.log(`[chat] ${line}`);
            // os avisos de configuração da CLI ficam só no canal: não explicam o erro e empurrariam o motivo real para fora
            if (isCliNoise(line)) return;
            tail.push(line);
            if (tail.length > TAIL_LINES) tail.shift();
          },
          catalog: state.board.modelCatalog,
        },
      ));
    } catch (e) {
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

    proc.onExit((code, error) => {
      clearTimeout(timer);
      this.proc = null;
      const outcome: AiRunOutcome = this.stopped ? 'stopped' : timedOut ? 'timeout' : error || code !== 0 ? 'failed' : 'done';
      this.deps.runLog?.finish(logId, outcome, code);
      const measured = report();
      this.deps.runLog?.measure(logId, measured);
      // a resposta é o texto final que a ferramenta deu, nunca o fluxo de eventos
      const text = measured.answer.replace(ANSI, '').trim();
      if (this.stopped) this.add({ role: 'error', text: 'Interrompido.' });
      else if (timedOut)
        this.add({ role: 'error', text: `A resposta passou do tempo limite (${state.board.runner.timeoutMinutes} min) e foi encerrada.` });
      else if (error) this.add({ role: 'error', text: `Não foi possível executar o ${tool.label}: ${error.message}` });
      else if (code !== 0) {
        const lines = tail.join('\n');
        this.add({ role: 'error', text: `O ${tool.label} terminou com erro (código ${code}).${lines ? `\n\n${lines}` : ''}` });
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
