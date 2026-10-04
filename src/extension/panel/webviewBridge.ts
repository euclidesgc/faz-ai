import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { HostToWebview, WebviewToHost } from '../../shared/messages';
import { HostBridge, type HostEnv } from '../host/hostBridge';
import type { ViewStateStore } from '../viewState';
import type { MessageRouter } from './messageRouter';

export type WebviewKind = 'board' | 'filters' | 'chat';

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
<div id="root" data-view="${kind}" data-host="vscode"></div>
<script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
}

/** O que o board pede ao editor quando roda num webview do VS Code. */
function vscodeEnv(webview: vscode.Webview, router: MessageRouter): HostEnv {
  const open = (file: string) => vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file), vscode.ViewColumn.Beside);
  return {
    attachmentsBaseUri: () => webview.asWebviewUri(vscode.Uri.file(router.store.baseDir)).toString(),
    showFilters: () => vscode.commands.executeCommand('fazai.filters.focus'),
    showChat: () => vscode.commands.executeCommand('fazai.chat.focus'),
    connectAI: () => vscode.commands.executeCommand('fazai.connectAI'),
    openInBrowser: () => vscode.commands.executeCommand('fazai.openInBrowser'),
    runAi: (cardId) => vscode.commands.executeCommand('fazai.ai.run', cardId),
    stopAi: (cardId) => vscode.commands.executeCommand('fazai.ai.stop', cardId),
    pauseAutopilot: () => vscode.commands.executeCommand('fazai.autopilot.pause'),
    resumeAutopilot: () => vscode.commands.executeCommand('fazai.autopilot.resume'),
    runHeartbeat: () => vscode.commands.executeCommand('fazai.heartbeat.runNow'),
    openFolder: (dir) => vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir), { forceNewWindow: true }),
    openFile: async (file) => void (await open(file)),
    openExternal: async (file) => void (await vscode.env.openExternal(vscode.Uri.file(file))),
    revealFile: (file) => vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file)),
    pickFiles: async () =>
      (await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Anexar', title: 'Anexar arquivos ao card' }))?.map(
        (u) => u.fsPath,
      ),
    saveFileAs: async (sourcePath, suggestedName) => {
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), suggestedName)),
        title: 'Salvar anexo como',
      });
      if (!uri) return;
      await fs.copyFile(sourcePath, uri.fsPath);
    },
  };
}

/** Liga um webview do editor (board ou filtros) ao roteador e ao estado de visualização. */
export class WebviewBridge implements vscode.Disposable {
  private bridge: HostBridge;
  private disposables: vscode.Disposable[] = [];

  constructor(webview: vscode.Webview, router: MessageRouter, viewState: ViewStateStore, onReady?: () => void) {
    this.bridge = new HostBridge((msg) => void webview.postMessage(msg), router, viewState, vscodeEnv(webview, router), onReady);
    webview.onDidReceiveMessage((msg: WebviewToHost) => void this.bridge.handle(msg), null, this.disposables);
  }

  post(msg: HostToWebview): void {
    this.bridge.post(msg);
  }

  dispose(): void {
    this.bridge.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
