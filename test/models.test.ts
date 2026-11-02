import { describe, expect, it } from 'vitest';
import { EMPTY_CHAT } from '../src/shared/chat';
import { DEFAULT_RUNNER } from '../src/shared/runner';
import { DEFAULT_GIT } from '../src/shared/git';
import type { BoardState, Card } from '../src/shared/model';
import { DEFAULT_APPEARANCE } from '../src/shared/appearance';
import { EMPTY_HARNESS } from '../src/shared/harness';
import { DEFAULT_RULES } from '../src/shared/rules';
import {
  MODEL_FAILURE_WINDOW,
  deriveModelFailures,
  describeModelFailure,
  effortLabel,
  modelDisplay,
  modelFailureOf,
  modelLabel,
  isHandPicked,
  parseModelRules,
  suggestModel,
  suggestModelRule,
  type ModelFailure,
  type ModelOption,
  type ModelRule,
  type ModelRunOutcome,
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
  it('ignora o campo fallback do JSON antigo: a regra volta sem a propriedade', () => {
    const rules = parseModelRules(
      JSON.stringify([
        { id: 'a', name: 'r1', enabled: true, groups: [], model: 'claude:sonnet@low', fallback: 'claude:haiku' },
        { id: 'b', name: 'r2', enabled: true, groups: [], model: 'claude:sonnet@low' },
      ]),
    );
    expect(rules).toEqual([
      { id: 'a', name: 'r1', enabled: true, groups: [], model: 'claude:sonnet@low' },
      { id: 'b', name: 'r2', enabled: true, groups: [], model: 'claude:sonnet@low' },
    ]);
    expect(rules.some((r) => 'fallback' in r)).toBe(false);
  });
});

describe('suggestModelRule e suggestModel', () => {
  const card = (over: Partial<Card> = {}): Card => ({
    id: 'c1',
    questions: [],
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
    yoloUntil: null,
    derivedFrom: null,
    refinedAt: null,
    ...over,
  });

  const stateWith = (modelRules: ModelRule[], modelFailures?: Record<string, ModelFailure>): BoardState => ({
    budget: { config: { enabled: false, byEffort: { Baixo: 1, Médio: 1, Alto: 1 }, warnAt: 80, policy: 'finish' }, cards: {} },
    board: {
      id: 'b',
      workspaceKey: 'k',
      name: 'B',
      rules: DEFAULT_RULES,
      aiTool: 'claude',
      aiProfiles: [],
      modelCatalog: [],
      modelRules,
      ...(modelFailures ? { modelFailures } : {}),
      modelLadders: {},
      appearance: DEFAULT_APPEARANCE,
      templateVersion: 1,
      runner: DEFAULT_RUNNER,
      git: DEFAULT_GIT,
      execProfiles: [],
    },
    workflows: [],
    columns: [],
    cardTypes: [{ id: 'bug', boardId: 'b', name: 'Bug', color: '#000', defaultWorkflowId: 'wp', defaults: {}, branchKind: 'hotfix' }],
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
    boardServer: null,
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
    artifactImport: null,
    authExpired: [],
    usageLimit: [],
    usageReadings: [],
    orphans: { items: [], failed: {}, scannedAt: null },
    mainBranch: null,
    branchRenames: [],
    branchRenameResult: null,
  });

  const rule = (over: Partial<ModelRule> = {}): ModelRule => ({
    id: 'r1',
    name: 'Alto',
    enabled: true,
    groups: [[{ fieldId: 'esforco', op: 'is', value: 'Alto' }]],
    model: 'claude:sonnet@high',
    ...over,
  });

  it('suggestModelRule devolve a primeira regra habilitada cujas condições casam', () => {
    const state = stateWith([{ ...rule({ id: 'r0', enabled: false }) }, rule({ id: 'r1' }), rule({ id: 'r2', model: 'claude:fable@max' })]);
    expect(suggestModelRule(state, card())).toMatchObject({ id: 'r1', model: 'claude:sonnet@high' });
  });

  it('sem regra casando, devolve null', () => {
    const state = stateWith([rule({ groups: [[{ fieldId: 'esforco', op: 'is', value: 'Baixo' }]] })]);
    expect(suggestModelRule(state, card())).toBeNull();
  });

  it('suggestModel continua devolvendo só o modelo, igual a antes', () => {
    const state = stateWith([rule()]);
    expect(suggestModel(state, card())).toBe('claude:sonnet@high');
  });

  const failing: ModelFailure = { at: Date.UTC(2026, 9, 20), outcome: 'failed', failureClass: 'deterministic', exitCode: 1, runs: 3 };

  it('a regra cujo modelo não tem execução bem-sucedida é pulada: vale a próxima que casa', () => {
    const state = stateWith([rule({ id: 'r1' }), rule({ id: 'r2', model: 'claude:fable@max' })], { 'claude:sonnet': failing });
    expect(suggestModelRule(state, card())).toMatchObject({ id: 'r2', model: 'claude:fable@max' });
  });

  it('sem outra regra que case, não há sugestão (o alvo cai no padrão do board)', () => {
    const state = stateWith([rule()], { 'claude:sonnet': failing });
    expect(suggestModelRule(state, card())).toBeNull();
    expect(suggestModel(state, card())).toBeNull();
  });

  it('um estado sem o log (modelFailures ausente) sugere como antes', () => {
    expect(suggestModel(stateWith([rule()]), card())).toBe('claude:sonnet@high');
  });

  describe('modelo da fase na coluna (#1411)', () => {
    const col = (over: Record<string, unknown> = {}) =>
      ({
        id: 'todo',
        workflowId: 'wp',
        name: 'Implementação',
        category: 'open',
        isTerminal: false,
        phaseModel: 'claude:haiku',
        ...over,
      }) as never;
    const withColumn = (columns: unknown[], modelRules = [rule()]): BoardState => ({
      ...stateWith(modelRules),
      columns: columns as never,
    });

    it('o modelo da coluna vem antes da regra', () => {
      expect(suggestModel(withColumn([col()]), card())).toBe('claude:haiku');
    });

    it('coluna sem modelo cai na regra', () => {
      expect(suggestModel(withColumn([col({ phaseModel: null })]), card())).toBe('claude:sonnet@high');
    });

    it('coluna terminal com valor é ignorada', () => {
      expect(suggestModel(withColumn([col({ category: 'done', isTerminal: true })]), card())).toBe('claude:sonnet@high');
    });

    it('isHandPicked com previous igual ao modelo da coluna anterior é automático', () => {
      const base = withColumn([col({ phaseModel: 'claude:opus' })]);
      const state: BoardState = {
        ...base,
        fieldDefs: [
          ...base.fieldDefs,
          { id: 'modelo', boardId: 'b', name: 'Modelo', kind: 'model', appliesToTypes: null, display: 'badge', position: 1 },
        ],
        fieldValues: [...base.fieldValues, { cardId: 'c1', fieldId: 'modelo', value: 'claude:haiku' }],
      } as never;
      expect(isHandPicked(state, card(), 'claude:haiku')).toBe(false);
      expect(isHandPicked(state, card())).toBe(true);
    });
  });
});

describe('deriveModelFailures: a marca "sem execução bem-sucedida" a partir do log', () => {
  const profiles = [
    { id: 'claude', tool: '' },
    { id: 'claude-copia', tool: 'claude' },
    { id: 'gemini', tool: '' },
  ];
  const row = (over: Partial<ModelRunOutcome>): ModelRunOutcome => ({
    tool: 'gemini',
    model: 'gemini-2.5-flash',
    outcome: 'failed',
    failureClass: 'deterministic',
    exitCode: 1,
    at: Date.UTC(2026, 9, 20),
    ...over,
  });

  it('as últimas execuções sem resultado marcam o modelo com a data, o desfecho e a classe da última', () => {
    const rows = [row({ at: 30, exitCode: 2 }), row({ at: 20, outcome: 'timeout', failureClass: null }), row({ at: 10 })];
    expect(deriveModelFailures(rows, profiles)).toEqual({
      'gemini:gemini-2.5-flash': { at: 30, outcome: 'failed', failureClass: 'deterministic', exitCode: 2, runs: 3 },
    });
  });

  it('uma execução bem-sucedida entre as últimas limpa a marca; uma só falha de um modelo novo já marca', () => {
    expect(
      deriveModelFailures([row({ at: 30 }), row({ at: 20, outcome: 'done', failureClass: null, exitCode: 0 }), row({ at: 10 })], profiles),
    ).toEqual({});
    expect(deriveModelFailures([row({ at: 30 })], profiles)['gemini:gemini-2.5-flash']).toMatchObject({ runs: 1 });
  });

  it('só as últimas N contam: um sucesso mais antigo que a janela não salva o modelo', () => {
    const rows = [row({ at: 40 }), row({ at: 30 }), row({ at: 20 }), row({ at: 10, outcome: 'done', failureClass: null })];
    expect(MODEL_FAILURE_WINDOW).toBe(3);
    expect(deriveModelFailures(rows, profiles)['gemini:gemini-2.5-flash']).toMatchObject({ runs: 3 });
    expect(deriveModelFailures(rows, profiles, 4)).toEqual({});
  });

  it('parada pela pessoa, limite de uso, sessão fechada e sem processo não contam nem para um lado nem para o outro', () => {
    const rows = [
      row({ at: 50, outcome: 'stopped', failureClass: 'canceled' }),
      row({ at: 40, outcome: 'failed', failureClass: 'budget' }),
      row({ at: 30, outcome: 'unknown', failureClass: null }),
      row({ at: 20, outcome: 'unsupported', failureClass: null }),
    ];
    expect(deriveModelFailures(rows, profiles)).toEqual({});
    expect(deriveModelFailures([...rows, row({ at: 10 })], profiles)['gemini:gemini-2.5-flash']).toMatchObject({ at: 10, runs: 1 });
  });

  it('a linha guarda o perfil; a marca vai para o id do catálogo, e a cópia marca o mesmo modelo da origem', () => {
    const rows = [row({ tool: 'claude-copia', model: 'haiku', at: 20 }), row({ tool: 'claude', model: 'haiku', at: 10 })];
    expect(Object.keys(deriveModelFailures(rows, profiles))).toEqual(['claude:haiku']);
    expect(deriveModelFailures(rows, profiles)['claude:haiku']).toMatchObject({ runs: 2 });
  });

  it('perfil apagado não marca nada', () => {
    expect(deriveModelFailures([row({ tool: 'sumido' })], profiles)).toEqual({});
  });

  it('modelFailureOf lê o modelo de um valor com esforço; describeModelFailure diz quantas, como e quando', () => {
    const board = { modelFailures: deriveModelFailures([row({ at: Date.UTC(2026, 9, 20, 15) })], profiles) };
    expect(modelFailureOf(board, 'gemini:gemini-2.5-flash@high')).toMatchObject({ runs: 1 });
    expect(modelFailureOf(board, 'gemini:gemini-2.5-pro')).toBeNull();
    expect(modelFailureOf({}, 'gemini:gemini-2.5-flash')).toBeNull();
    expect(describeModelFailure(modelFailureOf(board, 'gemini:gemini-2.5-flash')!)).toBe(
      'a última execução falhou em 2026-10-20 (classe deterministic, saída 1)',
    );
    expect(describeModelFailure({ at: Date.UTC(2026, 9, 20), outcome: 'timeout', failureClass: null, exitCode: null, runs: 3 })).toBe(
      'as últimas 3 execuções terminaram sem resultado; a última estourou o tempo limite em 2026-10-20',
    );
  });
});
