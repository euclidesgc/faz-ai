import { cardRef } from '../shared/model';
import { aiToolInfo } from '../shared/harness';
import type { AiRunOrigin, RunReport } from '../shared/log';
import { columnOf, isLive } from '../shared/selectors';
import { isYolo, storyOf } from '../shared/story';
import type { AiRunMode, RunnerPermission } from '../shared/runner';
import type { CardStatus } from '../shared/status';
import { executionPlan } from './execution';
import { MeasureBrokenError } from './aiOutput/errors';
import { cut } from './aiOutput/json';
import { AiGateway, type AiExecution, type AiRunEnd } from './ai/gateway';
import { isCliNoise } from './cliNoise';
import { needsTriage } from './mcp/format';
import { catalogLines, contextLines, refineCatalog, type RefineCatalog } from './promptContext';
import type { MessageRouter } from './panel/messageRouter';

/** Processo da ferramenta de IA em execução. */
export interface RunningProcess {
  /** chamado uma vez, com o código de saída ou o erro que impediu a execução */
  onExit(listener: (code: number | null, error?: Error) => void): void;
  kill(): void;
}

/** Como iniciar o servidor MCP do board para a ferramenta; undefined sem o bridge. */
export function boardServer(deps: RunnerDeps): BoardServer | undefined {
  if (!deps.bridgePath) return undefined;
  const args = [deps.bridgePath, deps.cwd];
  if (deps.nodePath) return { command: deps.nodePath, args };
  // sem node no PATH (o Claude Code do instalador nativo não precisa dele), o próprio runtime do
  // editor roda o servidor: no Electron, como node, com ELECTRON_RUN_AS_NODE
  return { command: process.execPath, args, env: { ELECTRON_RUN_AS_NODE: '1' } };
}

/** Como a ferramenta inicia o servidor do board. */
export interface BoardServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface RunnerDeps {
  /** a única porta para chamar a ferramenta de IA: é ela que registra a execução no log */
  gateway: AiGateway;
  log(line: string): void;
  cwd: string;
  /** home do usuário, de onde se lê a configuração de servidores MCP da ferramenta */
  homeDir?: string;
  /** bridge.js do servidor MCP do board: com ele a ferramenta alcança o board mesmo sem estar registrada no projeto */
  bridgePath?: string;
  /** caminho do node que roda o bridge; sem ele, `node`, resolvido pelo PATH de quem inicia o servidor */
  nodePath?: string;
}

interface Run {
  exec: AiExecution;
  /** status que o card tinha antes de a execução começar */
  previous: CardStatus | null;
  /** últimas linhas que a ferramenta escreveu, para explicar uma falha no próprio card */
  tail: string[];
  mode: AiRunMode;
}

const RUNNER_AUTHOR = 'Faz AI';
const TAIL_LINES = 12;
/** Tamanho de cada linha do `tail`: a explicação da falha no card não vira despejo de saída. */
const TAIL_CHARS = 300;
const WHERE = 'Configurações → Harness de IA → "O que a IA pode fazer"';

/** O que a IA precisa saber sobre o limite da execução, para explicar à pessoa em vez de falhar sem contexto. */
export const PERMISSION_ADVICE: Record<RunnerPermission, string | null> = {
  board: `Nesta execução você só lê o projeto e usa as ferramentas do board: alterar arquivos e rodar comandos está bloqueado. Se o trabalho pedir isso, não tente contornar: chame block_card explicando que a pessoa precisa escolher "Board e arquivos do projeto" ou "Sem restrições" em ${WHERE} e chamar a IA de novo.`,
  edits: `Nesta execução você cria e altera arquivos do projeto, mas não roda comandos de terminal (testes, git, instalações). Implemente o que der e registre no card o que ficou sem rodar (testes, build, commit): isso fica para quem tem permissão. Só chame block_card se o trabalho não puder avançar sem comandos, explicando que a pessoa precisa escolher "Sem restrições" em ${WHERE}.`,
  full: null,
};

const COUNT = new Intl.NumberFormat('pt-BR');
const USD = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * A linha de resumo do consumo que vai para o canal de log no fim da execução. Os números são os
 * gravados no log, formatados em português; o que a ferramenta não informou (turnos, custo) fica de
 * fora da linha em vez de aparecer como zero. Nenhuma palavra aqui é nome de campo da CLI.
 *
 * Sem consumo, a linha diz por quê: `reason` é o motivo que só quem chama conhece (a execução
 * terminou antes do fim); `explained` diz que o motivo já foi escrito no canal (a volta para texto)
 * e não precisa se repetir; sem nenhum dos dois vale o motivo do relatório.
 */
export function consumptionLine(report: RunReport, why: { reason?: string | null; explained?: boolean } = {}): string {
  const c = report.consumption;
  if (c) {
    const parts = [
      `${COUNT.format(c.inputTokens)} entrada`,
      `${COUNT.format(c.outputTokens)} saída`,
      `${COUNT.format(c.cacheReadTokens)} leitura de cache`,
      `${COUNT.format(c.cacheWriteTokens)} criação de cache`,
      ...(c.turns !== null ? [`${COUNT.format(c.turns)} ${c.turns === 1 ? 'turno' : 'turnos'}`] : []),
      ...(c.costUsd !== null ? [`US$ ${USD.format(c.costUsd)}`] : []),
    ];
    return `${report.measure === 'partial' ? 'Consumo parcial' : 'Consumo'}: ${parts.join(' · ')}`;
  }
  if (why.explained) return 'Consumo não medido.';
  if (why.reason) return `Consumo não medido: ${why.reason}`;
  return report.reason ? `Consumo não medido. ${report.reason}` : 'Consumo não medido.';
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
  'Os campos Tags, Esforço da atividade, Modelo e Skills deste card estão todos vazios: antes do trabalho da fase, leia a descrição do card e decida um valor para cada um (e para Rules e para o agente, com set_card_profile, quando houver um que caiba). Use as regras de modelo em `get_models` e o que está marcado em `get_harness` como apoio, mas a decisão final é sua — diverja da sugestão quando a descrição pedir algo diferente. Só indique skills, rules e agentes que estejam nas opções dos campos e em get_board.agents. Aplique os campos com `update_card` (fields) e crie com `add_checklist_item` os passos de trabalho que a descrição pede. Registre na conversa do card, com `add_comment`, os valores escolhidos e por quê.';

/** O contexto que vai no pedido: o fixo do board e o do card, pelo caminho dos arquivos (ver promptContext). */
export interface PromptContext {
  always: string[];
  card: string[];
}

const NO_CONTEXT: PromptContext = { always: [], card: [] };

/**
 * O que a IA recebe no "Refinar com IA": deixar o card claro e completo para quem vai trabalhar nele,
 * sem fazer o trabalho da fase. O executor devolve o card ao status que tinha quando ela termina. O
 * catálogo é tudo o que ela pode indicar: o que o Harness marcou como "usar quando fizer sentido" e os agentes disponíveis.
 */
export const refinePrompt = (ref: string, context: PromptContext = NO_CONTEXT, catalog?: RefineCatalog): string =>
  [
    `Refine o card ${ref} do board Faz AI, pelas ferramentas do servidor MCP "faz-ai". Refinar é deixar o card claro e completo para quem vai trabalhar nele; NÃO é fazer o trabalho da fase.`,
    ...context.always,
    ...context.card,
    ...(catalog ? catalogLines(catalog) : []),
    'Leia o card com get_card (descrição, conversa, anexos e campos) e, como apoio, get_board e get_models (tipos, campos, agentes e catálogo de modelos). Pode ler o projeto para entender o contexto.',
    '1. Título e descrição: reescreva com update_card para ficarem claros e objetivos, mantendo a intenção e tudo o que a pessoa escreveu. Não invente requisito: o que estiver ambíguo vira uma lista "Dúvidas em aberto" no fim da descrição. Se o texto já estiver bom, não mexa.',
    '2. Campos: revise Tags, Esforço da atividade, Modelo, Skills e Rules e aplique com update_card (fields), mesmo que já tenham valor; mantenha o que fizer sentido. Escolha o agente do card com set_card_profile quando um da lista couber melhor que o padrão. Skills, rules e agente só do catálogo acima: o que não está nele não existe para este board.',
    '3. Checklist: acrescente com add_checklist_item os passos que faltam para concluir o card, sem repetir os que já existem.',
    '4. Termine com add_comment na conversa do card, resumindo o que mudou e por quê. Se reescreveu a descrição, inclua o texto anterior, para a pessoa poder voltar a ele.',
    'Não faça o trabalho da fase: não crie sub-tarefas nem anexos, não mova o card e não mude o status (sem start_work, move_card, request_review, ask_question nem block_card). Não altere arquivos do projeto nem rode comandos.',
    'Trabalhe só neste card. Ninguém está acompanhando esta sessão.',
  ].join('\n');

/** O que a IA recebe ao ser chamada para um card. O ciclo completo está na skill do fluxo e nas instruções do servidor MCP. */
export const cardPrompt = (
  ref: string,
  context: PromptContext = NO_CONTEXT,
  advice: string[] = [],
  autonomous = false,
  triage = false,
): string =>
  [
    `Trabalhe no card ${ref} do board Faz AI, pelas ferramentas do servidor MCP "faz-ai".`,
    ...context.always,
    ...context.card,
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
  private finishListeners: ((cardId: string, mode: AiRunMode) => void)[] = [];

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
    return this.runs.get(cardId)?.exec.runId || null;
  }

  /**
   * Inicia a execução. Lança erro se não for possível começar; o resultado aparece no status e na
   * conversa do card. `mode` escolhe entre trabalhar a fase (o padrão) e só refinar o card.
   */
  start(cardId: string, origin: AiRunOrigin = 'manual', mode: AiRunMode = 'phase'): void {
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card || !isLive(card)) throw new Error('Card não encontrado.');
    if (this.runs.has(cardId)) throw new Error(`A IA já está trabalhando em ${cardRef(card)}.`);
    const tool = aiToolInfo(state.board.aiTool);
    const log = (text: string) => this.deps.log(`[${cardRef(card)}] ${text}`);
    const refine = mode === 'refine';
    const messagesBefore = this.aiMessages(cardId);
    const tail: string[] = [];
    let exec: AiExecution;
    try {
      exec = this.deps.gateway.run({
        origin,
        tool: state.board.aiTool,
        // o contexto gravado é o do momento da chamada, congelado: a IA move o card durante o trabalho,
        // e o painel precisa saber de que coluna a execução partiu
        context: {
          cardId,
          cardNumber: card.number,
          cardTitle: card.title,
          cardType: state.cardTypes.find((t) => t.id === card.typeId)?.name ?? '',
          workflow: state.workflows.find((w) => w.id === card.workflowId)?.name ?? '',
          columnName: columnOf(state, card)?.name ?? '',
          phase: columnOf(state, card)?.name ?? '',
        },
        cwd: this.deps.cwd,
        timeoutMinutes: state.board.runner.timeoutMinutes,
        prepare: () => {
          const plan = executionPlan(state, card, this.deps.cwd, this.deps.homeDir ?? '', boardServer(this.deps));
          // em modo autônomo a IA precisa de git e `gh` para chegar ao pull request: roda sem restrições, como a pessoa aceitou ao ligar o modo
          const autonomous = !refine && isYolo(state, card);
          // refinar não mexe em arquivos: roda só com o board
          const permission = autonomous ? 'full' : refine ? 'board' : state.board.runner.permission;
          const permissionAdvice = refine ? null : PERMISSION_ADVICE[permission];
          if (autonomous) log('Modo autônomo (YOLO): sem aprovação nem perguntas, permissão "Sem restrições".');
          if (refine) log('Refinar com IA: texto, campos e checklist do card, sem trabalhar a fase.');
          log(plan.summary.join(' | '));
          return {
            // a configuração completa só existe depois do plano; é a mesma que o resumo manda para o canal de log
            config: {
              model: plan.manifest.model?.name ?? null,
              effort: plan.manifest.model?.effort ?? null,
              profile: plan.manifest.profile,
              agent: plan.manifest.agent,
              autonomous,
              // toda execução pelo board parte de contexto vazio
              clean: true,
              skills: plan.manifest.skills,
              mcp: plan.manifest.mcpServers,
            },
            input: {
              prompt: refine
                ? refinePrompt(cardRef(card), contextLines(state, card), refineCatalog(state))
                : cardPrompt(
                    cardRef(card),
                    contextLines(state, card),
                    [...plan.advice, ...(permissionAdvice ? [permissionAdvice] : [])],
                    autonomous,
                    needsTriage(state, card),
                  ),
              permission,
              addDirs: this.router.aiWorkDirs(),
              exec: plan.input,
              boardServer: boardServer(this.deps),
            },
          };
        },
        log: (line) => {
          log(line);
          // os avisos de configuração da CLI ficam só no canal: não explicam a falha e empurrariam o motivo real para fora
          if (isCliNoise(line)) return;
          tail.push(cut(line, TAIL_CHARS));
          if (tail.length > TAIL_LINES) tail.shift();
        },
        // o que veio antes deste processo (a linha da chamada e, na volta para texto, a tentativa
        // recusada) não explica a falha dele: o `tail` recomeça aqui
        onAttempt: () => {
          tail.length = 0;
        },
      });
    } catch (e) {
      // nem chegou a existir processo (ferramenta sem suporte, plano impossível, spawn que falhou):
      // o log já fechou a linha, e o motivo fica também no canal
      this.deps.log(`[${cardRef(card)}] Não foi possível executar: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    const run: Run = { exec, previous: card.status, mode, tail };
    this.runs.set(cardId, run);
    this.setStatus(cardId, 'running', tool.label);
    this.publish();

    exec.onExit((end) => {
      log(
        end.error
          ? `Falhou: ${end.error.message}`
          : end.stopped
            ? 'Interrompida.'
            : end.timedOut
              ? 'Encerrada por tempo limite.'
              : `Terminou (código ${end.code}).`,
      );
      const measured = end.report;
      log(
        consumptionLine(
          // sem consumo e sem motivo (o fluxo trouxe ferramentas, mas nenhum número): a saída não trouxe o consumo
          measured.consumption || measured.reason ? measured : { ...measured, reason: new MeasureBrokenError(tool.label).message },
          end.attempts > 1
            ? { explained: true }
            : end.format !== 'text' && (end.stopped || end.timedOut || end.error || end.code !== 0)
              ? { reason: 'a execução terminou antes de informar o consumo.' }
              : {},
        ),
      );
      try {
        // o card continua "em execução" para o log enquanto o desfecho é aplicado: o bloqueio e a
        // mudança de status que explicam o fim da execução ficam ligados a ela
        this.settle(cardId, run, end, this.aiMessages(cardId) > messagesBefore, tool.label);
      } finally {
        this.runs.delete(cardId);
      }
      this.publish();
      this.finishListeners.forEach((fn) => fn(cardId, run.mode));
    });
  }

  /** Avisa quando a execução de um card termina, seja como for. */
  onDidFinish(listener: (cardId: string, mode: AiRunMode) => void): void {
    this.finishListeners.push(listener);
  }

  /** Interrompe a execução do card; o status volta ao que era. */
  stop(cardId: string): void {
    const run = this.runs.get(cardId);
    if (!run) return;
    run.exec.stop();
  }

  dispose(): void {
    for (const id of this.running) this.stop(id);
  }

  /** Deixa o card num status coerente quando a IA não passou a vez por conta própria. */
  private settle(cardId: string, run: Run, end: AiRunEnd, replied: boolean, toolLabel: string): void {
    const { code, error } = end;
    const card = this.router.snapshot().cards.find((c) => c.id === cardId);
    // a IA (ou a pessoa) já mudou o status durante a execução: é ele que vale
    if (!card || card.status !== 'running') return;
    // restaurar não passa pelas regras da IA (o status anterior pode ser "Aprovado")
    if (end.stopped)
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
    // o fim do que a ferramenta escreveu vai junto: a pessoa entende a falha sem sair do card
    // o plano gratuito do Cursor só roda o Auto: a recusa diz pouco, e a saída é o modelo do card
    const freePlan = run.tail.some((l) => /free plans can only use auto/i.test(l))
      ? `\n\nO plano gratuito do Cursor só roda o modelo Auto: escolha Auto no campo Modelo do card, ou use o botão Recriar as regras de "Esforço da atividade" em Configurações → Modelos de IA, que no Cursor sugere Auto.`
      : '';
    const output =
      freePlan +
      (run.tail.length ? `\n\nFim da saída do ${toolLabel}:\n\n\`\`\`\n${run.tail.join('\n').replace(/```/g, "'''")}\n\`\`\`` : '');
    const failure = end.timedOut
      ? `A execução do ${toolLabel} passou do tempo limite (${this.router.snapshot().board.runner.timeoutMinutes} min) e foi encerrada. Dá para aumentar o limite em Configurações → Harness de IA.${output}`
      : error
        ? `Não foi possível executar o ${toolLabel}: ${error.message}`
        : code !== 0
          ? `O ${toolLabel} terminou com erro (código ${code}).${output}`
          : null;
    // refinar não passa a vez, nem quando falha: o card volta ao status que tinha, e a falha fica na conversa
    if (run.mode === 'refine') {
      if (failure)
        this.router.handle(
          { type: 'comment.add', cardId, body: `O refinamento do card não terminou. ${failure}` },
          { author: RUNNER_AUTHOR, source: 'ai' },
        );
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
    }
    if (failure) return this.block(cardId, failure);
    // o pull request pode ter sido registrado antes do card chegar na última coluna da IA (ex.: a
    // mesma sessão fez a implementação e a homologação): reavalia a entrega agora, antes do fallback
    // de modo autônomo devolver o card para "ready".
    const story = storyOf(this.router.snapshot(), card);
    if (story && this.router.settleDelivery(story.id, toolLabel)) return;
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
