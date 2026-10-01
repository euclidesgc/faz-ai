import type { HostToWebview, WebviewToHost } from '../shared/messages';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi | null = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export function postToHost(msg: WebviewToHost): void {
  if (api) api.postMessage(msg);
  else console.log('[dev] postMessage', msg);
}

export function onHostMessage(handler: (msg: HostToWebview) => void): () => void {
  const listener = (e: MessageEvent<HostToWebview>) => handler(e.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export function getUiState<T>(): T | undefined {
  return (api?.getState() as T | undefined) ?? undefined;
}

export function setUiState(state: unknown): void {
  api?.setState(state);
}
