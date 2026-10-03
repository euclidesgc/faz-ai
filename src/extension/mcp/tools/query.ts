import * as fs from 'node:fs';
import { z } from 'zod';
import { EMPTY_FILTERS, applyFilters } from '../../../shared/filters';
import { ALL_CARD_STATUSES } from '../../../shared/status';
import { boardOverview, cardStatus, cardSummary, findCard, findField, findType, findWorkflow, pendingOverview } from '../format';
import { cardArg } from './args';
import { detail, findColumnIds } from './helpers';
import type { DefineTool } from './registry';

const MAX_READ_BYTES = 256 * 1024;

/** Consulta: board, cards, pendências e anexos. Nada aqui altera o board. */
export function registerQueryTools(tool: DefineTool): void {
  tool(
    'get_board',
    'Visão geral do board: workflows, colunas (com categoria e quantidade de cards), tipos de card, campos personalizados e regras. Chame primeiro para conhecer os nomes válidos.',
    {},
    (_a, router) => boardOverview(router.snapshot()),
    true,
  );

  tool(
    'list_cards',
    'Lista cards do board, com filtros opcionais. Sem filtros, devolve todos os cards ativos (fora do arquivo e da lixeira).',
    {
      workflow: z.string().optional().describe('Nome do workflow, ou "parent" (histórias) / "child" (sub-tarefas)'),
      column: z.string().optional().describe('Nome da coluna'),
      type: z.string().optional().describe('Nome do tipo de card'),
      parent: cardArg.optional().describe('Só as sub-tarefas desta história'),
      status: z.enum(['open', 'done', 'cancelled']).optional().describe('Categoria da coluna em que o card está'),
      work_status: z
        .enum(ALL_CARD_STATUSES as [string, ...string[]])
        .optional()
        .describe('Status de trabalho do card (campo `work.status`)'),
      text: z.string().optional().describe('Palavras-chave buscadas em título, descrição, comentários e campos'),
      fields: z.record(z.string(), z.array(z.string())).optional().describe('Campo → valores aceitos, ex.: {"Fase": ["PRD", "Spec"]}'),
      include_archived: z.boolean().optional(),
      include_trashed: z.boolean().optional(),
    },
    (a, router) => {
      const s = router.snapshot();
      const wf = a.workflow ? findWorkflow(s, a.workflow) : undefined;
      const columnIds = a.column ? [...findColumnIds(s, a.column, wf?.id)] : null;
      const typeId = a.type ? findType(s, a.type).id : null;
      const parentId = a.parent !== undefined ? findCard(s, a.parent).id : null;
      const fields: Record<string, string[]> = {};
      for (const [name, values] of Object.entries(a.fields ?? {})) fields[findField(s, name).id] = values;
      const matched = applyFilters(s, {
        ...EMPTY_FILTERS,
        text: a.text ?? '',
        typeIds: typeId ? [typeId] : [],
        fields,
        includeRelated: false,
      });
      const cards = s.cards
        .filter((c) => (a.include_trashed || c.deletedAt === null) && (a.include_archived || c.archivedAt === null || c.deletedAt !== null))
        .filter((c) => !wf || c.workflowId === wf.id)
        .filter((c) => !columnIds || columnIds.includes(c.columnId))
        .filter((c) => !parentId || c.parentId === parentId)
        .filter((c) => !a.status || cardStatus(s, c) === a.status)
        .filter((c) => !a.work_status || c.status === a.work_status)
        .filter((c) => !matched || matched.has(c.id))
        .sort((x, y) => x.number - y.number);
      return { total: cards.length, cards: cards.map((c) => cardSummary(s, c)) };
    },
    true,
  );

  tool(
    'get_card',
    'Detalhe completo de um card: descrição (markdown), campos, sub-tarefas, checklist, conversa e anexos. Em `phase` vem o que fazer na fase em que o card está e o modelo do documento que ela produz; numa sub-tarefa, `storyArtifacts` traz os documentos já anexados à história.',
    { card: cardArg },
    (a, router) => detail(router, findCard(router.snapshot(), a.card).id),
    true,
  );

  tool(
    'get_pending_work',
    'O que está pendente com você no board: cards aprovados para avançar (`approved`), mensagens da pessoa sem resposta (`unanswered`) e cards prontos para trabalhar (`ready`). É o ponto de partida de uma sessão sem pedido específico (ex.: rotina periódica). `withPerson` mostra o que espera a pessoa.',
    {},
    (_a, router) => pendingOverview(router.snapshot()),
    true,
  );

  tool(
    'read_attachment',
    'Lê o conteúdo de um anexo de texto (markdown, txt, json…). Para outros formatos devolve o caminho do arquivo em disco.',
    { attachment_id: z.string().describe('attachmentId, como aparece em get_card') },
    (a, router) => {
      const att = router.getAttachment(a.attachment_id);
      if (!att) throw new Error('Anexo não encontrado.');
      const file = router.store.pathOf(att);
      if (!/^(text\/|application\/json)/.test(att.mime))
        return { filename: att.filename, mime: att.mime, path: file, note: 'Anexo não textual: abra pelo caminho.' };
      if (att.size > MAX_READ_BYTES)
        return { filename: att.filename, path: file, note: 'Anexo grande demais para devolver aqui: leia pelo caminho.' };
      return fs.readFileSync(file, 'utf8');
    },
    true,
  );
}
