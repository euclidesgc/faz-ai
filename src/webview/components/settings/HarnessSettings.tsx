import { baseInfo } from '../../../shared/harness';
import { Tabs } from '@radix-ui/themes';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { ProjectTool } from './harness/ProjectTool';
import { RunnerSettings } from './harness/RunnerSettings';
import { ArtifactsHarness } from './harness/ArtifactsHarness';
import { ContextPlanDefaults } from '../card/ExecutionPlanPanel';
import { ExecutionPoliciesSettings } from './policies/ExecutionPoliciesSettings';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness. Toda execução do board parte de contexto vazio: só o que estiver no board entra. A aba
 * "Artefatos do board" organiza regras, skills, agentes e servidores MCP; "Ferramenta e execução" escolhe a IA e o executor.
 */
export function HarnessSettings() {
  const projectTool = useBoardStore((s) => s.state!.board.aiTool);
  const tab = useBoardStore((s) => s.harnessTab);
  const tool = baseInfo(projectTool);
  return (
    <div>
      <PageHeader title={t('Harness')}>
        {rich(
          'Os <b>Artefatos do board</b> (regras, skills, agentes e servidores MCP) valem com qualquer ferramenta de IA; a edição vale para as próximas execuções. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão.',
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
          <ProjectTool tool={tool} />
          <ExecutionPoliciesSettings />
          <RunnerSettings tool={tool} />
          <ContextPlanDefaults />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
