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
 * Rascunho da descrição do card. Fica no drawer (e não na aba Detalhes) para sobreviver à troca de aba.
 * Enquanto a pessoa não mexeu nele, acompanha a descrição salva: a IA pode reescrevê-la com o card
 * aberto, e o texto antigo da tela não pode voltar por cima ao fechar. Só o que a pessoa digitou e
 * ainda não salvou é enviado ao trocar de card ou fechar o drawer.
 */
export function useDescriptionDraft(card: Card | undefined, cardId: string): DescriptionDraft {
  const [desc, setDraft] = useState(card?.description ?? '');
  const [editing, setEditing] = useState(false);
  // a pessoa mexeu no rascunho desde o último envio
  const dirty = useRef(false);

  const latest = useRef({ desc, saved: card?.description ?? '', cardId });

  useEffect(() => {
    setDraft(card?.description ?? '');
    setEditing(false);
    dirty.current = false;
    // salva o que ficou pendente ao trocar de card ou fechar o drawer
    return () => {
      const l = latest.current;
      if (dirty.current && l.desc !== l.saved) cards.update(l.cardId, { description: l.desc });
      dirty.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  // a descrição mudou por fora (a IA, outra janela) e a pessoa não está com um rascunho: mostra a nova
  useEffect(() => {
    if (!dirty.current) setDraft(card?.description ?? '');
  }, [card?.description]);

  // atualizado num efeito (e não no render) e declarado depois do de cima: ao trocar de card, a limpeza
  // de cima roda antes deste e ainda vê o rascunho e o id do card anterior
  useEffect(() => {
    latest.current = { desc, saved: card?.description ?? '', cardId };
  });

  const setDesc = (next: string) => {
    dirty.current = true;
    setDraft(next);
  };

  const save = () => {
    if (card && dirty.current && desc !== card.description) cards.update(cardId, { description: desc });
    dirty.current = false;
  };

  return { desc, setDesc, editing, setEditing, save };
}
