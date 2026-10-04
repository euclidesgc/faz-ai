import { EMPTY_CHAT } from '../../src/shared/chat';
import type { BoardState, Card, Column, ColumnCategory } from '../../src/shared/model';
import { DEFAULT_APPEARANCE } from '../../src/shared/appearance';
import { DEFAULT_GIT } from '../../src/shared/git';
import { EMPTY_HARNESS } from '../../src/shared/harness';
import { DEFAULT_RULES } from '../../src/shared/rules';
import { DEFAULT_RUNNER } from '../../src/shared/runner';

// Board em memória para testar as regras puras de src/shared, sem banco.

export const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  number: 0,
  boardId: 'b',
  workflowId: 'wp',
  columnId: 'backlog',
  typeId: 'story',
  parentId: null,
  title: id,
  description: '',
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  archivedAt: null,
  status: null,
  statusReason: '',
  statusAt: null,
  statusBy: '',
  branch: '',
  worktreePath: '',
  baseBranch: '',
  prUrl: '',
  mergeCommit: '',
  execProfile: null,
  yolo: false,
  ...over,
});

export const column = (id: string, workflowId: string, position: number, category: ColumnCategory = 'open'): Column => ({
  id,
  workflowId,
  name: id,
  position,
  category,
  isTerminal: category !== 'open',
  collapsed: false,
  aiActive: false,
  requiresApproval: false,
  aiInstruction: '',
  artifactName: '',
  artifactTemplate: '',
  execProfile: null,
});

/**
 * Histórias (wp): backlog → doing → done, e cancelled. Sub-tarefas (wc): todo → finished, e dropped.
 * As colunas vêm fora de ordem de propósito, para conferir a ordenação.
 */
export function boardState(over: Partial<BoardState> = {}): BoardState {
  return {
    board: {
      id: 'b',
      workspaceKey: 'k',
      name: 'B',
      rules: DEFAULT_RULES,
      aiTool: 'claude',
      modelCatalog: [],
      modelRules: [],
      appearance: DEFAULT_APPEARANCE,
      templateVersion: 1,
      runner: DEFAULT_RUNNER,
      git: DEFAULT_GIT,
      execProfiles: [],
    },
    workflows: [
      { id: 'wp', boardId: 'b', name: 'Histórias', position: 0, kind: 'parent', collapsed: false, archiveCollapsed: true },
      { id: 'wc', boardId: 'b', name: 'Sub-tarefas', position: 1, kind: 'child', collapsed: false, archiveCollapsed: true },
    ],
    columns: [
      column('done', 'wp', 2, 'done'),
      column('backlog', 'wp', 0),
      column('cancelled', 'wp', 3, 'cancelled'),
      column('doing', 'wp', 1),
      column('todo', 'wc', 0),
      column('finished', 'wc', 1, 'done'),
      column('dropped', 'wc', 2, 'cancelled'),
    ],
    cardTypes: [],
    cards: [],
    fieldDefs: [],
    fieldValues: [],
    checklistItems: [],
    links: [],
    comments: [],
    attachments: [],
    currentUser: 'a',
    harness: EMPTY_HARNESS,
    pendingUpgrade: [],
    chat: EMPTY_CHAT,
    aiRuns: [],
    autopilot: { active: false, note: null },
    aiRunUnsupported: null,
    harnessInstall: null,
    ...over,
  };
}

/** Sub-tarefa da história `parentId`. */
export const sub = (id: string, parentId: string, columnId: string, over: Partial<Card> = {}): Card =>
  card(id, { workflowId: 'wc', typeId: 'sub', parentId, columnId, ...over });
