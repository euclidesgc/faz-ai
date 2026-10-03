import { aiToolInfo } from '../../../shared/harness';
import { useBoardStore } from '../../store/boardStore';
import { HarnessInventory } from './HarnessInventory';
import { ProjectAgents } from './harness/ProjectAgents';
import { ProjectRules } from './harness/ProjectRules';
import { ProjectSkills } from './harness/ProjectSkills';
import { ProjectTool } from './harness/ProjectTool';
import { RunnerSettings } from './harness/RunnerSettings';
import { useProjectEditing } from './harness/useProjectEditing';
import { PageHeader } from './PageHeader';

/** Tela do harness de IA: a ferramenta do projeto, a execução pelo board, regras, skills e agentes do projeto e o inventário completo. */
export function HarnessSettings() {
  const tool = aiToolInfo(useBoardStore((s) => s.state!.board.aiTool));
  // um editor ou formulário aberto por vez, entre regras, skills e agentes
  const edit = useProjectEditing();
  return (
    <div>
      <PageHeader title="Harness de IA">
        Regras, skills e agentes que a ferramenta deste projeto lê na pasta do projeto, editáveis aqui. No fim da página está tudo que cada
        ferramenta carrega, incluindo o que vem da sua pasta de usuário e de plugins.
      </PageHeader>
      <ProjectTool tool={tool} />
      <RunnerSettings tool={tool} />
      <ProjectRules tool={tool} edit={edit} />
      <ProjectSkills tool={tool} edit={edit} />
      <ProjectAgents tool={tool} edit={edit} />
      <HarnessInventory />
    </div>
  );
}
