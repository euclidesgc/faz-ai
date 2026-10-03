import { useEffect, useState } from 'react';
import { useBoardStore } from '../store/boardStore';
import { AttachmentsTab } from './card/AttachmentsTab';
import { CardHeading } from './card/CardHeading';
import { CardTabs, type CardTab } from './card/CardTabs';
import { ChecklistSection } from './card/ChecklistSection';
import { CommentsTab } from './card/CommentsTab';
import { DescriptionSection } from './card/DescriptionSection';
import { DrawerHeader } from './card/DrawerHeader';
import { AgentBar } from './card/AgentBar';
import { LinksSection } from './card/LinksSection';
import { FieldsSection } from './card/FieldsSection';
import { SubtasksSection } from './card/SubtasksSection';
import { useDescriptionDraft } from './card/useDescriptionDraft';
import { WorkspaceBar } from './card/WorkspaceBar';
import { StatusBar } from './StatusBar';
import { formatDateTime, t } from '../i18n';

/** Painel lateral de um card: compõe as partes de components/card/. */
export function CardDrawer({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const openCard = useBoardStore((s) => s.openCard);
  const dialogOpen = useBoardStore((s) => s.dialog !== null);

  const card = state.cards.find((c) => c.id === cardId);
  const [tab, setTab] = useState<CardTab>('details');
  // a descrição fica aqui para não se perder ao trocar de aba
  const draft = useDescriptionDraft(card, cardId);

  useEffect(() => {
    setTab('details');
  }, [card?.id]);

  useEffect(() => {
    if (dialogOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openCard(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCard, dialogOpen]);

  if (!card) return null;

  const live = card.deletedAt === null && card.archivedAt === null;
  const isStory = state.workflows.find((w) => w.id === card.workflowId)!.kind === 'parent';

  return (
    <>
      <div className="drawer-backdrop" onClick={() => openCard(null)} />
      <aside className="drawer">
        <DrawerHeader card={card} />
        <CardHeading card={card} />
        {live && <StatusBar card={card} />}
        <WorkspaceBar card={card} />
        <AgentBar card={card} />

        <CardTabs cardId={card.id} tab={tab} onChange={setTab} />

        {tab === 'comments' && <CommentsTab cardId={card.id} />}
        {tab === 'attachments' && <AttachmentsTab cardId={card.id} />}

        {tab === 'details' && (
          <>
            <FieldsSection card={card} />
            <DescriptionSection draft={draft} />
            <ChecklistSection cardId={card.id} />
            {isStory && <SubtasksSection story={card} />}
            <LinksSection card={card} />
          </>
        )}

        <footer className="drawer-footer muted">
          {t('Criado {created} · Atualizado {updated}', {
            created: formatDateTime(card.createdAt),
            updated: formatDateTime(card.updatedAt),
          })}
        </footer>
      </aside>
    </>
  );
}
