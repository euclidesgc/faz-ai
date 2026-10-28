import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { MAX_ATTACHMENT_BYTES } from '../attachments';
import { parseExportFile, type ImportResult } from '../db/boardExport';
import type { HostToWebview, Tracked, WebviewToHost } from '../../shared/messages';
import type { AiRunMode } from '../../shared/runner';
import type { AiTool } from '../../shared/harness';
import type { ViewStateStore } from '../viewState';
import type { PrefsStore } from '../prefs';
import type { MessageRouter } from '../panel/messageRouter';
import { messageData, summarize } from '../../shared/trace';
import { DEFAULT_SCOPE, projectForWebview, sameScope, type WebviewScope } from '../../shared/webviewState';
import { TEST_IDLE } from '../../shared/agentConnect';
import { TestSession } from '../agentConnect/session';
import type { AgentConnectService } from '../agentConnect/service';

/**
 * Quanto tempo as mudanças do board se acumulam antes de um envio à interface (#1066). Uma execução da IA
 * grava várias mudanças seguidas (comentário, status, coluna) e cada uma avisava a interface com o estado
 * inteiro; agora vão juntas. Uma ação da própria interface não espera: o `done` dela força o envio antes.
 */
export const POST_COALESCE_MS = 50;

/** Mensagens que já respondem com o próprio `requestId` (payload de leitura ou resultado de gravação): não ganham `done`. */
const SELF_ANSWERING = new Set<WebviewToHost['type']>([
  'attachment.read',
  'harness.artifact.read',
  'harness.project.profile',
  'harness.export.plan',
  'harness.export.apply',
  'harness.agent.assist',
  'harness.artifact.assist',
  'metrics.query',
  'card.usage.query',
  'contextPlanning.preview',
  'contextPlanning.propose',
  'executionPolicy.read',
  'executionPolicy.simulate',
  'executionPolicy.assist',
  'agentConnect.registry',
]);

/** Quantas linhas um lote do rastreio da tela traz, no máximo: a tela não pode encher o arquivo de uma vez. */
const MAX_UI_TRACE = 200;

/** O que depende de onde o board está rodando: dentro do editor ou num navegador. */
export interface HostEnv {
  /** endereço base dos arquivos de anexos, como a interface os enxerga */
  attachmentsBaseUri(): string;
  showFilters(): unknown;
  /** registra o servidor MCP do board no global da ferramenta de IA; o texto devolvido vira um aviso na interface */
  connectAI(target: { tool?: AiTool }): unknown;
  /** tira o registro quebrado do board do arquivo do projeto e refaz o global; o texto devolvido vira um aviso */
  fixProjectMcp(file: string): Promise<string>;
  /** recarrega a janela do editor (só faz sentido dentro do editor) */
  reloadWindow?(): unknown;
  /** abre a tela de MCPs do editor (só faz sentido dentro do editor) */
  openEditorMcp?(): unknown;
  runAi(cardId: string, mode?: AiRunMode): unknown;
  stopAi(cardId: string): unknown;
  /** pausa o autopiloto das histórias em modo autônomo */
  pauseAutopilot(): unknown;
  /** retoma o autopiloto das histórias em modo autônomo */
  resumeAutopilot(): unknown;
  /** começa uma rodada do heartbeat; o texto devolvido vira um aviso na interface */
  runHeartbeat(): unknown;
  /** abre uma pasta (a worktree de uma história) numa janela do editor ou no sistema */
  openFolder(dir: string): unknown;
  /** abre um arquivo de texto para edição */
  openFile(file: string): unknown;
  /** abre um arquivo qualquer com o programa padrão do sistema */
  openExternal(file: string): unknown;
  revealFile(file: string): unknown;
  /** deixa a pessoa escolher arquivos do disco; undefined quando ela desiste */
  pickFiles(): Promise<string[] | undefined>;
  /** abre o diálogo nativo de "salvar como" e copia o arquivo do anexo para o destino escolhido; undefined quando a pessoa desiste ou o ambiente não suporta (web) */
  saveFileAs?(sourcePath: string, suggestedName: string): Promise<void>;
  /** abre o diálogo nativo de "salvar como" e grava o texto; devolve o caminho gravado, ou undefined quando a pessoa desiste (só no editor) */
  saveTextAs?(content: string, suggestedName: string): Promise<string | undefined>;
  /** deixa a pessoa escolher um arquivo de export do board; sem ele, vale `pickFiles` */
  pickBackupFile?(): Promise<string | undefined>;
  /** deixa a pessoa escolher uma pasta para importar artefatos; undefined quando ela desiste (só no editor) */
  pickFolder?(title: string): Promise<string | undefined>;
  /** abre o board no navegador (só faz sentido dentro do editor) */
  openInBrowser?(): unknown;
  /** mostra o chat na barra lateral (só faz sentido dentro do editor) */
  showChat?(): unknown;
}

/** Mensagem de resultado da exportação: onde ficou, os cards com anexo sem arquivo e o aviso sobre o conteúdo. */
export function exportNotice(savedPath: string, warnings: string[]): string {
  const missing = warnings.length ? ` Anexos sem arquivo: ${warnings.join(', ')}.` : '';
  return `Board exportado em ${savedPath}.${missing} O arquivo contém conversas e anexos: guarde-o com cuidado. Credenciais e variáveis dos perfis de CLI não vão no arquivo.`;
}

/** Mensagem de resultado da importação: o board, os totais, os cards cujo anexo ficou sem arquivo e os segredos de MCP a preencher. */
export function importNotice(r: ImportResult): string {
  const missing = r.warnings.length ? ` Anexos sem arquivo: ${r.warnings.join(', ')}.` : '';
  const secrets = r.mcpSecrets.length ? ` Revise as configurações locais dos servidores MCP: ${r.mcpSecrets.join(', ')}.` : '';
  const profiles = r.profileReviews?.length ? ` Perfis desativados para revisão local: ${r.profileReviews.join(', ')}.` : '';
  const credentials = r.profileReviews?.length ? ' Credenciais dos perfis não vêm no arquivo: configure-as de novo neste computador.' : '';
  const policies = r.policyReviews?.length ? ` Políticas pendentes de revisão: ${r.policyReviews.join(', ')}.` : '';
  return `Board "${r.boardName}" importado: ${r.cards} card(s) e ${r.attachments} anexo(s).${missing}${secrets}${profiles}${credentials}${policies}`;
}

/**
 * Liga uma interface (webview do editor ou página no navegador) ao roteador e ao estado de
 * visualização: recebe mensagens, e reenvia o board e os filtros sempre que mudam, venha a mudança
 * de onde vier. Não depende da API do VSCode.
 */
export class HostBridge {
  private subs: (() => void)[] = [];
  /** a tela e o card aberto desta interface, que decidem o recorte do estado enviado */
  private scope: WebviewScope = DEFAULT_SCOPE;
  /** há mudança do board ainda não enviada */
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** interface escondida (aba ou painel fora de vista): as mudanças esperam ela voltar */
  private visible = true;
  /** a sessão de teste de Conectar agentes desta interface, criada na primeira vez que a pessoa abre uma */
  private testSession: TestSession | null = null;

  constructor(
    private send: (msg: HostToWebview) => void,
    private router: MessageRouter,
    private viewState: ViewStateStore,
    private prefs: PrefsStore,
    private env: HostEnv,
    private onReady?: () => void,
  ) {
    this.subs.push(router.onDidChange(() => this.scheduleBoard()));
    this.subs.push(router.onDidError((message) => this.post({ type: 'error', message })));
    this.subs.push(viewState.onDidChange((view, origin) => origin !== this && this.post({ type: 'viewState', view })));
    this.subs.push(prefs.onDidChange((prefs, origin) => origin !== this && this.post({ type: 'prefs', prefs })));
    const agents = router.agentConnect;
    // a conta de um agente e o log das verificações valem para todas as telas abertas (o editor e o navegador)
    if (agents)
      this.subs.push(
        agents.on((notice) =>
          notice.type === 'account'
            ? this.post({ type: 'agentConnect.account', key: notice.key, account: notice.account })
            : this.post({ type: 'agentConnect.log', entry: notice.entry }),
        ),
      );
  }

  post(msg: HostToWebview): void {
    // o estado que mudou vai antes de qualquer outra mensagem: um aviso ou resultado nunca chega com a tela atrasada
    if (msg.type !== 'boardState') this.flushBoard();
    this.traceSend(msg);
    this.send(msg);
  }

  /** O que vai para a tela: do estado, só o tamanho; o `done` já é rastreado em `handle`; o resto, resumido. */
  private traceSend(msg: HostToWebview): void {
    const trace = this.router.trace;
    if (msg.type === 'done') return;
    if (msg.type === 'boardState')
      return trace.write({
        src: 'bridge',
        ev: 'state',
        data: { view: this.scope.view, card: this.scope.openCardId, cards: msg.state.cards.length },
      });
    if (msg.type === 'error') return trace.write({ src: 'bridge', ev: 'send', type: msg.type, ok: false, err: msg.message });
    trace.write({ src: 'bridge', ev: 'send', type: msg.type, data: messageData(msg) });
  }

  dispose(): void {
    this.subs.forEach((off) => off());
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // a interface fechou: o processo da sessão de teste não pode ficar órfão
    this.testSession?.close();
    this.testSession = null;
  }

  private agents(): AgentConnectService {
    const service = this.router.agentConnect;
    if (!service) throw new Error('Conectar agentes não está disponível neste host.');
    return service;
  }

  /** A sessão de teste desta interface: o que ela manda vai só para esta tela; o log vai também para o arquivo. */
  private session(): TestSession {
    const service = this.agents();
    this.testSession ??= new TestSession(
      {
        event: (event) => this.post({ type: 'agentConnect.test.event', event }),
        state: (state) => this.post({ type: 'agentConnect.test.state', state }),
        log: (entry) => {
          service.writeLog(entry, false);
          this.post({ type: 'agentConnect.log', entry });
        },
      },
      service.spawn,
    );
    return this.testSession;
  }

  /** As mensagens de Conectar agentes; false quando a mensagem não é dela. */
  private async dispatchAgentConnect(msg: WebviewToHost): Promise<boolean> {
    switch (msg.type) {
      case 'agentConnect.registry':
        try {
          const { listing, installed } = await this.agents().listing(msg.refresh);
          this.post({ type: 'agentConnect.registryResult', requestId: msg.requestId, listing, installed });
        } catch (e) {
          this.post({ type: 'agentConnect.registryResult', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return true;
      case 'agentConnect.sync': {
        const service = this.agents();
        this.post({ type: 'agentConnect.accounts', accounts: service.snapshot() });
        this.post({ type: 'agentConnect.test.state', state: this.testSession?.state ?? TEST_IDLE });
        this.post({ type: 'agentConnect.logFile', file: service.logFilePath() });
        return true;
      }
      case 'agentConnect.openLog': {
        const file = this.agents().logFilePath();
        if (!file) throw new Error('Este board não tem pasta de dados para o log do protocolo.');
        await fs.access(file).catch(() => {
          throw new Error('Ainda não há log do protocolo hoje: verifique a conta de um agente ou abra uma sessão de teste.');
        });
        await this.env.openFile(file);
        return true;
      }
      // a conta, o login e o logout seguem pelos avisos do serviço (`agentConnect.account`): o login pode levar o
      // tempo da pessoa no navegador, e a tela não fica presa esperando o `done`
      case 'agentConnect.check':
        void this.agents().check(msg.key);
        return true;
      case 'agentConnect.login':
        void this.agents().login(msg.key, msg.methodId, msg.apiKey);
        return true;
      case 'agentConnect.logout':
        void this.agents().logout(msg.key);
        return true;
      case 'agentConnect.test.open': {
        const { launch, auth } = await this.agents().testLaunch(msg.key);
        const cwd = this.router.workspaceDir || os.homedir();
        // não espera: a primeira abertura pode levar o tempo do npx baixar o pacote; a tela acompanha pelo estado
        void this.session().open(msg.key, launch, cwd, auth);
        return true;
      }
      case 'agentConnect.test.reopen':
        void this.session().reopen();
        return true;
      case 'agentConnect.test.prompt':
        this.session().prompt(msg.text);
        return true;
      case 'agentConnect.test.permission':
        this.testSession?.answerPermission(msg.permissionId, msg.optionId);
        return true;
      case 'agentConnect.test.setConfig':
        await this.session().setConfigOption(msg.configId, msg.value);
        return true;
      case 'agentConnect.test.setMode':
        await this.session().setMode(msg.modeId);
        return true;
      case 'agentConnect.test.cancel':
        this.testSession?.cancel();
        return true;
      case 'agentConnect.test.close':
        this.testSession?.close();
        return true;
      default:
        return false;
    }
  }

  /**
   * A interface entrou ou saiu de vista. Escondida, não recebe estado (o editor guarda o webview, mas ninguém
   * olha); ao voltar, recebe o que mudou enquanto isso, de uma vez.
   */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible && this.dirty) this.flushBoard();
  }

  /** Marca que o board mudou e agenda um envio; mudanças seguidas vão num envio só. */
  private scheduleBoard(): void {
    this.dirty = true;
    if (this.timer || !this.visible) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.dirty) this.flushBoard();
    }, POST_COALESCE_MS);
  }

  /** Envia o estado agora, se há mudança pendente e a interface está à vista. */
  private flushBoard(): void {
    if (!this.dirty || !this.visible) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.postBoard();
  }

  private postBoard(): void {
    this.dirty = false;
    this.post({
      type: 'boardState',
      state: projectForWebview(this.router.snapshot(), this.scope),
      attachmentsBaseUri: this.env.attachmentsBaseUri(),
    });
  }

  /**
   * Trata a mensagem e, se ela veio com `requestId`, confirma com `done` ao terminar, depois do `boardState`: a
   * mudança que a mensagem provocou fica agendada (`scheduleBoard`) e é enviada aqui, antes da confirmação, para
   * a interface já ter o estado novo quando a ação resolve. Uma exceção vira o toast de erro e um `done` com
   * `ok: false`. As leituras que têm resposta própria correlacionada (`*.readResult`, `metrics.result`...) não recebem `done`.
   */
  async handle(msg: Tracked): Promise<void> {
    // o rastreio da própria tela não é uma ação: só vai para o arquivo
    if (msg.type === 'ui.trace') return this.traceUi(msg.entries);
    const requestId = SELF_ANSWERING.has(msg.type) ? undefined : msg.requestId;
    const trace = this.router.trace;
    const startedAt = Date.now();
    trace.write({ src: 'bridge', ev: 'recv', type: msg.type, rid: msg.requestId, data: messageData(msg) });
    // o que mudou por outra origem (a IA, outra janela) e ainda esperava o intervalo vai antes da resposta
    this.flushBoard();
    try {
      await this.dispatch(msg);
      trace.write({ src: 'bridge', ev: 'done', type: msg.type, rid: msg.requestId, ms: Date.now() - startedAt, ok: true });
      this.flushBoard();
      if (requestId) this.post({ type: 'done', requestId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      trace.write({ src: 'bridge', ev: 'done', type: msg.type, rid: msg.requestId, ms: Date.now() - startedAt, ok: false, err: message });
      this.flushBoard();
      this.post({ type: 'error', message });
      if (requestId) this.post({ type: 'done', requestId, ok: false, error: message });
    }
  }

  /** As linhas que a tela juntou (cliques, erros, tempos de resposta) vão para o mesmo arquivo do host, com a origem `ui`. */
  private traceUi(entries: unknown): void {
    if (!Array.isArray(entries)) return;
    for (const e of entries.slice(0, MAX_UI_TRACE)) {
      if (!e || typeof e !== 'object') continue;
      const { at, ev, type, rid, ms, ok, err, data } = e as Record<string, unknown>;
      this.router.trace.write({
        src: 'ui',
        at: typeof at === 'number' ? at : Date.now(),
        ev: typeof ev === 'string' ? ev : 'ui',
        ...(typeof type === 'string' ? { type } : {}),
        ...(typeof rid === 'string' ? { rid } : {}),
        ...(typeof ms === 'number' ? { ms } : {}),
        ...(typeof ok === 'boolean' ? { ok } : {}),
        ...(typeof err === 'string' ? { err } : {}),
        ...(data !== undefined ? { data: summarize(data) } : {}),
      });
    }
  }

  /**
   * Refaz a situação dos perfis depois de uma ação que a muda (ligar, conectar). A ação já deu certo: um host sem
   * sonda (os testes) ou uma sonda que falha não a desfazem nem viram erro dela.
   */
  private async reprobe(): Promise<void> {
    try {
      this.post(await this.router.probeAiProfiles());
    } catch {
      /* sem sonda neste host: a lista fica com a situação anterior até o "Atualizar" de Conectar agentes */
    }
  }

  private async dispatch(msg: WebviewToHost): Promise<void> {
    if (await this.dispatchAgentConnect(msg)) return;
    switch (msg.type) {
      case 'ready':
        this.post({ type: 'viewState', view: this.viewState.get() });
        this.post({ type: 'prefs', prefs: this.prefs.get() });
        this.postBoard();
        this.onReady?.();
        return;
      case 'ui.scope.set': {
        const scope: WebviewScope = { view: msg.view, openCardId: msg.openCardId };
        if (sameScope(scope, this.scope)) return;
        this.scope = scope;
        // a tela nova (ou o card aberto) precisa do que o recorte anterior não trazia
        this.dirty = true;
        this.flushBoard();
        return;
      }
      case 'settings.aiProfiles.probe':
        this.post(await this.router.probeAiProfiles());
        return;
      // o Conectar demora (achar a CLI, o login, as sondas, os modelos): o `done` só sai quando o fluxo para.
      // A chave colada segue direto para o host, e a mensagem não é guardada nem repetida a ninguém
      case 'settings.aiProfiles.connect':
        await this.router.connectProfile(msg.id, {
          ...(msg.apiKey !== undefined ? { apiKey: msg.apiKey } : {}),
          ...(msg.acknowledge ? { acknowledge: true } : {}),
          // o cartão do modo; o Conectar confere que a ferramenta o oferece antes de usar
          ...(typeof msg.mode === 'string' ? { mode: msg.mode } : {}),
        });
        // o Conectar acha a ferramenta e pode ligar o perfil: a situação da lista de perfis é refeita, senão a linha
        // mostrava "Conectada" ao lado do "Não encontrada" de antes
        await this.reprobe();
        return;
      // ligar ou desligar muda o que a sonda pode olhar: a situação vem refeita junto
      case 'settings.aiProfiles.setEnabled':
        this.router.handle(msg);
        await this.reprobe();
        return;
      // a verificação do perfil que não passa pelo Conectar (a cópia do Claude, o personalizado ACP): o `done`
      // sai no fim das sondas, e a frase do resultado vira aviso. A faixa de requisitos não é conferida aqui: o
      // host já confere o ambiente ao fim de toda verificação (`Verifications.done`), e o "Verificar de novo"
      // (`recheckRequirements`) ainda relê o PATH, pula o cache do login e reabre as provas automáticas do ACP
      case 'settings.aiProfiles.verify':
        this.post({ type: 'notice', message: await this.router.verifyProfile(msg.id) });
        return;
      // o teste do contexto do card: o resultado vai para o estado (`contextScopes`); o aviso só diz que terminou
      case 'settings.aiProfiles.contextScope': {
        const report = await this.router.runContextScope(msg.id);
        this.post({
          type: 'notice',
          message: report.error ? `O teste do contexto não terminou: ${report.error}` : 'Teste do contexto concluído.',
        });
        return;
      }
      case 'settings.aiProfiles.contextReveal':
        await this.env.openExternal(this.router.contextFolder(msg.id, msg.path));
        return;
      // a resposta vai para o estado (`contextAdvice`): a tela mostra o comando como sugestão do agente
      case 'settings.aiProfiles.contextAsk':
        await this.router.askContextUninstall(msg.id, msg.plugin);
        return;
      // a ação muda o que o agente lê: o teste roda de novo, em segundo plano, e a tela acompanha pelo estado
      case 'settings.aiProfiles.contextFix':
        this.router.handle(msg);
        void this.router.runContextScope(msg.id).catch(() => {});
        return;
      case 'settings.aiProfiles.test':
        this.post(await this.router.testAiProfile(msg.id, msg.model));
        // o teste muda a evidência do perfil: o aviso do topo reflete o resultado sem recarregar
        await this.router.recheckRequirements();
        return;
      case 'view.set':
        this.viewState.update(msg.patch, this);
        return;
      case 'prefs.set':
        this.prefs.update(msg.patch, this);
        return;
      case 'ui.showFilters':
        await this.env.showFilters();
        return;
      case 'ui.connectAI': {
        const notice = await this.env.connectAI({ tool: msg.tool });
        if (typeof notice === 'string') this.post({ type: 'notice', message: notice });
        return;
      }
      case 'ui.fixProjectMcp':
        this.post({ type: 'notice', message: await this.env.fixProjectMcp(msg.file) });
        return;
      case 'ui.reloadWindow':
        await this.env.reloadWindow?.();
        return;
      case 'ui.openEditorMcp':
        await this.env.openEditorMcp?.();
        return;
      case 'ui.openTerminal':
        this.router.openTerminal(msg.command);
        return;
      case 'ui.showChat':
        await this.env.showChat?.();
        return;
      // a conferência demora (CLIs, login): o `done` só sai quando ela termina, para a tela saber quando parou
      case 'requirements.check':
        await this.router.recheckRequirements();
        return;
      // varrer e limpar demoram (git em cada item): o `done` só sai quando termina, para a tela saber quando parou
      case 'git.orphans.scan':
        await this.router.scanOrphans();
        return;
      case 'git.orphans.clean':
        this.post({ type: 'notice', message: await this.router.cleanOrphan(msg.id, msg.acceptLoss) });
        return;
      case 'git.orphans.cleanSafe':
        this.post({ type: 'notice', message: await this.router.cleanSafeOrphans() });
        return;
      case 'environment.check':
        await this.router.checkEnvironment();
        return;
      case 'environment.seen':
        this.router.markEnvironmentSeen();
        return;
      case 'chat.send':
      case 'chat.stop':
      case 'chat.clear':
      case 'ai.suggestAgents':
      case 'ai.suggestRules':
      case 'ai.suggestSkills':
        this.router.chatCommand(msg);
        return;
      case 'ui.openInBrowser':
        await this.env.openInBrowser?.();
        return;
      case 'ai.run':
        await this.env.runAi(msg.cardId, msg.mode);
        return;
      case 'ai.stop':
        await this.env.stopAi(msg.cardId);
        return;
      case 'ai.autopilot.pause':
        await this.env.pauseAutopilot();
        return;
      case 'ai.autopilot.resume':
        await this.env.resumeAutopilot();
        return;
      case 'card.workspace.open': {
        const cards = this.router.snapshot().cards;
        const card = cards.find((c) => c.id === msg.cardId);
        const story = card?.parentId ? cards.find((c) => c.id === card.parentId) : card;
        if (!story?.worktreePath) throw new Error('Esta história ainda não tem pasta de trabalho.');
        await this.env.openFolder(story.worktreePath);
        return;
      }
      case 'harness.artifact.read': {
        try {
          this.post({
            type: 'harness.artifact.readResult',
            requestId: msg.requestId,
            ...this.router.readArtifact(msg.kind, msg.name, msg.file),
          });
        } catch (e) {
          this.post({ type: 'harness.artifact.readResult', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case 'harness.import.scan':
        await this.router.scanImport(msg.source);
        return;
      case 'settings.models.detect':
        // num perfil ACP a lista vem do agente, por uma sessão aberta agora; nos outros, da última leitura da CLI
        if (!msg.fastOnly) {
          await this.router.readAcpModels(msg.tool);
          await this.router.readToolModels(msg.tool);
        }
        this.router.handle(msg);
        return;
      case 'harness.import.apply': {
        this.router.handle(msg);
        const notice = this.router.takeImportNotice();
        if (notice) this.post({ type: 'notice', message: notice });
        return;
      }
      case 'harness.refresh':
        this.router.refreshHarness();
        return;
      case 'harness.library.read':
        this.post({ type: 'harness.library.content', input: this.router.readLibraryArtifact(msg.id) });
        return;
      case 'harness.library.folders': {
        const input = msg.dir.trim();
        if (input && !path.isAbsolute(input) && !input.startsWith('~/')) throw new Error('Informe o caminho completo de uma pasta.');
        const directory = path.resolve(input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input || os.homedir());
        const entries = await fs.readdir(directory, { withFileTypes: true });
        this.post({
          type: 'harness.library.foldersResult',
          directory,
          parent: path.dirname(directory),
          folders: entries
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => ({ name: e.name, path: path.join(directory, e.name) })),
        });
        return;
      }
      case 'harness.library.pickDirectory': {
        if (!this.env.pickFolder) throw new Error('Informe o caminho da pasta.');
        const dir = await this.env.pickFolder('Pasta da biblioteca');
        if (dir) this.post({ type: 'harness.library.directorySelected', directory: dir });
        return;
      }
      case 'harness.library.pickArtifacts': {
        if (!this.env.pickFolder) throw new Error('Informe o caminho da pasta.');
        const dir = await this.env.pickFolder('Importar artefatos para o board');
        if (dir) this.router.handle({ type: 'harness.library.scan', dir });
        return;
      }
      case 'harness.library.open': {
        const directory = this.router.snapshot().harness.library?.directory;
        if (directory) await this.env.openExternal(directory);
        return;
      }
      case 'harness.import.pick': {
        let picked: string | undefined;
        if (msg.what === 'folder') {
          if (!this.env.pickFolder) throw new Error('Sem seletor de pasta aqui: informe o caminho da pasta.');
          picked = await this.env.pickFolder('Importar artefatos de uma pasta');
        } else picked = this.env.pickBackupFile ? await this.env.pickBackupFile() : (await this.env.pickFiles())?.[0];
        if (picked) await this.router.scanImport({ from: msg.what === 'folder' ? 'folder' : 'export', path: picked });
        return;
      }
      case 'harness.agent.assist':
        try {
          this.post({ type: 'harness.agent.assistResult', requestId: msg.requestId, result: await this.router.assistAgent(msg.input) });
        } catch (error) {
          this.post({
            type: 'harness.agent.assistResult',
            requestId: msg.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      case 'harness.artifact.assist':
        try {
          this.post({
            type: 'harness.artifact.assistResult',
            requestId: msg.requestId,
            result: await this.router.assistArtifact(msg.input),
          });
        } catch (error) {
          this.post({
            type: 'harness.artifact.assistResult',
            requestId: msg.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      case 'harness.project.profile':
        // ler o projeto não muda o board: o erro vai na própria resposta
        try {
          this.post({ type: 'harness.project.profileResult', requestId: msg.requestId, profile: this.router.projectProfile() });
        } catch (e) {
          this.post({
            type: 'harness.project.profileResult',
            requestId: msg.requestId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      case 'harness.export.plan':
        // exportar não muda o board: o erro vai na própria resposta
        try {
          this.post({ type: 'harness.export.planResult', requestId: msg.requestId, plan: this.router.exportPlan(msg.tool, msg.target) });
        } catch (e) {
          this.post({ type: 'harness.export.planResult', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      case 'harness.export.apply':
        try {
          this.post({
            type: 'harness.export.applyResult',
            requestId: msg.requestId,
            result: this.router.exportApply(msg.tool, msg.target, msg.ids, msg.replace),
          });
        } catch (e) {
          this.post({ type: 'harness.export.applyResult', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      case 'ai.heartbeat.run': {
        const notice = await this.env.runHeartbeat();
        if (typeof notice === 'string') this.post({ type: 'notice', message: notice });
        return;
      }
      case 'attachment.pick': {
        const files = await this.env.pickFiles();
        if (files?.length) this.router.addAttachmentFiles(msg.cardId, files);
        return;
      }
      case 'attachment.reveal': {
        const a = this.router.getAttachment(msg.attachmentId);
        if (!a) throw new Error('Anexo não encontrado');
        await this.env.revealFile(this.router.store.pathOf(a));
        return;
      }
      case 'attachment.saveAs': {
        const a = this.router.getAttachment(msg.attachmentId);
        if (!a) throw new Error('Anexo não encontrado');
        await this.env.saveFileAs?.(this.router.store.pathOf(a), a.filename);
        return;
      }
      case 'attachment.read': {
        const a = this.router.getAttachment(msg.attachmentId);
        if (!a) {
          this.post({ type: 'attachment.readResult', requestId: msg.requestId, error: 'Anexo não encontrado' });
          return;
        }
        const file = this.router.store.pathOf(a);
        const stat = await fs.stat(file);
        if (stat.size > MAX_ATTACHMENT_BYTES) {
          this.post({ type: 'attachment.readResult', requestId: msg.requestId, error: 'Anexo maior que 20 MB' });
          return;
        }
        const content = await fs.readFile(file, 'utf8');
        this.post({ type: 'attachment.readResult', requestId: msg.requestId, content });
        return;
      }
      case 'metrics.query': {
        // ler o log não é mutação do board: não passa por `router.handle`; o erro vai na própria resposta
        try {
          this.post({ type: 'metrics.result', requestId: msg.requestId, result: this.router.panelMetrics(msg.query) });
        } catch (e) {
          this.post({ type: 'metrics.result', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case 'executionPolicy.read': {
        try {
          this.post({
            type: 'executionPolicy.result',
            requestId: msg.requestId,
            ...(msg.id
              ? this.router.executionPolicyHistory(msg.id, msg.beforeRevision)
              : { library: this.router.executionPolicyLibrary() }),
          });
        } catch (e) {
          this.post({ type: 'executionPolicy.result', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case 'executionPolicy.simulate': {
        try {
          this.post({
            type: 'executionPolicy.result',
            requestId: msg.requestId,
            simulation: this.router.simulateExecutionPolicy(msg.scenario),
          });
        } catch (e) {
          this.post({ type: 'executionPolicy.result', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case 'executionPolicy.assist': {
        try {
          this.post({
            type: 'executionPolicy.result',
            requestId: msg.requestId,
            assistance: await this.router.assistExecutionPolicy(msg.input),
          });
        } catch (e) {
          this.post({ type: 'executionPolicy.result', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case 'contextPlanning.preview': {
        try {
          this.post({
            type: 'contextPlanning.preview.result',
            requestId: msg.requestId,
            preview: this.router.previewContextDraft(msg.target),
          });
        } catch (e) {
          this.post({
            type: 'contextPlanning.preview.result',
            requestId: msg.requestId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }
      case 'contextPlanning.propose': {
        try {
          this.post({
            type: 'contextPlanning.propose.result',
            requestId: msg.requestId,
            proposal: await this.router.proposeContext(msg.target, msg.language),
          });
        } catch (e) {
          this.post({
            type: 'contextPlanning.propose.result',
            requestId: msg.requestId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }
      case 'card.usage.query': {
        // ler o log não é mutação do board, como em `metrics.query`
        try {
          this.post({ type: 'card.usage.result', requestId: msg.requestId, usage: this.router.cardUsage(msg.cardId) });
        } catch (e) {
          this.post({ type: 'card.usage.result', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case 'backup.export': {
        const { text, name, warnings } = this.router.exportBoardFile();
        const saved = await this.env.saveTextAs?.(text, name);
        this.post({ type: 'backup.done' });
        if (!saved) return;
        this.post({ type: 'notice', message: exportNotice(saved, warnings) });
        return;
      }
      case 'backup.import.pick': {
        const file = this.env.pickBackupFile ? await this.env.pickBackupFile() : (await this.env.pickFiles())?.[0];
        if (!file) return void this.post({ type: 'backup.done' });
        try {
          const text = await fs.readFile(file, 'utf8');
          const parsed = parseExportFile(text);
          const { token, summary } = this.router.parkImport(parsed, Buffer.byteLength(text));
          this.post({ type: 'backup.import.summary', token, summary });
        } finally {
          this.post({ type: 'backup.done' });
        }
        return;
      }
      case 'backup.import.cancel':
        this.router.discardImport(msg.token);
        return;
      case 'backup.import.apply': {
        const result = this.router.applyImport(msg.token);
        this.post({ type: 'notice', message: importNotice(result) });
        return;
      }
      case 'attachment.write': {
        const a = this.router.getAttachment(msg.attachmentId);
        if (!a) throw new Error('Anexo não encontrado');
        await fs.writeFile(this.router.store.pathOf(a), msg.content, 'utf8');
        return;
      }
      default:
        // mutações disparam router.onDidChange, que reenvia o board para todas as interfaces
        this.router.handle(msg);
    }
  }
}
