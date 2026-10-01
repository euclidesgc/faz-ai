import type { ViewState } from './filters';
import type { BoardRules } from './rules';
import type { BoardState, ColumnCategory, FieldDisplay, FieldKind, FieldValue, Id, WorkflowKind } from './model';

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'view.set'; patch: Partial<ViewState> }
  | { type: 'ui.showFilters' }
  | { type: 'ui.connectAI' }
  | { type: 'card.create'; typeId: Id; columnId: Id; parentId: Id | null; title: string }
  | { type: 'card.update'; cardId: Id; patch: { title?: string; description?: string; typeId?: Id } }
  | { type: 'card.move'; cardId: Id; columnId: Id; position: number; /** ao cancelar uma história, cancela também as sub-tarefas em aberto */ cancelChildren?: boolean }
  | { type: 'card.trash'; cardId: Id }
  | { type: 'card.restore'; cardId: Id }
  | { type: 'card.archive'; cardId: Id }
  | { type: 'card.unarchive'; cardId: Id; columnId?: Id; position?: number }
  | { type: 'card.deletePermanent'; cardId: Id }
  | { type: 'trash.empty' }
  | { type: 'comment.add'; cardId: Id; body: string }
  | { type: 'comment.update'; commentId: Id; body: string }
  | { type: 'comment.delete'; commentId: Id }
  | { type: 'attachment.pick'; cardId: Id }
  | { type: 'attachment.addData'; cardId: Id; filename: string; base64: string }
  | { type: 'attachment.open'; attachmentId: Id }
  | { type: 'attachment.reveal'; attachmentId: Id }
  | { type: 'attachment.delete'; attachmentId: Id }
  | { type: 'field.setValue'; cardId: Id; fieldId: Id; value: FieldValue }
  | { type: 'checklist.add'; cardId: Id; text: string }
  | { type: 'checklist.update'; itemId: Id; patch: { text?: string; done?: boolean } }
  | { type: 'checklist.delete'; itemId: Id }
  | { type: 'settings.column.create'; workflowId: Id; name: string }
  | { type: 'settings.column.update'; columnId: Id; patch: { name?: string; category?: ColumnCategory; position?: number } }
  | { type: 'settings.column.delete'; columnId: Id; moveCardsTo: Id }
  | { type: 'settings.type.create'; name: string; color: string; defaultWorkflowId: Id }
  | { type: 'settings.type.update'; typeId: Id; patch: { name?: string; color?: string; defaultWorkflowId?: Id; defaults?: Record<Id, FieldValue> } }
  | { type: 'settings.type.delete'; typeId: Id }
  | {
      type: 'settings.field.create';
      name: string;
      kind: FieldKind;
      options: string[];
      appliesToTypes: Id[] | null;
      display: FieldDisplay;
    }
  | {
      type: 'settings.field.update';
      fieldId: Id;
      patch: { name?: string; options?: string[]; appliesToTypes?: Id[] | null; display?: FieldDisplay };
    }
  | { type: 'settings.field.delete'; fieldId: Id }
  | { type: 'settings.workflow.update'; workflowId: Id; patch: { name?: string } }
  | { type: 'settings.board.update'; patch: { name?: string } }
  /** apaga tudo e recria o board com o padrão atual */
  | { type: 'settings.board.reset' }
  | { type: 'settings.rules.update'; patch: Partial<BoardRules> }
  | { type: 'harness.rule.write'; name: string; content: string }
  | { type: 'harness.rule.delete'; name: string }
  | { type: 'harness.skill.create'; name: string; description: string; content: string }
  | { type: 'harness.skill.write'; name: string; content: string }
  | { type: 'harness.skill.setEnabled'; name: string; enabled: boolean }
  | { type: 'harness.skill.delete'; name: string };

export type HostToWebview =
  | { type: 'boardState'; state: BoardState; attachmentsBaseUri: string }
  | { type: 'ui.openCard'; cardId: Id }
  | { type: 'viewState'; view: ViewState }
  | { type: 'error'; message: string };

export type { WorkflowKind };
