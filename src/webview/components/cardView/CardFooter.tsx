import type { SyntheticEvent } from 'react';
import { modelDisplay } from '../../modelText';
import type { Card } from '../../../shared/model';
import { modelFieldOf, suggestModel } from '../../../shared/models';
import { childProgress, linkedCards } from '../../../shared/links';
import { checklistOf, childrenOf, countDone, valueOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { t } from '../../i18n';
import { cards } from '../../commands';
import {
  IconAttachment,
  IconBranch,
  IconCardLink,
  IconChecklist,
  IconComments,
  IconDescription,
  IconPr,
  IconSubtasks,
  IconSuggest,
  IconYolo,
} from '../ui';

// o clique num controle do rodapé não arrasta nem abre o card
const keep = (e: SyntheticEvent) => e.stopPropagation();

/** Rodapé do card: contadores, branch e PR do próprio card e a sugestão de modelo das regras. */
export function CardFooter({ card, isParent, overlay }: { card: Card; isParent: boolean; overlay: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const children = isParent ? childrenOf(state, card.id) : [];
  const linked = linkedCards(state, card.id);
  const linkCount = linked.parents.length + linked.children.length + linked.related.length;
  const progress = childProgress(state, card.id);
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
        <span title={t('Sub-tarefas concluídas')}>
          <IconSubtasks /> {countDone(state, children)}/{children.length}
        </span>
      )}
      {linkCount > 0 && (
        <span title={progress.total ? t('Filhos vinculados encerrados') : t('Cards vinculados')}>
          <IconCardLink /> {progress.total ? `${progress.done}/${progress.total}` : linkCount}
        </span>
      )}
      {checklist.length > 0 && (
        <span title={t('Checklist')}>
          <IconChecklist /> {checklistDone}/{checklist.length}
        </span>
      )}
      {comments > 0 && (
        <span title={t('Mensagens na conversa')}>
          <IconComments /> {comments}
        </span>
      )}
      {attachments > 0 && (
        <span title={t('Anexos')}>
          <IconAttachment /> {attachments}
        </span>
      )}
      {card.description && (
        <span title={t('Tem descrição')}>
          <IconDescription />
        </span>
      )}
      {card.yolo && (
        <span className="yolo-mark" title={t('Modo autônomo (YOLO): a IA toca esta história sozinha, sem aprovação')}>
          <IconYolo />
        </span>
      )}
      {card.branch && (
        <span title={t('Branch: {name}', { name: card.branch })}>
          <IconBranch />
        </span>
      )}
      {card.prUrl && (
        <a
          className="card-pr"
          href={card.prUrl}
          title={t('Pull request: {url}', { url: card.prUrl })}
          aria-label={t('Pull request')}
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
          title={t('Modelo sugerido pelas regras: {model}. Clique para usar.', { model: modelDisplay(catalog, offer, true) })}
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
