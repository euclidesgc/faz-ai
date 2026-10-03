import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { badgeStyle } from '../../shared/color';
import { cardRef, type Card } from '../../shared/model';
import { modelFieldOf, modelLabel, suggestModel } from '../../shared/models';
import { childrenOf, fieldsForType, useBoardStore, valueOf } from '../store/boardStore';
import { requestArchive, requestTrash } from '../store/actions';
import { FieldBadge } from './FieldRenderer';
import { Menu } from './Menu';
import { Button } from './ui';
import { StatusBadge } from './StatusBar';

export function SortableCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardView card={card} />
    </div>
  );
}

export function CardView({ card, overlay = false }: { card: Card; overlay?: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const selectedParentId = useBoardStore((s) => s.selectedParentId);
  const selectParent = useBoardStore((s) => s.selectParent);
  const openCard = useBoardStore((s) => s.openCard);
  const send = useBoardStore((s) => s.send);

  const type = state.cardTypes.find((t) => t.id === card.typeId);
  const workflow = state.workflows.find((w) => w.id === card.workflowId);
  const isParent = workflow?.kind === 'parent';
  const archived = card.archivedAt !== null;
  const children = isParent ? childrenOf(state, card.id) : [];
  const doneChildren = children.filter((c) => state.columns.find((col) => col.id === c.columnId)?.isTerminal).length;
  const checklist = state.checklistItems.filter((i) => i.cardId === card.id);
  const checklistDone = checklist.filter((i) => i.done).length;
  const comments = state.comments.filter((c) => c.cardId === card.id).length;
  const attachments = state.attachments.filter((a) => a.cardId === card.id).length;
  const fields = fieldsForType(state, card.typeId).filter((f) => f.display !== 'hidden');
  const parent = card.parentId ? state.cards.find((c) => c.id === card.parentId) : undefined;
  const selected = isParent && selectedParentId === card.id;
  // sugestão das regras, oferecida quando difere do modelo que está no card
  const modelField = modelFieldOf(state, card);
  const suggestion = modelField ? suggestModel(state, card) : null;
  const offerSuggestion = modelField && suggestion && suggestion !== valueOf(state, card.id, modelField.id) ? suggestion : null;

  return (
    <article
      className={`card ${selected ? 'selected' : ''} ${overlay ? 'overlay' : ''} ${archived ? 'archived' : ''}`}
      style={{ borderLeftColor: type?.color ?? 'var(--accent)' }}
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
      <div className="card-top">
        <span className="card-head">
          <span className="card-id" title="ID do card">{cardRef(card)}</span>
          <span className="type-badge" style={badgeStyle(type?.color)}>{type?.name}</span>
        </span>
        {!overlay && (
          <span className="card-actions">
            <Button variant="icon" title="Abrir o card" aria-label="Abrir o card" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); openCard(card.id); }}>⤢</Button>
            <Menu
              title="Ações do card"
              items={[
                { label: 'Abrir detalhes', onClick: () => openCard(card.id) },
                archived
                  ? { label: 'Desarquivar', onClick: () => send({ type: 'card.unarchive', cardId: card.id }) }
                  : { label: 'Arquivar', onClick: () => requestArchive(card.id) },
                'sep',
                { label: 'Mover para a lixeira', danger: true, onClick: () => requestTrash(card.id) },
              ]}
            />
          </span>
        )}
      </div>
      <div className="card-title">{card.title}</div>
      {parent && <div className="card-parent" title={parent.title}>↳ {cardRef(parent)} {parent.title}</div>}
      {card.status && !archived && <div className="card-status"><StatusBadge status={card.status} /></div>}
      {fields.length > 0 && (
        <div className="card-fields">
          {fields.map((f) => <FieldBadge key={f.id} field={f} value={valueOf(state, card.id, f.id)} />)}
        </div>
      )}
      <div className="card-meta">
        {children.length > 0 && <span title="Sub-tarefas concluídas">⑂ {doneChildren}/{children.length}</span>}
        {checklist.length > 0 && <span title="Checklist">☑ {checklistDone}/{checklist.length}</span>}
        {comments > 0 && <span title="Mensagens na conversa">💬 {comments}</span>}
        {attachments > 0 && <span title="Anexos">📎 {attachments}</span>}
        {card.description && <span title="Tem descrição">≡</span>}
        {offerSuggestion && !overlay && (
          <button
            className="suggest-model"
            title={`Modelo sugerido pelas regras: ${modelLabel(state.board.modelCatalog, offerSuggestion, true)}. Clique para usar.`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              send({ type: 'field.setValue', cardId: card.id, fieldId: modelField!.id, value: offerSuggestion });
            }}
          >✦ {modelLabel(state.board.modelCatalog, offerSuggestion)}</button>
        )}
      </div>
    </article>
  );
}
