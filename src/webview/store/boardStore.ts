import { useMemo } from 'react';
import { create } from 'zustand';
import type { BoardState, Card, Column, FieldDef, Id } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import { getUiState, postToHost, setUiState } from '../vscode';
import { EMPTY_FILTERS, applyFilters, type Filters } from './filters';

export type View = 'board' | 'trash' | 'settings';

export interface DialogSpec {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** quando presente, mostra um seletor e passa o valor escolhido ao confirmar */
  choices?: { label: string; options: { value: string; label: string }[] };
  onConfirm(choice?: string): void;
}

interface UiState {
  view: View;
  selectedParentId: Id | null;
  openCardId: Id | null;
  filters: Filters;
  filtersOpen: boolean;
  showArchived: boolean;
}

interface BoardStore extends UiState {
  state: BoardState | null;
  attachmentsBaseUri: string;
  error: string | null;
  dialog: DialogSpec | null;
  setState(state: BoardState, attachmentsBaseUri: string): void;
  setError(msg: string | null): void;
  setView(view: View): void;
  selectParent(id: Id | null): void;
  openCard(id: Id | null): void;
  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  toggleFiltersOpen(): void;
  toggleArchived(): void;
  ask(dialog: DialogSpec | null): void;
  send(msg: WebviewToHost): void;
}

const persisted = getUiState<Partial<UiState>>();

export const useBoardStore = create<BoardStore>((set, get) => ({
  state: null,
  attachmentsBaseUri: '',
  error: null,
  dialog: null,
  view: persisted?.view ?? 'board',
  selectedParentId: persisted?.selectedParentId ?? null,
  openCardId: persisted?.openCardId ?? null,
  filters: { ...EMPTY_FILTERS, ...persisted?.filters },
  filtersOpen: persisted?.filtersOpen ?? false,
  showArchived: persisted?.showArchived ?? false,

  setState(state, attachmentsBaseUri) {
    const ids = new Set(state.cards.map((c) => c.id));
    const live = new Set(state.cards.filter(isLive).map((c) => c.id));
    const { selectedParentId, openCardId } = get();
    set({
      state,
      attachmentsBaseUri,
      error: null,
      selectedParentId: selectedParentId && live.has(selectedParentId) ? selectedParentId : null,
      openCardId: openCardId && ids.has(openCardId) ? openCardId : null,
    });
    persist(get());
  },
  setError: (error) => set({ error }),
  setView(view) {
    set({ view });
    persist(get());
  },
  selectParent(id) {
    set((s) => ({ selectedParentId: s.selectedParentId === id ? null : id }));
    persist(get());
  },
  openCard(id) {
    set({ openCardId: id });
    persist(get());
  },
  setFilters(patch) {
    set((s) => ({ filters: { ...s.filters, ...patch } }));
    persist(get());
  },
  clearFilters() {
    set({ filters: EMPTY_FILTERS, selectedParentId: null });
    persist(get());
  },
  toggleFiltersOpen() {
    set((s) => ({ filtersOpen: !s.filtersOpen }));
    persist(get());
  },
  toggleArchived() {
    set((s) => ({ showArchived: !s.showArchived }));
    persist(get());
  },
  ask: (dialog) => set({ dialog }),
  send: (msg) => postToHost(msg),
}));

function persist(s: BoardStore): void {
  const ui: UiState = {
    view: s.view, selectedParentId: s.selectedParentId, openCardId: s.openCardId,
    filters: s.filters, filtersOpen: s.filtersOpen, showArchived: s.showArchived,
  };
  setUiState(ui);
}

// ---- seletores utilitários ----
export const isLive = (c: Card): boolean => c.deletedAt === null && c.archivedAt === null;

export const columnsOf = (state: BoardState, workflowId: Id): Column[] =>
  state.columns.filter((c) => c.workflowId === workflowId).sort((a, b) => a.position - b.position);

/** Cards ativos da coluna (fora da lixeira e do arquivo), em ordem. */
export const cardsIn = (state: BoardState, columnId: Id): Card[] =>
  state.cards.filter((c) => c.columnId === columnId && isLive(c)).sort((a, b) => a.position - b.position);

export const archivedIn = (state: BoardState, workflowId: Id): Card[] =>
  state.cards.filter((c) => c.workflowId === workflowId && c.archivedAt !== null && c.deletedAt === null).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

export const childrenOf = (state: BoardState, parentId: Id): Card[] => state.cards.filter((c) => c.parentId === parentId && c.deletedAt === null);

export const fieldsForType = (state: BoardState, typeId: Id): FieldDef[] =>
  state.fieldDefs.filter((f) => f.appliesToTypes === null || f.appliesToTypes.includes(typeId)).sort((a, b) => a.position - b.position);

export const valueOf = (state: BoardState, cardId: Id, fieldId: Id) =>
  state.fieldValues.find((v) => v.cardId === cardId && v.fieldId === fieldId)?.value ?? null;

/** Ids que passam nos filtros da barra, ou null quando não há filtro ativo. */
export function useFilteredIds(): Set<Id> | null {
  const state = useBoardStore((s) => s.state);
  const filters = useBoardStore((s) => s.filters);
  return useMemo(() => (state ? applyFilters(state, filters) : null), [state, filters]);
}
