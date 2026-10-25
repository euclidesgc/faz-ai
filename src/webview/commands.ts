import type { WebviewToHost } from '../shared/messages';
import type { BranchRenamePending } from '../shared/branchRename';
import type { ConnectInput } from '../shared/connect';
import type { ContextLocation } from '../shared/contextScope';
import type { AiTool } from '../shared/harness';
import type { HarnessUsage, SelectableKind } from '../shared/harnessSelection';
import type { AgentInput } from '../shared/messages';
import type { ImportSource, OnConflict } from '../shared/artifactImport';
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
/** Sem confirmação: só para o que não grava nada no board (abrir, mostrar, revelar) ou já tem um estado próprio para esperar (chat, IA rodando). */
const post = (msg: WebviewToHost): void => postToHost(msg);
/**
 * Espera o `done` do host: é o padrão de toda ação que grava. A barra do topo (`SyncBar`) mostra a espera por
 * conta própria, e o botão ou a seção de onde a ação saiu usa a promessa com `useAction` para mostrar no lugar.
 */
const req = (msg: WebviewToHost): Promise<void> => request(msg);
export const executionPolicies = {
  save: (policy: import('../shared/executionPolicies').ExecutionPolicy, expectedRevision: number, reviewed: boolean) =>
    req({ type: 'settings.executionPolicy.save', policy, expectedRevision, reviewed }),
  remove: (id: string, expectedRevision: number) => req({ type: 'settings.executionPolicy.remove', id, expectedRevision }),
};
/**
 * Conectar agentes: a conta, o login e a sessão de teste. O `done` sai logo (o login pode levar o tempo da pessoa no
 * navegador ou no terminal); o progresso chega pela conta (`agentConnect.account`) e pelo estado da sessão.
 */
export const agentConnect = {
  check: (key: string) => req({ type: 'agentConnect.check', key }),
  login: (key: string, methodId: string, apiKey?: string) =>
    req({ type: 'agentConnect.login', key, methodId, ...(apiKey ? { apiKey } : {}) }),
  logout: (key: string) => req({ type: 'agentConnect.logout', key }),
  openTest: (key: string) => req({ type: 'agentConnect.test.open', key }),
  reopenTest: () => req({ type: 'agentConnect.test.reopen' }),
  prompt: (text: string) => req({ type: 'agentConnect.test.prompt', text }),
  answer: (permissionId: string, optionId: string | null) => post({ type: 'agentConnect.test.permission', permissionId, optionId }),
  setConfig: (configId: string, value: string | boolean) => req({ type: 'agentConnect.test.setConfig', configId, value }),
  setMode: (modeId: string) => req({ type: 'agentConnect.test.setMode', modeId }),
  cancel: () => post({ type: 'agentConnect.test.cancel' }),
  closeTest: () => req({ type: 'agentConnect.test.close' }),
  openLog: () => req({ type: 'agentConnect.openLog' }),
};
export const contextPlanning = {
  saveBatch: (inputs: import('../shared/contextPlanning').ActivityContextWrite[]) => req({ type: 'contextPlanning.saveBatch', inputs }),
  save: (input: import('../shared/contextPlanning').ContextPlanningWrite) => req({ type: 'contextPlanning.save', input }),
};
/** Como `req`, e o card fica marcado como ocupado (spinner no board e no card aberto) até a resposta. */
const reqCard = (cardId: Id, msg: WebviewToHost): Promise<void> => trackCard(cardId, request(msg));

/**
 * Tudo o que o front pede ao host, com nome de ação. Os componentes chamam `cards.trash(id)`
 * e não conhecem o formato das mensagens de `WebviewToHost`.
 */
export const ui = {
  showFilters: () => post({ type: 'ui.showFilters' }),
  /** instala o servidor MCP do board: padrão é a ferramenta do projeto, no escopo global */
  openInBrowser: () => post({ type: 'ui.openInBrowser' }),
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
  duplicate: (cardId: Id, title: string) => reqCard(cardId, { type: 'card.duplicate', cardId, title }),
  update: (cardId: Id, patch: PatchOf<'card.update'>) => reqCard(cardId, { type: 'card.update', cardId, patch }),
  move: (cardId: Id, columnId: Id, position: number, cancelChildren?: boolean) =>
    reqCard(cardId, { type: 'card.move', cardId, columnId, position, ...(cancelChildren ? { cancelChildren } : {}) }),
  /** envia as respostas das perguntas da IA (só as respondidas); o host grava na descrição e devolve a vez */
  answerQuestions: (cardId: Id, answers: { questionId: Id; text: string; custom: boolean }[]) =>
    reqCard(cardId, { type: 'card.questions.answer', cardId, answers }),
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
  restoreMany: (cardIds: Id[]) => req({ type: 'card.restoreMany', cardIds }),
  deletePermanentMany: (cardIds: Id[]) => req({ type: 'card.deletePermanentMany', cardIds }),
  unarchiveMany: (cardIds: Id[]) => req({ type: 'card.unarchiveMany', cardIds }),
  trashArchivedMany: (cardIds: Id[]) => req({ type: 'card.trashArchivedMany', cardIds }),
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
  saveAiProfile: (profile: import('../shared/aiProfiles').AiProfileDraft) => req({ type: 'settings.aiProfiles.save', profile }),
  setAiProfileEnabled: (id: string, enabled: boolean) => req({ type: 'settings.aiProfiles.setEnabled', id, enabled }),
  duplicateAiProfile: (id: string) => req({ type: 'settings.aiProfiles.duplicate', id }),
  removeAiProfile: (id: string) => req({ type: 'settings.aiProfiles.remove', id }),
  probeAiProfiles: () => request({ type: 'settings.aiProfiles.probe' }, { timeout: 70_000 }),
  testAiProfile: (id: string) => request({ type: 'settings.aiProfiles.test', id }, { timeout: 130_000 }),
  // três rodadas de até cinco minutos cada: a descoberta e as duas citações
  testContextScope: (id: string) => request({ type: 'settings.aiProfiles.contextScope', id }, { timeout: 16 * 60_000 }),
  contextLocation: (id: string, op: 'add' | 'remove', location: Pick<ContextLocation, 'path' | 'scope' | 'kind'>) =>
    request({ type: 'settings.aiProfiles.contextLocation', id, op, location }),
  /**
   * O Conectar de um perfil (história 7): o `done` sai quando o fluxo para (conectada, à espera da chave ou da
   * ciência, ou com o erro no passo). Os handshakes e a leitura de modelos podem levar alguns minutos.
   */
  /** Dá ou revoga a ciência do regime compatível de um perfil (o caminho de quem não passa pelo Conectar, e a revogação). */
  reviewAiProfile: (id: string, accept: boolean) => req({ type: 'settings.aiProfiles.review', id, accept }),
  connectAiProfile: (id: string, input: ConnectInput = {}) =>
    request({ type: 'settings.aiProfiles.connect', id, ...input }, { timeout: 600_000 }),
  /** As sondas de capacidade do perfil sem Conectar (a cópia do Claude, o personalizado ACP); a do Claude leva minutos. */
  verifyAiProfile: (id: string) => request({ type: 'settings.aiProfiles.verify', id }, { timeout: 600_000 }),
  updateBoard: (patch: BoardPatch) => req({ type: 'settings.board.update', patch }),
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
  /** Salva regra, skill ou MCP no banco do board (editores e assistentes). */
  saveArtifact: (input: Payload<'harness.artifact.save'>) => req({ type: 'harness.artifact.save', ...input }),
  /** Grava (cria ou edita) um arquivo de apoio de uma skill do board. */
  writeBoardSkillFile: (skill: string, file: string, content: string, link?: boolean) =>
    req({ type: 'harness.skillFile.write', skill, file, content, ...(link ? { link } : {}) }),
  /** Apaga um arquivo de apoio de uma skill do board. */
  deleteBoardSkillFile: (skill: string, file: string) => req({ type: 'harness.skillFile.delete', skill, file }),
  /** envia artefatos ao board com um modo, muda o modo, ou os tira do board (usage null); `location` é a `selectionKey` */
  setSelection: (items: { kind: SelectableKind; location: string }[], usage: HarnessUsage | null) =>
    req({ type: 'harness.selection.set', items, usage }),
  /** Abre o seletor de pasta ou de arquivo de exportação para importar artefatos ao board. */
  importPick: (what: 'folder' | 'export') => req({ type: 'harness.import.pick', what }),
  /** Examina a origem e devolve a prévia em `state.artifactImport`. */
  importScan: (source: ImportSource) => req({ type: 'harness.import.scan', source }),
  importApply: (keys: string[], onConflict: OnConflict) => req({ type: 'harness.import.apply', keys, onConflict }),
  importCancel: () => post({ type: 'harness.import.cancel' }),
  createAgent: (input: AgentInput) => req({ type: 'harness.agent.create', input }),
  updateAgent: (name: string, patch: Partial<AgentInput>, body?: string) =>
    req({ type: 'harness.agent.update', name, patch, ...(body !== undefined ? { body } : {}) }),
  deleteAgent: (name: string) => req({ type: 'harness.agent.delete', name }),
  seedAgents: (force = false) => req({ type: 'harness.agents.seed', force }),
};
