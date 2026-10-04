import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { fetchSource, parseSource } from '../skillInstall';
import { MAX_ATTACHMENT_BYTES } from '../attachments';
import { parseExportFile, type ImportResult } from '../db/boardExport';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import type { ViewStateStore } from '../viewState';
import type { MessageRouter } from '../panel/messageRouter';

/** O que depende de onde o board está rodando: dentro do editor ou num navegador. */
export interface HostEnv {
  /** endereço base dos arquivos de anexos, como a interface os enxerga */
  attachmentsBaseUri(): string;
  showFilters(): unknown;
  /** registra o servidor MCP do board na ferramenta de IA do projeto; o texto devolvido vira um aviso na interface */
  connectAI(): unknown;
  runAi(cardId: string): unknown;
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
  /** abre o board no navegador (só faz sentido dentro do editor) */
  openInBrowser?(): unknown;
  /** mostra o chat na barra lateral (só faz sentido dentro do editor) */
  showChat?(): unknown;
}

/** Mensagem de resultado da exportação: onde ficou, os cards com anexo sem arquivo e o aviso sobre o conteúdo. */
export function exportNotice(savedPath: string, warnings: string[]): string {
  const missing = warnings.length ? ` Anexos sem arquivo: ${warnings.join(', ')}.` : '';
  return `Board exportado em ${savedPath}.${missing} O arquivo contém conversas e anexos: guarde-o com cuidado.`;
}

/** Mensagem de resultado da importação: o board, os totais e os cards cujo anexo ficou sem arquivo. */
export function importNotice(r: ImportResult): string {
  const missing = r.warnings.length ? ` Anexos sem arquivo: ${r.warnings.join(', ')}.` : '';
  return `Board "${r.boardName}" importado: ${r.cards} card(s) e ${r.attachments} anexo(s).${missing}`;
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
    private env: HostEnv,
    private onReady?: () => void,
  ) {
    this.subs.push(router.onDidChange(() => this.postBoard()));
    this.subs.push(viewState.onDidChange((view, origin) => origin !== this && this.post({ type: 'viewState', view })));
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

  async handle(msg: WebviewToHost): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready':
          this.post({ type: 'viewState', view: this.viewState.get() });
          this.postBoard();
          this.onReady?.();
          return;
        case 'view.set':
          this.viewState.update(msg.patch, this);
          return;
        case 'ui.showFilters':
          await this.env.showFilters();
          return;
        case 'ui.connectAI': {
          const notice = await this.env.connectAI();
          if (typeof notice === 'string') this.post({ type: 'notice', message: notice });
          return;
        }
        case 'ui.showChat':
          await this.env.showChat?.();
          return;
        case 'chat.send':
        case 'chat.stop':
        case 'chat.clear':
          this.router.chatCommand(msg);
          return;
        case 'ui.openInBrowser':
          await this.env.openInBrowser?.();
          return;
        case 'ai.run':
          await this.env.runAi(msg.cardId);
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
        case 'harness.item.create':
          await this.env.openFile(this.router.createHarnessItem(msg.tool, msg.source, msg.name, msg.description));
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
          if (!a) {
            this.post({ type: 'attachment.writeResult', requestId: msg.requestId, ok: false, error: 'Anexo não encontrado' });
            return;
          }
          const file = this.router.store.pathOf(a);
          try {
            await fs.writeFile(file, msg.content, 'utf8');
            this.post({ type: 'attachment.writeResult', requestId: msg.requestId, ok: true });
          } catch (e) {
            this.post({
              type: 'attachment.writeResult',
              requestId: msg.requestId,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          return;
        }
        default:
          // mutações disparam router.onDidChange, que reenvia o board para todas as interfaces
          this.router.handle(msg);
      }
    } catch (e) {
      this.post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }
}
