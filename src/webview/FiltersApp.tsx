import { useAppearance } from './appearance';
import { activeFilterCount } from '../shared/filters';
import { FilterPanel } from './components/FilterPanel';
import { TextField } from '@radix-ui/themes';
import { Button } from './components/ui';
import { isLive } from '../shared/selectors';
import { useBoardStore, useFilteredIds, useHostSync } from './store/boardStore';

/** Conteúdo da seção "Filtros" na barra lateral. */
export function FiltersApp() {
  useHostSync();
  useAppearance();
  const state = useBoardStore((s) => s.state);
  const filters = useBoardStore((s) => s.filters);
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const { setFilters, clearFilters } = useBoardStore();
  const matched = useFilteredIds();

  if (!state) return <div className="loading">Carregando…</div>;
  const active = activeFilterCount(filters) + (selectedParentId ? 1 : 0);
  const total = state.cards.filter(isLive).length;
  const shown = matched ? state.cards.filter((c) => matched.has(c.id) && c.archivedAt === null).length : total;

  return (
    <div className="filters-view">
      <TextField.Root
        className="search"
        type="search"
        aria-label="Buscar"
        placeholder="Buscar palavras-chave…"
        value={filters.text}
        onChange={(e) => setFilters({ text: e.target.value })}
      />
      <div className="row">
        <span className="muted small">{active ? `${shown} de ${total} cards` : `${total} cards`}</span>
        <span className="spacer" />
        {active > 0 && (
          <Button variant="ghost" size="small" onClick={clearFilters}>
            Limpar ({active})
          </Button>
        )}
      </div>
      <FilterPanel />
    </div>
  );
}
