import { childrenOf } from '../../../shared/selectors';
import { findCard } from '../format';
import { cardArg } from './args';
import { live } from './helpers';
import type { DefineTool } from './registry';

/** Arquivo e lixeira: arquivar, mandar para a lixeira, restaurar e apagar de vez. */
export function registerLifecycleTools(tool: DefineTool): void {
  tool('archive_card', 'Arquiva um card (e suas sub-tarefas): sai do board sem ser apagado.', { card: cardArg }, (a, router) => {
    const card = live(findCard(router.snapshot(), a.card));
    router.handle({ type: 'card.archive', cardId: card.id });
    return `#${card.number} arquivado.`;
  });

  tool('unarchive_card', 'Traz um card arquivado de volta para a coluna em que estava.', { card: cardArg }, (a, router) => {
    const card = findCard(router.snapshot(), a.card);
    router.handle({ type: 'card.unarchive', cardId: card.id });
    return `#${card.number} desarquivado.`;
  });

  tool(
    'trash_card',
    'Move um card para a lixeira, junto com suas sub-tarefas e anexos. Pode ser desfeito com restore_card.',
    { card: cardArg },
    (a, router) => {
      const s = router.snapshot();
      const card = findCard(s, a.card);
      const kids = childrenOf(s, card.id).length;
      router.handle({ type: 'card.trash', cardId: card.id });
      return `#${card.number} movido para a lixeira${kids ? `, com ${kids} sub-tarefa(s)` : ''}.`;
    },
  );

  tool('restore_card', 'Restaura um card da lixeira.', { card: cardArg }, (a, router) => {
    const card = findCard(router.snapshot(), a.card);
    router.handle({ type: 'card.restore', cardId: card.id });
    return `#${card.number} restaurado.`;
  });

  tool(
    'delete_card_permanently',
    'Apaga um card DE VEZ, com suas sub-tarefas, comentários e anexos. Não pode ser desfeito: confirme com a pessoa antes. Para algo reversível use trash_card.',
    { card: cardArg },
    (a, router) => {
      const s = router.snapshot();
      const card = findCard(s, a.card);
      const kids = s.cards.filter((k) => k.parentId === card.id).length;
      router.handle({ type: 'card.deletePermanent', cardId: card.id });
      return `#${card.number} "${card.title}" apagado definitivamente${kids ? `, com ${kids} sub-tarefa(s)` : ''}.`;
    },
  );

  tool(
    'empty_trash',
    'Apaga DE VEZ todos os cards que estão na lixeira, com seus anexos. Não pode ser desfeito: confirme com a pessoa antes.',
    {},
    (_a, router) => {
      const n = router.snapshot().cards.filter((c) => c.deletedAt !== null).length;
      router.handle({ type: 'trash.empty' });
      return `Lixeira esvaziada: ${n} card(s) apagado(s) definitivamente.`;
    },
  );
}
