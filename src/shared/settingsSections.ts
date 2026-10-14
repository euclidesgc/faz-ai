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
   * Sub-aba de Harness, quando a seção está lá dentro: `tool` é a de Ferramenta e execução; `project` e `user`
   * levam à aba da ferramenta do projeto (o que elas mostravam mora lá, por assunto). Quem consome resolve
   * com `resolveHarnessTab` de `harnessTopics.ts`.
   */
  harnessTab?: 'tool' | 'project' | 'user';
  /** O assunto aberto dentro da aba da ferramenta (`HarnessTopic` de `harnessTopics.ts`). */
  harnessTopic?: 'rules' | 'skill' | 'agent' | 'mcp' | 'command' | 'hook' | 'other';
}

export const SETTINGS_SECTIONS: Record<string, SettingsSectionInfo> = {
  'model-rules': { tab: 'models' },
  'harness-tool': { tab: 'harness', harnessTab: 'tool' },
  heartbeat: { tab: 'harness', harnessTab: 'tool' },
  'harness-project': { tab: 'harness', harnessTab: 'project' },
  'harness-user': { tab: 'harness', harnessTab: 'user' },
  'harness-agents': { tab: 'harness', harnessTab: 'project', harnessTopic: 'agent' },
};
