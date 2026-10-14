import { aiToolInfo } from '../../../shared/harness';
import { Tabs } from '@radix-ui/themes';
import { resolveHarnessTab, toolsInOrder } from '../../../shared/harnessTopics';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { ProjectTool } from './harness/ProjectTool';
import { RunnerSettings } from './harness/RunnerSettings';
import { ToolHarness } from './harness/ToolHarness';
import { toolLabel } from './harness/text';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness de IA. Toda execução do board parte de contexto vazio: só o que estiver no board entra.
 * Uma aba por ferramenta (a do projeto primeiro), e dentro dela uma por assunto; o catálogo mostra o que
 * existe em cada fonte e o Board, o que as execuções podem usar. Só a aba à vista é montada.
 */
export function HarnessSettings() {
  const projectTool = useBoardStore((s) => s.state!.board.aiTool);
  const tool = aiToolInfo(projectTool);
  // um valor antigo (as abas Projeto e Global) cai na ferramenta do projeto
  const tab = resolveHarnessTab(
    useBoardStore((s) => s.harnessTab),
    projectTool,
  );
  return (
    <div>
      <PageHeader title={t('Harness de IA')}>
        {rich(
          'Toda execução pelo board parte de <b>contexto vazio</b>: nenhuma regra, skill ou agente da sua máquina ou do projeto entra por conta própria. Só entra o que você enviar ao <b>Board</b>. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão. Cada ferramenta tem a sua aba, com um assunto por vez (regras, skills, sub-agentes…); em cada um, escolha a origem: o que está no Board, no Projeto, no Global ou nas pastas importadas.',
        )}
      </PageHeader>
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="tool">{t('Ferramenta e execução')}</Tabs.Trigger>
          {toolsInOrder(projectTool).map((id) => (
            <Tabs.Trigger key={id} value={id}>
              {toolLabel(id)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="tool">
          <ProjectTool tool={tool} />
          <RunnerSettings tool={tool} />
        </Tabs.Content>
        {toolsInOrder(projectTool).map((id) => (
          <Tabs.Content key={id} value={id}>
            <ToolHarness key={id} tool={id} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}
