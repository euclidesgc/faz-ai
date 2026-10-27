import { Tabs } from '@radix-ui/themes';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { ArtifactsHarness } from './harness/ArtifactsHarness';
import { ContextPlanDefaults } from '../card/ExecutionPlanPanel';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness: o que entra no contexto das execuções. Toda execução do board parte só do que está no board (no
 * Claude Code, contexto vazio imposto; nas outras CLIs, o que elas carregam sozinhas aparece em Conectar agentes). A aba
 * "Artefatos do board" organiza regras, skills, agentes e servidores MCP; "Plano de contexto" guarda o padrão do board
 * (o de cada workflow fica no editor dele). Como a IA é executada (permissão, heartbeat, paralelismo) fica em Automação;
 * o agente de IA padrão, a sugestão de modelo e as regras de fallback, em Conectar agentes.
 */
export function HarnessSettings() {
  const tab = useBoardStore((s) => s.harnessTab);
  return (
    <div>
      <PageHeader title={t('Harness')}>
        {rich(
          'O que entra no contexto das execuções, com qualquer ferramenta de IA: os <b>Artefatos do board</b> (regras, skills, agentes e servidores MCP) e o <b>Plano de contexto</b> padrão de cada atividade. A edição vale para as próximas execuções.',
        )}
      </PageHeader>
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="artifacts">{t('Artefatos do board')}</Tabs.Trigger>
          <Tabs.Trigger value="context">{t('Plano de contexto')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="artifacts">
          <ArtifactsHarness />
        </Tabs.Content>
        <Tabs.Content value="context">
          <ContextPlanDefaults />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
