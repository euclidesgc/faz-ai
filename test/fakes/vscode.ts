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
    fakeConfig.reset();
  },
};

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
type Scope = 'default' | 'global' | 'workspace' | 'folder';
type ConfigEvent = { affectsConfiguration(section: string): boolean };
const configListeners = new Set<(e: ConfigEvent) => void>();
/** Settings de mentira: um dicionário por escopo, com a chave completa (`fazai.appearance.language`). */
export const fakeConfig = {
  values: { default: {}, global: {}, workspace: {}, folder: {} } as Record<Scope, Record<string, unknown>>,
  /** cada `update` chamado, com a chave completa */
  updates: [] as { key: string; value: unknown; target: number }[],
  reset(): void {
    this.values = { default: {}, global: {}, workspace: {}, folder: {} };
    this.updates.length = 0;
    configListeners.clear();
  },
  /** simula uma edição no settings.json: grava no escopo e dispara onDidChangeConfiguration */
  set(scope: Scope, key: string, value: unknown): void {
    if (value === undefined) delete this.values[scope][key];
    else this.values[scope][key] = value;
    this.fire([key]);
  },
  fire(keys: string[]): void {
    const e: ConfigEvent = { affectsConfiguration: (s) => keys.some((k) => k === s || k.startsWith(`${s}.`)) };
    configListeners.forEach((fn) => fn(e));
  },
};
const effective = (full: string): unknown => {
  for (const scope of ['folder', 'workspace', 'global', 'default'] as Scope[]) {
    if (full in fakeConfig.values[scope]) return fakeConfig.values[scope][full];
  }
  return undefined;
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
  private onDispose: (() => void) | undefined;
  reveal(): void {}
  onDidDispose(fn: () => void) {
    this.onDispose = fn;
    return disposable;
  }
  /** como o editor ao fechar a aba: avisa quem registrou onDidDispose */
  dispose(): void {
    this.onDispose?.();
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
  getConfiguration(section: string) {
    const full = (k: string) => `${section}.${k}`;
    return {
      get: <T>(k: string) => effective(full(k)) as T | undefined,
      inspect: <T>(k: string) => ({
        defaultValue: fakeConfig.values.default[full(k)] as T | undefined,
        globalValue: fakeConfig.values.global[full(k)] as T | undefined,
        workspaceValue: fakeConfig.values.workspace[full(k)] as T | undefined,
        workspaceFolderValue: fakeConfig.values.folder[full(k)] as T | undefined,
      }),
      update: (k: string, value: unknown, target = 1) => {
        const scope: Scope = target === 3 ? 'folder' : target === 2 ? 'workspace' : 'global';
        fakeConfig.updates.push({ key: full(k), value, target });
        fakeConfig.set(scope, full(k), value);
        return Promise.resolve();
      },
    };
  },
  onDidChangeConfiguration(fn: (e: ConfigEvent) => void) {
    configListeners.add(fn);
    return { dispose: () => configListeners.delete(fn) };
  },
};

export const env = {
  openExternal(uri: Uri) {
    fake.opened.push(uri.toString());
    return Promise.resolve(true);
  },
};
