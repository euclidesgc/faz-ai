import type { HostToWebview, Tracked } from '../shared/messages';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi | null = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

/** O board está numa página do navegador (servida pelo Faz AI), e não num webview do editor. */
export const isWeb: boolean = !api && typeof document !== 'undefined' && document.getElementById('root')?.dataset.host === 'web';

const UI_STATE_KEY = 'fazai.ui';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

// ---- transporte no navegador: SSE (host → página) e POST (página → host) ----
let connected = false;
const connectionListeners = new Set<(online: boolean) => void>();
const queue: Tracked[] = [];
const clientId = Array.from({ length: 16 }, () => Math.random().toString(36)[2] ?? '0').join('');

function deliver(msg: HostToWebview): void {
  window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

/** Falha antes de o host ver a mensagem: quem pediu confirmação não pode ficar esperando o `done` que nunca vem. */
function failLocally(msg: Tracked, message: string): void {
  deliver({ type: 'error', message });
  if (msg.requestId) deliver({ type: 'done', requestId: msg.requestId, ok: false, error: message });
}

function sendWeb(msg: Tracked): void {
  void fetch(`/message?c=${clientId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) })
    .then((res) => {
      if (res.status === 413) failLocally(msg, 'O arquivo é grande demais para enviar (limite de 20 MB).');
      else if (res.status === 401) failLocally(msg, 'O acesso a este board expirou. Abra o board de novo pelo editor ou pelo terminal.');
      else if (!res.ok) failLocally(msg, 'A sessão com o Faz AI acabou. Abra o board de novo pelo editor ou pelo terminal.');
    })
    .catch(() => {
      setConnected(false);
      if (msg.requestId) deliver({ type: 'done', requestId: msg.requestId, ok: false, error: 'Sem ligação com o Faz AI.' });
    });
}

function setConnected(online: boolean): void {
  if (connected === online) return;
  connected = online;
  connectionListeners.forEach((fn) => fn(online));
}

if (isWeb) {
  const events = new EventSource(`/events?c=${clientId}`);
  let opened = false;
  events.onopen = () => {
    setConnected(true);
    // ao reconectar, o host criou uma sessão nova: pede o board de novo
    if (opened) sendWeb({ type: 'ready' });
    opened = true;
    queue.splice(0).forEach(sendWeb);
  };
  events.onmessage = (e: MessageEvent<string>) => deliver(JSON.parse(e.data) as HostToWebview);
  events.onerror = () => setConnected(false);
}

/** No navegador, a escolha de arquivos é do próprio navegador: lê os arquivos e os envia como dados. */
function pickFilesInBrowser(cardId: string): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = () => {
    for (const file of Array.from(input.files ?? [])) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        deliver({ type: 'error', message: `"${file.name}" tem mais de 20 MB e não foi anexado.` });
        continue;
      }
      const reader = new FileReader();
      reader.onload = () =>
        postToHost({ type: 'attachment.addData', cardId, filename: file.name, base64: String(reader.result).split(',')[1] ?? '' });
      reader.readAsDataURL(file);
    }
  };
  input.click();
}

/** No navegador, exportar é baixar o arquivo pela rota do servidor; o aviso de resultado chega pelo canal de eventos. */
function exportInBrowser(): void {
  const link = document.createElement('a');
  link.href = `/backup/export?c=${clientId}`;
  link.download = '';
  link.click();
  deliver({ type: 'backup.done' });
}

/** No navegador, importar é escolher o arquivo e enviá-lo à rota do servidor, que devolve o resumo para a confirmação. */
function pickBackupInBrowser(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.oncancel = () => deliver({ type: 'backup.done' });
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return deliver({ type: 'backup.done' });
    fetch(`/backup/import?c=${clientId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: file })
      .then(async (res) => {
        if (res.ok) {
          const { token, summary } = (await res.json()) as Extract<HostToWebview, { type: 'backup.import.summary' }>;
          deliver({ type: 'backup.import.summary', token, summary });
        } else if (res.status === 413) deliver({ type: 'error', message: 'O arquivo é grande demais para enviar (limite de 200 MB).' });
        else deliver({ type: 'error', message: (await res.text()) || 'Não foi possível ler o arquivo.' });
      })
      .catch(() => deliver({ type: 'error', message: 'Sem ligação com o Faz AI. Abra o board de novo pelo editor ou pelo terminal.' }))
      .finally(() => deliver({ type: 'backup.done' }));
  };
  input.click();
}

export function postToHost(msg: Tracked): void {
  if (api) return api.postMessage(msg);
  if (!isWeb) {
    // fora do editor e do navegador não há host: confirma na hora para a tela não ficar esperando
    // a chave colada no Conectar não vai nem para o console de desenvolvimento
    console.log('[dev] postMessage', 'apiKey' in msg ? { ...msg, apiKey: '[credencial local]' } : msg);
    if (msg.requestId) deliver({ type: 'done', requestId: msg.requestId, ok: true });
    return;
  }
  if (msg.type === 'attachment.pick') return pickFilesInBrowser(msg.cardId);
  if (msg.type === 'backup.export') return exportInBrowser();
  if (msg.type === 'backup.import.pick') return pickBackupInBrowser();
  if (connected) sendWeb(msg);
  else queue.push(msg);
}

export function onHostMessage(handler: (msg: HostToWebview) => void): () => void {
  const listener = (e: MessageEvent<HostToWebview>) => handler(e.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** Avisa quando a página perde ou recupera a ligação com o Faz AI (só no navegador). */
export function onConnectionChange(fn: (online: boolean) => void): () => void {
  connectionListeners.add(fn);
  return () => connectionListeners.delete(fn);
}

export function getUiState<T>(): T | undefined {
  if (api) return (api.getState() as T | undefined) ?? undefined;
  try {
    return JSON.parse(sessionStorage.getItem(UI_STATE_KEY) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

export function setUiState(state: unknown): void {
  if (api) return api.setState(state);
  try {
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    /* armazenamento indisponível: a tela só não é lembrada */
  }
}
