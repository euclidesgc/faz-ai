import { z } from 'zod';
import { MODEL_FIELD } from '../../../shared/boardFields';
import { linkProblem } from '../../../shared/links';
import { columnsOf } from '../../../shared/selectors';
import { BRIEF_SECTIONS, REQUIRED_BRIEF_SECTIONS } from '../../../shared/subtaskBrief';
import { cardStatus, cardSummary, findCard, findColumn, findField, findType } from '../format';
import { isClosingReview, isLeavingReview } from '../../reviewRoundApply';
import { cardArg, fieldsArg } from './args';
import { END, addChecklist, aiOrigin, detail, findProfile, live, setFields, validateFields } from './helpers';
import type { DefineTool, ToolContext } from './registry';

const BRIEF_TITLES = REQUIRED_BRIEF_SECTIONS.join(', ').replace(/, ([^,]*)$/, ' e $1');

/** Cards: criar, alterar e mover entre colunas. */
export function registerCardTools(tool: DefineTool, ctx: ToolContext): void {
  tool(
    'create_card',
    `Cria um card. Com \`parent\`, cria uma sub-tarefa daquela história (no workflow filho); sem \`parent\`, cria uma história (no workflow pai). \`profile\` escolhe o agente e \`checklist\` cria os itens na mesma chamada. Devolve o card resumido (mais \`checklistItems\`, com ids, quando criou itens); o detalhe (phase, notas, workspace) vem pelo get_card. Numa sub-tarefa de fase de código, use as seções ${BRIEF_TITLES} (e ${BRIEF_SECTIONS.decisions}, se houver): o board confere antes de executar. O modelo da correção criada depois de uma checagem que falhou é escolhido pelo board. Na sub-tarefa de Revisão o board escolhe o modelo (outro, nunca o barato); não o defina.`,
    {
      title: z.string().min(1),
      description: z.string().optional().describe('Markdown'),
      parent: cardArg.optional().describe('História à qual a sub-tarefa pertence'),
      type: z.string().optional().describe('Nome do tipo de card; por padrão, o primeiro tipo do workflow'),
      column: z.string().optional().describe('Nome da coluna; por padrão, a primeira do workflow'),
      fields: fieldsArg.optional(),
      profile: z.string().optional().describe('Nome do agente do card (como em set_card_profile)'),
      checklist: z.array(z.string().min(1)).optional().describe('Itens do checklist, na ordem'),
      depends_on: z
        .array(cardArg)
        .optional()
        .describe(
          'Só em sub-tarefa: outras sub-tarefas que precisam terminar antes desta começar (as que ela usa, ou que mexem nos mesmos arquivos). O board executa as sub-tarefas de uma história uma por vez, nessa ordem.',
        ),
      autonomous_from: cardArg
        .optional()
        .describe(
          'Só em história: número de uma história em modo autônomo (YOLO) de que esta nasce. A nova também fica em modo autônomo e entra na fila depois dela, com o pull request empilhado. Use para dividir um pedido grande em entregas.',
        ),
      derived_from: cardArg
        .optional()
        .describe(
          'Só em história: número da parte anterior da funcionalidade dividida em entregas (ex.: no Plan, quando passa de umas 400 linhas): a primeira derivada aponta para a história original, a segunda para a primeira derivada, e assim por diante. A branch da nova parte da branch da anterior e o pull request dela é empilhado sobre o da anterior. Vale dentro e fora do modo autônomo; não liga o modo.',
        ),
    },
    (a, router) => {
      const s = router.snapshot();
      if (a.autonomous_from !== undefined && a.parent !== undefined)
        throw new Error('autonomous_from vale para histórias; sub-tarefas herdam o modo da história.');
      const origin = a.autonomous_from !== undefined ? live(findCard(s, a.autonomous_from)) : null;
      if (origin && !origin.yolo) throw new Error(`#${origin.number} não está em modo autônomo; só uma pessoa liga o modo numa história.`);
      if (a.derived_from !== undefined && a.parent !== undefined)
        throw new Error('derived_from vale para histórias; sub-tarefas seguem a branch da história delas.');
      const derivedFrom = a.derived_from !== undefined ? live(findCard(s, a.derived_from)) : null;
      if (derivedFrom?.parentId) throw new Error(`#${derivedFrom.number} é uma sub-tarefa; informe a história de origem.`);
      const parent = a.parent !== undefined ? live(findCard(s, a.parent)) : null;
      if (a.depends_on?.length && !parent) throw new Error('depends_on vale para sub-tarefas: informe `parent`.');
      // a mesma dependência informada duas vezes vira um vínculo só
      const dependsOn = [...new Map((a.depends_on ?? []).map((ref) => live(findCard(s, ref))).map((c) => [c.id, c])).values()];
      if (parent?.parentId) throw new Error(`#${parent.number} é uma sub-tarefa; o pai precisa ser uma história.`);
      const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'));
      if (!wf) throw new Error('Workflow não encontrado.');
      const type = a.type ? findType(s, a.type) : s.cardTypes.find((t) => t.defaultWorkflowId === wf.id);
      if (!type) throw new Error(`Nenhum tipo de card definido para o workflow "${wf.name}".`);
      const column = a.column ? findColumn(s, a.column, wf.id) : columnsOf(s, wf.id)[0];
      if (!column) throw new Error(`O workflow "${wf.name}" não tem colunas.`);
      // valida os campos antes de criar, para não deixar um card pela metade
      validateFields(s, a.fields);
      const profile = a.profile ? findProfile(s, a.profile) : null;
      // e os vínculos de dependência, contra um card provisório no lugar do que vai nascer
      if (parent && dependsOn.length) {
        const draft = { ...parent, id: '\0novo', number: 0, parentId: parent.id, workflowId: wf.id, columnId: column.id, status: null };
        const preview = { ...s, cards: [...s.cards, draft] };
        for (const dep of dependsOn) {
          const problem = linkProblem(preview, dep.id, draft.id, 'precedes');
          if (problem) throw new Error(`depends_on #${dep.number}: ${problem}`);
        }
      }
      const id = router.createCard({ typeId: type.id, columnId: column.id, parentId: parent?.id ?? null, title: a.title }, aiOrigin(ctx));
      if (a.description) router.handle({ type: 'card.update', cardId: id, patch: { description: a.description } });
      setFields(router, s, id, a.fields, aiOrigin(ctx));
      if (parent) {
        router.applyEscalationToNewCard(id);
        // a IA informou o Modelo: conta como dela (o board o troca se for o barato ou o mesmo do implementador)
        router.applyReviewerModelToNewCard(
          id,
          Object.keys(a.fields ?? {}).some((name) => findField(s, name).name === MODEL_FIELD),
        );
      }
      for (const dep of dependsOn) router.handle({ type: 'link.add', fromId: dep.id, toId: id, kind: 'precedes' }, aiOrigin(ctx));
      // a pilha vem antes do modo: a herança decide o vínculo (dependência ou relação) pela origem da pilha
      if (derivedFrom) router.handle({ type: 'card.derive', cardId: id, fromId: derivedFrom.id }, aiOrigin(ctx));
      if (origin) router.handle({ type: 'card.yolo.inherit', cardId: id, fromId: origin.id }, aiOrigin(ctx));
      if (profile) router.handle({ type: 'card.execProfile.set', cardId: id, profileId: profile.id }, aiOrigin(ctx));
      // depois do agente: o bloco "Rodada N" só vale na revisão do `revisor-de-codigo`, e vai ao fim da descrição
      if (parent) router.appendReviewRoundBlock(id);
      const checklistItems = a.checklist?.length ? addChecklist(router, id, a.checklist) : undefined;
      // o resumo basta para seguir o Plan; o detalhe (phase, notas, workspace) vem pelo get_card
      const after = router.snapshot();
      return {
        ...cardSummary(
          after,
          after.cards.find((c) => c.id === id)!,
        ),
        ...(checklistItems ? { checklistItems } : {}),
      };
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
      setFields(router, s, card.id, a.fields, aiOrigin(ctx));
      return detail(router, card.id);
    },
  );

  tool(
    'move_card',
    'Move um card para outra coluna do seu workflow — é assim que se sinaliza progresso. As regras do board se aplicam: por padrão, uma história não entra em coluna de conclusão enquanto tiver sub-tarefas em aberto, e um card só avança de uma coluna que exige aprovação (`requiresApproval` em get_board) quando o status dele é "approved". Para uma coluna de conclusão, o checklist do card não pode ter item em aberto: marque com update_checklist_item o que fez e apague com delete_checklist_item o que não se aplica. Um card arquivado é desarquivado ao ser movido. `comment` grava a mensagem de conclusão na conversa depois do movimento (equivale a move_card + add_comment); um movimento recusado não grava nada. Ao sair para a frente de uma coluna com checagens (`checks` em get_board) o card não se move na hora: fica em "Verificando" (o resultado traz `gate`), o board roda as checagens e você PARA; passando, o card vai ao destino; falhando, volta para "ready" com o fim da saída na conversa, e o `comment` não é gravado. Fechar a sub-tarefa de revisão (agente revisor-de-codigo) exige `VEREDITO: APROVADO|REPROVADO|NÃO COMPROVADO` na última linha do `comment`; sem ele o card não se move. A história só sai da Revisão se a última rodada for APROVADO.',
    {
      card: cardArg,
      column: z.string().describe('Nome da coluna de destino'),
      comment: z.string().min(1).optional().describe('Mensagem de conclusão (markdown), gravada na conversa do card depois do movimento'),
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
      // o checklist é o registro do que foi feito: a IA não conclui o card deixando-o todo desmarcado
      const open = s.checklistItems.filter((i) => i.cardId === card.id && !i.done);
      if (column.category === 'done' && card.columnId !== column.id && open.length)
        throw new Error(
          `Não é possível concluir #${card.number}: ${open.length} item(ns) do checklist em aberto (${open.map((i) => `"${i.text}" [${i.id}]`).join(', ')}). Marque com update_checklist_item o que foi feito e apague com delete_checklist_item o que não se aplica; depois mova de novo.`,
        );
      // revisão independente (#1324): o veredito válido fecha a sub-tarefa e a história só sai com a última rodada APROVADO
      let recorded = false;
      if (isClosingReview(s, card, column)) {
        const closed = router.closeReviewSubtask(card.id, a.comment);
        if (!closed.ok) throw new Error(closed.problem);
        recorded = true;
      } else if (isLeavingReview(s, card, column)) {
        const exit = router.reviewExitGate(card.id);
        if (!exit.ok) {
          if (exit.block) router.handle({ type: 'card.status.set', cardId: card.id, status: 'blocked', note: exit.reason }, aiOrigin(ctx));
          throw new Error(exit.reason);
        }
      }
      try {
        if (card.archivedAt !== null)
          router.handle({ type: 'card.unarchive', cardId: card.id, columnId: column.id, position: a.position ?? END }, aiOrigin(ctx));
        else
          router.handle(
            { type: 'card.move', cardId: card.id, columnId: column.id, position: a.position ?? END, cancelChildren: a.cancel_subtasks },
            aiOrigin(ctx),
          );
      } catch (e) {
        if (recorded) router.discardReviewRound(card.id);
        throw e;
      }
      // o portão das checagens não move o card: ele fica "Verificando" e a mensagem de conclusão ainda não vale
      const verifying = router.snapshot().cards.find((c) => c.id === card.id)?.status === 'verifying';
      // o card não saiu da coluna: a rodada só vale quando o fechamento se completa
      if (verifying && recorded) router.discardReviewRound(card.id);
      // só depois do movimento aceito: a recusa lança antes e a conversa fica como estava
      if (a.comment && !verifying) router.handle({ type: 'comment.add', cardId: card.id, body: a.comment }, aiOrigin(ctx));
      const after = router.snapshot();
      const result: Record<string, unknown> = {
        card: cardSummary(
          after,
          after.cards.find((c) => c.id === card.id)!,
        ),
      };
      if (verifying) {
        const gate = router.runningGate(card.id);
        if (gate) result.gate = { id: gate.id, status: 'verifying' };
        result.next =
          'Pare aqui. O card não se moveu: está em "Verificando" e o board roda as checagens da coluna. Não mova o card nem continue o trabalho dele. Passando, o card vai ao destino; falhando, volta para "ready" com o fim da saída na conversa.' +
          (a.comment ? ' Atenção: a mensagem de conclusão não foi gravada: grave-a de novo quando o card chegar ao destino.' : '');
        return result;
      }
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
