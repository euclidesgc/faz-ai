import { limitChoiceKey, type LimitChoice } from '../../shared/limitChoice';
import { builtinPolicyCatalog, simulatePolicyScenario, type PolicyLibrary, type PolicyScenario } from '../../shared/policyManagement';
import type { PolicyAssistInput, PolicyAssistResult } from '../../shared/policyAssistant';
import type { AgentAssistInput, AgentAssistResult } from '../../shared/agentAssistance';
import type { ArtifactAssistInput, ArtifactAssistResult } from '../../shared/artifactAssistant';
import { scanLibraryFolder } from '../libraryImport';
import { agentOfArtifact, type ArtifactKind } from '../../shared/artifacts';
import type { ImportSource } from '../../shared/artifactImport';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolExporter } from '../toolExport';
import type { ExportPlan, ExportResult, ExportTarget } from '../../shared/toolExport';
import type { BoardRequirement } from '../../shared/requirements';
import type { EnvironmentReport } from '../../shared/environment';
import { EMPTY_ORPHANS, type OrphanReport } from '../../shared/orphans';
import { exportGeneration, type DbHandle } from '../db/database';
import { exportBoard, exportFileName, summarize, type BoardExportFile, type ImportResult } from '../db/boardExport';
import { newId } from '../db/ids';
import type { ImportSummary } from '../../shared/backup';
import type { AiActivity, Attachment, Autopilot, BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import type { AiTool } from '../../shared/harness';
import {
  MODEL_LIMIT_META_KEY,
  modelLimitOf,
  nextModelLimit,
  nextPause,
  parseModelLimits,
  parsePauses,
  USAGE_LIMIT_META_KEY,
  type ModelLimit,
  type UsageLimitPause,
  type UsageLimitState,
} from '../../shared/usageLimit';
import type { ProjectProfile } from '../../shared/projectProfile';
import { readProjectProfile } from '../projectProfile';
import { EMPTY_CHAT, type ChatState } from '../../shared/chat';
import { agentProfiles } from '../../shared/execution';
import { columnsOf } from '../../shared/selectors';
import type { AttachmentStore } from '../attachments';
import { runUnsupported } from '../headless';
import { catalogTool, isAcpProfile, type AiProfile } from '../../shared/aiProfiles';
import type { ConnectInput, ConnectState, ConnectSummary } from '../../shared/connect';
import {
  parseUninstall,
  uninstallPrompt,
  type ContextAdvice,
  type ContextLocation,
  type ContextScopeReport,
} from '../../shared/contextScope';
import type { ToolMode } from '../../shared/aiTools';
import { AiProfileRepo } from '../repositories/aiProfileRepo';

/** As conexões concluídas por perfil (o resumo do Conectar), na tabela `meta`: fora da exportação do board. */
const CONNECTIONS_META_KEY = 'ai_connections';
/** O último teste do contexto do card de cada perfil, também na `meta`: depende do projeto e da máquina. */
const CONTEXT_SCOPES_META_KEY = 'ai_context_scopes';
/** Os locais que a pessoa acrescentou ao teste do contexto, por perfil. */
const CONTEXT_EXTRA_META_KEY = 'ai_context_extra';
/** Os locais que a pessoa manteve ("Manter assim"), por perfil. */
const CONTEXT_KEPT_META_KEY = 'ai_context_kept';
import { boardServerFootprint } from '../mcp/footprint';
import type { RunResolver } from '../log/eventLog';
import { getMetrics, getPanelMetrics, type MetricsQuery, type MetricsResult } from '../log/metrics';
import { cardUsage } from '../log/cardUsage';
import { storyCommits } from '../git';
import { storyOf } from '../../shared/story';
import type { StoryCommit } from '../../shared/commits';
import type { CardUsage } from '../../shared/cardUsage';
import type { MetricsPanelQuery, MetricsPanelResult } from '../../shared/metrics';
import { NO_TRACE, type Trace } from '../log/trace';
import { BoardContext, type Actor, type Handler, type HandlerMap, type MessageType, type RouterOptions } from './handlers/context';
import { boardBackupHandlers } from './handlers/boardBackup';
import { boardSettingsHandlers } from './handlers/boardSettings';
import { addAttachment, cardContentHandlers } from './handlers/cardContent';
import { questionHandlers } from './handlers/questions';
import { cardHandlers, createCard } from './handlers/cards';
import { harnessHandlers } from './handlers/harness';
import { initModels, modelHandlers, proposeLegacyFallbacks, retireModel } from './handlers/models';
import { legacyFallbackNotes, parseLegacyFallbacks } from '../../shared/legacyFallback';
import { aiWorkDirs, workspaceHandlers } from './handlers/workspace';
import { branchRenameHandlers } from './handlers/branchRename';
import { aiProfileHandlers, type AiProfileRuntime } from './handlers/aiProfiles';
import { settleDelivery } from '../delivery';
import { WorkRepo } from '../repositories/workRepo';
import { credentialsFor } from '../credentials';
import { RunMcpSessions, type RunMcpAccess } from '../mcp/runSessions';
import type { AgentConnectService } from '../agentConnect/service';

export type { RouterOptions };

/** A partir de quanto tempo (ms) uma operação do host entra no log com a duração: o que passa disso trava a tela. */
export const SLOW_MS = 200;

/** De onde vem a mensagem: quem assina (`author`) e se é a pessoa (padrão) ou a IA. */
export interface Origin {
  author?: string;
  source?: 'human' | 'ai';
  /** Somente o host liga a origem à apresentação da conexão MCP. */
  runToken?: string;
  externalMcp?: true;
}

/** O que o host faz pelo Diagnóstico do ambiente. */
export interface EnvironmentHooks {
  /** roda o Diagnóstico; resolve quando o relatório já está no board e rejeita se a conferência falhou */
  check(): Promise<void>;
  seen(): void;
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
  { type: 'chat.send' | 'chat.stop' | 'chat.clear' | 'ai.suggestAgents' | 'ai.suggestRules' | 'ai.suggestSkills' }
>;

/** Tratadas pela ponte do webview (dependem do VSCode): aqui não mudam o board. */
const viaBridge = () => false;
const bridgeOnly = {
  ready: viaBridge,
  'ui.trace': viaBridge,
  'view.set': viaBridge,
  'prefs.set': viaBridge,
  'ui.scope.set': viaBridge,
  'ui.showFilters': viaBridge,
  'ui.connectAI': viaBridge,
  'ui.fixProjectMcp': viaBridge,
  'ui.reloadWindow': viaBridge,
  'ui.openEditorMcp': viaBridge,
  'ui.openTerminal': viaBridge,
  'ui.openInBrowser': viaBridge,
  'ai.run': viaBridge,
  'ai.stop': viaBridge,
  'ai.heartbeat.run': viaBridge,
  'chat.send': viaBridge,
  'chat.stop': viaBridge,
  'chat.clear': viaBridge,
  'ai.suggestAgents': viaBridge,
  'ai.suggestRules': viaBridge,
  'ai.suggestSkills': viaBridge,
  'ui.showChat': viaBridge,
  'requirements.check': viaBridge,
  // a limpeza das órfãs é ligada ao host nas partes seguintes (#489, #492): até lá, nada responde a elas
  'git.orphans.scan': viaBridge,
  'git.orphans.clean': viaBridge,
  'git.orphans.cleanSafe': viaBridge,
  'environment.check': viaBridge,
  'environment.seen': viaBridge,
  'ai.autopilot.pause': viaBridge,
  'ai.autopilot.resume': viaBridge,
  'card.workspace.open': viaBridge,
  'harness.refresh': viaBridge,
  'harness.project.profile': viaBridge,
  'harness.export.plan': viaBridge,
  'harness.export.apply': viaBridge,
  'harness.agent.assist': viaBridge,
  'harness.artifact.assist': viaBridge,
  'harness.import.pick': viaBridge,
  'harness.import.scan': viaBridge,
  'harness.artifact.read': viaBridge,
  'harness.library.open': viaBridge,
  'harness.library.pickArtifacts': viaBridge,
  'harness.library.pickDirectory': viaBridge,
  'harness.library.folders': viaBridge,
  'harness.library.read': viaBridge,
  'attachment.pick': viaBridge,
  'attachment.reveal': viaBridge,
  'attachment.read': viaBridge,
  'attachment.write': viaBridge,
  'attachment.saveAs': viaBridge,
  // ler o log não muda o board: a `HostBridge` responde por `panelMetrics`, sem passar por `handle`
  'metrics.query': viaBridge,
  'card.usage.query': viaBridge,
  'card.commits.query': viaBridge,
  'executionPolicy.read': viaBridge,
  'executionPolicy.simulate': viaBridge,
  'executionPolicy.assist': viaBridge,
  'backup.export': viaBridge,
  'backup.import.pick': viaBridge,
  'backup.import.cancel': viaBridge,
  'settings.aiProfiles.probe': viaBridge,
  'settings.aiProfiles.test': viaBridge,
  'settings.aiProfiles.contextScope': viaBridge,
  'settings.aiProfiles.contextReveal': viaBridge,
  'settings.aiProfiles.contextAsk': viaBridge,
  // a chave colada vai direto da HostBridge ao Conectar do host: nunca passa por `handle` nem pelo log de eventos
  'settings.aiProfiles.connect': viaBridge,
  // as sondas demoram (a CLI do Claude roda quatro vezes na fixture): a HostBridge espera e publica o resultado
  'settings.aiProfiles.verify': viaBridge,
  // Conectar agentes: a conta, o login e a sessão de teste são do serviço do host e da HostBridge, e não mudam o
  // board (o que muda o board, como ligar o perfil ou ler os modelos, segue pelos `settings.*`)
  'agentConnect.registry': viaBridge,
  'agentConnect.sync': viaBridge,
  'agentConnect.check': viaBridge,
  'agentConnect.login': viaBridge,
  'agentConnect.logout': viaBridge,
  'agentConnect.test.open': viaBridge,
  'agentConnect.test.reopen': viaBridge,
  'agentConnect.test.prompt': viaBridge,
  'agentConnect.test.permission': viaBridge,
  'agentConnect.test.setConfig': viaBridge,
  'agentConnect.test.setMode': viaBridge,
  'agentConnect.test.cancel': viaBridge,
  'agentConnect.test.close': viaBridge,
  'agentConnect.openLog': viaBridge,
} satisfies Partial<HandlerMap>;

/** Um handler por tipo de mensagem, agrupados por domínio em ./handlers. */
const HANDLERS: HandlerMap = {
  ...bridgeOnly,
  ...cardHandlers,
  ...cardContentHandlers,
  ...questionHandlers,
  ...workspaceHandlers,
  ...branchRenameHandlers,
  ...boardSettingsHandlers,
  ...boardBackupHandlers,
  ...modelHandlers,
  ...aiProfileHandlers,
  ...harnessHandlers,
};

/** Aplica mensagens do webview no banco. Não depende da API do VSCode. */
export class MessageRouter {
  readonly executions: RunMcpSessions;
  private ctx: BoardContext;
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(message: string) => void>();
  private approveListeners: ((cardId: string) => void)[] = [];
  private cancelListeners: ((cardIds: string[]) => void)[] = [];
  /** o que o executor informou (`setAiRuns`) e o que o orquestrador conduz entre as rodadas (`setOrchestrations`) */
  private runnerRuns: AiActivity[] = [];
  private orchestrations: AiActivity[] = [];
  private aiRuns: string[] = [];
  private aiActivity: AiActivity[] = [];
  private heartbeatNextAt: number | null = null;
  private chat: ChatState = EMPTY_CHAT;
  private chatHandler: ((msg: ChatMessageIn) => void) | null = null;
  private autopilot: Autopilot = { active: false, note: null };
  private requirements: BoardRequirement[] = [];
  private requirementsCheckedAt = 0;
  private requirementsCheck: (() => Promise<void>) | null = null;
  private authExpired: AiTool[] = [];
  private usageLimit: UsageLimitState[] = [];
  /** Marcas de modelo esgotado (#1100): só o host lê; ficam na `meta`, fora do `BoardState`. */
  private modelLimits: ModelLimit[] = [];
  private openTerminalHook: ((command: string) => void) | null = null;
  private environment: EnvironmentReport | null = null;
  private environmentFirstRun = false;
  private environmentHooks: EnvironmentHooks | null = null;
  private orphans: OrphanReport = EMPTY_ORPHANS;
  private orphanHooks: OrphanHooks | null = null;
  private aiProfileRuntime: AiProfileRuntime | null = null;
  /**
   * O último snapshot montado, válido até a próxima mudança (#1066). Cada mudança do board avisa uma dezena
   * de ouvintes, e cada um pedia o snapshot de novo: num board grande são ~150 ms de consultas por pedido,
   * tudo síncrono no host. Com o cache, a montagem acontece uma vez por mudança. Quem recebe o snapshot não
   * o altera (é compartilhado entre os ouvintes).
   */
  private cachedSnapshot: BoardState | null = null;
  /** a marca de gravações quando o cache foi montado (`changeKey`): uma gravação por qualquer repositório o invalida */
  private cachedChanges = '';
  readonly store: AttachmentStore;

  constructor(dbHandle: DbHandle, opts: RouterOptions) {
    this.ctx = new BoardContext(dbHandle, opts);
    this.executions = new RunMcpSessions({
      repo: () => this.work,
      state: () => this.snapshot(),
      definitions: () => this.libraryMcpDefinitions(),
      save: () => dbHandle.scheduleSave(),
    });
    this.store = this.ctx.store;
    this.usageLimit = parsePauses(this.ctx.boards.getMeta(USAGE_LIMIT_META_KEY)).map((p) => ({ ...p, probe: null }));
    this.modelLimits = parseModelLimits(this.ctx.boards.getMeta(MODEL_LIMIT_META_KEY));
    this.ctx.harness.load();
    initModels(this.ctx);
    // os agentes de fábrica usam as regras de modelo, que initModels acabou de criar
    this.ctx.harness.bootstrap();
    proposeLegacyFallbacks(this.ctx);
    dbHandle.scheduleSave();
  }

  get boardId(): string {
    return this.ctx.boardId;
  }

  /** O rastreio do board, compartilhado pelas interfaces e pelo servidor MCP; sem um nas opções, não grava. */
  get trace(): Trace {
    return this.ctx.opts.trace ?? NO_TRACE;
  }
  private profileEnabledListeners: ((profileId: string) => void)[] = [];
  /** Avisa quando a pessoa liga um perfil: o host verifica as capacidades do perfil ACP recém-ligado. */
  onProfileEnabled(fn: (profileId: string) => void): void {
    this.profileEnabledListeners.push(fn);
  }
  setAiProfileRuntime(runtime: AiProfileRuntime): void {
    this.aiProfileRuntime = runtime;
  }
  private acpModelsReader: ((profile: AiProfile) => Promise<void>) | null = null;
  /** Quem abre a sessão do agente ACP e guarda os modelos que ele anuncia (`rememberModels`), para o "Detectar" juntar ao catálogo. */
  onAcpModels(fn: (profile: AiProfile) => Promise<void>): void {
    this.acpModelsReader = fn;
  }
  /** Lê os modelos do agente quando `tool` é um perfil ACP; nos outros perfis não faz nada (a lista já vem da CLI ou é embutida). */
  private toolModelsReader: ((profile: AiProfile) => Promise<void>) | null = null;
  /** Quem lê de novo a lista de modelos de uma CLI pronta (o host, que tem o PATH e a rede). */
  onReadToolModels(fn: (profile: AiProfile) => Promise<void>): void {
    this.toolModelsReader = fn;
  }
  /** O "Detectar modelos" de uma CLI pronta: a lista da documentação ou do comando dela, antes de juntar ao catálogo. */
  async readToolModels(tool: string): Promise<void> {
    const profile = this.snapshot().board.aiProfiles.find((p) => p.id === tool);
    if (!profile || isAcpProfile(profile) || !this.toolModelsReader) return;
    await this.toolModelsReader(profile);
  }
  async readAcpModels(tool: string): Promise<void> {
    const profile = this.snapshot().board.aiProfiles.find((p) => p.id === tool);
    if (!profile || !isAcpProfile(profile)) return;
    if (!this.acpModelsReader) throw new Error('Leitura de modelos do agente ACP indisponível neste host.');
    await this.acpModelsReader(profile);
  }
  private agentConnectService: AgentConnectService | null = null;
  /** O serviço da tela de Conectar agentes (registro, conta, login): é do host, que tem o PATH e o cofre. */
  setAgentConnect(service: AgentConnectService): void {
    this.agentConnectService = service;
  }
  get agentConnect(): AgentConnectService | null {
    return this.agentConnectService;
  }
  private connector: ((id: string, input: ConnectInput) => Promise<unknown>) | null = null;
  private connections: Record<string, ConnectState> | undefined;
  /** Quem conduz o Conectar de um perfil (o `Connector` do host). */
  onConnect(fn: (id: string, input: ConnectInput) => Promise<unknown>): void {
    this.connector = fn;
  }
  /** O Conectar pela tela: o `done` sai quando o fluxo para (conectada, à espera da pessoa ou com o erro no passo). */
  async connectProfile(id: string, input: ConnectInput): Promise<void> {
    if (!this.connector) throw new Error('O Conectar não está disponível neste host.');
    await this.connector(id, input);
  }
  private verifier: ((id: string) => Promise<string>) | null = null;
  /** Quem verifica as capacidades de um perfil (o verificador do host, o mesmo que o Conectar usa). */
  onVerify(fn: (id: string) => Promise<string>): void {
    this.verifier = fn;
  }
  /** A verificação pedida pela tela, para o perfil sem Conectar; devolve a frase do resultado. */
  async verifyProfile(id: string): Promise<string> {
    if (!this.verifier) throw new Error('A verificação de capacidades não está disponível neste host.');
    return this.verifier(id);
  }
  /** O estado do Conectar de cada perfil, publicado a cada passo; nunca carrega a chave. */
  setConnections(states: Record<string, ConnectState>): void {
    if (JSON.stringify(states) === JSON.stringify(this.connections)) return;
    this.connections = states;
    this.notify();
  }
  /** A ciência do regime compatível de um perfil, no Conectar: só o host chama, depois do clique da pessoa. */
  recordCompatibilityReview(profileId: string): number {
    const revision = this.ctx.boards.recordCompatibilityReview(this.boardId, profileId);
    this.changed();
    return revision;
  }
  /**
   * Troca o modo do perfil pronto: só o Conectar chama, depois de o login no modo novo ter dado certo (o clique
   * da pessoa no cartão daquele modo). Não passa por `handle`, como a ciência: a IA e o MCP não têm caminho até aqui.
   */
  setProfileMode(profileId: string, mode: ToolMode): void {
    new AiProfileRepo(this.ctx.dbHandle.db).setMode(this.boardId, profileId, mode, 'person');
    this.changed();
  }
  /** Tira a ciência do perfil: o Conectar provou o exclusivo. A revogação pela pessoa vem por `settings.aiProfiles.review`. */
  revokeCompatibilityReview(profileId: string): void {
    if (this.ctx.boards.revokeCompatibilityReview(this.boardId, profileId)) this.changed();
  }
  /** As conexões concluídas, gravadas no banco do board (sem segredo: versão, login, regime, modelos e data). */
  savedConnections(): Record<string, ConnectSummary> {
    try {
      const raw: unknown = JSON.parse(this.ctx.boards.getMeta(CONNECTIONS_META_KEY) ?? '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, ConnectSummary>) : {};
    } catch {
      return {};
    }
  }
  saveConnection(profileId: string, summary: ConnectSummary): void {
    this.ctx.boards.setMeta(CONNECTIONS_META_KEY, JSON.stringify({ ...this.savedConnections(), [profileId]: summary }));
    this.ctx.dbHandle.scheduleSave();
  }
  probeAiProfiles() {
    if (!this.aiProfileRuntime) throw new Error('Situação dos perfis indisponível neste host.');
    return this.aiProfileRuntime.probe().finally(() => this.invalidateSnapshot());
  }
  testAiProfile(id: string, model?: string) {
    if (!this.aiProfileRuntime) throw new Error('Teste de perfil indisponível neste host.');
    return this.aiProfileRuntime.test(id, model).finally(() => this.invalidateSnapshot());
  }
  private contextRunning = new Set<string>();
  // lidos da `meta` uma vez e guardados: o snapshot sai a cada mudança do board e não pode consultar o banco a mais
  private contextScopesCache: Record<string, ContextScopeReport> | null = null;
  private contextExtraCache: Record<string, ContextLocation[]> | null = null;
  private contextKeptCache: Record<string, string[]> | null = null;
  /** as respostas do agente sobre como desinstalar um plugin: só desta sessão, não vão para o banco */
  private contextAdvice: Record<string, Record<string, ContextAdvice>> = {};
  contextKept(): Record<string, string[]> {
    return (this.contextKeptCache ??= this.metaRecord<string[]>(CONTEXT_KEPT_META_KEY));
  }
  /**
   * Pergunta ao agente o comando que desinstala um plugin dele. A resposta vai para o estado, marcada na tela como
   * sugestão do agente: o board nunca roda o comando.
   */
  async askContextUninstall(id: string, plugin: string): Promise<void> {
    if (!this.aiProfileRuntime) throw new Error('A pergunta ao agente não está disponível neste host.');
    if (!/^[\w.@-]{1,80}$/.test(plugin)) throw new Error('Nome de plugin inválido.');
    const set = (advice: ContextAdvice) => {
      this.contextAdvice = { ...this.contextAdvice, [id]: { ...this.contextAdvice[id], [plugin]: advice } };
      this.notify();
    };
    set({ state: 'running' });
    try {
      set({ state: 'done', command: parseUninstall(await this.aiProfileRuntime.contextAsk(id, uninstallPrompt(plugin))), at: Date.now() });
    } catch (e) {
      set({ state: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  }
  /**
   * A pasta de um caminho que o último teste do contexto mostrou (um local ou um arquivo que vaza), para abrir no
   * sistema. Outro caminho é recusado: a tela não abre pastas livres.
   */
  contextFolder(id: string, shown: string): string {
    const report = this.savedContextScopes()[id];
    const known = report?.locations.some((l) => l.path === shown || (l.verdict.state === 'leaks' && l.verdict.files.includes(shown)));
    if (!known) throw new Error(`O caminho ${shown} não está no último teste do contexto.`);
    const home = this.ctx.opts.homeDir || os.homedir();
    const root = this.ctx.opts.workspaceDir ?? process.cwd();
    const abs = shown.startsWith('~')
      ? path.join(home, shown.replace(/^~\/?/, ''))
      : path.isAbsolute(shown)
        ? shown
        : path.resolve(root, shown);
    // um local com curinga abre a pasta antes do primeiro curinga; um arquivo, a pasta dele
    const parts = abs.split(path.sep);
    const firstGlob = parts.findIndex((p) => /[*?]/.test(p));
    let dir = firstGlob >= 0 ? parts.slice(0, firstGlob).join(path.sep) || path.sep : abs;
    while (dir && !fs.existsSync(dir)) dir = path.dirname(dir);
    return fs.existsSync(dir) && fs.statSync(dir).isFile() ? path.dirname(dir) : dir;
  }
  /** Os testes do contexto gravados (um por perfil); a leitura tolera o valor ausente ou estragado. */
  savedContextScopes(): Record<string, ContextScopeReport> {
    return (this.contextScopesCache ??= this.metaRecord<ContextScopeReport>(CONTEXT_SCOPES_META_KEY));
  }
  contextExtra(): Record<string, ContextLocation[]> {
    return (this.contextExtraCache ??= this.metaRecord<ContextLocation[]>(CONTEXT_EXTRA_META_KEY));
  }
  private metaRecord<T>(key: string): Record<string, T> {
    try {
      const raw: unknown = JSON.parse(this.ctx.boards.getMeta(key) ?? '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, T>) : {};
    } catch {
      return {};
    }
  }
  /**
   * O teste do contexto do card de um perfil: um por vez para cada perfil; o resultado substitui o anterior. A tela
   * acompanha pelo `contextScopeRunning` do estado.
   */
  async runContextScope(id: string): Promise<ContextScopeReport> {
    if (!this.aiProfileRuntime) throw new Error('O teste do contexto não está disponível neste host.');
    if (this.contextRunning.has(id)) throw new Error('O teste do contexto deste agente já está em curso.');
    this.contextRunning.add(id);
    this.notify();
    try {
      const report = await this.aiProfileRuntime.contextScope(id);
      this.contextScopesCache = { ...this.savedContextScopes(), [id]: report };
      this.ctx.boards.setMeta(CONTEXT_SCOPES_META_KEY, JSON.stringify(this.contextScopesCache));
      this.ctx.dbHandle.scheduleSave();
      return report;
    } finally {
      this.contextRunning.delete(id);
      this.notify();
    }
  }
  executionPolicyLibrary(): PolicyLibrary {
    const snapshot = this.ctx.executionPolicies.snapshot(this.boardId);
    const catalog = builtinPolicyCatalog(this.snapshot());
    const legacy = legacyFallbackNotes(
      parseLegacyFallbacks(this.ctx.boards.modelRulesJson(this.boardId)),
      snapshot.records,
      catalog.models,
    );
    return { snapshot, ...catalog, ...(legacy.length ? { legacy } : {}) };
  }
  executionPolicyHistory(id: string, before = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(before) || before < 1 || typeof id !== 'string' || !id || id.length > 240)
      throw new Error('Página de histórico inválida.');
    const records = this.ctx.executionPolicies.history(this.boardId, id, { before, limit: 51 });
    return { history: records.slice(0, 50), nextBefore: records.length > 50 ? records[49]!.revision : null };
  }
  simulateExecutionPolicy(scenario: PolicyScenario) {
    return simulatePolicyScenario(this.snapshot(), this.ctx.executionPolicies.snapshot(this.boardId), scenario);
  }
  get work(): WorkRepo {
    return new WorkRepo(this.ctx.dbHandle.db, this.ctx.boardId);
  }
  /** A sessão MCP devolve uma capacidade restrita pelo proxy; a interface humana não a recebe. */
  mcpAccess(): RunMcpAccess | null {
    return null;
  }

  /** Lê um valor da tabela meta do board (ex.: config do Git da IDE); undefined se não existir. */
  getMeta(key: string): string | undefined {
    return this.ctx.boards.getMeta(key);
  }

  /** Grava um valor na tabela meta do board, substituindo o existente. */
  setMeta(key: string, value: string): void {
    this.invalidateSnapshot();
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
    this.trace.write({ src: 'router', ev: 'error', err: message });
    this.errorListeners.forEach((fn) => fn(message));
  }

  /** Avisa quando uma pessoa aprova um card (usado pelo merge automático). */
  onDidApprove(fn: (cardId: string) => void): void {
    this.approveListeners.push(fn);
  }

  /** Só o executor no host recebe as definições com credenciais; o snapshot público nunca as inclui. */
  readLibraryArtifact(id: string) {
    return this.ctx.library.readArtifact(id);
  }

  libraryMcpDefinitions(): Record<string, unknown> {
    return this.ctx.library.mcpDefinitions();
  }
  redactCredentials(text: string): string {
    return credentialsFor(this.ctx.dbHandle.db).redact(text);
  }

  snapshot(): BoardState {
    // a marca de gravações da conexão: quem grava por um repositório, sem passar por aqui, também a move
    const changes = this.changeKey();
    if (this.cachedSnapshot && this.cachedChanges === changes) return this.cachedSnapshot;
    const startedAt = performance.now();
    const built = this.buildSnapshot();
    const elapsed = performance.now() - startedAt;
    if (elapsed >= SLOW_MS) this.ctx.opts.log?.(`[tempo] montar o estado do board levou ${Math.round(elapsed)} ms`);
    this.cachedSnapshot = built;
    this.cachedChanges = changes;
    return built;
  }

  /**
   * O `total_changes()` do SQLite (linhas gravadas pela conexão) junto com quantas vezes ela foi exportada: o
   * save e o backup reabrem a conexão e zeram o contador, e sem a geração um cache montado com N gravações
   * valeria de novo quando N gravações novas se seguissem a um save.
   */
  private changeKey(): string {
    const db = this.ctx.dbHandle.db;
    const stmt = db.prepare('SELECT total_changes()');
    try {
      return `${exportGeneration(db)}:${stmt.step() ? Number(stmt.get()[0]) : -1}`;
    } finally {
      stmt.free();
    }
  }

  /** Esquece o snapshot em cache: o próximo pedido monta um novo. Toda mudança (`notify`) chama; quem grava fora dela também. */
  invalidateSnapshot(): void {
    this.cachedSnapshot = null;
  }

  private buildSnapshot(): BoardState {
    const s = this.ctx.boards.snapshot(this.ctx.boardId, this.ctx.opts.author);
    const { current } = this.ctx.harness;
    return {
      ...s,
      // os agentes do board são as cópias guardadas no banco (escopo `board`): derivados aqui, nunca gravados. O
      // desligado fica na biblioteca, mas nenhum card, fase ou execução o escolhe
      board: {
        ...s.board,
        execProfiles: agentProfiles(
          current.library
            ? current.library.artifacts
                .filter((a) => a.kind === 'agent' && !a.missing && a.usage !== 'off')
                .map((a) => agentOfArtifact(a, s.board.aiTool))
            : current.agents,
          s.harnessSelection,
          s.board.runner.defaultAgent,
        ).map((p) => (current.library && p.scope !== 'builtin' ? { ...p, scope: 'board' as const } : p)),
      },
      harness: current,
      boardServer: boardServerFootprint(),
      aiRuns: this.aiRuns,
      aiActivity: this.aiActivity,
      heartbeatNextAt: this.heartbeatNextAt,
      chat: this.chat,
      autopilot: this.autopilot,
      ...runUnsupported(s.board),
      requirements: this.requirements,
      requirementsCheckedAt: this.requirementsCheckedAt,
      authExpired: this.authExpired,
      usageLimit: this.usageLimit,
      environment: this.environment,
      ...(this.connections ? { connections: this.connections } : {}),
      contextScopes: this.savedContextScopes(),
      contextExtra: this.contextExtra(),
      contextScopeRunning: [...this.contextRunning],
      contextKept: this.contextKept(),
      contextAdvice: this.contextAdvice,
      environmentFirstRun: this.environmentFirstRun,
      artifactImport: this.ctx.importer.current,
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
    if (
      (msg.type === 'settings.executionPolicy.save' || msg.type === 'settings.executionPolicy.remove') &&
      (ctx.source === 'ai' || ctx.externalMcp || ctx.runToken !== undefined)
    )
      throw new Error('Políticas executáveis exigem revisão humana.');
    if (msg.type.startsWith('settings.aiProfiles.') && (ctx.source === 'ai' || ctx.externalMcp || ctx.runToken !== undefined))
      throw new Error('Perfis executáveis exigem revisão humana.');
    // o handler grava os locais da pessoa direto na `meta`: a cópia guardada aqui relê no próximo snapshot
    if (msg.type === 'settings.aiProfiles.contextLocation') this.contextExtraCache = null;
    if (msg.type === 'settings.aiProfiles.contextKeep') this.contextKeptCache = null;
    const handler = HANDLERS[msg.type] as Handler<MessageType>;
    const actor = this.actorOf(ctx);
    // o aviso de perfil ligado é da transição desligado → ligado; religar o que já está ligado não avisa
    const turnedOn =
      msg.type === 'settings.aiProfiles.setEnabled' &&
      msg.enabled &&
      this.profileEnabledListeners.length > 0 &&
      !this.snapshot().board.aiProfiles.find((p) => p.id === msg.id)?.enabled;
    // o log: sonda antes, registro depois — só quando o handler diz que o board mudou (o que não aconteceu não entra)
    const probe = this.ctx.log.probe(msg);
    const startedAt = performance.now();
    // um handler que lança depois de gravar em parte deixaria o cache desatualizado: esquece antes
    this.invalidateSnapshot();
    let changed: boolean;
    try {
      changed = handler(msg, this.ctx, actor);
    } catch (e) {
      this.trace.write({
        src: 'router',
        ev: 'apply',
        type: msg.type,
        ok: false,
        err: e instanceof Error ? e.message : String(e),
        data: { by: actor.author, ai: actor.byAi },
      });
      throw e;
    }
    if (changed) this.ctx.log.record(msg, actor, probe);
    const result = changed ? this.changed() : this.snapshot();
    const elapsed = performance.now() - startedAt;
    // `changed: false` é a mensagem que não mudou nada: num clique da pessoa, quase sempre um defeito
    this.trace.write({
      src: 'router',
      ev: 'apply',
      type: msg.type,
      ms: Math.round(elapsed),
      ok: true,
      data: { changed, by: actor.author, ai: actor.byAi },
    });
    if (elapsed >= SLOW_MS) this.ctx.opts.log?.(`[tempo] ${msg.type} levou ${Math.round(elapsed)} ms (com os ouvintes da mudança)`);
    if (changed && msg.type === 'card.move') {
      const column = result.columns.find((c) => c.id === msg.columnId);
      if (column?.category === 'cancelled') this.cancelListeners.forEach((fn) => fn([msg.cardId]));
    }
    if (changed && turnedOn) this.profileEnabledListeners.forEach((fn) => fn(msg.id));
    return result;
  }

  /** Como `card.create`, mas devolve o id do card criado. */
  createCard(input: { typeId: string; columnId: string; parentId: string | null; title: string }, ctx: Origin = {}): string {
    const msg: WebviewToHost = { type: 'card.create', ...input };
    const actor = this.actorOf(ctx);
    const probe = this.ctx.log.probe(msg);
    this.invalidateSnapshot();
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
    if (ctx.runToken !== undefined) {
      const binding = this.executions.assert(ctx.runToken);
      return { author: ctx.author ?? 'IA', byAi: true, runId: binding.attempt.runId };
    }
    return { author: ctx.author ?? this.ctx.opts.author, byAi: ctx.source === 'ai', ...(ctx.externalMcp ? { runId: null } : {}) };
  }

  /** O que falta para o board trabalhar com a ferramenta de IA (informado pelo host, que confere). */
  setRequirements(list: BoardRequirement[]): void {
    // só avisa quando a lista muda (ou na primeira conferência). Com o perfil padrão sem login, a conferência roda a
    // cada 10 s, e avisar sempre remontava e reenviava o board inteiro a todas as interfaces, sem nada mudar. O
    // "Verificar de novo" não depende do aviso: espera a própria ação (`recheckRequirements`) e o `done` dela
    const changed = !this.requirementsCheckedAt || JSON.stringify(list) !== JSON.stringify(this.requirements);
    this.requirements = list;
    this.requirementsCheckedAt = Date.now();
    if (changed) this.notify();
    else this.invalidateSnapshot();
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
   * O perfil de CLI `cli` falhou por login vencido nesta execução (RF6) (`expired`), ou o probe confirmou que voltou;
   * só o sinal daquele perfil muda. Devolve se mudou, para quem chama decidir se loga a transição
   * (o log não é responsabilidade do `MessageRouter`, como nas outras operações).
   */
  setAuthExpired(cli: AiTool, expired: boolean): boolean {
    if (this.authExpired.includes(cli) === expired) return false;
    this.authExpired = expired ? [...this.authExpired, cli] : this.authExpired.filter((c) => c !== cli);
    this.notify();
    return true;
  }

  /** Grava a lista de pausas na `meta` (sem o `probe`, que é só de memória); falha vira só memória. */
  private persistUsageLimit(): void {
    const list: UsageLimitPause[] = this.usageLimit.map(({ profileId, resumeAt, source, attempts }) => ({
      profileId,
      resumeAt,
      source,
      attempts,
    }));
    try {
      this.ctx.boards.setMeta(USAGE_LIMIT_META_KEY, JSON.stringify(list));
    } catch {
      // sem gravar, a pausa vale só nesta sessão do editor
    }
  }

  /** Grava as marcas de modelo na `meta`, sem as vencidas; falha vira só memória. */
  private persistModelLimits(now: number): void {
    this.modelLimits = this.modelLimits.filter((l) => l.resumeAt > now);
    try {
      this.ctx.boards.setMeta(MODEL_LIMIT_META_KEY, JSON.stringify(this.modelLimits));
    } catch {
      // sem gravar, a marca vale só nesta sessão do editor
    }
  }

  /** As marcas de modelo esgotado (só o host lê). */
  modelLimitList(): readonly ModelLimit[] {
    return this.modelLimits;
  }

  /** O modelo esgotou e a regra trocou sozinha: grava a marca (renovação + folga, ou backoff) e devolve-a. */
  recordModelLimit(profileId: string, model: string, resetAt: number | null, now: number): ModelLimit {
    const prev = modelLimitOf(this.modelLimits, profileId, model);
    const mark = nextModelLimit(prev, profileId, model, resetAt, now);
    this.modelLimits = [...this.modelLimits.filter((l) => l !== prev), mark];
    this.persistModelLimits(now);
    return mark;
  }

  /** O modelo respondeu sem esbarrar no limite: a marca sai. Devolve se havia uma. */
  clearModelLimit(profileId: string, model: string | null, now: number = Date.now()): boolean {
    const prev = modelLimitOf(this.modelLimits, profileId, model);
    if (!prev) return false;
    this.modelLimits = this.modelLimits.filter((l) => l !== prev);
    this.persistModelLimits(now);
    return true;
  }

  /** O perfil `profileId` esgotou o limite de uso: grava a pausa (renovação + folga, ou backoff) e devolve-a. */
  recordUsageLimit(profileId: string, resetAt: number | null, now: number): UsageLimitPause {
    const prev = this.usageLimit.find((p) => p.profileId === profileId) ?? null;
    const pause = nextPause(prev, profileId, resetAt, now);
    const state: UsageLimitState = { ...pause, probe: prev?.probe ?? null };
    this.usageLimit = prev ? this.usageLimit.map((p) => (p.profileId === profileId ? state : p)) : [...this.usageLimit, state];
    this.persistUsageLimit();
    this.notify();
    return pause;
  }

  /**
   * Pergunta à pessoa, no card, como seguir depois do limite de uso (`limitChoice`): a pergunta vai pelo caminho
   * normal (o card fica esperando a resposta) e a escolha pendente fica no `meta`, para a resposta saber o que aplicar.
   */
  askLimitChoice(cardId: string, choice: LimitChoice, author: string): void {
    this.ctx.boards.setMeta(limitChoiceKey(cardId), JSON.stringify(choice));
    this.handle(
      {
        type: 'card.questions.set',
        cardId,
        questions: [{ question: choice.question, options: choice.options.map((o) => o.label), recommended: choice.recommended }],
      },
      { author, source: 'ai' },
    );
  }

  /** A ferramenta recusou o modelo para esta conta: ele sai do catálogo e não volta pelo "Detectar modelos". */
  retireModel(profileId: string, model: string): void {
    const profile = this.snapshot().board.aiProfiles.find((p) => p.id === profileId);
    if (profile && retireModel(this.ctx, catalogTool(profile), model)) this.changed();
  }

  /** A execução do perfil terminou sem esbarrar no limite: a pausa acaba. Devolve se havia uma. */
  clearUsageLimit(profileId: string): boolean {
    if (!this.usageLimit.some((p) => p.profileId === profileId)) return false;
    this.usageLimit = this.usageLimit.filter((p) => p.profileId !== profileId);
    this.persistUsageLimit();
    this.notify();
    return true;
  }

  /** Marca (ou, com null, solta) a execução de teste do perfil depois que a pausa venceu. Só memória. */
  setLimitProbe(profileId: string, cardId: string | null): void {
    if (!this.usageLimit.some((p) => p.profileId === profileId)) return;
    this.usageLimit = this.usageLimit.map((p) => (p.profileId === profileId ? { ...p, probe: cardId } : p));
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
    // entra no snapshot sem avisar os ouvintes (é a configuração da abertura): só o cache precisa saber
    this.invalidateSnapshot();
  }

  checkEnvironment(): Promise<void> {
    return this.environmentHooks?.check() ?? Promise.resolve();
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
    this.runnerRuns = runs;
    this.publishAiRuns();
  }

  /**
   * As histórias que o orquestrador conduz agora (informado pelo host): entre uma rodada e outra a
   * história continua "Em execução", e o `staleRunning` não a libera. A execução de uma unidade já
   * aparece em `setAiRuns` e prevalece.
   */
  setOrchestrations(runs: AiActivity[]): void {
    this.orchestrations = runs;
    this.publishAiRuns();
  }

  private publishAiRuns(): void {
    const own = new Set(this.runnerRuns.map((r) => r.cardId));
    this.aiActivity = [...this.runnerRuns, ...this.orchestrations.filter((r) => !own.has(r.cardId))];
    this.aiRuns = this.aiActivity.map((r) => r.cardId);
    this.ctx.aiRuns = this.aiRuns;
    this.notify();
  }

  /** Avisa quando cards vão para uma coluna de cancelamento (o orquestrador interrompe as execuções deles). */
  onCardsCancelled(fn: (cardIds: string[]) => void): void {
    this.cancelListeners.push(fn);
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

  /** O chat com a IA (informado pela sessão de chat): as mensagens e se a IA está respondendo. */
  setChat(chat: ChatState): void {
    this.chat = chat;
    this.notify();
  }

  private policyAssistHandler?: (input: PolicyAssistInput) => Promise<PolicyAssistResult>;
  setPolicyAssistHandler(handler: (input: PolicyAssistInput) => Promise<PolicyAssistResult>): void {
    this.policyAssistHandler = handler;
  }
  /** Devolve só uma proposta: nada aqui salva, liga ou remove política. */
  assistExecutionPolicy(input: PolicyAssistInput): Promise<PolicyAssistResult> {
    if (!this.policyAssistHandler) return Promise.reject(new Error('A assistência de IA não está disponível neste board.'));
    return this.policyAssistHandler(input);
  }

  private artifactAssistHandler?: (input: ArtifactAssistInput) => Promise<ArtifactAssistResult>;
  setArtifactAssistHandler(handler: (input: ArtifactAssistInput) => Promise<ArtifactAssistResult>): void {
    this.artifactAssistHandler = handler;
  }
  assistArtifact(input: ArtifactAssistInput): Promise<ArtifactAssistResult> {
    if (!this.artifactAssistHandler) return Promise.reject(new Error('A assistência de IA não está disponível neste board.'));
    return this.artifactAssistHandler(input);
  }

  private agentAssistHandler?: (input: AgentAssistInput) => Promise<AgentAssistResult>;
  setAgentAssistHandler(handler: (input: AgentAssistInput) => Promise<AgentAssistResult>): void {
    this.agentAssistHandler = handler;
  }
  assistAgent(input: AgentAssistInput): Promise<AgentAssistResult> {
    if (!this.agentAssistHandler) return Promise.reject(new Error('A assistência de IA não está disponível neste board.'));
    return this.agentAssistHandler(input);
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

  /** Commits da branch da história do card (`base..branch`); [] sem branch, pasta ou base. */
  storyCommits(cardId: string): StoryCommit[] {
    const s = this.ctx.state();
    const card = s.cards.find((c) => c.id === cardId);
    const story = card ? storyOf(s, card) : undefined;
    if (!story?.branch) return [];
    const dir = story.worktreePath || this.ctx.opts.workspaceDir || '';
    return storyCommits(dir, story.baseBranch || this.ctx.mainBranch()?.name || '', story.branch);
  }

  /** Copia arquivos do disco como anexos do card (usado pelo seletor de arquivos). */
  addAttachmentFiles(cardId: string, paths: string[], artifact = false, ctx: Origin = {}): BoardState {
    const actor = this.actorOf(ctx);
    this.invalidateSnapshot();
    for (const p of paths) {
      // o mesmo par sonda/registro do `attachment.addData`, com a mensagem equivalente
      const msg: WebviewToHost = { type: 'attachment.addData', cardId, filename: path.basename(p), base64: '', artifact };
      const probe = this.ctx.log.probe(msg);
      addAttachment(this.ctx, cardId, artifact, (target) => this.store.importFile(target, p));
      this.ctx.log.record(msg, actor, probe);
    }
    return this.changed();
  }

  /** Relê a biblioteca do board e avisa os webviews se algo mudou. */
  refreshHarness(): void {
    this.invalidateSnapshot();
    if (this.ctx.harness.refresh()) this.changed();
  }

  /** Lê a origem de artefatos e deixa a prévia no estado do board. */
  async scanImport(source: ImportSource): Promise<void> {
    try {
      await this.ctx.importer.scan(source);
    } finally {
      this.notify();
    }
  }

  /** O aviso do último `harness.import.apply`, entregue uma vez. */
  takeImportNotice(): string | null {
    const notice = this.ctx.harness.importNotice;
    this.ctx.harness.importNotice = null;
    return notice;
  }

  /** O conteúdo de um artefato do board para o editor (segredos do MCP mascarados). */
  readArtifact(kind: ArtifactKind, name: string, file?: string) {
    return this.ctx.library.content(kind, name, file);
  }

  /** Conteúdo de um arquivo do harness para o editor do board, e se ele pode ser alterado. */
  readHarnessFile(file: string): { content: string; readonly: boolean } {
    return this.ctx.harness.readFile(file);
  }

  /** O perfil do projeto aberto, para os assistentes de regras e de skills. */
  projectArtifacts(): { kind: string; name: string; origin: string; body: string }[] {
    const dir = this.ctx.opts.workspaceDir;
    if (!dir) throw new Error('Abra um projeto existente para gerar artefatos.');
    return scanLibraryFolder(dir)
      .filter((a) => a.kind !== 'mcp')
      .slice(0, 60)
      .map((a) => ({ kind: a.kind, name: a.name, origin: a.origin, body: a.body.slice(0, 4000) }));
  }

  /** A pasta do projeto aberto; vazio quando o board abriu sem projeto. */
  get workspaceDir(): string | undefined {
    return this.ctx.opts.workspaceDir;
  }

  projectProfile(): ProjectProfile {
    return readProjectProfile(this.ctx.opts.workspaceDir ?? '');
  }

  /** Prévia do "Exportar para a ferramenta": só lê o board e o disco. */
  exportPlan(tool: AiTool, target: ExportTarget): ExportPlan {
    return this.exporter().plan(tool, target);
  }

  /** Grava os artefatos escolhidos na pasta da ferramenta; o board não muda. */
  exportApply(tool: AiTool, target: ExportTarget, ids: string[], replace: boolean): ExportResult {
    return this.exporter().apply(tool, target, ids, replace);
  }

  private exporter(): ToolExporter {
    const defaultAgent = this.ctx.boards.snapshot(this.ctx.boardId, this.ctx.opts.author).board.runner.defaultAgent;
    return new ToolExporter(
      this.ctx.library.repo,
      this.ctx.boardId,
      { projectDir: this.ctx.opts.workspaceDir || undefined, homeDir: os.homedir() },
      defaultAgent,
    );
  }

  private notify(): void {
    this.invalidateSnapshot();
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
