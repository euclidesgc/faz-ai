import { agentOfArtifact } from '../../shared/artifacts';
import * as path from 'node:path';
import type { BoardRequirement } from '../../shared/requirements';
import type { EnvironmentReport } from '../../shared/environment';
import { EMPTY_ORPHANS, type OrphanReport } from '../../shared/orphans';
import type { DbHandle } from '../db/database';
import { exportBoard, exportFileName, summarize, type BoardExportFile, type ImportResult } from '../db/boardExport';
import { newId } from '../db/ids';
import type { ImportSummary } from '../../shared/backup';
import type { AiActivity, Attachment, Autopilot, BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import type { AiTool, HarnessSuggestions, PluginAction } from '../../shared/harness';
import type { ProjectProfile } from '../../shared/projectProfile';
import { readProjectProfile } from '../projectProfile';
import type { ClaudeCli } from '../plugins';
import { EMPTY_CHAT, type ChatState } from '../../shared/chat';
import { agentProfiles } from '../../shared/execution';
import { columnsOf } from '../../shared/selectors';
import type { AttachmentStore } from '../attachments';
import type { HarnessStore } from '../harness';
import { headlessUnsupported } from '../headless';
import { boardServerFootprint } from '../mcp/footprint';
import type { RunResolver } from '../log/eventLog';
import { getMetrics, getPanelMetrics, type MetricsQuery, type MetricsResult } from '../log/metrics';
import { cardUsage } from '../log/cardUsage';
import type { CardUsage } from '../../shared/cardUsage';
import type { MetricsPanelQuery, MetricsPanelResult } from '../../shared/metrics';
import { BoardContext, type Actor, type Handler, type HandlerMap, type MessageType, type RouterOptions } from './handlers/context';
import { boardBackupHandlers } from './handlers/boardBackup';
import { boardSettingsHandlers } from './handlers/boardSettings';
import { addAttachment, cardContentHandlers } from './handlers/cardContent';
import { cardHandlers, createCard } from './handlers/cards';
import { harnessHandlers } from './handlers/harness';
import { initModels, modelHandlers } from './handlers/models';
import { aiWorkDirs, workspaceHandlers } from './handlers/workspace';
import { branchRenameHandlers } from './handlers/branchRename';
import { settleDelivery } from '../delivery';
import { USAGE_LIMIT_META_KEY, nextPause, parsePause, type UsageLimitPause } from '../../shared/usageLimit';

export type { RouterOptions };

/** De onde vem a mensagem: quem assina (`author`) e se é a pessoa (padrão) ou a IA. */
export interface Origin {
  author?: string;
  source?: 'human' | 'ai';
}

/** O que o host faz pelo Diagnóstico do ambiente. */
export interface EnvironmentHooks {
  /** roda o Diagnóstico; resolve quando o relatório já está no board e rejeita se a conferência falhou */
  check(): Promise<void>;
  seen(): void;
  /** grava o caminho completo dos MCPs que o editor não acha, e confere de novo */
  pinMcp?(): Promise<void>;
  /** libera as ferramentas do board sem aprovação nas conversas do Kimi Code (a regra no config.toml), e confere de novo */
  allowKimiMcp?(): void;
}

/** O que o host faz pela limpeza de branches e worktrees órfãs (#465). O relatório sai por `setOrphans`. */
export interface OrphanHooks {
  /** varre e publica, sem remover nada; nunca rejeita */
  scan(): Promise<void>;
  /** limpa um item, revalidado no host; resolve com o aviso para a pessoa */
  clean(id: string, acceptLoss?: { dirtyFiles: number; uniqueCommits: number }): Promise<string>;
  /** remove todas as seguras (revalidadas); resolve com o resumo */
  cleanSafe(): Promise<string>;
}

/** O que o host faz pela limpeza de branches e worktrees órfãs (#465). O relatório sai por `setOrphans`. */
export interface OrphanHooks {
  /** varre e publica, sem remover nada; nunca rejeita */
  scan(): Promise<void>;
  /** limpa um item, revalidado no host; resolve com o aviso para a pessoa */
  clean(id: string, acceptLoss?: { dirtyFiles: number; uniqueCommits: number }): Promise<string>;
  /** remove todas as seguras (revalidadas); resolve com o resumo */
  cleanSafe(): Promise<string>;
}

/** As mensagens do webview que o chat executa. */
export type ChatMessageIn = Extract<
  WebviewToHost,
  { type: 'chat.send' | 'chat.stop' | 'chat.clear' | 'ai.suggestAgents' | 'ai.suggestRules' | 'ai.suggestSkills' | 'harness.suggest.run' }
>;

/** Tratadas pela ponte do webview (dependem do VSCode): aqui não mudam o board. */
const viaBridge = () => false;
const bridgeOnly = {
  ready: viaBridge,
  'view.set': viaBridge,
  'prefs.set': viaBridge,
  'ui.showFilters': viaBridge,
  'ui.connectAI': viaBridge,
  'ui.fixProjectMcp': viaBridge,
  'ui.reloadWindow': viaBridge,
  'ui.openEditorMcp': viaBridge,
  'ui.openTerminal': viaBridge,
  'ui.openInBrowser': viaBridge,
  'ui.openIdeSettings': viaBridge,
  'ai.run': viaBridge,
  'ai.stop': viaBridge,
  'ai.heartbeat.run': viaBridge,
  'chat.send': viaBridge,
  'chat.stop': viaBridge,
  'chat.clear': viaBridge,
  'ai.suggestAgents': viaBridge,
  'ai.suggestRules': viaBridge,
  'ai.suggestSkills': viaBridge,
  'harness.suggest.run': viaBridge,
  'harness.suggest.clear': viaBridge,
  'ui.showChat': viaBridge,
  'requirements.check': viaBridge,
  // a limpeza das órfãs é ligada ao host nas partes seguintes (#489, #492): até lá, nada responde a elas
  'git.orphans.scan': viaBridge,
  'git.orphans.clean': viaBridge,
  'git.orphans.cleanSafe': viaBridge,
  'environment.check': viaBridge,
  'environment.seen': viaBridge,
  'environment.pinMcp': viaBridge,
  'environment.allowKimiMcp': viaBridge,
  'ai.autopilot.pause': viaBridge,
  'ai.autopilot.resume': viaBridge,
  'card.workspace.open': viaBridge,
  'harness.item.open': viaBridge,
  'harness.file.read': viaBridge,
  'harness.plugin.apply': viaBridge,
  'harness.refresh': viaBridge,
  'harness.file.write': viaBridge,
  'harness.item.create': viaBridge,
  'harness.item.write': viaBridge,
  'harness.project.profile': viaBridge,
  'harness.skill.file.create': viaBridge,
  'harness.skill.file.open': viaBridge,
  'harness.install.scan': viaBridge,
  'harness.import.pick': viaBridge,
  'harness.library.open': viaBridge,
  'attachment.pick': viaBridge,
  'attachment.reveal': viaBridge,
  'attachment.read': viaBridge,
  'attachment.write': viaBridge,
  'attachment.saveAs': viaBridge,
  // ler o log não muda o board: a `HostBridge` responde por `panelMetrics`, sem passar por `handle`
  'metrics.query': viaBridge,
  'card.usage.query': viaBridge,
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
  ...branchRenameHandlers,
  ...boardSettingsHandlers,
  ...boardBackupHandlers,
  ...modelHandlers,
  ...harnessHandlers,
};

/** Aplica mensagens do webview no banco. Não depende da API do VSCode. */
export class MessageRouter {
  private ctx: BoardContext;
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(message: string) => void>();
  private approveListeners: ((cardId: string) => void)[] = [];
  private aiRuns: string[] = [];
  private aiActivity: AiActivity[] = [];
  private heartbeatNextAt: number | null = null;
  private chat: ChatState = EMPTY_CHAT;
  private chatHandler: ((msg: ChatMessageIn) => void) | null = null;
  private suggestions: HarnessSuggestions | null = null;
  private autopilot: Autopilot = { active: false, note: null };
  private requirements: BoardRequirement[] = [];
  private requirementsCheckedAt = 0;
  private requirementsCheck: (() => Promise<void>) | null = null;
  private authExpired: AiTool | null = null;
  /** a pausa por limite de uso, espelho do que está gravado na `meta` (sobrevive a reabrir o editor) */
  private usageLimit: UsageLimitPause | null = null;
  /** o card da execução de teste depois que a pausa venceu: só em memória, para a fila nunca ficar presa num teste que não existe mais */
  private limitProbe: string | null = null;
  private openTerminalHook: ((command: string) => void) | null = null;
  private environment: EnvironmentReport | null = null;
  private environmentFirstRun = false;
  private environmentHooks: EnvironmentHooks | null = null;
  private orphans: OrphanReport = EMPTY_ORPHANS;
  private orphanHooks: OrphanHooks | null = null;
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
    this.usageLimit = parsePause(this.ctx.boards.getMeta(USAGE_LIMIT_META_KEY));
    dbHandle.scheduleSave();
  }

  get boardId(): string {
    return this.ctx.boardId;
  }

  /** Lê um valor da tabela meta do board (ex.: config do Git da IDE); undefined se não existir. */
  getMeta(key: string): string | undefined {
    return this.ctx.boards.getMeta(key);
  }

  /** Grava um valor na tabela meta do board, substituindo o existente. */
  setMeta(key: string, value: string): void {
    this.ctx.boards.setMeta(key, value);
  }

  onDidChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Avisa de uma falha que não veio de uma mensagem da interface (tarefa em segundo plano); a interface mostra como erro. */
  onDidError(fn: (message: string) => void): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  /** Uma tarefa em segundo plano falhou: além do log, a pessoa precisa ver, senão a tela fica esperando para sempre. */
  reportError(message: string): void {
    this.errorListeners.forEach((fn) => fn(message));
  }

  /** Avisa quando uma pessoa aprova um card (usado pelo merge automático). */
  onDidApprove(fn: (cardId: string) => void): void {
    this.approveListeners.push(fn);
  }

  /** Só o executor no host recebe as definições com credenciais; o snapshot público nunca as inclui. */
  libraryMcpDefinitions(): Record<string, unknown> {
    return this.ctx.library.mcpDefinitions();
  }

  snapshot(): BoardState {
    const s = this.ctx.boards.snapshot(this.ctx.boardId, this.ctx.opts.author);
    const { current, install } = this.ctx.harness;
    return {
      ...s,
      // os agentes do board são os arquivos marcados: derivados aqui, nunca gravados
      board: {
        ...s.board,
        execProfiles: agentProfiles(
          current.library
            ? current.library.artifacts.filter((a) => a.kind === 'agent' && !a.missing).map((a) => agentOfArtifact(a, s.board.aiTool))
            : current.agents,
          s.harnessSelection,
          s.board.runner.defaultAgent,
        ),
      },
      harness: current,
      boardServer: boardServerFootprint(),
      aiRuns: this.aiRuns,
      aiActivity: this.aiActivity,
      heartbeatNextAt: this.heartbeatNextAt,
      chat: this.chat,
      autopilot: this.autopilot,
      aiRunUnsupported: headlessUnsupported(s.board.aiTool, s.board.runner.permission),
      requirements: this.requirements,
      requirementsCheckedAt: this.requirementsCheckedAt,
      authExpired: this.authExpired,
      usageLimit: this.usageLimit ? { ...this.usageLimit, probe: this.limitProbe } : null,
      environment: this.environment,
      environmentFirstRun: this.environmentFirstRun,
      harnessInstall: install ? { source: install.source, skills: install.skills } : null,
      harnessSuggestions: this.suggestions,
      mainBranch: this.ctx.mainBranch(),
      orphans: this.orphans,
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

  /**
   * Reavalia se a história pode ser entregue (ver `settleDelivery`) e, se sim, grava a entrega e
   * avisa os webviews. Chamado pelo runner ao fim de uma execução, quando o pull request já estava
   * registrado antes do card chegar na última coluna da IA.
   */
  settleDelivery(storyId: string): boolean {
    const delivered = settleDelivery(this.ctx, storyId);
    if (delivered) this.changed();
    return delivered;
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

  /** Quem confere os requisitos quando a pessoa pede "Verificar de novo"; resolve ao terminar e rejeita se falhou. */
  onRequirementsCheck(fn: () => Promise<void>): void {
    this.requirementsCheck = fn;
  }

  recheckRequirements(): Promise<void> {
    return this.requirementsCheck?.() ?? Promise.resolve();
  }

  /** Quem abre um terminal do editor e roda o comando pedido (o login de uma CLI); a pessoa conclui o login. */
  onOpenTerminal(fn: (command: string) => void): void {
    this.openTerminalHook = fn;
  }

  openTerminal(command: string): void {
    this.openTerminalHook?.(command);
  }

  /**
   * A ferramenta de IA falhou por login vencido nesta execução (RF6), ou o probe confirmou que voltou;
   * null quando não há aviso reativo ativo. Devolve se mudou, para quem chama decidir se loga a transição
   * (o log não é responsabilidade do `MessageRouter`, como nas outras operações).
   */
  setAuthExpired(tool: AiTool | null): boolean {
    if (this.authExpired === tool) return false;
    this.authExpired = tool;
    this.notify();
    return true;
  }

  /**
   * Mais uma execução da ferramenta terminou por limite de uso: grava a pausa nova (ver `nextPause`) e a devolve. Como
   * em `setAuthExpired`, quem chama (o runner) registra no log.
   */
  recordUsageLimit(tool: AiTool, resetAt: number | null, now: number): UsageLimitPause {
    const pause = nextPause(this.usageLimit, tool, resetAt, now);
    this.usageLimit = pause;
    this.ctx.boards.setMeta(USAGE_LIMIT_META_KEY, JSON.stringify(pause));
    this.ctx.dbHandle.scheduleSave();
    this.notify();
    return pause;
  }

  /** Uma execução da ferramenta terminou bem: o limite renovou. Devolve se havia pausa dela para apagar. */
  clearUsageLimit(tool: AiTool): boolean {
    if (this.usageLimit?.tool !== tool) return false;
    this.usageLimit = null;
    // a chave vazia é lida como "sem pausa"; apagar a linha não traria nada a mais
    this.ctx.boards.setMeta(USAGE_LIMIT_META_KEY, '');
    this.ctx.dbHandle.scheduleSave();
    this.notify();
    return true;
  }

  /** O card da execução de teste em curso depois que a pausa venceu; null quando ela termina. */
  setLimitProbe(cardId: string | null): void {
    if (this.limitProbe === cardId) return;
    this.limitProbe = cardId;
    this.notify();
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

  checkEnvironment(): Promise<void> {
    return this.environmentHooks?.check() ?? Promise.resolve();
  }

  pinEnvironmentMcp(): Promise<void> {
    return this.environmentHooks?.pinMcp?.() ?? Promise.resolve();
  }

  allowKimiMcp(): void {
    this.environmentHooks?.allowKimiMcp?.();
  }

  /** A tela abriu sozinha uma vez: nas próximas aberturas, só pelo botão. */
  markEnvironmentSeen(): void {
    if (!this.environmentFirstRun) return;
    this.environmentFirstRun = false;
    this.environmentHooks?.seen();
    this.notify();
  }

  /** O nome da branch principal em uso (a fixada nas configurações ou a detectada); '' fora de um repositório. */
  mainBranchName(): string {
    return this.ctx.mainBranch()?.name ?? '';
  }

  /** Execuções de IA em curso, uma por card (informado pelo executor); `aiRuns` é derivado delas. */
  setAiRuns(runs: AiActivity[]): void {
    this.aiActivity = runs;
    this.aiRuns = runs.map((r) => r.cardId);
    this.ctx.aiRuns = this.aiRuns;
    this.notify();
  }

  /** Próxima rodada agendada do heartbeat (informado pelo host); só notifica quando o valor muda. */
  setHeartbeat(state: { nextRoundAt: number | null }): void {
    if (state.nextRoundAt === this.heartbeatNextAt) return;
    this.heartbeatNextAt = state.nextRoundAt;
    this.notify();
  }

  /**
   * O relatório das órfãs (informado pelo varredor do host); só notifica quando o conteúdo muda, como
   * `setHeartbeat`: o varredor publica a cada rodada e a tela não pode redesenhar por nada.
   */
  setOrphans(report: OrphanReport): void {
    if (JSON.stringify(report) === JSON.stringify(this.orphans)) return;
    this.orphans = report;
    this.notify();
  }

  /** Quem varre e limpa as órfãs (o `OrphanSweeper` do host). */
  onOrphans(hooks: OrphanHooks): void {
    this.orphanHooks = hooks;
  }

  scanOrphans(): Promise<void> {
    return this.orphanHooks?.scan() ?? Promise.resolve();
  }

  cleanOrphan(id: string, acceptLoss?: { dirtyFiles: number; uniqueCommits: number }): Promise<string> {
    return this.orphanHooks?.clean(id, acceptLoss) ?? Promise.resolve('A limpeza de órfãs não está disponível.');
  }

  cleanSafeOrphans(): Promise<string> {
    return this.orphanHooks?.cleanSafe() ?? Promise.resolve('A limpeza de órfãs não está disponível.');
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

  /** O resultado de "Indicar artefatos" (informado pela sessão de chat), ou null para descartar. */
  setSuggestions(suggestions: HarnessSuggestions | null): void {
    this.suggestions = suggestions;
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

  /** Agregação do log de utilização (contagem, duração, tokens, custo) — a única porta até ele a partir do MCP. */
  metrics(query: MetricsQuery): MetricsResult {
    return getMetrics(this.ctx.dbHandle.db, this.ctx.boardId, query);
  }

  /** Consulta do painel de métricas: só lê o log (sem sonda, sem registro, sem `notify` nem gravação do banco). */
  panelMetrics(query: MetricsPanelQuery): MetricsPanelResult {
    return getPanelMetrics(this.ctx.dbHandle.db, this.ctx.boardId, query);
  }

  /** O que o card gastou até agora, por fase (e, numa história, as sub-tarefas), lido do log das execuções. */
  cardUsage(cardId: string): CardUsage {
    const s = this.ctx.boards.snapshot(this.ctx.boardId, this.ctx.opts.author);
    const card = s.cards.find((c) => c.id === cardId);
    if (!card) throw new Error('Card não encontrado.');
    const phases = columnsOf(s, card.workflowId).map((c) => c.name);
    // o que foi gasto não some: as sub-tarefas na lixeira também contam
    const subtasks = s.cards.filter((c) => c.parentId === card.id).map((c) => c.number);
    return cardUsage(this.ctx.dbHandle.db, this.ctx.boardId, card.number, phases, subtasks);
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

  /**
   * O "Reler pastas" da tela: relê o disco e espera também a lista de plugins da CLI, para o `done` da mensagem
   * só sair quando tudo o que a tela vai mostrar já chegou.
   */
  async refreshHarnessAndPlugins(): Promise<void> {
    this.refreshHarness();
    await this.ctx.harness.refreshPlugins();
  }

  /** Liga a CLI do Claude Code, que diz quais plugins estão instalados e os desinstala, desativa e ativa. */
  setClaudeCli(cli: ClaudeCli | null): void {
    this.ctx.harness.setClaudeCli(cli, () => this.changed());
  }

  /** Desinstala, desativa ou ativa plugins e devolve o aviso para a pessoa. */
  async applyPlugins(tool: AiTool, action: PluginAction, ids: string[]): Promise<string> {
    const notice = await this.ctx.harness.applyPlugins(tool, action, ids);
    this.changed();
    return notice;
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

  /** Conteúdo de um arquivo do harness para o editor do board, e se ele pode ser alterado. */
  readHarnessFile(file: string): { content: string; readonly: boolean } {
    return this.ctx.harness.readFile(file);
  }

  /** Grava um arquivo do harness editado no board e relê a varredura. */
  writeHarnessFile(file: string, content: string): void {
    this.ctx.harness.writeFile(file, content);
    this.changed();
  }

  /** Cria um item do harness e devolve o caminho do arquivo, para abrir no editor. */
  createHarnessItem(tool: AiTool, source: number, name: string, description: string): string {
    const file = this.ctx.harness.createItem(tool, source, name, description);
    this.changed();
    return file;
  }

  /** Cria um item do harness com o conteúdo pronto e devolve o caminho do arquivo, para abrir no editor. */
  writeHarnessItem(tool: AiTool, source: number, name: string, content: string, files?: string[], append?: boolean): string {
    const file = this.ctx.harness.writeItem(tool, source, name, content, files, append);
    this.changed();
    return file;
  }

  /** O perfil do projeto aberto, para os assistentes de regras e de skills. */
  projectProfile(): ProjectProfile {
    return readProjectProfile(this.ctx.opts.workspaceDir ?? '');
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
