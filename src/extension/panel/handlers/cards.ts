import type { BoardContext, HandlerMap, MessageOf } from './context';
import { applySuggestion, suggestionFor } from './models';

/**
 * Muda o status de trabalho do card. Aprovar é só da pessoa; bloquear exige o motivo. Em modo autônomo
 * (YOLO) o pedido de revisão da IA vira aprovação na hora: ninguém vai revisar, e o resumo fica na conversa.
 */
function setStatus(ctx: BoardContext, msg: MessageOf<'card.status.set'>, author: string, byAi: boolean): void {
  const note = msg.note?.trim() ?? '';
  if (msg.status === 'approved' && byAi) throw new Error('Só uma pessoa pode aprovar um card.');
  if (msg.status === 'blocked' && !note) throw new Error('Informe o motivo do bloqueio.');
  const autoApprove = byAi && msg.status === 'waiting_review' && ctx.cards.isYolo(msg.cardId);
  ctx.cards.setStatus(msg.cardId, autoApprove ? 'approved' : msg.status, msg.status === 'blocked' ? note : '', author);
  if (note) ctx.comments.add(msg.cardId, author, note, byAi ? 'ai' : 'human');
  // só a aprovação de uma pessoa dispara o merge automático: a do modo autônomo não passa por aqui
  if (msg.status === 'approved') ctx.approved.push(msg.cardId);
}

/**
 * A IA divide o trabalho de uma história em modo autônomo em outras histórias: elas nascem em modo autônomo
 * (a pessoa já abriu mão da aprovação para esse trabalho) e entram na fila depois da de origem.
 * Não amplia a autonomia a partir de uma história que não está em modo autônomo.
 */
function inheritYolo(ctx: BoardContext, msg: MessageOf<'card.yolo.inherit'>, author: string): void {
  const cards = ctx.state().cards;
  const from = cards.find((c) => c.id === msg.fromId);
  const card = cards.find((c) => c.id === msg.cardId);
  if (!from || !card) throw new Error('Card não encontrado');
  if (from.parentId || !from.yolo) throw new Error(`#${from.number} não é uma história em modo autônomo.`);
  if (card.parentId) throw new Error('O modo autônomo vale para a história, não para uma sub-tarefa.');
  ctx.cards.setYolo(card.id, true);
  ctx.comments.add(card.id, author, `Criada em modo autônomo a partir de #${from.number} ${from.title}.`, 'ai');
}

/**
 * Liga ou desliga o modo autônomo da história. É decisão da pessoa: a IA nunca amplia a própria autonomia.
 * Ao ligar, o que estava esperando uma pessoa é liberado para a IA seguir.
 */
function setYolo(ctx: BoardContext, msg: MessageOf<'card.yolo.set'>, author: string, byAi: boolean): void {
  if (byAi) throw new Error('Só uma pessoa liga o modo autônomo.');
  const card = ctx.state().cards.find((c) => c.id === msg.cardId);
  if (!card) throw new Error('Card não encontrado');
  if (card.parentId) throw new Error('O modo autônomo vale para a história, não para uma sub-tarefa.');
  if (card.yolo === msg.enabled) return;
  ctx.cards.setYolo(card.id, msg.enabled);
  if (!msg.enabled) return;
  const release = card.status === 'waiting_review' ? 'approved' : card.status === 'waiting_answer' ? 'ready' : null;
  if (release) ctx.cards.setStatus(card.id, release, '', author);
  ctx.comments.add(card.id, author, 'Modo autônomo ligado: a IA segue por conta própria, sem pedir aprovação nem confirmação.', 'human');
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
  'card.yolo.set': (msg, ctx, { author, byAi }) => {
    setYolo(ctx, msg, author, byAi);
    return true;
  },
  'card.yolo.inherit': (msg, ctx, { author, byAi }) => {
    if (!byAi) throw new Error('Para ligar o modo autônomo numa história, use card.yolo.set.');
    inheritYolo(ctx, msg, author);
    return true;
  },
  'card.execProfile.set': (msg, ctx) => {
    ctx.cards.setExecProfile(msg.cardId, msg.profileId);
    return true;
  },
} satisfies Partial<HandlerMap>;
