import { EMPTY_FILTERS, EMPTY_VIEW_STATE, type ViewState } from '../shared/filters';

const KEY = 'fazai.viewState';

/** Onde o estado fica guardado: o workspaceState do editor ou um arquivo, fora dele. */
export interface Memento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): unknown;
}

type Listener = (state: ViewState, origin: unknown) => void;

/** Filtros e opções de visualização, compartilhados entre o board e a barra lateral e persistidos por workspace. */
export class ViewStateStore {
  private state: ViewState;
  private listeners = new Set<Listener>();

  constructor(private memento: Memento) {
    const saved = memento.get<Partial<ViewState>>(KEY);
    this.state = { filters: { ...EMPTY_FILTERS, ...saved?.filters }, selectedParentId: saved?.selectedParentId ?? null, collapsed: { ...EMPTY_VIEW_STATE.collapsed, ...saved?.collapsed } };
  }

  get(): ViewState {
    return this.state;
  }

  /** `origin` identifica quem pediu a mudança, para não devolver o eco a ele. */
  update(patch: Partial<ViewState>, origin?: unknown): void {
    this.state = { ...this.state, ...patch };
    void this.memento.update(KEY, this.state);
    this.listeners.forEach((fn) => fn(this.state, origin));
  }

  onDidChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
