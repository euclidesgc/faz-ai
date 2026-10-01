import type { DbHandle } from '../db/database';
import type { Attachment, BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import { EMPTY_HARNESS, type Harness } from '../../shared/harness';
import { AttachmentStore } from '../attachments';
import { SKILLS_FIELD } from '../db/schema';
import { HarnessStore } from '../harness';
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
  /** pasta do projeto; sem ela o harness (regras e skills) fica vazio */
  workspaceDir?: string;
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
  readonly harnessStore: HarnessStore | null;
  private harness: Harness = EMPTY_HARNESS;
  boardId: string;

  constructor(private dbHandle: DbHandle, private opts: RouterOptions) {
    const db = dbHandle.db;
    this.boards = new BoardRepo(db);
    this.cards = new CardRepo(db);
    this.checklist = new ChecklistRepo(db);
    this.settings = new SettingsRepo(db);
    this.comments = new CommentRepo(db);
    this.attachments = new AttachmentRepo(db);
    this.store = new AttachmentStore(opts.attachmentsDir);
    const board = this.boards.getOrCreate(opts.workspaceKey, opts.folderName);
    this.boardId = board.id;
    this.harnessStore = opts.workspaceDir ? new HarnessStore(opts.workspaceDir, board.aiTools) : null;
    this.loadHarness();
    dbHandle.scheduleSave();
  }

  onDidChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): BoardState {
    return { ...this.boards.snapshot(this.boardId, this.opts.author), harness: this.harness };
  }

  /** Relê regras e skills do disco (chamado quando os arquivos mudam por fora) e avisa os webviews se algo mudou. */
  refreshHarness(): void {
    const before = JSON.stringify(this.harness);
    this.loadHarness();
    if (JSON.stringify(this.harness) !== before) this.changed();
  }

  /** As opções do campo "Skills" acompanham as skills ligadas do projeto. */
  private loadHarness(): void {
    if (!this.harnessStore) return;
    this.harness = this.harnessStore.scan();
    const names = this.harness.skills.filter((s) => s.enabled).map((s) => s.name);
    const field = this.boards.snapshot(this.boardId).fieldDefs.find((f) => f.name.toLowerCase() === SKILLS_FIELD.toLowerCase() && f.kind === 'multiselect');
    if (field && JSON.stringify(field.options) !== JSON.stringify(names)) this.settings.updateField(field.id, { options: names });
  }

  private harnessOp(fn: (store: HarnessStore) => void): boolean {
    if (!this.harnessStore) throw new Error('Nenhuma pasta de projeto aberta.');
    fn(this.harnessStore);
    this.loadHarness();
    return true;
  }

  getAttachment(id: string): Attachment | undefined {
    return this.attachments.get(id);
  }

  /** Copia arquivos do disco como anexos do card (usado pelo seletor de arquivos). */
  addAttachmentFiles(cardId: string, paths: string[]): BoardState {
    for (const p of paths) this.attachments.add(this.store.importFile(cardId, p));
    return this.changed();
  }

  /** Aplica a mutação e devolve o snapshot atualizado. `ctx.author` assina comentários feitos por outra origem (ex.: IA via MCP). */
  handle(msg: WebviewToHost, ctx: { author?: string } = {}): BoardState {
    return this.apply(msg, ctx.author ?? this.opts.author) ? this.changed() : this.snapshot();
  }

  /** Como `card.create`, mas devolve o id do card criado. */
  createCard(input: { typeId: string; columnId: string; parentId: string | null; title: string }): string {
    const id = this.cards.create(this.boardId, input);
    this.changed();
    return id;
  }

  private changed(): BoardState {
    this.dbHandle.scheduleSave();
    this.listeners.forEach((fn) => fn());
    return this.snapshot();
  }

  private apply(msg: WebviewToHost, author: string): boolean {
    switch (msg.type) {
      case 'ready':
      case 'view.set':
      case 'ui.showFilters':
      case 'ui.connectAI':
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
        if (msg.body.trim()) this.comments.add(msg.cardId, author, msg.body.trim());
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
      case 'settings.board.reset':
        this.boards.deleteBoard(this.boardId).forEach((id) => this.store.removeCard(id));
        this.boardId = this.boards.getOrCreate(this.opts.workspaceKey, this.opts.folderName).id;
        this.harnessStore?.setTools(this.boards.snapshot(this.boardId).board.aiTools);
        this.loadHarness();
        return true;
      case 'harness.rule.write':
        return this.harnessOp((h) => h.writeRule(msg.name, msg.content));
      case 'harness.rule.delete':
        return this.harnessOp((h) => h.deleteRule(msg.name));
      case 'harness.skill.create':
        return this.harnessOp((h) => h.createSkill(msg.name, msg.description, msg.content));
      case 'harness.skill.write':
        return this.harnessOp((h) => h.writeSkill(msg.name, msg.content));
      case 'harness.skill.setEnabled':
        return this.harnessOp((h) => h.setSkillEnabled(msg.name, msg.enabled));
      case 'harness.skill.delete':
        return this.harnessOp((h) => h.deleteSkill(msg.name));
      case 'settings.board.update':
        this.boards.updateBoard(this.boardId, msg.patch);
        if (msg.patch.aiTools && this.harnessStore) {
          // as ferramentas em uso definem em que pastas as skills precisam estar
          this.harnessStore.setTools(this.boards.snapshot(this.boardId).board.aiTools);
          this.loadHarness();
        }
        return true;
    }
  }
}
