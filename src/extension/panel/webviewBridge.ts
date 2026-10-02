import * as vscode from 'vscode';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import type { ViewStateStore } from '../viewState';
import type { MessageRouter } from './messageRouter';

export type WebviewKind = 'board' | 'filters';

export function webviewOptions(context: vscode.ExtensionContext, router: MessageRouter): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'), vscode.Uri.file(router.store.baseDir)],
  };
}

export function webviewHtml(context: vscode.ExtensionContext, w: vscode.Webview, kind: WebviewKind): string {
  const base = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
  const script = w.asWebviewUri(vscode.Uri.joinPath(base, 'main.js'));
  const style = w.asWebviewUri(vscode.Uri.joinPath(base, 'index.css'));
  const nonce = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${w.cspSource} https: data:; font-src ${w.cspSource};" />
<link rel="stylesheet" href="${style}" />
<title>Faz AI</title>
</head>
<body>
<div id="root" data-view="${kind}"></div>
<script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
}

/**
 * Liga um webview (board ou filtros) ao roteador e ao estado de visualização:
 * recebe mensagens, e reenvia o board e os filtros sempre que mudam, venha a mudança de onde vier.
 */
export class WebviewBridge implements vscode.Disposable {
  private subs: (() => void)[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor(
    private webview: vscode.Webview,
    private router: MessageRouter,
    private viewState: ViewStateStore,
    private onReady?: () => void,
  ) {
    webview.onDidReceiveMessage((msg: WebviewToHost) => void this.handle(msg), null, this.disposables);
    this.subs.push(router.onDidChange(() => this.postBoard()));
    this.subs.push(viewState.onDidChange((view, origin) => origin !== this && this.post({ type: 'viewState', view })));
  }

  post(msg: HostToWebview): void {
    void this.webview.postMessage(msg);
  }

  dispose(): void {
    this.subs.forEach((off) => off());
    this.disposables.forEach((d) => d.dispose());
  }

  private postBoard(): void {
    const attachmentsBaseUri = this.webview.asWebviewUri(vscode.Uri.file(this.router.store.baseDir)).toString();
    this.post({ type: 'boardState', state: this.router.snapshot(), attachmentsBaseUri });
  }

  private async handle(msg: WebviewToHost): Promise<void> {
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
          await vscode.commands.executeCommand('fazai.filters.focus');
          return;
        case 'ui.connectAI':
          await vscode.commands.executeCommand('fazai.connectAI');
          return;
        case 'ai.run':
          await vscode.commands.executeCommand('fazai.ai.run', msg.cardId);
          return;
        case 'ai.stop':
          await vscode.commands.executeCommand('fazai.ai.stop', msg.cardId);
          return;
        case 'ai.heartbeat.run':
          await vscode.commands.executeCommand('fazai.heartbeat.runNow');
          return;
        case 'attachment.pick': {
          const uris = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Anexar', title: 'Anexar arquivos ao card' });
          if (uris?.length) this.router.addAttachmentFiles(msg.cardId, uris.map((u) => u.fsPath));
          return;
        }
        case 'attachment.open':
        case 'attachment.reveal': {
          const a = this.router.getAttachment(msg.attachmentId);
          if (!a) throw new Error('Anexo não encontrado');
          const uri = vscode.Uri.file(this.router.store.pathOf(a));
          if (msg.type === 'attachment.reveal') await vscode.commands.executeCommand('revealFileInOS', uri);
          else if (/^(text\/|application\/json)/.test(a.mime)) await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Beside);
          else await vscode.env.openExternal(uri);
          return;
        }
        default:
          // mutações disparam router.onDidChange, que reenvia o board para todos os webviews
          this.router.handle(msg);
      }
    } catch (e) {
      this.post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }
}
