import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cardRef } from '../shared/model';
import { aiToolInfo } from '../shared/harness';
import type { RunnerPermission } from '../shared/runner';
import type { CardStatus } from '../shared/status';
import { executionPlan } from './execution';
import { headlessCommand, tmpArg, type HeadlessCommand } from './headless';
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
  /** home do usuário, de onde se lê a configuração de servidores MCP da ferramenta */
  homeDir?: string;
  /** bridge.js do servidor MCP do board: com ele a ferramenta alcança o board mesmo sem estar registrada no projeto */
  bridgePath?: string;
}

interface Run {
  proc: RunningProcess;
  timer: ReturnType<typeof setTimeout>;
  /** status que o card tinha antes de a execução começar */
  previous: CardStatus | null;
  stopped: boolean;
  timedOut: boolean;
  /** últimas linhas que a ferramenta escreveu, para explicar uma falha no próprio card */
  tail: string[];
}

const RUNNER_AUTHOR = 'Faz AI';
const TAIL_LINES = 12;
const WHERE = 'Configurações → Harness de IA → "O que a IA pode fazer"';

/** O que a IA precisa saber sobre o limite da execução, para explicar à pessoa em vez de falhar sem contexto. */
export const PERMISSION_ADVICE: Record<RunnerPermission, string | null> = {
  board: `Nesta execução você só lê o projeto e usa as ferramentas do board: alterar arquivos e rodar comandos está bloqueado. Se o trabalho pedir isso, não tente contornar: chame block_card explicando que a pessoa precisa escolher "Board e arquivos do projeto" ou "Sem restrições" em ${WHERE} e chamar a IA de novo.`,
  edits: `Nesta execução você cria e altera arquivos do projeto, mas não roda comandos de terminal (testes, git, instalações). Se o trabalho exigir comandos, faça o que der e chame block_card explicando que a pessoa precisa escolher "Sem restrições" em ${WHERE}.`,
  full: null,
};

/** Grava os arquivos temporários do comando numa pasta só do usuário e troca os `{tmp:nome}` dos argumentos pelos caminhos. */
function materialize(command: HeadlessCommand): { command: HeadlessCommand; cleanup: () => void } {
  const files = Object.entries(command.tempFiles ?? {});
  if (!files.length) return { command, cleanup: () => {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-run-'));
  let args = command.args;
  for (const [name, content] of files) {
    const file = path.join(dir, name);
    // pode ter segredos (variáveis dos servidores MCP): só o dono lê
    fs.writeFileSync(file, content, { mode: 0o600 });
    args = args.map((a) => a.split(tmpArg(name)).join(file));
  }
  return { command: { ...command, args }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** O que a IA recebe ao ser chamada para um card. O ciclo completo está na skill do fluxo e nas instruções do servidor MCP. */
export const cardPrompt = (ref: string, skills: { name: string; path?: string }[] = [], advice: string[] = []): string =>
  [
    `Trabalhe no card ${ref} do board Faz AI, pelas ferramentas do servidor MCP "faz-ai".`,
    // as skills do card vão pelo caminho: valem mesmo desligadas ou fora da invocação automática
    ...(skills.some((k) => k.path)
      ? [
          `Antes de começar, leia estas skills, obrigatórias para este card: ${skills
            .filter((k) => k.path)
            .map((k) => `${k.name} (${k.path})`)
            .join('; ')}.`,
        ]
      : []),
    'Se a skill "faz-ai-fluxo" existir no projeto, siga-a.',
    `Leia o card com get_card (descrição, conversa, anexos e a fase em \`phase\`). Se a última mensagem da conversa for da pessoa, responda a ela pela conversa do card.`,
    'Faça o trabalho da fase em que o card está e termine passando a vez: request_review quando houver algo para revisar, ask_question quando precisar de uma resposta, block_card se houver um impedimento, ou mova o card se a fase não exigir aprovação.',
    ...advice,
    'Trabalhe só neste card e nas sub-tarefas dele. Não pergunte nada fora da conversa do card: ninguém está acompanhando esta sessão.',
  ].join('\n');

/**
 * Roda a ferramenta de IA do projeto em segundo plano para um card. Uma execução por card; durante
 * ela o card fica "Em execução". Não depende da API do VSCode.
 */
export class AiRunner {
  private runs = new Map<string, Run>();
  private finishListeners: ((cardId: string) => void)[] = [];

  constructor(
    private router: MessageRouter,
    private deps: RunnerDeps,
  ) {}

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
    const plan = executionPlan(state, card, this.deps.cwd, this.deps.homeDir ?? '');
    const permissionAdvice = PERMISSION_ADVICE[state.board.runner.permission];
    const built = headlessCommand(state.board.aiTool, {
      prompt: cardPrompt(cardRef(card), requiredSkills(state, card), [...plan.advice, ...(permissionAdvice ? [permissionAdvice] : [])]),
      permission: state.board.runner.permission,
      addDirs: this.router.aiWorkDirs(),
      exec: plan.input,
      boardServer: this.deps.bridgePath ? { command: 'node', args: [this.deps.bridgePath, this.deps.cwd] } : undefined,
    });
    if ('unsupported' in built) throw new Error(built.unsupported);
    const { command, cleanup } = materialize(built);

    const log = (text: string) => this.deps.log(`[${cardRef(card)}] ${text}`);
    const messagesBefore = this.aiMessages(cardId);
    if (plan.manifest.profile || plan.manifest.model) log(plan.summary.join(' | '));
    log(`Chamando ${tool.label}: ${command.command} ${command.args.map((a) => (a.length > 80 ? `${a.slice(0, 80)}…` : a)).join(' ')}`);
    const tail: string[] = [];
    let proc: RunningProcess;
    try {
      proc = this.deps.spawn(command, this.deps.cwd, (text) =>
        text
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((line) => {
            log(line);
            tail.push(line.length > 300 ? `${line.slice(0, 300)}…` : line);
            if (tail.length > TAIL_LINES) tail.shift();
          }),
      );
    } catch (e) {
      cleanup();
      throw e;
    }
    const run: Run = {
      proc,
      previous: card.status,
      stopped: false,
      timedOut: false,
      tail,
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
      cleanup();
      this.runs.delete(cardId);
      log(
        error
          ? `Falhou: ${error.message}`
          : run.stopped
            ? 'Interrompida.'
            : run.timedOut
              ? 'Encerrada por tempo limite.'
              : `Terminou (código ${code}).`,
      );
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
    if (run.stopped)
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
    // o fim do que a ferramenta escreveu vai junto: a pessoa entende a falha sem sair do card
    const output = run.tail.length
      ? `\n\nFim da saída do ${toolLabel}:\n\n\`\`\`\n${run.tail.join('\n').replace(/```/g, "'''")}\n\`\`\``
      : '';
    if (run.timedOut)
      return this.block(
        cardId,
        `A execução do ${toolLabel} passou do tempo limite (${this.router.snapshot().board.runner.timeoutMinutes} min) e foi encerrada. Dá para aumentar o limite em Configurações → Harness de IA.${output}`,
      );
    if (error) return this.block(cardId, `Não foi possível executar o ${toolLabel}: ${error.message}`);
    if (code !== 0) return this.block(cardId, `O ${toolLabel} terminou com erro (código ${code}).${output}`);
    // respondeu na conversa e encerrou: a vez é da pessoa
    if (replied) return this.setStatus(cardId, 'waiting_answer', toolLabel);
    this.block(cardId, `O ${toolLabel} encerrou sem responder na conversa nem mudar o status do card.${output}`);
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
