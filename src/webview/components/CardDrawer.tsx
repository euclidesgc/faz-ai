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
import { YoloBar } from './card/YoloBar';
import { StatusBar } from './StatusBar';
import { formatDateTime, t } from '../i18n';

/** Painel lateral de um card: compõe as partes de components/card/. */
export function CardDrawer({ cardId }: { cardId: string }) {
  const state = useBoardStore((s) => s.state)!;
  const openCard = useBoardStore((s) => s.openCard);
  const dialogOpen = useBoardStore((s) => s.dialog !== null);

  const card = state.cards.find((c) => c.id === cardId);
  const [tab, setTab] = useState<CardTab>('details');
  // a mensagem sendo escrita na conversa sobrevive à troca de aba
  const [message, setMessage] = useState('');
  // a descrição fica aqui para não se perder ao trocar de aba
  const draft = useDescriptionDraft(card, cardId);

  useEffect(() => {
    setTab('details');
    setMessage('');
  }, [card?.id]);

  useEffect(() => {
    if (dialogOpen) return;
    // Esc que um seletor ou menu aberto já tratou (o Radix marca com preventDefault) não fecha o card
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // o primeiro Esc num campo de texto só sai dele (e o campo salva ao perder o foco); o segundo fecha
      const el = document.activeElement as HTMLElement | null;
      if (el && el.closest('.drawer') && (el.matches('input, textarea, select') || el.isContentEditable)) return el.blur();
      openCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCard, dialogOpen]);

  if (!card) return null;

  const live = card.deletedAt === null && card.archivedAt === null;
  const isStory = state.workflows.find((w) => w.id === card.workflowId)!.kind === 'parent';

  return (
    // o fundo centraliza o card e fecha só no clique que começa nele mesmo: o que vem de dentro do
    // card (inclusive de menus e janelas em portal, que sobem pela árvore do React) não fecha
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && openCard(null)}>
      <aside className="drawer" aria-label={card.title}>
        <DrawerHeader card={card} />
        <CardHeading card={card} />
        {live && <StatusBar card={card} />}
        <WorkspaceBar card={card} />
        <YoloBar card={card} />
        <AgentBar card={card} />

        <CardTabs cardId={card.id} tab={tab} onChange={setTab} />

        {tab === 'comments' && <CommentsTab cardId={card.id} draft={message} onDraft={setMessage} />}
        {tab === 'attachments' && <AttachmentsTab cardId={card.id} />}

        {tab === 'details' && (
          <>
            <FieldsSection card={card} />
            <DescriptionSection draft={draft} />
            <ChecklistSection cardId={card.id} />
            {isStory && <SubtasksSection story={card} />}
            <LinksSection key={card.id} card={card} />
          </>
        )}

        <footer className="drawer-footer muted">
          {t('Criado {created} · Atualizado {updated}', {
            created: formatDateTime(card.createdAt),
            updated: formatDateTime(card.updatedAt),
          })}
        </footer>
      </aside>
    </div>
  );
}
