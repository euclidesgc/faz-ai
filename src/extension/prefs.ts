import { EMPTY_PREFS, type UiPrefs } from '../shared/prefs';
import type { Memento } from './viewState';

const KEY = 'fazai.prefs';

type Listener = (prefs: UiPrefs, origin: unknown) => void;

/**
 * Preferências da pessoa (avisos dispensados, última escolha do modo autônomo), guardadas por pessoa e
 * não por pasta: o `globalState` do editor, ou um arquivo na pasta de dados da CLI. Antes elas ficavam
 * só no estado do webview, que o editor descarta ao fechar o painel, e os avisos voltavam.
 */
export class PrefsStore {
  private prefs: UiPrefs;
  private listeners = new Set<Listener>();

  constructor(private memento: Memento) {
    this.prefs = { ...EMPTY_PREFS, ...memento.get<Partial<UiPrefs>>(KEY) };
  }

  get(): UiPrefs {
    return this.prefs;
  }

  /** `origin` identifica quem pediu a mudança, para não devolver o eco a ele. */
  update(patch: Partial<UiPrefs>, origin?: unknown): void {
    this.prefs = { ...this.prefs, ...patch };
    void this.memento.update(KEY, this.prefs);
    this.listeners.forEach((fn) => fn(this.prefs, origin));
  }

  onDidChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
