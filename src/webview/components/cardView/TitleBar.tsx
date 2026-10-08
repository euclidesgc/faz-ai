import { cardRef, type Card, type CardType } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { t, dt } from '../../i18n';
import { cards } from '../../commands';
import { requestArchive, requestTrash } from '../../store/actions';
import { Menu } from '../Menu';
import { Button, IconChevronDown, IconChevronRight, IconOpen } from '../ui';
import type { AiWork } from './AiLed';
import { CardBar } from './CardBar';

/**
 * Botão de colapsar/expandir um card (escopo "um card"): chevron, `aria-expanded` refletindo o
 * estado atual. Usado dentro de `card-actions` (card expandido) e sozinho no início da linha
 * reduzida (card colapsado), por isso fica à parte para não duplicar o JSX.
 */
export function CollapseToggle({ collapsed, onToggle, className }: { collapsed: boolean; onToggle: () => void; className?: string }) {
  const label = collapsed ? t('Expandir card') : t('Colapsar card');
  return (
    <Button
      variant="icon"
      className={className}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {collapsed ? <IconChevronRight /> : <IconChevronDown />}
    </Button>
  );
}

/** Barra do card, como a de uma janela, com os botões de abrir, colapsar e de ações. No cartão arrastado (`overlay`) os botões somem. */
export function TitleBar({
  card,
  type,
  work,
  overlay,
  collapsed,
  onToggleCollapse,
}: {
  card: Card;
  type?: CardType;
  work: AiWork;
  overlay: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const openCard = useBoardStore((s) => s.openCard);
  const archived = card.archivedAt !== null;

  return (
    <CardBar id={cardRef(card)} typeName={type && dt(type.name)} color={type?.color} work={work} status={archived ? null : card.status}>
      {!overlay && (
        <span className="card-actions">
          <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapse} />
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
