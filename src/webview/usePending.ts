import { useEffect, useState } from 'react';

/** Quanto tempo um valor pendente espera a confirmação do host antes de voltar ao confirmado. */
export const PENDING_TIMEOUT_MS = 3000;

/**
 * Valor otimista de um controle que só muda de verdade quando o `boardState` volta do host (~350 ms):
 * `mark(next)` mostra `next` na hora e marca o controle como ocupado; a pendência some quando o valor
 * confirmado chega a `next` ou, sem resposta, depois de `timeout` ms (aí volta ao confirmado).
 * Devolve `[valor a mostrar, ocupado, mark]`.
 */
export function usePending<T>(confirmed: T, timeout: number = PENDING_TIMEOUT_MS): [T, boolean, (next: T) => void] {
  const [pending, setPending] = useState<{ value: T } | null>(null);

  useEffect(() => {
    if (pending && Object.is(pending.value, confirmed)) setPending(null);
  }, [pending, confirmed]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), timeout);
    return () => clearTimeout(timer);
  }, [pending, timeout]);

  return [pending ? pending.value : confirmed, pending !== null, (next) => setPending({ value: next })];
}
