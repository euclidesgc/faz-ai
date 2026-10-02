import type { AiTool, Harness } from './harness';
import type { ModelOption, ModelRule } from './models';
import type { Appearance } from './appearance';
import type { BoardRules } from './rules';
import type { CardStatus } from './status';

export type Id = string;

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
  /** modelos de LLM disponíveis, por ferramenta */
  modelCatalog: ModelOption[];
  /** sugestão de modelo conforme os campos do card */
  modelRules: ModelRule[];
  /** tema e tipografia do board */
  appearance: Appearance;
  /** versão do board padrão aplicada a este board */
  templateVersion: number;
}

export interface Workflow {
  id: Id;
  boardId: Id;
  name: string;
  position: number;
  kind: WorkflowKind;
  /** a linha começa colapsada no board */
  collapsed: boolean;
  /** a coluna de arquivados desta linha começa colapsada */
  archiveCollapsed: boolean;
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
}

export interface CardType {
  id: Id;
  boardId: Id;
  name: string;
  color: string;
  defaultWorkflowId: Id;
  /** valores de campos aplicados a cada card novo deste tipo (fieldId → valor) */
  defaults: Record<Id, FieldValue>;
}

export interface Card {
  id: Id;
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

/** Snapshot completo enviado ao webview após cada mutação. */
export interface BoardState {
  board: Board;
  workflows: Workflow[];
  columns: Column[];
  cardTypes: CardType[];
  cards: Card[];
  fieldDefs: FieldDef[];
  fieldValues: FieldValueRow[];
  checklistItems: ChecklistItem[];
  comments: Comment[];
  attachments: Attachment[];
  /** autor usado em novos comentários */
  currentUser: string;
  /** arquivos de regras e skills do projeto */
  harness: Harness;
  /** mudanças que a atualização para o board padrão atual faria; vazio quando não há o que atualizar */
  pendingUpgrade: string[];
}
