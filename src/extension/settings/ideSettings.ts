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
import { DEFAULT_GIT, MERGE_METHODS, MERGE_WATCH_RANGE, WORKSPACE_MODES, type MergeMethod, type WorkspaceMode } from '../../shared/git';
import { DEFAULT_RUNNER, PARALLEL_RANGE } from '../../shared/runner';

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
  /** entra na migração única do Git/paralelo (`migrateOnce`); as de aparência ficam de fora */
  migrate?: boolean;
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

const isInteger = (value: unknown, range: { min: number; max: number }): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max;

const gitModeKey: SyncedKey<WorkspaceMode> = {
  key: 'git.mode',
  fromBoard: (board) => board.git.mode,
  toBoardPatch: (value) => ({ git: { mode: value } }),
  isValid: (value): value is WorkspaceMode => WORKSPACE_MODES.some((m) => m.value === value),
  defaultValue: DEFAULT_GIT.mode,
  migrate: true,
};

const gitBranchPatternKey: SyncedKey<string> = {
  key: 'git.branchPattern',
  fromBoard: (board) => board.git.branchPattern,
  toBoardPatch: (value) => ({ git: { branchPattern: value } }),
  isValid: (value): value is string => typeof value === 'string' && value.trim() !== '' && value.includes('{numero}'),
  defaultValue: DEFAULT_GIT.branchPattern,
  migrate: true,
};

const gitWorktreeDirKey: SyncedKey<string> = {
  key: 'git.worktreeDir',
  fromBoard: (board) => board.git.worktreeDir,
  toBoardPatch: (value) => ({ git: { worktreeDir: value } }),
  isValid: (value): value is string => typeof value === 'string' && value.trim() !== '',
  defaultValue: DEFAULT_GIT.worktreeDir,
  migrate: true,
};

const gitParallelKey: SyncedKey<boolean> = {
  key: 'git.parallel',
  fromBoard: (board) => board.runner.parallel,
  toBoardPatch: (value) => ({ runner: { parallel: value } }),
  isValid: (value): value is boolean => typeof value === 'boolean',
  defaultValue: DEFAULT_RUNNER.parallel,
  migrate: true,
};

const gitParallelStoriesKey: SyncedKey<number> = {
  key: 'git.parallelStories',
  fromBoard: (board) => board.runner.parallelStories,
  toBoardPatch: (value) => ({ runner: { parallelStories: value } }),
  isValid: (value): value is number => isInteger(value, PARALLEL_RANGE),
  defaultValue: DEFAULT_RUNNER.parallelStories,
  migrate: true,
};

const gitAutoMergeKey: SyncedKey<boolean> = {
  key: 'git.autoMerge',
  fromBoard: (board) => board.git.autoMerge,
  toBoardPatch: (value) => ({ git: { autoMerge: value } }),
  isValid: (value): value is boolean => typeof value === 'boolean',
  defaultValue: DEFAULT_GIT.autoMerge,
  migrate: true,
};

const gitMergeMethodKey: SyncedKey<MergeMethod> = {
  key: 'git.mergeMethod',
  fromBoard: (board) => board.git.mergeMethod,
  toBoardPatch: (value) => ({ git: { mergeMethod: value } }),
  isValid: (value): value is MergeMethod => MERGE_METHODS.some((m) => m.value === value),
  defaultValue: DEFAULT_GIT.mergeMethod,
  migrate: true,
};

const gitWatchMergesKey: SyncedKey<boolean> = {
  key: 'git.watchMerges',
  fromBoard: (board) => board.git.watchMerges,
  toBoardPatch: (value) => ({ git: { watchMerges: value } }),
  isValid: (value): value is boolean => typeof value === 'boolean',
  defaultValue: DEFAULT_GIT.watchMerges,
  migrate: true,
};

const gitWatchMergeMinutesKey: SyncedKey<number> = {
  key: 'git.watchMergeMinutes',
  fromBoard: (board) => board.git.watchMergeMinutes,
  toBoardPatch: (value) => ({ git: { watchMergeMinutes: value } }),
  isValid: (value): value is number => isInteger(value, MERGE_WATCH_RANGE),
  defaultValue: DEFAULT_GIT.watchMergeMinutes,
  migrate: true,
};

/** As nove chaves de Git/paralelo: as únicas que passam pela migração única. */
export const GIT_KEYS: SyncedKey<unknown>[] = [
  gitModeKey,
  gitBranchPatternKey,
  gitWorktreeDirKey,
  gitParallelKey,
  gitParallelStoriesKey,
  gitAutoMergeKey,
  gitMergeMethodKey,
  gitWatchMergesKey,
  gitWatchMergeMinutesKey,
] as SyncedKey<unknown>[];

/** Chaves ligadas ao board: idioma, tema, fonte, tamanho da fonte e as nove de Git/paralelo. */
export const SYNCED_KEYS: SyncedKey<unknown>[] = [languageKey, themeKey, fontKey, fontSizeKey, ...GIT_KEYS] as SyncedKey<unknown>[];

/** Marca em `meta`, por banco: a migração do Git/paralelo para o Settings já rodou. */
export const GIT_SETTINGS_MIGRATED = 'git_settings_migrated';

export interface ConfigurationLike {
  get<T>(key: string): T | undefined;
  inspect<T>(key: string): { defaultValue?: T; globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined;
  update(key: string, value: unknown, target?: number): Thenable<void>;
}

/** Fatia de `vscode.workspace` que a camada usa; injetada no construtor para os testes. */
export interface IdeSettingsApi {
  /** pastas abertas; com mais de uma, a migração grava o ajuste do projeto na pasta (`WorkspaceFolder`) */
  readonly workspaceFolders?: readonly unknown[];
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
  /** marca única por banco (tabela `meta`) */
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
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
    // A reconciliação só lê o Settings depois que as gravações da migração pousaram: no editor,
    // `update` só reflete em `get`/`inspect` quando a promise resolve. O `watch` já pode ser ligado,
    // porque o eco das gravações é filtrado por `lastWritten`; o `onDidChange` do board só depois da
    // reconciliação, senão a notificação de um `copyToBoard` regravaria no Settings as chaves ainda
    // não reconciliadas (o SQLite venceria um valor explícito do Settings).
    const watcher = this.watch((keys) => {
      for (const synced of SYNCED_KEYS.filter((k) => keys.includes(k.key))) {
        const value = this.readValid(synced);
        if (value === INVALID || Object.is(value, this.lastWritten.get(synced.key))) continue;
        this.copyToBoard(router, synced, value);
      }
    });
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void this.migrateOnce(router).then(() => {
      if (disposed) return;
      this.reconcileOnOpen(router);
      unsubscribe = router.onDidChange(() => {
        for (const synced of SYNCED_KEYS) {
          const value = synced.fromBoard(router.snapshot().board);
          if (Object.is(value, this.lastWritten.get(synced.key))) continue;
          this.copyToSettings(synced, value);
        }
      });
    });
    return {
      dispose: () => {
        disposed = true;
        watcher.dispose();
        unsubscribe?.();
      },
    };
  }

  /**
   * Migração única do Git/paralelo (antes só no SQLite) para o Settings, por banco. Para cada chave:
   * projeto já tem valor no Workspace ou na pasta → nada (a reconciliação leva esse valor ao board);
   * Usuário vazio e board fora do default → o board vira o padrão do Usuário;
   * Usuário com valor válido diferente do board, e board fora do default → o board vai para o projeto
   * (`WorkspaceFolder` em multi-root, senão `Workspace`), para o projeto manter o comportamento que tinha.
   * A marca é gravada mesmo se alguma gravação falhar: a falha vai para o log e não repete a cada abertura.
   * Resolve quando todas as gravações terminaram.
   */
  private async migrateOnce(router: BoardLink): Promise<void> {
    if (router.getMeta(GIT_SETTINGS_MIGRATED)) return;
    const multiRoot = (this.api.workspaceFolders?.length ?? 0) > 1;
    const projectTarget = multiRoot ? ConfigurationTarget.WorkspaceFolder : ConfigurationTarget.Workspace;
    const writes: Promise<void>[] = [];
    for (const synced of GIT_KEYS) {
      const info = this.api.getConfiguration(SECTION, this.folderUri).inspect(synced.key);
      if (info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined) continue;
      const inBoard = synced.fromBoard(router.snapshot().board);
      const inUser = info?.globalValue;
      if (Object.is(inBoard, synced.defaultValue)) continue;
      if (inUser === undefined) writes.push(this.writeRemembering(synced, inBoard, ConfigurationTarget.Global));
      else if (synced.isValid(inUser) && !Object.is(inUser, inBoard)) writes.push(this.writeRemembering(synced, inBoard, projectTarget));
    }
    router.setMeta(GIT_SETTINGS_MIGRATED, '1');
    await Promise.all(writes);
  }

  /** Grava no Settings lembrando o valor, para o eco do `onDidChangeConfiguration` não regravar o SQLite. */
  private writeRemembering(synced: SyncedKey<unknown>, value: unknown, target: number): Promise<void> {
    this.lastWritten.set(synced.key, value);
    return this.write(synced.key, value, target);
  }

  /**
   * Na abertura: Settings com valor explícito que difere do SQLite manda no SQLite; Settings sem valor
   * explícito e SQLite diferente do default manda no Settings (um board com `en` não é zerado).
   * As chaves que a migração acabou de gravar (já em `lastWritten`) ficam de fora: Settings e SQLite já batem.
   */
  private reconcileOnOpen(router: BoardLink): void {
    for (const synced of SYNCED_KEYS) {
      if (this.lastWritten.has(synced.key)) continue;
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

  /**
   * Grava no Settings só se o valor efetivo é outro, no escopo em que a chave já tem valor explícito para
   * o projeto (pasta > workspace > Usuário); lembra o que gravou para ignorar o eco.
   */
  private copyToSettings(synced: SyncedKey<unknown>, value: unknown): void {
    if (Object.is(value, this.read(synced.key))) return;
    this.writeRemembering(synced, value, this.targetFor(synced.key));
  }

  /** Escopo que recebe uma gravação vinda do SQLite: o mais específico em que a chave já tem valor. */
  private targetFor(key: string): number {
    const info = this.api.getConfiguration(SECTION, this.folderUri).inspect(key);
    if (info?.workspaceFolderValue !== undefined) return ConfigurationTarget.WorkspaceFolder;
    if (info?.workspaceValue !== undefined) return ConfigurationTarget.Workspace;
    return ConfigurationTarget.Global;
  }
}
