import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EMPTY_FILTERS, applyFilters } from '../../shared/filters';
import type { BoardState, Card } from '../../shared/model';
import type { MessageRouter } from '../panel/messageRouter';
import { RULE_FILES } from '../../shared/harness';
import { boardOverview, harnessOverview, cardDetail, cardStatus, cardSummary, coerceFieldValue, findCard, findColumn, findField, findType, findWorkflow } from './format';

export interface ToolContext {
  getRouter: () => Promise<MessageRouter>;
  /** base para caminhos relativos em add_attachment */
  workspaceDir: string;
  /** nome que assina os comentários feitos por esta sessão */
  author: () => string;
}

const MAX_READ_BYTES = 256 * 1024;
const END = Number.MAX_SAFE_INTEGER;

const cardArg = z.union([z.string(), z.number()]).describe('Número do card, ex.: 12 ou "#12"');
const fieldsArg = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
  .describe('Valores de campos personalizados por nome do campo, ex.: {"Fase": "Spec"}. null limpa o campo.');
const categoryArg = z.enum(['open', 'done', 'cancelled']).describe('O que a coluna representa: trabalho em aberto, conclusão ou cancelamento');

export function registerTools(server: McpServer, ctx: ToolContext): void {
  /** Registra uma ferramenta; o retorno vira JSON e exceções viram erro legível para o modelo. */
  const tool = <S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    run: (args: z.infer<z.ZodObject<S>>, router: MessageRouter) => unknown,
    readOnly = false,
  ): void => {
    server.registerTool(name, { description, inputSchema: shape, annotations: { readOnlyHint: readOnly } }, (async (args: unknown) => {
      try {
        const result = run(args as z.infer<z.ZodObject<S>>, await ctx.getRouter());
        return { content: [{ type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result, null, 1) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] };
      }
    }) as never);
  };

  const detail = (router: MessageRouter, cardId: string) => {
    const s = router.snapshot();
    return cardDetail(s, s.cards.find((c) => c.id === cardId)!, (a) => router.store.pathOf(a));
  };
  const setFields = (router: MessageRouter, s: BoardState, cardId: string, fields: Record<string, unknown> | undefined): void => {
    // valida tudo antes de gravar qualquer coisa
    const values = Object.entries(fields ?? {}).map(([name, value]) => {
      const f = findField(s, name);
      return { fieldId: f.id, value: coerceFieldValue(f, value) };
    });
    for (const v of values) router.handle({ type: 'field.setValue', cardId, ...v });
  };
  const live = (c: Card): Card => {
    if (c.deletedAt !== null) throw new Error(`O card #${c.number} está na lixeira; use restore_card antes.`);
    return c;
  };

  // ---------- consulta ----------

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
      const matched = applyFilters(s, { ...EMPTY_FILTERS, text: a.text ?? '', typeIds: typeId ? [typeId] : [], fields, includeRelated: false });
      const cards = s.cards
        .filter((c) => (a.include_trashed || c.deletedAt === null) && (a.include_archived || c.archivedAt === null || c.deletedAt !== null))
        .filter((c) => !wf || c.workflowId === wf.id)
        .filter((c) => !columnIds || columnIds.includes(c.columnId))
        .filter((c) => !parentId || c.parentId === parentId)
        .filter((c) => !a.status || cardStatus(s, c) === a.status)
        .filter((c) => !matched || matched.has(c.id))
        .sort((x, y) => x.number - y.number);
      return { total: cards.length, cards: cards.map((c) => cardSummary(s, c)) };
    },
    true,
  );

  tool(
    'get_card',
    'Detalhe completo de um card: descrição (markdown), campos, sub-tarefas, checklist, comentários e anexos.',
    { card: cardArg },
    (a, router) => detail(router, findCard(router.snapshot(), a.card).id),
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
      if (!/^(text\/|application\/json)/.test(att.mime)) return { filename: att.filename, mime: att.mime, path: file, note: 'Anexo não textual: abra pelo caminho.' };
      if (att.size > MAX_READ_BYTES) return { filename: att.filename, path: file, note: 'Anexo grande demais para devolver aqui: leia pelo caminho.' };
      return fs.readFileSync(file, 'utf8');
    },
    true,
  );

  // ---------- cards ----------

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
    },
    (a, router) => {
      const s = router.snapshot();
      const parent = a.parent !== undefined ? live(findCard(s, a.parent)) : null;
      if (parent?.parentId) throw new Error(`#${parent.number} é uma sub-tarefa; o pai precisa ser uma história.`);
      const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'));
      if (!wf) throw new Error('Workflow não encontrado.');
      const type = a.type ? findType(s, a.type) : s.cardTypes.find((t) => t.defaultWorkflowId === wf.id);
      if (!type) throw new Error(`Nenhum tipo de card definido para o workflow "${wf.name}".`);
      const column = a.column ? findColumn(s, a.column, wf.id) : s.columns.filter((c) => c.workflowId === wf.id).sort((x, y) => x.position - y.position)[0];
      if (!column) throw new Error(`O workflow "${wf.name}" não tem colunas.`);
      // valida os campos antes de criar, para não deixar um card pela metade
      for (const [name, value] of Object.entries(a.fields ?? {})) coerceFieldValue(findField(s, name), value);
      const id = router.createCard({ typeId: type.id, columnId: column.id, parentId: parent?.id ?? null, title: a.title });
      if (a.description) router.handle({ type: 'card.update', cardId: id, patch: { description: a.description } });
      setFields(router, s, id, a.fields);
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
      for (const [name, value] of Object.entries(a.fields ?? {})) coerceFieldValue(findField(s, name), value);
      if (a.title !== undefined || a.description !== undefined || typeId) {
        router.handle({ type: 'card.update', cardId: card.id, patch: { title: a.title, description: a.description, typeId } });
      }
      setFields(router, s, card.id, a.fields);
      return detail(router, card.id);
    },
  );

  tool(
    'move_card',
    'Move um card para outra coluna do seu workflow — é assim que se sinaliza progresso. As regras do board se aplicam: por padrão, uma história não entra em coluna de conclusão enquanto tiver sub-tarefas em aberto. Um card arquivado é desarquivado ao ser movido.',
    {
      card: cardArg,
      column: z.string().describe('Nome da coluna de destino'),
      position: z.number().int().min(0).optional().describe('Posição na coluna (0 = topo); por padrão, no fim'),
      cancel_subtasks: z.boolean().optional().describe('Ao mover uma história para uma coluna de cancelamento, cancela também as sub-tarefas em aberto'),
    },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      const column = findColumn(s, a.column, card.workflowId);
      if (card.archivedAt !== null) router.handle({ type: 'card.unarchive', cardId: card.id, columnId: column.id, position: a.position ?? END });
      else router.handle({ type: 'card.move', cardId: card.id, columnId: column.id, position: a.position ?? END, cancelChildren: a.cancel_subtasks });
      const after = router.snapshot();
      const result: Record<string, unknown> = { card: cardSummary(after, after.cards.find((c) => c.id === card.id)!) };
      // equivalente ao aviso que a interface dá quando a última sub-tarefa em aberto termina
      const parent = card.parentId ? after.cards.find((c) => c.id === card.parentId) : undefined;
      if (parent && column.category !== 'open' && cardStatus(after, parent) === 'open') {
        const open = after.cards.filter((k) => k.parentId === parent.id && cardStatus(after, k) === 'open').length;
        if (open === 0) result.hint = `Todas as sub-tarefas de #${parent.number} "${parent.title}" saíram de aberto; considere mover a história para uma coluna de conclusão.`;
      }
      return result;
    },
  );

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
      const kids = s.cards.filter((k) => k.parentId === card.id && k.deletedAt === null).length;
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

  tool('empty_trash', 'Apaga DE VEZ todos os cards que estão na lixeira, com seus anexos. Não pode ser desfeito: confirme com a pessoa antes.', {}, (_a, router) => {
    const n = router.snapshot().cards.filter((c) => c.deletedAt !== null).length;
    router.handle({ type: 'trash.empty' });
    return `Lixeira esvaziada: ${n} card(s) apagado(s) definitivamente.`;
  });

  // ---------- checklist, comentários, anexos ----------

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
    'Comenta em um card (markdown). Use para registrar decisões, dúvidas e o resultado do trabalho. O comentário é assinado com o nome do cliente de IA.',
    { card: cardArg, body: z.string().min(1) },
    (a, router) => {
      const card = findCard(router.snapshot(), a.card);
      router.handle({ type: 'comment.add', cardId: card.id, body: a.body }, { author: ctx.author() });
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
    'Anexa um artefato ao card (ex.: PRD, Spec, Plan). Informe `path` para copiar um arquivo existente, ou `filename` + `content` para gravar um texto como anexo.',
    {
      card: cardArg,
      path: z.string().optional().describe('Caminho de um arquivo; relativo à pasta do projeto ou absoluto'),
      filename: z.string().optional().describe('Nome do anexo ao usar `content`, ex.: "spec.md"'),
      content: z.string().optional().describe('Conteúdo em texto do anexo'),
    },
    (a, router) => {
      const card = findCard(router.snapshot(), a.card);
      const before = new Set(router.snapshot().attachments.map((x) => x.id));
      if (a.path) {
        const file = path.resolve(ctx.workspaceDir, a.path);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Arquivo não encontrado: ${file}`);
        router.addAttachmentFiles(card.id, [file]);
      } else if (a.filename && a.content !== undefined) {
        router.handle({ type: 'attachment.addData', cardId: card.id, filename: a.filename, base64: Buffer.from(a.content, 'utf8').toString('base64') });
      } else {
        throw new Error('Informe `path`, ou `filename` e `content`.');
      }
      return detail(router, card.id).attachments.find((x) => !before.has(x.attachmentId));
    },
  );

  tool('delete_attachment', 'Remove um anexo do card e apaga o arquivo.', { attachment_id: z.string() }, (a, router) => {
    if (!router.getAttachment(a.attachment_id)) throw new Error('Anexo não encontrado.');
    router.handle({ type: 'attachment.delete', attachmentId: a.attachment_id });
    return 'Anexo removido.';
  });

  // ---------- configuração do board ----------

  const overview = (router: MessageRouter) => boardOverview(router.snapshot());
  const workflowArg = z.string().describe('Nome do workflow, ou "parent" (histórias) / "child" (sub-tarefas)');
  const columnWorkflowArg = workflowArg.optional().describe('Workflow da coluna; necessário quando há colunas de mesmo nome nos dois workflows');

  tool('create_column', 'Cria uma coluna no fim de um workflow.', { workflow: workflowArg, name: z.string().min(1), category: categoryArg.optional() }, (a, router) => {
    const s = router.snapshot();
    const wf = findWorkflow(s, a.workflow);
    const before = new Set(s.columns.map((c) => c.id));
    const created = router.handle({ type: 'settings.column.create', workflowId: wf.id, name: a.name }).columns.find((c) => !before.has(c.id));
    if (created && a.category) router.handle({ type: 'settings.column.update', columnId: created.id, patch: { category: a.category } });
    return overview(router);
  });

  tool(
    'update_column',
    'Renomeia uma coluna, muda o que ela representa (categoria) ou a sua posição no workflow.',
    { column: z.string(), workflow: columnWorkflowArg, name: z.string().min(1).optional(), category: categoryArg.optional(), position: z.number().int().min(0).optional() },
    (a, router) => {
      const s = router.snapshot();
      const col = findColumn(s, a.column, a.workflow ? findWorkflow(s, a.workflow).id : undefined);
      router.handle({ type: 'settings.column.update', columnId: col.id, patch: { name: a.name, category: a.category, position: a.position } });
      return overview(router);
    },
  );

  tool(
    'delete_column',
    'Exclui uma coluna, movendo os cards dela para outra coluna do mesmo workflow.',
    { column: z.string(), workflow: columnWorkflowArg, move_cards_to: z.string().describe('Coluna que recebe os cards') },
    (a, router) => {
      const s = router.snapshot();
      const col = findColumn(s, a.column, a.workflow ? findWorkflow(s, a.workflow).id : undefined);
      const target = findColumn(s, a.move_cards_to, col.workflowId);
      router.handle({ type: 'settings.column.delete', columnId: col.id, moveCardsTo: target.id });
      return overview(router);
    },
  );

  tool('rename_workflow', 'Renomeia um workflow (linha do board).', { workflow: workflowArg, name: z.string().min(1) }, (a, router) => {
    router.handle({ type: 'settings.workflow.update', workflowId: findWorkflow(router.snapshot(), a.workflow).id, patch: { name: a.name } });
    return overview(router);
  });

  tool('rename_board', 'Renomeia o board.', { name: z.string().min(1) }, (a, router) => {
    router.handle({ type: 'settings.board.update', patch: { name: a.name } });
    return overview(router);
  });

  const colorArg = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe('Cor em hexadecimal, ex.: "#3b82f6"');

  tool('create_card_type', 'Cria um tipo de card.', { name: z.string().min(1), workflow: workflowArg, color: colorArg.optional() }, (a, router) => {
    router.handle({ type: 'settings.type.create', name: a.name, color: a.color ?? '#6b7280', defaultWorkflowId: findWorkflow(router.snapshot(), a.workflow).id });
    return overview(router);
  });

  tool(
    'update_card_type',
    'Renomeia um tipo de card, muda a sua cor ou define os valores padrão de campos (ex.: Modelo e Skills) aplicados a cada card novo desse tipo.',
    {
      type: z.string(),
      name: z.string().min(1).optional(),
      color: colorArg.optional(),
      default_fields: fieldsArg.optional().describe('Padrões por nome do campo, ex.: {"Modelo": "Claude Sonnet 5.5", "Skills": ["revisar-spec"]}. Substitui todos os padrões do tipo; {} limpa.'),
    },
    (a, router) => {
      const s = router.snapshot();
      const defaults = a.default_fields
        ? Object.fromEntries(Object.entries(a.default_fields).map(([name, value]) => { const f = findField(s, name); return [f.id, coerceFieldValue(f, value)]; }))
        : undefined;
      router.handle({ type: 'settings.type.update', typeId: findType(s, a.type).id, patch: { name: a.name, color: a.color, defaults } });
      return overview(router);
    },
  );

  tool('delete_card_type', 'Exclui um tipo de card que não esteja em uso.', { type: z.string() }, (a, router) => {
    router.handle({ type: 'settings.type.delete', typeId: findType(router.snapshot(), a.type).id });
    return overview(router);
  });

  const kindArg = z.enum(['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url']);
  const displayArg = z.enum(['badge', 'chip', 'inline', 'hidden']).describe('Como o campo aparece no card');
  const appliesArg = z.array(z.string()).nullable().describe('Nomes dos tipos de card em que o campo aparece; null = todos');
  const typeIds = (s: BoardState, names: string[] | null | undefined) => (names === undefined ? undefined : names === null ? null : names.map((n) => findType(s, n).id));

  tool(
    'create_field',
    'Cria um campo personalizado para os cards.',
    { name: z.string().min(1), kind: kindArg, options: z.array(z.string()).optional().describe('Opções, para select e multiselect'), applies_to_types: appliesArg.optional(), display: displayArg.optional() },
    (a, router) => {
      const s = router.snapshot();
      router.handle({ type: 'settings.field.create', name: a.name, kind: a.kind, options: a.options ?? [], appliesToTypes: typeIds(s, a.applies_to_types) ?? null, display: a.display ?? 'inline' });
      return overview(router);
    },
  );

  tool(
    'update_field',
    'Altera nome, opções, tipos de card ou exibição de um campo personalizado.',
    { field: z.string(), name: z.string().min(1).optional(), options: z.array(z.string()).optional(), applies_to_types: appliesArg.optional(), display: displayArg.optional() },
    (a, router) => {
      const s = router.snapshot();
      router.handle({ type: 'settings.field.update', fieldId: findField(s, a.field).id, patch: { name: a.name, options: a.options, appliesToTypes: typeIds(s, a.applies_to_types), display: a.display } });
      return overview(router);
    },
  );

  tool('delete_field', 'Exclui um campo personalizado e os valores dele em todos os cards.', { field: z.string() }, (a, router) => {
    router.handle({ type: 'settings.field.delete', fieldId: findField(router.snapshot(), a.field).id });
    return overview(router);
  });

  tool(
    'update_rules',
    'Altera as regras do board. Só o que for informado é alterado.',
    {
      blockDoneWithOpenChildren: z.boolean().optional().describe('História não entra em coluna de conclusão com sub-tarefas em aberto'),
      blockPhaseAdvanceWithOpenChildren: z.boolean().optional().describe('História não avança de coluna enquanto houver sub-tarefas em aberto cuja Fase é a coluna atual'),
      onCancelParent: z.enum(['ask', 'cascade', 'keep']).optional().describe('Sub-tarefas em aberto quando a história é cancelada'),
      onAllChildrenDone: z.enum(['ask', 'auto', 'off']).optional().describe('História quando a última sub-tarefa em aberto é concluída'),
      confirmTrash: z.enum(['whenDependents', 'always', 'never']).optional(),
      confirmArchive: z.enum(['whenDependents', 'always', 'never']).optional(),
    },
    (a, router) => {
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      return router.handle({ type: 'settings.rules.update', patch }).board.rules;
    },
  );

  tool(
    'reset_board',
    'APAGA o board inteiro (cards, comentários, anexos e configurações) e recria com o padrão. Não pode ser desfeito: confirme com a pessoa antes.',
    {},
    (_a, router) => {
      router.handle({ type: 'settings.board.reset' });
      return overview(router);
    },
  );

  // ---------- harness: regras e skills do projeto ----------

  const ruleArg = z.enum(RULE_FILES.map((r) => r.name) as [string, ...string[]]).describe('Arquivo de regras na raiz do projeto');
  const skillArg = z.string().describe('Nome da skill (nome da pasta), ex.: "revisar-spec"');
  const harness = (router: MessageRouter) => harnessOverview(router.snapshot());
  const skill = (router: MessageRouter, name: string) => {
    const k = router.snapshot().harness.skills.find((x) => x.name === name);
    if (!k) throw new Error(`Skill "${name}" não encontrada.`);
    return k;
  };

  tool(
    'get_harness',
    'Lista o harness de IA do projeto: arquivos de regras (CLAUDE.md, AGENTS.md…) e skills, ligadas e desligadas, com descrição e caminho.',
    {},
    (_a, router) => harness(router),
    true,
  );

  tool('read_rule_file', 'Lê um arquivo de regras do projeto.', { file: ruleArg }, (a, router) => {
    const r = router.snapshot().harness.rules.find((x) => x.name === a.file);
    if (!r?.exists) throw new Error(`${a.file} não existe neste projeto.`);
    return r.content;
  }, true);

  tool('write_rule_file', 'Cria ou substitui por inteiro um arquivo de regras do projeto.', { file: ruleArg, content: z.string() }, (a, router) => {
    router.handle({ type: 'harness.rule.write', name: a.file, content: a.content });
    return harness(router);
  });

  tool('delete_rule_file', 'Apaga um arquivo de regras do projeto. Não pode ser desfeito pelo board.', { file: ruleArg }, (a, router) => {
    router.handle({ type: 'harness.rule.delete', name: a.file });
    return harness(router);
  });

  tool('get_skill', 'Lê o SKILL.md completo de uma skill do projeto.', { skill: skillArg }, (a, router) => skill(router, a.skill).content, true);

  tool(
    'create_skill',
    'Cria uma skill no projeto (.claude/skills/<nome>/SKILL.md). Ela passa a ser uma opção do campo "Skills" dos cards.',
    {
      name: z.string().describe('Letras minúsculas, números e hífens'),
      description: z.string().min(1).describe('Quando a skill deve ser usada; é por ela que a IA decide invocá-la'),
      content: z.string().describe('Instruções da skill em markdown (sem o frontmatter)'),
    },
    (a, router) => {
      router.handle({ type: 'harness.skill.create', name: a.name, description: a.description, content: a.content });
      return harness(router);
    },
  );

  tool('update_skill', 'Substitui o SKILL.md inteiro de uma skill, incluindo o frontmatter (name, description).', { skill: skillArg, content: z.string().min(1) }, (a, router) => {
    skill(router, a.skill);
    router.handle({ type: 'harness.skill.write', name: a.skill, content: a.content });
    return harness(router);
  });

  tool(
    'set_skill_enabled',
    'Liga ou desliga uma skill. Desligada, ela sai da pasta que as ferramentas de IA leem (economiza contexto) mas o conteúdo é preservado.',
    { skill: skillArg, enabled: z.boolean() },
    (a, router) => {
      skill(router, a.skill);
      router.handle({ type: 'harness.skill.setEnabled', name: a.skill, enabled: a.enabled });
      return harness(router);
    },
  );

  tool('delete_skill', 'Apaga uma skill do projeto, com todos os arquivos da pasta. Não pode ser desfeito pelo board.', { skill: skillArg }, (a, router) => {
    skill(router, a.skill);
    router.handle({ type: 'harness.skill.delete', name: a.skill });
    return harness(router);
  });
}

/** Ids das colunas com esse nome (pode haver uma em cada workflow). */
function findColumnIds(s: BoardState, name: string, workflowId?: string): Set<string> {
  if (workflowId) return new Set([findColumn(s, name, workflowId).id]);
  const ids = s.workflows.flatMap((w) => {
    try {
      return [findColumn(s, name, w.id).id];
    } catch {
      return [];
    }
  });
  if (!ids.length) findColumn(s, name); // lança o erro com a lista de colunas
  return new Set(ids);
}
