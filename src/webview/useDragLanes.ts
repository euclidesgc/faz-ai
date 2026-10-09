import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { buildLanes, laneOf, lanesMatch, moveToLane, resolveDrop, type Lanes } from '../shared/dragLanes';
import { archiveKey } from '../shared/filters';
import type { BoardState, Card, Column, Workflow } from '../shared/model';
import { archivedIn, cardsIn } from '../shared/selectors';
import { cards as cardCommands } from './commands';
import { requestArchive, requestMove } from './store/actions';
import { useBoardStore } from './store/boardStore';

/** Quanto tempo a soltura otimista fica na tela sem o `boardState` equivalente nem erro. */
export const SETTLE_TIMEOUT_MS = 1500;

export interface DragLanesInput {
  workflow: Workflow;
  state: BoardState;
  /** colunas do workflow, na ordem exibida */
  columns: Column[];
  /** filtra os cards visíveis (filtros e história selecionada); estável entre renders */
  visible: (cards: Card[]) => Card[];
  /** `store.error`: quando passa a não nulo, a soltura otimista é descartada */
  error: string | null;
}

export interface DragLanesHandlers {
  onDragStart: (e: DragStartEvent) => void;
  onDragOver: (e: DragOverEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
  onDragCancel: () => void;
}

export interface DragLanesResult {
  /** cards renderizados por faixa (coluna ou arquivo); ids que sumiram do estado não aparecem */
  shown: Record<string, Card[]>;
  /** faixas durante o arraste (null fora dele) */
  lanes: Lanes | null;
  /** faixas da soltura otimista (null quando não há pendência) */
  settled: Lanes | null;
  activeId: string | null;
  handlers: DragLanesHandlers;
  collisionDetection: CollisionDetection;
}

const nextFrame = (fn: () => void): void => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else setTimeout(fn, 0);
};

/** `true` se o centro vertical do card arrastado está abaixo do centro do `over`. */
function isBelow(e: DragOverEvent | DragEndEvent): boolean {
  const a = e.active.rect.current.translated;
  const o = e.over?.rect;
  if (!a || !o) return false;
  return a.top + a.height / 2 > o.top + o.height / 2;
}

/**
 * Estado do arraste de um workflow: faixas (prévia entre colunas), colisão e soltura otimista.
 * Fora do arraste e sem pendência, as faixas são derivadas do `state`.
 */
export function useDragLanes({ workflow, state, columns, visible, error }: DragLanesInput): DragLanesResult {
  const archiveId = archiveKey(workflow.id);
  const [lanes, setLanes] = useState<Lanes | null>(null);
  const [settled, setSettled] = useState<Lanes | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lanesRef = useRef<Lanes | null>(null);
  const activeRef = useRef<string | null>(null);
  const lastOver = useRef<Collision[]>([]);
  const recentlyMoved = useRef(false);
  const errorAtDrop = useRef<string | null>(null);
  lanesRef.current = lanes;
  activeRef.current = activeId;

  const derived = useMemo(() => {
    const byColumn: Record<string, string[]> = {};
    for (const c of columns) byColumn[c.id] = visible(cardsIn(state, c.id)).map((x) => x.id);
    return buildLanes(
      columns.map((c) => c.id),
      byColumn,
      archiveId,
      visible(archivedIn(state, workflow.id)).map((x) => x.id),
    );
  }, [state, columns, visible, archiveId, workflow.id]);

  const archivedIds = useMemo(() => new Set(state.cards.filter((c) => c.archivedAt !== null).map((c) => c.id)), [state]);
  const archive = useMemo(() => ({ laneId: archiveId, archivedIds }), [archiveId, archivedIds]);

  const current = lanes ?? settled ?? derived;
  const shown = useMemo(() => {
    const byId = new Map(state.cards.map((c) => [c.id, c]));
    const out: Record<string, Card[]> = {};
    for (const [lane, ids] of Object.entries(current)) out[lane] = ids.map((id) => byId.get(id)).filter((c): c is Card => !!c);
    return out;
  }, [current, state]);

  // soltura otimista: descartada ao chegar estado equivalente ou ao surgir um erro novo
  useEffect(() => {
    if (!settled) return;
    if (lanesMatch(settled, derived) || (error !== null && error !== errorAtDrop.current)) setSettled(null);
  }, [settled, derived, error]);

  // ... ou, no máximo, depois de SETTLE_TIMEOUT_MS
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => setSettled(null), SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [settled]);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const id = String(e.active.id);
      setActiveId(id);
      activeRef.current = id;
      // parte da ordem que está na tela: a soltura anterior ainda pendente (`settled`), se houver
      const base = settled ?? derived;
      setSettled(null);
      setLanes(base);
      lanesRef.current = base;
      lastOver.current = [];
      recentlyMoved.current = false;
    },
    [derived, settled],
  );

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      const cur = lanesRef.current;
      if (!cur || !e.over || recentlyMoved.current) return;
      const next = moveToLane(cur, String(e.active.id), String(e.over.id), isBelow(e), archive);
      if (next === cur) return;
      lanesRef.current = next;
      setLanes(next);
      recentlyMoved.current = true;
      nextFrame(() => {
        recentlyMoved.current = false;
      });
    },
    [archive],
  );

  const discard = useCallback(() => {
    setActiveId(null);
    activeRef.current = null;
    setLanes(null);
    lanesRef.current = null;
    lastOver.current = [];
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const cur = lanesRef.current;
      discard();
      if (!cur || !e.over) return;
      const id = String(e.active.id);
      const overId = String(e.over.id);

      // faixas finais: muda de faixa se preciso; na mesma faixa, reordena pelo `over`.
      // Vale também para o card que a prévia já trocou de faixa: o `SortableContext` desenha o card no lugar do `over`
      // (antes dele se estava depois, depois dele se estava antes), e a soltura tem de repetir o que a pessoa vê.
      let final = moveToLane(cur, id, overId, isBelow(e), archive);
      if (final === cur && overId !== id && !(overId in cur)) {
        const lane = laneOf(cur, id);
        if (lane !== undefined && laneOf(cur, overId) === lane) {
          const ids = cur[lane]!;
          final = { ...cur, [lane]: arrayMove(ids, ids.indexOf(id), ids.indexOf(overId)) };
        }
      }

      // card vivo solto sobre o arquivo (ou sobre um card dele): a prévia não o move, mas a soltura o arquiva
      const from = laneOf(final, id);
      if (
        final === cur &&
        !archivedIds.has(id) &&
        from !== undefined &&
        from !== archiveId &&
        (overId === archiveId || laneOf(cur, overId) === archiveId)
      ) {
        final = { ...cur, [from]: cur[from]!.filter((x) => x !== id), [archiveId]: [id, ...(cur[archiveId] ?? [])] };
      }

      const drop = resolveDrop(state, final, id, workflow.id);
      if (drop.kind === 'none') return;
      errorAtDrop.current = error;
      setSettled(final);
      if (drop.kind === 'archive') {
        // sem o `settled` o card volta por um instante ao lugar antigo até o `boardState` chegar (arquivado mais novo vai no topo)
        requestArchive(id);
        if (useBoardStore.getState().dialog) setSettled(null);
        return;
      }
      if (drop.kind === 'move') {
        if (requestMove(id, drop.columnId, drop.position) === 'asked') setSettled(null);
        return;
      }
      cardCommands.unarchive(id, { columnId: drop.columnId, position: drop.position });
    },
    [discard, archive, archiveId, archivedIds, state, workflow.id, error],
  );

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      let hits = pointerWithin(args);
      if (!hits.length) hits = rectIntersection(args);
      const first = hits[0];
      if (!first) return lastOver.current;
      const cur = lanesRef.current;
      const firstId = String(first.id);
      const active = activeRef.current;
      const liveOverArchive = firstId === archiveId && active !== null && !archivedIds.has(active);
      if (cur && firstId in cur && !liveOverArchive) {
        const ids = (cur[firstId] ?? []).filter((x) => x !== active);
        if (ids.length) {
          const containers = args.droppableContainers.filter((c) => ids.includes(String(c.id)));
          const closest = closestCenter({ ...args, droppableContainers: containers });
          if (closest.length) hits = closest;
        }
      }
      lastOver.current = hits;
      return hits;
    },
    [archiveId, archivedIds],
  );

  return {
    shown,
    lanes,
    settled,
    activeId,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: discard },
    collisionDetection,
  };
}
