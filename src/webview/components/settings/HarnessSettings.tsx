import { Tabs } from '@radix-ui/themes';
import { useBoardStore, type HarnessTab } from '../../store/boardStore';
import { ArtifactsHarness } from './harness/ArtifactsHarness';
import { ModelSuggestion } from './harness/ModelSuggestion';
import { ContextPlanDefaults } from '../card/ExecutionPlanPanel';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness: o que entra no contexto das execuções. Toda execução do board parte só do que está no board (no
 * Claude Code, contexto vazio imposto; nas outras CLIs, o que elas carregam sozinhas aparece em Conectar agentes). A aba
 * "Artefatos do board" organiza regras, skills, agentes e servidores MCP; "Contexto e modelo" guarda o plano de contexto
 * e a sugestão de modelo dos cards (do board inteiro, com qualquer agente). Como a IA é executada (permissão, heartbeat,
 * paralelismo) fica em Automação; o agente de IA padrão e as regras de fallback, em Conectar agentes.
 */
export function HarnessSettings() {
  const tab = useBoardStore((s) => s.harnessTab);
  return (
    <div>
      <PageHeader title={t('Harness')}>
        {rich(
          'Os <b>Artefatos do board</b> (regras, skills, agentes e servidores MCP) valem com qualquer ferramenta de IA; a edição vale para as próximas execuções. <b>Contexto e modelo</b> guarda o plano de contexto e a sugestão de modelo dos cards. O que a IA pode fazer e o heartbeat ficam em <b>Automação</b>.',
        )}
      </PageHeader>
      <Tabs.Root value={tab} onValueChange={(harnessTab) => useBoardStore.setState({ harnessTab: harnessTab as HarnessTab })}>
        <Tabs.List className="harness-tabs">
          <Tabs.Trigger value="artifacts">{t('Artefatos do board')}</Tabs.Trigger>
          <Tabs.Trigger value="context">{t('Contexto e modelo')}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="artifacts">
          <ArtifactsHarness />
        </Tabs.Content>
        <Tabs.Content value="context">
          <ContextPlanDefaults />
          <ModelSuggestion />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
