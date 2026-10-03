import { activeFilterCount, dateRange } from '../../shared/filters';
import { useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { ui } from '../commands';
import { isWeb } from '../vscode';
import { FilterPanel } from './FilterPanel';

const PRESETS: Record<string, string> = { today: 'hoje', '7d': 'últimos 7 dias', '30d': 'últimos 30 dias', custom: 'período' };
const RELATIONS: Record<string, string> = { withChildren: 'Com sub-tarefas', withoutChildren: 'Sem sub-tarefas', pendingChildren: 'Com sub-tarefas pendentes' };

/** Barra do board: busca e resumo dos filtros ativos. O painel completo fica na barra lateral do editor; no navegador, abre aqui mesmo. */
export function FilterBar() {
  const state = useBoardStore((s) => s.state)!;
  const filters = useBoardStore((s) => s.filters);
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const { setFilters, clearFilters, selectParent } = useBoardStore();

  const [panelOpen, setPanelOpen] = useState(false);

  const count = activeFilterCount(filters);
  const parent = state.cards.find((c) => c.id === selectedParentId);

  const chips: { key: string; label: string; clear(): void }[] = [];
  for (const id of filters.typeIds) {
    const t = state.cardTypes.find((x) => x.id === id);
    if (t) chips.push({ key: `t${id}`, label: `Tipo: ${t.name}`, clear: () => setFilters({ typeIds: filters.typeIds.filter((x) => x !== id) }) });
  }
  for (const [fieldId, values] of Object.entries(filters.fields)) {
    const f = state.fieldDefs.find((x) => x.id === fieldId);
    if (!f || !values.length) continue;
    const shown = f.kind === 'checkbox' ? values.map((v) => (v === 'true' ? 'Sim' : 'Não')) : values;
    chips.push({ key: `f${fieldId}`, label: `${f.name}: ${shown.join(', ')}`, clear: () => setFilters({ fields: { ...filters.fields, [fieldId]: [] } }) });
  }
  if (dateRange(filters, Date.now())) {
    const name = filters.dateField === 'createdAt' ? 'Criado' : filters.dateField === 'updatedAt' ? 'Atualizado' : state.fieldDefs.find((f) => f.id === filters.dateField)?.name ?? 'Data';
    const when = filters.datePreset === 'custom' ? [filters.dateFrom && `de ${filters.dateFrom}`, filters.dateTo && `até ${filters.dateTo}`].filter(Boolean).join(' ') : PRESETS[filters.datePreset!];
    chips.push({ key: 'date', label: `${name}: ${when}`, clear: () => setFilters({ dateField: null, datePreset: null }) });
  }
  if (filters.relation !== 'any') chips.push({ key: 'rel', label: RELATIONS[filters.relation]!, clear: () => setFilters({ relation: 'any' }) });
  if (filters.owner !== 'any') chips.push({ key: 'owner', label: filters.owner === 'human' ? 'Com você' : 'Com a IA', clear: () => setFilters({ owner: 'any' }) });
  if (parent) chips.push({ key: 'parent', label: `Sub-tarefas de: ${parent.title}`, clear: () => selectParent(null) });

  return (
    <div className="filterbar">
      <div className="filterbar-main">
        <input className="search" type="search" placeholder="Buscar em título, descrição, conversa e campos…" value={filters.text} onChange={(e) => setFilters({ text: e.target.value })} />
        <button className={panelOpen ? 'active' : ''} aria-expanded={isWeb ? panelOpen : undefined} onClick={() => (isWeb ? setPanelOpen(!panelOpen) : ui.showFilters())} title={isWeb ? 'Mostrar ou esconder os filtros' : 'Abrir os filtros na barra lateral'}>Filtros{count > 0 && ` (${count})`}</button>
        {chips.map((c) => (
          <span key={c.key} className="filter-chip" onClick={c.clear} title="Remover este filtro">{c.label} ✕</span>
        ))}
        {(count > 0 || parent) && <button className="ghost" onClick={clearFilters}>Limpar</button>}
      </div>
      {isWeb && panelOpen && <div className="filterbar-panel"><FilterPanel /></div>}
    </div>
  );
}
