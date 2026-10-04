import type { Card } from '../../../shared/model';
import { cardsIn, columnsOf, typesOf, isAiWorking, aiWorkingChildren } from '../../../shared/selectors';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { requestArchive, requestMove, requestTrash } from '../../store/actions';
import { Menu } from '../Menu';
import { Button, IconChevronDown, IconClose, SelectField } from '../ui';
import { t, dt } from '../../i18n';
import { AiLed } from '../cardView/AiLed';
import type { AiWork } from '../cardView/AiLed';

/** Barra do topo do drawer: tipo, coluna, ações do card e fechar. */
export function DrawerHeader({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const openCard = useBoardStore((s) => s.openCard);
  const close = () => openCard(null);
  const trashed = card.deletedAt !== null;
  const archived = card.archivedAt !== null;
  const isParent = state.workflows.find((w) => w.id === card.workflowId)?.kind === 'parent';
  const workingChildren = isParent ? aiWorkingChildren(state, card) : 0;
  const work: AiWork = archived
    ? null
    : isAiWorking(state, card)
      ? { mode: 'self' }
      : workingChildren
        ? { mode: 'children', count: workingChildren }
        : null;
  const types = typesOf(state, card.workflowId).map((ty) => ({ value: ty.id, label: dt(ty.name) }));
  const columns = columnsOf(state, card.workflowId).map((c) => ({ value: c.id, label: dt(c.name) }));

  return (
    <header className="drawer-header">
      <AiLed work={work} status={archived || trashed ? null : card.status} />
      <SelectField aria-label={t('Tipo')} options={types} value={card.typeId} onChange={(typeId) => cards.update(card.id, { typeId })} />
      <SelectField
        aria-label={t('Coluna')}
        disabled={trashed || archived}
        options={columns}
        value={card.columnId}
        onChange={(columnId) => requestMove(card.id, columnId, cardsIn(state, columnId).length)}
      />
      <span className="spacer" />
      {trashed && (
        <Button variant="primary" onClick={() => cards.restore(card.id)}>
          {t('Restaurar')}
        </Button>
      )}
      {/* arquivar e excluir ficam num menu, longe do botão de fechar, para não serem clicados por engano */}
      {!trashed && (
        <Menu
          title={t('Ações do card')}
          items={[
            archived
              ? { label: t('Desarquivar'), onClick: () => cards.unarchive(card.id) }
              : { label: t('Arquivar'), onClick: () => requestArchive(card.id, close) },
            'sep',
            { label: t('Mover para a lixeira'), danger: true, onClick: () => requestTrash(card.id, close) },
          ]}
        >
          {`${t('Ações')} `}
          <IconChevronDown />
        </Menu>
      )}
      <span className="drawer-divider" />
      <Button variant="icon" className="drawer-close" title={t('Fechar (Esc)')} aria-label={t('Fechar')} onClick={close}>
        <IconClose />
      </Button>
    </header>
  );
}
