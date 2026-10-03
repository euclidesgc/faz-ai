import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragHandle } from './DragHandle';

/** Linha da tabela que pode ser arrastada pela alça; com a alça em foco, ↑ e ↓ movem uma posição. */
export function SortableRow({
  id,
  name,
  onStep,
  children,
}: {
  id: string;
  name: string;
  onStep: (delta: number) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr ref={setNodeRef} className={isDragging ? 'dragging' : ''} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <td className="drag-cell">
        <DragHandle name={name} onStep={onStep} drag={{ ...attributes, ...listeners }} />
      </td>
      {children}
    </tr>
  );
}
