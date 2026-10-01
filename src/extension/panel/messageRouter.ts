import type { DbHandle } from '../db/database';
import type { Attachment, BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import { AttachmentStore } from '../attachments';
import { AttachmentRepo } from '../repositories/attachmentRepo';
import { BoardRepo } from '../repositories/boardRepo';
import { CardRepo } from '../repositories/cardRepo';
import { ChecklistRepo } from '../repositories/checklistRepo';
import { CommentRepo } from '../repositories/commentRepo';
import { SettingsRepo } from '../repositories/settingsRepo';

export interface RouterOptions {
  workspaceKey: string;
  folderName: string;
  author: string;
  attachmentsDir: string;
}

/** Aplica mensagens do webview no banco. Não depende da API do VSCode. */
export class MessageRouter {
  private boards: BoardRepo;
  private cards: CardRepo;
  private checklist: ChecklistRepo;
  private settings: SettingsRepo;
  private comments: CommentRepo;
  private attachments: AttachmentRepo;
  private listeners = new Set<() => void>();
  readonly store: AttachmentStore;
  readonly boardId: string;

  constructor(private dbHandle: DbHandle, private opts: RouterOptions) {
    const db = dbHandle.db;
    this.boards = new BoardRepo(db);
    this.cards = new CardRepo(db);
    this.checklist = new ChecklistRepo(db);
    this.settings = new SettingsRepo(db);
    this.comments = new CommentRepo(db);
    this.attachments = new AttachmentRepo(db);
    this.store = new AttachmentStore(opts.attachmentsDir);
    this.boardId = this.boards.getOrCreate(opts.workspaceKey, opts.folderName).id;
    dbHandle.scheduleSave();
  }

  onDidChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): BoardState {
    return this.boards.snapshot(this.boardId, this.opts.author);
  }

  getAttachment(id: string): Attachment | undefined {
    return this.attachments.get(id);
  }

  /** Copia arquivos do disco como anexos do card (usado pelo seletor de arquivos). */
  addAttachmentFiles(cardId: string, paths: string[]): BoardState {
    for (const p of paths) this.attachments.add(this.store.importFile(cardId, p));
    return this.changed();
  }

  /** Aplica a mutação e devolve o snapshot atualizado. */
  handle(msg: WebviewToHost): BoardState {
    return this.apply(msg) ? this.changed() : this.snapshot();
  }

  private changed(): BoardState {
    this.dbHandle.scheduleSave();
    this.listeners.forEach((fn) => fn());
    return this.snapshot();
  }

  private apply(msg: WebviewToHost): boolean {
    switch (msg.type) {
      case 'ready':
      case 'view.set':
      case 'ui.showFilters':
      case 'attachment.pick':
      case 'attachment.open':
      case 'attachment.reveal':
        return false; // tratados pela ponte do webview (dependem do VSCode)
      case 'card.create':
        this.cards.create(this.boardId, msg);
        return true;
      case 'card.update':
        this.cards.update(msg.cardId, msg.patch);
        return true;
      case 'card.move':
        this.cards.move(msg.cardId, msg.columnId, msg.position, { cancelChildren: msg.cancelChildren });
        return true;
      case 'card.trash':
        this.cards.trash(msg.cardId);
        return true;
      case 'card.restore':
        this.cards.restore(msg.cardId);
        return true;
      case 'card.archive':
        this.cards.archive(msg.cardId);
        return true;
      case 'card.unarchive':
        this.cards.unarchive(msg.cardId, msg.columnId, msg.position);
        return true;
      case 'card.deletePermanent':
        this.cards.deletePermanent(msg.cardId).forEach((id) => this.store.removeCard(id));
        return true;
      case 'trash.empty':
        this.cards.emptyTrash(this.boardId).forEach((id) => this.store.removeCard(id));
        return true;
      case 'field.setValue':
        this.cards.setFieldValue(msg.cardId, msg.fieldId, msg.value);
        return true;
      case 'checklist.add':
        this.checklist.add(msg.cardId, msg.text);
        return true;
      case 'checklist.update':
        this.checklist.update(msg.itemId, msg.patch);
        return true;
      case 'checklist.delete':
        this.checklist.delete(msg.itemId);
        return true;
      case 'comment.add':
        if (msg.body.trim()) this.comments.add(msg.cardId, this.opts.author, msg.body.trim());
        return true;
      case 'comment.update':
        this.comments.update(msg.commentId, msg.body);
        return true;
      case 'comment.delete':
        this.comments.delete(msg.commentId);
        return true;
      case 'attachment.addData':
        this.attachments.add(this.store.importData(msg.cardId, msg.filename, msg.base64));
        return true;
      case 'attachment.delete': {
        const a = this.attachments.get(msg.attachmentId);
        if (a) {
          this.attachments.delete(a.id);
          this.store.remove(a);
        }
        return true;
      }
      case 'settings.column.create':
        this.settings.createColumn(msg.workflowId, msg.name);
        return true;
      case 'settings.column.update':
        this.settings.updateColumn(msg.columnId, msg.patch);
        return true;
      case 'settings.column.delete':
        this.settings.deleteColumn(msg.columnId, msg.moveCardsTo);
        return true;
      case 'settings.type.create':
        this.settings.createType(this.boardId, msg.name, msg.color, msg.defaultWorkflowId);
        return true;
      case 'settings.type.update':
        this.settings.updateType(msg.typeId, msg.patch);
        return true;
      case 'settings.type.delete':
        this.settings.deleteType(msg.typeId);
        return true;
      case 'settings.field.create':
        this.settings.createField(this.boardId, msg);
        return true;
      case 'settings.field.update':
        this.settings.updateField(msg.fieldId, msg.patch);
        return true;
      case 'settings.field.delete':
        this.settings.deleteField(msg.fieldId);
        return true;
      case 'settings.workflow.update':
        this.boards.updateWorkflow(msg.workflowId, msg.patch);
        return true;
      case 'settings.rules.update':
        this.boards.updateRules(this.boardId, msg.patch);
        return true;
      case 'settings.board.update':
        this.boards.updateBoard(this.boardId, msg.patch);
        return true;
    }
  }
}
