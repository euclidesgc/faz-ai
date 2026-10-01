import type * as vscode from 'vscode';
import { EMPTY_FILTERS, EMPTY_VIEW_STATE, type ViewState } from '../shared/filters';

const KEY = 'fazai.viewState';

type Listener = (state: ViewState, origin: unknown) => void;

/** Filtros e opções de visualização, compartilhados entre o board e a barra lateral e persistidos por workspace. */
export class ViewStateStore {
  private state: ViewState;
  private listeners = new Set<Listener>();

  constructor(private memento: vscode.Memento) {
    const saved = memento.get<Partial<ViewState>>(KEY);
    this.state = { ...EMPTY_VIEW_STATE, ...saved, filters: { ...EMPTY_FILTERS, ...saved?.filters } };
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
