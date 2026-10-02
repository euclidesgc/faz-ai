import type { DbHandle } from '../db/database';
import type { Attachment, BoardState, FieldDef } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import { EMPTY_HARNESS, type AiTool, type Harness } from '../../shared/harness';
import { EFFORT_FIELD, modelFieldOf, suggestModel, type ModelRule } from '../../shared/models';
import { newId } from '../db/ids';
import { detectTools, effortTiers, modelsFor } from '../models';
import { AttachmentStore } from '../attachments';
import { SKILLS_FIELD } from '../db/schema';
import { pendingUpgrade, upgradeBoard } from '../db/boardTemplate';
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
  /** home do usuário, de onde se leem os modelos configurados nas ferramentas; sem ela vale só a lista embutida */
  homeDir?: string;
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
    // nada a mudar para chegar ao padrão atual: só registra a versão, sem perguntar
    if (!pendingUpgrade(db, board.id).length) upgradeBoard(db, board.id);
    this.harnessStore = opts.workspaceDir ? new HarnessStore(opts.workspaceDir, board.aiTool) : null;
    this.loadHarness();
    this.initModels();
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

  private get home(): string {
    return this.opts.homeDir ?? '';
  }

  /**
   * Board sem catálogo (novo ou vindo de versão anterior): escolhe a ferramenta instalada nesta
   * máquina e preenche os modelos e as regras de esforço dela.
   */
  private initModels(): void {
    const { board } = this.boards.snapshot(this.boardId);
    if (board.modelCatalog.length) return;
    const installed = detectTools(this.home);
    const tool = installed.includes(board.aiTool) ? board.aiTool : installed[0] ?? board.aiTool;
    if (tool !== board.aiTool) this.boards.updateBoard(this.boardId, { aiTool: tool });
    this.useTool(tool);
  }

  /** Passa a trabalhar com a ferramenta: pasta de skills, modelos e regras de esforço dela. */
  private useTool(tool: AiTool): void {
    this.harnessStore?.setTool(tool);
    this.loadHarness();
    this.detectModels(tool);
    this.suggestRules(tool);
  }

  /** Junta ao catálogo os modelos atuais da ferramenta, atualizando os que já existem. */
  private detectModels(tool: AiTool): void {
    const { board } = this.boards.snapshot(this.boardId);
    const found = modelsFor(tool, this.home);
    const ids = new Set(found.map((o) => o.id));
    const rest = board.modelCatalog.filter((o) => !ids.has(o.id));
    const at = rest.findIndex((o) => o.tool === tool);
    rest.splice(at < 0 ? rest.length : at, 0, ...found);
    this.boards.setModelCatalog(this.boardId, rest);
  }

  /** Troca as regras do campo "Esforço" por um modelo leve, um intermediário e um forte da ferramenta. */
  private suggestRules(tool: AiTool): void {
    let s = this.boards.snapshot(this.boardId);
    if (!s.board.modelCatalog.some((o) => o.tool === tool)) {
      this.detectModels(tool);
      s = this.boards.snapshot(this.boardId);
    }
    const field = s.fieldDefs.find((f) => f.name.toLowerCase() === EFFORT_FIELD.toLowerCase());
    if (!field) throw new Error(`O board não tem o campo "${EFFORT_FIELD}".`);
    const tiers = effortTiers(tool, s.board.modelCatalog).map(
      ([value, model]): ModelRule => ({ id: newId(), name: `${EFFORT_FIELD} ${value.toLowerCase()}`, enabled: true, groups: [[{ fieldId: field.id, op: 'is', value }]], model }),
    );
    // sai o que era só "Esforço = X"; regras montadas pela pessoa ficam, e na frente (a primeira que casa vence)
    const onlyEffort = (r: ModelRule) => r.groups.length === 1 && r.groups[0]!.length === 1 && r.groups[0]![0]!.fieldId === field.id && r.groups[0]![0]!.op === 'is';
    this.boards.setModelRules(this.boardId, [...s.board.modelRules.filter((r) => !onlyEffort(r)), ...tiers]);
  }

  private suggestionFor(cardId: string): { field: FieldDef | undefined; suggestion: string | null } {
    const s = this.boards.snapshot(this.boardId);
    const card = s.cards.find((c) => c.id === cardId);
    return card ? { field: modelFieldOf(s, card), suggestion: suggestModel(s, card) } : { field: undefined, suggestion: null };
  }

  /**
   * Preenche o campo de modelo com a sugestão das regras quando ele está vazio ou ainda tem a
   * sugestão anterior (`previous`). Um modelo escolhido à mão nunca é trocado.
   */
  private applySuggestion(cardId: string, previous: string | null): void {
    const s = this.boards.snapshot(this.boardId);
    const card = s.cards.find((c) => c.id === cardId);
    const field = card && modelFieldOf(s, card);
    if (!card || !field || !s.board.rules.autoApplyModelSuggestion) return;
    const current = s.fieldValues.find((v) => v.cardId === cardId && v.fieldId === field.id)?.value ?? null;
    const next = suggestModel(s, card);
    if ((current === null || current === previous) && next !== current) this.cards.setFieldValue(cardId, field.id, next);
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

  /**
   * Aplica a mutação e devolve o snapshot atualizado. `ctx.author` assina o que vem de outra origem
   * (ex.: IA via MCP) e `ctx.source` diz se quem age é a pessoa (padrão) ou a IA.
   */
  handle(msg: WebviewToHost, ctx: { author?: string; source?: 'human' | 'ai' } = {}): BoardState {
    return this.apply(msg, ctx.author ?? this.opts.author, ctx.source === 'ai') ? this.changed() : this.snapshot();
  }

  /** Muda o status de trabalho do card. Aprovar é só da pessoa; bloquear exige o motivo. */
  private setStatus(msg: Extract<WebviewToHost, { type: 'card.status.set' }>, author: string, byAi: boolean): void {
    const note = msg.note?.trim() ?? '';
    if (msg.status === 'approved' && byAi) throw new Error('Só uma pessoa pode aprovar um card.');
    if (msg.status === 'blocked' && !note) throw new Error('Informe o motivo do bloqueio.');
    this.cards.setStatus(msg.cardId, msg.status, msg.status === 'blocked' ? note : '', author);
    if (note) this.comments.add(msg.cardId, author, note);
  }

  /** Como `card.create`, mas devolve o id do card criado. */
  createCard(input: { typeId: string; columnId: string; parentId: string | null; title: string }): string {
    const id = this.cards.create(this.boardId, input);
    this.applySuggestion(id, null);
    this.changed();
    return id;
  }

  private changed(): BoardState {
    this.dbHandle.scheduleSave();
    this.listeners.forEach((fn) => fn());
    return this.snapshot();
  }

  private apply(msg: WebviewToHost, author: string, byAi: boolean): boolean {
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
        this.applySuggestion(this.cards.create(this.boardId, msg), null);
        return true;
      case 'card.update':
        this.cards.update(msg.cardId, msg.patch);
        return true;
      case 'card.move':
        this.cards.move(msg.cardId, msg.columnId, msg.position, { cancelChildren: msg.cancelChildren, byAi });
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
        this.cards.unarchive(msg.cardId, msg.columnId, msg.position, byAi);
        return true;
      case 'card.deletePermanent':
        this.cards.deletePermanent(msg.cardId).forEach((id) => this.store.removeCard(id));
        return true;
      case 'trash.empty':
        this.cards.emptyTrash(this.boardId).forEach((id) => this.store.removeCard(id));
        return true;
      case 'field.setValue': {
        // se o modelo atual veio da sugestão (ou está vazio), ele acompanha a nova sugestão
        const before = this.suggestionFor(msg.cardId);
        this.cards.setFieldValue(msg.cardId, msg.fieldId, msg.value);
        if (before.field && before.field.id !== msg.fieldId) this.applySuggestion(msg.cardId, before.suggestion);
        return true;
      }
      case 'checklist.add':
        this.checklist.add(msg.cardId, msg.text);
        return true;
      case 'checklist.update':
        this.checklist.update(msg.itemId, msg.patch);
        return true;
      case 'checklist.delete':
        this.checklist.delete(msg.itemId);
        return true;
      case 'card.status.set':
        this.setStatus(msg, author, byAi);
        return true;
      case 'comment.add':
        if (!msg.body.trim()) return true;
        this.comments.add(msg.cardId, author, msg.body.trim());
        // a pessoa respondeu à pergunta da IA: a vez volta para a IA
        if (!byAi && this.cards.status(msg.cardId) === 'waiting_answer') this.cards.setStatus(msg.cardId, 'ready', '', author);
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
        this.initModels();
        return true;
      case 'settings.board.upgrade':
        this.dbHandle.backup?.();
        upgradeBoard(this.dbHandle.db, this.boardId);
        return true;
      case 'settings.models.set':
        this.boards.setModelCatalog(this.boardId, msg.catalog);
        return true;
      case 'settings.models.detect':
        this.detectModels(msg.tool);
        return true;
      case 'settings.modelRules.set':
        this.boards.setModelRules(this.boardId, msg.rules);
        return true;
      case 'settings.modelRules.suggest':
        this.suggestRules(msg.tool);
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
        if (msg.patch.aiTool) this.useTool(this.boards.snapshot(this.boardId).board.aiTool);
        return true;
    }
  }
}
