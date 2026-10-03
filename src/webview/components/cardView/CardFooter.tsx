import type { SyntheticEvent } from 'react';
import type { Card } from '../../../shared/model';
import { modelDisplay, modelFieldOf, suggestModel } from '../../../shared/models';
import { checklistOf, childrenOf, countDone, valueOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { IconAttachment, IconBranch, IconChecklist, IconComments, IconDescription, IconPr, IconSubtasks, IconSuggest } from '../ui';

// o clique num controle do rodapé não arrasta nem abre o card
const keep = (e: SyntheticEvent) => e.stopPropagation();

/** Rodapé do card: contadores, branch e PR do próprio card e a sugestão de modelo das regras. */
export function CardFooter({ card, isParent, overlay }: { card: Card; isParent: boolean; overlay: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const children = isParent ? childrenOf(state, card.id) : [];
  const checklist = checklistOf(state, card.id);
  const checklistDone = checklist.filter((i) => i.done).length;
  const comments = state.comments.filter((c) => c.cardId === card.id).length;
  const attachments = state.attachments.filter((a) => a.cardId === card.id).length;
  // sugestão das regras, oferecida quando difere do modelo que está no card
  const modelField = modelFieldOf(state, card);
  const suggestion = modelField ? suggestModel(state, card) : null;
  const offer = modelField && suggestion && suggestion !== valueOf(state, card.id, modelField.id) ? suggestion : null;
  const catalog = state.board.modelCatalog;

  return (
    <div className="card-meta">
      {children.length > 0 && (
        <span title="Sub-tarefas concluídas">
          <IconSubtasks /> {countDone(state, children)}/{children.length}
        </span>
      )}
      {checklist.length > 0 && (
        <span title="Checklist">
          <IconChecklist /> {checklistDone}/{checklist.length}
        </span>
      )}
      {comments > 0 && (
        <span title="Mensagens na conversa">
          <IconComments /> {comments}
        </span>
      )}
      {attachments > 0 && (
        <span title="Anexos">
          <IconAttachment /> {attachments}
        </span>
      )}
      {card.description && (
        <span title="Tem descrição">
          <IconDescription />
        </span>
      )}
      {card.branch && (
        <span title={`Branch: ${card.branch}`}>
          <IconBranch />
        </span>
      )}
      {card.prUrl && (
        <a
          className="card-pr"
          href={card.prUrl}
          title={`Pull request: ${card.prUrl}`}
          aria-label="Pull request"
          onPointerDown={keep}
          onClick={keep}
          onDoubleClick={keep}
        >
          <IconPr />
        </a>
      )}
      {offer && !overlay && (
        <button
          className="suggest-model"
          title={`Modelo sugerido pelas regras: ${modelDisplay(catalog, offer, true)}. Clique para usar.`}
          onPointerDown={keep}
          onClick={(e) => {
            e.stopPropagation();
            cards.setField(card.id, modelField!.id, offer);
          }}
        >
          <IconSuggest /> {modelDisplay(catalog, offer)}
        </button>
      )}
    </div>
  );
}
