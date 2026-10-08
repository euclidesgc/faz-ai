import { isDeliverableStory } from '../shared/story';
import { statusInfo } from '../shared/status';
import type { BoardContext } from './panel/handlers/context';

/**
 * Avalia se a história está pronta para ser entregue (ver `isDeliverableStory`) e, se ainda não foi
 * marcada, grava `waiting_review` e comenta a entrega. Idempotente: se o status já tem dono humano
 * (ex.: já entregue, ou `blocked`), não repete o comentário nem o status. Devolve `true` quando
 * entregou agora.
 *
 * Fica num módulo neutro (em vez de `panel/handlers/workspace.ts`, onde a regra nasceu) porque
 * também precisa ser chamada de `panel/handlers/cards.ts` (no `card.move`) e de `runner.ts` (no
 * fim de uma execução), e essas importações cruzadas criariam um ciclo com `workspace.ts`.
 */
export function settleDelivery(ctx: BoardContext, storyId: string, author: string): boolean {
  // sai sem montar o snapshot inteiro do board (caro) quando a história nem está em modo autônomo —
  // é o caso comum de um board sem YOLO, e card.move passa por aqui a cada movimento de qualquer card
  if (!ctx.cards.isYolo(storyId)) return false;
  const state = ctx.state();
  const story = state.cards.find((c) => c.id === storyId);
  if (!story || !isDeliverableStory(state, story)) return false;
  if (story.status !== null && statusInfo(story.status).owner === 'human') return false;
  ctx.cards.setStatus(story.id, 'waiting_review', '', author);
  ctx.comments.add(story.id, author, `História entregue com o pull request ${story.prUrl}; aguardando a revisão da pessoa.`, 'ai');
  return true;
}
