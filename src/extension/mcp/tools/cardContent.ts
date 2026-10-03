import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { findCard } from '../format';
import { cardArg } from './args';
import { aiOrigin, detail } from './helpers';
import type { DefineTool, ToolContext } from './registry';

/** Conteúdo do card: checklist, comentários (conversa) e anexos. */
export function registerCardContentTools(tool: DefineTool, ctx: ToolContext): void {
  tool('add_checklist_item', 'Adiciona um item ao checklist (TODO) do card.', { card: cardArg, text: z.string().min(1) }, (a, router) => {
    const card = findCard(router.snapshot(), a.card);
    router.handle({ type: 'checklist.add', cardId: card.id, text: a.text });
    return detail(router, card.id).checklistItems;
  });

  tool(
    'update_checklist_item',
    'Marca/desmarca ou renomeia um item do checklist.',
    { item_id: z.string().describe('itemId, como aparece em get_card'), done: z.boolean().optional(), text: z.string().min(1).optional() },
    (a, router) => {
      const item = router.snapshot().checklistItems.find((i) => i.id === a.item_id);
      if (!item) throw new Error('Item de checklist não encontrado.');
      router.handle({ type: 'checklist.update', itemId: item.id, patch: { done: a.done, text: a.text } });
      return detail(router, item.cardId).checklistItems;
    },
  );

  tool('delete_checklist_item', 'Remove um item do checklist.', { item_id: z.string() }, (a, router) => {
    const item = router.snapshot().checklistItems.find((i) => i.id === a.item_id);
    if (!item) throw new Error('Item de checklist não encontrado.');
    router.handle({ type: 'checklist.delete', itemId: item.id });
    return 'Item removido.';
  });

  tool(
    'add_comment',
    'Escreve na conversa do card (markdown). Use para registrar decisões e o resultado do trabalho e para responder à pessoa. A mensagem é assinada com o nome do cliente de IA. Para pedir revisão use request_review; para perguntar, ask_question.',
    { card: cardArg, body: z.string().min(1) },
    (a, router) => {
      const card = findCard(router.snapshot(), a.card);
      router.handle({ type: 'comment.add', cardId: card.id, body: a.body }, aiOrigin(ctx));
      return detail(router, card.id).comments.at(-1);
    },
  );

  tool('update_comment', 'Substitui o texto de um comentário.', { comment_id: z.string(), body: z.string().min(1) }, (a, router) => {
    if (!router.snapshot().comments.some((c) => c.id === a.comment_id)) throw new Error('Comentário não encontrado.');
    router.handle({ type: 'comment.update', commentId: a.comment_id, body: a.body });
    return 'Comentário atualizado.';
  });

  tool('delete_comment', 'Apaga um comentário.', { comment_id: z.string() }, (a, router) => {
    if (!router.snapshot().comments.some((c) => c.id === a.comment_id)) throw new Error('Comentário não encontrado.');
    router.handle({ type: 'comment.delete', commentId: a.comment_id });
    return 'Comentário apagado.';
  });

  tool(
    'add_attachment',
    'Anexa um arquivo ao card. Informe `path` para copiar um arquivo existente, ou `filename` + `content` para gravar um texto como anexo. Para o documento de uma fase (PRD, Spec, Plan…) use `artifact: true`: ele fica anexado à história, mesmo quando enviado de uma sub-tarefa, e substitui a versão anterior de mesmo nome.',
    {
      card: cardArg,
      path: z.string().optional().describe('Caminho de um arquivo; relativo à pasta do projeto ou absoluto'),
      filename: z.string().optional().describe('Nome do anexo ao usar `content`, ex.: "spec.md"'),
      content: z.string().optional().describe('Conteúdo em texto do anexo'),
      artifact: z.boolean().optional().describe('É o documento de uma fase: vai para a história e substitui o artefato de mesmo nome'),
    },
    (a, router) => {
      const card = findCard(router.snapshot(), a.card);
      const target = a.artifact ? (card.parentId ?? card.id) : card.id;
      const before = new Set(router.snapshot().attachments.map((x) => x.id));
      if (a.path) {
        const file = path.resolve(ctx.workspaceDir, a.path);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Arquivo não encontrado: ${file}`);
        router.addAttachmentFiles(card.id, [file], a.artifact);
      } else if (a.filename && a.content !== undefined) {
        router.handle({
          type: 'attachment.addData',
          cardId: card.id,
          filename: a.filename,
          base64: Buffer.from(a.content, 'utf8').toString('base64'),
          artifact: a.artifact,
        });
      } else {
        throw new Error('Informe `path`, ou `filename` e `content`.');
      }
      const added = detail(router, target).attachments.find((x) => !before.has(x.attachmentId));
      return target === card.id ? added : { ...added, attachedTo: `#${router.snapshot().cards.find((c) => c.id === target)!.number}` };
    },
  );

  tool('delete_attachment', 'Remove um anexo do card e apaga o arquivo.', { attachment_id: z.string() }, (a, router) => {
    if (!router.getAttachment(a.attachment_id)) throw new Error('Anexo não encontrado.');
    router.handle({ type: 'attachment.delete', attachmentId: a.attachment_id });
    return 'Anexo removido.';
  });
}
