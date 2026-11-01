import { useSyncExternalStore } from 'react';

/**
 * Quantos pedidos com confirmação (`request()`) estão esperando o host agora. É o que a barra de progresso do topo
 * (`SyncBar`) observa: qualquer ação do board que vai ao host conta aqui, mesmo a que não tem um botão ou seção
 * próprios para mostrar a espera. Fica fora do store do board para `request.ts` não depender dele.
 */
let count = 0;
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach((fn) => fn());

/** Um pedido saiu; devolve a função que o dá por encerrado (idempotente). */
export function beginRequest(): () => void {
  count += 1;
  notify();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    count -= 1;
    notify();
  };
}

export const getInFlight = (): number => count;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `true` enquanto há pelo menos um pedido esperando o host. */
export function useInFlight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => count > 0,
    () => false,
  );
}

/** Zera a contagem (nos testes, entre um caso e outro). */
export function resetInFlight(): void {
  count = 0;
  notify();
}
