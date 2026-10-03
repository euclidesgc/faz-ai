import { aiToolInfo } from '../../../shared/harness';
import { Tabs } from '@radix-ui/themes';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { HarnessInventory } from './HarnessInventory';
import { ProjectAgents } from './harness/ProjectAgents';
import { ProjectRules } from './harness/ProjectRules';
import { ProjectSkills } from './harness/ProjectSkills';
import { ProjectTool } from './harness/ProjectTool';
import { RunnerSettings } from './harness/RunnerSettings';
import { useProjectEditing } from './harness/useProjectEditing';
import { PageHeader } from './PageHeader';

/**
 * Tela do harness de IA, em três abas: a ferramenta e a execução pelo board; o que faz parte do
 * projeto (regras, skills e agentes, editáveis); e tudo que cada ferramenta carrega, com o que vem
 * da pasta do usuário e de plugins.
 */
export function HarnessSettings() {
  const tool = aiToolInfo(useBoardStore((s) => s.state!.board.aiTool));
  const tab = useBoardStore((s) => s.harnessTab);
  // um editor ou formulário aberto por vez, entre regras, skills e agentes
  const edit = useProjectEditing();
  return (
    <div>
      <PageHeader title="Harness de IA">
        O que a IA lê e usa neste projeto. <b>Ferramenta e execução</b> escolhe com qual IA o board trabalha; <b>Do projeto</b> reúne o que
        faz parte do repositório e é editável aqui; <b>Tudo que a ferramenta carrega</b> mostra também o que vem da sua pasta de usuário e
        de plugins.
      </PageHeader>
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="tool">Ferramenta e execução</Tabs.Trigger>
          <Tabs.Trigger value="project">Do projeto</Tabs.Trigger>
          <Tabs.Trigger value="all">Tudo que a ferramenta carrega</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="tool">
          <ProjectTool tool={tool} />
          <RunnerSettings tool={tool} />
        </Tabs.Content>
        <Tabs.Content value="project">
          <p className="muted small">Tudo aqui são arquivos da pasta do projeto: vão no repositório e valem para quem trabalha nele.</p>
          <ProjectRules tool={tool} edit={edit} />
          <ProjectSkills tool={tool} edit={edit} />
          <ProjectAgents tool={tool} edit={edit} />
        </Tabs.Content>
        <Tabs.Content value="all">
          <HarnessInventory />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
