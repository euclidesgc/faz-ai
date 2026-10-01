import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card as CardModel, Workflow } from '../../shared/model';
import { archivedIn, cardsIn, columnsOf, useBoardStore, useFilteredIds } from '../store/boardStore';
import { requestArchive, requestMove } from '../store/actions';
import { Column } from './Column';
import { CardView, SortableCard } from './Card';

const archiveId = (workflowId: string) => `archive:${workflowId}`;

export function WorkflowRow({ workflow }: { workflow: Workflow }) {
  const state = useBoardStore((s) => s.state)!;
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const showArchived = useBoardStore((s) => s.showArchived);
  const send = useBoardStore((s) => s.send);
  const filtered = useFilteredIds();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newColumn, setNewColumn] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columns = useMemo(() => columnsOf(state, workflow.id), [state, workflow.id]);

  const visible = (cards: CardModel[]): CardModel[] =>
    cards.filter((c) => (!filtered || filtered.has(c.id)) && (workflow.kind !== 'child' || !selectedParentId || c.parentId === selectedParentId));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);
    const current = state.cards.find((c) => c.id === cardId);
    if (!current) return;
    const overCard = state.cards.find((c) => c.id === overId);

    // soltar na coluna de arquivados (ou sobre um card arquivado) = arquivar
    if (overId === archiveId(workflow.id) || overCard?.archivedAt) {
      if (!current.archivedAt) requestArchive(cardId);
      return;
    }

    const targetColumnId = overCard ? overCard.columnId : overId;
    if (!columns.some((c) => c.id === targetColumnId)) return;

    const ordered = cardsIn(state, targetColumnId).filter((c) => c.id !== cardId);
    let position = ordered.length;
    if (overCard && overCard.id !== cardId) {
      const idx = ordered.findIndex((c) => c.id === overCard.id);
      position = idx < 0 ? ordered.length : idx;
    }
    if (current.archivedAt) {
      send({ type: 'card.unarchive', cardId, columnId: targetColumnId, position });
      return;
    }
    if (current.columnId === targetColumnId && current.position === position) return;
    requestMove(cardId, targetColumnId, position);
  };

  const addColumn = () => {
    if (newColumn?.trim()) send({ type: 'settings.column.create', workflowId: workflow.id, name: newColumn.trim() });
    setNewColumn(null);
  };

  const activeCard = activeId ? state.cards.find((c) => c.id === activeId) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="columns">
        {columns.map((col, i) => {
          const all = cardsIn(state, col.id);
          return <Column key={col.id} column={col} workflow={workflow} cards={visible(all)} total={all.length} index={i} siblings={columns} />;
        })}
        {showArchived && <ArchiveColumn workflowId={workflow.id} cards={visible(archivedIn(state, workflow.id))} />}
        <div className="column-add">
          {newColumn === null ? (
            <button className="ghost" title="Nova coluna" onClick={() => setNewColumn('')}>+ Coluna</button>
          ) : (
            <input
              autoFocus
              placeholder="Nome da coluna"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              onBlur={addColumn}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addColumn();
                if (e.key === 'Escape') setNewColumn(null);
              }}
            />
          )}
        </div>
      </div>
      <DragOverlay>{activeCard ? <CardView card={activeCard} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function ArchiveColumn({ workflowId, cards }: { workflowId: string; cards: CardModel[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: archiveId(workflowId) });
  return (
    <div ref={setNodeRef} className={`column archive ${isOver ? 'over' : ''}`}>
      <header className="column-header">
        <span className="column-name">Arquivados</span>
        <span className="column-count">{cards.length}</span>
      </header>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {cards.map((card) => <SortableCard key={card.id} card={card} />)}
          {cards.length === 0 && <p className="muted empty">Arraste um card para cá para arquivar.</p>}
        </div>
      </SortableContext>
    </div>
  );
}
