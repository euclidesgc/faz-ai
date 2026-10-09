import * as vscode from 'vscode';
import type { ViewStateStore } from '../viewState';
import type { MessageRouter } from './messageRouter';
import type { HostToWebview } from '../../shared/messages';
import { WebviewBridge, webviewHtml, webviewOptions } from './webviewBridge';

export class BoardPanel {
  private static current: BoardPanel | undefined;

  /**
   * Abre (ou revela) o board. Se `pending` vier (abrir um card, uma aba das configurações, uma
   * tela), é entregue à interface: na hora, se o painel já existe, ou no `ready` do painel novo.
   */
  static show(
    context: vscode.ExtensionContext,
    router: MessageRouter,
    viewState: ViewStateStore,
    folderName: string,
    pending?: HostToWebview,
  ): void {
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal(vscode.ViewColumn.One);
      if (pending) BoardPanel.current.bridge.post(pending);
      return;
    }
    const panel = vscode.window.createWebviewPanel('fazai.board', `Board: ${folderName}`, vscode.ViewColumn.One, {
      ...webviewOptions(context, router),
      retainContextWhenHidden: true,
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'kanban.svg');
    BoardPanel.current = new BoardPanel(panel, context, router, viewState, pending);
  }

  /** Posta uma mensagem no painel aberto; sem painel, não faz nada. */
  static post(msg: HostToWebview): void {
    BoardPanel.current?.bridge.post(msg);
  }

  private bridge: WebviewBridge;

  private constructor(
    private panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    router: MessageRouter,
    viewState: ViewStateStore,
    pending: HostToWebview | undefined,
  ) {
    this.bridge = new WebviewBridge(panel.webview, router, viewState, () => {
      if (pending) this.bridge.post(pending);
      pending = undefined;
    });
    panel.webview.html = webviewHtml(context, panel.webview, 'board');
    panel.onDidDispose(() => {
      BoardPanel.current = undefined;
      this.bridge.dispose();
    });
  }
}
