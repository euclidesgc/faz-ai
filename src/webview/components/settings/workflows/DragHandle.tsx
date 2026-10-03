import type { HTMLAttributes } from 'react';
import { IconDrag } from '../../ui';
import { t } from '../../../i18n';

/** Alça de arrastar de uma lista ordenável; com ela em foco, ↑ e ↓ movem uma posição. `drag` vem do `useSortable`. */
export function DragHandle({ name, onStep, drag }: { name: string; onStep: (delta: number) => void; drag: HTMLAttributes<HTMLElement> }) {
  return (
    <button
      type="button"
      className="icon drag-handle"
      title={t('Arraste para mudar a posição de "{name}" (ou use ↑ e ↓)', { name })}
      {...drag}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return drag.onKeyDown?.(e as never);
        e.preventDefault();
        onStep(e.key === 'ArrowUp' ? -1 : 1);
      }}
    >
      <IconDrag />
    </button>
  );
}
