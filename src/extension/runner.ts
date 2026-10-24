import { authFailed } from './ai/profileAuth';
import type { AiProfile } from '../shared/aiProfiles';
import { toolInfo, catalogTool, profileLabel, isReadyCli } from '../shared/aiProfiles';
import { resolveRunTarget, targetOfValue, type RunTarget, type RunTargetSource } from '../shared/runTarget';
import { cliProblem } from '../shared/requirements';
import type { ExecutionConstraints, PolicyAttempt, PolicyDecision } from '../shared/executionPolicies';
import {
  SAFE_ID,
  chainAfter,
  describeDecision,
  evaluateRunPolicy,
  newChain,
  runTargetOfPolicy,
  scopeDigest,
  type Chain,
} from './policyGate';
import type { ContextAction } from '../shared/contextPlanning';
import { cardRef } from '../shared/model';
import { canDispatch, limitClock, limitHolds, pauseOf, resetAtOf } from '../shared/usageLimit';
import { activityKindOf } from '../shared/activity';
import { STORY_SESSION_ADVICE } from './unitAdvice';
import type { AiRunOrigin, RunReport } from '../shared/log';
import { SHOW_COST } from '../shared/metrics';
import { exceedsRunLimit, RUN_CACHE_READ_LIMIT } from '../shared/runLimit';
import { columnOf, isLive } from '../shared/selectors';
import { isAtYoloStop, isWithHuman, isYolo, lastAiColumn, storyOf, yoloStopOf } from '../shared/story';
import { admissionRegimeOf, type AiRunMode, type RunnerPermission } from '../shared/runner';
import type { CardStatus } from '../shared/status';
import { BOARD_SERVER, executionPlan } from './execution';
import { runCheckLine, runCheckNotice } from '../shared/runCheck';
import { runArtifactRequest } from './runArtifactSnapshot';
import { modelDisplay, modelValue } from '../shared/models';
import { effortTiers } from './models';
import { MeasureBrokenError, MeasureEndedError, NOT_REPEATED } from './aiOutput/errors';
import { cut } from './aiOutput/json';
import { cardV1, legacyStrictRequest } from './ai/v1Prepare';
import { AiGateway, type AiCall, type AiExecution, type AiRunEnd } from './ai/gateway';
import { isCliNoise } from './cliNoise';
import { needsTriage } from './mcp/format';
import { catalogLines, contextLines, refineCatalog, type RefineCatalog } from './promptContext';
import type { MessageRouter } from './panel/messageRouter';
import type { AiActivity, BoardState, Card } from '../shared/model';

/** Processo da ferramenta de IA em execução. */
export interface RunningProcess {
  readonly identity?: import('./processIdentity').ProcessIdentity;
  /** Prova do transporte de que a árvore encerrou; ausência não autoriza liberar recursos emprestados. */
  terminationConfirmed?(): boolean;
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
export interface RunOptions {
  origin: AiRunOrigin;
  mode?: AiRunMode;
  workId?: string;
  token?: string;
  advice?: string[];
  beforeStart?: AiCall['beforeStart'];
  onExit?(end: AiRunEnd): void;
  /** de uso interno: a cadeia de tentativas de uma troca por política (ver `Chain`); quem chama de fora nunca informa */
  chain?: Chain;
}

/** O que a execução pede para continuar noutro alvo: o destino da política e a cadeia atualizada. */
interface Retry {
  target: RunTarget;
  chain: Chain;
}

interface Run {
  profile: AiProfile;
  exec: AiExecution;
  /** status que o card tinha antes de a execução começar */
  previous: CardStatus | null;
  /** últimas linhas que a ferramenta escreveu, para explicar uma falha no próprio card */
  tail: string[];
  mode: AiRunMode;
  /** quem pediu a execução: decide o que fazer com o card quando o refinamento termina */
  origin: AiRunOrigin;
  /** projeção publicada ao router (ver `publish`) */
  info: AiActivity;
  /** o alvo desta execução (perfil de CLI e modelo); é nele que o gateway, o login e a troca por política se apoiam */
  target: RunTarget;
  chain: Chain;
  /** o contexto que as políticas casam: ação, agente, fase e tipo do card */
  policy: {
    action: ContextAction;
    agentId: string | null;
    phaseId: string | null;
    cardTypeId: string | null;
    constraints: ExecutionConstraints | null;
  };
}

const RUNNER_AUTHOR = 'Faz AI';

/**
 * O início automático foi recusado porque o perfil de CLI está pausado pelo limite de uso (ou a execução de teste dele
 * está em curso). Não é falha: quem despacha (heartbeat, autopiloto, orquestrador) registra o motivo e segue com os
 * outros perfis, sem esvaziar a fila.
 */
export class UsageLimitHeld extends Error {
  constructor(
    readonly profileId: string,
    readonly resumeAt: number,
    label: string,
  ) {
    super(`O limite de uso do ${label} esgotou; a fila daquele perfil volta a rodar às ${limitClock(resumeAt, Date.now())}.`);
    this.name = 'UsageLimitHeld';
  }
}

/**
 * Padrões de saída que indicam login vencido, por ferramenta: a falha vira o aviso global (RF6), não
 * um bloqueio do card. Risco já documentado na Spec: a lista pode ficar desatualizada se a CLI mudar o
 * texto de erro; qualquer saída que não bata nenhum padrão segue o caminho atual (RF7).
 */

const TAIL_LINES = 12;
/** Tamanho de cada linha do `tail`: a explicação da falha no card não vira despejo de saída. */
const TAIL_CHARS = 300;
const WHERE = 'Configurações → Harness → "O que a IA pode fazer"';

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
      ...(SHOW_COST && c.costUsd !== null ? [`US$ ${USD.format(c.costUsd)}`] : []),
    ];
    return `${report.measure === 'partial' ? 'Consumo parcial' : 'Consumo'}: ${parts.join(' · ')}`;
  }
  if (why.explained) return 'Consumo não medido.';
  if (why.reason) return `Consumo não medido: ${why.reason}`;
  return report.reason ? `Consumo não medido. ${report.reason}` : 'Consumo não medido.';
}

/**
 * O aviso de execução longa que vai para a conversa do card: `null` quando a leitura de cache não passou do
 * limite ou não foi medida (Cursor). Só avisa; o desfecho da execução não depende dele.
 */
export function longRunNotice(report: RunReport, durationMs: number): string | null {
  const cacheRead = report.consumption?.cacheReadTokens;
  if (!exceedsRunLimit(cacheRead)) return null;
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  return `Esta execução passou do limite de consumo: ${COUNT.format(cacheRead as number)} de leitura de cache (limite ${COUNT.format(RUN_CACHE_READ_LIMIT)}) em ${minutes} min.`;
}

/** O que a IA recebe a mais quando a história está em modo autônomo (YOLO): sem aprovação, sem perguntas, até o pull request. */
export const AUTONOMOUS_ADVICE = [
  'MODO AUTÔNOMO (YOLO): esta história foi liberada para rodar sozinha. Ninguém aprova, responde nem acompanha esta sessão.',
  'Não chame request_review nem ask_question (a pergunta aberta é recusada), nem request_review com pending: no modo autônomo nenhuma pendência segura o card. Ao terminar a fase, registre na conversa o que foi feito e as decisões que tomou (add_comment) e mova o card para a próxima coluna.',
  'Ninguém revisa as decisões do meio do caminho: siga sempre os padrões do projeto e as regras de arquitetura dele (CLAUDE.md, AGENTS.md, DESIGN.md e o código parecido que já existe) e, entre os caminhos que seguem esses padrões, escolha o menos complexo. Diante de uma dúvida, decida por esse critério e registre a decisão e o motivo na conversa.',
  'ask_questions é aceita: o board responde cada pergunta com a indicada e a registra na seção "Perguntas e respostas" da descrição; use-a para as decisões com alternativas. A pessoa lê as decisões depois.',
  'Use block_card só se for impossível seguir (acesso, ambiente, falha que você não resolve), explicando o que é preciso para destravar.',
  'Na Implementação, execute todas as sub-tarefas até o fim. Na última coluna em que a IA atua (Homologação, no board padrão) não há aprovação nem próxima fase: envie a branch, abra o pull request com --base em workspace.prBase (do get_card), registre-o com set_pull_request (é o registro que entrega a história e a passa para a pessoa), resuma na conversa o que foi feito e como testar, e pare: não avance o card. Não faça o merge.',
  'Se o pedido for grande demais para uma entrega só (partes independentes), divida-o no Discovery: mantenha nesta história a primeira entrega e crie as seguintes com create_card (autonomous_from = esta história), em ordem de dependência. Elas entram na fila e cada uma parte da branch da anterior, com o pull request empilhado (--base na branch anterior).',
].join('\n');

/**
 * O que a IA recebe a mais quando a pessoa ligou o modo autônomo só até uma fase: na própria fase, que
 * ali ela pede a revisão e para; antes dela, até onde vai. `null` quando o modo vai até o fim.
 */
export function yoloStopAdvice(state: BoardState, card: Card): string | null {
  const story = storyOf(state, card) ?? card;
  const stop = yoloStopOf(state, story);
  if (!stop || stop.id === lastAiColumn(state, story.workflowId)?.id) return null;
  if (card.id === story.id && isAtYoloStop(state, story))
    return `MODO AUTÔNOMO ATÉ ${stop.name}: esta é a última fase que a pessoa liberou para você rodar sozinho. Faça o trabalho dela sem perguntas e, ao terminar, chame request_review na história com o resumo e pare. É a única vez em que request_review sem pending vale no modo autônomo: o modo se desliga e a revisão desta fase é da pessoa.`;
  return `O modo autônomo desta história vai até ${stop.name}: lá, ao terminar o trabalho da fase, a IA pede a revisão da pessoa e para.`;
}

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
 * catálogo é tudo o que ela pode indicar: os artefatos do board em modo "Pelo card" e os agentes disponíveis.
 */
export const refinePrompt = (ref: string, context: PromptContext = NO_CONTEXT, catalog?: RefineCatalog): string =>
  [
    `Refine o card ${ref} do board Faz AI, pelas ferramentas do servidor MCP "faz-ai". Refinar é deixar o card claro e completo para quem vai trabalhar nele; NÃO é fazer o trabalho da fase.`,
    ...context.always,
    ...context.card,
    ...(catalog ? catalogLines(catalog) : []),
    'Leia o card com get_card (descrição, conversa, anexos e campos) e, como apoio, get_board e get_models (tipos, campos, agentes e catálogo de modelos; o inventário do Harness está em get_harness). Pode ler o projeto para entender o contexto.',
    '1. Título e descrição: reescreva com update_card, para ficarem claros e objetivos, mantendo a intenção e tudo o que a pessoa escreveu. Não invente requisito: o que estiver ambíguo vira uma lista "Dúvidas em aberto" no fim da descrição. Se o texto já estiver bom, não mexa.',
    '2. Campos: revise Tags, Esforço da atividade, Modelo, Skills, Rules e MCPs e aplique com update_card (fields), mesmo que já tenham valor; mantenha o que fizer sentido. Escolha o agente do card com set_card_profile quando um da lista couber melhor que o padrão. Skills, rules, servidores MCP e agente só do catálogo acima: o que não está nele não existe para este board.',
    '3. Checklist: acrescente com add_checklist_item os passos que faltam para concluir o card, sem repetir os que já existem.',
    '4. Termine com add_comment na conversa do card, resumindo o que mudou e por quê.',
    'Não faça o trabalho da fase: não crie sub-tarefas, não mova o card e não mude o status (sem start_work, move_card, request_review, ask_question nem block_card). Não grave anexos. Não altere arquivos do projeto nem rode comandos.',
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
 * O que a IA recebe na execução de conflito (#747): o pull request aberto da história entrou em
 * conflito com a base, e o board a chama só para atualizar a branch por merge, resolver, rodar as
 * checagens e enviar, sem trabalhar a fase. Nada destrutivo: sem rebase nem push forçado, e o merge
 * pela metade é desfeito antes do bloqueio. O executor devolve o card ao status que tinha no fim.
 */
export const conflictPrompt = (ref: string, context: PromptContext = NO_CONTEXT, advice: string[] = []): string =>
  [
    `Resolva o conflito do pull request da história ${ref} do board Faz AI, pelas ferramentas do servidor MCP "faz-ai". NÃO é trabalhar a fase.`,
    ...context.always,
    ...context.card,
    'Leia o card com get_card: a pasta de trabalho e a branch estão em workspace, a base do pull request em workspace.prBase, e o aviso do conflito está na conversa.',
    '1. Na pasta de trabalho da história, sem trocar de branch: git fetch origin e git merge origin/<prBase>. Nunca use rebase nem push --force, nem reescreva commits já enviados.',
    '2. Resolva os conflitos preservando a intenção das duas partes.',
    '3. Rode as checagens do projeto (como o projeto as define).',
    '4. Faça o commit do merge e envie a branch com git push (sem --force).',
    '5. Registre com add_comment na conversa o que conflitou, como resolveu e o resultado das checagens.',
    'Se não conseguir (decisão que é da pessoa, checagens que não passam, sem terminal), não envie nada pela metade: desfaça o merge com git merge --abort e chame block_card com o motivo e o que a pessoa precisa fazer.',
    'Não mova o card nem mude o status (sem start_work, move_card, request_review nem ask_question), não trabalhe a fase, não abra outro pull request e não faça o merge do pull request.',
    ...advice,
    'Trabalhe só neste card. Ninguém está acompanhando esta sessão.',
  ].join('\n');

/**
 * O alvo do resumo: o mesmo perfil de CLI do card, na faixa "Alto" do catálogo dele (RF12), qualquer que
 * seja o Esforço do card. Sem faixa no catálogo, o alvo do card fica como está.
 */
function highTierTarget(state: BoardState, target: RunTarget): RunTarget {
  const tier = effortTiers(catalogTool(target.cli), state.board.modelCatalog).find(([level]) => level === 'Alto');
  const high = tier ? targetOfValue(state.board, tier[1], target.source) : null;
  return high && high.cli.id === target.cli.id ? high : target;
}

/** Texto de exibição do modelo de um alvo, traduzido de volta para o catálogo; sem o modelo nele, o nome bruto. */
function targetDisplay(state: BoardState, target: RunTarget): string {
  if (!target.model) return profileLabel(state.board, target.cli.id);
  const option = state.board.modelCatalog.find((o) => o.tool === catalogTool(target.cli) && o.model === target.model!.name);
  return option ? modelDisplay(state.board.modelCatalog, modelValue(option.id, target.model.effort)) : target.model.name;
}

/** De onde o alvo veio, na frase da recusa. */
const SOURCE_LABEL: Record<RunTargetSource, string> = {
  card: 'o campo Modelo do card',
  agent: 'o modelo do agente do card',
  rule: 'a regra de modelo que casa com o card',
  default: 'o perfil padrão',
  chat: 'o chat',
  fallback: 'a política de execução',
};

const MODE_ACTION: Record<AiRunMode, ContextAction> = { phase: 'work', refine: 'refine', summarize: 'summary', conflict: 'conflict' };

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
    'Faça o trabalho da fase em que o card está e termine passando a vez: request_review quando houver algo para revisar, ask_questions (com opções) ou ask_question (pergunta aberta) quando precisar de uma resposta, block_card se houver um impedimento, ou mova o card se a fase não exigir aprovação.',
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
  /** a última execução terminou por limite de uso do plano: o heartbeat não insiste até uma execução voltar a funcionar */
  usageLimited = false;

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
   * O alvo (perfil de CLI e modelo) sai do valor do Modelo do card (`resolveRunTarget`), não do
   * `board.aiTool`. Escolha explícita inválida recusa a execução com a mensagem, sem cair para o nível
   * seguinte. `forceTarget` é de uso interno (a troca por política, ver `settle`): sobrescreve o alvo, que
   * pode ser noutra CLI. Quem chama de fora (painel, MCP) nunca informa este parâmetro.
   */
  start(cardId: string, originOrOptions: AiRunOrigin | RunOptions = 'manual', mode: AiRunMode = 'phase', forceTarget?: RunTarget): void {
    const options: RunOptions = typeof originOrOptions === 'string' ? { origin: originOrOptions, mode } : originOrOptions;
    const origin = options.origin;
    mode = options.mode ?? mode;
    if ((options.token === undefined) !== (options.workId === undefined))
      throw new Error('A unidade exige token e identidade de trabalho juntos.');
    if (options.token !== undefined) {
      const { work } = this.router.executions.assert(options.token);
      if (work.id !== options.workId || work.cardId !== cardId) throw new Error('A unidade não pertence ao card desta execução.');
    }
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card || !isLive(card)) throw new Error('Card não encontrado.');
    if (this.runs.has(cardId)) throw new Error(`A IA já está trabalhando em ${cardRef(card)}.`);
    const resolved = forceTarget ? { blocked: false as const, target: forceTarget } : resolveRunTarget(state, card);
    if (resolved.blocked)
      throw new Error(
        `${resolved.block.message} A execução não troca de perfil nem de modelo sozinha: corrija ${SOURCE_LABEL[resolved.block.source]}.`,
      );
    // o resumo roda na faixa "Alto" do perfil do card, qualquer que seja o Esforço dele (RF12)
    const target = mode === 'summarize' && !forceTarget ? highTierTarget(state, resolved.target) : resolved.target;
    // CLI ausente ou sem login confirmado pelo probe (preventivo, RF1): só os cards deste perfil recusam, e nenhum gatilho gasta
    // uma execução. O sinal reativo (`expired`) não recusa a manual: heartbeat.ts/autopilot.ts o recusam por conta própria
    // (RF8), e a execução manual que dá certo o limpa (RF9, em settle()) — sem essa válvula, ele nunca mais sairia de `true`
    const problem = cliProblem(state, target.cli.id);
    const toolName = profileLabel(state.board, target.cli.id);
    if (problem === 'cli') throw new Error(`A CLI do ${toolName} não foi encontrada: veja o aviso no topo do board.`);
    if (problem === 'signin') throw new Error(`O login do ${toolName} venceu: veja o aviso no topo do board.`);
    // pausa por limite de uso (por perfil): só o início automático é recusado; o manual nunca (serve de teste) e a troca por
    // política (`forceTarget`) já foi decidida em settle(). Pausa vencida deixa passar uma execução, o teste
    const gated = origin !== 'manual' && !forceTarget;
    const held = pauseOf(state, target.cli.id);
    if (gated && held && !canDispatch(state, target.cli.id, Date.now())) throw new UsageLimitHeld(target.cli.id, held.resumeAt, toolName);
    const tool = toolInfo(target.cli);
    const log = (text: string) => this.deps.log(`[${cardRef(card)}] ${text}`);
    const refine = mode === 'refine';
    const summarize = mode === 'summarize';
    const conflict = mode === 'conflict';
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
    // o contexto que as políticas casam e as restrições da execução (a troca precisa mantê-las), preenchidas com o plano
    const safe = (id: string | null | undefined): string | null => (id && SAFE_ID.test(id) ? id : null);
    const policy: Run['policy'] = {
      action: MODE_ACTION[mode],
      agentId: null,
      phaseId: safe(columnOf(state, story ?? card)?.id),
      cardTypeId: safe(card.typeId),
      constraints: null,
    };
    let exec: AiExecution;
    try {
      exec = this.deps.gateway.run({
        origin,
        // o gateway grava `ai_runs.tool` com o perfil do alvo (RF20)
        tool: target.cli.id,
        profile: target.cli,
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
        beforeStart: options.beforeStart,
        prepare: () => {
          const plan = executionPlan(
            state,
            card,
            this.router.libraryMcpDefinitions(),
            boardServer(this.deps),
            target,
            this.deps.gateway.cursorHookReady?.(),
          );
          // em modo autônomo a IA precisa de git e `gh` para chegar ao pull request: roda sem restrições, como a pessoa aceitou ao ligar o modo.
          // A execução de conflito segue a permissão (e o modelo) da fase: precisa de git e das checagens, como ela
          const autonomous = !refine && !summarize && isYolo(state, card);
          // refinar e resumir não mexem em arquivos: rodam só com o board
          const permission = autonomous ? 'full' : refine || summarize ? 'board' : state.board.runner.permission;
          const permissionAdvice = refine || summarize ? null : PERMISSION_ADVICE[permission];
          const stopAdvice = autonomous && !conflict ? yoloStopAdvice(state, card) : null;
          // a sessão da história numa fase de código só cria as sub-tarefas: quem as executa é o board
          const storySessionAdvice =
            options.workId === undefined && !card.parentId && mode === 'phase' && activityKindOf(state, card, 'phase') === 'branch'
              ? STORY_SESSION_ADVICE
              : null;
          if (autonomous) log('Modo autônomo (YOLO): sem aprovação nem perguntas, permissão "Sem restrições".');
          if (refine) log('Refinar com IA: texto, campos e checklist do card, sem trabalhar a fase.');
          if (summarize) log('Resumir a conversa: lê as mensagens e grava um resumo, sem mover o card nem mudar o status.');
          if (conflict) log('Resolver conflito: atualiza a branch a partir da base do pull request, sem trabalhar a fase.');
          log(plan.summary.join(' | '));
          activityModel = plan.manifest.model?.name ?? null;
          activityEffort = plan.manifest.model?.effort ?? null;
          policy.agentId = plan.manifest.agent && SAFE_ID.test(plan.manifest.agent) ? plan.manifest.agent : null;
          // o que a troca por política precisa preservar: permissão, regime e o escopo (agente, skills, MCPs, ferramentas)
          policy.constraints = {
            permission,
            // o regime do perfil que roda esta tentativa (a ciência dele no Conectar, ou o do board)
            regime: admissionRegimeOf(state.board.runner, target.cli.id).regime,
            agentId: policy.agentId,
            scopeDigest: scopeDigest([
              plan.manifest.agent,
              plan.manifest.skills,
              plan.manifest.rules,
              plan.manifest.mcpServers,
              plan.manifest.tools,
              plan.manifest.deniedTools,
            ]),
          };
          return {
            // runtime v1: o contrato do agente e a seleção da atividade decidem; sem eles a execução não parte
            ...(this.deps.gateway.runtime === 'v1'
              ? cardV1(state, target.cli.id, {
                  cardId,
                  workflowId: card.workflowId,
                  phaseId: columnOf(state, card)?.id ?? '',
                  action: MODE_ACTION[mode],
                })
              : // runtime legado: o perfil personalizado (inclusive ACP) ainda precisa da admissão por capacidades
                !isReadyCli(target.cli)
                ? {
                    strict: {
                      profileId: target.cli.id,
                      request: legacyStrictRequest(state.board.runner, permission, plan.manifest.mcpServers),
                    },
                  }
                : {}),
            ...(options.token !== undefined ? { work: { id: options.workId!, token: options.token } } : {}),
            artifacts: this.deps.gateway.supportsSnapshots ? runArtifactRequest(state, card) : undefined,
            conference: { manifest: plan.manifest, boardServer: BOARD_SERVER },
            // a configuração completa só existe depois do plano; é a mesma que o resumo manda para o canal de log
            config: {
              model: activityModel,
              effort: activityEffort,
              profile: plan.manifest.profile,
              agent: plan.manifest.agent,
              autonomous,
              // só com o isolamento verificado; execuções antigas seguem como foram gravadas
              clean: plan.clean,
              skills: plan.manifest.skills,
              mcp: plan.manifest.mcpServers,
            },
            input: {
              prompt: refine
                ? refinePrompt(cardRef(card), contextLines(state, card), refineCatalog(state))
                : summarize
                  ? summarizePrompt(cardRef(card), contextLines(state, card))
                  : conflict
                    ? conflictPrompt(cardRef(card), contextLines(state, card), [
                        ...plan.advice,
                        ...(permissionAdvice ? [permissionAdvice] : []),
                      ])
                    : cardPrompt(
                        cardRef(card),
                        contextLines(state, card),
                        [
                          ...(stopAdvice ? [stopAdvice] : []),
                          ...(storySessionAdvice ? [storySessionAdvice] : []),
                          ...plan.advice,
                          ...(permissionAdvice ? [permissionAdvice] : []),
                          ...(options.advice ?? []),
                        ],
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
    const info: AiActivity = {
      cardId,
      runId: exec.runId,
      mode,
      origin,
      phase: storyPhase,
      model: activityModel,
      tool: target.cli.id,
      startedAt: exec.startedAt,
    };
    const run: Run = {
      profile: structuredClone(target.cli),
      exec,
      previous: card.status,
      mode,
      tail,
      info,
      target,
      chain: options.chain ?? newChain(target, exec.startedAt),
      policy,
      origin,
    };
    this.runs.set(cardId, run);
    // a primeira execução depois da pausa é o teste: as outras do perfil esperam ela terminar
    const probing = gated && !!held;
    if (probing) this.router.setLimitProbe(target.cli.id, cardId);
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
      log(runCheckLine(end.check));
      let retry: Retry | undefined;
      this.usageLimited = !end.stopped && !!end.report.usageLimitReached;
      try {
        // o card continua "em execução" para o log enquanto o desfecho é aplicado: o bloqueio e a
        // mudança de status que explicam o fim da execução ficam ligados a ela
        if (options.workId === undefined) retry = this.settle(cardId, run, end, this.aiMessages(cardId) > messagesBefore, tool.label);
        else {
          const expired = end.authExpired || authFailed(run.profile, run.tail);
          if (expired) this.router.setAuthExpired(run.profile.id, true);
          else if (!end.stopped && !end.error && end.code === 0) this.router.setAuthExpired(run.profile.id, false);
        }
        // terminou sem esbarrar no limite: a pausa do perfil acaba (a execução manual também a limpa)
        if (!end.report.usageLimitReached && !end.stopped && !end.error && end.code === 0) this.router.clearUsageLimit(run.profile.id);
      } finally {
        if (probing) this.router.setLimitProbe(run.profile.id, null);
        // a limpeza precisa acontecer antes da retentativa: start() recusa começar com o card ainda em `this.runs`
        this.runs.delete(cardId);
      }
      // a sessão da história é quem marca as sub-tarefas "Em execução" (start_work); com ela encerrada, nenhuma
      // continua em execução de verdade. Sem isto a sub-tarefa ficava presa e segurava a história para sempre
      if (!retry && options.workId === undefined && !this.orchestrated(cardId)) this.releaseSubtasks(cardId, tool.label);
      if (retry) {
        // a política autorizou a troca de alvo: uma nova execução assume, sem publicar nem avisar o fim
        // desta (quem decide o desfecho final é a execução do destino)
        try {
          this.start(cardId, { ...options, mode, chain: retry.chain }, mode, retry.target);
          return;
        } catch (e) {
          // a retentativa nem começou (card arquivado, gateway recusou): o card não pode ficar "em
          // execução" sem execução, e quem espera o fim precisa ser avisado como em qualquer outro fim
          this.block(cardId, `Não foi possível repetir a execução no destino da política: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      try {
        // o desvio vale para esta execução, mesmo que a política a troque de alvo; sem desvio nada é escrito
        const deviation = runCheckNotice(end.check);
        if (deviation) this.router.handle({ type: 'comment.add', cardId, body: deviation }, { author: RUNNER_AUTHOR, source: 'ai' });
      } catch {
        // o aviso é só informação: falhar ao escrevê-lo não muda o desfecho da execução
      }
      if (!retry) {
        try {
          const notice = longRunNotice(end.report, Date.now() - exec.startedAt);
          if (notice) this.router.handle({ type: 'comment.add', cardId, body: notice }, { author: RUNNER_AUTHOR, source: 'ai' });
        } catch {
          // o aviso é só informação: falhar ao escrevê-lo não muda o desfecho da execução
        }
      }
      this.publish();
      options.onExit?.(end);
      this.finishListeners.forEach((fn) => fn(cardId, run.mode));
    });
  }

  /** O motivo da pausa por limite de uso que recusaria o início automático do card agora, ou null (alvo inválido não é pausa). */
  usageHold(cardId: string): string | null {
    const state = this.router.snapshot();
    const card = state.cards.find((c) => c.id === cardId);
    if (!card) return null;
    const resolved = resolveRunTarget(state, card);
    if (resolved.blocked) return null;
    const id = resolved.target.cli.id;
    const held = pauseOf(state, id);
    if (!held || canDispatch(state, id, Date.now())) return null;
    return new UsageLimitHeld(id, held.resumeAt, profileLabel(state.board, id)).message;
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
   * Deixa o card num status coerente quando a IA não passou a vez por conta própria. Devolve o destino da
   * política quando o limite de uso esgotou e uma política aplicável autoriza a troca: quem chama
   * (`onExit`) inicia a retentativa com ele, depois de liberar `this.runs`; nenhum outro caso devolve valor.
   */
  private settle(cardId: string, run: Run, end: AiRunEnd, replied: boolean, toolLabel: string): Retry | undefined {
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
    const toolId = run.profile.id;
    const expired = end.authExpired || authFailed(run.profile, run.tail);
    // falha de autenticação vale para o board inteiro, não só para este card: não bloqueia, e o aviso
    // global (RF3) é quem explica à pessoa o que fazer. Entra antes do caminho de "refinar" porque RF6
    // vale para os dois modos, e antes do `failure` genérico, que continua tratando qualquer outra falha
    if (expired) {
      if (this.router.setAuthExpired(toolId, true)) this.deps.log(`Login do ${toolLabel} vencido: execuções suspensas.`);
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
    if (this.router.setAuthExpired(toolId, false)) this.deps.log(`Login do ${toolLabel} de volta: execuções retomadas.`);
    // o fim do que a ferramenta escreveu vai junto: a pessoa entende a falha sem sair do card
    // o plano gratuito do Cursor só roda o Auto: a recusa diz pouco, e a saída é o modelo do card
    const freePlan = run.tail.some((l) => /free plans can only use auto/i.test(l))
      ? `\n\nO plano gratuito do Cursor só roda o modelo Auto: escolha Auto no campo Modelo do card, ou use o botão Recriar as regras de "Esforço da atividade" em Configurações → Conectar agentes, que no Cursor sugere Auto.`
      : '';
    // o motivo da medição é recado do board no canal, não saída da ferramenta: fica fora do fim da saída
    const notice = end.measureError ? cut(end.measureError.message, TAIL_CHARS) : null;
    const toolTail = run.tail.filter((l) => l !== notice);
    const output =
      freePlan +
      (toolTail.length ? `\n\nFim da saída do ${toolLabel}:\n\n\`\`\`\n${toolTail.join('\n').replace(/```/g, "'''")}\n\`\`\`` : '');
    // caiu antes do primeiro evento e o board não repetiu: a pessoa confere o que ficou feito
    const notRepeated = end.measureError instanceof MeasureEndedError ? ` ${NOT_REPEATED}` : '';
    const failure = end.timedOut
      ? `A execução do ${toolLabel} passou do tempo limite (${this.router.snapshot().board.runner.timeoutMinutes} min) e foi encerrada. Dá para aumentar o limite em Configurações → Harness.${output}`
      : error
        ? `Não foi possível executar o ${toolLabel}: ${error.message}`
        : code !== 0
          ? `O ${toolLabel} terminou com erro (código ${code}).${notRepeated}${output}`
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
      // o limite de uso esgotou no meio: o refinamento fica por fazer (o heartbeat repete na próxima rodada)
      if (!summarize && !failure && !end.report.usageLimitReached) {
        this.router.handle({ type: 'card.refined.set', cardId }, { author: RUNNER_AUTHOR });
        // o refinamento automático do Backlog termina com a pessoa: ela revisa o card e aprova (o board o
        // leva para a primeira fase) ou pede ajustes na conversa
        if (run.origin === 'heartbeat') return void this.setStatus(cardId, 'waiting_review', toolLabel);
      }
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
    }
    // o limite de uso do plano esgotou (só o sinal estrutural do leitor da CLI, nunca o código de saída ou heurística do
    // runner), e a execução falhou ou terminou sem responder: uma execução que terminou bem não é refeita.
    // O limite esgotado vale também quando a CLI sai com código 0 sem ter respondido
    const usageLimited = end.report.usageLimitReached && (!!failure || !replied);
    if (usageLimited) {
      // a troca de modelo ou de perfil só acontece por política aplicável, decidida pelo avaliador único; sem política
      // válida não há troca (RF11), e nenhum outro caminho escolhe um modelo reserva
      const evaluated = this.evaluatePolicy(run, end, replied);
      const decision = evaluated?.decision ?? null;
      if (decision) this.deps.log(`[${cardRef(card)}] ${describeDecision(decision)}`);
      const candidate =
        decision?.action === 'fallback' && decision.target ? runTargetOfPolicy(this.router.snapshot(), decision.target) : null;
      // destino de fallback com o limite esgotado também conta como "sem política aplicável"
      const next = candidate && !limitHolds(this.router.snapshot(), candidate.cli.id, Date.now()) ? candidate : null;
      if (decision && next) {
        const state = this.router.snapshot();
        const principal = targetDisplay(state, run.target);
        const fallback = targetDisplay(state, next);
        const crossed = run.target.cli.id !== next.cli.id;
        this.router.handle(
          {
            type: 'comment.add',
            cardId,
            body: crossed
              ? `O \`${principal}\` do ${toolLabel} esgotou o limite; a execução segue com \`${fallback}\` no ${profileLabel(state.board, next.cli.id)}.`
              : `O \`${principal}\` esgotou o limite; a execução segue com \`${fallback}\`.`,
          },
          { author: RUNNER_AUTHOR, source: 'ai' },
        );
        return { target: next, chain: chainAfter(run.chain, evaluated!.attempt, decision) };
      }
      // trabalho parcial ou de efeito desconhecido: repetir às cegas, aqui ou noutro alvo, pode refazer ou desfazer o que já foi feito
      if (decision?.action === 'reconcile')
        return void this.block(
          cardId,
          `O limite de uso do plano do ${toolLabel} esgotou depois de a IA já ter agido neste card; o board não repete a execução sozinho. Confira o que ficou feito e chame a IA de novo.${output}`,
        );
      // sem política que autorize a troca: o limite renova sozinho, então o card volta para a IA em vez de ficar
      // bloqueado esperando a pessoa. O perfil fica pausado até a renovação (ou o backoff) e a fila dele espera
      const now = Date.now();
      const pause = this.router.recordUsageLimit(run.profile.id, resetAtOf(end.report.usageLimitHint, now), now);
      this.deps.log(`[${cardRef(card)}] Perfil ${toolLabel} pausado pelo limite de uso até ${limitClock(pause.resumeAt, now)}.`);
      const offered =
        decision?.action === 'offer' && decision.alternatives.length
          ? ' A política oferece outro destino, que precisa da sua confirmação.'
          : '';
      this.router.handle(
        {
          type: 'comment.add',
          cardId,
          body: `O limite de uso do plano do ${toolLabel} esgotou. O card voltou para a IA; as execuções automáticas desse perfil ficam pausadas até as ${limitClock(pause.resumeAt, now)}, quando a fila tenta de novo.${offered}${output}`,
        },
        { author: RUNNER_AUTHOR, source: 'ai' },
      );
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
    }
    if (failure) return void this.block(cardId, failure);
    // a execução de conflito terminou bem: não passa a vez nem reavalia a entrega, o card volta ao status
    // que tinha (quem confere se o conflito saiu é o MergeWatcher, na próxima consulta do pull request)
    if (run.mode === 'conflict')
      return void this.router.handle(
        { type: 'card.status.set', cardId, status: run.previous === 'running' ? 'ready' : run.previous },
        { author: RUNNER_AUTHOR },
      );
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

  /** A decisão do avaliador único para o limite de uso que esgotou nesta execução (ver `evaluateRunPolicy`). */
  private evaluatePolicy(run: Run, end: AiRunEnd, replied: boolean): { decision: PolicyDecision; attempt: PolicyAttempt } | null {
    return evaluateRunPolicy({
      state: this.router.snapshot(),
      snapshot: this.router.executionPolicyLibrary().snapshot,
      target: run.target,
      chain: run.chain,
      execStartedAt: run.exec.startedAt,
      end,
      failure: 'quota',
      action: run.policy.action,
      origin: run.origin,
      agentId: run.policy.agentId,
      phaseId: run.policy.phaseId,
      cardTypeId: run.policy.cardTypeId,
      constraints: run.policy.constraints,
      // o que a IA já fez (resposta na conversa, ferramentas ou comandos) é efeito: a execução não pode ser refeita às cegas
      acted: replied || !!end.report.inventory.length || !!end.report.bashCommands?.length,
      runningProfiles: [...this.runs.values()].filter((r) => r !== run).map((r) => r.profile.id),
    });
  }

  /** O board executa as sub-tarefas desta história (fase de código): quem as libera é a reconciliação, não a sessão. */
  private orchestrated(storyId: string): boolean {
    const s = this.router.snapshot();
    const story = s.cards.find((c) => c.id === storyId);
    return !!story && !story.parentId && activityKindOf(s, story, 'phase') === 'branch';
  }

  /** As sub-tarefas da história que a sessão encerrada deixou "Em execução" voltam para a IA. */
  private releaseSubtasks(storyId: string, toolLabel: string): void {
    const s = this.router.snapshot();
    for (const kid of s.cards.filter((c) => c.parentId === storyId && isLive(c) && c.status === 'running' && !this.runs.has(c.id))) {
      this.deps.log(`[${cardRef(kid)}] A sessão da história encerrou com a sub-tarefa "Em execução"; voltou para Pronto.`);
      this.setStatus(kid.id, 'ready', toolLabel);
    }
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
