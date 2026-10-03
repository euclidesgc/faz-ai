import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../../shared/model';
import { cards } from '../../commands';

export interface DescriptionDraft {
  desc: string;
  setDesc: (desc: string) => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  /** envia a descrição se ela mudou */
  save: () => void;
}

/**
 * Rascunho da descrição do card. Fica no drawer (e não na aba Detalhes) para sobreviver à troca de aba;
 * só é ressincronizado ao trocar de card, para não sobrescrever o que está sendo digitado.
 */
export function useDescriptionDraft(card: Card | undefined, cardId: string): DescriptionDraft {
  const [desc, setDesc] = useState(card?.description ?? '');
  const [editing, setEditing] = useState(false);

  const latest = useRef({ desc, saved: card?.description ?? '', cardId });
  latest.current = { desc, saved: card?.description ?? '', cardId };

  useEffect(() => {
    setDesc(card?.description ?? '');
    setEditing(false);
    // salva o que ficou pendente ao trocar de card ou fechar o drawer
    return () => {
      const l = latest.current;
      if (l.desc !== l.saved) cards.update(l.cardId, { description: l.desc });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  const save = () => {
    if (card && desc !== card.description) cards.update(cardId, { description: desc });
  };

  return { desc, setDesc, editing, setEditing, save };
}
