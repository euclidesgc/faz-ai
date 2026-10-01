import type { FieldDef } from '../../shared/model';
import { useBoardStore } from '../store/boardStore';
import { activeFilterCount, type DatePreset, type Relation } from '../store/filters';

const toggle = (list: string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FilterBar() {
  const state = useBoardStore((s) => s.state)!;
  const { filters, filtersOpen, showArchived, selectedParentId, setFilters, clearFilters, toggleFiltersOpen, toggleArchived, selectParent } = useBoardStore();

  const count = activeFilterCount(filters);
  const parent = state.cards.find((c) => c.id === selectedParentId);
  const optionFields = state.fieldDefs.filter((f) => f.kind === 'select' || f.kind === 'multiselect' || f.kind === 'checkbox');
  const dateFields = state.fieldDefs.filter((f) => f.kind === 'date');
  const archivedCount = state.cards.filter((c) => c.archivedAt !== null && c.deletedAt === null).length;

  const setField = (f: FieldDef, value: string) => setFilters({ fields: { ...filters.fields, [f.id]: toggle(filters.fields[f.id] ?? [], value) } });

  return (
    <div className="filterbar">
      <div className="filterbar-main">
        <input className="search" type="search" placeholder="Buscar em título, descrição, comentários e campos…" value={filters.text} onChange={(e) => setFilters({ text: e.target.value })} />
        <button className={filtersOpen || count > (filters.text.trim() ? 1 : 0) ? 'active' : ''} onClick={toggleFiltersOpen}>
          Filtros{count > 0 && ` (${count})`}
        </button>
        <button className={showArchived ? 'active' : ''} onClick={toggleArchived} title="Mostrar ou esconder a coluna de arquivados">
          Arquivados{archivedCount > 0 && ` (${archivedCount})`}
        </button>
        {parent && (
          <span className="filter-chip" onClick={() => selectParent(null)} title="Mostrar sub-tarefas de todas as histórias">
            Sub-tarefas de: <strong>{parent.title}</strong> ✕
          </span>
        )}
        {(count > 0 || parent) && <button className="ghost" onClick={clearFilters}>Limpar</button>}
      </div>

      {filtersOpen && (
        <div className="filter-panel">
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
            <div className="row wrap">
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
                <>
                  <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ dateFrom: e.target.value })} />
                  <span className="muted">até</span>
                  <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ dateTo: e.target.value })} />
                </>
              )}
            </div>
          </div>

          <div className="filter-group">
            <h3>Relacionamentos</h3>
            <div className="row wrap">
              <select value={filters.relation} onChange={(e) => setFilters({ relation: e.target.value as Relation })}>
                <option value="any">Qualquer</option>
                <option value="withChildren">Histórias com sub-tarefas</option>
                <option value="withoutChildren">Histórias sem sub-tarefas</option>
                <option value="pendingChildren">Histórias com sub-tarefas pendentes</option>
              </select>
              <select value={selectedParentId ?? ''} onChange={(e) => selectParent(e.target.value || null)}>
                <option value="">Sub-tarefas de todas as histórias</option>
                {state.cards.filter((c) => !c.parentId && c.deletedAt === null && c.archivedAt === null).map((c) => <option key={c.id} value={c.id}>Sub-tarefas de: {c.title}</option>)}
              </select>
              <label className="row">
                <input type="checkbox" checked={filters.includeRelated} onChange={(e) => setFilters({ includeRelated: e.target.checked })} />
                Mostrar também o pai e as sub-tarefas dos resultados
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
