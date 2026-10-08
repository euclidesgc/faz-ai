import { describe, expect, it } from 'vitest';
import { EMPTY_CHAT } from '../src/shared/chat';
import { DEFAULT_RUNNER } from '../src/shared/runner';
import { DEFAULT_GIT } from '../src/shared/git';
import type { BoardState, Card } from '../src/shared/model';
import { DEFAULT_APPEARANCE } from '../src/shared/appearance';
import { EMPTY_HARNESS } from '../src/shared/harness';
import { DEFAULT_RULES } from '../src/shared/rules';
import {
  effortLabel,
  modelDisplay,
  modelLabel,
  parseModelRules,
  suggestModel,
  suggestModelRule,
  type ModelOption,
  type ModelRule,
} from '../src/shared/models';

const catalog: ModelOption[] = [
  { id: 'claude:sonnet', tool: 'claude', model: 'sonnet', label: 'Sonnet 5.5', efforts: ['low', 'high'], defaultEffort: 'high' },
];

describe('rótulo do modelo', () => {
  it('na interface o esforço vem em português depois do modelo', () => {
    expect(modelDisplay(catalog, 'claude:sonnet@low')).toBe('Sonnet 5.5 - baixo');
    expect(modelDisplay(catalog, 'claude:sonnet@xhigh', true)).toBe('Claude Code · Sonnet 5.5 - muito alto');
    expect(modelDisplay(catalog, 'claude:sonnet')).toBe('Sonnet 5.5');
    expect(modelDisplay(catalog, null)).toBe('');
  });

  it('para a IA e o MCP o texto continua com o esforço como a ferramenta escreve', () => {
    expect(modelLabel(catalog, 'claude:sonnet@low')).toBe('Sonnet 5.5 · low');
  });

  it('esforço desconhecido aparece como veio', () => {
    expect(effortLabel('HIGH')).toBe('alto');
    expect(effortLabel('turbo')).toBe('turbo');
  });
});

describe('parseModelRules', () => {
  it('lê o campo fallback quando é string', () => {
    const rules = parseModelRules(
      JSON.stringify([{ id: 'a', name: 'r', enabled: true, groups: [], model: 'claude:sonnet@low', fallback: 'claude:haiku' }]),
    );
    expect(rules).toEqual([{ id: 'a', name: 'r', enabled: true, groups: [], model: 'claude:sonnet@low', fallback: 'claude:haiku' }]);
  });

  it('sem fallback (ausente ou não-string) vira null', () => {
    const rules = parseModelRules(
      JSON.stringify([
        { id: 'a', name: 'r1', enabled: true, groups: [], model: 'claude:sonnet@low' },
        { id: 'b', name: 'r2', enabled: true, groups: [], model: 'claude:sonnet@low', fallback: 42 },
        { id: 'c', name: 'r3', enabled: true, groups: [], model: 'claude:sonnet@low', fallback: null },
      ]),
    );
    expect(rules.map((r) => r.fallback)).toEqual([null, null, null]);
  });
});

describe('suggestModelRule e suggestModel', () => {
  const card = (over: Partial<Card> = {}): Card => ({
    id: 'c1',
    number: 1,
    boardId: 'b',
    workflowId: 'wp',
    columnId: 'todo',
    typeId: 'story',
    parentId: null,
    title: 'x',
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
    branchCreatedAt: '',
    worktreePath: '',
    baseBranch: '',
    prUrl: '',
    mergeCommit: '',
    execProfile: null,
    yolo: false,
    ...over,
  });

  const stateWith = (modelRules: ModelRule[]): BoardState => ({
    board: {
      id: 'b',
      workspaceKey: 'k',
      name: 'B',
      rules: DEFAULT_RULES,
      aiTool: 'claude',
      modelCatalog: [],
      modelRules,
      appearance: DEFAULT_APPEARANCE,
      templateVersion: 1,
      runner: DEFAULT_RUNNER,
      git: DEFAULT_GIT,
      execProfiles: [],
    },
    workflows: [],
    columns: [],
    cardTypes: [{ id: 'bug', boardId: 'b', name: 'Bug', color: '#000', defaultWorkflowId: 'wp', defaults: {} }],
    cards: [],
    fieldDefs: [
      {
        id: 'esforco',
        boardId: 'b',
        name: 'Esforço',
        kind: 'select',
        options: ['Alto', 'Baixo'],
        appliesToTypes: null,
        display: 'badge',
        position: 0,
      },
    ],
    fieldValues: [{ cardId: 'c1', fieldId: 'esforco', value: 'Alto' }],
    checklistItems: [],
    links: [],
    comments: [],
    attachments: [],
    currentUser: 'a',
    harness: EMPTY_HARNESS,
    harnessSelection: [],
    pendingUpgrade: [],
    chat: EMPTY_CHAT,
    aiRuns: [],
    aiActivity: [],
    heartbeatNextAt: null,
    autopilot: { active: false, note: null },
    aiRunUnsupported: null,
    requirements: [],
    requirementsCheckedAt: 0,
    environment: null,
    environmentFirstRun: false,
    environmentInstall: null,
    environmentInstallResult: null,
    harnessInstall: null,
  });

  const rule = (over: Partial<ModelRule> = {}): ModelRule => ({
    id: 'r1',
    name: 'Alto',
    enabled: true,
    groups: [[{ fieldId: 'esforco', op: 'is', value: 'Alto' }]],
    model: 'claude:sonnet@high',
    fallback: null,
    ...over,
  });

  it('suggestModelRule devolve a primeira regra habilitada cujas condições casam', () => {
    const state = stateWith([
      { ...rule({ id: 'r0', enabled: false }) },
      rule({ id: 'r1', fallback: 'claude:haiku' }),
      rule({ id: 'r2', model: 'claude:fable@max' }),
    ]);
    expect(suggestModelRule(state, card())).toMatchObject({ id: 'r1', model: 'claude:sonnet@high', fallback: 'claude:haiku' });
  });

  it('sem regra casando, devolve null', () => {
    const state = stateWith([rule({ groups: [[{ fieldId: 'esforco', op: 'is', value: 'Baixo' }]] })]);
    expect(suggestModelRule(state, card())).toBeNull();
  });

  it('suggestModel continua devolvendo só o modelo, igual a antes, para regras sem fallback', () => {
    const state = stateWith([rule()]);
    expect(suggestModel(state, card())).toBe('claude:sonnet@high');
  });
});
