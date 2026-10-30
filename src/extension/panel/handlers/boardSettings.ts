import { boardFieldNamed, fieldChangeBlocker, newFieldBlocker, typeDefaultsBlocker } from '../../../shared/boardFields';
import type { Id } from '../../../shared/model';
import { workflowDeleteBlocker } from '../../../shared/selectors';
import { upgradeBoard } from '../../db/boardTemplate';
import type { BoardContext, HandlerMap } from './context';
import { guardGitPatch, registerRenames } from './branchRename';
import { applyFastModels, useTool } from './models';

/** Configurações do board: colunas, tipos, campos, workflows, regras, agentes de execução e o próprio board. */
export const boardSettingsHandlers = {
  'settings.column.create': (msg, ctx) => {
    ctx.settings.createColumn(msg.workflowId, msg.name, msg.position);
    return true;
  },
  'settings.column.update': (msg, ctx, actor) => {
    // o portão é da pessoa: a IA não afrouxa a própria checagem
    if (actor.byAi && msg.patch.checks !== undefined)
      throw new Error('As checagens da coluna são definidas só pela pessoa, em Configurações.');
    ctx.settings.updateColumn(msg.columnId, msg.patch);
    return true;
  },
  'settings.column.delete': (msg, ctx) => {
    ctx.settings.deleteColumn(msg.columnId, msg.moveCardsTo);
    return true;
  },
  'settings.type.create': (msg, ctx) => {
    followBoardFields(ctx, ctx.settings.createType(ctx.boardId, msg.name, msg.color, msg.defaultWorkflowId));
    return true;
  },
  'settings.type.update': (msg, ctx) => {
    const blocker = msg.patch.defaults && typeDefaultsBlocker(ctx.state(), msg.typeId, msg.patch.defaults);
    if (blocker) throw new Error(blocker);
    ctx.settings.updateType(msg.typeId, msg.patch);
    if (msg.patch.defaultWorkflowId !== undefined) followBoardFields(ctx, msg.typeId);
    return true;
  },
  'settings.type.delete': (msg, ctx) => {
    ctx.settings.deleteType(msg.typeId);
    return true;
  },
  'settings.field.create': (msg, ctx) => {
    const blocker = newFieldBlocker(msg);
    if (blocker) throw new Error(blocker);
    ctx.settings.createField(ctx.boardId, msg);
    return true;
  },
  'settings.field.update': (msg, ctx) => {
    const blocker = fieldChangeBlocker(ctx.state(), msg.fieldId, msg.patch);
    if (blocker) throw new Error(blocker);
    ctx.settings.updateField(msg.fieldId, msg.patch);
    return true;
  },
  'settings.field.delete': (msg, ctx) => {
    const blocker = fieldChangeBlocker(ctx.state(), msg.fieldId, 'delete');
    if (blocker) throw new Error(blocker);
    ctx.settings.deleteField(msg.fieldId);
    return true;
  },
  'settings.workflow.create': (msg, ctx) => {
    ctx.boards.createWorkflow(ctx.boardId, msg.name, msg.kind);
    return true;
  },
  'settings.workflow.update': (msg, ctx) => {
    ctx.boards.updateWorkflow(msg.workflowId, msg.patch);
    return true;
  },
  'settings.workflow.delete': (msg, ctx) => {
    const blocker = workflowDeleteBlocker(ctx.state(), msg.workflowId);
    if (blocker) throw new Error(blocker);
    ctx.boards.deleteWorkflow(msg.workflowId);
    return true;
  },
  'settings.rules.update': (msg, ctx) => {
    const before = ctx.state().board.rules.includeFastModels;
    ctx.boards.updateRules(ctx.boardId, msg.patch);
    if (ctx.state().board.rules.includeFastModels !== before) applyFastModels(ctx);
    return true;
  },
  'settings.board.update': (msg, ctx) => {
    // mudar o nome da principal ou da develop pede a renomeação no repositório (#466): a configuração
    // grava na hora e o pedido espera Renomear ou Desfazer. Com a IA executando, a mudança é recusada.
    const renames = msg.patch.git ? guardGitPatch(ctx, msg.patch.git) : null;
    ctx.boards.updateBoard(ctx.boardId, msg.patch);
    if (renames) registerRenames(ctx, renames);
    if (msg.patch.aiTool) useTool(ctx, ctx.state().board.aiTool);
    return true;
  },
  'settings.board.upgrade': (_msg, ctx) => {
    ctx.dbHandle.backup?.();
    upgradeBoard(ctx.dbHandle.db, ctx.boardId);
    return true;
  },
} satisfies Partial<HandlerMap>;

/**
 * "Fase" vale só nos tipos das sub-tarefas. Como os campos do board não
 * aparecem em Configurações, o tipo novo (ou que mudou de workflow) entra neles ou sai deles sozinho.
 */
function followBoardFields(ctx: BoardContext, typeId: Id): void {
  const s = ctx.state();
  const type = s.cardTypes.find((t) => t.id === typeId);
  const kind = s.workflows.find((w) => w.id === type?.defaultWorkflowId)?.kind;
  for (const f of s.fieldDefs) {
    const workflow = boardFieldNamed(f.name)?.workflow;
    if (!workflow || f.appliesToTypes === null) continue;
    const has = f.appliesToTypes.includes(typeId);
    if (has === (kind === workflow)) continue;
    ctx.settings.updateField(f.id, {
      appliesToTypes: has ? f.appliesToTypes.filter((id) => id !== typeId) : [...f.appliesToTypes, typeId],
    });
  }
}
