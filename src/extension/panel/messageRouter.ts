import type { DbHandle } from '../db/database';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Attachment, BoardState, Card, FieldDef } from '../../shared/model';
import { branchName, slug } from '../../shared/git';
import { prepareWorkspace } from '../git';
import type { WebviewToHost } from '../../shared/messages';
import { EMPTY_HARNESS, REFERENCE_SKILL, aiToolInfo, type AiTool, type Harness, type HarnessItem, type HarnessKind } from '../../shared/harness';
import { EFFORT_FIELD, modelFieldOf, suggestModel, type ModelRule } from '../../shared/models';
import { newId } from '../db/ids';
import { detectTools, effortTiers, modelsFor } from '../models';
import { AttachmentStore } from '../attachments';
import { SKILLS_FIELD } from '../db/schema';
import { pendingUpgrade, upgradeBoard } from '../db/boardTemplate';
import { HarnessStore } from '../harness';
import { HarnessOps } from '../harnessOps';
import { HooksAndPermissions } from '../hooksAndPermissions';
import { McpServers } from '../mcpServers';
import { FLOW_SKILL } from '../flowSkill';
import { headlessUnsupported } from '../headless';
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
  private aiRuns: string[] = [];
  private approved: string[] = [];
  private approveListeners: ((cardId: string) => void)[] = [];
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
    this.harnessStore = opts.workspaceDir ? new HarnessStore(opts.workspaceDir, board.aiTool, opts.homeDir ?? '') : null;
    this.loadHarness();
    this.initModels();
    dbHandle.scheduleSave();
  }

  onDidChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot(): BoardState {
    const s = this.boards.snapshot(this.boardId, this.opts.author);
    return { ...s, harness: this.harness, aiRuns: this.aiRuns, aiRunUnsupported: headlessUnsupported(s.board.aiTool, s.board.runner.permission) };
  }

  /** Cards em que a extensão está executando a IA (informado pelo executor). */
  setAiRuns(cardIds: string[]): void {
    this.aiRuns = cardIds;
    this.listeners.forEach((fn) => fn());
  }

  /** Relê regras e skills do disco (chamado quando os arquivos mudam por fora) e avisa os webviews se algo mudou. */
  refreshHarness(): void {
    const before = JSON.stringify(this.harness);
    this.loadHarness();
    if (JSON.stringify(this.harness) !== before) this.changed();
  }

  /**
   * As opções do campo "Skills" acompanham as skills do projeto (ligadas ou não) e as globais e de plugins da
   * ferramenta em uso. Uma skill desligada pode ser indicada: o card entrega o caminho do SKILL.md.
   */
  private loadHarness(): void {
    if (!this.harnessStore) return;
    this.harness = this.harnessStore.scan();
    const tool = this.boards.snapshot(this.boardId).board.aiTool;
    const outside = (this.harness.inventory.find((t) => t.tool === tool)?.items ?? []).filter((i) => i.kind === 'skill' && i.scope !== 'project').map((i) => i.name);
    const project = this.harness.skills.map((s) => s.name);
    const names = [...project, ...[...new Set(outside)].filter((n) => !project.includes(n)).sort()];
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

  private get harnessOps(): HarnessOps {
    return new HarnessOps(this.opts.workspaceDir ?? '', this.home);
  }

  /** Item listado pela varredura; as operações só valem para o que está no inventário. */
  private harnessItem(tool: AiTool, kind: HarnessKind, file: string): HarnessItem {
    const item = this.harness.inventory.find((t) => t.tool === tool)?.items.find((i) => i.kind === kind && i.path === file);
    if (!item) throw new Error('Item não encontrado no harness. Atualize a lista e tente de novo.');
    return item;
  }

  private get hooksAndPermissions(): HooksAndPermissions {
    return new HooksAndPermissions(this.opts.workspaceDir ?? '', this.home);
  }

  /** Entrada de um arquivo de configuração (hook ou regra de permissão) listada pela varredura. */
  private harnessEntry(tool: AiTool, kind: HarnessKind, file: string, name: string, detail: string): HarnessItem {
    const item = this.harness.inventory.find((t) => t.tool === tool)?.items.find((i) => i.kind === kind && i.layout === 'entry' && i.path === file && i.name === name && (i.detail ?? '') === detail);
    if (!item) throw new Error('Item não encontrado no harness. Atualize a lista e tente de novo.');
    return item;
  }

  /** Cria um arquivo de apoio numa skill e devolve o caminho dele, para abrir no editor. */
  createSkillFile(tool: AiTool, skillMd: string, rel: string, link: boolean): string {
    const file = this.harnessOps.addSkillFile(this.harnessItem(tool, 'skill', skillMd), rel, '', link);
    this.loadHarness();
    this.changed();
    return file;
  }

  /** Grava um arquivo de apoio numa skill do projeto (usado pela IA). */
  writeSkillFile(name: string, rel: string, content: string): string {
    const tool = this.boards.snapshot(this.boardId).board.aiTool;
    const item = this.harness.inventory.find((t) => t.tool === tool)?.items.find((i) => i.kind === 'skill' && i.scope === 'project' && i.name === name);
    if (!item) throw new Error(`Skill "${name}" não encontrada no projeto.`);
    const file = this.harnessOps.writeSkillFile(item, rel, content);
    this.loadHarness();
    this.changed();
    return file;
  }

  /** Caminho de um arquivo de apoio que a varredura listou. */
  skillFilePath(tool: AiTool, skillMd: string, rel: string): string {
    const item = this.harnessItem(tool, 'skill', skillMd);
    if (!item.files?.includes(rel)) throw new Error('Arquivo fora do harness.');
    return path.join(path.dirname(skillMd), ...rel.split('/'));
  }

  /** Cria um item do harness e devolve o caminho do arquivo, para abrir no editor. */
  createHarnessItem(tool: AiTool, source: number, name: string, description: string): string {
    const file = this.harnessOps.create(tool, source, name, description);
    this.loadHarness();
    this.changed();
    return file;
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
  addAttachmentFiles(cardId: string, paths: string[], artifact = false): BoardState {
    for (const p of paths) this.addAttachment(cardId, artifact, (target) => this.store.importFile(target, p));
    return this.changed();
  }

  /**
   * Grava um anexo. Um artefato de fase fica sempre na história (mesmo quando é construído numa
   * sub-tarefa) e substitui o artefato de mesmo nome, para a revisão não duplicar o documento.
   */
  private addAttachment(cardId: string, artifact: boolean, importTo: (cardId: string) => Omit<Attachment, 'createdAt' | 'artifact'>): void {
    const card = this.boards.snapshot(this.boardId).cards.find((c) => c.id === cardId);
    if (!card) throw new Error('Card não encontrado');
    const rec = importTo(artifact ? card.parentId ?? card.id : card.id);
    if (artifact) {
      for (const old of this.attachments.artifactsNamed(rec.cardId, rec.filename)) {
        this.attachments.delete(old.id);
        this.store.remove(old);
      }
    }
    this.attachments.add(rec, artifact);
  }

  /**
   * Aplica a mutação e devolve o snapshot atualizado. `ctx.author` assina o que vem de outra origem
   * (ex.: IA via MCP) e `ctx.source` diz se quem age é a pessoa (padrão) ou a IA.
   */
  handle(msg: WebviewToHost, ctx: { author?: string; source?: 'human' | 'ai' } = {}): BoardState {
    return this.apply(msg, ctx.author ?? this.opts.author, ctx.source === 'ai') ? this.changed() : this.snapshot();
  }

  /** Pasta onde ficam as worktrees das histórias. */
  private get worktreeRoot(): string | null {
    const dir = this.opts.workspaceDir;
    const { git } = this.boards.snapshot(this.boardId).board;
    return dir && git.mode === 'worktree' ? path.resolve(dir, git.worktreeDir.replace(/\{repo\}/g, path.basename(dir))) : null;
  }

  /**
   * Pastas fora do projeto em que a IA precisa poder trabalhar: a das worktrees. Vai inteira (e
   * não a de uma história) porque a worktree pode ser criada no meio da execução.
   */
  aiWorkDirs(): string[] {
    const root = this.worktreeRoot;
    if (!root) return [];
    fs.mkdirSync(root, { recursive: true });
    return [root];
  }

  /** A história do card: ele mesmo, ou o pai quando é uma sub-tarefa. */
  private storyOf(cardId: string): Card {
    const cards = this.boards.snapshot(this.boardId).cards;
    const card = cards.find((c) => c.id === cardId);
    const story = card?.parentId ? cards.find((c) => c.id === card.parentId) : card;
    if (!story) throw new Error('Card não encontrado');
    return story;
  }

  /** Cria (ou reaproveita) a branch e a pasta de trabalho da história, com nomes definidos pelo board. */
  private prepareWorkspace(cardId: string): void {
    const s = this.boards.snapshot(this.boardId);
    const { git } = s.board;
    if (git.mode === 'off') throw new Error('A criação de branches está desligada neste board (Configurações → Git).');
    if (!this.opts.workspaceDir) throw new Error('Nenhuma pasta de projeto aberta.');
    const story = this.storyOf(cardId);
    // a branch já registrada vale mesmo que o título ou o padrão tenham mudado depois
    const branch = story.branch || branchName(git.branchPattern, { type: s.cardTypes.find((t) => t.id === story.typeId)?.name ?? '', number: story.number, title: story.title });
    const worktreePath = story.worktreePath || path.join(this.worktreeRoot ?? this.opts.workspaceDir, `${story.number}-${slug(story.title) || 'historia'}`);
    const ws = prepareWorkspace({ projectDir: this.opts.workspaceDir, mode: git.mode, branch, worktreePath });
    this.cards.setWorkspace(story.id, ws.branch, ws.path);
  }

  /** Muda o status de trabalho do card. Aprovar é só da pessoa; bloquear exige o motivo. */
  private setStatus(msg: Extract<WebviewToHost, { type: 'card.status.set' }>, author: string, byAi: boolean): void {
    const note = msg.note?.trim() ?? '';
    if (msg.status === 'approved' && byAi) throw new Error('Só uma pessoa pode aprovar um card.');
    if (msg.status === 'blocked' && !note) throw new Error('Informe o motivo do bloqueio.');
    this.cards.setStatus(msg.cardId, msg.status, msg.status === 'blocked' ? note : '', author);
    if (note) this.comments.add(msg.cardId, author, note, byAi ? 'ai' : 'human');
    if (msg.status === 'approved') this.approved.push(msg.cardId);
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
    // avisa das aprovações só depois de o board estar gravado e os webviews atualizados
    for (const cardId of this.approved.splice(0)) this.approveListeners.forEach((fn) => fn(cardId));
    return this.snapshot();
  }

  /** Avisa quando uma pessoa aprova um card (usado pelo merge automático). */
  onDidApprove(fn: (cardId: string) => void): void {
    this.approveListeners.push(fn);
  }

  private apply(msg: WebviewToHost, author: string, byAi: boolean): boolean {
    switch (msg.type) {
      case 'ready':
      case 'view.set':
      case 'ui.showFilters':
      case 'ui.connectAI':
      case 'ai.run':
      case 'ai.stop':
      case 'ai.heartbeat.run':
      case 'card.workspace.open':
      case 'harness.item.open':
      case 'harness.item.create':
      case 'harness.skill.file.create':
      case 'harness.skill.file.open':
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
      case 'card.workspace.prepare':
        this.prepareWorkspace(msg.cardId);
        return true;
      case 'card.workspace.clear': {
        const story = this.storyOf(msg.cardId);
        this.cards.setWorkspace(story.id, story.branch, '');
        return true;
      }
      case 'card.execProfile.set':
        this.cards.setExecProfile(msg.cardId, msg.profileId);
        return true;
      case 'settings.execProfiles.set':
        this.boards.setExecProfiles(this.boardId, msg.profiles);
        return true;
      case 'card.pr.set': {
        const url = msg.url.trim();
        if (url && !/^https?:\/\/\S+$/.test(url)) throw new Error('Informe o endereço (URL) do pull request.');
        this.cards.setPullRequest(this.storyOf(msg.cardId).id, url);
        return true;
      }
      case 'comment.add':
        if (!msg.body.trim()) return true;
        this.comments.add(msg.cardId, author, msg.body.trim(), byAi ? 'ai' : 'human');
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
        this.addAttachment(msg.cardId, msg.artifact === true, (target) => this.store.importData(target, msg.filename, msg.base64));
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
        this.settings.createColumn(msg.workflowId, msg.name, msg.position);
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
      case 'harness.refresh':
        this.refreshHarness();
        return false;
      case 'harness.skill.file.delete':
        this.harnessOps.removeSkillFile(this.harnessItem(msg.tool, 'skill', msg.path), msg.file);
        this.loadHarness();
        return true;
      case 'harness.referenceSkill.create':
        return this.harnessOp((h) => {
          h.createSkill(REFERENCE_SKILL.name, REFERENCE_SKILL.description, REFERENCE_SKILL.body);
          h.setSkillMode(REFERENCE_SKILL.name, 'manual');
          fs.mkdirSync(path.join(h.workspaceDir, aiToolInfo(this.boards.snapshot(this.boardId).board.aiTool).skills, REFERENCE_SKILL.name, 'references'), { recursive: true });
        });
      case 'harness.hook.add':
        this.hooksAndPermissions.addHook(msg.tool, msg.source, msg.hook);
        this.loadHarness();
        return true;
      case 'harness.hook.remove':
        this.hooksAndPermissions.removeHook(msg.tool, this.harnessEntry(msg.tool, 'hook', msg.path, msg.event, msg.command));
        this.loadHarness();
        return true;
      case 'harness.permission.add':
        this.hooksAndPermissions.addPermission(msg.tool, msg.source, msg.list, msg.rule);
        this.loadHarness();
        return true;
      case 'harness.permission.remove':
        this.hooksAndPermissions.removePermission(msg.tool, this.harnessEntry(msg.tool, 'settings', msg.path, msg.rule, msg.list));
        this.loadHarness();
        return true;
      case 'harness.mcp.add':
        new McpServers(this.opts.workspaceDir ?? '', this.home).add(msg.tool, msg.source, msg.server);
        this.loadHarness();
        return true;
      case 'harness.mcp.remove': {
        const item = this.harness.inventory.find((t) => t.tool === msg.tool)?.items.find((i) => i.kind === 'mcp' && i.path === msg.path && i.name === msg.name);
        if (!item) throw new Error('Servidor não encontrado no harness. Atualize a lista e tente de novo.');
        new McpServers(this.opts.workspaceDir ?? '', this.home).remove(msg.tool, item);
        this.loadHarness();
        return true;
      }
      case 'harness.item.delete':
        this.harnessOps.remove(this.harnessItem(msg.tool, msg.kind, msg.path));
        this.loadHarness();
        return true;
      case 'harness.item.copy': {
        const items = msg.items.map((i) => this.harnessItem(msg.tool, i.kind, i.path));
        try {
          for (const item of items) this.harnessOps.copy(msg.tool, item, msg.to);
        } finally {
          // se uma cópia falhar no meio, as anteriores já estão no disco
          this.loadHarness();
        }
        return true;
      }
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
      case 'harness.skill.setMode': {
        const items = msg.paths.map((p) => this.harnessItem(msg.tool, 'skill', p));
        try {
          for (const item of items) this.harnessOps.setSkillMode(msg.tool, item, msg.mode);
        } finally {
          this.loadHarness();
        }
        return true;
      }
      case 'harness.agent.create':
        return this.harnessOp((h) => h.createAgent(msg.name, msg.description, msg.content, msg.model));
      case 'harness.agent.write':
        return this.harnessOp((h) => h.writeAgent(msg.name, msg.content));
      case 'harness.agent.delete':
        return this.harnessOp((h) => h.deleteAgent(msg.name));
      case 'harness.flowSkill.install':
        // não sobrescreve: se a pessoa já ajustou a skill, a versão dela fica
        return this.harnessOp((h) => {
          if (!this.harness.skills.some((k) => k.name === FLOW_SKILL.name)) h.createSkill(FLOW_SKILL.name, FLOW_SKILL.description, FLOW_SKILL.body);
        });
      case 'settings.board.update':
        this.boards.updateBoard(this.boardId, msg.patch);
        if (msg.patch.aiTool) this.useTool(this.boards.snapshot(this.boardId).board.aiTool);
        return true;
    }
  }
}
