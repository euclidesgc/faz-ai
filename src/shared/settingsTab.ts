export const SETTINGS_TABS = ['columns', 'types', 'fields', 'rules', 'models', 'harness', 'git', 'appearance', 'backup'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'columns';

/** Aba válida, ou a padrão quando o argumento veio errado (links `command:` não tratam exceção). */
export function toSettingsTab(value: unknown): SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : DEFAULT_SETTINGS_TAB;
}
