import { cardRef } from '../shared/model';
import { aiToolInfo } from '../shared/harness';
import type { CardStatus } from '../shared/status';
import { headlessCommand, type HeadlessCommand } from './headless';
import { requiredSkills } from './mcp/format';
import type { MessageRouter } from './panel/messageRouter';

/** Processo da ferramenta de IA em execução. */
export interface RunningProcess {
  /** chamado uma vez, com o código de saída ou o erro que impediu a execução */
  onExit(listener: (code: number | null, error?: Error) => void): void;
  kill(): void;
}

export interface RunnerDeps {
  /** inicia o comando na pasta do projeto; a saída do processo vai para `log` */
  spawn(command: HeadlessCommand, cwd: string, log: (text: string) => void): RunningProcess;
  log(line: string): void;
  cwd: string;
}

interface Run {
  proc: RunningProcess;
  timer: ReturnType<typeof setTimeout>;
  /** status que o card tinha antes de a execução começar */
  previous: CardStatus | null;
  stopped: boolean;
  timedOut: boolean;
}

const RUNNER_AUTHOR = 'Faz AI';

/** O que a IA recebe ao ser chamada para um card. O ciclo completo está na skill do fluxo e nas instruções do servidor MCP. */
export const cardPrompt = (ref: string, skills: { name: string; path?: string }[] = []): string =>
  [
    `Trabalhe no card ${ref} do board Faz AI, pelas ferramentas do servidor MCP "faz-ai".`,
    // as skills do card vão pelo caminho: valem mesmo desligadas ou fora da invocação automática
    ...(skills.some((k) => k.path) ? [`Antes de começar, leia estas skills, obrigatórias para este card: ${skills.filter((k) => k.path).map((k) => `${k.name} (${k.path})`).join('; ')}.`] : []),
    'Se a skill "faz-ai-fluxo" existir no projeto, siga-a.',
    `Leia o card com get_card (descrição, conversa, anexos e a fase em \`phase\`). Se a última mensagem da conversa for da pessoa, responda a ela pela conversa do card.`,
    'Faça o trabalho da fase em que o card está e termine passando a vez: request_review quando houver algo para revisar, ask_question quando precisar de uma resposta, block_card se houver um impedimento, ou mova o card se a fase não exigir aprovação.',
    'Trabalhe só neste card e nas sub-tarefas dele. Não pergunte nada fora da conversa do card: ninguém está acompanhando esta sessão.',
  ].join('\n');

/**
 * Roda a ferramenta de IA do projeto em segundo plano para um card. Uma execução por card; durante
 * ela o card fica "Em execução". Não depende da API do VSCode.
 */
export class AiRunner {
  private runs = new Map<string, Run>();
  private finishListeners: ((cardId: string) => void)[] = [];

  constructor(private router: MessageRouter, private deps: RunnerDeps) {}

  isRunning(cardId: string): boolean {
    return this.runs.has(cardId);
  }

  get running(): string[] {
    return [...this.runs.keys()];
  }

  /** Inicia a execução. Lança erro se não for possível começar; o resultado aparece no status e na conversa do card. */
  start(cardId: string): void {
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card || card.deletedAt !== null || card.archivedAt !== null) throw new Error('Card não encontrado.');
    if (this.runs.has(cardId)) throw new Error(`A IA já está trabalhando em ${cardRef(card)}.`);
    const tool = aiToolInfo(state.board.aiTool);
    const command = headlessCommand(state.board.aiTool, { prompt: cardPrompt(cardRef(card), requiredSkills(state, card)), permission: state.board.runner.permission, addDirs: this.router.aiWorkDirs() });
    if ('unsupported' in command) throw new Error(command.unsupported);

    const log = (text: string) => this.deps.log(`[${cardRef(card)}] ${text}`);
    const messagesBefore = this.aiMessages(cardId);
    log(`Chamando ${tool.label}: ${command.command} ${command.args.map((a) => (a.length > 80 ? `${a.slice(0, 80)}…` : a)).join(' ')}`);
    const proc = this.deps.spawn(command, this.deps.cwd, (text) => text.split(/\r?\n/).filter(Boolean).forEach(log));
    const run: Run = {
      proc,
      previous: card.status,
      stopped: false,
      timedOut: false,
      timer: setTimeout(() => {
        run.timedOut = true;
        proc.kill();
      }, state.board.runner.timeoutMinutes * 60_000),
    };
    this.runs.set(cardId, run);
    this.setStatus(cardId, 'running', tool.label);
    this.publish();

    proc.onExit((code, error) => {
      clearTimeout(run.timer);
      this.runs.delete(cardId);
      log(error ? `Falhou: ${error.message}` : run.stopped ? 'Interrompida.' : run.timedOut ? 'Encerrada por tempo limite.' : `Terminou (código ${code}).`);
      this.settle(cardId, run, code, error, this.aiMessages(cardId) > messagesBefore, tool.label);
      this.publish();
      this.finishListeners.forEach((fn) => fn(cardId));
    });
  }

  /** Avisa quando a execução de um card termina, seja como for. */
  onDidFinish(listener: (cardId: string) => void): void {
    this.finishListeners.push(listener);
  }

  /** Interrompe a execução do card; o status volta ao que era. */
  stop(cardId: string): void {
    const run = this.runs.get(cardId);
    if (!run) return;
    run.stopped = true;
    run.proc.kill();
  }

  dispose(): void {
    for (const id of this.running) this.stop(id);
  }

  /** Deixa o card num status coerente quando a IA não passou a vez por conta própria. */
  private settle(cardId: string, run: Run, code: number | null, error: Error | undefined, replied: boolean, toolLabel: string): void {
    const card = this.router.snapshot().cards.find((c) => c.id === cardId);
    // a IA (ou a pessoa) já mudou o status durante a execução: é ele que vale
    if (!card || card.status !== 'running') return;
    // restaurar não passa pelas regras da IA (o status anterior pode ser "Aprovado")
    if (run.stopped) return void this.router.handle({ type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous }, { author: RUNNER_AUTHOR });
    if (run.timedOut) return this.block(cardId, `A execução do ${toolLabel} passou do tempo limite e foi encerrada. O log está em Saída → Faz AI.`);
    if (error) return this.block(cardId, `Não foi possível executar o ${toolLabel}: ${error.message}`);
    if (code !== 0) return this.block(cardId, `O ${toolLabel} terminou com erro (código ${code}). O log está em Saída → Faz AI.`);
    // respondeu na conversa e encerrou: a vez é da pessoa
    if (replied) return this.setStatus(cardId, 'waiting_answer', toolLabel);
    this.block(cardId, `O ${toolLabel} encerrou sem responder na conversa nem mudar o status do card. O log está em Saída → Faz AI.`);
  }

  private aiMessages(cardId: string): number {
    return this.router.snapshot().comments.filter((c) => c.cardId === cardId && c.source === 'ai').length;
  }

  private setStatus(cardId: string, status: CardStatus | null, author: string): void {
    this.router.handle({ type: 'card.status.set', cardId, status }, { author, source: 'ai' });
  }

  private block(cardId: string, reason: string): void {
    this.router.handle({ type: 'card.status.set', cardId, status: 'blocked', note: reason }, { author: RUNNER_AUTHOR, source: 'ai' });
  }

  private publish(): void {
    this.router.setAiRuns(this.running);
  }
}
