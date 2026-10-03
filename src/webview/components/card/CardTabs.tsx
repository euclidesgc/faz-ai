import { useBoardStore } from '../../store/boardStore';
import { Button } from '../ui';
import { t } from '../../i18n';

export type CardTab = 'details' | 'comments' | 'attachments';

/** Abas do drawer; Conversa e Anexos mostram quantos itens o card tem. */
export function CardTabs({ cardId, tab, onChange }: { cardId: string; tab: CardTab; onChange: (tab: CardTab) => void }) {
  const state = useBoardStore((s) => s.state)!;
  const commentCount = state.comments.filter((c) => c.cardId === cardId).length;
  const attachmentCount = state.attachments.filter((a) => a.cardId === cardId).length;

  return (
    <nav className="tabs">
      <Button active={tab === 'details'} onClick={() => onChange('details')}>
        {t('Detalhes')}
      </Button>
      <Button active={tab === 'comments'} onClick={() => onChange('comments')}>
        {t('Conversa')}
        {commentCount > 0 && ` (${commentCount})`}
      </Button>
      <Button active={tab === 'attachments'} onClick={() => onChange('attachments')}>
        {t('Anexos')}
        {attachmentCount > 0 && ` (${attachmentCount})`}
      </Button>
    </nav>
  );
}
