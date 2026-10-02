import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EMPTY_FILTERS, applyFilters } from '../../shared/filters';
import type { BoardState, Card } from '../../shared/model';
import type { MessageRouter } from '../panel/messageRouter';
import { ALL_AI_TOOLS, RULE_FILES, type AiTool } from '../../shared/harness';
import { TYPE_CONDITION, modelId, resolveModelInput, type ModelRule } from '../../shared/models';
import { newId } from '../db/ids';
import { FLOW_SKILL } from '../flowSkill';
import { ALL_CARD_STATUSES } from '../../shared/status';
import { boardOverview, pendingOverview, harnessOverview, modelsOverview, cardDetail, cardStatus, cardSummary, coerceFieldValue, findCard, findColumn, findField, findType, findWorkflow } from './format';

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
      return { fieldId: f.id, value: coerceFieldValue(f, value, s.board.modelCatalog) };
    });
    for (const v of values) router.handle({ type: 'field.setValue', cardId, ...v });
  };
  /** origem das ações desta sessão: a IA, assinando com o nome do cliente */
  const ai = () => ({ author: ctx.author(), source: 'ai' as const });
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
      work_status: z.enum(ALL_CARD_STATUSES as [string, ...string[]]).optional().describe('Status de trabalho do card (campo `work.status`)'),
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
      for (const [name, value] of Object.entries(a.fields ?? {})) coerceFieldValue(findField(s, name), value, s.board.modelCatalog);
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
      for (const [name, value] of Object.entries(a.fields ?? {})) coerceFieldValue(findField(s, name), value, s.board.modelCatalog);
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
      cancel_subtasks: z.boolean().optional().describe('Ao mover uma história para uma coluna de cancelamento, cancela também as sub-tarefas em aberto'),
    },
    (a, router) => {
      const s = router.snapshot();
      const card = live(findCard(s, a.card));
      const column = findColumn(s, a.column, card.workflowId);
      if (card.archivedAt !== null) router.handle({ type: 'card.unarchive', cardId: card.id, columnId: column.id, position: a.position ?? END }, ai());
      else router.handle({ type: 'card.move', cardId: card.id, columnId: column.id, position: a.position ?? END, cancelChildren: a.cancel_subtasks }, ai());
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

  // ---------- status de trabalho ----------

  const setStatus = (router: MessageRouter, ref: string | number, status: 'running' | 'waiting_review' | 'waiting_answer' | 'blocked', note: string | undefined, next: string) => {
    const card = live(findCard(router.snapshot(), ref));
    const after = router.handle({ type: 'card.status.set', cardId: card.id, status, note }, ai());
    return { card: cardSummary(after, after.cards.find((c) => c.id === card.id)!), next };
  };

  tool('start_work', 'Marca que você começou a trabalhar no card (status "running"). Chame antes de executar o trabalho de um card.', { card: cardArg }, (a, router) =>
    setStatus(router, a.card, 'running', undefined, 'Ao terminar, peça a revisão com request_review, pergunte com ask_question ou mova o card.'),
  );

  tool(
    'request_review',
    'Entrega o trabalho da fase para revisão de uma pessoa (status "waiting_review") e registra o resumo na conversa do card. Depois de chamar, PARE: só uma pessoa aprova. Se ela pedir ajustes, o card volta para "ready" com o pedido na conversa; quando aprovar, o status vira "approved" e você move o card.',
    { card: cardArg, summary: z.string().min(1).describe('O que foi feito e o que a pessoa deve revisar (markdown)') },
    (a, router) => setStatus(router, a.card, 'waiting_review', a.summary, 'Pare aqui. Não mova o card nem continue o trabalho dele até uma pessoa aprovar ou pedir ajustes.'),
  );

  tool(
    'ask_question',
    'Faz uma pergunta à pessoa na conversa do card e passa a vez para ela (status "waiting_answer"). Use quando faltar uma informação ou decisão. Depois de chamar, pare de trabalhar neste card até a resposta chegar.',
    { card: cardArg, question: z.string().min(1).describe('A pergunta (markdown)') },
    (a, router) => setStatus(router, a.card, 'waiting_answer', a.question, 'Pare aqui. Quando a pessoa responder na conversa, o card volta para "ready".'),
  );

  tool(
    'block_card',
    'Marca o card como bloqueado por um impedimento que você não consegue resolver (acesso, dependência externa, erro de ambiente) e registra o motivo na conversa.',
    { card: cardArg, reason: z.string().min(1).describe('O que impede o trabalho e o que é preciso para destravar') },
    (a, router) => setStatus(router, a.card, 'blocked', a.reason, 'Pare aqui. Uma pessoa precisa desbloquear o card.'),
  );

  tool(
    'prepare_workspace',
    'Cria (ou reaproveita) a branch da história e a pasta em que o código dela deve ser alterado. Chame antes de mexer em código do projeto; pode ser chamada de uma sub-tarefa. O nome da branch e a pasta são definidos pelo board: não crie branches por conta própria.',
    { card: cardArg },
    (a, router) => {
      const card = live(findCard(router.snapshot(), a.card));
      router.handle({ type: 'card.workspace.prepare', cardId: card.id }, ai());
      return detail(router, card.id).workspace;
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
    'Escreve na conversa do card (markdown). Use para registrar decisões e o resultado do trabalho e para responder à pessoa. A mensagem é assinada com o nome do cliente de IA. Para pedir revisão use request_review; para perguntar, ask_question.',
    { card: cardArg, body: z.string().min(1) },
    (a, router) => {
      const card = findCard(router.snapshot(), a.card);
      router.handle({ type: 'comment.add', cardId: card.id, body: a.body }, ai());
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
      const target = a.artifact ? card.parentId ?? card.id : card.id;
      const before = new Set(router.snapshot().attachments.map((x) => x.id));
      if (a.path) {
        const file = path.resolve(ctx.workspaceDir, a.path);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Arquivo não encontrado: ${file}`);
        router.addAttachmentFiles(card.id, [file], a.artifact);
      } else if (a.filename && a.content !== undefined) {
        router.handle({ type: 'attachment.addData', cardId: card.id, filename: a.filename, base64: Buffer.from(a.content, 'utf8').toString('base64'), artifact: a.artifact });
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
    'Altera uma coluna: nome, o que ela representa (categoria), posição no workflow, se a IA atua nela, se ela exige aprovação de uma pessoa para o card avançar, e a fase (instrução para a IA e modelo do documento que a fase produz).',
    { column: z.string(), workflow: columnWorkflowArg, name: z.string().min(1).optional(), category: categoryArg.optional(), position: z.number().int().min(0).optional(), collapsed: z.boolean().optional().describe('A coluna começa colapsada ao abrir o board'), ai_active: z.boolean().optional().describe('A IA trabalha nos cards desta coluna: ao entrar nela o card fica "ready"'), requires_approval: z.boolean().optional().describe('A IA só avança o card depois que uma pessoa aprova'), ai_instruction: z.string().optional().describe('O que a IA faz quando um card entra nesta coluna (fase)'), artifact_name: z.string().optional().describe('Nome do arquivo do documento que a fase produz, ex.: "PRD.md"; vazio se não produz'), artifact_template: z.string().optional().describe('Modelo do documento, em markdown') },
    (a, router) => {
      const s = router.snapshot();
      const col = findColumn(s, a.column, a.workflow ? findWorkflow(s, a.workflow).id : undefined);
      router.handle({ type: 'settings.column.update', columnId: col.id, patch: { name: a.name, category: a.category, position: a.position, collapsed: a.collapsed, aiActive: a.ai_active, requiresApproval: a.requires_approval, aiInstruction: a.ai_instruction, artifactName: a.artifact_name, artifactTemplate: a.artifact_template } });
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

  tool(
    'set_workflow_layout',
    'Define como uma linha do board aparece ao abrir: a linha inteira colapsada ou não, e a coluna de arquivados dela colapsada ou não.',
    { workflow: workflowArg, collapsed: z.boolean().optional(), archive_collapsed: z.boolean().optional() },
    (a, router) => {
      router.handle({ type: 'settings.workflow.update', workflowId: findWorkflow(router.snapshot(), a.workflow).id, patch: { collapsed: a.collapsed, archiveCollapsed: a.archive_collapsed } });
      return overview(router);
    },
  );

  tool(
    'set_appearance',
    'Ajusta a aparência do board: tema (system acompanha o VS Code, light, dark) e a fonte e o tamanho dos textos longos (descrição e comentários).',
    {
      theme: z.enum(['system', 'light', 'dark']).optional(),
      font: z.enum(['sans', 'ui', 'serif', 'mono', 'editor']).optional().describe('sans = sem serifa do sistema; ui = fonte da interface do VS Code; editor = fonte do editor do VS Code'),
      font_size: z.number().int().min(11).max(22).optional().describe('Tamanho em px'),
    },
    (a, router) => {
      const patch = Object.fromEntries(Object.entries({ theme: a.theme, font: a.font, fontSize: a.font_size }).filter(([, v]) => v !== undefined));
      return router.handle({ type: 'settings.board.update', patch: { appearance: patch } }).board.appearance;
    },
  );

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
      default_fields: fieldsArg.optional().describe('Padrões por nome do campo, ex.: {"Modelo": "claude:sonnet@medium", "Skills": ["revisar-spec"]}. Substitui todos os padrões do tipo; {} limpa.'),
    },
    (a, router) => {
      const s = router.snapshot();
      const defaults = a.default_fields
        ? Object.fromEntries(Object.entries(a.default_fields).map(([name, value]) => { const f = findField(s, name); return [f.id, coerceFieldValue(f, value, s.board.modelCatalog)]; }))
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
      autoApplyModelSuggestion: z.boolean().optional().describe('Preencher o campo de modelo com a sugestão enquanto ele não foi escolhido à mão'),
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

  // ---------- modelos de LLM ----------

  const toolArg = z.enum(ALL_AI_TOOLS as [string, ...string[]]).describe('Ferramenta de IA: claude, codex, cursor, kimi ou copilot');
  const models = (router: MessageRouter) => modelsOverview(router.snapshot());

  tool(
    'get_models',
    'Catálogo de modelos de LLM do board (por ferramenta, com os níveis de esforço que cada um aceita) e as regras que sugerem um modelo a partir dos campos do card.',
    {},
    (_a, router) => models(router),
    true,
  );

  tool(
    'detect_models',
    'Relê os modelos de uma ferramenta e os junta ao catálogo. Para o Kimi, lê a lista real do config.toml local; para as demais, usa a lista embutida na extensão.',
    { tool: toolArg.optional().describe('Por padrão, a ferramenta em uso no projeto') },
    (a, router) => {
      router.handle({ type: 'settings.models.detect', tool: (a.tool as AiTool | undefined) ?? router.snapshot().board.aiTool });
      return models(router);
    },
  );

  tool(
    'upsert_model',
    'Cria ou atualiza um modelo no catálogo. Use para registrar os modelos e níveis de esforço que você (a ferramenta de IA em uso) realmente tem disponíveis.',
    {
      tool: toolArg,
      model: z.string().min(1).describe('Identificador usado pela ferramenta para escolher o modelo, ex.: "opus", "k3", "gpt-6.1-sol"'),
      label: z.string().optional().describe('Nome para exibição; por padrão, o identificador'),
      efforts: z.array(z.string()).optional().describe('Níveis de esforço/raciocínio aceitos, do menor para o maior; vazio se o modelo não tem esse ajuste'),
      default_effort: z.string().optional(),
    },
    (a, router) => {
      const catalog = [...router.snapshot().board.modelCatalog];
      const id = modelId(a.tool as AiTool, a.model);
      const efforts = a.efforts ?? [];
      if (a.default_effort && !efforts.includes(a.default_effort)) throw new Error('default_effort precisa ser um dos efforts.');
      const entry = { id, tool: a.tool as AiTool, model: a.model, label: a.label ?? a.model, efforts, defaultEffort: a.default_effort ?? null };
      const at = catalog.findIndex((o) => o.id === id);
      if (at >= 0) catalog[at] = entry;
      else catalog.push(entry);
      router.handle({ type: 'settings.models.set', catalog });
      return models(router);
    },
  );

  tool('delete_model', 'Remove um modelo do catálogo.', { model: z.string().describe('`value` do modelo no catálogo, ex.: "claude:opus"') }, (a, router) => {
    const catalog = router.snapshot().board.modelCatalog;
    if (!catalog.some((o) => o.id === a.model)) throw new Error(`Modelo "${a.model}" não está no catálogo.`);
    router.handle({ type: 'settings.models.set', catalog: catalog.filter((o) => o.id !== a.model) });
    return models(router);
  });

  tool(
    'set_model_rules',
    'Substitui a lista de regras de sugestão de modelo. Em cada regra, `when` é uma lista de alternativas (OU); cada alternativa é uma lista de condições que precisam valer juntas (E). A primeira regra ligada que casa vence. O modelo é sempre uma sugestão: a pessoa pode escolher outro no card a qualquer momento.',
    {
      rules: z.array(
        z.object({
          name: z.string().optional(),
          when: z
            .array(
              z.array(
                z.object({
                  field: z.string().describe('Nome do campo (ex.: "Esforço", "Tags") ou "Tipo" para o tipo do card'),
                  value: z.string().describe('Valor comparado, ex.: "Alto", "backend", "Bug"'),
                  not: z.boolean().optional().describe('true = a condição vale quando o campo NÃO tem esse valor'),
                }),
              ).min(1),
            )
            .min(1)
            .describe('Ex.: [[{Esforço=Alto},{Tags=backend}], [{Tipo=Bug}]] significa (Esforço=Alto E Tags=backend) OU Tipo=Bug'),
          model: z.string().describe('Modelo e esforço, ex.: "claude:opus@high" ou "Opus 5.5 high"'),
          enabled: z.boolean().optional(),
        }),
      ),
    },
    (a, router) => {
      const s = router.snapshot();
      const fieldId = (name: string) => (['tipo', 'type', TYPE_CONDITION].includes(name.trim().toLowerCase()) ? TYPE_CONDITION : findField(s, name).id);
      const rules: ModelRule[] = a.rules.map((r) => ({
        id: newId(),
        name: r.name ?? '',
        enabled: r.enabled !== false,
        groups: r.when.map((g) => g.map((c) => ({ fieldId: fieldId(c.field), op: c.not ? ('isNot' as const) : ('is' as const), value: c.value }))),
        model: resolveModelInput(s.board.modelCatalog, r.model),
      }));
      router.handle({ type: 'settings.modelRules.set', rules });
      return models(router);
    },
  );

  tool(
    'suggest_model_rules',
    'Recria as regras "Esforço da tarefa → modelo" (Baixo, Médio, Alto) com um modelo leve, um intermediário e um forte da ferramenta indicada.',
    { tool: toolArg.optional().describe('Por padrão, a ferramenta em uso no projeto') },
    (a, router) => {
      router.handle({ type: 'settings.modelRules.suggest', tool: (a.tool as AiTool | undefined) ?? router.snapshot().board.aiTool });
      return models(router);
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
    'Lista o harness de IA do projeto: a ferramenta em uso, os arquivos de regras (CLAUDE.md, AGENTS.md) e as skills dela, ligadas e desligadas, com descrição e caminho.',
    {},
    (_a, router) => harness(router),
    true,
  );

  tool(
    'set_ai_tool',
    'Define a ferramenta de IA com que o projeto trabalha (uma por vez). Isso troca a pasta de skills (.claude/skills, .agents/skills, .cursor/skills, .kimi/skills ou .github/skills), o arquivo de regras, os modelos e as regras de esforço.',
    { tool: z.enum(ALL_AI_TOOLS as [string, ...string[]]) },
    (a, router) => {
      router.handle({ type: 'settings.board.update', patch: { aiTool: a.tool as AiTool } });
      return harness(router);
    },
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
    'Cria uma skill no projeto, na pasta de skills da ferramenta de IA em uso. Ela passa a ser uma opção do campo "Skills" dos cards.',
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

  tool(
    'install_flow_skill',
    'Instala no projeto a skill "faz-ai-fluxo", que ensina a conduzir os cards pelo fluxo do board (fases, documentos, revisão, pendências). Não sobrescreve uma skill de mesmo nome que já exista.',
    {},
    (_a, router) => {
      const had = router.snapshot().harness.skills.some((k) => k.name === FLOW_SKILL.name);
      router.handle({ type: 'harness.flowSkill.install' });
      return { installed: !had, note: had ? 'A skill já existia e foi mantida como está.' : 'Skill criada.', skill: router.snapshot().harness.skills.find((k) => k.name === FLOW_SKILL.name)?.path };
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
