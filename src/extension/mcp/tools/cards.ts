import { z } from 'zod';
import { columnsOf } from '../../../shared/selectors';
import { cardStatus, cardSummary, findCard, findColumn, findType } from '../format';
import { cardArg, fieldsArg } from './args';
import { END, aiOrigin, detail, live, setFields, validateFields } from './helpers';
import type { DefineTool, ToolContext } from './registry';

/** Cards: criar, alterar e mover entre colunas. */
export function registerCardTools(tool: DefineTool, ctx: ToolContext): void {
  tool(
    'create_card',
    'Cria um card. Com `parent`, cria uma sub-tarefa daquela história (no workflow filho); sem `parent`, cria uma história (no workflow pai).',
    {
      title: z.string().min(1),
      description: z.string().optional().describe('Markdown'),
      parent: cardArg.optional().describe('História à qual a sub-tarefa pertence'),
      type: z.string().optional().describe('Nome do tipo de card; por padrão, o primeiro tipo do workflow'),
      column: z.string().optional().describe('Nome da coluna; por padrão, a primeira do workflow'),
      fields: fieldsArg.optional(),
      autonomous_from: cardArg
        .optional()
        .describe(
          'Só em história: número de uma história em modo autônomo (YOLO) de que esta nasce. A nova também fica em modo autônomo e entra na fila depois dela, com o pull request empilhado. Use para dividir um pedido grande em entregas.',
        ),
    },
    (a, router) => {
      const s = router.snapshot();
      if (a.autonomous_from !== undefined && a.parent !== undefined)
        throw new Error('autonomous_from vale para histórias; sub-tarefas herdam o modo da história.');
      const origin = a.autonomous_from !== undefined ? live(findCard(s, a.autonomous_from)) : null;
      if (origin && !origin.yolo) throw new Error(`#${origin.number} não está em modo autônomo; só uma pessoa liga o modo numa história.`);
      const parent = a.parent !== undefined ? live(findCard(s, a.parent)) : null;
      if (parent?.parentId) throw new Error(`#${parent.number} é uma sub-tarefa; o pai precisa ser uma história.`);
      const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'));
      if (!wf) throw new Error('Workflow não encontrado.');
      const type = a.type ? findType(s, a.type) : s.cardTypes.find((t) => t.defaultWorkflowId === wf.id);
      if (!type) throw new Error(`Nenhum tipo de card definido para o workflow "${wf.name}".`);
      const column = a.column ? findColumn(s, a.column, wf.id) : columnsOf(s, wf.id)[0];
      if (!column) throw new Error(`O workflow "${wf.name}" não tem colunas.`);
      // valida os campos antes de criar, para não deixar um card pela metade
      validateFields(s, a.fields);
      const id = router.createCard({ typeId: type.id, columnId: column.id, parentId: parent?.id ?? null, title: a.title }, aiOrigin(ctx));
      if (a.description) router.handle({ type: 'card.update', cardId: id, patch: { description: a.description } });
      setFields(router, s, id, a.fields);
      if (origin) router.handle({ type: 'card.yolo.inherit', cardId: id, fromId: origin.id }, aiOrigin(ctx));
      return detail(router, id);
    },
  );

  tool(
    'update_card',
    'Altera título, descrição, tipo ou campos de um card. Só o que for informado é alterado. Para mudar de coluna use move_card.',
    {
      card: cardArg,
      title: z.string().min(1).optional(),
      description: z.string().optional().describe('Markdown; substitui a descrição inteira'),
      type: z.string().optional(),
      fields: fieldsArg.optional(),
    },
    (a, router) => {
      const s = router.snapshot();
      const card = findCard(s, a.card);
      const typeId = a.type ? findType(s, a.type).id : undefined;
      validateFields(s, a.fields);
      if (a.title !== undefined || a.description !== undefined || typeId) {
        router.handle({ type: 'card.update', cardId: card.id, patch: { title: a.title, description: a.description, typeId } });
      }
      setFields(router, s, card.id, a.fields);
      return detail(router, card.id);
    },
  );

  tool(
    'move_card',
    'Move um card para outra coluna do seu workflow — é assim que se sinaliza progresso. As regras do board se aplicam: por padrão, uma história não entra em coluna de conclusão enquanto tiver sub-tarefas em aberto, e um card só avança de uma coluna que exige aprovação (`requiresApproval` em get_board) quando o status dele é "approved". Um card arquivado é desarquivado ao ser movido.',
    {
      card: cardArg,
      column: z.string().describe('Nome da coluna de destino'),
      position: z.number().int().min(0).optional().describe('Posição na coluna (0 = topo); por padrão, no fim'),
      cancel_subtasks: z
        .boolean()
        .optional()
        .describe('Ao mover uma história para uma coluna de cancelamento, cancela também as sub-tarefas em aberto'),
    },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      const column = findColumn(s, a.column, card.workflowId);
      if (card.archivedAt !== null)
        router.handle({ type: 'card.unarchive', cardId: card.id, columnId: column.id, position: a.position ?? END }, aiOrigin(ctx));
      else
        router.handle(
          { type: 'card.move', cardId: card.id, columnId: column.id, position: a.position ?? END, cancelChildren: a.cancel_subtasks },
          aiOrigin(ctx),
        );
      const after = router.snapshot();
      const result: Record<string, unknown> = {
        card: cardSummary(
          after,
          after.cards.find((c) => c.id === card.id)!,
        ),
      };
      // equivalente ao aviso que a interface dá quando a última sub-tarefa em aberto termina
      const parent = card.parentId ? after.cards.find((c) => c.id === card.parentId) : undefined;
      if (parent && column.category !== 'open' && cardStatus(after, parent) === 'open') {
        const open = after.cards.filter((k) => k.parentId === parent.id && cardStatus(after, k) === 'open').length;
        if (open === 0)
          result.hint = `Todas as sub-tarefas de #${parent.number} "${parent.title}" saíram de aberto; considere mover a história para uma coluna de conclusão.`;
      }
      return result;
    },
  );
}
