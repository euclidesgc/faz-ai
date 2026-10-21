import type { AiProfile } from './aiProfiles';
import type { ContextPlanningState } from './contextPlanning';
import type { OrphanReport } from './orphans';
import type { BoardRequirement } from './requirements';
import type { EnvironmentReport } from './environment';
import type { ExecProfile } from './execution';
import type { ChatState } from './chat';
import type { McpFootprint } from './contextEstimate';
import type { AiTool, Harness } from './harness';
import type { HarnessSelection } from './harnessSelection';
import type { ModelOption, ModelRule } from './models';
import type { Appearance } from './appearance';
import type { BoardRules } from './rules';
import type { CardStatus } from './status';
import type { AiRunMode, RunnerConfig } from './runner';
import type { AiRunOrigin } from './log';
import type { BranchKind, GitConfig, MainBranch } from './git';
import type { BranchRenamePending, RenameOutcome } from './branchRename';

export type Id = string;

/** Pergunta da IA à pessoa, com opções; fica pendente no card até a pessoa enviar as respostas. */
export interface CardQuestion {
  /** Gerado pelo board ao registrar; a resposta aponta para ele. */
  id: Id;
  /** Uma linha, sem quebras. */
  question: string;
  /** Pelo menos duas, sem repetidas. */
  options: string[];
  /** Uma das opções. */
  recommended: string;
}

export type WorkflowKind = 'parent' | 'child';
/** O que a coluna representa no fluxo. */
export type ColumnCategory = 'open' | 'done' | 'cancelled';
export type FieldKind = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'url' | 'model';
export type FieldDisplay = 'badge' | 'chip' | 'inline' | 'hidden';

export interface Board {
  id: Id;
  workspaceKey: string;
  name: string;
  rules: BoardRules;
  /** ferramenta de IA com que o projeto trabalha; define regras, pasta de skills, MCP e modelos */
  aiTool: AiTool;
  /** Configuração pública dos perfis; valores executáveis permanecem no cofre do host. */
  aiProfiles: AiProfile[];
  /** modelos de LLM disponíveis, por ferramenta */
  modelCatalog: ModelOption[];
  /** sugestão de modelo conforme os campos do card */
  modelRules: ModelRule[];
  /** tema e tipografia do board */
  appearance: Appearance;
  /** versão do board padrão aplicada a este board */
  templateVersion: number;
  /** como a extensão executa a IA para um card */
  runner: RunnerConfig;
  /** branch e worktree das histórias */
  git: GitConfig;
  /** agentes do board: os arquivos de agente marcados no Harness, derivados a cada snapshot (não ficam no banco) */
  execProfiles: ExecProfile[];
}

export interface Workflow {
  id: Id;
  boardId: Id;
  name: string;
  position: number;
  kind: WorkflowKind;
  /** a linha começa colapsada no board */
  collapsed: boolean;
}

export interface Column {
  id: Id;
  workflowId: Id;
  name: string;
  position: number;
  category: ColumnCategory;
  /** derivado: category !== 'open' */
  isTerminal: boolean;
  /** a coluna começa colapsada no board */
  collapsed: boolean;
  /** a IA trabalha nos cards desta coluna: ao entrar nela o card fica "Pronto" */
  aiActive: boolean;
  /** a IA só avança o card para a frente depois que uma pessoa aprova */
  requiresApproval: boolean;
  /** o que a IA faz quando um card entra nesta coluna (fase) */
  aiInstruction: string;
  /** nome do arquivo do documento que a fase produz, ex.: PRD.md; vazio se não produz */
  artifactName: string;
  /** modelo do documento, em markdown */
  artifactTemplate: string;
  /** agente de execução dos cards desta coluna; null = o padrão do board */
  execProfile: Id | null;
}

export interface CardType {
  id: Id;
  boardId: Id;
  name: string;
  color: string;
  defaultWorkflowId: Id;
  /** valores de campos aplicados a cada card novo deste tipo (fieldId → valor) */
  defaults: Record<Id, FieldValue>;
  /** tipo de branch do gitflow que as histórias deste tipo geram; fica no tipo para renomear não mudar a branch */
  branchKind: BranchKind;
}

export interface Card {
  id: Id;
  /** Perguntas pendentes da IA (o carrossel); vazio quando não há. */
  questions: CardQuestion[];
  /** identificador visível (#12): sequencial por board, nunca reutilizado */
  number: number;
  boardId: Id;
  workflowId: Id;
  columnId: Id;
  typeId: Id;
  parentId: Id | null;
  title: string;
  description: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  /** na lixeira desde (ms) */
  deletedAt: number | null;
  /** arquivado desde (ms) */
  archivedAt: number | null;
  /** status de trabalho; null nas colunas em que a IA não atua */
  status: CardStatus | null;
  /** motivo do bloqueio */
  statusReason: string;
  statusAt: number | null;
  /** quem definiu o status */
  statusBy: string;
  /** branch da história; vazio enquanto não foi criada (sub-tarefas usam a da história) */
  branch: string;
  /** pasta em que o código da história é alterado: a worktree, ou a pasta do projeto no modo "branch" */
  worktreePath: string;
  /** branch de onde a da história partiu (develop, a principal ou a anterior da pilha); vazio = a principal (histórias anteriores ao gitflow) */
  baseBranch: string;
  /** quando a branch da história foi criada (epoch ms em texto); vazio enquanto a branch não existe */
  branchCreatedAt: string;
  /** endereço do pull request da história; vazio enquanto não foi aberto */
  prUrl: string;
  /** commit do merge do pull request da história; vazio enquanto não foi mergeado */
  mergeCommit: string;
  /** agente de execução escolhido para este card; null = o da coluna */
  execProfile: Id | null;
  /** modo autônomo (YOLO), só em histórias: a IA toca o card sem pedir aprovação nem confirmação */
  yolo: boolean;
  /**
   * até onde vai o modo autônomo: a coluna em que a IA faz o trabalho, pede a revisão e o modo se
   * desliga; null = até a última coluna em que a IA atua (o pull request)
   */
  yoloUntil: Id | null;
  /** história de que esta deriva (a funcionalidade dividida em entregas); null = não é derivada */
  derivedFrom: Id | null;
  /** quando a IA refinou o card (ms); null = ainda não refinado, e o heartbeat pode refiná-lo no Backlog */
  refinedAt: number | null;
}

/** ID do card como aparece na interface. */
export const cardRef = (card: Pick<Card, 'number'>): string => `#${card.number}`;

export interface Comment {
  id: Id;
  cardId: Id;
  author: string;
  /** quem escreveu: a pessoa ou a IA; null nas mensagens anteriores a essa marcação */
  source: 'human' | 'ai' | null;
  body: string;
  createdAt: number;
  updatedAt: number;
  /** marca esta mensagem como o resumo da conversa; ausente nas mensagens comuns */
  kind?: 'summary';
}

export interface Attachment {
  id: Id;
  cardId: Id;
  filename: string;
  /** nome do arquivo em disco, dentro de attachments/<cardId>/ */
  storedName: string;
  mime: string;
  size: number;
  createdAt: number;
  /** artefato de uma fase (PRD, Spec…): fica sempre no card da história */
  artifact: boolean;
}

export interface FieldDef {
  id: Id;
  boardId: Id;
  name: string;
  kind: FieldKind;
  /** opções para select/multiselect */
  options: string[];
  /** null = aplica-se a todos os tipos */
  appliesToTypes: Id[] | null;
  display: FieldDisplay;
  position: number;
}

export type FieldValue = string | number | boolean | string[] | null;

export interface FieldValueRow {
  cardId: Id;
  fieldId: Id;
  value: FieldValue;
}

export interface ChecklistItem {
  id: Id;
  cardId: Id;
  text: string;
  done: boolean;
  position: number;
}

/**
 * Como dois cards se relacionam. `child`: o card `fromId` é o pai de `toId` (o pai só termina quando os
 * filhos terminam). `related`: sem hierarquia, só referência (`fromId` e `toId` valem nos dois sentidos).
 * `precedes`: `fromId` precisa terminar antes de `toId` começar (`toId` depende de `fromId`); cards sem
 * dependência pendente entre si podem ser trabalhados ao mesmo tempo.
 */
export type LinkKind = 'child' | 'related' | 'precedes';

/** Vínculo entre dois cards, em qualquer workflow. Complementa as sub-tarefas (`parentId`), que seguem como estão. */
export interface CardLink {
  id: Id;
  fromId: Id;
  toId: Id;
  kind: LinkKind;
}

/** Estado do autopiloto, que toca sozinho as histórias em modo autônomo, uma de cada vez. */
/** Uma execução de IA em curso num card, como o executor a vê (projeção do que o gateway gravou em ai_runs). */
export interface AiActivity {
  cardId: Id;
  /** id da linha em ai_runs; '' quando o log não gravou */
  runId: string;
  mode: AiRunMode;
  origin: AiRunOrigin;
  /** nome da coluna de que a execução partiu (congelado no início, como no log) */
  phase: string;
  /** nome do modelo, ou null quando a ferramenta decide */
  model: string | null;
  /** ms, o mesmo startedAt da linha do log */
  startedAt: number;
}

export interface Autopilot {
  /** está tocando as histórias; desligado depois de pausar ou quando a fila acaba; liga sozinho ao abrir o editor com história pendente */
  active: boolean;
  /** por que está parado esperando uma pessoa (impedimento numa história); null quando segue normalmente */
  note: string | null;
}

/** Snapshot completo enviado ao webview após cada mutação. */
export interface BoardState {
  /** Invalida cenários quando as políticas salvas mudam em outra janela. */
  executionPolicyRevision?: string;
  /** Rascunhos versionados, separados do manifesto legado ainda em execução. */
  contextPlanning?: ContextPlanningState;
  board: Board;
  workflows: Workflow[];
  columns: Column[];
  cardTypes: CardType[];
  cards: Card[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValueRow[];
  checklistItems: ChecklistItem[];
  /** vínculos entre cards (pai/filho e relativo) */
  links: CardLink[];
  comments: Comment[];
  attachments: Attachment[];
  /** autor usado em novos comentários */
  currentUser: string;
  /** arquivos de regras e skills do projeto */
  harness: Harness;
  /** o banco de artefatos do board: o que as execuções podem usar (rules, skills, agentes e servidores MCP), por projeto */
  harnessSelection: HarnessSelection[];
  /** o que o servidor MCP do board põe em cada sessão (nomes, instruções e definições das ferramentas), para estimar o contexto de um card; null antes da medição */
  boardServer: McpFootprint | null;
  /** mudanças que a atualização para o board padrão atual faria; vazio quando não há o que atualizar */
  pendingUpgrade: string[];
  /** chat com a IA do projeto */
  chat: ChatState;
  /** cards em que a extensão está executando a IA agora; derivado de `aiActivity` */
  aiRuns: Id[];
  /** execuções de IA em curso, uma por card, como o executor as vê */
  aiActivity: AiActivity[];
  /** ms até o próximo heartbeat agendado; null quando não há nenhum agendado */
  heartbeatNextAt: number | null;
  /** autopiloto das histórias em modo autônomo (YOLO) */
  autopilot: Autopilot;
  /** por que a ferramenta do projeto não pode ser executada pelo board; null quando pode */
  aiRunUnsupported: string | null;
  /** o que falta para o board trabalhar com a ferramenta de IA (CLI, login, servidor MCP…); vazio quando está tudo pronto */
  requirements: BoardRequirement[];
  /** quando o host terminou a última conferência dos requisitos (ms), mesmo sem mudança; 0 antes da primeira */
  requirementsCheckedAt: number;
  /** a ferramenta ativa falhou por login vencido numa execução; null quando não há aviso reativo ativo */
  authExpired: AiTool | null;
  /** branches e worktrees órfãs, varridas pelo host; vazio antes da primeira varredura (runtime, não vai para o banco) */
  orphans: OrphanReport;
  /** o último Diagnóstico do ambiente; null antes de rodar a primeira vez */
  environment: EnvironmentReport | null;
  /** o Diagnóstico ainda não abriu sozinho nesta máquina: a interface abre a tela uma vez */
  environmentFirstRun: boolean;
  /** branch principal detectada no repositório do projeto; null fora de um repositório git */
  mainBranch: MainBranch | null;
  /** mudanças de nome da principal ou da develop à espera de Renomear ou Desfazer (#466) */
  branchRenames: BranchRenamePending[];
  /** o resultado da última renomeação, até ser dispensado; null sem resultado */
  branchRenameResult: RenameOutcome | null;
}
