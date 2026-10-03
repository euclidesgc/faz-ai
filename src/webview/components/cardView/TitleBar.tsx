import { cardRef, type Card, type CardType } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { requestArchive, requestTrash } from '../../store/actions';
import { Menu } from '../Menu';
import { Button, IconOpen } from '../ui';
import { CardBar } from './CardBar';

/** Barra do card, como a de uma janela, com os botões de abrir e de ações. No cartão arrastado (`overlay`) os botões somem. */
export function TitleBar({ card, type, working, overlay }: { card: Card; type?: CardType; working: boolean; overlay: boolean }) {
  const openCard = useBoardStore((s) => s.openCard);
  const archived = card.archivedAt !== null;

  return (
    <CardBar id={cardRef(card)} typeName={type?.name} color={type?.color} working={working}>
      {!overlay && (
        <span className="card-actions">
          <Button
            variant="icon"
            title="Abrir o card"
            aria-label="Abrir o card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openCard(card.id);
            }}
          >
            <IconOpen />
          </Button>
          <Menu
            title="Ações do card"
            items={[
              { label: 'Abrir detalhes', onClick: () => openCard(card.id) },
              archived
                ? { label: 'Desarquivar', onClick: () => cards.unarchive(card.id) }
                : { label: 'Arquivar', onClick: () => requestArchive(card.id) },
              'sep',
              { label: 'Mover para a lixeira', danger: true, onClick: () => requestTrash(card.id) },
            ]}
          />
        </span>
      )}
    </CardBar>
  );
}
