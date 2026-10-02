import type { Appearance } from './appearance';
import type { ViewState } from './filters';
import type { AiTool } from './harness';
import type { ModelOption, ModelRule } from './models';
import type { BoardRules } from './rules';
import type { CardStatus } from './status';
import type { RunnerConfig } from './runner';
import type { GitConfig } from './git';
import type { BoardState, ColumnCategory, FieldDisplay, FieldKind, FieldValue, Id, WorkflowKind } from './model';

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'view.set'; patch: Partial<ViewState> }
  | { type: 'ui.showFilters' }
  | { type: 'ui.connectAI' }
  /** executa a ferramenta de IA do projeto em segundo plano para trabalhar neste card */
  | { type: 'ai.run'; cardId: Id }
  | { type: 'ai.stop'; cardId: Id }
  /** começa agora uma rodada do heartbeat: a IA trata tudo o que está pendente com ela */
  | { type: 'ai.heartbeat.run' }
  | { type: 'card.create'; typeId: Id; columnId: Id; parentId: Id | null; title: string }
  | { type: 'card.update'; cardId: Id; patch: { title?: string; description?: string; typeId?: Id } }
  | { type: 'card.move'; cardId: Id; columnId: Id; position: number; /** ao cancelar uma história, cancela também as sub-tarefas em aberto */ cancelChildren?: boolean }
  | { type: 'card.trash'; cardId: Id }
  | { type: 'card.restore'; cardId: Id }
  | { type: 'card.archive'; cardId: Id }
  | { type: 'card.unarchive'; cardId: Id; columnId?: Id; position?: number }
  | { type: 'card.deletePermanent'; cardId: Id }
  | { type: 'trash.empty' }
  /** cria (ou reaproveita) a branch e a worktree da história do card */
  | { type: 'card.workspace.prepare'; cardId: Id }
  /** registra o pull request da história do card */
  | { type: 'card.pr.set'; cardId: Id; url: string }
  /** a pasta de trabalho da história foi removida (a branch continua registrada) */
  | { type: 'card.workspace.clear'; cardId: Id }
  /** abre a pasta de trabalho da história numa janela nova do editor */
  | { type: 'card.workspace.open'; cardId: Id }
  /** muda o status de trabalho do card; `note` é o motivo do bloqueio ou o texto que vai junto para a conversa */
  | { type: 'card.status.set'; cardId: Id; status: CardStatus | null; note?: string }
  | { type: 'comment.add'; cardId: Id; body: string }
  | { type: 'comment.update'; commentId: Id; body: string }
  | { type: 'comment.delete'; commentId: Id }
  | { type: 'attachment.pick'; cardId: Id }
  /** `artifact`: é o documento de uma fase; vai para a história (mesmo enviado de uma sub-tarefa) e substitui o artefato de mesmo nome */
  | { type: 'attachment.addData'; cardId: Id; filename: string; base64: string; artifact?: boolean }
  | { type: 'attachment.open'; attachmentId: Id }
  | { type: 'attachment.reveal'; attachmentId: Id }
  | { type: 'attachment.delete'; attachmentId: Id }
  | { type: 'field.setValue'; cardId: Id; fieldId: Id; value: FieldValue }
  | { type: 'checklist.add'; cardId: Id; text: string }
  | { type: 'checklist.update'; itemId: Id; patch: { text?: string; done?: boolean } }
  | { type: 'checklist.delete'; itemId: Id }
  | { type: 'settings.column.create'; workflowId: Id; name: string }
  | { type: 'settings.column.update'; columnId: Id; patch: { name?: string; category?: ColumnCategory; position?: number; collapsed?: boolean; aiActive?: boolean; requiresApproval?: boolean; aiInstruction?: string; artifactName?: string; artifactTemplate?: string } }
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
  | { type: 'settings.workflow.update'; workflowId: Id; patch: { name?: string; collapsed?: boolean; archiveCollapsed?: boolean } }
  | { type: 'settings.board.update'; patch: { name?: string; aiTool?: AiTool; appearance?: Partial<Appearance>; runner?: Partial<RunnerConfig>; git?: Partial<GitConfig> } }
  /** apaga tudo e recria o board com o padrão atual */
  | { type: 'settings.board.reset' }
  /** leva o board ao padrão atual sem recriá-lo: só acrescenta e completa, os cards não saem do lugar */
  | { type: 'settings.board.upgrade' }
  | { type: 'settings.models.set'; catalog: ModelOption[] }
  /** relê os modelos da ferramenta (configuração local ou lista embutida) e os junta ao catálogo */
  | { type: 'settings.models.detect'; tool: AiTool }
  | { type: 'settings.modelRules.set'; rules: ModelRule[] }
  /** recria as regras "Esforço → modelo" com os modelos da ferramenta */
  | { type: 'settings.modelRules.suggest'; tool: AiTool }
  | { type: 'settings.rules.update'; patch: Partial<BoardRules> }
  | { type: 'harness.rule.write'; name: string; content: string }
  | { type: 'harness.rule.delete'; name: string }
  | { type: 'harness.skill.create'; name: string; description: string; content: string }
  | { type: 'harness.skill.write'; name: string; content: string }
  | { type: 'harness.skill.setEnabled'; name: string; enabled: boolean }
  | { type: 'harness.skill.delete'; name: string }
  /** instala a skill que ensina a IA a conduzir o fluxo do board (não sobrescreve uma já existente) */
  | { type: 'harness.flowSkill.install' };

export type HostToWebview =
  | { type: 'boardState'; state: BoardState; attachmentsBaseUri: string }
  | { type: 'ui.openCard'; cardId: Id }
  | { type: 'viewState'; view: ViewState }
  | { type: 'error'; message: string };

export type { WorkflowKind };
