import type { Card } from '../../../shared/model';
import { cardsIn, columnsOf, typesOf } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { requestArchive, requestMove, requestTrash } from '../../store/actions';
import { Menu } from '../Menu';
import { Button, EnumSelect } from '../ui';

/** Barra do topo do drawer: tipo, coluna, ações do card e fechar. */
export function DrawerHeader({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const openCard = useBoardStore((s) => s.openCard);
  const close = () => openCard(null);
  const trashed = card.deletedAt !== null;
  const archived = card.archivedAt !== null;
  const types = typesOf(state, card.workflowId).map((t) => ({ value: t.id, label: t.name }));
  const columns = columnsOf(state, card.workflowId).map((c) => ({ value: c.id, label: c.name }));

  return (
    <header className="drawer-header">
      <EnumSelect options={types} value={card.typeId} onChange={(typeId) => cards.update(card.id, { typeId })} />
      <EnumSelect
        disabled={trashed || archived}
        options={columns}
        value={card.columnId}
        onChange={(columnId) => requestMove(card.id, columnId, cardsIn(state, columnId).length)}
      />
      <span className="spacer" />
      {trashed && (
        <Button variant="primary" onClick={() => cards.restore(card.id)}>
          Restaurar
        </Button>
      )}
      {/* arquivar e excluir ficam num menu, longe do botão de fechar, para não serem clicados por engano */}
      {!trashed && (
        <Menu
          title="Ações do card"
          items={[
            archived
              ? { label: 'Desarquivar', onClick: () => cards.unarchive(card.id) }
              : { label: 'Arquivar', onClick: () => requestArchive(card.id, close) },
            'sep',
            { label: 'Mover para a lixeira', danger: true, onClick: () => requestTrash(card.id, close) },
          ]}
        >
          Ações ▾
        </Menu>
      )}
      <span className="drawer-divider" />
      <Button variant="icon" className="drawer-close" title="Fechar (Esc)" aria-label="Fechar" onClick={close}>
        ✕
      </Button>
    </header>
  );
}
