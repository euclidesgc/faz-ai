import type { BoardState, Card, CardType, ChecklistItem, Column, FieldDef, Id } from './model';

// Consultas puras sobre o estado do board, usadas pelo host e pelo front.

/** Card ativo: fora da lixeira e do arquivo. */
export const isLive = (c: Card): boolean => c.deletedAt === null && c.archivedAt === null;

/** Card arquivado que não está na lixeira. */
export const isArchived = (c: Card): boolean => c.deletedAt === null && c.archivedAt !== null;

/** A IA está trabalhando no card: uma execução disparada pela extensão ou uma sessão que marcou "Em execução". */
export const isAiWorking = (state: BoardState, card: Card): boolean => card.status === 'running' || state.aiRuns.includes(card.id);

/** Coluna em que o card está. */
export const columnOf = (state: BoardState, card: Card): Column | undefined => state.columns.find((c) => c.id === card.columnId);

/** Colunas do workflow, em ordem. */
export const columnsOf = (state: BoardState, workflowId: Id): Column[] =>
  state.columns.filter((c) => c.workflowId === workflowId).sort((a, b) => a.position - b.position);

/** Cards ativos da coluna (fora da lixeira e do arquivo), em ordem. */
export const cardsIn = (state: BoardState, columnId: Id): Card[] =>
  state.cards.filter((c) => c.columnId === columnId && isLive(c)).sort((a, b) => a.position - b.position);

/** Arquivados do workflow, do mais recente para o mais antigo. */
export const archivedIn = (state: BoardState, workflowId: Id): Card[] =>
  state.cards.filter((c) => c.workflowId === workflowId && isArchived(c)).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

/** Sub-tarefas fora da lixeira (ativas e arquivadas). */
export const childrenOf = (state: BoardState, parentId: Id): Card[] =>
  state.cards.filter((c) => c.parentId === parentId && c.deletedAt === null);

/** Sub-tarefas ativas numa coluna de categoria "em aberto". */
export const openChildren = (state: BoardState, parentId: Id): Card[] =>
  state.cards.filter((c) => c.parentId === parentId && isLive(c) && columnOf(state, c)?.category === 'open');

/** Quantos dos cards estão numa coluna de encerramento (concluída ou cancelada). */
export const countDone = (state: BoardState, cards: Card[]): number => cards.filter((c) => columnOf(state, c)?.isTerminal).length;

/** Campos que se aplicam ao tipo de card, em ordem. */
export const fieldsForType = (state: BoardState, typeId: Id): FieldDef[] =>
  state.fieldDefs.filter((f) => f.appliesToTypes === null || f.appliesToTypes.includes(typeId)).sort((a, b) => a.position - b.position);

/** Valor do campo no card, ou null quando não foi preenchido. */
export const valueOf = (state: BoardState, cardId: Id, fieldId: Id) =>
  state.fieldValues.find((v) => v.cardId === cardId && v.fieldId === fieldId)?.value ?? null;

/** Tipos de card que nascem no workflow (o workflow padrão deles é este). */
export const typesOf = (state: BoardState, workflowId: Id): CardType[] => state.cardTypes.filter((t) => t.defaultWorkflowId === workflowId);

/** Itens do checklist do card, em ordem. */
export const checklistOf = (state: BoardState, cardId: Id): ChecklistItem[] =>
  state.checklistItems.filter((i) => i.cardId === cardId).sort((a, b) => a.position - b.position);

/** Onde nasce uma sub-tarefa nova: primeira coluna do workflow de baixo, com o tipo padrão dele. */
export function subtaskSlot(state: BoardState): { typeId: Id; columnId: Id } | undefined {
  const childWf = state.workflows.find((w) => w.kind === 'child');
  if (!childWf) return undefined;
  const column = columnsOf(state, childWf.id)[0];
  const type = typesOf(state, childWf.id)[0];
  return column && type ? { typeId: type.id, columnId: column.id } : undefined;
}
