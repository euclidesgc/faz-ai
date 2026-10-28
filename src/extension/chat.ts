import { toolInfo, catalogTool, contextEnforced, profileLabel, isReadyCli } from '../shared/aiProfiles';
import { cliProblem } from '../shared/requirements';
import type { ContextAction } from '../shared/contextPlanning';
import { defaultTarget, targetOfValue, type RunTarget } from '../shared/runTarget';
import type { AgentAssistInput, AgentAssistResult } from '../shared/agentAssistance';
import type { PolicyAssistInput, PolicyAssistResult } from '../shared/policyAssistant';
import { policyAssistancePrompt, parsePolicyAssistance } from './policyAssistant';
import { agentAssistancePrompt, parseAgentAssistance } from './agentAssistance';
import { artifactAssistancePrompt, assistContext, parseArtifactAssistance } from './artifactAssistance';
import type { ArtifactAssistInput, ArtifactAssistResult } from '../shared/artifactAssistant';
import { contextProposalPrompt, parseContextProposal } from './contextProposal';
import type { ContextProposal } from '../shared/contextProposal';
import type { ContextActivityTarget } from '../shared/contextPlanning';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_CHAT_MESSAGES, type ChatMessage } from '../shared/chat';
import { admissionRegimeOf, type RunnerPermission } from '../shared/runner';
import { effortToRun } from '../shared/execution';
import type { BoardState } from '../shared/model';
import { NO_CARD, type AiExecution } from './ai/gateway';
import { closedV1 } from './ai/v1Prepare';
import { MeasureEndedError, NOT_REPEATED } from './aiOutput/errors';
import { BOARD_SERVER, bareExec, type ExecInput } from './execution';
import { contextLines } from './promptContext';
import { runArtifactRequest } from './runArtifactSnapshot';
import { isCliNoise } from './cliNoise';
import type { MessageRouter } from './panel/messageRouter';
import { boardServer, PERMISSION_ADVICE, type RunnerDeps } from './runner';
import { chainAfter, describeDecision, evaluateRunPolicy, newChain, runTargetOfPolicy, scopeDigest, type Chain } from './policyGate';

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

/** O que a IA recebe no "Sugerir agentes com IA": ler o projeto e propor os agentes do board, criando e ajustando os agentes do board pelo MCP. */
export function suggestAgentsPrompt(): string {
  return [
    'Você vai propor os agentes de execução deste board Faz AI, pelas ferramentas do servidor MCP "faz-ai". Um agente do board (instruções, modelo, ferramentas, skills) fica guardado no próprio board e é o que ele usa para executar os cards.',
    'Leia o projeto para entender o que ele é (estrutura de pastas, package.json/pyproject/pubspec, README, linguagens e frameworks) e o board: get_board (agentes atuais, campos, regras de modelo), get_harness (tudo que o board tem, com a marcação de cada artefato) e get_models (catálogo de modelos).',
    'Proponha de 3 a 8 agentes que façam sentido para ESTE projeto. Para cada um: se já existir um parecido, ajuste-o com update_agent (patch com description, body, model, tools, skills); senão, crie com create_agent (sem scope: o agente fica no board). Descrição de uma frase que diga quando usá-lo; instruções curtas e específicas do projeto (padrões, comandos de teste, pastas do código); skills só entre as marcadas em get_harness; modelo pelo catálogo de get_models (valor como no campo Modelo, ex.: "claude:sonnet@medium"), seguindo as regras de esforço do board.',
    'Mantenha um agente condutor (que conduz os cards pelo fluxo e delega aos especialistas) como padrão do board.',
    'Não altere arquivos do projeto nem rode comandos: só as ferramentas do board. Termine com um resumo em português do Brasil: nome → para quê, o que criou e o que ajustou.',
  ].join('\n');
}

/**
 * O que a IA recebe no "Sugerir regras com IA": ler o projeto e criar de 3 a 5 regras curtas do board, uma por assunto,
 * cada uma desligada, para a pessoa revisar antes de ativar. Não toca nos arquivos de regras do projeto.
 */
export function suggestRulesPrompt(): string {
  return [
    'Você vai propor regras para este projeto, pelas ferramentas do servidor MCP "faz-ai". Uma regra do board é uma instrução curta, guardada no próprio board, que entra em todo pedido de IA do board enquanto estiver ativa.',
    'Leia o projeto para entender o que ele é (estrutura de pastas, package.json/pyproject/pubspec, scripts de teste, lint e formatação, README, linguagens e frameworks) e o que o board já tem: get_harness e read_rule_file para ler uma regra existente.',
    'Proponha de 3 a 5 regras que façam sentido para ESTE projeto, uma por assunto (por exemplo testes, estilo, commits, estrutura de pastas): convenções que se vê no código, comandos de teste, lint e formatação, padrões de commit e o que nunca fazer. Cada regra com frases diretas, no imperativo, sem repetir regra que já existe no board. Nada que mande ignorar o board, o servidor MCP, as aprovações ou as branches por história: o fluxo do board vale acima das regras.',
    'Crie cada regra com write_rule_file, com o nome em letras minúsculas e hífens (ex.: "testes-e-lint"). Depois de criar, deixe cada uma desligada com set_harness_selection (kind "instructions", usage "off"), para a pessoa revisar e ativar em "Desligado"; se uma regra do mesmo nome já existir no board, não mude o modo dela.',
    'Não altere arquivos do projeto (nem os arquivos de instruções dele) nem rode comandos: só as ferramentas do board. Termine com um resumo em português do Brasil: cada regra, em uma linha, e o que ficou desligado.',
  ].join('\n');
}

/**
 * O que a IA recebe no "Sugerir skills com IA": ler o projeto e criar de 3 a 5 skills estreitas, cada uma para uma
 * tarefa repetida do projeto, enviadas ao board em "Pelo card" (não entram no contexto sozinhas).
 */
export function suggestSkillsPrompt(): string {
  return [
    'Você vai propor skills para este projeto, pelas ferramentas do servidor MCP "faz-ai". Uma skill do board (guardada no próprio board) ensina a IA a fazer UMA tarefa do projeto, carregada só quando um card a indica.',
    'Leia o projeto para entender o que ele é (estrutura de pastas, package.json/pyproject/pubspec, README, regras, linguagens e frameworks, tarefas que se repetem como migração, novo endpoint, novo componente, release) e o que já existe: get_harness.',
    'Proponha de 3 a 5 skills que façam sentido para ESTE projeto, cada uma de um assunto diferente e estreita: uma tarefa, os arquivos envolvidos, o passo a passo com os comandos do projeto e o que a skill nunca faz. Não repita uma skill que já existe e não crie skills genéricas (como "boas práticas").',
    'Crie cada uma com create_skill (name em letras minúsculas e hífens, description de uma frase que diga a tarefa e quando usar, content com o passo a passo). Elas já nascem "Pelo card" no board (usage "contextual"); não use "always": uma skill sempre ligada pesa em toda execução.',
    'Não altere outros arquivos do projeto nem rode comandos: só as ferramentas do board. Termine com um resumo em português do Brasil: nome → tarefa e quando usar.',
  ].join('\n');
}

/**
 * As ferramentas do servidor do board que o chat usa: consultar, criar, mover e vincular cards, resumir, e montar o
 * harness (as sugestões de agentes, regras e skills). No modo API só elas vão declaradas ao modelo.
 */
export const CHAT_BOARD_TOOLS: readonly string[] = [
  'get_board',
  'get_pending_work',
  'list_cards',
  'get_card',
  'create_card',
  'update_card',
  'move_card',
  'link_cards',
  'unlink_cards',
  'archive_card',
  'add_comment',
  'add_checklist_item',
  'update_checklist_item',
  'generate_summary',
  'get_metrics',
  'get_models',
  'get_harness',
  'set_harness_selection',
  'get_agent',
  'create_agent',
  'update_agent',
  'get_skill',
  'create_skill',
  'update_skill',
  'read_rule_file',
  'write_rule_file',
];

/**
 * O alvo de uma execução do chat: o valor do Modelo escolhido decide a CLI (o prefixo do perfil). Sem escolha
 * vale o perfil padrão, que é também o das ações de apoio (sugerir regras, skills e agentes, "Indicar
 * artefatos"). Uma escolha explícita que não vale (perfil desligado, modelo fora do catálogo) bloqueia com
 * mensagem em vez de cair no padrão: trocar de perfil sem a pessoa saber gastaria o plano errado.
 */
function chatTarget(s: BoardState, model: string | null): RunTarget {
  if (!model) return defaultTarget(s.board);
  const target = targetOfValue(s.board, model, 'chat');
  if (!target)
    throw new Error(`O modelo "${model}" escolhido no chat não está disponível: o perfil está desligado ou o modelo saiu do catálogo.`);
  return target;
}

/** O modelo do alvo no formato que a linha de comando da ferramenta pede; null = o padrão dela. */
function modelOf(s: BoardState, target: RunTarget): ExecInput['model'] {
  if (!target.model) return null;
  const option = s.board.modelCatalog.find((o) => o.tool === catalogTool(target.cli) && o.model === target.model!.name);
  return { name: target.model.name, effort: option ? effortToRun(option, target.model.effort) : target.model.effort };
}

/**
 * Chat com a IA do projeto. Cada mensagem roda a ferramenta em segundo plano (a mesma do executor de
 * cards, com o servidor MCP do board), levando a conversa recente no prompt; a resposta vira uma
 * mensagem. O histórico fica num arquivo da pasta de dados. Não depende da API do VSCode.
 */
export class ChatSession {
  private messages: ChatMessage[];
  private running: AiExecution | null = null;
  private assisting = false;

  constructor(
    private router: MessageRouter,
    private deps: RunnerDeps & { file: string },
  ) {
    this.messages = this.load();
    router.setAgentAssistHandler((input) => this.assistAgent(input));
    router.setArtifactAssistHandler((input) => this.assistArtifact(input));
    router.setPolicyAssistHandler((input) => this.assistPolicy(input));
    router.setContextProposeHandler((target, language) => this.proposeContext(target, language));
    router.setChatHandler((msg) => {
      if (msg.type === 'chat.send') this.send(msg.text, msg.model);
      else if (msg.type === 'ai.suggestAgents') this.suggestAgents();
      else if (msg.type === 'ai.suggestRules') this.suggestRules();
      else if (msg.type === 'ai.suggestSkills') this.suggestSkills();
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
    this.run({ role: 'user', text: body, ...(model ? { model } : {}) }, prompt, state.board.runner.permission, model, 'chat');
  }

  /** A IA lê o projeto e propõe os agentes do board; a conversa registra o pedido e o resultado. */
  suggestAgents(): void {
    if (!this.deps.cwd || !fs.existsSync(this.deps.cwd)) throw new Error('Abra um projeto existente para gerar artefatos.');
    const state = this.router.snapshot();
    const prompt = [suggestAgentsPrompt(), ...contextLines(state).always].join('\n');
    // criar e marcar agentes é trabalho do board: roda só com ele
    this.run(
      { role: 'user', text: 'Sugerir agentes com IA: leia o projeto e proponha os agentes deste board.' },
      prompt,
      'board',
      null,
      'harness-agent',
    );
  }

  /** A IA lê o projeto e propõe regras, gravadas desligadas; a conversa registra o pedido e o resultado. */
  suggestRules(): void {
    if (!this.deps.cwd || !fs.existsSync(this.deps.cwd)) throw new Error('Abra um projeto existente para gerar artefatos.');
    const state = this.router.snapshot();
    const prompt = [suggestRulesPrompt(), ...contextLines(state).always].join('\n');
    this.run(
      { role: 'user', text: 'Sugerir regras com IA: leia o projeto e proponha regras para ele.' },
      prompt,
      'board',
      null,
      'harness-rule',
    );
  }

  /** A IA lê o projeto e propõe skills, enviadas ao board em "Pelo card"; a conversa registra o pedido e o resultado. */
  suggestSkills(): void {
    if (!this.deps.cwd || !fs.existsSync(this.deps.cwd)) throw new Error('Abra um projeto existente para gerar artefatos.');
    const state = this.router.snapshot();
    const prompt = [suggestSkillsPrompt(), ...contextLines(state).always].join('\n');
    this.run(
      { role: 'user', text: 'Sugerir skills com IA: leia o projeto e proponha skills para ele.' },
      prompt,
      'board',
      null,
      'harness-skill',
    );
  }

  /** A IA monta um rascunho de agente a partir do pedido da pessoa; nada é gravado sem ela confirmar. */
  assistAgent(input: AgentAssistInput): Promise<AgentAssistResult> {
    return new Promise((resolve, reject) => {
      const state = this.router.snapshot();
      const prompt = agentAssistancePrompt(input, state, this.router.projectProfile());
      this.start(prompt, 'board', null, 'harness-agent', {
        draftOnly: true,
        done: (text) => {
          try {
            resolve(parseAgentAssistance(text, this.router.snapshot()));
          } catch (error) {
            reject(error);
          }
        },
        failed: (error) => reject(new Error(error)),
      });
    });
  }

  /** "Criar com IA" e "Sugerir configuração" da biblioteca: a IA só lê e devolve a próxima pergunta e o rascunho. */
  assistArtifact(input: ArtifactAssistInput): Promise<ArtifactAssistResult> {
    return new Promise((resolve, reject) => {
      try {
        const state = this.router.snapshot();
        const profile = this.router.projectProfile();
        const context = assistContext(state, profile, input.goal);
        const prompt = artifactAssistancePrompt(input, state, profile);
        this.start(prompt, 'board', null, `harness-${input.kind}` as 'harness-rule' | 'harness-skill' | 'harness-agent', {
          draftOnly: true,
          done: (text) => {
            try {
              resolve(parseArtifactAssistance(text, input, this.router.snapshot(), context));
            } catch (error) {
              reject(error);
            }
          },
          failed: (error) => reject(new Error(error)),
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Proposta de configuração mínima da atividade: a IA só lê (rascunho, sem ferramentas) e a resposta passa pelo
   * validador do host. Falha ou cancelamento rejeitam sem tocar no rascunho da pessoa; nada é gravado aqui.
   */
  proposeContext(target: ContextActivityTarget, language: 'pt-BR' | 'en'): Promise<ContextProposal> {
    return new Promise((resolve, reject) => {
      try {
        const prompt = contextProposalPrompt(this.router.contextDraftState(), target, language);
        this.start(prompt, 'board', null, 'harness-suggest', {
          draftOnly: true,
          done: (text) => {
            try {
              resolve(parseContextProposal(text, this.router.contextDraftState(), target));
            } catch (error) {
              reject(error);
            }
          },
          failed: (error) => reject(new Error(error)),
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Assistente de políticas: a IA só lê o pedido e devolve uma proposta, que passa pelo validador antes de chegar à
   * tela. O mesmo `start` das demais ações de apoio avalia a política JÁ SALVA (quota, fallback e admissão do
   * executor); o rascunho nunca entra no snapshot. Sem executor admissível o erro volta e o editor manual segue livre.
   */
  assistPolicy(input: PolicyAssistInput): Promise<PolicyAssistResult> {
    return new Promise((resolve, reject) => {
      try {
        const state = this.router.snapshot();
        const snapshot = this.router.executionPolicyLibrary().snapshot;
        const prompt = policyAssistancePrompt(input, state, snapshot);
        this.start(prompt, 'board', null, 'harness-suggest', {
          draftOnly: true,
          done: (text) => {
            try {
              resolve(parsePolicyAssistance(text, input, this.router.snapshot(), this.router.executionPolicyLibrary().snapshot));
            } catch (error) {
              reject(error);
            }
          },
          failed: (error) => reject(new Error(error)),
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Uma execução do chat pelo gateway: a mensagem entra na conversa quando o processo começa, e a resposta (ou o erro) no fim. */
  private run(
    message: Omit<ChatMessage, 'id' | 'at'>,
    prompt: string,
    permission: RunnerPermission,
    model: string | null,
    action: ContextAction,
  ): void {
    this.start(prompt, permission, model, action, {
      started: () => this.add(message),
      done: (text) => this.add({ role: 'assistant', text: text || 'A IA terminou sem escrever uma resposta.' }),
      failed: (error) => this.add({ role: 'error', text: error }),
    });
  }

  /**
   * Uma execução pelo gateway, sem card: contexto vazio, só o servidor do board e o modelo escolhido.
   * `started` roda quando o processo abre; `done` recebe a resposta final; `failed`, a explicação do erro.
   */
  private start(
    prompt: string,
    permission: RunnerPermission,
    model: string | null,
    action: ContextAction,
    hooks: { draftOnly?: boolean; started?: () => void; done: (text: string) => void; failed: (error: string) => void },
    /** de uso interno: a troca por política continua a mesma cadeia noutro alvo */
    retry?: { target: RunTarget; chain: Chain },
  ): void {
    if (this.running) throw new Error('A IA ainda está respondendo. Espere ou interrompa.');
    const state = this.router.snapshot();
    const target = retry?.target ?? chatTarget(state, model);
    // a admissão recusa antes de abrir o processo, como no runner: nada é executado com a CLI ausente ou sem login
    const problem = cliProblem(state, target.cli.id);
    const label = profileLabel(state.board, target.cli.id);
    if (problem === 'cli') throw new Error(`A CLI do ${label} não foi encontrada: veja o aviso no topo do board.`);
    if (problem === 'signin') throw new Error(`O login do ${label} venceu: veja o aviso no topo do board.`);
    const tool = toolInfo(target.cli);
    // sem card não há agente: contexto vazio, só o servidor do board, os servidores em modo "Sempre" e o modelo escolhido
    const plan = bareExec(modelOf(state, target), boardServer(this.deps), state, this.router.libraryMcpDefinitions(), target.cli);
    // no modo API cada ferramenta declarada viaja em todo pedido: o chat leva só as do que ele faz
    plan.declareOnly = [...CHAT_BOARD_TOOLS];
    if (hooks.draftOnly) {
      plan.tools = ['Read', 'Glob', 'Grep'];
      plan.deniedTools = [];
      plan.mcpAllowed = [];
      plan.mcpConfig = JSON.stringify({ mcpServers: {} });
    }
    // as últimas linhas legíveis, para explicar um erro; nunca a saída crua, que no modo estruturado é JSONL
    const tail: string[] = [];
    let started = false;
    let execution: AiExecution;
    const constraints = {
      permission,
      // o regime do perfil do chat (a ciência dele no Conectar, ou o do board)
      regime: admissionRegimeOf(state.board.runner, target.cli.id).regime,
      agentId: null,
      scopeDigest: scopeDigest([plan.tools, plan.deniedTools, plan.mcpAllowed, !!hooks.draftOnly]),
    };
    try {
      // o chat é a quarta origem de execução, e a única sem card: nenhuma execução nasce da conversa de
      // um card (ela devolve o card para "pronto" e quem executa depois é o heartbeat ou o autopiloto)
      execution = this.deps.gateway.run({
        origin: 'chat',
        tool: target.cli.id,
        profile: target.cli,
        context: NO_CARD,
        cwd: this.deps.cwd,
        timeoutMinutes: state.board.runner.timeoutMinutes,
        // no chat não há agente do board nem subagente escolhido: `null` é "não definido", não "vazio"
        prepare: () => ({
          // runtime v1: contexto fechado, sem agente nem MCP além do contrato vazio (o chat não tem card)
          ...(this.deps.gateway.runtime === 'v1'
            ? closedV1(target.cli.id, action, state.board.runner, !!hooks.draftOnly, permission)
            : // runtime legado: o perfil personalizado precisa da admissão; só o pedido, sem a configuração v1
              !isReadyCli(target.cli)
              ? { strict: closedV1(target.cli.id, action, state.board.runner, !!hooks.draftOnly, permission).strict }
              : {}),
          artifacts: this.deps.gateway.supportsSnapshots ? runArtifactRequest(state) : undefined,
          config: {
            model: plan.model?.name ?? null,
            effort: plan.model?.effort ?? null,
            profile: null,
            agent: null,
            autonomous: false,
            // o contexto imposto é o do perfil do modelo escolhido no chat, não o do padrão
            clean: contextEnforced(target.cli),
            skills: [],
            mcp: [],
          },
          input: {
            prompt,
            permission,
            addDirs: this.router.aiWorkDirs(),
            exec: plan,
            boardServer: hooks.draftOnly ? undefined : boardServer(this.deps),
            draftOnly: hooks.draftOnly,
          },
        }),
        beforeSpawn: () => {
          started = true;
          hooks.started?.();
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
      hooks.failed(e instanceof Error ? e.message : String(e));
      return;
    }
    const chain = retry?.chain ?? newChain(target, execution.startedAt);
    this.running = execution;
    this.assisting = !!hooks.draftOnly;
    this.publish();

    execution.onExit((end) => {
      this.running = null;
      this.assisting = false;
      // a tela deixa de mostrar "respondendo" mesmo quando o resultado não entra na conversa
      this.publish();
      // a resposta é o texto final que a ferramenta deu, nunca o fluxo de eventos
      const text = end.report.answer.replace(ANSI, '').trim();
      // o limite de uso do plano esgotou e a execução não respondeu: só uma política aplicável troca de alvo, decidida
      // pelo avaliador único; a resposta já dada não se repete e a edição manual segue livre
      // (o texto do erro de limite não é efeito: só ferramentas e comandos que a IA usou contam como trabalho feito)
      if (!end.stopped && end.report.usageLimitReached && (end.code !== 0 || !text)) {
        const evaluated = evaluateRunPolicy({
          state: this.router.snapshot(),
          snapshot: this.router.executionPolicyLibrary().snapshot,
          target,
          chain,
          execStartedAt: execution.startedAt,
          end,
          failure: 'quota',
          action,
          origin: 'chat',
          agentId: null,
          phaseId: null,
          cardTypeId: null,
          constraints,
          acted: !!end.report.inventory.length || !!end.report.bashCommands?.length,
          runningProfiles: [],
        });
        const decision = evaluated?.decision ?? null;
        if (decision) this.deps.log(`[chat] ${describeDecision(decision)}`);
        const next = decision?.action === 'fallback' && decision.target ? runTargetOfPolicy(this.router.snapshot(), decision.target) : null;
        if (decision && evaluated && next) {
          try {
            this.start(
              prompt,
              permission,
              model,
              action,
              { ...hooks, started: undefined },
              { target: next, chain: chainAfter(chain, evaluated.attempt, decision) },
            );
            return;
          } catch (e) {
            hooks.failed(e instanceof Error ? e.message : String(e));
            return;
          }
        }
        const extra =
          decision?.action === 'reconcile'
            ? ' A IA já agiu; o board não repete a execução sozinho.'
            : decision?.action === 'offer' && decision.alternatives.length
              ? ' A política oferece outro destino, que precisa da sua confirmação: escolha-o no campo Modelo.'
              : '';
        hooks.failed(`O limite de uso do plano do ${tool.label} esgotou.${extra}`);
        return;
      }
      if (end.stopped) hooks.failed('Interrompido.');
      else if (end.timedOut) hooks.failed(`A resposta passou do tempo limite (${state.board.runner.timeoutMinutes} min) e foi encerrada.`);
      else if (end.error) hooks.failed(`Não foi possível executar o ${tool.label}: ${end.error.message}`);
      else if (end.code !== 0) {
        // o motivo da medição é recado do board no canal, não saída da ferramenta: fica fora do aviso
        const lines = tail.filter((l) => l !== end.measureError?.message).join('\n');
        // caiu antes do primeiro evento e o board não repetiu: a pessoa confere o que ficou feito
        const notRepeated = end.measureError instanceof MeasureEndedError ? ` ${NOT_REPEATED}` : '';
        hooks.failed(`O ${tool.label} terminou com erro (código ${end.code}).${notRepeated}${lines ? `\n\n${lines}` : ''}`);
      } else hooks.done(text);
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
    this.router.setChat({
      messages: this.messages,
      busy: this.running !== null,
      ...(this.assisting ? { activity: 'agent-assistance' as const } : {}),
    });
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
