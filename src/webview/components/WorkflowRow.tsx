import { useCallback, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Card as CardModel, Workflow } from '../../shared/model';
import { cardsIn, columnsOf } from '../../shared/selectors';
import { useBoardStore, useFilteredIds } from '../store/boardStore';
import { t } from '../i18n';
import { settings } from '../commands';
import { useDragLanes } from '../useDragLanes';
import { useReducedMotion } from '../useReducedMotion';
import { Column } from './Column';
import { CardView, DRAG_ANIMATION } from './Card';
import { TextField } from '@radix-ui/themes';
import { Button } from './ui';

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

  const { shown, activeId, handlers, collisionDetection } = useDragLanes({ state, columns, visible, error });

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
