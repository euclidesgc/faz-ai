import type { Attachment } from '../../../shared/model';
import type { BoardContext, HandlerMap } from './context';

/**
 * Grava um anexo. Um artefato de fase fica sempre na história (mesmo quando é construído numa
 * sub-tarefa) e substitui o artefato de mesmo nome, para a revisão não duplicar o documento.
 */
export function addAttachment(
  ctx: BoardContext,
  cardId: string,
  artifact: boolean,
  importTo: (cardId: string) => Omit<Attachment, 'createdAt' | 'artifact'>,
): void {
  const card = ctx.state().cards.find((c) => c.id === cardId);
  if (!card) throw new Error('Card não encontrado');
  const rec = importTo(artifact ? (card.parentId ?? card.id) : card.id);
  if (artifact) {
    for (const old of ctx.attachments.artifactsNamed(rec.cardId, rec.filename)) {
      ctx.attachments.delete(old.id);
      ctx.store.remove(old);
    }
  }
  ctx.attachments.add(rec, artifact);
}

/** O que vai dentro do card: checklist, conversa e anexos. */
export const cardContentHandlers = {
  'checklist.add': (msg, ctx) => {
    ctx.checklist.add(msg.cardId, msg.text);
    return true;
  },
  'checklist.update': (msg, ctx) => {
    ctx.checklist.update(msg.itemId, msg.patch);
    return true;
  },
  'checklist.delete': (msg, ctx) => {
    ctx.checklist.delete(msg.itemId);
    return true;
  },
  'comment.add': (msg, ctx, { author, byAi }) => {
    if (!msg.body.trim()) return true;
    ctx.comments.add(msg.cardId, author, msg.body.trim(), byAi ? 'ai' : 'human');
    // a pessoa respondeu à pergunta da IA: a vez volta para a IA
    if (!byAi && ctx.cards.status(msg.cardId) === 'waiting_answer') ctx.cards.setStatus(msg.cardId, 'ready', '', author);
    return true;
  },
  'comment.update': (msg, ctx) => {
    ctx.comments.update(msg.commentId, msg.body);
    return true;
  },
  'comment.delete': (msg, ctx) => {
    ctx.comments.delete(msg.commentId);
    return true;
  },
  'attachment.addData': (msg, ctx) => {
    addAttachment(ctx, msg.cardId, msg.artifact === true, (target) => ctx.store.importData(target, msg.filename, msg.base64));
    return true;
  },
  'attachment.delete': (msg, ctx) => {
    const a = ctx.attachments.get(msg.attachmentId);
    if (a) {
      ctx.attachments.delete(a.id);
      ctx.store.remove(a);
    }
    return true;
  },
} satisfies Partial<HandlerMap>;
