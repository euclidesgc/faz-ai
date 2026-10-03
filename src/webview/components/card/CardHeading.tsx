import { useEffect, useState } from 'react';
import { cardRef, type Card } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { cards } from '../../commands';
import { t } from '../../i18n';

/** Avisos de lixeira/arquivo, link para a história, id e título editável do card. */
export function CardHeading({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const openCard = useBoardStore((s) => s.openCard);
  const [title, setTitle] = useState(card.title);
  const parent = card.parentId ? state.cards.find((c) => c.id === card.parentId) : undefined;
  const trashed = card.deletedAt !== null;
  const archived = card.archivedAt !== null;

  useEffect(() => {
    setTitle(card.title);
  }, [card.id, card.title]);

  const saveTitle = () => title.trim() && title !== card.title && cards.update(card.id, { title: title.trim() });

  return (
    <>
      {trashed && <div className="banner warn">{t('Este card está na lixeira.')}</div>}
      {!trashed && archived && <div className="banner warn">{t('Este card está arquivado.')}</div>}

      {parent && (
        <div className="drawer-parent">
          {t('Sub-tarefa de')}{' '}
          <a onClick={() => openCard(parent.id)}>
            {cardRef(parent)} {parent.title}
          </a>
        </div>
      )}

      <div className="drawer-id" title={t('ID do card')}>
        {cardRef(card)}
      </div>
      <input
        className="drawer-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </>
  );
}
