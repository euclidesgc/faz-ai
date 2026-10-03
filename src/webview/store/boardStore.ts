import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { BoardState, Id } from '../../shared/model';
import { isLive } from '../../shared/selectors';
import { EMPTY_FILTERS, applyFilters, type Filters, type ViewState } from '../../shared/filters';
import { getUiState, onHostMessage, postToHost, setUiState } from '../vscode';

export type View = 'board' | 'trash' | 'settings';
/** Abas da tela de Harness de IA: a ferramenta e a execução, o que é do projeto, e tudo que a ferramenta carrega. */
export type HarnessTab = 'tool' | 'project' | 'all';
export type SettingsTab = 'columns' | 'types' | 'fields' | 'rules' | 'models' | 'harness' | 'agents' | 'git' | 'appearance';

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
  settingsTab: SettingsTab;
  harnessTab: HarnessTab;
  /** menu lateral das configurações recolhido numa faixa de ícones */
  settingsNavCollapsed: boolean;
  openCardId: Id | null;
}

interface BoardStore extends UiState, ViewState {
  state: BoardState | null;
  attachmentsBaseUri: string;
  error: string | null;
  /** aviso informativo vindo do host */
  notice: string | null;
  dialog: DialogSpec | null;
  setState(state: BoardState, attachmentsBaseUri: string): void;
  setViewState(view: ViewState): void;
  setError(msg: string | null): void;
  setNotice(msg: string | null): void;
  setView(view: View): void;
  /** abre as configurações numa seção (fecha o card aberto) */
  openSettings(tab: SettingsTab): void;
  setSettingsNavCollapsed(collapsed: boolean): void;
  selectParent(id: Id | null): void;
  openCard(id: Id | null): void;
  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  /** abre/fecha uma linha ou coluna; `current` é o estado que está na tela */
  setCollapsed(key: string, collapsed: boolean): void;
  /** esquece a escolha manual, voltando ao padrão das configurações */
  resetCollapsed(key: string): void;
  ask(dialog: DialogSpec | null): void;
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
    notice: null,
    dialog: null,
    view: persisted?.view ?? 'board',
    settingsTab: persisted?.settingsTab ?? 'columns',
    harnessTab: persisted?.harnessTab ?? 'tool',
    settingsNavCollapsed: persisted?.settingsNavCollapsed ?? false,
    openCardId: persisted?.openCardId ?? null,
    filters: EMPTY_FILTERS,
    selectedParentId: null,
    collapsed: {},

    setState(state, attachmentsBaseUri) {
      const ids = new Set(state.cards.map((c) => c.id));
      const { selectedParentId, openCardId } = get();
      set({ state, attachmentsBaseUri, openCardId: openCardId && ids.has(openCardId) ? openCardId : null });
      // a história selecionada saiu do board (lixeira, arquivo ou apagada): limpa o filtro
      if (selectedParentId && !state.cards.some((c) => c.id === selectedParentId && isLive(c))) setShared({ selectedParentId: null });
      persist(get());
    },
    setViewState: (view) =>
      set({ filters: { ...EMPTY_FILTERS, ...view.filters }, selectedParentId: view.selectedParentId, collapsed: view.collapsed ?? {} }),
    setError: (error) => set({ error }),
    setNotice: (notice) => set({ notice }),
    setView(view) {
      set({ view });
      persist(get());
    },
    openSettings(settingsTab) {
      set({ view: 'settings', settingsTab, openCardId: null });
      persist(get());
    },
    setSettingsNavCollapsed(settingsNavCollapsed) {
      set({ settingsNavCollapsed });
      persist(get());
    },
    selectParent: (id) => setShared({ selectedParentId: get().selectedParentId === id ? null : id }),
    openCard(id) {
      set({ openCardId: id });
      persist(get());
    },
    setFilters: (patch) => setShared({ filters: { ...get().filters, ...patch } }),
    clearFilters: () => setShared({ filters: EMPTY_FILTERS, selectedParentId: null }),
    setCollapsed: (key, collapsed) => setShared({ collapsed: { ...get().collapsed, [key]: collapsed } }),
    resetCollapsed(key) {
      const { [key]: _drop, ...rest } = get().collapsed;
      setShared({ collapsed: rest });
    },
    ask: (dialog) => set({ dialog }),
  };
});

function persist(s: BoardStore): void {
  const ui: UiState = {
    view: s.view,
    settingsTab: s.settingsTab,
    harnessTab: s.harnessTab,
    settingsNavCollapsed: s.settingsNavCollapsed,
    openCardId: s.openCardId,
  };
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
      else if (msg.type === 'notice') s.setNotice(msg.message);
      else if (msg.type === 'ui.openCard') {
        s.setView('board');
        s.openCard(msg.cardId);
      }
    });
    postToHost({ type: 'ready' });
    return off;
  }, []);
}

/** Ids que passam nos filtros, ou null quando não há filtro ativo. */
export function useFilteredIds(): Set<Id> | null {
  const state = useBoardStore((s) => s.state);
  const filters = useBoardStore((s) => s.filters);
  return useMemo(() => (state ? applyFilters(state, filters) : null), [state, filters]);
}
