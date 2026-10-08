import { aiToolInfo } from '../../../shared/harness';
import { Tabs } from '@radix-ui/themes';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { HarnessInventory } from './HarnessInventory';
import { ProjectTool } from './harness/ProjectTool';
import { RunnerSettings } from './harness/RunnerSettings';
import { ScopeHarness } from './harness/ScopeHarness';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness de IA. Toda execução do board parte de contexto vazio: só o que estiver marcado aqui
 * entra. <b>Projeto</b> e <b>Global</b> organizam de onde vem cada arquivo (rules, agentes e skills),
 * com a marcação em cada um; <b>Tudo que a ferramenta carrega</b> é o inventário completo.
 */
export function HarnessSettings() {
  const tool = aiToolInfo(useBoardStore((s) => s.state!.board.aiTool));
  const tab = useBoardStore((s) => s.harnessTab);
  return (
    <div>
      <PageHeader title={t('Harness de IA')}>
        {rich(
          'Toda execução pelo board parte de <b>contexto vazio</b>: nenhuma regra, skill ou agente da sua máquina ou do projeto entra por conta própria. Só entra o que você marcar aqui. <b>Projeto</b> e <b>Global</b> organizam os arquivos pela pasta de onde vêm; o que vale é a marcação. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão; <b>Tudo que a ferramenta carrega</b> é o inventário completo, para criar, copiar e apagar arquivos.',
        )}
      </PageHeader>
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="tool">{t('Ferramenta e execução')}</Tabs.Trigger>
          <Tabs.Trigger value="project">{t('Projeto')}</Tabs.Trigger>
          <Tabs.Trigger value="user">{t('Global')}</Tabs.Trigger>
          <Tabs.Trigger value="all">{t('Tudo que a ferramenta carrega')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tool">
          <ProjectTool tool={tool} />
          <RunnerSettings tool={tool} />
        </Tabs.Content>
        <Tabs.Content value="project">
          <ScopeHarness key="project" tool={tool} scope="project" />
        </Tabs.Content>
        <Tabs.Content value="user">
          <ScopeHarness key="user" tool={tool} scope="user" />
        </Tabs.Content>
        <Tabs.Content value="all">
          <HarnessInventory />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
