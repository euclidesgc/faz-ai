import type { SettingsTab } from './settingsTab';

/**
 * Onde uma seção de Configurações mora: a aba e, quando ela está dentro de Harness, a sub-aba.
 * Fonte única para resolver a navegação cruzada (`DependsOn`, `goToSection` no `boardStore`, e a
 * mensagem `ui.openSettings` vinda do Settings nativo) — evita que cada lugar precise saber, por
 * exemplo, que a sugestão de modelo fica em Conectar agentes e o heartbeat em Automação.
 */
export interface SettingsSectionInfo {
  tab: SettingsTab;
  /** Sub-aba de Harness, quando a seção está lá dentro: `artifacts` (Artefatos do board) ou `context` (Plano de contexto). */
  harnessTab?: 'artifacts' | 'context';
  /** O assunto aberto na aba de artefatos (`HarnessTopic` de `harnessTopics.ts`). */
  harnessTopic?: 'rules' | 'skill' | 'agent' | 'mcp';
}

export const SETTINGS_SECTIONS: Record<string, SettingsSectionInfo> = {
  'model-rules': { tab: 'connect' },
  'execution-policies': { tab: 'connect' },
  heartbeat: { tab: 'automation' },
  // as âncoras da tela por ferramenta caem na aba de artefatos do board
  'harness-project': { tab: 'harness', harnessTab: 'artifacts' },
  'harness-user': { tab: 'harness', harnessTab: 'artifacts' },
  'harness-missing': { tab: 'harness', harnessTab: 'artifacts' },
  // a pendência "nenhum agente do board" leva à aba Agentes
  'harness-agents': { tab: 'harness', harnessTab: 'artifacts', harnessTopic: 'agent' },
};
