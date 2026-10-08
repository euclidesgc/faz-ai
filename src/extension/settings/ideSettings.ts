/**
 * Configurações do Faz AI no Settings do editor (`fazai.*`).
 *
 * Quem manda: dentro do editor, o Settings é a fonte e o SQLite do board é a cópia; fora do editor
 * (modo navegador e servidor MCP) o SQLite é a única fonte. Esta camada mantém os dois iguais:
 * Settings → SQLite pelo `onDidChangeConfiguration`, SQLite → Settings pelo `onDidChange` do board
 * (alguém gravou pelo MCP ou pelo navegador com o editor aberto). Toda gravação compara antes e
 * guarda o último valor escrito, para o eco de uma gravação não virar outra gravação.
 * Dois editores no mesmo board (VS Code e Cursor): cada um tem o seu Settings; o último que grava
 * vence e o outro recebe pelo SQLite. `boardRepo`, `webServer` e o bridge MCP não importam `vscode`.
 */

import type { BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import { DEFAULT_APPEARANCE, FONT_SIZE_RANGE, FONTS, THEMES, type TextFont, type ThemeMode } from '../../shared/appearance';
import { LANGUAGES, type Language } from '../../shared/language';

export const SECTION = 'fazai';

type Board = BoardState['board'];
type BoardPatch = Extract<WebviewToHost, { type: 'settings.board.update' }>['patch'];

/** Chave `fazai.*` ligada ao board e onde ela mora no SQLite. */
export interface SyncedKey<T> {
  /** chave sem o prefixo: `appearance.language` */
  key: string;
  /** valor que está no SQLite */
  fromBoard(board: Board): T;
  /** patch de `settings.board.update` que grava o valor no SQLite */
  toBoardPatch(value: T): BoardPatch;
  /** aceita só os valores do enum */
  isValid(value: unknown): value is T;
  /** o mesmo default declarado no `package.json` */
  defaultValue: T;
}

const languageKey: SyncedKey<Language> = {
  key: 'appearance.language',
  fromBoard: (board) => board.appearance.language,
  toBoardPatch: (value) => ({ appearance: { language: value } }),
  isValid: (value): value is Language => LANGUAGES.includes(value as Language),
  defaultValue: DEFAULT_APPEARANCE.language,
};

const themeKey: SyncedKey<ThemeMode> = {
  key: 'appearance.theme',
  fromBoard: (board) => board.appearance.theme,
  toBoardPatch: (value) => ({ appearance: { theme: value } }),
  isValid: (value): value is ThemeMode => THEMES.some((t) => t.value === value),
  defaultValue: DEFAULT_APPEARANCE.theme,
};

const fontKey: SyncedKey<TextFont> = {
  key: 'appearance.font',
  fromBoard: (board) => board.appearance.font,
  toBoardPatch: (value) => ({ appearance: { font: value } }),
  isValid: (value): value is TextFont => FONTS.some((f) => f.value === value),
  defaultValue: DEFAULT_APPEARANCE.font,
};

const fontSizeKey: SyncedKey<number> = {
  key: 'appearance.fontSize',
  fromBoard: (board) => board.appearance.fontSize,
  toBoardPatch: (value) => ({ appearance: { fontSize: value } }),
  isValid: (value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= FONT_SIZE_RANGE.min && value <= FONT_SIZE_RANGE.max,
  defaultValue: DEFAULT_APPEARANCE.fontSize,
};

/** Chaves ligadas ao board nesta versão: idioma, tema, fonte e tamanho da fonte. */
export const SYNCED_KEYS: SyncedKey<unknown>[] = [languageKey, themeKey, fontKey, fontSizeKey] as SyncedKey<unknown>[];

export interface ConfigurationLike {
  get<T>(key: string): T | undefined;
  inspect<T>(key: string): { defaultValue?: T; globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined;
  update(key: string, value: unknown, target?: number): Thenable<void>;
}

/** Fatia de `vscode.workspace` que a camada usa; injetada no construtor para os testes. */
export interface IdeSettingsApi {
  getConfiguration(section: string, scope?: unknown): ConfigurationLike;
  onDidChangeConfiguration(fn: (e: { affectsConfiguration(section: string, scope?: unknown): boolean }) => void): {
    dispose(): void;
  };
}

/** Espelha o enum `vscode.ConfigurationTarget` sem importar `vscode`. */
const INVALID = Symbol('invalid');

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;

/** O que a camada precisa do `MessageRouter`: as mesmas mensagens que a webview usa. */
export interface BoardLink {
  snapshot(): BoardState;
  handle(msg: WebviewToHost): unknown;
  onDidChange(fn: () => void): () => void;
}

export class IdeSettings {
  /** Último valor que esta camada gravou, por chave: o eco dessa gravação não vira outra gravação. */
  private readonly lastWritten = new Map<string, unknown>();

  constructor(
    private readonly api: IdeSettingsApi,
    private readonly folderUri?: unknown,
    private readonly log: (line: string) => void = () => {},
  ) {}

  /** Valor efetivo: pasta > workspace > usuário > default. */
  read<T>(key: string): T | undefined {
    return this.api.getConfiguration(SECTION, this.folderUri).get<T>(key);
  }

  /** Há valor gravado pela pessoa em algum escopo (Usuário, Workspace ou pasta), além do default? */
  hasExplicitValue(key: string): boolean {
    const info = this.api.getConfiguration(SECTION, this.folderUri).inspect(key);
    return info?.globalValue !== undefined || info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined;
  }

  /** Grava no escopo pedido (padrão: Usuário). Falha vai para o log, nunca para quem chamou. */
  async write(key: string, value: unknown, target: number = ConfigurationTarget.Global): Promise<void> {
    try {
      await this.api.getConfiguration(SECTION, this.folderUri).update(key, value, target);
    } catch (err) {
      this.log(`Faz AI: não foi possível gravar ${SECTION}.${key} no Settings: ${String(err)}`);
    }
  }

  /** Chama `fn` com as chaves de `SYNCED_KEYS` afetadas por uma mudança em `fazai.*`. */
  watch(fn: (changedKeys: string[]) => void): { dispose(): void } {
    return this.api.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(SECTION, this.folderUri)) return;
      fn(SYNCED_KEYS.filter((k) => e.affectsConfiguration(`${SECTION}.${k.key}`, this.folderUri)).map((k) => k.key));
    });
  }

  /** Liga a camada ao board: Settings → SQLite pelo `watch` e SQLite → Settings pelo `onDidChange`. */
  bind(router: BoardLink): { dispose(): void } {
    this.reconcileOnOpen(router);
    const watcher = this.watch((keys) => {
      for (const synced of SYNCED_KEYS.filter((k) => keys.includes(k.key))) {
        const value = this.readValid(synced);
        if (value === INVALID || Object.is(value, this.lastWritten.get(synced.key))) continue;
        this.copyToBoard(router, synced, value);
      }
    });
    const unsubscribe = router.onDidChange(() => {
      for (const synced of SYNCED_KEYS) {
        const value = synced.fromBoard(router.snapshot().board);
        if (Object.is(value, this.lastWritten.get(synced.key))) continue;
        this.copyToSettings(synced, value);
      }
    });
    return {
      dispose: () => {
        watcher.dispose();
        unsubscribe();
      },
    };
  }

  /**
   * Na abertura: Settings com valor explícito que difere do SQLite manda no SQLite; Settings sem valor
   * explícito e SQLite diferente do default manda no Settings (um board com `en` não é zerado).
   */
  private reconcileOnOpen(router: BoardLink): void {
    for (const synced of SYNCED_KEYS) {
      const inBoard = synced.fromBoard(router.snapshot().board);
      const inSettings = this.readValid(synced);
      if (inSettings === INVALID || Object.is(inBoard, inSettings)) continue;
      if (this.hasExplicitValue(synced.key)) this.copyToBoard(router, synced, inSettings);
      else if (!Object.is(inBoard, synced.defaultValue)) this.copyToSettings(synced, inBoard);
    }
  }

  /** Valor efetivo da chave, ou `INVALID` (com uma linha no log) quando está fora do enum. */
  private readValid(synced: SyncedKey<unknown>): unknown {
    const value = this.read(synced.key);
    if (synced.isValid(value)) return value;
    this.log(`Faz AI: valor inválido em ${SECTION}.${synced.key} no Settings, ignorado: ${JSON.stringify(value)}`);
    return INVALID;
  }

  /** Grava no SQLite só se o board tem outro valor; lembra o que gravou para ignorar o eco. */
  private copyToBoard(router: BoardLink, synced: SyncedKey<unknown>, value: unknown): void {
    if (Object.is(value, synced.fromBoard(router.snapshot().board))) return;
    this.lastWritten.set(synced.key, value);
    router.handle({ type: 'settings.board.update', patch: synced.toBoardPatch(value) });
  }

  /** Grava no Settings (Usuário) só se o valor efetivo é outro; lembra o que gravou para ignorar o eco. */
  private copyToSettings(synced: SyncedKey<unknown>, value: unknown): void {
    if (Object.is(value, this.read(synced.key))) return;
    this.lastWritten.set(synced.key, value);
    void this.write(synced.key, value, ConfigurationTarget.Global);
  }
}
