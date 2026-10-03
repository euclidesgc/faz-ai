import { useSyncExternalStore } from 'react';

// Um único relógio por minuto para a página toda, ligado só enquanto alguém o usa (não um timer por card).
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// sem ninguém inscrito o relógio está parado: renova a hora (estável dentro do mesmo segundo, como o React exige)
function snapshot(): number {
  if (!timer && Date.now() - now > 1000) now = Date.now();
  return now;
}

/** Hora atual, atualizada a cada minuto: para textos como "há 5 min". */
export const useNow = (): number => useSyncExternalStore(subscribe, snapshot, snapshot);
