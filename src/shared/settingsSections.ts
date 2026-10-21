import type { SettingsTab } from './settingsTab';

/**
 * Onde uma seção de Configurações mora: a aba e, quando ela está dentro de Harness, a sub-aba.
 * Fonte única para resolver a navegação cruzada (`DependsOn`, `goToSection` no `boardStore`, e a
 * mensagem `ui.openSettings` vinda do Settings nativo) — evita que cada lugar precise saber, por
 * exemplo, que o heartbeat fica na sub-aba "Ferramenta e execução" de Harness.
 */
export interface SettingsSectionInfo {
  tab: SettingsTab;
  /** Sub-aba de Harness, quando a seção está lá dentro: `tool` (Ferramenta e execução) ou `artifacts` (Artefatos do board). */
  harnessTab?: 'tool' | 'artifacts';
  /** O assunto aberto na aba de artefatos (`HarnessTopic` de `harnessTopics.ts`). */
  harnessTopic?: 'rules' | 'skill' | 'agent' | 'mcp';
}

export const SETTINGS_SECTIONS: Record<string, SettingsSectionInfo> = {
  'model-rules': { tab: 'models' },
  'harness-tool': { tab: 'harness', harnessTab: 'tool' },
  heartbeat: { tab: 'harness', harnessTab: 'tool' },
  // as âncoras da tela por ferramenta caem na aba de artefatos do board
  'harness-project': { tab: 'harness', harnessTab: 'artifacts' },
  'harness-user': { tab: 'harness', harnessTab: 'artifacts' },
  'harness-cursor': { tab: 'harness', harnessTab: 'artifacts' },
  'harness-missing': { tab: 'harness', harnessTab: 'artifacts' },
  // a pendência "nenhum agente do board" leva à aba Agentes
  'harness-agents': { tab: 'harness', harnessTab: 'artifacts', harnessTopic: 'agent' },
};
