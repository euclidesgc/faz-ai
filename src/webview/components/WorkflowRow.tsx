import { useCallback, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { archiveKey } from '../../shared/filters';
import type { Card as CardModel, Workflow } from '../../shared/model';
import { archivedIn, cardsIn, columnsOf } from '../../shared/selectors';
import { useBoardStore, useFilteredIds } from '../store/boardStore';
import { t } from '../i18n';
import { settings } from '../commands';
import { useDragLanes } from '../useDragLanes';
import { useReducedMotion } from '../useReducedMotion';
import { CollapsedColumn, Column } from './Column';
import { CardView, DRAG_ANIMATION, SortableCard } from './Card';
import { TextField } from '@radix-ui/themes';
import { Button, IconChevronLeft } from './ui';

const archiveId = archiveKey;

export function WorkflowRow({ workflow }: { workflow: Workflow }) {
  const state = useBoardStore((s) => s.state)!;
  const error = useBoardStore((s) => s.error);
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const overrides = useBoardStore((s) => s.collapsed);
  const setCollapsed = useBoardStore((s) => s.setCollapsed);
  const filtered = useFilteredIds();
  const reduced = useReducedMotion();
  const [newColumn, setNewColumn] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columns = useMemo(() => columnsOf(state, workflow.id), [state, workflow.id]);

  const visible = useCallback(
    (cards: CardModel[]): CardModel[] =>
      cards.filter(
        (c) => (!filtered || filtered.has(c.id)) && (workflow.kind !== 'child' || !selectedParentId || c.parentId === selectedParentId),
      ),
    [filtered, workflow.kind, selectedParentId],
  );

  const { shown, activeId, handlers, collisionDetection } = useDragLanes({ workflow, state, columns, visible, error });

  const addColumn = () => {
    if (newColumn?.trim()) settings.createColumn(workflow.id, newColumn.trim());
    setNewColumn(null);
  };

  const activeCard = activeId ? state.cards.find((c) => c.id === activeId) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} {...handlers}>
      <div className="columns">
        {columns.map((col, i) => {
          const all = cardsIn(state, col.id);
          const collapsed = overrides[col.id] ?? col.collapsed;
          return (
            <Column
              key={col.id}
              column={col}
              workflow={workflow}
              cards={visible(all)}
              shown={shown[col.id] ?? []}
              total={all.length}
              index={i}
              siblings={columns}
              collapsed={collapsed}
              onToggle={() => setCollapsed(col.id, !collapsed)}
            />
          );
        })}
        <ArchiveColumn
          workflowId={workflow.id}
          cards={visible(archivedIn(state, workflow.id))}
          shown={shown[archiveId(workflow.id)] ?? []}
          collapsed={overrides[archiveKey(workflow.id)] ?? workflow.archiveCollapsed}
          onToggle={(now) => setCollapsed(archiveKey(workflow.id), !now)}
        />
        <div className="column-add">
          {newColumn === null ? (
            <Button variant="ghost" title={t('Nova coluna')} onClick={() => setNewColumn('')}>
              {t('+ Nova coluna')}
            </Button>
          ) : (
            <TextField.Root
              autoFocus
              aria-label={t('Nome da coluna')}
              placeholder={t('Nome da coluna')}
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
      <DragOverlay dropAnimation={reduced ? null : { ...DRAG_ANIMATION }}>
        {activeCard ? <CardView card={activeCard} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function ArchiveColumn({
  workflowId,
  cards,
  shown,
  collapsed,
  onToggle,
}: {
  workflowId: string;
  /** arquivados visíveis (contagem do cabeçalho) */
  cards: CardModel[];
  /** cards da lista renderizada (faixas do arraste) */
  shown: CardModel[];
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: archiveId(workflowId) });
  if (collapsed)
    return (
      <CollapsedColumn
        setNodeRef={setNodeRef}
        isOver={isOver}
        name={t('Arquivados')}
        count={String(cards.length)}
        className="archive"
        onExpand={() => onToggle(true)}
      />
    );
  return (
    <div ref={setNodeRef} className={`column archive ${isOver ? 'over' : ''}`}>
      <header className="column-header">
        <Button variant="icon" className="collapse-toggle" title={t('Colapsar a coluna')} onClick={() => onToggle(false)}>
          <IconChevronLeft />
        </Button>
        <span className="column-name">{t('Arquivados')}</span>
        <span className="column-count">{cards.length}</span>
      </header>
      <SortableContext items={shown.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {shown.map((card) => (
            <SortableCard key={card.id} card={card} />
          ))}
          {shown.length === 0 && <p className="muted empty">{t('Arraste um card para cá para arquivar.')}</p>}
        </div>
      </SortableContext>
    </div>
  );
}
