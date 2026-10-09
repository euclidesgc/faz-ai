import { cardRef } from '../shared/model';
import { aiToolInfo, type AiTool } from '../shared/harness';
import type { AiRunOrigin, RunReport } from '../shared/log';
import { columnOf, isLive } from '../shared/selectors';
import { isWithHuman, isYolo, storyOf } from '../shared/story';
import type { AiRunMode, RunnerPermission } from '../shared/runner';
import type { CardStatus } from '../shared/status';
import { executionPlan } from './execution';
import { effortToRun } from '../shared/execution';
import { modelDisplay, modelValue, parseModelValue, suggestModelRule } from '../shared/models';
import { effortTiers } from './models';
import { MeasureBrokenError } from './aiOutput/errors';
import { cut } from './aiOutput/json';
import { AiGateway, type AiExecution, type AiRunEnd } from './ai/gateway';
import { isCliNoise } from './cliNoise';
import { needsTriage } from './mcp/format';
import { catalogLines, contextLines, refineCatalog, type RefineCatalog } from './promptContext';
import type { MessageRouter } from './panel/messageRouter';
import type { AiActivity, BoardState } from '../shared/model';

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

/** Par modelo/esforço no nome que a ferramenta entende (`ExecManifest.model`), não o id do catálogo. */
interface ToolModel {
  model: string;
  effort: string | null;
}

interface Run {
  exec: AiExecution;
  /** status que o card tinha antes de a execução começar */
  previous: CardStatus | null;
  /** últimas linhas que a ferramenta escreveu, para explicar uma falha no próprio card */
  tail: string[];
  mode: AiRunMode;
  /** projeção publicada ao router (ver `publish`) */
  info: AiActivity;
  /** modelo/esforço que esta execução pediu à ferramenta; usado no comentário quando a reserva assume */
  model: ToolModel | null;
  /**
   * reserva da regra que casaria com o card agora, pronta para a retentativa quando o modelo principal
   * esgota o limite; `null` sem regra, sem reserva, modelo escolhido à mão, ou nesta própria retentativa
   * (uma tentativa só).
   */
  fallbackPending: ToolModel | null;
}

const RUNNER_AUTHOR = 'Faz AI';

/**
 * Padrões de saída que indicam login vencido, por ferramenta: a falha vira o aviso global (RF6), não
 * um bloqueio do card. Risco já documentado na Spec: a lista pode ficar desatualizada se a CLI mudar o
 * texto de erro; qualquer saída que não bata nenhum padrão segue o caminho atual (RF7).
 */
const AUTH_FAILURE_PATTERNS: Record<AiTool, RegExp[]> = {
  claude: [/oauth session expired/i, /failed to authenticate/i, /not logged in/i, /invalid api key/i],
  cursor: [/not authenticated/i, /please (log|sign) in/i],
};

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

/**
 * O que a IA recebe no botão "Resumir a conversa": ler as mensagens do card e gravar um resumo
 * (Decisões/Observações/Pendências) como uma mensagem nova, sem trabalhar a fase, mover o card nem
 * mudar o status.
 */
export const summarizePrompt = (ref: string, context: PromptContext = NO_CONTEXT): string =>
  [
    `Leia toda a conversa do card ${ref} do board Faz AI (get_card, campo comments). Escreva um resumo organizado em três seções — Decisões, Observações e Pendências — cobrindo só o que foi discutido nesta conversa (nada de outros cards ou do board). Onde não houver nada para uma seção, escreva "Nada identificado" em vez de omiti-la. Grave o resumo com add_comment(card: "${ref}", body: <resumo>, kind: "summary"); não escreva nenhuma outra mensagem, não mova o card, não mude o status, não altere arquivos nem rode comandos. Não faça comentário sobre o processo (nada de "segue o resumo:" como texto fora do próprio resumo).`,
    ...context.always,
    ...context.card,
  ].join('\n');

/**
 * O modelo/esforço de um valor de campo do tipo modelo (`<id do catálogo>@<esforço>`), no catálogo da
 * ferramenta ativa, no formato que a chamada da ferramenta entende (nome do modelo e esforço). `null`
 * quando o valor está vazio ou o modelo não está (mais) no catálogo da ferramenta ativa.
 */
function resolvedModel(state: BoardState, value: string | null | undefined): { name: string; effort: string | null } | null {
  const chosen = parseModelValue(value ?? undefined);
  const option = chosen ? state.board.modelCatalog.find((o) => o.id === chosen.id && o.tool === state.board.aiTool) : undefined;
  return option ? { name: option.model, effort: effortToRun(option, chosen!.effort) } : null;
}

/**
 * O modelo/esforço da faixa "Alto" do catálogo ativo, no formato que a chamada da ferramenta
 * entende (nome do modelo e esforço). Usado pelo modo `summarize`, que força sempre essa faixa,
 * independente do Esforço do card.
 */
function highTierModel(state: BoardState): { name: string; effort: string | null } | null {
  const tier = effortTiers(state.board.aiTool, state.board.modelCatalog).find(([level]) => level === 'Alto');
  return tier ? resolvedModel(state, tier[1]) : null;
}

/**
 * Texto de exibição de um `ToolModel` (nome que a ferramenta entende), traduzido de volta para o
 * catálogo para usar `modelDisplay`; sem o modelo no catálogo, cai no próprio nome bruto.
 */
function toolModelDisplay(state: BoardState, pair: ToolModel | null): string {
  if (!pair) return '';
  const option = state.board.modelCatalog.find((o) => o.tool === state.board.aiTool && o.model === pair.model);
  return option ? modelDisplay(state.board.modelCatalog, modelValue(option.id, pair.effort)) : pair.model;
}

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
   *
   * `forceModel` é de uso interno (a retentativa com o modelo reserva, ver `settle`): sobrescreve o
   * modelo/esforço que o plano decidiria e nunca recebe `fallbackPending` (uma tentativa só). Quem
   * chama de fora (painel, MCP) nunca informa este parâmetro.
   */
  start(cardId: string, origin: AiRunOrigin = 'manual', mode: AiRunMode = 'phase', forceModel?: ToolModel): void {
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card || !isLive(card)) throw new Error('Card não encontrado.');
    if (this.runs.has(cardId)) throw new Error(`A IA já está trabalhando em ${cardRef(card)}.`);
    // sem login confirmado pelo probe (preventivo, RF1), nenhum gatilho gasta uma execução — diferente do sinal
    // reativo (`authExpired`), que heartbeat.ts/autopilot.ts recusam por conta própria (RF8): aqui ele não
    // bloqueia, para o login que o probe não soube confirmar poder se recuperar com uma execução
    // manual que dá certo (RF9, limpa em settle()) — sem essa válvula, authExpired nunca mais sairia de `true`
    if (state.requirements.some((r) => r.id === 'signin'))
      throw new Error(`O login do ${aiToolInfo(state.board.aiTool).label} venceu: veja o aviso no topo do board.`);
    const tool = aiToolInfo(state.board.aiTool);
    const log = (text: string) => this.deps.log(`[${cardRef(card)}] ${text}`);
    const refine = mode === 'refine';
    const summarize = mode === 'summarize';
    const messagesBefore = this.aiMessages(cardId);
    const tail: string[] = [];
    // conhecidos antes do gateway.run, para a projeção publicada depois (ver `info` abaixo)
    const phase = columnOf(state, card)?.name ?? '';
    // a fase publicada em `aiActivity` é a da HISTÓRIA (numa sub-tarefa, a coluna do card é do
    // workflow filho): é nela que `runningKindOf` decide se a execução é de texto ou de branch,
    // como `activityKindOf` faz com a coluna atual da história
    const story = storyOf(state, card);
    const storyPhase = story && story.id !== card.id ? (columnOf(state, story)?.name ?? phase) : phase;
    let activityModel: string | null = null;
    let activityEffort: string | null = null;
    // a reserva da regra que casaria com o card agora, para a retentativa quando o limite esgota (ver `settle`)
    let fallbackPending: ToolModel | null = null;
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
          columnName: phase,
          phase,
        },
        cwd: this.deps.cwd,
        timeoutMinutes: state.board.runner.timeoutMinutes,
        prepare: () => {
          const plan = executionPlan(state, card, this.deps.cwd, this.deps.homeDir ?? '', boardServer(this.deps));
          // em modo autônomo a IA precisa de git e `gh` para chegar ao pull request: roda sem restrições, como a pessoa aceitou ao ligar o modo
          const autonomous = !refine && !summarize && isYolo(state, card);
          // refinar e resumir não mexem em arquivos: rodam só com o board
          const permission = autonomous ? 'full' : refine || summarize ? 'board' : state.board.runner.permission;
          const permissionAdvice = refine || summarize ? null : PERMISSION_ADVICE[permission];
          if (autonomous) log('Modo autônomo (YOLO): sem aprovação nem perguntas, permissão "Sem restrições".');
          if (refine) log('Refinar com IA: texto, campos e checklist do card, sem trabalhar a fase.');
          if (summarize) log('Resumir a conversa: lê as mensagens e grava um resumo, sem mover o card nem mudar o status.');
          log(plan.summary.join(' | '));
          if (forceModel) {
            // a retentativa com a reserva: o modelo/esforço vêm impostos, sem voltar a resolver a regra
            activityModel = forceModel.model;
            activityEffort = forceModel.effort;
          } else {
            // resumir sempre usa a faixa "Alto" do catálogo ativo, independente do Esforço do card
            const summaryModel = summarize ? highTierModel(state) : null;
            activityModel = summarize ? (summaryModel?.name ?? null) : (plan.manifest.model?.name ?? null);
            activityEffort = summarize ? (summaryModel?.effort ?? null) : (plan.manifest.model?.effort ?? null);
            // a reserva só faz sentido no trabalho da fase, e só quando o Modelo do card é o que a
            // regra sugeriria agora (senão foi trocado à mão, e a troca não é desta regra)
            if (!refine && !summarize) {
              const rule = suggestModelRule(state, card);
              const ruleModel = rule?.fallback ? resolvedModel(state, rule.model) : null;
              const matches = ruleModel && ruleModel.name === activityModel && ruleModel.effort === activityEffort;
              const fallback = matches ? resolvedModel(state, rule!.fallback) : null;
              fallbackPending = fallback ? { model: fallback.name, effort: fallback.effort } : null;
            }
          }
          return {
            // a configuração completa só existe depois do plano; é a mesma que o resumo manda para o canal de log
            config: {
              model: activityModel,
              effort: activityEffort,
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
                : summarize
                  ? summarizePrompt(cardRef(card), contextLines(state, card))
                  : cardPrompt(
                      cardRef(card),
                      contextLines(state, card),
                      [...plan.advice, ...(permissionAdvice ? [permissionAdvice] : [])],
                      autonomous,
                      needsTriage(state, card),
                    ),
              permission,
              addDirs: this.router.aiWorkDirs(),
              // a retentativa força o modelo/esforço da reserva no que vai para a ferramenta, sem voltar a resolver o plano
              exec: forceModel ? { ...plan.input, model: { name: forceModel.model, effort: forceModel.effort } } : plan.input,
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
    const info: AiActivity = {
      cardId,
      runId: exec.runId,
      mode,
      origin,
      phase: storyPhase,
      model: activityModel,
      startedAt: exec.startedAt,
    };
    const run: Run = {
      exec,
      previous: card.status,
      mode,
      tail,
      info,
      model: activityModel ? { model: activityModel, effort: activityEffort } : null,
      fallbackPending,
    };
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
      let retry: ToolModel | undefined;
      try {
        // o card continua "em execução" para o log enquanto o desfecho é aplicado: o bloqueio e a
        // mudança de status que explicam o fim da execução ficam ligados a ela
        retry = this.settle(cardId, run, end, this.aiMessages(cardId) > messagesBefore, tool.label);
      } finally {
        // a limpeza precisa acontecer antes da retentativa: start() recusa começar com o card ainda em `this.runs`
        this.runs.delete(cardId);
      }
      if (retry) {
        // o modelo principal esgotou o limite e há reserva: uma nova execução assume, sem publicar nem
        // avisar o fim desta (quem decide o desfecho final é a execução da reserva)
        try {
          this.start(cardId, origin, mode, retry);
          return;
        } catch (e) {
          // a retentativa nem começou (card arquivado, gateway recusou): o card não pode ficar "em
          // execução" sem execução, e quem espera o fim precisa ser avisado como em qualquer outro fim
          this.block(cardId, `Não foi possível repetir a execução com o modelo reserva: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      this.publish();
      this.finishListeners.forEach((fn) => fn(cardId, run.mode));
    });
  }

  /** Avisa quando a execução de um card termina, seja como for. Devolve uma função para cancelar o aviso. */
  onDidFinish(listener: (cardId: string, mode: AiRunMode) => void): () => void {
    this.finishListeners.push(listener);
    return () => {
      this.finishListeners = this.finishListeners.filter((l) => l !== listener);
    };
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

  /**
   * Deixa o card num status coerente quando a IA não passou a vez por conta própria. Devolve o par
   * modelo/esforço da reserva quando o modelo principal esgotou o limite e há reserva disponível: quem
   * chama (`onExit`) inicia a retentativa com ele, depois de liberar `this.runs`; nenhum outro caso
   * devolve valor.
   */
  private settle(cardId: string, run: Run, end: AiRunEnd, replied: boolean, toolLabel: string): ToolModel | undefined {
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
    const toolId = this.router.snapshot().board.aiTool;
    const authFailed = AUTH_FAILURE_PATTERNS[toolId]?.some((re) => run.tail.some((l) => re.test(l))) ?? false;
    // falha de autenticação vale para o board inteiro, não só para este card: não bloqueia, e o aviso
    // global (RF3) é quem explica à pessoa o que fazer. Entra antes do caminho de "refinar" porque RF6
    // vale para os dois modos, e antes do `failure` genérico, que continua tratando qualquer outra falha
    if (authFailed) {
      if (this.router.setAuthExpired(toolId)) this.deps.log(`Login do ${toolLabel} vencido: execuções suspensas.`);
      this.router.handle(
        {
          type: 'comment.add',
          cardId,
          body: `Não rodou: o login do ${toolLabel} venceu. Faça login de novo; a execução pode ser repetida depois.`,
        },
        { author: RUNNER_AUTHOR, source: 'ai' },
      );
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
    }
    // a execução não falhou por autenticação: se o sinal estava ligado para esta ferramenta, ela voltou
    // a funcionar (RF9) — cobre o login que o probe não soube confirmar, que só tem este caminho
    if (this.router.snapshot().authExpired === toolId && this.router.setAuthExpired(null))
      this.deps.log(`Login do ${toolLabel} de volta: execuções retomadas.`);
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
    // refinar e resumir não passam a vez, nem quando falham: o card volta ao status que tinha, e a falha fica na conversa
    if (run.mode === 'refine' || run.mode === 'summarize') {
      const summarize = run.mode === 'summarize';
      if (failure)
        this.router.handle(
          {
            type: 'comment.add',
            cardId,
            body: summarize ? `O resumo da conversa não foi gerado. ${failure}` : `O refinamento do card não terminou. ${failure}`,
          },
          { author: RUNNER_AUTHOR, source: 'ai' },
        );
      // sem falha de processo, mas sem a mensagem que o resumo deveria gravar: a IA entendeu mal o pedido
      else if (summarize && !replied)
        this.router.handle(
          { type: 'comment.add', cardId, body: 'O resumo não foi gerado: a execução terminou sem escrever a mensagem.' },
          { author: RUNNER_AUTHOR, source: 'ai' },
        );
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
    }
    // o modelo principal esgotou o limite de uso do plano e há reserva pronta para esta regra: a
    // retentativa assume em vez de bloquear (RF-03 exige que nenhuma outra falha caia aqui: só quando o
    // leitor da ferramenta marcou `usageLimitReached`, nunca pelo código de saída ou por heurística do runner).
    // E só quando a execução falhou: uma que terminou bem não é refeita com a reserva
    if (failure && end.report.usageLimitReached && run.fallbackPending) {
      const state = this.router.snapshot();
      const principal = toolModelDisplay(state, run.model);
      const fallback = toolModelDisplay(state, run.fallbackPending);
      this.router.handle(
        { type: 'comment.add', cardId, body: `O \`${principal}\` esgotou o limite; a execução segue com \`${fallback}\`.` },
        { author: RUNNER_AUTHOR, source: 'ai' },
      );
      return run.fallbackPending;
    }
    if (failure) return void this.block(cardId, failure);
    // o pull request pode ter sido registrado antes do card chegar na última coluna da IA (ex.: a
    // mesma sessão fez a implementação e a homologação): reavalia a entrega agora, antes do fallback
    // de modo autônomo devolver o card para "ready".
    const story = storyOf(this.router.snapshot(), card);
    if (story && this.router.settleDelivery(story.id)) return;
    // em modo autônomo não há pessoa para esperar: o card volta para a IA seguir (o autopiloto limita as voltas sem progresso)
    if (replied && isYolo(this.router.snapshot(), card)) return void this.setStatus(cardId, 'ready', toolLabel);
    // respondeu na conversa e encerrou: a vez é da pessoa
    if (replied) return void this.setStatus(cardId, 'waiting_answer', toolLabel);
    // história YOLO já entregue (status com a pessoa) no momento atual: o card já está certo, não é
    // falha de fato — reconsulta o snapshot porque settleDelivery (acima) pode ter mudado o status
    // desde o início deste método (#407: autopiloto re-executava e se autobloqueava)
    const current = this.router.snapshot();
    const currentCard = current.cards.find((c) => c.id === cardId);
    const currentStory = currentCard && storyOf(current, currentCard);
    if (currentStory && isYolo(current, currentCard) && isWithHuman(currentStory)) return;
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
    this.router.setAiRuns([...this.runs.values()].map((r) => r.info).sort((a, b) => a.startedAt - b.startedAt));
  }
}
