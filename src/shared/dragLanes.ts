import type { BoardState, Id } from './model';
import { archiveKey } from './filters';
import { cardsIn } from './selectors';

// Lógica pura das faixas de arraste do board (sem React nem dnd-kit).
// Faixa = coluna (id da coluna) ou a coluna de Arquivados (`archiveKey(workflowId)`).

/** Faixas: id da faixa -> ids dos cards visíveis, na ordem exibida. */
export type Lanes = Record<string, string[]>;

/** O que fazer ao soltar o card. */
export type DropResult =
  | { kind: 'none' }
  | { kind: 'archive' }
  | { kind: 'move'; columnId: Id; position: number }
  | { kind: 'unarchive'; columnId: Id; position: number };

/** Identifica a faixa de arquivados e quais cards são arquivados (só eles trocam de faixa com ela). */
export interface ArchiveLane {
  laneId: string;
  archivedIds: ReadonlySet<string>;
}

/** Monta as faixas: uma por coluna (na ordem dada) mais a de arquivados. */
export function buildLanes(
  columnIds: string[],
  visibleIdsByColumn: Record<string, string[]>,
  archiveId: string,
  archivedVisibleIds: string[],
): Lanes {
  const lanes: Lanes = {};
  for (const id of columnIds) lanes[id] = [...(visibleIdsByColumn[id] ?? [])];
  lanes[archiveId] = [...archivedVisibleIds];
  return lanes;
}

const at = (lanes: Lanes, id: string): string[] => lanes[id] ?? [];

/** Faixa em que o card está, ou undefined se nenhuma o contém. */
export function laneOf(lanes: Lanes, cardId: string): string | undefined {
  return Object.keys(lanes).find((k) => at(lanes, k).includes(cardId));
}

/**
 * Prévia do arraste: tira `activeId` da faixa de origem e o põe na do `overId` (um card ou uma faixa).
 * Posição: a do card `over`, +1 se `below`; faixa vazia ou `overId` = faixa -> fim.
 * Mesma faixa, `overId` desconhecido ou card vivo sobre a faixa de arquivados -> devolve o mesmo objeto.
 * `archive` só é preciso para aplicar a regra dos arquivados.
 */
export function moveToLane(lanes: Lanes, activeId: string, overId: string, below: boolean, archive?: ArchiveLane): Lanes {
  const from = laneOf(lanes, activeId);
  const to = overId in lanes ? overId : laneOf(lanes, overId);
  if (from === undefined || to === undefined || from === to) return lanes;
  if (archive && to === archive.laneId && !archive.archivedIds.has(activeId)) return lanes;

  const target = at(lanes, to);
  const overIndex = overId in lanes ? -1 : target.indexOf(overId);
  const index = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0);
  return {
    ...lanes,
    [from]: at(lanes, from).filter((id) => id !== activeId),
    [to]: [...target.slice(0, index), activeId, ...target.slice(index)],
  };
}

/**
 * Traduz as faixas finais no que enviar ao host.
 * `position` é contado em `cardsIn(coluna)` sem o ativo: antes do próximo vizinho visível; senão logo depois
 * do anterior; senão no fim. Mesma coluna e mesmo índice -> `none`. Vivo na faixa de arquivados -> `archive`;
 * arquivado de volta ao arquivo -> `none`; arquivado numa coluna -> `unarchive`.
 */
export function resolveDrop(state: BoardState, lanes: Lanes, activeId: string, workflowId: Id): DropResult {
  const lane = laneOf(lanes, activeId);
  const active = state.cards.find((c) => c.id === activeId);
  if (lane === undefined || !active) return { kind: 'none' };
  const archived = active.archivedAt !== null;

  if (lane === archiveKey(workflowId)) return archived ? { kind: 'none' } : { kind: 'archive' };

  const full = cardsIn(state, lane)
    .map((c) => c.id)
    .filter((id) => id !== activeId);
  const ids = at(lanes, lane);
  const i = ids.indexOf(activeId);
  // Vizinhos que sumiram do estado (ou estão escondidos) são pulados: só contam os que existem em `full`.
  const next = ids.slice(i + 1).find((id) => full.includes(id));
  const prev = ids
    .slice(0, i)
    .reverse()
    .find((id) => full.includes(id));
  const position = next !== undefined ? full.indexOf(next) : prev !== undefined ? full.indexOf(prev) + 1 : full.length;

  if (archived) return { kind: 'unarchive', columnId: lane, position };
  if (active.columnId === lane && cardsIn(state, lane).findIndex((c) => c.id === activeId) === position) return { kind: 'none' };
  return { kind: 'move', columnId: lane, position };
}

/** Duas faixas iguais: mesmas chaves e, em cada uma, os mesmos ids na mesma ordem. */
export function lanesMatch(a: Lanes, b: Lanes): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => k in b && at(a, k).length === at(b, k).length && at(a, k).every((id, i) => id === at(b, k)[i]));
}
