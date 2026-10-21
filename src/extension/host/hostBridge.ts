import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { fetchSource, parseSource } from '../skillInstall';
import { MAX_ATTACHMENT_BYTES } from '../attachments';
import { parseExportFile, type ImportResult } from '../db/boardExport';
import type { HostToWebview, Tracked, WebviewToHost } from '../../shared/messages';
import type { AiRunMode } from '../../shared/runner';
import type { AiTool } from '../../shared/harness';
import type { ViewStateStore } from '../viewState';
import type { PrefsStore } from '../prefs';
import type { MessageRouter } from '../panel/messageRouter';

/** Mensagens que já respondem com o próprio `requestId` (payload de leitura ou resultado de gravação): não ganham `done`. */
const SELF_ANSWERING = new Set<WebviewToHost['type']>([
  'attachment.read',
  'harness.file.read',
  'harness.project.profile',
  'harness.agent.assist',
  'metrics.query',
  'card.usage.query',
  'contextPlanning.preview',
  'executionPolicy.read',
  'executionPolicy.simulate',
  'executionPolicy.assist',
]);

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
  /** abre o Settings do editor filtrado no Faz AI, ou numa chave (só faz sentido dentro do editor) */
  openIdeSettings?(key?: string): unknown;
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

  constructor(
    private send: (msg: HostToWebview) => void,
    private router: MessageRouter,
    private viewState: ViewStateStore,
    private prefs: PrefsStore,
    private env: HostEnv,
    private onReady?: () => void,
  ) {
    this.subs.push(router.onDidChange(() => this.postBoard()));
    this.subs.push(router.onDidError((message) => this.post({ type: 'error', message })));
    this.subs.push(viewState.onDidChange((view, origin) => origin !== this && this.post({ type: 'viewState', view })));
    this.subs.push(prefs.onDidChange((prefs, origin) => origin !== this && this.post({ type: 'prefs', prefs })));
  }

  post(msg: HostToWebview): void {
    this.send(msg);
  }

  dispose(): void {
    this.router.clearInstall();
    this.subs.forEach((off) => off());
  }

  private postBoard(): void {
    this.post({ type: 'boardState', state: this.router.snapshot(), attachmentsBaseUri: this.env.attachmentsBaseUri() });
  }

  /**
   * Trata a mensagem e, se ela veio com `requestId`, confirma com `done` ao terminar (depois do `boardState`, que
   * o roteador já reenviou de forma síncrona). Uma exceção vira o toast de erro e um `done` com `ok: false`.
   * As leituras que têm resposta própria correlacionada (`*.readResult`, `metrics.result`...) não recebem `done`.
   */
  async handle(msg: Tracked): Promise<void> {
    const requestId = SELF_ANSWERING.has(msg.type) ? undefined : msg.requestId;
    try {
      await this.dispatch(msg);
      if (requestId) this.post({ type: 'done', requestId, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: 'error', message });
      if (requestId) this.post({ type: 'done', requestId, ok: false, error: message });
    }
  }

  private async dispatch(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.post({ type: 'viewState', view: this.viewState.get() });
        this.post({ type: 'prefs', prefs: this.prefs.get() });
        this.postBoard();
        this.onReady?.();
        return;
      case 'settings.aiProfiles.probe':
        this.post(await this.router.probeAiProfiles());
        return;
      case 'settings.aiProfiles.test':
        this.post(await this.router.testAiProfile(msg.id));
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
      case 'environment.pinMcp':
        await this.router.pinEnvironmentMcp();
        return;
      case 'environment.allowKimiMcp':
        this.router.allowKimiMcp();
        return;
      case 'chat.send':
      case 'chat.stop':
      case 'chat.clear':
      case 'ai.suggestAgents':
      case 'ai.suggestRules':
      case 'ai.suggestSkills':
      case 'harness.suggest.run':
        this.router.chatCommand(msg);
        return;
      case 'harness.suggest.clear':
        this.router.setSuggestions(null);
        return;
      case 'ui.openInBrowser':
        await this.env.openInBrowser?.();
        return;
      case 'ui.openIdeSettings':
        await this.env.openIdeSettings?.(msg.key);
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
      case 'harness.item.open': {
        // só abre arquivos que a varredura do harness listou
        const known = this.router.snapshot().harness.inventory.some((t) => t.items.some((i) => i.path === msg.path));
        if (!known) throw new Error('Arquivo fora do harness.');
        await this.env.openFile(msg.path);
        return;
      }
      case 'harness.file.read': {
        try {
          const { content, readonly } = this.router.readHarnessFile(msg.path);
          this.post({ type: 'harness.file.readResult', requestId: msg.requestId, content, readonly });
        } catch (e) {
          this.post({ type: 'harness.file.readResult', requestId: msg.requestId, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case 'harness.refresh':
        await this.router.refreshHarnessAndPlugins();
        return;
      case 'harness.plugin.apply':
        this.post({ type: 'notice', message: await this.router.applyPlugins(msg.tool, msg.action, msg.ids) });
        return;
      case 'harness.file.write':
        // a falha (JSON inválido, sem permissão) vira o erro do `done`, e a tela mantém o texto
        this.router.writeHarnessFile(msg.path, msg.content);
        return;
      case 'harness.skill.file.create':
        await this.env.openFile(this.router.createSkillFile(msg.tool, msg.path, msg.file, msg.link));
        return;
      case 'harness.skill.file.open':
        await this.env.openFile(this.router.skillFilePath(msg.tool, msg.path, msg.file));
        return;
      case 'harness.install.scan': {
        const fetched = await fetchSource(parseSource(msg.source, os.homedir()));
        this.router.setInstall(msg.source.trim(), fetched.dir, fetched.cleanup);
        return;
      }
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
      case 'harness.library.pick': {
        if (!this.env.pickFolder) throw new Error('Sem seletor de pasta aqui: informe o caminho da pasta.');
        const dir = await this.env.pickFolder('Importar skills para o board');
        if (dir) this.router.setInstall(dir, dir, () => {});
        return;
      }
      case 'harness.library.open': {
        const directory = this.router.snapshot().harness.library?.directory;
        if (directory) await this.env.openExternal(directory);
        return;
      }
      case 'harness.import.pick': {
        if (!this.env.pickFolder) throw new Error('Sem seletor de pasta aqui: informe o caminho da pasta.');
        const dir = await this.env.pickFolder('Importar artefatos de uma pasta');
        if (dir) this.router.handle({ type: 'harness.import.add', tool: msg.tool, dir });
        return;
      }
      case 'harness.item.create':
        // o arquivo novo abre no editor do board, onde a pessoa já escreve o conteúdo
        this.post({ type: 'harness.item.created', path: this.router.createHarnessItem(msg.tool, msg.source, msg.name, msg.description) });
        return;
      case 'harness.item.write':
        // o arquivo criado abre no editor do board, para a pessoa ler o que o assistente gravou
        this.post({
          type: 'harness.item.created',
          path: this.router.writeHarnessItem(msg.tool, msg.source, msg.name, msg.content, msg.files, msg.append),
        });
        return;
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
