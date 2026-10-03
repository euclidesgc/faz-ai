import type { Card } from '../../../shared/model';
import { timeAgo } from '../../../shared/time';
import { formatDateTime, t } from '../../i18n';
import { useNow } from '../../useNow';
import { StatusBadge } from '../StatusBar';

/** Status do card com há quanto tempo ele está assim; bloqueado mostra o motivo no tooltip. */
export function StatusLine({ card }: { card: Card }) {
  const now = useNow();
  if (!card.status) return null;
  return (
    <div className="card-status">
      <StatusBadge status={card.status} reason={card.status === 'blocked' ? card.statusReason : undefined} />
      {card.statusAt !== null && (
        <span className="card-status-age" title={t('Desde {date}', { date: formatDateTime(card.statusAt) })}>
          {t(timeAgo(card.statusAt, now))}
        </span>
      )}
    </div>
  );
}
