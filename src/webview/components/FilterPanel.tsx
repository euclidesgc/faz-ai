import type { DatePreset, Filters, Relation } from '../../shared/filters';
import { useBoardStore } from '../store/boardStore';
import { Checkbox, TextField } from '@radix-ui/themes';
import { ChipsEditor, SelectField } from './ui';

/** O Select do Radix não aceita valor vazio: "qualquer data" usa este. */
const ANY_DATE = '__any';
const OWNERS: { value: Filters['owner']; label: string }[] = [
  { value: 'any', label: 'Qualquer' },
  { value: 'human', label: 'Com você (revisar, responder, desbloquear)' },
  { value: 'ai', label: 'Com a IA' },
];
const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Período…' },
];
const RELATIONS: { value: Relation; label: string }[] = [
  { value: 'any', label: 'Qualquer' },
  { value: 'withChildren', label: 'Histórias com sub-tarefas' },
  { value: 'withoutChildren', label: 'Histórias sem sub-tarefas' },
  { value: 'pendingChildren', label: 'Histórias com sub-tarefas pendentes' },
];

/** Grupos de filtro: tipo, campos, data e relacionamentos. */
export function FilterPanel() {
  const state = useBoardStore((s) => s.state)!;
  const filters = useBoardStore((s) => s.filters);
  const setFilters = useBoardStore((s) => s.setFilters);

  const optionFields = state.fieldDefs.filter((f) => f.kind === 'select' || f.kind === 'multiselect' || f.kind === 'checkbox');
  const dateFields = state.fieldDefs.filter((f) => f.kind === 'date');

  return (
    <div className="filter-panel">
      <div className="filter-group">
        <h3>Pendência</h3>
        <SelectField aria-label="Com quem está" options={OWNERS} value={filters.owner} onChange={(owner) => setFilters({ owner })} />
      </div>

      <div className="filter-group">
        <h3>Tipo</h3>
        <ChipsEditor
          options={state.cardTypes.map((t) => ({ value: t.id, label: t.name }))}
          values={filters.typeIds}
          onChange={(typeIds) => setFilters({ typeIds })}
        />
      </div>

      {optionFields.map((f) => (
        <div key={f.id} className="filter-group">
          <h3>{f.name}</h3>
          <ChipsEditor
            options={
              f.kind === 'checkbox'
                ? [
                    { value: 'true', label: 'Sim' },
                    { value: 'false', label: 'Não' },
                  ]
                : f.options
            }
            values={filters.fields[f.id] ?? []}
            onChange={(next) => setFilters({ fields: { ...filters.fields, [f.id]: next } })}
          />
        </div>
      ))}

      <div className="filter-group">
        <h3>Data</h3>
        <SelectField
          aria-label="Campo de data"
          options={[
            { value: ANY_DATE, label: 'Qualquer data' },
            { value: 'createdAt', label: 'Criado em' },
            { value: 'updatedAt', label: 'Atualizado em' },
            ...dateFields.map((f) => ({ value: f.id, label: f.name })),
          ]}
          value={filters.dateField ?? ANY_DATE}
          onChange={(field) =>
            setFilters({
              dateField: field === ANY_DATE ? null : field,
              datePreset: field === ANY_DATE ? null : (filters.datePreset ?? '7d'),
            })
          }
        />
        {filters.dateField && (
          <SelectField
            aria-label="Período"
            options={PRESETS}
            value={filters.datePreset ?? '7d'}
            onChange={(datePreset) => setFilters({ datePreset })}
          />
        )}
        {filters.dateField && filters.datePreset === 'custom' && (
          <div className="row wrap">
            <TextField.Root
              type="date"
              aria-label="De"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ dateFrom: e.target.value })}
            />
            <span className="muted">até</span>
            <TextField.Root type="date" aria-label="Até" value={filters.dateTo} onChange={(e) => setFilters({ dateTo: e.target.value })} />
          </div>
        )}
      </div>

      <div className="filter-group">
        <h3>Relacionamentos</h3>
        <SelectField
          aria-label="Relacionamento"
          options={RELATIONS}
          value={filters.relation}
          onChange={(relation) => setFilters({ relation })}
        />
        <label className="row">
          <Checkbox checked={filters.includeRelated} onCheckedChange={(v) => setFilters({ includeRelated: v === true })} />
          Incluir pai e sub-tarefas dos resultados
        </label>
      </div>
    </div>
  );
}
