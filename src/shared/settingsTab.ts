export const SETTINGS_TABS = ['columns', 'types', 'fields', 'rules', 'connect', 'harness', 'git', 'appearance', 'backup'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'columns';

/**
 * As abas que saíram e onde o conteúdo delas mora agora: Ferramentas de IA, Modelos de IA e a POC da conexão viraram
 * Conectar agentes. Uma aba guardada (a última aberta) ou um link antigo cai no lugar certo, e não numa tela vazia.
 */
const MOVED_TABS: Readonly<Record<string, SettingsTab>> = { aiTools: 'connect', models: 'connect', acpPoc: 'connect' };

/** Aba válida, ou a padrão quando o argumento veio errado (links `command:` não tratam exceção). */
export function toSettingsTab(value: unknown): SettingsTab {
  if (typeof value === 'string' && Object.hasOwn(MOVED_TABS, value)) return MOVED_TABS[value]!;
  return SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : DEFAULT_SETTINGS_TAB;
}
