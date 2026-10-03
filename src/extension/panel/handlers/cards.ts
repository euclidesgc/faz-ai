import type { BoardContext, HandlerMap, MessageOf } from './context';
import { applySuggestion, suggestionFor } from './models';

/** Muda o status de trabalho do card. Aprovar é só da pessoa; bloquear exige o motivo. */
function setStatus(ctx: BoardContext, msg: MessageOf<'card.status.set'>, author: string, byAi: boolean): void {
  const note = msg.note?.trim() ?? '';
  if (msg.status === 'approved' && byAi) throw new Error('Só uma pessoa pode aprovar um card.');
  if (msg.status === 'blocked' && !note) throw new Error('Informe o motivo do bloqueio.');
  ctx.cards.setStatus(msg.cardId, msg.status, msg.status === 'blocked' ? note : '', author);
  if (note) ctx.comments.add(msg.cardId, author, note, byAi ? 'ai' : 'human');
  if (msg.status === 'approved') ctx.approved.push(msg.cardId);
}

/** Cria o card e já aplica a sugestão de modelo; devolve o id. */
export function createCard(ctx: BoardContext, input: { typeId: string; columnId: string; parentId: string | null; title: string }): string {
  const id = ctx.cards.create(ctx.boardId, input);
  applySuggestion(ctx, id, null);
  return id;
}

/** Ciclo de vida do card: criar, editar, mover, arquivar, lixeira, campos, status e agente de execução. */
export const cardHandlers = {
  'card.create': (msg, ctx) => {
    createCard(ctx, msg);
    return true;
  },
  'card.update': (msg, ctx) => {
    ctx.cards.update(msg.cardId, msg.patch);
    return true;
  },
  'card.move': (msg, ctx, { byAi }) => {
    ctx.cards.move(msg.cardId, msg.columnId, msg.position, { cancelChildren: msg.cancelChildren, byAi });
    return true;
  },
  'card.trash': (msg, ctx) => {
    ctx.cards.trash(msg.cardId);
    return true;
  },
  'card.restore': (msg, ctx) => {
    ctx.cards.restore(msg.cardId);
    return true;
  },
  'card.archive': (msg, ctx) => {
    ctx.cards.archive(msg.cardId);
    return true;
  },
  'card.unarchive': (msg, ctx, { byAi }) => {
    ctx.cards.unarchive(msg.cardId, msg.columnId, msg.position, byAi);
    return true;
  },
  'card.deletePermanent': (msg, ctx) => {
    ctx.cards.deletePermanent(msg.cardId).forEach((id) => ctx.store.removeCard(id));
    return true;
  },
  'trash.empty': (_msg, ctx) => {
    ctx.cards.emptyTrash(ctx.boardId).forEach((id) => ctx.store.removeCard(id));
    return true;
  },
  'field.setValue': (msg, ctx) => {
    // se o modelo atual veio da sugestão (ou está vazio), ele acompanha a nova sugestão
    const before = suggestionFor(ctx, msg.cardId);
    ctx.cards.setFieldValue(msg.cardId, msg.fieldId, msg.value);
    if (before.field && before.field.id !== msg.fieldId) applySuggestion(ctx, msg.cardId, before.suggestion);
    return true;
  },
  'card.status.set': (msg, ctx, { author, byAi }) => {
    setStatus(ctx, msg, author, byAi);
    return true;
  },
  'card.execProfile.set': (msg, ctx) => {
    ctx.cards.setExecProfile(msg.cardId, msg.profileId);
    return true;
  },
} satisfies Partial<HandlerMap>;
