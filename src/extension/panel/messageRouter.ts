import * as path from 'node:path';
import type { BoardRequirement } from '../../shared/requirements';
import type { EnvironmentReport } from '../../shared/environment';
import type { DbHandle } from '../db/database';
import { exportBoard, exportFileName, summarize, type BoardExportFile, type ImportResult } from '../db/boardExport';
import { newId } from '../db/ids';
import type { ImportSummary } from '../../shared/backup';
import type { Attachment, Autopilot, BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import type { AiTool } from '../../shared/harness';
import { EMPTY_CHAT, type ChatState } from '../../shared/chat';
import { agentProfiles } from '../../shared/execution';
import type { AttachmentStore } from '../attachments';
import type { HarnessStore } from '../harness';
import { headlessUnsupported } from '../headless';
import type { RunResolver } from '../log/eventLog';
import { getMetrics, getPanelMetrics, type MetricsQuery, type MetricsResult } from '../log/metrics';
import type { MetricsPanelQuery, MetricsPanelResult } from '../../shared/metrics';
import { BoardContext, type Actor, type Handler, type HandlerMap, type MessageType, type RouterOptions } from './handlers/context';
import { boardBackupHandlers } from './handlers/boardBackup';
import { boardSettingsHandlers } from './handlers/boardSettings';
import { addAttachment, cardContentHandlers } from './handlers/cardContent';
import { cardHandlers, createCard } from './handlers/cards';
import { harnessHandlers } from './handlers/harness';
import { initModels, modelHandlers } from './handlers/models';
import { aiWorkDirs, workspaceHandlers } from './handlers/workspace';

export type { RouterOptions };

/** De onde vem a mensagem: quem assina (`author`) e se é a pessoa (padrão) ou a IA. */
export interface Origin {
  author?: string;
  source?: 'human' | 'ai';
}

/** O que o host faz pelo Diagnóstico do ambiente. */
export interface EnvironmentHooks {
  check(): void;
  seen(): void;
  /** roda o "Instalar tudo" de um nível; ausente onde não há terminal para rodar (fica o script para copiar) */
  install?(level: 'required' | 'recommended'): void;
  /** grava o caminho completo dos MCPs que o editor não acha, e confere de novo */
  pinMcp?(): void;
}

/** As mensagens do webview que o chat executa. */
export type ChatMessageIn = Extract<WebviewToHost, { type: 'chat.send' | 'chat.stop' | 'chat.clear' | 'ai.suggestAgents' }>;

/** Tratadas pela ponte do webview (dependem do VSCode): aqui não mudam o board. */
const viaBridge = () => false;
const bridgeOnly = {
  ready: viaBridge,
  'view.set': viaBridge,
  'ui.showFilters': viaBridge,
  'ui.connectAI': viaBridge,
  'ui.fixProjectMcp': viaBridge,
  'ui.reloadWindow': viaBridge,
  'ui.openEditorMcp': viaBridge,
  'ui.openInBrowser': viaBridge,
  'ui.openIdeSettings': viaBridge,
  'ai.run': viaBridge,
  'ai.stop': viaBridge,
  'ai.heartbeat.run': viaBridge,
  'chat.send': viaBridge,
  'chat.stop': viaBridge,
  'chat.clear': viaBridge,
  'ai.suggestAgents': viaBridge,
  'ui.showChat': viaBridge,
  'requirements.check': viaBridge,
  'environment.check': viaBridge,
  'environment.seen': viaBridge,
  'environment.install': viaBridge,
  'environment.pinMcp': viaBridge,
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
  // ler o log não muda o board: a `HostBridge` responde por `panelMetrics`, sem passar por `handle`
  'metrics.query': viaBridge,
  'backup.export': viaBridge,
  'backup.import.pick': viaBridge,
  'backup.import.cancel': viaBridge,
} satisfies Partial<HandlerMap>;

/** Um handler por tipo de mensagem, agrupados por domínio em ./handlers. */
const HANDLERS: HandlerMap = {
  ...bridgeOnly,
  ...cardHandlers,
  ...cardContentHandlers,
  ...workspaceHandlers,
  ...boardSettingsHandlers,
  ...boardBackupHandlers,
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
  private requirements: BoardRequirement[] = [];
  private requirementsCheckedAt = 0;
  private requirementsCheck: (() => void) | null = null;
  private environment: EnvironmentReport | null = null;
  private environmentFirstRun = false;
  private environmentHooks: EnvironmentHooks | null = null;
  private environmentInstall: BoardState['environmentInstall'] = null;
  private environmentInstallResult: BoardState['environmentInstallResult'] = null;
  readonly store: AttachmentStore;
  readonly harnessStore: HarnessStore | null;

  constructor(dbHandle: DbHandle, opts: RouterOptions) {
    this.ctx = new BoardContext(dbHandle, opts);
    this.store = this.ctx.store;
    this.harnessStore = this.ctx.harness.store;
    this.ctx.harness.load();
    initModels(this.ctx);
    // os agentes de fábrica usam as regras de modelo, que initModels acabou de criar
    this.ctx.harness.bootstrap();
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
      // os agentes do board são os arquivos marcados: derivados aqui, nunca gravados
      board: { ...s.board, execProfiles: agentProfiles(current.agents, s.harnessSelection, s.board.runner.defaultAgent) },
      harness: current,
      aiRuns: this.aiRuns,
      chat: this.chat,
      autopilot: this.autopilot,
      aiRunUnsupported: headlessUnsupported(s.board.aiTool, s.board.runner.permission),
      requirements: this.requirements,
      requirementsCheckedAt: this.requirementsCheckedAt,
      environment: this.environment,
      environmentFirstRun: this.environmentFirstRun,
      environmentInstall: this.environmentInstall,
      environmentInstallResult: this.environmentInstallResult,
      harnessInstall: install ? { source: install.source, skills: install.skills } : null,
    };
  }

  /**
   * Aplica a mutação e devolve o snapshot atualizado. `ctx.author` assina o que vem de outra origem
   * (ex.: IA via MCP) e `ctx.source` diz se quem age é a pessoa (padrão) ou a IA.
   */
  handle(msg: WebviewToHost, ctx: Origin = {}): BoardState {
    // o mapa garante o handler do tipo certo; o cast só junta a união de handlers numa assinatura
    const handler = HANDLERS[msg.type] as Handler<MessageType>;
    const actor = this.actorOf(ctx);
    // o log: sonda antes, registro depois — só quando o handler diz que o board mudou (o que não aconteceu não entra)
    const probe = this.ctx.log.probe(msg);
    const changed = handler(msg, this.ctx, actor);
    if (changed) this.ctx.log.record(msg, actor, probe);
    return changed ? this.changed() : this.snapshot();
  }

  /** Como `card.create`, mas devolve o id do card criado. */
  createCard(input: { typeId: string; columnId: string; parentId: string | null; title: string }, ctx: Origin = {}): string {
    const msg: WebviewToHost = { type: 'card.create', ...input };
    const actor = this.actorOf(ctx);
    const probe = this.ctx.log.probe(msg);
    const id = createCard(this.ctx, input);
    this.ctx.log.record(msg, actor, probe);
    this.changed();
    return id;
  }

  /** Quem diz qual execução de IA está em curso num card (o executor), para o `run_id` dos eventos. */
  setRunResolver(fn: RunResolver | null): void {
    this.ctx.log.setRunResolver(fn);
  }

  private actorOf(ctx: Origin): Actor {
    return { author: ctx.author ?? this.ctx.opts.author, byAi: ctx.source === 'ai' };
  }

  /** O que falta para o board trabalhar com a ferramenta de IA (informado pelo host, que confere). */
  setRequirements(list: BoardRequirement[]): void {
    // avisa mesmo sem mudança: o "Verificar de novo" da interface espera o fim da conferência
    this.requirements = list;
    this.requirementsCheckedAt = Date.now();
    this.notify();
  }

  /** Quem confere os requisitos quando a pessoa pede "Verificar de novo". */
  onRequirementsCheck(fn: () => void): void {
    this.requirementsCheck = fn;
  }

  recheckRequirements(): void {
    this.requirementsCheck?.();
  }

  /** O resultado do Diagnóstico do ambiente (informado pelo host, que confere). */
  setEnvironment(report: EnvironmentReport): void {
    this.environment = report;
    this.notify();
  }

  /**
   * Quem roda o Diagnóstico e quem lembra que ele já foi mostrado nesta máquina; `firstRun` diz se a
   * tela deve abrir sozinha (a primeira abertura do board depois de instalar a extensão).
   */
  onEnvironment(hooks: EnvironmentHooks, firstRun: boolean): void {
    this.environmentHooks = hooks;
    this.environmentFirstRun = firstRun;
  }

  checkEnvironment(): void {
    this.environmentHooks?.check();
  }

  /** "Instalar tudo" de um nível: quem roda é o host (num terminal do editor). */
  installEnvironment(level: 'required' | 'recommended'): void {
    this.environmentHooks?.install?.(level);
  }

  pinEnvironmentMcp(): void {
    this.environmentHooks?.pinMcp?.();
  }

  /** O "Instalar tudo" começou ou terminou (informado pelo host). */
  setEnvironmentInstall(state: BoardState['environmentInstall']): void {
    this.environmentInstall = state;
    this.notify();
  }

  /** O resultado do último "Instalar tudo" (informado pelo host ao terminar). */
  setEnvironmentInstallResult(result: BoardState['environmentInstallResult']): void {
    this.environmentInstallResult = result;
    this.notify();
  }

  /** A tela abriu sozinha uma vez: nas próximas aberturas, só pelo botão. */
  markEnvironmentSeen(): void {
    if (!this.environmentFirstRun) return;
    this.environmentFirstRun = false;
    this.environmentHooks?.seen();
    this.notify();
  }

  /** Cards em que a extensão está executando a IA (informado pelo executor). */
  setAiRuns(cardIds: string[]): void {
    this.aiRuns = cardIds;
    this.ctx.aiRuns = cardIds;
    this.notify();
  }

  /** O board como arquivo de export (texto JSON), o nome sugerido e os cards com anexo sem arquivo. */
  exportBoardFile(now = Date.now()): { text: string; name: string; warnings: string[] } {
    const { file, warnings } = exportBoard(this.ctx.dbHandle.db, this.ctx.boardId, this.store, {
      extensionVersion: this.ctx.opts.extensionVersion ?? '0',
      now,
    });
    return { text: JSON.stringify(file), name: exportFileName(this.ctx.boards.snapshot(this.ctx.boardId).board.name, now), warnings };
  }

  /** Estaciona um arquivo de export já validado e devolve o token e o resumo para a confirmação. Só o último fica guardado. */
  parkImport(file: BoardExportFile, sizeBytes: number): { token: string; summary: ImportSummary } {
    this.ctx.pendingImports.clear();
    const token = newId();
    this.ctx.pendingImports.set(token, file);
    return { token, summary: summarize(file, sizeBytes) };
  }

  discardImport(token: string): void {
    this.ctx.pendingImports.delete(token);
  }

  /** Aplica a importação estacionada sob `token` (pelo handler, com log e aviso aos webviews) e grava o banco em seguida. */
  applyImport(token: string, ctx: Origin = {}): ImportResult {
    this.ctx.lastImport = null;
    this.handle({ type: 'backup.import.apply', token }, ctx);
    const result = this.ctx.lastImport;
    if (!result) throw new Error('Importação expirada: escolha o arquivo de novo.');
    // o .bak já foi gravado e a pessoa pode fechar o editor logo depois: grava agora, sem esperar o debounce
    void this.ctx.dbHandle.flush?.().catch((e: unknown) => console.error('[fazai] falha ao salvar o board importado', e));
    return result;
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

  /** Agregação do log de utilização (contagem, duração, tokens, custo) — a única porta até ele a partir do MCP. */
  metrics(query: MetricsQuery): MetricsResult {
    return getMetrics(this.ctx.dbHandle.db, this.ctx.boardId, query);
  }

  /** Consulta do painel de métricas: só lê o log (sem sonda, sem registro, sem `notify` nem gravação do banco). */
  panelMetrics(query: MetricsPanelQuery): MetricsPanelResult {
    return getPanelMetrics(this.ctx.dbHandle.db, this.ctx.boardId, query);
  }

  /** Copia arquivos do disco como anexos do card (usado pelo seletor de arquivos). */
  addAttachmentFiles(cardId: string, paths: string[], artifact = false, ctx: Origin = {}): BoardState {
    const actor = this.actorOf(ctx);
    for (const p of paths) {
      // o mesmo par sonda/registro do `attachment.addData`, com a mensagem equivalente
      const msg: WebviewToHost = { type: 'attachment.addData', cardId, filename: path.basename(p), base64: '', artifact };
      const probe = this.ctx.log.probe(msg);
      addAttachment(this.ctx, cardId, artifact, (target) => this.store.importFile(target, p));
      this.ctx.log.record(msg, actor, probe);
    }
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
