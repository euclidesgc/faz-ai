import type { WebviewToHost } from '../shared/messages';
import type { BranchRenamePending } from '../shared/branchRename';
import type { AiTool, HarnessKind, InstallScope, PluginAction, SkillMode } from '../shared/harness';
import type { HarnessUsage, SelectableKind } from '../shared/harnessSelection';
import type { AgentInput } from '../shared/messages';
import type { HookInput, McpServerInput } from '../shared/harnessCatalog';
import type { BulkCardStatus, CardStatus } from '../shared/status';
import type { ModelOption, ModelRule } from '../shared/models';
import type { BoardRules } from '../shared/rules';
import type { FieldValue, Id, LinkKind, WorkflowKind } from '../shared/model';
import { postToHost } from './vscode';
import { request } from './request';
import { trackCard } from './store/busyCards';

/** Patch de cada mensagem `*.update`, tirado do protocolo para não repetir a forma aqui. */
type PatchOf<T extends WebviewToHost['type']> = Extract<WebviewToHost, { type: T }> extends { patch: infer P } ? P : never;
type Payload<T extends WebviewToHost['type']> = Omit<Extract<WebviewToHost, { type: T }>, 'type'>;

export type BoardPatch = PatchOf<'settings.board.update'>;
export type ColumnPatch = PatchOf<'settings.column.update'>;
export type FieldInput = Payload<'settings.field.create'>;
/** Para onde copiar ou instalar itens do harness. */
export type HarnessScope = 'project' | 'user';

/** Sem confirmação: só para o que não grava nada no board (abrir, mostrar, revelar) ou já tem um estado próprio para esperar (chat, IA rodando). */
const post = (msg: WebviewToHost): void => postToHost(msg);
/**
 * Espera o `done` do host: é o padrão de toda ação que grava. A barra do topo (`SyncBar`) mostra a espera por
 * conta própria, e o botão ou a seção de onde a ação saiu usa a promessa com `useAction` para mostrar no lugar.
 */
const req = (msg: WebviewToHost): Promise<void> => request(msg);
/** Como `req`, e o card fica marcado como ocupado (spinner no board e no card aberto) até a resposta. */
const reqCard = (cardId: Id, msg: WebviewToHost): Promise<void> => trackCard(cardId, request(msg));

/**
 * Tudo o que o front pede ao host, com nome de ação. Os componentes chamam `cards.trash(id)`
 * e não conhecem o formato das mensagens de `WebviewToHost`.
 */
export const ui = {
  showFilters: () => post({ type: 'ui.showFilters' }),
  /** instala o servidor MCP do board: padrão é a ferramenta do projeto, no escopo global */
  connectAI: (tool?: AiTool) => req({ type: 'ui.connectAI', tool }),
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
  allowKimiMcp: () => post({ type: 'environment.allowKimiMcp' }),
};

export const chat = {
  send: (text: string, model: string | null) => post({ type: 'chat.send', text, model }),
  stop: () => post({ type: 'chat.stop' }),
  clear: () => post({ type: 'chat.clear' }),
};

export const ai = {
  run: (cardId: Id) => reqCard(cardId, { type: 'ai.run', cardId }),
  refine: (cardId: Id) => reqCard(cardId, { type: 'ai.run', cardId, mode: 'refine' }),
  summarize: (cardId: Id) => reqCard(cardId, { type: 'ai.run', cardId, mode: 'summarize' }),
  stop: (cardId: Id) => reqCard(cardId, { type: 'ai.stop', cardId }),
  runHeartbeat: () => req({ type: 'ai.heartbeat.run' }),
  /** a IA lê o projeto e propõe os agentes do board; o resultado vai para o chat do board */
  suggestAgents: () => post({ type: 'ai.suggestAgents' }),
  /** a IA lê o projeto e propõe regras, gravadas e enviadas ao board desligadas */
  suggestRules: () => post({ type: 'ai.suggestRules' }),
  /** a IA lê o projeto e propõe skills, gravadas e enviadas ao board em "Pelo card" */
  suggestSkills: () => post({ type: 'ai.suggestSkills' }),
  pauseAutopilot: () => req({ type: 'ai.autopilot.pause' }),
  resumeAutopilot: () => req({ type: 'ai.autopilot.resume' }),
};

export const cards = {
  create: (input: Payload<'card.create'>) => req({ type: 'card.create', ...input }),
  update: (cardId: Id, patch: PatchOf<'card.update'>) => reqCard(cardId, { type: 'card.update', cardId, patch }),
  move: (cardId: Id, columnId: Id, position: number, cancelChildren?: boolean) =>
    reqCard(cardId, { type: 'card.move', cardId, columnId, position, ...(cancelChildren ? { cancelChildren } : {}) }),
  trash: (cardId: Id) => reqCard(cardId, { type: 'card.trash', cardId }),
  restore: (cardId: Id) => reqCard(cardId, { type: 'card.restore', cardId }),
  archive: (cardId: Id) => reqCard(cardId, { type: 'card.archive', cardId }),
  unarchive: (cardId: Id, to?: { columnId: Id; position: number }) => reqCard(cardId, { type: 'card.unarchive', cardId, ...to }),
  restoreArchived: (cardId: Id) => reqCard(cardId, { type: 'card.restoreArchived', cardId }),
  deletePermanent: (cardId: Id) => reqCard(cardId, { type: 'card.deletePermanent', cardId }),
  setStatus: (cardId: Id, status: CardStatus | null, note?: string) =>
    reqCard(cardId, { type: 'card.status.set', cardId, status, ...(note !== undefined ? { note } : {}) }),
  setStatusMany: (cardIds: Id[], status: BulkCardStatus, note?: string) =>
    req({ type: 'card.status.setMany', cardIds, status, ...(note !== undefined ? { note } : {}) }),
  setYolo: (cardId: Id, enabled: boolean, until?: Id | null) => reqCard(cardId, { type: 'card.yolo.set', cardId, enabled, until }),
  setYoloMany: (cardIds: Id[], enabled: boolean, until?: Id | null) => req({ type: 'card.yolo.setMany', cardIds, enabled, until }),
  archiveMany: (cardIds: Id[]) => req({ type: 'card.archiveMany', cardIds }),
  trashMany: (cardIds: Id[]) => req({ type: 'card.trashMany', cardIds }),
  moveMany: (cardIds: Id[], columnId: Id) => req({ type: 'card.moveMany', cardIds, columnId }),
  setExecProfile: (cardId: Id, profileId: Id | null) => reqCard(cardId, { type: 'card.execProfile.set', cardId, profileId }),
  setField: (cardId: Id, fieldId: Id, value: FieldValue) => reqCard(cardId, { type: 'field.setValue', cardId, fieldId, value }),
  setPr: (cardId: Id, url: string) => reqCard(cardId, { type: 'card.pr.set', cardId, url }),
  prepareWorkspace: (cardId: Id) => reqCard(cardId, { type: 'card.workspace.prepare', cardId }),
  openWorkspace: (cardId: Id) => post({ type: 'card.workspace.open', cardId }),
  clearWorkspace: (cardId: Id) => reqCard(cardId, { type: 'card.workspace.clear', cardId }),
};

export const trash = {
  empty: () => req({ type: 'trash.empty' }),
};

export const comments = {
  add: (cardId: Id, body: string) => reqCard(cardId, { type: 'comment.add', cardId, body }),
  update: (commentId: Id, body: string) => req({ type: 'comment.update', commentId, body }),
  delete: (commentId: Id) => req({ type: 'comment.delete', commentId }),
  deleteMany: (ids: Id[]) => Promise.all(ids.map((id) => comments.delete(id))).then(() => undefined),
};

export const checklist = {
  add: (cardId: Id, text: string) => reqCard(cardId, { type: 'checklist.add', cardId, text }),
  update: (itemId: Id, patch: PatchOf<'checklist.update'>) => req({ type: 'checklist.update', itemId, patch }),
  delete: (itemId: Id) => req({ type: 'checklist.delete', itemId }),
};

export const links = {
  add: (fromId: Id, toId: Id, kind: LinkKind) => req({ type: 'link.add', fromId, toId, kind }),
  remove: (linkId: Id) => req({ type: 'link.remove', linkId }),
};

export const attachments = {
  pick: (cardId: Id) => post({ type: 'attachment.pick', cardId }),
  addData: (input: Payload<'attachment.addData'>) => req({ type: 'attachment.addData', ...input }),
  reveal: (attachmentId: Id) => post({ type: 'attachment.reveal', attachmentId }),
  delete: (attachmentId: Id) => req({ type: 'attachment.delete', attachmentId }),
  /** pede ao host para abrir o diálogo nativo de "salvar como" (só faz sentido fora da web) */
  saveAs: (attachmentId: Id) => post({ type: 'attachment.saveAs', attachmentId }),
};

/** Renomear a principal ou a develop também no origin (#466): as três respostas do aviso. Renomear chama o git e o gh, então espera mais. */
export const gitRename = {
  resolve: (p: Pick<BranchRenamePending, 'kind' | 'from' | 'to'>, action: 'confirm' | 'undo' | 'dismiss') =>
    request({ type: 'git.rename.resolve', kind: p.kind, from: p.from, to: p.to, action }, { timeout: 120_000 }),
};

export const settings = {
  updateBoard: (patch: BoardPatch) => req({ type: 'settings.board.update', patch }),
  resetBoard: () => req({ type: 'settings.board.reset' }),
  upgradeBoard: () => req({ type: 'settings.board.upgrade' }),
  createWorkflow: (name: string, kind: WorkflowKind) => req({ type: 'settings.workflow.create', name, kind }),
  updateWorkflow: (workflowId: Id, patch: PatchOf<'settings.workflow.update'>) =>
    req({ type: 'settings.workflow.update', workflowId, patch }),
  deleteWorkflow: (workflowId: Id) => req({ type: 'settings.workflow.delete', workflowId }),
  createColumn: (workflowId: Id, name: string, position?: number) =>
    req({ type: 'settings.column.create', workflowId, name, ...(position !== undefined ? { position } : {}) }),
  updateColumn: (columnId: Id, patch: ColumnPatch) => req({ type: 'settings.column.update', columnId, patch }),
  deleteColumn: (columnId: Id, moveCardsTo: Id) => req({ type: 'settings.column.delete', columnId, moveCardsTo }),
  createType: (name: string, color: string, defaultWorkflowId: Id) => req({ type: 'settings.type.create', name, color, defaultWorkflowId }),
  updateType: (typeId: Id, patch: PatchOf<'settings.type.update'>) => req({ type: 'settings.type.update', typeId, patch }),
  deleteType: (typeId: Id) => req({ type: 'settings.type.delete', typeId }),
  createField: (input: FieldInput) => req({ type: 'settings.field.create', ...input }),
  updateField: (fieldId: Id, patch: PatchOf<'settings.field.update'>) => req({ type: 'settings.field.update', fieldId, patch }),
  deleteField: (fieldId: Id) => req({ type: 'settings.field.delete', fieldId }),
  updateRules: (patch: Partial<BoardRules>) => req({ type: 'settings.rules.update', patch }),
  setModels: (catalog: ModelOption[]) => req({ type: 'settings.models.set', catalog }),
  detectModels: (tool: AiTool) => req({ type: 'settings.models.detect', tool }),
  setModelRules: (rules: ModelRule[]) => req({ type: 'settings.modelRules.set', rules }),
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
    req({ type: 'harness.item.create', tool, source, name, description }),
  /** cria o item já com o conteúdo (assistentes de regras e skills); `append` acrescenta a um arquivo fixo que já existe */
  writeItem: (tool: AiTool, source: number, name: string, content: string, files?: string[], append?: boolean) =>
    req({
      type: 'harness.item.write',
      tool,
      source,
      name,
      content,
      ...(files?.length ? { files } : {}),
      ...(append ? { append } : {}),
    }),
  deleteItem: (tool: AiTool, kind: HarnessKind, path: string) => req({ type: 'harness.item.delete', tool, kind, path }),
  applyPlugins: (tool: AiTool, action: PluginAction, ids: string[]) => req({ type: 'harness.plugin.apply', tool, action, ids }),
  copyItems: (tool: AiTool, items: { kind: HarnessKind; path: string }[], to: HarnessScope) =>
    req({ type: 'harness.item.copy', tool, items, to }),
  writeRule: (name: string, content: string) => req({ type: 'harness.rule.write', name, content }),
  deleteRule: (name: string) => req({ type: 'harness.rule.delete', name }),
  createSkill: (name: string, description: string, content: string) => req({ type: 'harness.skill.create', name, description, content }),
  writeSkill: (name: string, content: string) => req({ type: 'harness.skill.write', name, content }),
  setSkillEnabled: (name: string, enabled: boolean) => req({ type: 'harness.skill.setEnabled', name, enabled }),
  setSkillMode: (tool: AiTool, paths: string[], mode: SkillMode) => req({ type: 'harness.skill.setMode', tool, paths, mode }),
  deleteSkill: (name: string) => req({ type: 'harness.skill.delete', name }),
  createSkillFile: (tool: AiTool, path: string, file: string, link: boolean) =>
    req({ type: 'harness.skill.file.create', tool, path, file, link }),
  openSkillFile: (tool: AiTool, path: string, file: string) => post({ type: 'harness.skill.file.open', tool, path, file }),
  deleteSkillFile: (tool: AiTool, path: string, file: string) => req({ type: 'harness.skill.file.delete', tool, path, file }),
  /** envia artefatos ao board com um modo, muda o modo, ou os tira do board (usage null); `location` é a `selectionKey` */
  setSelection: (items: { kind: SelectableKind; location: string }[], usage: HarnessUsage | null) =>
    req({ type: 'harness.selection.set', items, usage }),
  /** a IA pré-seleciona os artefatos do assunto que fazem mais sentido para o projeto */
  suggest: (tool: AiTool, kind: SelectableKind) => post({ type: 'harness.suggest.run', tool, kind }),
  clearSuggestions: () => req({ type: 'harness.suggest.clear' }),
  /** abre o seletor de pasta do editor para importar artefatos */
  setLibraryDirectory: (dir: string) => req({ type: 'harness.library.directory', dir }),
  updateLibraryArtifact: (id: string) => req({ type: 'harness.library.update', id }),
  importLibrarySkills: (rels: string[]) => req({ type: 'harness.library.import', rels }),
  pickLibrarySource: () => req({ type: 'harness.library.pick' }),
  openLibrary: () => req({ type: 'harness.library.open' }),
  pickImport: (tool: AiTool) => req({ type: 'harness.import.pick', tool }),
  addImport: (tool: AiTool, dir: string) => req({ type: 'harness.import.add', tool, dir }),
  removeImport: (tool: AiTool, dir: string) => req({ type: 'harness.import.remove', tool, dir }),
  createAgent: (scope: InstallScope, input: AgentInput) => req({ type: 'harness.agent.create', scope, input }),
  updateAgent: (name: string, scope: InstallScope, patch: Partial<AgentInput>, body?: string) =>
    req({ type: 'harness.agent.update', name, scope, patch, ...(body !== undefined ? { body } : {}) }),
  writeAgent: (name: string, scope: InstallScope, content: string) => req({ type: 'harness.agent.write', name, scope, content }),
  deleteAgent: (name: string, scope: InstallScope) => req({ type: 'harness.agent.delete', name, scope }),
  seedAgents: (force = false) => req({ type: 'harness.agents.seed', force }),
  addMcp: (tool: AiTool, source: number, server: McpServerInput) => req({ type: 'harness.mcp.add', tool, source, server }),
  removeMcp: (tool: AiTool, path: string, name: string) => req({ type: 'harness.mcp.remove', tool, path, name }),
  addHook: (tool: AiTool, source: number, hook: HookInput) => req({ type: 'harness.hook.add', tool, source, hook }),
  removeHook: (tool: AiTool, path: string, event: string, command: string) =>
    req({ type: 'harness.hook.remove', tool, path, event, command }),
  addPermission: (tool: AiTool, source: number, list: string, rule: string) =>
    req({ type: 'harness.permission.add', tool, source, list, rule }),
  removePermission: (tool: AiTool, path: string, list: string, rule: string) =>
    req({ type: 'harness.permission.remove', tool, path, list, rule }),
  createReferenceSkill: () => req({ type: 'harness.referenceSkill.create' }),
  installFlowSkill: (tool: AiTool, replace = false) => req({ type: 'harness.flowSkill.install', tool, replace }),
  scanInstall: (source: string) => req({ type: 'harness.install.scan', source }),
  applyInstall: (tool: AiTool, to: HarnessScope, rels: string[]) => req({ type: 'harness.install.apply', tool, to, rels }),
  cancelInstall: () => req({ type: 'harness.install.cancel' }),
};
