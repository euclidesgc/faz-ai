import { useCallback, useEffect, useRef, useState } from 'react';

export interface Action<A extends unknown[]> {
  /** dispara a ação; devolve `true` quando deu certo. Um segundo clique enquanto ocupado é ignorado. */
  run(...args: A): Promise<boolean>;
  /** a ação está esperando o host */
  busy: boolean;
  /** o erro da última tentativa (já mostrado no toast; serve para a tela que quer o texto no lugar) */
  error: string | null;
  reset(): void;
}

/**
 * Espera de uma ação que vai ao host (`request()` por baixo): liga `busy` ao disparar e desliga quando o
 * `done` chega, falha ou estoura o tempo. Para valor otimista de um controle (um switch que deve virar na
 * hora) use `usePending`; para processos com vida própria (IA rodando, chat) use o estado do board.
 */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<void> | void): Action<A> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await latest.current(...args);
      return true;
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { run, busy, error, reset: () => setError(null) };
}
