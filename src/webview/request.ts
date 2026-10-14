import type { Tracked, WebviewToHost } from '../shared/messages';
import { onHostMessage, postToHost } from './vscode';

/** Quanto tempo uma ação espera o `done` do host antes de desistir e destravar a tela. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Texto do toast quando o host não confirma a tempo (chave de i18n em `i18n/en/board.ts`). */
export const REQUEST_TIMEOUT_MESSAGE = 'O Faz AI demorou para responder. Confira se o editor ou o comando faz-ai ainda está aberto.';

const pending = new Set<() => void>();

/** Desarma os pedidos em espera sem resolvê-los (a página está sendo descartada; nos testes, entre um caso e outro). */
export function cancelPendingRequests(): void {
  pending.forEach((cancel) => cancel());
  pending.clear();
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Array.from({ length: 16 }, () => Math.random().toString(36)[2] ?? '0').join('');
}

/**
 * Envia a mensagem ao host e espera o `done` dela: resolve quando o host terminou de tratá-la (o `boardState`
 * já chegou) e rejeita com o erro do host, com a falha de envio ou por tempo. O erro do host já virou toast; o
 * do tempo vira toast aqui. É o que `useAction` usa para o botão mostrar que está esperando.
 */
export function request(msg: WebviewToHost, opts: { timeout?: number } = {}): Promise<void> {
  const requestId = newRequestId();
  const promise = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      off();
      clearTimeout(timer);
      pending.delete(cleanup);
    };
    pending.add(cleanup);
    const off = onHostMessage((m) => {
      if (m.type !== 'done' || m.requestId !== requestId) return;
      cleanup();
      if (m.ok) resolve();
      else reject(new Error(m.error ?? 'Falhou.'));
    });
    const timer = setTimeout(() => {
      cleanup();
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'error', message: REQUEST_TIMEOUT_MESSAGE } }));
      reject(new Error(REQUEST_TIMEOUT_MESSAGE));
    }, opts.timeout ?? REQUEST_TIMEOUT_MS);
    postToHost({ ...msg, requestId } as Tracked);
  });
  // quem chama sem esperar (um `void cards.moveMany(...)`) não pode gerar rejeição sem tratamento
  promise.catch(() => {});
  return promise;
}
