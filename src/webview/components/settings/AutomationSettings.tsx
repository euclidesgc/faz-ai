import { PageHeader } from './PageHeader';
import { BudgetSettings } from './BudgetSettings';
import { RunnerSettings } from './RunnerSettings';
import { t } from '../../i18n';

/**
 * Configurações › Automação: como o board executa a IA, com qualquer agente ligado. O que a IA pode fazer, o tempo
 * limite, o heartbeat e quantas histórias andam ao mesmo tempo. Saiu do Harness, que fica só com o que entra no
 * contexto das execuções (os artefatos, o plano de contexto e a sugestão de modelo).
 */
export function AutomationSettings() {
  return (
    <div>
      <PageHeader title={t('Automação')}>
        {t(
          'Como o board executa a IA, com qualquer agente ligado: o que ela pode fazer, o tempo limite de cada execução, o heartbeat e quantas histórias andam ao mesmo tempo.',
        )}
      </PageHeader>
      <RunnerSettings />
      <BudgetSettings />
    </div>
  );
}
