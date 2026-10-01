import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { BoardState, Card, Column, FieldDef, Id } from '../../shared/model';
import type { WebviewToHost } from '../../shared/messages';
import { EMPTY_FILTERS, applyFilters, type Filters, type ViewState } from '../../shared/filters';
import { getUiState, onHostMessage, postToHost, setUiState } from '../vscode';

export type View = 'board' | 'trash' | 'settings';

export interface DialogSpec {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** quando presente, mostra um seletor e passa o valor escolhido ao confirmar */
  choices?: { label: string; options: { value: string; label: string }[] };
  onConfirm(choice?: string): void;
  /** ação alternativa, mostrada entre Voltar e a confirmação */
  secondary?: { label: string; onClick(): void };
  cancelLabel?: string;
}

/** Estado só deste webview (o que é compartilhado com a barra lateral vive em ViewState, no host). */
interface UiState {
  view: View;
  openCardId: Id | null;
}

interface BoardStore extends UiState, ViewState {
  state: BoardState | null;
  attachmentsBaseUri: string;
  error: string | null;
  dialog: DialogSpec | null;
  setState(state: BoardState, attachmentsBaseUri: string): void;
  setViewState(view: ViewState): void;
  setError(msg: string | null): void;
  setView(view: View): void;
  selectParent(id: Id | null): void;
  openCard(id: Id | null): void;
  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  toggleArchived(): void;
  ask(dialog: DialogSpec | null): void;
  send(msg: WebviewToHost): void;
}

const persisted = getUiState<Partial<UiState>>();

export const useBoardStore = create<BoardStore>((set, get) => {
  /** aplica localmente e avisa o host, que repassa aos outros webviews */
  const setShared = (patch: Partial<ViewState>) => {
    set(patch);
    postToHost({ type: 'view.set', patch });
  };

  return {
    state: null,
    attachmentsBaseUri: '',
    error: null,
    dialog: null,
    view: persisted?.view ?? 'board',
    openCardId: persisted?.openCardId ?? null,
    filters: EMPTY_FILTERS,
    selectedParentId: null,
    showArchived: false,

    setState(state, attachmentsBaseUri) {
      const ids = new Set(state.cards.map((c) => c.id));
      const { selectedParentId, openCardId } = get();
      set({ state, attachmentsBaseUri, openCardId: openCardId && ids.has(openCardId) ? openCardId : null });
      // a história selecionada saiu do board (lixeira, arquivo ou apagada): limpa o filtro
      if (selectedParentId && !state.cards.some((c) => c.id === selectedParentId && isLive(c))) setShared({ selectedParentId: null });
      persist(get());
    },
    setViewState: (view) => set({ filters: { ...EMPTY_FILTERS, ...view.filters }, selectedParentId: view.selectedParentId, showArchived: view.showArchived }),
    setError: (error) => set({ error }),
    setView(view) {
      set({ view });
      persist(get());
    },
    selectParent: (id) => setShared({ selectedParentId: get().selectedParentId === id ? null : id }),
    openCard(id) {
      set({ openCardId: id });
      persist(get());
    },
    setFilters: (patch) => setShared({ filters: { ...get().filters, ...patch } }),
    clearFilters: () => setShared({ filters: EMPTY_FILTERS, selectedParentId: null }),
    toggleArchived: () => setShared({ showArchived: !get().showArchived }),
    ask: (dialog) => set({ dialog }),
    send: (msg) => postToHost(msg),
  };
});

function persist(s: BoardStore): void {
  const ui: UiState = { view: s.view, openCardId: s.openCardId };
  setUiState(ui);
}

/** Liga o store às mensagens do host. Usado pelo board e pela view de filtros. */
export function useHostSync(): void {
  useEffect(() => {
    const off = onHostMessage((msg) => {
      const s = useBoardStore.getState();
      if (msg.type === 'boardState') s.setState(msg.state, msg.attachmentsBaseUri);
      else if (msg.type === 'viewState') s.setViewState(msg.view);
      else if (msg.type === 'error') s.setError(msg.message);
      else if (msg.type === 'ui.openCard') {
        s.setView('board');
        s.openCard(msg.cardId);
      }
    });
    postToHost({ type: 'ready' });
    return off;
  }, []);
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

/** Ids que passam nos filtros, ou null quando não há filtro ativo. */
export function useFilteredIds(): Set<Id> | null {
  const state = useBoardStore((s) => s.state);
  const filters = useBoardStore((s) => s.filters);
  return useMemo(() => (state ? applyFilters(state, filters) : null), [state, filters]);
}
