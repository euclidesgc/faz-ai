import type { DatePreset, Filters, Relation } from '../../shared/filters';
import type { FieldDef } from '../../shared/model';
import { useBoardStore } from '../store/boardStore';

const toggle = (list: string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Grupos de filtro: tipo, campos, data e relacionamentos. */
export function FilterPanel() {
  const state = useBoardStore((s) => s.state)!;
  const filters = useBoardStore((s) => s.filters);
  const setFilters = useBoardStore((s) => s.setFilters);

  const optionFields = state.fieldDefs.filter((f) => f.kind === 'select' || f.kind === 'multiselect' || f.kind === 'checkbox');
  const dateFields = state.fieldDefs.filter((f) => f.kind === 'date');
  const setField = (f: FieldDef, value: string) => setFilters({ fields: { ...filters.fields, [f.id]: toggle(filters.fields[f.id] ?? [], value) } });

  return (
    <div className="filter-panel">
      <div className="filter-group">
        <h3>Pendência</h3>
        <select value={filters.owner} onChange={(e) => setFilters({ owner: e.target.value as Filters['owner'] })}>
          <option value="any">Qualquer</option>
          <option value="human">Com você (revisar, responder, desbloquear)</option>
          <option value="ai">Com a IA</option>
        </select>
      </div>

      <div className="filter-group">
        <h3>Tipo</h3>
        <div className="chips-editor">
          {state.cardTypes.map((t) => (
            <button key={t.id} className={`chip ${filters.typeIds.includes(t.id) ? 'on' : ''}`} onClick={() => setFilters({ typeIds: toggle(filters.typeIds, t.id) })}>{t.name}</button>
          ))}
        </div>
      </div>

      {optionFields.map((f) => (
        <div key={f.id} className="filter-group">
          <h3>{f.name}</h3>
          <div className="chips-editor">
            {(f.kind === 'checkbox' ? [['true', 'Sim'], ['false', 'Não']] : f.options.map((o) => [o, o])).map(([value, label]) => (
              <button key={value} className={`chip ${filters.fields[f.id]?.includes(value!) ? 'on' : ''}`} onClick={() => setField(f, value!)}>{label}</button>
            ))}
          </div>
        </div>
      ))}

      <div className="filter-group">
        <h3>Data</h3>
        <select value={filters.dateField ?? ''} onChange={(e) => setFilters({ dateField: e.target.value || null, datePreset: e.target.value ? filters.datePreset ?? '7d' : null })}>
          <option value="">Qualquer data</option>
          <option value="createdAt">Criado em</option>
          <option value="updatedAt">Atualizado em</option>
          {dateFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {filters.dateField && (
          <select value={filters.datePreset ?? '7d'} onChange={(e) => setFilters({ datePreset: e.target.value as DatePreset })}>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="custom">Período…</option>
          </select>
        )}
        {filters.dateField && filters.datePreset === 'custom' && (
          <div className="row wrap">
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ dateFrom: e.target.value })} />
            <span className="muted">até</span>
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ dateTo: e.target.value })} />
          </div>
        )}
      </div>

      <div className="filter-group">
        <h3>Relacionamentos</h3>
        <select value={filters.relation} onChange={(e) => setFilters({ relation: e.target.value as Relation })}>
          <option value="any">Qualquer</option>
          <option value="withChildren">Histórias com sub-tarefas</option>
          <option value="withoutChildren">Histórias sem sub-tarefas</option>
          <option value="pendingChildren">Histórias com sub-tarefas pendentes</option>
        </select>
        <label className="row">
          <input type="checkbox" checked={filters.includeRelated} onChange={(e) => setFilters({ includeRelated: e.target.checked })} />
          Incluir pai e sub-tarefas dos resultados
        </label>
      </div>

    </div>
  );
}
