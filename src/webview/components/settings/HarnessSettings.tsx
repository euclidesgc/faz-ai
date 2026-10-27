import { Tabs } from '@radix-ui/themes';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { RunnerSettings } from './harness/RunnerSettings';
import { ArtifactsHarness } from './harness/ArtifactsHarness';
import { ModelSuggestion } from './harness/ModelSuggestion';
import { ContextPlanDefaults } from '../card/ExecutionPlanPanel';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness. Toda execução do board parte só do que está no board (no Claude Code, contexto vazio imposto; nas outras
 * CLIs, o que elas carregam sozinhas aparece em Conectar agentes). A aba "Artefatos do board" organiza regras, skills,
 * agentes e servidores MCP; "Ferramenta e execução" define o que a IA pode fazer, o heartbeat, o plano de contexto e a
 * sugestão de modelo dos cards (do board inteiro, com qualquer agente). O agente padrão das instruções se escolhe na
 * lista de Agentes; o agente de IA padrão e as regras de fallback ficam em Conectar agentes.
 */
export function HarnessSettings() {
  const tab = useBoardStore((s) => s.harnessTab);
  return (
    <div>
      <PageHeader title={t('Harness')}>
        {rich(
          'Os <b>Artefatos do board</b> (regras, skills, agentes e servidores MCP) valem com qualquer ferramenta de IA; a edição vale para as próximas execuções. <b>Ferramenta e execução</b> define o que a IA pode fazer, o heartbeat, o plano de contexto e a sugestão de modelo dos cards.',
        )}
      </PageHeader>
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="tool">{t('Ferramenta e execução')}</Tabs.Trigger>
          <Tabs.Trigger value="artifacts">{t('Artefatos do board')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="artifacts">
          <ArtifactsHarness />
        </Tabs.Content>
        <Tabs.Content value="tool">
          <RunnerSettings />
          <ContextPlanDefaults />
          <ModelSuggestion />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
