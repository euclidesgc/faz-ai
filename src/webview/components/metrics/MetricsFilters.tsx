import { useId } from 'react';
import type { MetricsFilters as Filters, MetricsPanelResult, MetricsPeriod } from '../../../shared/metrics';
import { t } from '../../i18n';
import { useBoardStore } from '../../store/boardStore';
import { Button, FormField, SelectField } from '../ui';
import { formatRange } from './format';

/** Os sete períodos da RF-03, na ordem em que aparecem. O texto é traduzido na hora de desenhar. */
const PERIODS: { value: MetricsPeriod; label: () => string }[] = [
  { value: 'today', label: () => t('Hoje') },
  { value: '7d', label: () => t('7 dias') },
  { value: '30d', label: () => t('30 dias') },
  { value: 'thisMonth', label: () => t('Este mês') },
  { value: '12m', label: () => t('Últimos 12 meses') },
  { value: 'all', label: () => t('Tudo') },
  { value: 'custom', label: () => t('Intervalo livre') },
];

/** O Select do Radix não aceita valor vazio: "todos os workflows" (`''` no filtro) usa este valor. */
const ALL = '__all';

/** Intervalo invertido (RF-04): os dois lados preenchidos e o final antes do inicial. 'AAAA-MM-DD' compara como texto. */
export const isInvertedRange = (f: Pick<Filters, 'period' | 'from' | 'to'>): boolean =>
  f.period === 'custom' && !!f.from && !!f.to && f.to < f.from;

interface Props {
  /** os workflows da última resposta, por nome, como o log os guardou */
  workflows: readonly string[];
  /** o recorte da última resposta, escrito abaixo dos controles */
  range?: MetricsPanelResult['range'];
}

/**
 * Os filtros do painel (RF-03 a RF-05), lidos e gravados na store (`metricsFilters`). Só botões e campos
 * nativos, ou o Select do design system: todos recebem foco e respondem a Enter/Espaço (RF-31).
 */
export function MetricsFilters({ workflows, range }: Props) {
  const filters = useBoardStore((s) => s.metricsFilters);
  const setFilters = useBoardStore((s) => s.setMetricsFilters);
  const clear = useBoardStore((s) => s.clearMetricsFilters);
  const periodId = useId();
  const errorId = useId();
  const inverted = isInvertedRange(filters);

  // o workflow escolhido continua na lista mesmo que a resposta atual não o traga (recorte sem log dele)
  const names = filters.workflow && !workflows.includes(filters.workflow) ? [...workflows, filters.workflow] : workflows;
  const options = [{ value: ALL, label: t('Todos') }, ...names.map((name) => ({ value: name, label: name }))];
  const rangeText = range ? formatRange(range) : '';

  return (
    <div className="metrics-filters">
      <div className="metrics-filters-row">
        <div className="form-field">
          <span id={periodId} className="form-field-label metrics-filters-label">
            {t('Período')}
          </span>
          <div className="metrics-periods" role="group" aria-labelledby={periodId}>
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                type="button"
                size="small"
                on={filters.period === p.value}
                aria-pressed={filters.period === p.value}
                onClick={() => setFilters({ period: p.value })}
              >
                {p.label()}
              </Button>
            ))}
          </div>
        </div>
        <FormField label={t('Workflow')}>
          {(id) => (
            <SelectField
              id={id}
              size="2"
              options={options}
              value={filters.workflow || ALL}
              onChange={(v) => setFilters({ workflow: v === ALL ? '' : v })}
            />
          )}
        </FormField>
        <Button type="button" size="small" className="metrics-filters-clear" onClick={clear}>
          {t('Limpar filtros')}
        </Button>
      </div>
      {filters.period === 'custom' && (
        <div className="metrics-filters-row">
          {(['from', 'to'] as const).map((side) => (
            <FormField key={side} label={side === 'from' ? t('De') : t('Até')}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={filters[side]}
                  max={side === 'from' ? filters.to || undefined : undefined}
                  min={side === 'to' ? filters.from || undefined : undefined}
                  aria-invalid={inverted || undefined}
                  aria-describedby={inverted ? errorId : undefined}
                  onChange={(e) => setFilters({ [side]: e.target.value })}
                />
              )}
            </FormField>
          ))}
        </div>
      )}
      {inverted && (
        <p id={errorId} className="metrics-filters-error">
          {t('A data final vem antes da inicial.')}
        </p>
      )}
      {rangeText && <p className="metrics-filters-range">{t('Período consultado: {period}', { period: rangeText })}</p>}
    </div>
  );
}
