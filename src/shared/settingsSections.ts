import type { SettingsTab } from './settingsTab';

/**
 * Onde uma seção de Configurações mora: a aba e, quando ela está dentro de Harness, a sub-aba.
 * Fonte única para resolver a navegação cruzada (`DependsOn`, `goToSection` no `boardStore`, e a
 * mensagem `ui.openSettings` vinda do Settings nativo) — evita que cada lugar precise saber, por
 * exemplo, que o heartbeat fica na sub-aba "Ferramenta e execução" de Harness.
 */
export interface SettingsSectionInfo {
  tab: SettingsTab;
  /**
   * Sub-aba de Harness ('tool' | 'project' | 'user'), quando a seção está lá dentro. Não usa o tipo
   * `HarnessTab` do `boardStore.ts` para não criar um import cruzado `shared → webview`; quem consome
   * faz o cast.
   */
  harnessTab?: 'tool' | 'project' | 'user';
}

export const SETTINGS_SECTIONS: Record<string, SettingsSectionInfo> = {
  'model-rules': { tab: 'models' },
  'harness-tool': { tab: 'harness', harnessTab: 'tool' },
  heartbeat: { tab: 'harness', harnessTab: 'tool' },
  'harness-project': { tab: 'harness', harnessTab: 'project' },
  'harness-user': { tab: 'harness', harnessTab: 'user' },
};
