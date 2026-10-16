import { create } from 'zustand';
import type { Id } from '../../shared/model';

interface BusyCardsStore {
  /** quantos pedidos ao host cada card tem em espera (só os que estão esperando) */
  counts: Record<Id, number>;
  begin(cardId: Id): void;
  end(cardId: Id): void;
}

/**
 * Cards com uma ação esperando o host (mover, arquivar, status, título, campo…): o card no board e o card
 * aberto mostram o spinner enquanto o pedido não volta. Store à parte do board para `commands.ts` poder
 * marcar sem depender do `boardStore` (que importa `commands`).
 */
export const useBusyCards = create<BusyCardsStore>((set, get) => ({
  counts: {},
  begin(cardId) {
    const counts = get().counts;
    set({ counts: { ...counts, [cardId]: (counts[cardId] ?? 0) + 1 } });
  },
  end(cardId) {
    const { [cardId]: n, ...rest } = get().counts;
    if (n === undefined) return;
    set({ counts: n > 1 ? { ...rest, [cardId]: n - 1 } : rest });
  },
}));

/** Marca o card como ocupado até a promessa do pedido terminar (bem ou mal); devolve a mesma promessa. */
export function trackCard(cardId: Id, promise: Promise<void>): Promise<void> {
  const { begin, end } = useBusyCards.getState();
  begin(cardId);
  promise.then(
    () => end(cardId),
    () => end(cardId),
  );
  return promise;
}

/** `true` enquanto o card tem um pedido esperando o host. */
export const useCardBusy = (cardId: Id): boolean => useBusyCards((s) => (s.counts[cardId] ?? 0) > 0);
