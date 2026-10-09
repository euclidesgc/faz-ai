import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_CHAT_MESSAGES, type ChatMessage } from '../shared/chat';
import { aiToolInfo } from '../shared/harness';
import type { RunnerPermission } from '../shared/runner';
import { effortToRun } from '../shared/execution';
import { parseModelValue } from '../shared/models';
import type { BoardState } from '../shared/model';
import { NO_CARD, type AiExecution } from './ai/gateway';
import { BOARD_SERVER, bareExec, type ExecInput } from './execution';
import { contextLines } from './promptContext';
import { isCliNoise } from './cliNoise';
import type { MessageRouter } from './panel/messageRouter';
import { boardServer, PERMISSION_ADVICE, type RunnerDeps } from './runner';

/** Quantas mensagens anteriores entram no prompt, e o tamanho máximo de cada uma. */
const HISTORY = 12;
const MAX_CHARS = 2000;
const TAIL_LINES = 12;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

const newId = (): string => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** O que a IA recebe a cada mensagem do chat: o papel dela, o contexto fixo do board, o limite da execução, a conversa até aqui e a pergunta nova. */
export function chatPrompt(history: ChatMessage[], text: string, advice: string | null, always: string[] = []): string {
  const past = history
    .filter((m) => m.role !== 'error')
    .slice(-HISTORY)
    .map((m) => `${m.role === 'user' ? 'Pessoa' : 'Assistente'}: ${m.text.length > MAX_CHARS ? `${m.text.slice(0, MAX_CHARS)}…` : m.text}`);
  return [
    `Você é o assistente do board Faz AI deste projeto e está conversando com a pessoa pelo chat do board. Use as ferramentas do servidor MCP "${BOARD_SERVER}" para consultar e alterar o board (por exemplo get_board, list_cards, get_card, create_card, update_card, move_card, link_cards).`,
    'Responda em português do Brasil, de forma curta e direta. Quando criar ou alterar cards, diga o que fez e cite os IDs (#n). Se o pedido for ambíguo, pergunte antes de agir. Não altere arquivos do projeto: seu trabalho aqui é o board.',
    ...always,
    ...(advice ? [advice] : []),
    ...(past.length ? ['Conversa até agora:', ...past] : []),
    `Pessoa: ${text}`,
  ].join('\n');
}

/** O que a IA recebe no "Sugerir agentes com IA": ler o projeto e propor os agentes do board, criando e ajustando arquivos de agente pelo MCP. */
export function suggestAgentsPrompt(): string {
  return [
    'Você vai propor os agentes de execução deste board Faz AI, pelas ferramentas do servidor MCP "faz-ai". Um agente é um arquivo de agente da ferramenta de IA (instruções, modelo, ferramentas, skills) que o board usa para executar os cards.',
    'Leia o projeto para entender o que ele é (estrutura de pastas, package.json/pyproject/pubspec, README, linguagens e frameworks) e o board: get_board (agentes atuais, campos, regras de modelo), get_harness com onlySelected = false (tudo que a ferramenta carrega, com a marcação do board) e get_models (catálogo de modelos).',
    'Proponha de 3 a 8 agentes que façam sentido para ESTE projeto. Para cada um: se já existir um parecido, ajuste-o com update_agent (patch com description, body, model, tools, skills); senão, crie com create_agent (scope "user", available true). Descrição de uma frase que diga quando usá-lo; instruções curtas e específicas do projeto (padrões, comandos de teste, pastas); skills só entre as marcadas em get_harness; modelo pelo catálogo de get_models (valor como no campo Modelo, ex.: "claude:sonnet@medium"), seguindo as regras de esforço do board.',
    'Mantenha um agente condutor (que conduz os cards pelo fluxo e delega aos especialistas) como padrão do board.',
    'Não altere arquivos do projeto nem rode comandos: só as ferramentas do board. Termine com um resumo em português do Brasil: nome → para quê, o que criou e o que ajustou.',
  ].join('\n');
}

/** O modelo escolhido no chat, no formato que a linha de comando da ferramenta pede; null = o padrão dela. */
function modelFor(s: BoardState, model: string | null): ExecInput['model'] {
  const chosen = parseModelValue(model);
  const option = chosen ? s.board.modelCatalog.find((o) => o.id === chosen.id && o.tool === s.board.aiTool) : undefined;
  return option ? { name: option.model, effort: effortToRun(option, chosen!.effort) } : null;
}

/**
 * Chat com a IA do projeto. Cada mensagem roda a ferramenta em segundo plano (a mesma do executor de
 * cards, com o servidor MCP do board), levando a conversa recente no prompt; a resposta vira uma
 * mensagem. O histórico fica num arquivo da pasta de dados. Não depende da API do VSCode.
 */
export class ChatSession {
  private messages: ChatMessage[];
  private running: AiExecution | null = null;

  constructor(
    private router: MessageRouter,
    private deps: RunnerDeps & { file: string },
  ) {
    this.messages = this.load();
    router.setChatHandler((msg) => {
      if (msg.type === 'chat.send') this.send(msg.text, msg.model);
      else if (msg.type === 'ai.suggestAgents') this.suggestAgents();
      else if (msg.type === 'chat.stop') this.stop();
      else this.clear();
    });
    this.publish();
  }

  get busy(): boolean {
    return this.running !== null;
  }

  send(text: string, model: string | null): void {
    const body = text.trim();
    if (!body) return;
    const state = this.router.snapshot();
    // o prompt sai da conversa ANTES de a pergunta entrar nela: senão ela iria duas vezes (no histórico e no fim)
    const prompt = chatPrompt(this.messages, body, PERMISSION_ADVICE[state.board.runner.permission], contextLines(state).always);
    this.run({ role: 'user', text: body, ...(model ? { model } : {}) }, prompt, state.board.runner.permission, model);
  }

  /** A IA lê o projeto e propõe os agentes do board; a conversa registra o pedido e o resultado. */
  suggestAgents(): void {
    const state = this.router.snapshot();
    const prompt = [suggestAgentsPrompt(), ...contextLines(state).always].join('\n');
    // criar e marcar agentes é trabalho do board: roda só com ele
    this.run({ role: 'user', text: 'Sugerir agentes com IA: leia o projeto e proponha os agentes deste board.' }, prompt, 'board', null);
  }

  /** Uma execução do chat pelo gateway: a mensagem entra na conversa quando o processo começa, e a resposta (ou o erro) no fim. */
  private run(message: Omit<ChatMessage, 'id' | 'at'>, prompt: string, permission: RunnerPermission, model: string | null): void {
    if (this.running) throw new Error('A IA ainda está respondendo. Espere ou interrompa.');
    const state = this.router.snapshot();
    const tool = aiToolInfo(state.board.aiTool);
    // sem card não há agente: contexto vazio, só o servidor do board e o modelo escolhido
    const plan = bareExec(modelFor(state, model), boardServer(this.deps));
    // as últimas linhas legíveis, para explicar um erro; nunca a saída crua, que no modo estruturado é JSONL
    const tail: string[] = [];
    let started = false;
    let execution: AiExecution;
    try {
      // o chat é a quarta origem de execução, e a única sem card: nenhuma execução nasce da conversa de
      // um card (ela devolve o card para "pronto" e quem executa depois é o heartbeat ou o autopiloto)
      execution = this.deps.gateway.run({
        origin: 'chat',
        tool: state.board.aiTool,
        context: NO_CARD,
        cwd: this.deps.cwd,
        timeoutMinutes: state.board.runner.timeoutMinutes,
        // no chat não há agente do board nem subagente escolhido: `null` é "não definido", não "vazio"
        prepare: () => ({
          config: {
            model: plan.model?.name ?? null,
            effort: plan.model?.effort ?? null,
            profile: null,
            agent: null,
            autonomous: false,
            // toda execução pelo board parte de contexto vazio
            clean: true,
            skills: [],
            mcp: [],
          },
          input: {
            prompt,
            permission,
            addDirs: this.router.aiWorkDirs(),
            exec: plan,
            boardServer: boardServer(this.deps),
          },
        }),
        beforeSpawn: () => {
          started = true;
          this.add(message);
        },
        log: (raw) => {
          const line = raw.replace(ANSI, '');
          this.deps.log(`[chat] ${line}`);
          // os avisos de configuração da CLI ficam só no canal: não explicam o erro e empurrariam o motivo real para fora
          if (isCliNoise(line)) return;
          tail.push(line);
          if (tail.length > TAIL_LINES) tail.shift();
        },
        // a linha da chamada e, na volta para texto, a tentativa recusada não explicam o erro do processo
        onAttempt: () => {
          tail.length = 0;
        },
      });
    } catch (e) {
      // antes da pergunta entrar na conversa (ferramenta sem suporte para a permissão): quem enviou fica sabendo
      if (!started) throw e;
      // sem processo não há desfecho a medir: o log já fechou a linha como `unsupported`
      this.add({ role: 'error', text: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.running = execution;
    this.publish();

    execution.onExit((end) => {
      this.running = null;
      // a resposta é o texto final que a ferramenta deu, nunca o fluxo de eventos
      const text = end.report.answer.replace(ANSI, '').trim();
      if (end.stopped) this.add({ role: 'error', text: 'Interrompido.' });
      else if (end.timedOut)
        this.add({ role: 'error', text: `A resposta passou do tempo limite (${state.board.runner.timeoutMinutes} min) e foi encerrada.` });
      else if (end.error) this.add({ role: 'error', text: `Não foi possível executar o ${tool.label}: ${end.error.message}` });
      else if (end.code !== 0) {
        const lines = tail.join('\n');
        this.add({ role: 'error', text: `O ${tool.label} terminou com erro (código ${end.code}).${lines ? `\n\n${lines}` : ''}` });
      } else this.add({ role: 'assistant', text: text || 'A IA terminou sem escrever uma resposta.' });
    });
  }

  stop(): void {
    this.running?.stop();
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
    this.router.setChat({ messages: this.messages, busy: this.running !== null });
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
