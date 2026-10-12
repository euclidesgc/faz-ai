import { aiToolInfo } from '../../../shared/harness';
import { Tabs } from '@radix-ui/themes';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { ProjectTool } from './harness/ProjectTool';
import { RunnerSettings } from './harness/RunnerSettings';
import { HarnessScopeView } from './harness/HarnessScopeView';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness de IA. Toda execução do board parte de contexto vazio: só o que estiver marcado aqui
 * entra. <b>Projeto</b> e <b>Global</b> mostram tudo que a ferramenta carrega em cada escopo, em grupos,
 * com a marcação nas rules, skills e agentes.
 */
export function HarnessSettings() {
  const tool = aiToolInfo(useBoardStore((s) => s.state!.board.aiTool));
  const tab = useBoardStore((s) => s.harnessTab);
  return (
    <div>
      <PageHeader title={t('Harness de IA')}>
        {rich(
          'Toda execução pelo board parte de <b>contexto vazio</b>: nenhuma regra, skill ou agente da sua máquina ou do projeto entra por conta própria. Só entra o que você marcar aqui. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão. <b>Projeto</b> e <b>Global</b> mostram tudo que a ferramenta carrega, separado por tipo, com o que cada arquivo é e onde fica; clique no caminho para abrir e editar.',
        )}
      </PageHeader>
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="tool">{t('Ferramenta e execução')}</Tabs.Trigger>
          <Tabs.Trigger value="project">{t('Projeto')}</Tabs.Trigger>
          <Tabs.Trigger value="user">{t('Global')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tool">
          <ProjectTool tool={tool} />
          <RunnerSettings tool={tool} />
        </Tabs.Content>
        <Tabs.Content value="project">
          <HarnessScopeView key="project" scope="project" />
        </Tabs.Content>
        <Tabs.Content value="user">
          <HarnessScopeView key="user" scope="user" />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
