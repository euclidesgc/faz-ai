import { useState } from 'react';
import { Card } from '@radix-ui/themes';
import { WARN_MAX, WARN_MIN, type BudgetConfig, type BudgetEffort, type BudgetPolicy } from '../../../shared/budget';
import { useBoardStore } from '../../store/boardStore';
import { settings } from '../../commands';
import { FormField, NumberField, SelectField, Stack, SwitchField } from '../ui';
import { SectionHeader } from './SectionHeader';
import { t } from '../../i18n';

const EFFORTS: { effort: BudgetEffort; label: string }[] = [
  { effort: 'Baixo', label: 'Teto para esforço Baixo' },
  { effort: 'Médio', label: 'Teto para esforço Médio' },
  { effort: 'Alto', label: 'Teto para esforço Alto' },
];
const MAX_CEILING = 1_000_000_000_000;

/** O que o board faz ao chegar no percentual de aviso; o texto é traduzido onde é usado. */
const POLICIES: { value: BudgetPolicy; label: string; hint: string }[] = [
  { value: 'finish', label: 'Terminar a execução e passar a vez', hint: 'A execução em curso termina e a história passa para você.' },
  { value: 'downgrade', label: 'Descer o modelo', hint: 'Os cards ainda não executados descem um nível na escada de modelos.' },
  { value: 'stop', label: 'Bloquear a história', hint: 'A história é bloqueada até você subir o teto ou continuar à mão.' },
];

/** Configurações › Automação › Teto de consumo: quanto uma história pode gastar, por esforço, e o que fazer ao chegar perto. */
export function BudgetSettings() {
  const config = useBoardStore((s) => s.state!.budget.config);
  const [error, setError] = useState<string | null>(null);
  const save = (patch: Partial<BudgetConfig>) => {
    setError(null);
    settings.setBudgetConfig({ ...config, ...patch, byEffort: { ...config.byEffort, ...patch.byEffort } }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  };
  const policy = POLICIES.find((p) => p.value === config.policy)!;
  return (
    <>
      <SectionHeader title={t('Teto de consumo')}>
        {t(
          'Quanto uma história pode gastar em tokens, somando as execuções dela e as das sub-tarefas. O teto vale pelo esforço da história e pode ser trocado em cada card, na aba Consumo. Só uma pessoa o altera.',
        )}
      </SectionHeader>
      <Card className="budget-settings form-card" aria-label={t('Teto de consumo')}>
        <Stack gap="12">
          <SwitchField
            label={t('Limitar o consumo por história')}
            hint={t('Desligado, nenhuma história é avisada nem parada pelo consumo.')}
            checked={config.enabled}
            onChange={(enabled) => save({ enabled })}
          />
          {EFFORTS.map(({ effort: e, label }) => (
            <FormField key={e} label={t(label)}>
              {(id) => (
                <NumberField
                  id={id}
                  aria-label={t(label)}
                  value={config.byEffort[e]}
                  min={1}
                  max={MAX_CEILING}
                  unit={t('tokens')}
                  onCommit={(n) => save({ byEffort: { ...config.byEffort, [e]: Math.round(n) } })}
                />
              )}
            </FormField>
          ))}
          <FormField label={t('Avisar em')} hint={t('Percentual do teto em que o aviso e a política abaixo são aplicados.')}>
            {(id) => (
              <NumberField
                id={id}
                aria-label={t('Avisar em')}
                value={config.warnAt}
                min={WARN_MIN}
                max={WARN_MAX}
                unit="%"
                onCommit={(n) => save({ warnAt: Math.round(n) })}
              />
            )}
          </FormField>
          <FormField label={t('Ao chegar no aviso')} hint={t(policy.hint)}>
            {(id) => (
              <SelectField
                id={id}
                aria-label={t('Ao chegar no aviso')}
                options={POLICIES.map((p) => ({ value: p.value, label: t(p.label) }))}
                value={config.policy}
                onChange={(p) => save({ policy: p })}
              />
            )}
          </FormField>
          {error && (
            <p className="error" role="alert">
              {t(error)}
            </p>
          )}
        </Stack>
      </Card>
    </>
  );
}
