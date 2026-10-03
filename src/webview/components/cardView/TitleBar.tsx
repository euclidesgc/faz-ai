import { cardRef, type Card, type CardType } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { t, dt } from '../../i18n';
import { cards } from '../../commands';
import { requestArchive, requestTrash } from '../../store/actions';
import { Menu } from '../Menu';
import { Button, IconOpen } from '../ui';
import type { AiWork } from './AiLed';
import { CardBar } from './CardBar';

/** Barra do card, como a de uma janela, com os botões de abrir e de ações. No cartão arrastado (`overlay`) os botões somem. */
export function TitleBar({ card, type, work, overlay }: { card: Card; type?: CardType; work: AiWork; overlay: boolean }) {
  const openCard = useBoardStore((s) => s.openCard);
  const archived = card.archivedAt !== null;

  return (
    <CardBar id={cardRef(card)} typeName={type && dt(type.name)} color={type?.color} work={work}>
      {!overlay && (
        <span className="card-actions">
          <Button
            variant="icon"
            title={t('Abrir o card')}
            aria-label={t('Abrir o card')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openCard(card.id);
            }}
          >
            <IconOpen />
          </Button>
          <Menu
            title={t('Ações do card')}
            items={[
              { label: t('Abrir detalhes'), onClick: () => openCard(card.id) },
              archived
                ? { label: t('Desarquivar'), onClick: () => cards.unarchive(card.id) }
                : { label: t('Arquivar'), onClick: () => requestArchive(card.id) },
              'sep',
              { label: t('Mover para a lixeira'), danger: true, onClick: () => requestTrash(card.id) },
            ]}
          />
        </span>
      )}
    </CardBar>
  );
}
