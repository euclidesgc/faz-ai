/**
 * Editor de mentira para os testes: só o que a extensão usa da API do VS Code, guardando o que foi
 * registrado e mostrado para o teste conferir.
 */
import * as path from 'node:path';

type Handler = (...args: unknown[]) => unknown;

export const fake = {
  commands: new Map<string, Handler>(),
  messages: [] as { kind: 'info' | 'warn' | 'error'; text: string }[],
  /** resposta dada ao próximo aviso com botões */
  answer: undefined as string | undefined,
  opened: [] as string[],
  panels: [] as FakePanel[],
  folder: undefined as string | undefined,
  reset(): void {
    this.commands.clear();
    this.messages.length = 0;
    this.opened.length = 0;
    this.panels.length = 0;
    this.answer = undefined;
    this.folder = undefined;
  },
};

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
    private readonly raw: string,
  ) {}
  static file(p: string): Uri {
    return new Uri('file', p, `file://${p}`);
  }
  static parse(value: string): Uri {
    return new Uri(value.split(':')[0] ?? '', value, value);
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return Uri.file(path.join(base.fsPath, ...parts));
  }
  toString(): string {
    return this.raw;
  }
}

export class EventEmitter<T> {
  private listeners = new Set<(e: T) => void>();
  event = (fn: (e: T) => void) => {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  };
  fire(e: T): void {
    this.listeners.forEach((fn) => fn(e));
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class TreeItem {
  constructor(
    public label: string,
    public collapsibleState?: number,
  ) {}
}
export class ThemeIcon {
  constructor(public id: string) {}
}
export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string,
  ) {}
}
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ViewColumn = { One: 1, Beside: -2 };

const disposable = { dispose() {} };

class FakeWebview {
  html = '';
  options: unknown;
  cspSource = 'vscode-webview:';
  posted: unknown[] = [];
  private listener: ((msg: unknown) => void) | undefined;
  asWebviewUri(uri: Uri): Uri {
    return Uri.parse(`vscode-webview://${uri.fsPath}`);
  }
  postMessage(msg: unknown): Promise<boolean> {
    this.posted.push(msg);
    return Promise.resolve(true);
  }
  onDidReceiveMessage(fn: (msg: unknown) => void) {
    this.listener = fn;
    return disposable;
  }
  /** simula uma mensagem enviada pela interface */
  receive(msg: unknown): void {
    this.listener?.(msg);
  }
}

export class FakePanel {
  webview = new FakeWebview();
  iconPath: unknown;
  constructor(public title: string) {}
  reveal(): void {}
  onDidDispose() {
    return disposable;
  }
}

const show = (kind: 'info' | 'warn' | 'error') => (text: string) => {
  fake.messages.push({ kind, text });
  const answer = fake.answer;
  fake.answer = undefined;
  return Promise.resolve(answer);
};

export const window = {
  createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
  createStatusBarItem: () => ({ text: '', tooltip: '', command: '', show() {}, hide() {}, dispose() {} }),
  createTreeView: () => ({ badge: undefined as unknown, onDidChangeVisibility: () => disposable, dispose() {} }),
  registerWebviewViewProvider: () => disposable,
  createWebviewPanel: (_type: string, title: string) => {
    const panel = new FakePanel(title);
    fake.panels.push(panel);
    return panel;
  },
  showInformationMessage: show('info'),
  showWarningMessage: show('warn'),
  showErrorMessage: show('error'),
  showOpenDialog: () => Promise.resolve(undefined),
};

export const commands = {
  registerCommand(id: string, handler: Handler) {
    fake.commands.set(id, handler);
    return disposable;
  },
  executeCommand(id: string, ...args: unknown[]) {
    const handler = fake.commands.get(id);
    return Promise.resolve(handler ? handler(...args) : undefined);
  },
};

export const workspace = {
  get workspaceFolders() {
    return fake.folder ? [{ uri: Uri.file(fake.folder), name: path.basename(fake.folder), index: 0 }] : undefined;
  },
  createFileSystemWatcher: () => ({
    onDidCreate: () => disposable,
    onDidChange: () => disposable,
    onDidDelete: () => disposable,
    dispose() {},
  }),
};

export const env = {
  openExternal(uri: Uri) {
    fake.opened.push(uri.toString());
    return Promise.resolve(true);
  },
};
