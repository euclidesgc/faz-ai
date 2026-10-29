import { ArtifactsHarness } from './harness/ArtifactsHarness';
import { PageHeader } from './PageHeader';
import { t } from '../../i18n';
import { rich } from '../../i18n/rich';

/**
 * Tela do harness: o que entra no contexto das execuções. Toda execução do board parte só do que está no board (no
 * Claude Code, contexto vazio imposto; nas outras CLIs, o que elas carregam sozinhas aparece em Conectar agentes). Os
 * artefatos do board são regras, skills, agentes e servidores MCP. Como a IA é executada (permissão, heartbeat, paralelismo) fica em Automação;
 * o agente de IA padrão, a sugestão de modelo e as regras de fallback, em Conectar agentes.
 */
export function HarnessSettings() {
  return (
    <div>
      <PageHeader title={t('Harness')}>
        {rich(
          'O que entra no contexto das execuções, com qualquer ferramenta de IA: os <b>Artefatos do board</b> (regras, skills, agentes e servidores MCP). A edição vale para as próximas execuções.',
        )}
      </PageHeader>
      <ArtifactsHarness />
    </div>
  );
}
