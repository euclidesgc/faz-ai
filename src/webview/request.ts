import type { Tracked, WebviewToHost } from '../shared/messages';
import { onHostMessage, postToHost } from './vscode';
import { beginRequest } from './inFlight';

/** Quanto tempo uma ação espera o `done` do host antes de desistir e destravar a tela. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Texto do toast quando o host não confirma a tempo (chave de i18n em `i18n/en/board.ts`). */
export const REQUEST_TIMEOUT_MESSAGE = 'O Faz AI demorou para responder. Confira se o editor ou o comando faz-ai ainda está aberto.';

const pending = new Set<() => void>();

/** Texto do erro com que um pedido em espera é encerrado ao descartar a página (ou, nos testes, entre um caso e outro). */
export const REQUEST_CANCELLED_MESSAGE = 'Pedido cancelado.';

/**
 * Desarma os pedidos em espera, rejeitando cada um: quem marcou um botão, um card ou a barra do topo como ocupado
 * solta a marca (a página está sendo descartada; nos testes, entre um caso e outro).
 */
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
  const end = beginRequest();
  const promise = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      off();
      clearTimeout(timer);
      pending.delete(cancel);
      end();
    };
    const cancel = () => {
      cleanup();
      reject(new Error(REQUEST_CANCELLED_MESSAGE));
    };
    pending.add(cancel);
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

/** A assistência pode durar mais que uma ação de banco e devolve uma proposta correlacionada. */
export function requestAgentAssistance(
  input: import('../shared/agentAssistance').AgentAssistInput,
  timeout: number,
): Promise<import('../shared/agentAssistance').AgentAssistResult> {
  const requestId = newRequestId();
  const end = beginRequest();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      off();
      clearTimeout(timer);
      pending.delete(cancel);
      end();
    };
    const cancel = () => {
      cleanup();
      reject(new Error(REQUEST_CANCELLED_MESSAGE));
    };
    const off = onHostMessage((message) => {
      if (message.type !== 'harness.agent.assistResult' || message.requestId !== requestId) return;
      cleanup();
      if (message.result) resolve(message.result);
      else reject(new Error(message.error ?? 'A IA não respondeu no formato esperado. Tente novamente.'));
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(REQUEST_TIMEOUT_MESSAGE));
    }, timeout);
    pending.add(cancel);
    try {
      postToHost({ type: 'harness.agent.assist', requestId, input });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/** A proposta da IA para a configuração de uma atividade: pode demorar, é só leitura e nunca grava. */
export function requestContextProposal(
  target: import('../shared/contextPlanning').ContextActivityTarget,
  language: import('../shared/language').Locale,
  timeout: number,
): Promise<import('../shared/contextProposal').ContextProposal> {
  const requestId = newRequestId();
  const end = beginRequest();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      off();
      clearTimeout(timer);
      pending.delete(cancel);
      end();
    };
    const cancel = () => {
      cleanup();
      reject(new Error(REQUEST_CANCELLED_MESSAGE));
    };
    const off = onHostMessage((message) => {
      if (message.type !== 'contextPlanning.propose.result' || message.requestId !== requestId) return;
      cleanup();
      if (message.proposal) resolve(message.proposal);
      else reject(new Error(message.error ?? 'A IA não respondeu no formato esperado. Tente novamente.'));
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(REQUEST_TIMEOUT_MESSAGE));
    }, timeout);
    pending.add(cancel);
    try {
      postToHost({ type: 'contextPlanning.propose', requestId, target, language });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/** Leituras e simulações compartilham correlação, cancelamento e limite de tempo com as ações. */
export function requestExecutionPolicy(
  input:
    | { type: 'executionPolicy.read'; id?: string; beforeRevision?: number }
    | { type: 'executionPolicy.simulate'; scenario: import('../shared/policyManagement').PolicyScenario }
    | { type: 'executionPolicy.assist'; input: import('../shared/policyAssistant').PolicyAssistInput },
  timeout: number = REQUEST_TIMEOUT_MS,
): Promise<import('../shared/policyManagement').PolicyReply> {
  const requestId = newRequestId();
  const end = beginRequest();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      off();
      clearTimeout(timer);
      pending.delete(cancel);
      end();
    };
    const cancel = () => {
      cleanup();
      reject(new Error(REQUEST_CANCELLED_MESSAGE));
    };
    const off = onHostMessage((message) => {
      if (message.type === 'done' && message.requestId === requestId && !message.ok) {
        cleanup();
        reject(new Error(message.error ?? 'Falhou.'));
        return;
      }
      if (message.type !== 'executionPolicy.result' || message.requestId !== requestId) return;
      cleanup();
      if (message.error) reject(new Error(message.error));
      else resolve(message);
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(REQUEST_TIMEOUT_MESSAGE));
    }, timeout);
    pending.add(cancel);
    try {
      postToHost({ ...input, requestId });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
