import type { DbHandle } from '../db/database';
import type { Attachment, Autopilot, BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import type { AiTool } from '../../shared/harness';
import { EMPTY_CHAT, type ChatState } from '../../shared/chat';
import type { AttachmentStore } from '../attachments';
import type { HarnessStore } from '../harness';
import { headlessUnsupported } from '../headless';
import { BoardContext, type Handler, type HandlerMap, type MessageType, type RouterOptions } from './handlers/context';
import { boardSettingsHandlers } from './handlers/boardSettings';
import { addAttachment, cardContentHandlers } from './handlers/cardContent';
import { cardHandlers, createCard } from './handlers/cards';
import { harnessHandlers } from './handlers/harness';
import { initModels, modelHandlers } from './handlers/models';
import { aiWorkDirs, workspaceHandlers } from './handlers/workspace';

export type { RouterOptions };

/** As mensagens do webview que o chat executa. */
export type ChatMessageIn = Extract<WebviewToHost, { type: 'chat.send' | 'chat.stop' | 'chat.clear' }>;

/** Tratadas pela ponte do webview (dependem do VSCode): aqui não mudam o board. */
const viaBridge = () => false;
const bridgeOnly = {
  ready: viaBridge,
  'view.set': viaBridge,
  'ui.showFilters': viaBridge,
  'ui.connectAI': viaBridge,
  'ui.openInBrowser': viaBridge,
  'ai.run': viaBridge,
  'ai.stop': viaBridge,
  'ai.heartbeat.run': viaBridge,
  'chat.send': viaBridge,
  'chat.stop': viaBridge,
  'chat.clear': viaBridge,
  'ui.showChat': viaBridge,
  'ai.autopilot.pause': viaBridge,
  'ai.autopilot.resume': viaBridge,
  'card.workspace.open': viaBridge,
  'harness.item.open': viaBridge,
  'harness.item.create': viaBridge,
  'harness.skill.file.create': viaBridge,
  'harness.skill.file.open': viaBridge,
  'harness.install.scan': viaBridge,
  'attachment.pick': viaBridge,
  'attachment.reveal': viaBridge,
  'attachment.read': viaBridge,
  'attachment.write': viaBridge,
  'attachment.saveAs': viaBridge,
} satisfies Partial<HandlerMap>;

/** Um handler por tipo de mensagem, agrupados por domínio em ./handlers. */
const HANDLERS: HandlerMap = {
  ...bridgeOnly,
  ...cardHandlers,
  ...cardContentHandlers,
  ...workspaceHandlers,
  ...boardSettingsHandlers,
  ...modelHandlers,
  ...harnessHandlers,
};

/** Aplica mensagens do webview no banco. Não depende da API do VSCode. */
export class MessageRouter {
  private ctx: BoardContext;
  private listeners = new Set<() => void>();
  private approveListeners: ((cardId: string) => void)[] = [];
  private aiRuns: string[] = [];
  private chat: ChatState = EMPTY_CHAT;
  private chatHandler: ((msg: ChatMessageIn) => void) | null = null;
  private autopilot: Autopilot = { active: false, note: null };
  readonly store: AttachmentStore;
  readonly harnessStore: HarnessStore | null;

  constructor(dbHandle: DbHandle, opts: RouterOptions) {
    this.ctx = new BoardContext(dbHandle, opts);
    this.store = this.ctx.store;
    this.harnessStore = this.ctx.harness.store;
    this.ctx.harness.load();
    initModels(this.ctx);
    dbHandle.scheduleSave();
  }

  get boardId(): string {
    return this.ctx.boardId;
  }

  onDidChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Avisa quando uma pessoa aprova um card (usado pelo merge automático). */
  onDidApprove(fn: (cardId: string) => void): void {
    this.approveListeners.push(fn);
  }

  snapshot(): BoardState {
    const s = this.ctx.boards.snapshot(this.ctx.boardId, this.ctx.opts.author);
    const { current, install } = this.ctx.harness;
    return {
      ...s,
      harness: current,
      aiRuns: this.aiRuns,
      chat: this.chat,
      autopilot: this.autopilot,
      aiRunUnsupported: headlessUnsupported(s.board.aiTool, s.board.runner.permission),
      harnessInstall: install ? { source: install.source, skills: install.skills } : null,
    };
  }

  /**
   * Aplica a mutação e devolve o snapshot atualizado. `ctx.author` assina o que vem de outra origem
   * (ex.: IA via MCP) e `ctx.source` diz se quem age é a pessoa (padrão) ou a IA.
   */
  handle(msg: WebviewToHost, ctx: { author?: string; source?: 'human' | 'ai' } = {}): BoardState {
    // o mapa garante o handler do tipo certo; o cast só junta a união de handlers numa assinatura
    const handler = HANDLERS[msg.type] as Handler<MessageType>;
    const changed = handler(msg, this.ctx, { author: ctx.author ?? this.ctx.opts.author, byAi: ctx.source === 'ai' });
    return changed ? this.changed() : this.snapshot();
  }

  /** Como `card.create`, mas devolve o id do card criado. */
  createCard(input: { typeId: string; columnId: string; parentId: string | null; title: string }): string {
    const id = createCard(this.ctx, input);
    this.changed();
    return id;
  }

  /** Cards em que a extensão está executando a IA (informado pelo executor). */
  setAiRuns(cardIds: string[]): void {
    this.aiRuns = cardIds;
    this.notify();
  }

  /** O chat com a IA (informado pela sessão de chat): as mensagens e se a IA está respondendo. */
  setChat(chat: ChatState): void {
    this.chat = chat;
    this.notify();
  }

  /** Quem executa as mensagens `chat.*`: a sessão de chat do host. */
  setChatHandler(fn: (msg: ChatMessageIn) => void): void {
    this.chatHandler = fn;
  }

  /** Encaminha uma mensagem do chat à sessão; sem ela (board sem execução da IA), avisa. */
  chatCommand(msg: ChatMessageIn): void {
    if (!this.chatHandler) throw new Error('O chat não está disponível neste board.');
    this.chatHandler(msg);
  }

  /** Estado do autopiloto (informado por ele). */
  setAutopilot(state: Autopilot): void {
    if (state.active === this.autopilot.active && state.note === this.autopilot.note) return;
    this.autopilot = state;
    this.notify();
  }

  /**
   * Pastas fora do projeto em que a IA precisa poder trabalhar: a das worktrees. Vai inteira (e
   * não a de uma história) porque a worktree pode ser criada no meio da execução.
   */
  aiWorkDirs(): string[] {
    return aiWorkDirs(this.ctx);
  }

  getAttachment(id: string): Attachment | undefined {
    return this.ctx.attachments.get(id);
  }

  /** Copia arquivos do disco como anexos do card (usado pelo seletor de arquivos). */
  addAttachmentFiles(cardId: string, paths: string[], artifact = false): BoardState {
    for (const p of paths) addAttachment(this.ctx, cardId, artifact, (target) => this.store.importFile(target, p));
    return this.changed();
  }

  /** Relê regras e skills do disco (chamado quando os arquivos mudam por fora) e avisa os webviews se algo mudou. */
  refreshHarness(): void {
    if (this.ctx.harness.refresh()) this.changed();
  }

  /** Guarda a origem de skills já disponível numa pasta, para a pessoa escolher o que instalar. */
  setInstall(source: string, dir: string, cleanup: () => void): void {
    this.ctx.harness.setInstall(source, dir, cleanup);
    this.notify();
  }

  clearInstall(): void {
    this.ctx.harness.clearInstall();
  }

  /** Cria um arquivo de apoio numa skill e devolve o caminho dele, para abrir no editor. */
  createSkillFile(tool: AiTool, skillMd: string, rel: string, link: boolean): string {
    const file = this.ctx.harness.createSkillFile(tool, skillMd, rel, link);
    this.changed();
    return file;
  }

  /** Grava um arquivo de apoio numa skill do projeto (usado pela IA). */
  writeSkillFile(name: string, rel: string, content: string): string {
    const file = this.ctx.harness.writeSkillFile(name, rel, content);
    this.changed();
    return file;
  }

  /** Caminho de um arquivo de apoio que a varredura listou. */
  skillFilePath(tool: AiTool, skillMd: string, rel: string): string {
    return this.ctx.harness.skillFilePath(tool, skillMd, rel);
  }

  /** Cria um item do harness e devolve o caminho do arquivo, para abrir no editor. */
  createHarnessItem(tool: AiTool, source: number, name: string, description: string): string {
    const file = this.ctx.harness.createItem(tool, source, name, description);
    this.changed();
    return file;
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  private changed(): BoardState {
    this.ctx.dbHandle.scheduleSave();
    this.notify();
    // avisa das aprovações só depois de o board estar gravado e os webviews atualizados
    for (const cardId of this.ctx.approved.splice(0)) this.approveListeners.forEach((fn) => fn(cardId));
    return this.snapshot();
  }
}
