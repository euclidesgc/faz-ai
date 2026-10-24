import { Badge, Text } from '@radix-ui/themes';
import type { AgentConfigOption, TestConnection } from '../../../../shared/agentConnect';
import { agentConnect } from '../../../commands';
import { t } from '../../../i18n';
import { FormField, SelectField, SwitchField } from '../../ui';

/** O rótulo de uma opção do select: com o grupo na frente quando o agente agrupa (o Cursor agrupa por provedor). */
function optionLabel(o: AgentConfigOption['options'][number]): string {
  return o.group ? `${o.group} · ${o.name}` : o.name;
}

/**
 * As opções que o agente declarou para a sessão de teste (`configOptions`): um seletor para cada `select` e um
 * interruptor para cada `boolean`, com a categoria ao lado, como o agente as manda. Valem só para o teste: o
 * modelo de um card vem do campo Modelo dele.
 */
export function SessionOptions({ connection, disabled }: { connection: TestConnection; disabled: boolean }) {
  const options = connection.configOptions;
  // o modo antigo (`modes`) só quando o agente não manda o modo também como opção
  const legacyMode = !options.some((o) => o.category === 'mode') && connection.modes.length > 0 && connection.currentModeId;
  if (!options.length && !legacyMode) {
    return (
      <Text size="1" color="gray">
        {t('O agente não declarou opções de sessão (modelo, esforço, modo).')}
      </Text>
    );
  }
  return (
    <div className="agent-options" aria-label={t('Opções da sessão')}>
      {legacyMode && (
        <FormField label={t('Modo (session/set_mode)')}>
          {(id) => (
            <SelectField
              id={id}
              value={connection.currentModeId!}
              disabled={disabled}
              options={connection.modes.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(modeId) => void agentConnect.setMode(modeId)}
            />
          )}
        </FormField>
      )}
      {options.map((o) => (
        <div key={o.id} className="agent-option">
          <div className="agent-option-label">
            <Text size="1" weight="medium">
              {o.name}
            </Text>
            <Badge color="gray" variant="outline">
              {o.category ?? o.id}
            </Badge>
          </div>
          {o.type === 'boolean' ? (
            <SwitchField
              checked={o.current === true}
              disabled={disabled}
              label={o.description ?? undefined}
              onChange={(value) => void agentConnect.setConfig(o.id, value)}
            />
          ) : (
            <SelectField
              aria-label={o.name}
              value={String(o.current)}
              disabled={disabled}
              options={o.options.map((v) => ({ value: v.value, label: optionLabel(v) }))}
              onChange={(value) => void agentConnect.setConfig(o.id, value)}
            />
          )}
          {o.type === 'select' && (
            <Text size="1" color="gray">
              {t('{count} opções', { count: o.options.length })}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}
