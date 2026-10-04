import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cardRef } from '../shared/model';
import { aiToolInfo } from '../shared/harness';
import type { AiRunOrigin, AiRunOutcome } from '../shared/log';
import { columnOf, isLive } from '../shared/selectors';
import { isYolo } from '../shared/story';
import type { RunnerPermission } from '../shared/runner';
import type { CardStatus } from '../shared/status';
import { executionPlan } from './execution';
import type { SpawnFn } from './aiOutput/measured';
import { headlessCommand, tmpArg, type HeadlessCommand } from './headless';
import type { RunLog } from './log/runLog';
import { needsTriage, requiredSkills } from './mcp/format';
import type { MessageRouter } from './panel/messageRouter';

/** Processo da ferramenta de IA em execução. */
export interface RunningProcess {
  /** chamado uma vez, com o código de saída ou o erro que impediu a execução */
  onExit(listener: (code: number | null, error?: Error) => void): void;
  kill(): void;
}

export interface RunnerDeps {
  /** inicia o comando na pasta do projeto; cada pedaço de saída vai para `out`, com o canal de onde veio */
  spawn: SpawnFn;
  log(line: string): void;
  cwd: string;
  /** home do usuário, de onde se lê a configuração de servidores MCP da ferramenta */
  homeDir?: string;
  /** bridge.js do servidor MCP do board: com ele a ferramenta alcança o board mesmo sem estar registrada no projeto */
  bridgePath?: string;
  /**
   * Log das execuções de IA. Opcional de propósito: sem ele o executor funciona exatamente como antes
   * (é o que mantém os testes e um board sem log valendo). Não se chama `log` porque esse nome já é o
   * canal de texto da extensão, logo acima.
   */
  runLog?: RunLog;
}

interface Run {
  proc: RunningProcess;
  timer: ReturnType<typeof setTimeout>;
  /** status que o card tinha antes de a execução começar */
  previous: CardStatus | null;
  /** a linha desta execução em `ai_runs` (`''` quando não há log ou a gravação falhou) */
  logId: string;
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

/**
 * Como a execução terminou, para o log (RF-17). A ordem importa: a pessoa que interrompe e o tempo
 * limite vencem o código de saída, porque matar o processo também produz código diferente de zero.
 */
function outcomeOf(run: Run, code: number | null, error: Error | undefined): AiRunOutcome {
  if (run.stopped) return 'stopped';
  if (run.timedOut) return 'timeout';
  if (error || code !== 0) return 'failed';
  return 'done';
}

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

/** O que a IA recebe a mais quando a história está em modo autônomo (YOLO): sem aprovação, sem perguntas, até o pull request. */
export const AUTONOMOUS_ADVICE = [
  'MODO AUTÔNOMO (YOLO): esta história foi liberada para rodar sozinha. Ninguém aprova, responde nem acompanha esta sessão.',
  'Não chame request_review nem ask_question (a pergunta é recusada). Ao terminar a fase, registre na conversa o que foi feito e as decisões que tomou (add_comment) e mova o card para a próxima coluna.',
  'Diante de uma dúvida, decida pela opção mais razoável segundo o código, a documentação e a conversa, e registre a decisão e o motivo na conversa.',
  'Use block_card só se for impossível seguir (acesso, ambiente, falha que você não resolve), explicando o que é preciso para destravar.',
  'Na Implementação, execute todas as sub-tarefas até o fim. Na última coluna em que a IA atua (Homologação, no board padrão) não há aprovação nem próxima fase: envie a branch, abra o pull request, registre-o com set_pull_request (é o registro que entrega a história e a passa para a pessoa), resuma na conversa o que foi feito e como testar, e pare: não avance o card. Não faça o merge.',
  'Se o pedido for grande demais para uma entrega só (partes independentes), divida-o no Discovery: mantenha nesta história a primeira entrega e crie as seguintes com create_card (autonomous_from = esta história), em ordem de dependência. Elas entram na fila e cada uma parte da branch da anterior, com o pull request empilhado (--base na branch anterior).',
].join('\n');

/** O que a IA recebe a mais quando os quatro campos de triagem do card (Tags, Esforço, Modelo, Skills) estão vazios. */
export const TRIAGE_ADVICE =
  'Os campos Tags, Esforço da atividade, Modelo e Skills deste card estão todos vazios: antes do trabalho da fase, leia a descrição do card e decida um valor para cada um. Use o catálogo de skills e as regras de modelo em `get_board`/`get_harness`/`get_models` como apoio, mas a decisão final é sua — diverja da sugestão quando a descrição pedir algo diferente. Aplique os quatro campos com `update_card` (fields) e crie com `add_checklist_item` os passos de trabalho que a descrição pede. Registre na conversa do card, com `add_comment`, os valores escolhidos e por quê.';

/** O que a IA recebe ao ser chamada para um card. O ciclo completo está na skill do fluxo e nas instruções do servidor MCP. */
export const cardPrompt = (
  ref: string,
  skills: { name: string; path?: string }[] = [],
  advice: string[] = [],
  autonomous = false,
  triage = false,
): string =>
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
    ...(triage ? [TRIAGE_ADVICE] : []),
    'Faça o trabalho da fase em que o card está e termine passando a vez: request_review quando houver algo para revisar, ask_question quando precisar de uma resposta, block_card se houver um impedimento, ou mova o card se a fase não exigir aprovação.',
    ...(autonomous ? [AUTONOMOUS_ADVICE] : []),
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

  /** A execução em curso num card, para o log do board ligar os eventos a ela; `null` quando não há. */
  runIdOf(cardId: string): string | null {
    return this.runs.get(cardId)?.logId || null;
  }

  /** Inicia a execução. Lança erro se não for possível começar; o resultado aparece no status e na conversa do card. */
  start(cardId: string, origin: AiRunOrigin = 'manual'): void {
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card || !isLive(card)) throw new Error('Card não encontrado.');
    if (this.runs.has(cardId)) throw new Error(`A IA já está trabalhando em ${cardRef(card)}.`);
    const tool = aiToolInfo(state.board.aiTool);
    // a linha do log abre ANTES do plano de execução, que pode lançar: a execução que nem começou
    // também é informação. E o contexto gravado é o do momento da chamada, congelado: a IA move o
    // card durante o trabalho, e o painel precisa saber de que coluna a execução partiu.
    const logId = this.deps.runLog
      ? this.deps.runLog.start({
          boardId: this.router.boardId,
          startedAt: Date.now(),
          origin,
          // o id da ferramenta, não o rótulo: o rótulo muda e levaria as séries antigas com ele
          tool: state.board.aiTool,
          cardId,
          cardNumber: card.number,
          cardTitle: card.title,
          cardType: state.cardTypes.find((t) => t.id === card.typeId)?.name ?? '',
          workflow: state.workflows.find((w) => w.id === card.workflowId)?.name ?? '',
          columnName: columnOf(state, card)?.name ?? '',
          phase: columnOf(state, card)?.name ?? '',
        })
      : '';
    try {
      const plan = executionPlan(state, card, this.deps.cwd, this.deps.homeDir ?? '');
      // em modo autônomo a IA precisa de git e `gh` para chegar ao pull request: roda sem restrições, como a pessoa aceitou ao ligar o modo
      const autonomous = isYolo(state, card);
      const permission = autonomous ? 'full' : state.board.runner.permission;
      const permissionAdvice = PERMISSION_ADVICE[permission];
      const built = headlessCommand(state.board.aiTool, {
        prompt: cardPrompt(
          cardRef(card),
          requiredSkills(state, card),
          [...plan.advice, ...(permissionAdvice ? [permissionAdvice] : [])],
          autonomous,
          needsTriage(state, card),
        ),
        permission,
        addDirs: this.router.aiWorkDirs(),
        exec: plan.input,
        boardServer: this.deps.bridgePath ? { command: 'node', args: [this.deps.bridgePath, this.deps.cwd] } : undefined,
      });
      if ('unsupported' in built) throw new Error(built.unsupported);
      const { command, cleanup } = materialize(built);
      // a configuração completa só existe depois do plano; é a mesma que o resumo manda para o canal de log
      this.deps.runLog?.describe(logId, {
        model: plan.manifest.model?.name ?? null,
        effort: plan.manifest.model?.effort ?? null,
        profile: plan.manifest.profile,
        agent: plan.manifest.agent,
        permission,
        autonomous,
        clean: plan.manifest.clean,
        skills: plan.manifest.skills,
        mcp: plan.manifest.mcpServers,
      });

      const log = (text: string) => this.deps.log(`[${cardRef(card)}] ${text}`);
      const messagesBefore = this.aiMessages(cardId);
      if (autonomous) log('Modo autônomo (YOLO): sem aprovação nem perguntas, permissão "Sem restrições".');
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
        logId,
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
        log(
          error
            ? `Falhou: ${error.message}`
            : run.stopped
              ? 'Interrompida.'
              : run.timedOut
                ? 'Encerrada por tempo limite.'
                : `Terminou (código ${code}).`,
        );
        this.deps.runLog?.finish(logId, outcomeOf(run, code, error), code);
        try {
          // o card continua "em execução" para o log enquanto o desfecho é aplicado: o bloqueio e a
          // mudança de status que explicam o fim da execução ficam ligados a ela
          this.settle(cardId, run, code, error, this.aiMessages(cardId) > messagesBefore, tool.label);
        } finally {
          this.runs.delete(cardId);
        }
        this.publish();
        this.finishListeners.forEach((fn) => fn(cardId));
      });
    } catch (e) {
      // nem chegou a existir processo (ferramenta sem suporte, plano impossível, spawn que falhou):
      // a linha fecha aqui, antes de o erro subir para quem chamou
      this.deps.runLog?.finish(logId, 'unsupported');
      throw e;
    }
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
    // em modo autônomo não há pessoa para esperar: o card volta para a IA seguir (o autopiloto limita as voltas sem progresso)
    if (replied && isYolo(this.router.snapshot(), card)) return this.setStatus(cardId, 'ready', toolLabel);
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
