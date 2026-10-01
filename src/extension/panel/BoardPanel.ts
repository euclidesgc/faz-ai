import * as vscode from 'vscode';
import type { ViewStateStore } from '../viewState';
import type { MessageRouter } from './messageRouter';
import { WebviewBridge, webviewHtml, webviewOptions } from './webviewBridge';

export class BoardPanel {
  private static current: BoardPanel | undefined;

  /** Abre (ou revela) o board. Se `cardId` vier, abre o detalhe daquele card. */
  static show(context: vscode.ExtensionContext, router: MessageRouter, viewState: ViewStateStore, folderName: string, cardId?: string): void {
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal(vscode.ViewColumn.One);
      if (cardId) BoardPanel.current.bridge.post({ type: 'ui.openCard', cardId });
      return;
    }
    const panel = vscode.window.createWebviewPanel('fazai.board', `Board: ${folderName}`, vscode.ViewColumn.One, {
      ...webviewOptions(context, router),
      retainContextWhenHidden: true,
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'kanban.svg');
    BoardPanel.current = new BoardPanel(panel, context, router, viewState, cardId);
  }

  private bridge: WebviewBridge;

  private constructor(
    private panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    router: MessageRouter,
    viewState: ViewStateStore,
    pendingCardId: string | undefined,
  ) {
    this.bridge = new WebviewBridge(panel.webview, router, viewState, () => {
      if (pendingCardId) this.bridge.post({ type: 'ui.openCard', cardId: pendingCardId });
      pendingCardId = undefined;
    });
    panel.webview.html = webviewHtml(context, panel.webview, 'board');
    panel.onDidDispose(() => {
      BoardPanel.current = undefined;
      this.bridge.dispose();
    });
  }
}
