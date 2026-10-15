import type { WebviewToHost } from '../shared/messages';
import type { AiTool, HarnessKind, InstallScope, PluginAction, SkillMode } from '../shared/harness';
import type { HarnessUsage, SelectableKind } from '../shared/harnessSelection';
import type { AgentInput } from '../shared/messages';
import type { HookInput, McpServerInput } from '../shared/harnessCatalog';
import type { CardStatus } from '../shared/status';
import type { ModelOption, ModelRule } from '../shared/models';
import type { BoardRules } from '../shared/rules';
import type { FieldValue, Id, LinkKind, WorkflowKind } from '../shared/model';
import { postToHost } from './vscode';
import { request } from './request';

/** Patch de cada mensagem `*.update`, tirado do protocolo para não repetir a forma aqui. */
type PatchOf<T extends WebviewToHost['type']> = Extract<WebviewToHost, { type: T }> extends { patch: infer P } ? P : never;
type Payload<T extends WebviewToHost['type']> = Omit<Extract<WebviewToHost, { type: T }>, 'type'>;

export type BoardPatch = PatchOf<'settings.board.update'>;
export type ColumnPatch = PatchOf<'settings.column.update'>;
export type FieldInput = Payload<'settings.field.create'>;
/** Para onde copiar ou instalar itens do harness. */
export type HarnessScope = 'project' | 'user';

const post = (msg: WebviewToHost): void => postToHost(msg);
/** Como `post`, mas espera o `done` do host: para as ações que demoram e precisam mostrar a espera (`useAction`). */
const req = (msg: WebviewToHost): Promise<void> => request(msg);

/**
 * Tudo o que o front pede ao host, com nome de ação. Os componentes chamam `cards.trash(id)`
 * e não conhecem o formato das mensagens de `WebviewToHost`.
 */
export const ui = {
  showFilters: () => post({ type: 'ui.showFilters' }),
  /** instala o servidor MCP do board: padrão é a ferramenta do projeto, no escopo global */
  connectAI: (tool?: AiTool, scope?: InstallScope) => req({ type: 'ui.connectAI', tool, scope }),
  openInBrowser: () => post({ type: 'ui.openInBrowser' }),
  openIdeSettings: (key?: string) => post({ type: 'ui.openIdeSettings', key }),
  /** a tela Git pede para detectar de novo a branch principal (sem rede) */
  refreshMainBranch: () => post({ type: 'git.main.refresh' }),
  showChat: () => post({ type: 'ui.showChat' }),
  checkRequirements: () => req({ type: 'requirements.check' }),
  fixProjectMcp: (file: string) => req({ type: 'ui.fixProjectMcp', file }),
  reloadWindow: () => post({ type: 'ui.reloadWindow' }),
  openEditorMcp: () => post({ type: 'ui.openEditorMcp' }),
  openTerminal: (command: string) => post({ type: 'ui.openTerminal', command }),
  checkEnvironment: () => req({ type: 'environment.check' }),
  environmentSeen: () => post({ type: 'environment.seen' }),
  pinMcp: () => req({ type: 'environment.pinMcp' }),
};

export const chat = {
  send: (text: string, model: string | null) => post({ type: 'chat.send', text, model }),
  stop: () => post({ type: 'chat.stop' }),
  clear: () => post({ type: 'chat.clear' }),
};

export const ai = {
  run: (cardId: Id) => post({ type: 'ai.run', cardId }),
  refine: (cardId: Id) => post({ type: 'ai.run', cardId, mode: 'refine' }),
  summarize: (cardId: Id) => post({ type: 'ai.run', cardId, mode: 'summarize' }),
  stop: (cardId: Id) => post({ type: 'ai.stop', cardId }),
  runHeartbeat: () => post({ type: 'ai.heartbeat.run' }),
  /** a IA lê o projeto e propõe os agentes do board; o resultado vai para o chat do board */
  suggestAgents: () => post({ type: 'ai.suggestAgents' }),
  /** a IA lê o projeto e propõe regras, gravadas e enviadas ao board desligadas */
  suggestRules: () => post({ type: 'ai.suggestRules' }),
  /** a IA lê o projeto e propõe skills, gravadas e enviadas ao board em "Pelo card" */
  suggestSkills: () => post({ type: 'ai.suggestSkills' }),
  pauseAutopilot: () => post({ type: 'ai.autopilot.pause' }),
  resumeAutopilot: () => post({ type: 'ai.autopilot.resume' }),
};

export const cards = {
  create: (input: Payload<'card.create'>) => post({ type: 'card.create', ...input }),
  update: (cardId: Id, patch: PatchOf<'card.update'>) => post({ type: 'card.update', cardId, patch }),
  move: (cardId: Id, columnId: Id, position: number, cancelChildren?: boolean) =>
    post({ type: 'card.move', cardId, columnId, position, ...(cancelChildren ? { cancelChildren } : {}) }),
  trash: (cardId: Id) => post({ type: 'card.trash', cardId }),
  restore: (cardId: Id) => post({ type: 'card.restore', cardId }),
  archive: (cardId: Id) => post({ type: 'card.archive', cardId }),
  unarchive: (cardId: Id, to?: { columnId: Id; position: number }) => post({ type: 'card.unarchive', cardId, ...to }),
  restoreArchived: (cardId: Id) => post({ type: 'card.restoreArchived', cardId }),
  deletePermanent: (cardId: Id) => post({ type: 'card.deletePermanent', cardId }),
  setStatus: (cardId: Id, status: CardStatus | null, note?: string) =>
    post({ type: 'card.status.set', cardId, status, ...(note !== undefined ? { note } : {}) }),
  setYolo: (cardId: Id, enabled: boolean, until?: Id | null) => post({ type: 'card.yolo.set', cardId, enabled, until }),
  setYoloMany: (cardIds: Id[], enabled: boolean, until?: Id | null) => post({ type: 'card.yolo.setMany', cardIds, enabled, until }),
  archiveMany: (cardIds: Id[]) => post({ type: 'card.archiveMany', cardIds }),
  trashMany: (cardIds: Id[]) => post({ type: 'card.trashMany', cardIds }),
  moveMany: (cardIds: Id[], columnId: Id) => req({ type: 'card.moveMany', cardIds, columnId }),
  setExecProfile: (cardId: Id, profileId: Id | null) => post({ type: 'card.execProfile.set', cardId, profileId }),
  setField: (cardId: Id, fieldId: Id, value: FieldValue) => post({ type: 'field.setValue', cardId, fieldId, value }),
  setPr: (cardId: Id, url: string) => post({ type: 'card.pr.set', cardId, url }),
  prepareWorkspace: (cardId: Id) => req({ type: 'card.workspace.prepare', cardId }),
  openWorkspace: (cardId: Id) => post({ type: 'card.workspace.open', cardId }),
  clearWorkspace: (cardId: Id) => post({ type: 'card.workspace.clear', cardId }),
};

export const trash = {
  empty: () => req({ type: 'trash.empty' }),
};

export const comments = {
  add: (cardId: Id, body: string) => post({ type: 'comment.add', cardId, body }),
  update: (commentId: Id, body: string) => post({ type: 'comment.update', commentId, body }),
  delete: (commentId: Id) => post({ type: 'comment.delete', commentId }),
  deleteMany: (ids: Id[]) => ids.forEach((id) => comments.delete(id)),
};

export const checklist = {
  add: (cardId: Id, text: string) => post({ type: 'checklist.add', cardId, text }),
  update: (itemId: Id, patch: PatchOf<'checklist.update'>) => post({ type: 'checklist.update', itemId, patch }),
  delete: (itemId: Id) => post({ type: 'checklist.delete', itemId }),
};

export const links = {
  add: (fromId: Id, toId: Id, kind: LinkKind) => post({ type: 'link.add', fromId, toId, kind }),
  remove: (linkId: Id) => post({ type: 'link.remove', linkId }),
};

export const attachments = {
  pick: (cardId: Id) => post({ type: 'attachment.pick', cardId }),
  addData: (input: Payload<'attachment.addData'>) => req({ type: 'attachment.addData', ...input }),
  reveal: (attachmentId: Id) => post({ type: 'attachment.reveal', attachmentId }),
  delete: (attachmentId: Id) => post({ type: 'attachment.delete', attachmentId }),
  /** pede ao host para abrir o diálogo nativo de "salvar como" (só faz sentido fora da web) */
  saveAs: (attachmentId: Id) => post({ type: 'attachment.saveAs', attachmentId }),
};

export const settings = {
  updateBoard: (patch: BoardPatch) => req({ type: 'settings.board.update', patch }),
  resetBoard: () => req({ type: 'settings.board.reset' }),
  upgradeBoard: () => req({ type: 'settings.board.upgrade' }),
  createWorkflow: (name: string, kind: WorkflowKind) => post({ type: 'settings.workflow.create', name, kind }),
  updateWorkflow: (workflowId: Id, patch: PatchOf<'settings.workflow.update'>) =>
    post({ type: 'settings.workflow.update', workflowId, patch }),
  deleteWorkflow: (workflowId: Id) => post({ type: 'settings.workflow.delete', workflowId }),
  createColumn: (workflowId: Id, name: string, position?: number) =>
    post({ type: 'settings.column.create', workflowId, name, ...(position !== undefined ? { position } : {}) }),
  updateColumn: (columnId: Id, patch: ColumnPatch) => post({ type: 'settings.column.update', columnId, patch }),
  deleteColumn: (columnId: Id, moveCardsTo: Id) => post({ type: 'settings.column.delete', columnId, moveCardsTo }),
  createType: (name: string, color: string, defaultWorkflowId: Id) =>
    post({ type: 'settings.type.create', name, color, defaultWorkflowId }),
  updateType: (typeId: Id, patch: PatchOf<'settings.type.update'>) => post({ type: 'settings.type.update', typeId, patch }),
  deleteType: (typeId: Id) => post({ type: 'settings.type.delete', typeId }),
  createField: (input: FieldInput) => post({ type: 'settings.field.create', ...input }),
  updateField: (fieldId: Id, patch: PatchOf<'settings.field.update'>) => post({ type: 'settings.field.update', fieldId, patch }),
  deleteField: (fieldId: Id) => post({ type: 'settings.field.delete', fieldId }),
  updateRules: (patch: Partial<BoardRules>) => post({ type: 'settings.rules.update', patch }),
  setModels: (catalog: ModelOption[]) => post({ type: 'settings.models.set', catalog }),
  detectModels: (tool: AiTool) => req({ type: 'settings.models.detect', tool }),
  setModelRules: (rules: ModelRule[]) => post({ type: 'settings.modelRules.set', rules }),
  suggestModelRules: (tool: AiTool) => req({ type: 'settings.modelRules.suggest', tool }),
};

/** Branches e worktrees órfãs (#465): o host decide o que é seguro; a tela só pede e, nas de decisão, envia o que a pessoa viu. */
export const orphans = {
  scan: () => req({ type: 'git.orphans.scan' }),
  clean: (id: string, acceptLoss?: { dirtyFiles: number; uniqueCommits: number }) =>
    req({ type: 'git.orphans.clean', id, ...(acceptLoss ? { acceptLoss } : {}) }),
  cleanSafe: () => req({ type: 'git.orphans.cleanSafe' }),
};

export const backup = {
  export: () => post({ type: 'backup.export' }),
  importPick: () => post({ type: 'backup.import.pick' }),
  importApply: (token: string) => req({ type: 'backup.import.apply', token }),
  importCancel: (token: string) => post({ type: 'backup.import.cancel', token }),
};

export const harness = {
  refresh: () => req({ type: 'harness.refresh' }),
  openItem: (path: string) => post({ type: 'harness.item.open', path }),
  createItem: (tool: AiTool, source: number, name: string, description: string) =>
    post({ type: 'harness.item.create', tool, source, name, description }),
  /** cria o item já com o conteúdo (assistentes de regras e skills); `append` acrescenta a um arquivo fixo que já existe */
  writeItem: (tool: AiTool, source: number, name: string, content: string, files?: string[], append?: boolean) =>
    post({
      type: 'harness.item.write',
      tool,
      source,
      name,
      content,
      ...(files?.length ? { files } : {}),
      ...(append ? { append } : {}),
    }),
  deleteItem: (tool: AiTool, kind: HarnessKind, path: string) => post({ type: 'harness.item.delete', tool, kind, path }),
  applyPlugins: (tool: AiTool, action: PluginAction, ids: string[]) => req({ type: 'harness.plugin.apply', tool, action, ids }),
  copyItems: (tool: AiTool, items: { kind: HarnessKind; path: string }[], to: HarnessScope) =>
    req({ type: 'harness.item.copy', tool, items, to }),
  writeRule: (name: string, content: string) => post({ type: 'harness.rule.write', name, content }),
  deleteRule: (name: string) => post({ type: 'harness.rule.delete', name }),
  createSkill: (name: string, description: string, content: string) => post({ type: 'harness.skill.create', name, description, content }),
  writeSkill: (name: string, content: string) => post({ type: 'harness.skill.write', name, content }),
  setSkillEnabled: (name: string, enabled: boolean) => post({ type: 'harness.skill.setEnabled', name, enabled }),
  setSkillMode: (tool: AiTool, paths: string[], mode: SkillMode) => post({ type: 'harness.skill.setMode', tool, paths, mode }),
  deleteSkill: (name: string) => post({ type: 'harness.skill.delete', name }),
  createSkillFile: (tool: AiTool, path: string, file: string, link: boolean) =>
    post({ type: 'harness.skill.file.create', tool, path, file, link }),
  openSkillFile: (tool: AiTool, path: string, file: string) => post({ type: 'harness.skill.file.open', tool, path, file }),
  deleteSkillFile: (tool: AiTool, path: string, file: string) => post({ type: 'harness.skill.file.delete', tool, path, file }),
  /** envia artefatos ao board com um modo, muda o modo, ou os tira do board (usage null); `location` é a `selectionKey` */
  setSelection: (items: { kind: SelectableKind; location: string }[], usage: HarnessUsage | null) =>
    req({ type: 'harness.selection.set', items, usage }),
  /** a IA pré-seleciona os artefatos do assunto que fazem mais sentido para o projeto */
  suggest: (tool: AiTool, kind: SelectableKind) => post({ type: 'harness.suggest.run', tool, kind }),
  clearSuggestions: () => post({ type: 'harness.suggest.clear' }),
  /** abre o seletor de pasta do editor para importar artefatos */
  pickImport: (tool: AiTool) => req({ type: 'harness.import.pick', tool }),
  addImport: (tool: AiTool, dir: string) => req({ type: 'harness.import.add', tool, dir }),
  removeImport: (tool: AiTool, dir: string) => post({ type: 'harness.import.remove', tool, dir }),
  createAgent: (scope: InstallScope, input: AgentInput) => post({ type: 'harness.agent.create', scope, input }),
  updateAgent: (name: string, scope: InstallScope, patch: Partial<AgentInput>, body?: string) =>
    post({ type: 'harness.agent.update', name, scope, patch, ...(body !== undefined ? { body } : {}) }),
  writeAgent: (name: string, scope: InstallScope, content: string) => post({ type: 'harness.agent.write', name, scope, content }),
  deleteAgent: (name: string, scope: InstallScope) => post({ type: 'harness.agent.delete', name, scope }),
  seedAgents: (force = false) => req({ type: 'harness.agents.seed', force }),
  addMcp: (tool: AiTool, source: number, server: McpServerInput) => post({ type: 'harness.mcp.add', tool, source, server }),
  removeMcp: (tool: AiTool, path: string, name: string) => post({ type: 'harness.mcp.remove', tool, path, name }),
  addHook: (tool: AiTool, source: number, hook: HookInput) => post({ type: 'harness.hook.add', tool, source, hook }),
  removeHook: (tool: AiTool, path: string, event: string, command: string) =>
    post({ type: 'harness.hook.remove', tool, path, event, command }),
  addPermission: (tool: AiTool, source: number, list: string, rule: string) =>
    post({ type: 'harness.permission.add', tool, source, list, rule }),
  removePermission: (tool: AiTool, path: string, list: string, rule: string) =>
    post({ type: 'harness.permission.remove', tool, path, list, rule }),
  createReferenceSkill: () => post({ type: 'harness.referenceSkill.create' }),
  installFlowSkill: (tool: AiTool, scope: InstallScope, replace = false) =>
    req({ type: 'harness.flowSkill.install', tool, scope, replace }),
  scanInstall: (source: string) => req({ type: 'harness.install.scan', source }),
  applyInstall: (tool: AiTool, to: HarnessScope, rels: string[]) => req({ type: 'harness.install.apply', tool, to, rels }),
  cancelInstall: () => post({ type: 'harness.install.cancel' }),
};
