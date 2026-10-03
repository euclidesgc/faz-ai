import { workflowDeleteBlocker } from '../../../shared/selectors';
import { upgradeBoard } from '../../db/boardTemplate';
import type { HandlerMap } from './context';
import { initModels, useTool } from './models';

/** Configurações do board: colunas, tipos, campos, workflows, regras, perfis de execução e o próprio board. */
export const boardSettingsHandlers = {
  'settings.column.create': (msg, ctx) => {
    ctx.settings.createColumn(msg.workflowId, msg.name, msg.position);
    return true;
  },
  'settings.column.update': (msg, ctx) => {
    ctx.settings.updateColumn(msg.columnId, msg.patch);
    return true;
  },
  'settings.column.delete': (msg, ctx) => {
    ctx.settings.deleteColumn(msg.columnId, msg.moveCardsTo);
    return true;
  },
  'settings.type.create': (msg, ctx) => {
    ctx.settings.createType(ctx.boardId, msg.name, msg.color, msg.defaultWorkflowId);
    return true;
  },
  'settings.type.update': (msg, ctx) => {
    ctx.settings.updateType(msg.typeId, msg.patch);
    return true;
  },
  'settings.type.delete': (msg, ctx) => {
    ctx.settings.deleteType(msg.typeId);
    return true;
  },
  'settings.field.create': (msg, ctx) => {
    ctx.settings.createField(ctx.boardId, msg);
    return true;
  },
  'settings.field.update': (msg, ctx) => {
    ctx.settings.updateField(msg.fieldId, msg.patch);
    return true;
  },
  'settings.field.delete': (msg, ctx) => {
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
    ctx.boards.updateRules(ctx.boardId, msg.patch);
    return true;
  },
  'settings.execProfiles.set': (msg, ctx) => {
    ctx.boards.setExecProfiles(ctx.boardId, msg.profiles);
    return true;
  },
  'settings.board.update': (msg, ctx) => {
    ctx.boards.updateBoard(ctx.boardId, msg.patch);
    if (msg.patch.aiTool) useTool(ctx, ctx.state().board.aiTool);
    return true;
  },
  'settings.board.reset': (_msg, ctx) => {
    ctx.boards.deleteBoard(ctx.boardId).forEach((id) => ctx.store.removeCard(id));
    ctx.boardId = ctx.boards.getOrCreate(ctx.opts.workspaceKey, ctx.opts.folderName).id;
    initModels(ctx);
    return true;
  },
  'settings.board.upgrade': (_msg, ctx) => {
    ctx.dbHandle.backup?.();
    upgradeBoard(ctx.dbHandle.db, ctx.boardId);
    return true;
  },
} satisfies Partial<HandlerMap>;
