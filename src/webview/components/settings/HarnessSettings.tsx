import { ExecutionPoliciesSettings } from './policies/ExecutionPoliciesSettings';
import { activeProfile, toolInfo } from '../../../shared/aiProfiles';
import { Button, Tabs } from '@radix-ui/themes';
import { resolveHarnessTab } from '../../../shared/harnessTopics';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { ProjectTool } from './harness/ProjectTool';
import { RunnerSettings } from './harness/RunnerSettings';
import { ContextPlanDefaults } from '../card/ExecutionPlanPanel';
import { HarnessIntro } from './harness/HarnessIntro';
import { BoardLibrary } from './harness/BoardLibrary';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness. Toda execução do board parte só do que está no board (no Claude Code, contexto vazio imposto; nas outras
 * CLIs, o que elas carregam sozinhas aparece em Ferramentas de IA).
 * A biblioteca organiza os artefatos por tipo; a escolha do executor fica em uma seção própria.
 */
export function HarnessSettings() {
  const board = useBoardStore((s) => s.state!.board);
  const projectTool = board.aiTool;
  const introSeen = useBoardStore((s) => s.harnessIntroSeen);
  const setIntroSeen = useBoardStore((s) => s.setHarnessIntroSeen);
  const tool = toolInfo(activeProfile(board));
  // Links antigos de ferramenta ou origem passam a abrir a biblioteca.
  const resolved = resolveHarnessTab(
    useBoardStore((s) => s.harnessTab),
    projectTool,
  );
  const tab = resolved === 'tool' ? 'tool' : 'library';
  return (
    <div>
      <PageHeader title={t('Harness')}>
        {rich(
          'A <b>Biblioteca do board</b> reúne os artefatos disponíveis em qualquer ferramenta. <b>Ferramenta e execução</b> escolhe a IA, a permissão e o agente padrão. Crie e importe regras, skills, subagentes e MCPs diretamente na biblioteca.',
        )}
        {introSeen && (
          <>
            {' '}
            <Button variant="ghost" size="1" onClick={() => setIntroSeen(false)}>
              {t('Como funciona')}
            </Button>
          </>
        )}
      </PageHeader>
      <HarnessIntro />
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="tool">{t('Ferramenta e execução')}</Tabs.Trigger>
          <Tabs.Trigger value="library">{t('Biblioteca do board')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="library">
          <BoardLibrary />
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
