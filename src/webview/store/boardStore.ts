import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import type { BoardState, Id } from '../../shared/model';
import { isLive } from '../../shared/selectors';
import { EMPTY_FILTERS, applyFilters, type Filters, type ViewState } from '../../shared/filters';
import { EMPTY_METRICS_FILTERS, type MetricsBreakdownDim, type MetricsFilters, type MetricsMeasure } from '../../shared/metrics';
import { getUiState, onHostMessage, postToHost, setUiState } from '../vscode';
import { formatBytes, type ImportSummary } from '../../shared/backup';
import { formatDateTime, t } from '../i18n';
import { backup } from '../commands';

/** Ordenação de uma tabela do painel: `key` é o id da coluna; `null` em `MetricsBlocksState` = o padrão do bloco. */
export interface MetricsSort {
  key: string;
  dir: 'asc' | 'desc';
}

/**
 * Escolhas dos blocos do painel de métricas (card 173): a dimensão e a medida dos cortes e a ordenação
 * de cada tabela. Mesma regra dos filtros: fora de `persist()`; trocar de visão conserva, reabrir o
 * board volta ao padrão. `null` na ordenação = o padrão do bloco (o ranking por card decide pelo custo
 * medido, RF-22), que só quem desenha a tabela sabe.
 */
export interface MetricsBlocksState {
  dim: MetricsBreakdownDim;
  measure: MetricsMeasure;
  cardSort: MetricsSort | null;
  phaseSort: MetricsSort | null;
  leadSort: MetricsSort | null;
}

export const DEFAULT_METRICS_BLOCKS: MetricsBlocksState = {
  dim: 'phase',
  measure: 'cost',
  cardSort: null,
  phaseSort: null,
  leadSort: null,
};

/** `environment`: o Diagnóstico do ambiente, aberto pelas Configurações ou sozinho na primeira abertura */
export type View = 'board' | 'trash' | 'settings' | 'metrics' | 'environment';
/** Abas da tela de Harness de IA: a ferramenta e a execução, o que é do projeto, e tudo que a ferramenta carrega. */
export type HarnessTab = 'tool' | 'project' | 'user' | 'all';
import { type SettingsTab } from '../../shared/settingsTab';
import { SETTINGS_SECTIONS } from '../../shared/settingsSections';
export type { SettingsTab };

export interface DialogSpec {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** quando presente, mostra um seletor e passa o valor escolhido ao confirmar */
  choices?: { label: string; options: { value: string; label: string }[] };
  onConfirm(choice?: string): void;
  /** chamada quando a pessoa desiste (botão, Escape ou clique fora) */
  onCancel?(): void;
  /** ação alternativa, mostrada entre Voltar e a confirmação */
  secondary?: { label: string; onClick(): void };
  cancelLabel?: string;
}

/**
 * Anexo aberto na modal de visualização/edição. Guarda só o id: o `Attachment` completo vem de
 * `state.attachments`, para a modal nunca mostrar dados velhos de um anexo que mudou ou saiu da lista.
 */
export interface AttachmentModalState {
  attachmentId: Id;
}

/** Estado só deste webview (o que é compartilhado com a barra lateral vive em ViewState, no host). */
interface UiState {
  view: View;
  settingsTab: SettingsTab;
  harnessTab: HarnessTab;
  /** menu lateral das configurações recolhido numa faixa de ícones */
  settingsNavCollapsed: boolean;
  openCardId: Id | null;
  /** modelo e esforço escolhidos no chat (valor do campo Modelo); null = o padrão da ferramenta */
  chatModel: string | null;
}

interface BoardStore extends UiState, ViewState {
  state: BoardState | null;
  /** o chat está aberto no painel lateral do board (no navegador; no editor ele fica na barra lateral) */
  chatOpen: boolean;
  setChatOpen(open: boolean): void;
  setChatModel(model: string | null): void;
  attachmentsBaseUri: string;
  error: string | null;
  /** aviso informativo vindo do host */
  notice: string | null;
  dialog: DialogSpec | null;
  /** anexo aberto na modal; null quando não há modal de anexo na tela */
  attachmentModal: AttachmentModalState | null;
  /** backup do board em andamento: exportando, ou lendo o arquivo escolhido para importar */
  backupBusy: 'export' | 'import' | null;
  setBackupBusy(busy: 'export' | 'import' | null): void;
  setState(state: BoardState, attachmentsBaseUri: string): void;
  setViewState(view: ViewState): void;
  setError(msg: string | null): void;
  setNotice(msg: string | null): void;
  setView(view: View): void;
  /** abre as configurações numa seção (fecha o card aberto) */
  openSettings(tab: SettingsTab): void;
  /**
   * Leva até uma seção de Configurações (usada por `DependsOn` e por links internos entre telas):
   * troca a aba (e a sub-aba de Harness, quando a seção mora lá) e marca `pendingSettingsSection`
   * para a tela rolar e destacar ao renderizar. `section` sem entrada em `SETTINGS_SECTIONS` só
   * marca a pendência, sem trocar de aba (ver `settingsSections.ts`).
   */
  goToSection(section: string): void;
  /** id da seção até onde a tela de Configurações deve rolar ao abrir (vindo de `ui.openSettings`), ou null */
  pendingSettingsSection: string | null;
  clearPendingSettingsSection(): void;
  setSettingsNavCollapsed(collapsed: boolean): void;
  selectParent(id: Id | null): void;
  /**
   * Seleção múltipla de cards no board (card 324): conceito novo e separado de `selectedParentId`
   * (que é single-select e filtra sub-tarefas). Só local a este webview: não vai para `ViewState`
   * nem é persistida.
   */
  selectedIds: Set<Id>;
  toggleSelected(id: Id): void;
  clearSelected(): void;
  openCard(id: Id | null): void;
  setFilters(patch: Partial<Filters>): void;
  clearFilters(): void;
  /**
   * Filtros do painel de métricas. Ficam fora de `persist()` de propósito: trocar de visão conserva
   * o que a pessoa escolheu, e reabrir o board volta ao padrão (`12m`, todos os workflows).
   */
  metricsFilters: MetricsFilters;
  setMetricsFilters(patch: Partial<MetricsFilters>): void;
  clearMetricsFilters(): void;
  /** dimensão, medida e ordenação dos blocos do painel (fora de `persist()`, como os filtros) */
  metricsBlocks: MetricsBlocksState;
  setMetricsBlocks(patch: Partial<MetricsBlocksState>): void;
  /** abre/fecha uma linha ou coluna; `current` é o estado que está na tela */
  setCollapsed(key: string, collapsed: boolean): void;
  /** abre/fecha vários cards (`card:<id>`) numa única escrita, em vez de uma por card */
  setManyCollapsed(ids: Id[], collapsed: boolean): void;
  /** esquece a escolha manual, voltando ao padrão das configurações */
  resetCollapsed(key: string): void;
  ask(dialog: DialogSpec | null): void;
  /** abre a modal de um anexo (visualização; a edição é escolhida dentro dela) */
  openAttachmentModal(attachmentId: Id): void;
  closeAttachmentModal(): void;
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
    attachmentModal: null,
    backupBusy: null,
    setBackupBusy: (backupBusy) => set({ backupBusy }),
    // o Diagnóstico é de passagem: ao reabrir, volta para o board
    view: persisted?.view === 'environment' ? 'board' : (persisted?.view ?? 'board'),
    settingsTab: persisted?.settingsTab ?? 'columns',
    harnessTab: persisted?.harnessTab ?? 'tool',
    settingsNavCollapsed: persisted?.settingsNavCollapsed ?? false,
    openCardId: persisted?.openCardId ?? null,
    chatModel: persisted?.chatModel ?? null,
    chatOpen: false,
    setChatOpen: (chatOpen) => set({ chatOpen }),
    setChatModel(chatModel) {
      set({ chatModel });
      persist(get());
    },
    filters: EMPTY_FILTERS,
    selectedParentId: null,
    selectedIds: new Set(),
    collapsed: {},

    setState(state, attachmentsBaseUri) {
      const ids = new Set(state.cards.map((c) => c.id));
      const { selectedParentId, selectedIds, openCardId } = get();
      set({ state, attachmentsBaseUri, openCardId: openCardId && ids.has(openCardId) ? openCardId : null });
      // a história selecionada saiu do board (lixeira, arquivo ou apagada): limpa o filtro
      if (selectedParentId && !state.cards.some((c) => c.id === selectedParentId && isLive(c))) setShared({ selectedParentId: null });
      // o mesmo, mas para a seleção múltipla: tira da seleção quem saiu do board ou não está mais vivo
      const prunedIds = new Set([...selectedIds].filter((id) => state.cards.some((c) => c.id === id && isLive(c))));
      if (prunedIds.size !== selectedIds.size) set({ selectedIds: prunedIds });
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
      set({ view: 'settings', settingsTab, openCardId: null, attachmentModal: null });
      persist(get());
    },
    goToSection(section) {
      const info = SETTINGS_SECTIONS[section];
      if (info) {
        set({
          view: 'settings',
          settingsTab: info.tab,
          ...(info.harnessTab && { harnessTab: info.harnessTab as HarnessTab }),
          pendingSettingsSection: section,
        });
        persist(get());
      } else {
        set({ pendingSettingsSection: section });
      }
    },
    pendingSettingsSection: null,
    clearPendingSettingsSection: () => set({ pendingSettingsSection: null }),
    setSettingsNavCollapsed(settingsNavCollapsed) {
      set({ settingsNavCollapsed });
      persist(get());
    },
    selectParent: (id) => setShared({ selectedParentId: get().selectedParentId === id ? null : id }),
    toggleSelected(id) {
      const next = new Set(get().selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set({ selectedIds: next });
    },
    clearSelected: () => set({ selectedIds: new Set() }),
    openCard(id) {
      // trocar (ou fechar) o card deixa a modal de anexo sem contexto: fecha junto
      set({ openCardId: id, attachmentModal: null });
      persist(get());
    },
    setFilters: (patch) => setShared({ filters: { ...get().filters, ...patch } }),
    clearFilters: () => setShared({ filters: EMPTY_FILTERS, selectedParentId: null }),
    metricsFilters: EMPTY_METRICS_FILTERS,
    setMetricsFilters: (patch) => set({ metricsFilters: { ...get().metricsFilters, ...patch } }),
    clearMetricsFilters: () => set({ metricsFilters: EMPTY_METRICS_FILTERS }),
    metricsBlocks: DEFAULT_METRICS_BLOCKS,
    setMetricsBlocks: (patch) => set({ metricsBlocks: { ...get().metricsBlocks, ...patch } }),
    setCollapsed: (key, collapsed) => setShared({ collapsed: { ...get().collapsed, [key]: collapsed } }),
    setManyCollapsed(ids, collapsed) {
      const patch: Record<string, boolean> = {};
      for (const id of ids) patch[`card:${id}`] = collapsed;
      setShared({ collapsed: { ...get().collapsed, ...patch } });
    },
    resetCollapsed(key) {
      const { [key]: _drop, ...rest } = get().collapsed;
      setShared({ collapsed: rest });
    },
    ask: (dialog) => set({ dialog }),
    openAttachmentModal: (attachmentId) => set({ attachmentModal: { attachmentId } }),
    closeAttachmentModal: () => set({ attachmentModal: null }),
  };
});

function persist(s: BoardStore): void {
  const ui: UiState = {
    view: s.view,
    settingsTab: s.settingsTab,
    harnessTab: s.harnessTab,
    settingsNavCollapsed: s.settingsNavCollapsed,
    openCardId: s.openCardId,
    chatModel: s.chatModel,
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
      else if (msg.type === 'error') {
        s.setError(msg.message);
        s.setBackupBusy(null);
      } else if (msg.type === 'notice') s.setNotice(msg.message);
      else if (msg.type === 'backup.done') s.setBackupBusy(null);
      else if (msg.type === 'backup.import.summary') {
        s.setBackupBusy(null);
        s.ask(importDialog(msg.token, msg.summary));
      } else if (msg.type === 'ui.openCard') {
        s.setView('board');
        s.openCard(msg.cardId);
      } else if (msg.type === 'ui.openSettings') {
        const info = msg.section ? SETTINGS_SECTIONS[msg.section] : undefined;
        s.openSettings(msg.tab);
        useBoardStore.setState({
          pendingSettingsSection: msg.section ?? null,
          ...(info?.harnessTab && { harnessTab: info.harnessTab as HarnessTab }),
        });
      } else if (msg.type === 'ui.openView') s.setView(msg.view);
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

/** O diálogo de confirmação da importação: o resumo do arquivo e o aviso de que o board atual será apagado. */
export function importDialog(token: string, summary: ImportSummary): DialogSpec {
  const when = summary.exportedAt ? formatDateTime(Date.parse(summary.exportedAt)) : '?';
  const intro = t(
    'Board "{name}" com {cards} card(s) e {attachments} anexo(s), {size}, exportado em {date} pelo Faz AI {version} (formato {format}).',
    {
      name: summary.boardName,
      cards: summary.cards,
      attachments: summary.attachments,
      size: formatBytes(summary.sizeBytes),
      date: when,
      version: summary.extensionVersion || '?',
      format: summary.formatVersion,
    },
  );
  const large = summary.large ? ` ${t('O arquivo tem mais de 200 MB: a importação pode demorar.')}` : '';
  const warning = t(
    'Tudo o que está neste board será apagado e substituído. Uma cópia de segurança (.bak) fica ao lado do banco, e os anexos atuais vão para uma pasta de backup ao lado da pasta de anexos.',
  );
  return {
    title: t('Substituir o board atual?'),
    message: `${intro}${large} ${warning}`,
    confirmLabel: t('Importar e substituir'),
    danger: true,
    onConfirm: () => backup.importApply(token),
    onCancel: () => backup.importCancel(token),
  };
}
