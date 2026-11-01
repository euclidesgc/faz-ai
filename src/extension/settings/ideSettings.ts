/**
 * Importação única do Settings do editor para o board. As chaves `fazai.*` de Aparência, Git e
 * paralelo já foram editadas lá (`contributes.configuration`); hoje o board é o único lugar de edição.
 * Na primeira abertura de cada banco, os valores que a pessoa gravou no Settings são levados ao board
 * pelas mesmas mensagens da webview e uma marca em `meta` impede nova importação. Nunca grava no
 * Settings: os valores antigos ficam lá, sem efeito. `boardRepo`, `webServer` e o bridge MCP não
 * importam `vscode`.
 */

import type { BoardState } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import { FONT_SIZE_RANGE, FONTS, THEMES, type TextFont, type ThemeMode } from '../../shared/appearance';
import { LANGUAGES, type Language } from '../../shared/language';
import { MERGE_METHODS, WORKSPACE_MODES, cleanDecisionDir, type MergeMethod, type WorkspaceMode } from '../../shared/git';
import { PARALLEL_RANGE, SUBTASK_PARALLEL_RANGE } from '../../shared/runner';

export const SECTION = 'fazai';

/** Marca em `meta`, por banco: a importação do Settings do editor já rodou. */
export const IDE_SETTINGS_IMPORTED = 'ide_settings_imported';

type Board = BoardState['board'];
type BoardPatch = Extract<WebviewToHost, { type: 'settings.board.update' }>['patch'];

/** Chave `fazai.*` que existiu no Settings e onde ela mora no SQLite. */
interface LegacyKey<T = unknown> {
  /** chave sem o prefixo: `appearance.language` */
  key: string;
  /** valor que está no SQLite */
  fromBoard(board: Board): T;
  /** patch de `settings.board.update` que grava o valor no SQLite */
  toBoardPatch(value: T): BoardPatch;
  /** aceita só os valores válidos */
  isValid(value: unknown): value is T;
  /** a Aparência era `application`: só vale o valor do Usuário, nunca o do Workspace ou da pasta */
  userOnly?: boolean;
}

const isInteger = (value: unknown, range: { min: number; max: number }): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max;
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isString = (value: unknown): value is string => typeof value === 'string';

const legacy = <T>(k: LegacyKey<T>): LegacyKey => k as LegacyKey;

/**
 * As 19 chaves: 4 de Aparência, 13 de Git (com o gitflow) e 2 do paralelo. As de texto do gitflow
 * aceitam qualquer string: o vazio chega ao board e o `parseGit` o troca pelo padrão.
 */
export const LEGACY_KEYS: LegacyKey[] = [
  legacy<Language>({
    key: 'appearance.language',
    fromBoard: (board) => board.appearance.language,
    toBoardPatch: (value) => ({ appearance: { language: value } }),
    isValid: (value): value is Language => LANGUAGES.includes(value as Language),
    userOnly: true,
  }),
  legacy<ThemeMode>({
    key: 'appearance.theme',
    fromBoard: (board) => board.appearance.theme,
    toBoardPatch: (value) => ({ appearance: { theme: value } }),
    isValid: (value): value is ThemeMode => THEMES.some((t) => t.value === value),
    userOnly: true,
  }),
  legacy<TextFont>({
    key: 'appearance.font',
    fromBoard: (board) => board.appearance.font,
    toBoardPatch: (value) => ({ appearance: { font: value } }),
    isValid: (value): value is TextFont => FONTS.some((f) => f.value === value),
    userOnly: true,
  }),
  legacy<number>({
    key: 'appearance.fontSize',
    fromBoard: (board) => board.appearance.fontSize,
    toBoardPatch: (value) => ({ appearance: { fontSize: value } }),
    isValid: (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= FONT_SIZE_RANGE.min && value <= FONT_SIZE_RANGE.max,
    userOnly: true,
  }),
  legacy<WorkspaceMode>({
    key: 'git.mode',
    fromBoard: (board) => board.git.mode,
    toBoardPatch: (value) => ({ git: { mode: value } }),
    isValid: (value): value is WorkspaceMode => WORKSPACE_MODES.some((m) => m.value === value),
  }),
  legacy<string>({
    key: 'git.branchPattern',
    fromBoard: (board) => board.git.branchPattern,
    toBoardPatch: (value) => ({ git: { branchPattern: value } }),
    isValid: (value): value is string => isString(value) && value.trim() !== '' && value.includes('{numero}'),
  }),
  legacy<string>({
    key: 'git.worktreeDir',
    fromBoard: (board) => board.git.worktreeDir,
    toBoardPatch: (value) => ({ git: { worktreeDir: value } }),
    isValid: (value): value is string => isString(value) && value.trim() !== '',
  }),
  legacy<boolean>({
    key: 'git.parallel',
    fromBoard: (board) => board.runner.parallel,
    toBoardPatch: (value) => ({ runner: { parallel: value } }),
    isValid: isBoolean,
  }),
  legacy<number>({
    key: 'git.parallelStories',
    fromBoard: (board) => board.runner.parallelStories,
    toBoardPatch: (value) => ({ runner: { parallelStories: value } }),
    isValid: (value): value is number => isInteger(value, PARALLEL_RANGE),
  }),
  legacy<number>({
    key: 'git.parallelSubtasks',
    fromBoard: (board) => board.runner.parallelSubtasks,
    toBoardPatch: (value) => ({ runner: { parallelSubtasks: value } }),
    isValid: (value): value is number => isInteger(value, SUBTASK_PARALLEL_RANGE),
  }),
  legacy<boolean>({
    key: 'git.autoMerge',
    fromBoard: (board) => board.git.autoMerge,
    toBoardPatch: (value) => ({ git: { autoMerge: value } }),
    isValid: isBoolean,
  }),
  legacy<MergeMethod>({
    key: 'git.mergeMethod',
    fromBoard: (board) => board.git.mergeMethod,
    toBoardPatch: (value) => ({ git: { mergeMethod: value } }),
    isValid: (value): value is MergeMethod => MERGE_METHODS.some((m) => m.value === value),
  }),
  legacy<string>({
    key: 'git.decisionRecords',
    fromBoard: (board) => board.git.decisionRecords,
    toBoardPatch: (value) => ({ git: { decisionRecords: value } }),
    isValid: (value): value is string => isString(value) && (value.trim() === '' || cleanDecisionDir(value) !== ''),
  }),
  legacy<boolean>({
    key: 'git.gitflow',
    fromBoard: (board) => board.git.gitflow,
    toBoardPatch: (value) => ({ git: { gitflow: value } }),
    isValid: isBoolean,
  }),
  legacy<string>({
    key: 'git.mainBranch',
    fromBoard: (board) => board.git.mainBranch,
    toBoardPatch: (value) => ({ git: { mainBranch: value } }),
    isValid: isString,
  }),
  legacy<string>({
    key: 'git.developBranch',
    fromBoard: (board) => board.git.developBranch,
    toBoardPatch: (value) => ({ git: { developBranch: value } }),
    isValid: isString,
  }),
  legacy<string>({
    key: 'git.featurePrefix',
    fromBoard: (board) => board.git.featurePrefix,
    toBoardPatch: (value) => ({ git: { featurePrefix: value } }),
    isValid: isString,
  }),
  legacy<string>({
    key: 'git.bugfixPrefix',
    fromBoard: (board) => board.git.bugfixPrefix,
    toBoardPatch: (value) => ({ git: { bugfixPrefix: value } }),
    isValid: isString,
  }),
  legacy<string>({
    key: 'git.hotfixPrefix',
    fromBoard: (board) => board.git.hotfixPrefix,
    toBoardPatch: (value) => ({ git: { hotfixPrefix: value } }),
    isValid: isString,
  }),
  legacy<string>({
    key: 'git.releasePrefix',
    fromBoard: (board) => board.git.releasePrefix,
    toBoardPatch: (value) => ({ git: { releasePrefix: value } }),
    isValid: isString,
  }),
];

type Inspected = { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown };

/** Só o `inspect` do `WorkspaceConfiguration`: a importação nunca lê o valor efetivo nem grava. */
export interface ConfigurationInspector {
  inspect(key: string): Inspected | undefined;
}

/** O que a importação precisa do `MessageRouter`: as mesmas mensagens que a webview usa. */
export interface BoardLink {
  snapshot(): BoardState;
  handle(msg: WebviewToHost): unknown;
  /** marca única por banco (tabela `meta`) */
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): void;
}

/** Valor que a pessoa gravou (nunca o default): Aparência só do Usuário; o resto pasta > Workspace > Usuário. */
export function explicitValue(key: LegacyKey, info: Inspected | undefined): unknown {
  if (!info) return undefined;
  if (key.userOnly) return info.globalValue;
  return info.workspaceFolderValue ?? info.workspaceValue ?? info.globalValue;
}

/**
 * Leva ao board, uma vez por banco, os valores explícitos do Settings. Cada chave é isolada: valor inválido
 * ou recusa do board (ex.: renomear a branch com a IA executando) vai para o log e as demais seguem.
 * A marca é gravada sempre, para não repetir a cada abertura. Devolve as chaves importadas.
 */
export function importIdeSettingsOnce(config: ConfigurationInspector, router: BoardLink, log: (line: string) => void = () => {}): string[] {
  if (router.getMeta(IDE_SETTINGS_IMPORTED)) return [];
  const imported: string[] = [];
  for (const key of LEGACY_KEYS) {
    try {
      const value = explicitValue(key, config.inspect(key.key));
      if (value === undefined) continue;
      if (!key.isValid(value)) {
        log(`Faz AI: valor inválido em ${SECTION}.${key.key} no Settings, não importado: ${JSON.stringify(value)}`);
        continue;
      }
      if (Object.is(value, key.fromBoard(router.snapshot().board))) continue;
      router.handle({ type: 'settings.board.update', patch: key.toBoardPatch(value) });
      imported.push(key.key);
    } catch (e) {
      log(`Faz AI: ${SECTION}.${key.key} não foi importada: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  router.setMeta(IDE_SETTINGS_IMPORTED, '1');
  return imported;
}
