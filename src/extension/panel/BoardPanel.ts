import * as vscode from 'vscode';
import type { BoardState } from '../../shared/model';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import type { MessageRouter } from './messageRouter';

export class BoardPanel {
  private static current: BoardPanel | undefined;

  /** Abre (ou revela) o board. Se `cardId` vier, abre o detalhe daquele card. */
  static show(context: vscode.ExtensionContext, router: MessageRouter, folderName: string, cardId?: string): void {
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal(vscode.ViewColumn.One);
      if (cardId) BoardPanel.current.post({ type: 'ui.openCard', cardId });
      return;
    }
    const panel = vscode.window.createWebviewPanel('fazai.board', `Board: ${folderName}`, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'), vscode.Uri.file(router.store.baseDir)],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'kanban.svg');
    BoardPanel.current = new BoardPanel(panel, context, router, cardId);
  }

  private disposables: vscode.Disposable[] = [];

  private constructor(
    private panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private router: MessageRouter,
    private pendingCardId: string | undefined,
  ) {
    panel.webview.html = this.html(context);
    panel.webview.onDidReceiveMessage((msg: WebviewToHost) => void this.handle(msg), null, this.disposables);
    panel.onDidDispose(() => {
      BoardPanel.current = undefined;
      this.disposables.forEach((d) => d.dispose());
    }, null, this.disposables);
  }

  private post(msg: HostToWebview): void {
    void this.panel.webview.postMessage(msg);
  }

  private postState(state: BoardState): void {
    const attachmentsBaseUri = this.panel.webview.asWebviewUri(vscode.Uri.file(this.router.store.baseDir)).toString();
    this.post({ type: 'boardState', state, attachmentsBaseUri });
  }

  private async handle(msg: WebviewToHost): Promise<void> {
    try {
      switch (msg.type) {
        case 'attachment.pick': {
          const uris = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Anexar', title: 'Anexar arquivos ao card' });
          if (uris?.length) this.postState(this.router.addAttachmentFiles(msg.cardId, uris.map((u) => u.fsPath)));
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
          this.postState(this.router.handle(msg));
          if (msg.type === 'ready' && this.pendingCardId) {
            this.post({ type: 'ui.openCard', cardId: this.pendingCardId });
            this.pendingCardId = undefined;
          }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: 'error', message });
    }
  }

  private html(context: vscode.ExtensionContext): string {
    const w = this.panel.webview;
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
<title>Faz AI Board</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
  }
}
