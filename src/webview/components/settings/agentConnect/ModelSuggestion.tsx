import { Card, Text } from '@radix-ui/themes';
import { settings } from '../../../commands';
import { t } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { SwitchField } from '../../ui';
import { DependsOn } from '../DependsOn';
import { ModelRulesEditor } from '../ModelRulesEditor';

/**
 * O modelo de cada card: as regras que sugerem o agente, o modelo e o esforço pelo tipo, pelos campos e pelas tags
 * do card, e o "preencher sozinho". Vale para o board inteiro, com qualquer agente conectado.
 */
export function ModelSuggestion() {
  const { modelRules, rules } = useBoardStore((s) => s.state!.board);
  return (
    <section className="agent-board-section">
      <Card className="form-card" aria-label={t('Preencher o modelo sugerido')}>
        <SwitchField
          label={t('Preencher o modelo sugerido automaticamente')}
          checked={modelRules.length > 0 && rules.autoApplyModelSuggestion}
          disabled={modelRules.length === 0}
          onChange={(autoApplyModelSuggestion) => settings.updateRules({ autoApplyModelSuggestion })}
        />
        <Text as="p" size="1" color="gray">
          {t(
            'Ao criar ou mudar um card, preenche o campo "Modelo" com a sugestão das regras abaixo, se ele estiver vazio ou com a sugestão anterior. Um modelo escolhido à mão nunca é trocado.',
          )}
        </Text>
        <DependsOn
          label={t('uma regra de sugestão de modelo')}
          satisfied={modelRules.length > 0}
          target={{ kind: 'board', section: 'model-rules' }}
          targetHint={t('mais abaixo, nesta mesma aba')}
        />
      </Card>
      <ModelRulesEditor />
    </section>
  );
}
