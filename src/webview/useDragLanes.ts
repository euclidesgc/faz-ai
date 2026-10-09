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
      setSettled(null);
      setLanes(derived);
      lanesRef.current = derived;
      lastOver.current = [];
      recentlyMoved.current = false;
    },
    [derived],
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

      // faixas finais: muda de faixa se preciso; na mesma faixa, reordena pelo `over`
      let final = moveToLane(cur, id, overId, isBelow(e), archive);
      if (final === cur && overId !== id && !(overId in cur)) {
        const lane = laneOf(cur, id);
        if (lane !== undefined && laneOf(cur, overId) === lane) {
          const ids = cur[lane]!;
          final = { ...cur, [lane]: arrayMove(ids, ids.indexOf(id), ids.indexOf(overId)) };
        }
      }

      const drop = resolveDrop(state, final, id, workflow.id);
      if (drop.kind === 'none') return;
      if (drop.kind === 'archive') {
        requestArchive(id);
        return;
      }
      errorAtDrop.current = error;
      setSettled(final);
      if (drop.kind === 'move') {
        if (requestMove(id, drop.columnId, drop.position) === 'asked') setSettled(null);
        return;
      }
      cardCommands.unarchive(id, { columnId: drop.columnId, position: drop.position });
    },
    [discard, archive, state, workflow.id, error],
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
