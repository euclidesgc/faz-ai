import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cardRef, type Card, type FieldDef } from '../../shared/model';
import { statusInfo } from '../../shared/status';
import { aiWorkingChildren, fieldsForType, isAiWorking, valueOf } from '../../shared/selectors';
import { useBoardStore } from '../store/boardStore';
import { FieldBadge, hasValue } from './FieldRenderer';
import { IconParent } from './ui';
import type { AiWork } from './cardView/AiLed';
import { CardFooter } from './cardView/CardFooter';
import { StatusLine } from './cardView/StatusLine';
import { TitleBar } from './cardView/TitleBar';

export function SortableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardView card={card} />
    </div>
  );
}

/** Card do board: barra na cor do tipo, título, status, campos, modelo e rodapé. */
export function CardView({ card, overlay = false }: { card: Card; overlay?: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const selectParent = useBoardStore((s) => s.selectParent);
  const openCard = useBoardStore((s) => s.openCard);

  const type = state.cardTypes.find((t) => t.id === card.typeId);
  const isParent = state.workflows.find((w) => w.id === card.workflowId)?.kind === 'parent';
  const archived = card.archivedAt !== null;
  const fields = fieldsForType(state, card.typeId).filter((f) => f.display !== 'hidden');
  const parent = card.parentId ? state.cards.find((c) => c.id === card.parentId) : undefined;
  const selected = isParent && selectedParentId === card.id;
  const workingChildren = isParent ? aiWorkingChildren(state, card) : 0;
  const work: AiWork = archived
    ? null
    : isAiWorking(state, card)
      ? { mode: 'self' }
      : workingChildren
        ? { mode: 'children', count: workingChildren }
        : null;
  const status = archived ? null : card.status;
  // pendência com a pessoa: a borda ganha a cor do status para achar de relance o que espera por ela
  const mine = status !== null && statusInfo(status).owner === 'human';
  const style = mine ? ({ '--status-color': state.board.appearance.statuses[status].color } as CSSProperties) : undefined;
  const classes = ['card', selected && 'selected', overlay && 'overlay', archived && 'archived', mine && 'mine'].filter(Boolean).join(' ');

  return (
    <article
      className={classes}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (isParent && !archived) selectParent(card.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        openCard(card.id);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
        e.stopPropagation();
        openCard(card.id);
      }}
      tabIndex={overlay ? undefined : 0}
      title={overlay ? undefined : 'Dois cliques (ou Enter) abrem o card'}
    >
      <TitleBar card={card} type={type} work={work} overlay={overlay} />
      <div className="card-body">
        <div className="card-title" title={card.title}>
          {card.title}
        </div>
        {parent && (
          <div className="card-parent" title={parent.title}>
            <IconParent /> {cardRef(parent)} {parent.title}
          </div>
        )}
        {status && <StatusLine card={card} />}
        <FieldLine className="card-fields" fields={fields.filter((f) => f.kind !== 'model')} cardId={card.id} />
        <FieldLine className="card-model" fields={fields.filter((f) => f.kind === 'model')} cardId={card.id} />
        <CardFooter card={card} isParent={isParent} overlay={overlay} />
      </div>
    </article>
  );
}

/** Uma linha de selos de campo; some quando nenhum dos campos tem valor. */
function FieldLine({ className, fields, cardId }: { className: string; fields: FieldDef[]; cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const shown = fields.map((f) => ({ f, value: valueOf(state, cardId, f.id) })).filter(({ value }) => hasValue(value));
  if (shown.length === 0) return null;
  return (
    <div className={className}>
      {shown.map(({ f, value }) => (
        <FieldBadge key={f.id} field={f} value={value} />
      ))}
    </div>
  );
}
