import { badgeStyle } from '../../../shared/color';
import { cardRef, type Card, type CardType } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { requestArchive, requestTrash } from '../../store/actions';
import { Menu } from '../Menu';
import { Button, IconOpen } from '../ui';
import { AiLed } from './AiLed';

/**
 * Barra do card, como a de uma janela: na cor do tipo (texto preto ou branco pelo contraste), com o
 * LED da IA, o ID, o tipo e os botões de abrir e de ações. No cartão arrastado (`overlay`) os botões somem.
 */
export function TitleBar({ card, type, working, overlay }: { card: Card; type?: CardType; working: boolean; overlay: boolean }) {
  const openCard = useBoardStore((s) => s.openCard);
  const archived = card.archivedAt !== null;

  return (
    <div className="card-bar" style={badgeStyle(type?.color)}>
      {working && <AiLed />}
      <span className="card-id" title="ID do card">
        {cardRef(card)}
      </span>
      <span className="card-type" title={type?.name}>
        {type?.name}
      </span>
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
    </div>
  );
}
