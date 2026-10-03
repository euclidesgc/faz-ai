import * as vscode from 'vscode';
import type { MessageRouter } from '../panel/messageRouter';
import { WebviewBridge, webviewHtml, webviewOptions } from '../panel/webviewBridge';
import type { ViewStateStore } from '../viewState';

/** Seção "Chat" da barra lateral: o mesmo bundle do board, renderizando só a conversa com a IA. */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private context: vscode.ExtensionContext,
    private getRouter: () => Promise<MessageRouter | undefined>,
    private viewState: ViewStateStore,
  ) {}

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    const router = await this.getRouter();
    if (!router) {
      view.webview.html = '<p style="padding:12px;opacity:.7">Abra uma pasta para conversar com a IA sobre o board.</p>';
      return;
    }
    view.webview.options = webviewOptions(this.context, router);
    const bridge = new WebviewBridge(view.webview, router, this.viewState);
    view.webview.html = webviewHtml(this.context, view.webview, 'chat');
    view.onDidDispose(() => bridge.dispose());
  }
}
