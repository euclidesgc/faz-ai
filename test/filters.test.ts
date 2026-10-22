import { EMPTY_CHAT } from '../src/shared/chat';
import { DEFAULT_RUNNER } from '../src/shared/runner';
import { DEFAULT_GIT } from '../src/shared/git';
import { describe, expect, it } from 'vitest';
import type { BoardState, Card } from '../src/shared/model';
import { DEFAULT_APPEARANCE } from '../src/shared/appearance';
import { EMPTY_HARNESS } from '../src/shared/harness';
import { DEFAULT_RULES } from '../src/shared/rules';
import { EMPTY_FILTERS, applyFilters, activeFilterCount, type Filters } from '../src/shared/filters';

const NOW = new Date(2026, 9, 1, 12).getTime();
const DAY = 86400000;

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id,
  questions: [],
  number: 0,
  boardId: 'b',
  workflowId: 'wp',
  columnId: 'todo',
  typeId: 'story',
  parentId: null,
  title: id,
  description: '',
  position: 0,
  createdAt: NOW,
  updatedAt: NOW,
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

const state: BoardState = {
  board: {
    id: 'b',
    workspaceKey: 'k',
    name: 'B',
    rules: DEFAULT_RULES,
    aiTool: 'claude',
    aiProfiles: [],
    modelCatalog: [],
    modelRules: [],
    appearance: DEFAULT_APPEARANCE,
    templateVersion: 1,
    runner: DEFAULT_RUNNER,
    git: DEFAULT_GIT,
    execProfiles: [],
  },
  workflows: [
    { id: 'wp', boardId: 'b', name: 'H', position: 0, kind: 'parent', collapsed: false },
    { id: 'wc', boardId: 'b', name: 'S', position: 1, kind: 'child', collapsed: false },
  ],
  columns: [
    {
      id: 'todo',
      workflowId: 'wp',
      name: 'Backlog',
      position: 0,
      category: 'open',
      isTerminal: false,
      collapsed: false,
      aiActive: false,
      requiresApproval: false,
      aiInstruction: '',
      artifactName: '',
      artifactTemplate: '',
      execProfile: null,
    },
    {
      id: 'c-todo',
      workflowId: 'wc',
      name: 'A fazer',
      position: 0,
      category: 'open',
      isTerminal: false,
      collapsed: false,
      aiActive: false,
      requiresApproval: false,
      aiInstruction: '',
      artifactName: '',
      artifactTemplate: '',
      execProfile: null,
    },
    {
      id: 'c-done',
      workflowId: 'wc',
      name: 'Concluído',
      position: 1,
      category: 'done',
      isTerminal: true,
      collapsed: false,
      aiActive: false,
      requiresApproval: false,
      aiInstruction: '',
      artifactName: '',
      artifactTemplate: '',
      execProfile: null,
    },
  ],
  cardTypes: [],
  cards: [
    card('login', { title: 'Tela de Login', description: 'autenticação OAuth', createdAt: NOW - 10 * DAY }),
    card('bug', { typeId: 'bug', title: 'Corrigir crash' }),
    card('solo', { title: 'Sem filhos', createdAt: NOW - 40 * DAY }),
    card('prd', { workflowId: 'wc', columnId: 'c-done', typeId: 'sub', parentId: 'login', title: 'Criar PRD' }),
    card('spec', { workflowId: 'wc', columnId: 'c-todo', typeId: 'sub', parentId: 'login', title: 'Criar Spec' }),
    card('fix', { workflowId: 'wc', columnId: 'c-done', typeId: 'sub', parentId: 'bug', title: 'Patch' }),
    card('lixo', { title: 'Login antigo', deletedAt: NOW }),
  ],
  fieldDefs: [],
  fieldValues: [
    { cardId: 'prd', fieldId: 'fase', value: 'PRD' },
    { cardId: 'login', fieldId: 'tags', value: ['frontend', 'infra'] },
    { cardId: 'bug', fieldId: 'urgente', value: true },
    { cardId: 'solo', fieldId: 'prazo', value: '2026-10-05' },
  ],
  checklistItems: [],
  links: [],
  comments: [{ id: 'c1', cardId: 'solo', author: 'a', source: 'human', body: 'ver com a Júlia', createdAt: NOW, updatedAt: NOW }],
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
  authExpired: [],
  usageLimit: [],
  orphans: { items: [], failed: {}, scannedAt: null },
  environment: null,
  environmentFirstRun: false,
  artifactImport: null,
  mainBranch: null,
  branchRenames: [],
  branchRenameResult: null,
};

const run = (f: Partial<Filters>) => [...(applyFilters(state, { ...EMPTY_FILTERS, includeRelated: false, ...f }, NOW) ?? [])].sort();

describe('applyFilters', () => {
  it('sem filtros devolve null', () => {
    expect(applyFilters(state, EMPTY_FILTERS, NOW)).toBeNull();
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('palavra-chave busca em título, descrição, comentários e campos, ignora acentos e lixeira', () => {
    expect(run({ text: 'login' })).toEqual(['login']);
    expect(run({ text: 'oauth tela' })).toEqual(['login']);
    expect(run({ text: 'julia' })).toEqual(['solo']);
    expect(run({ text: 'infra' })).toEqual(['login']);
  });

  it('tipo e campos (select, multiselect, checkbox)', () => {
    expect(run({ typeIds: ['bug'] })).toEqual(['bug']);
    expect(run({ fields: { fase: ['PRD'] } })).toEqual(['prd']);
    expect(run({ fields: { tags: ['infra', 'docs'] } })).toEqual(['login']);
    expect(run({ fields: { urgente: ['true'] } })).toEqual(['bug']);
    expect(run({ fields: { urgente: ['false'] } })).not.toContain('bug');
  });

  it('período sobre criação e sobre campo de data', () => {
    expect(run({ dateField: 'createdAt', datePreset: '7d' })).not.toContain('login');
    expect(run({ dateField: 'createdAt', datePreset: '30d' })).toContain('login');
    expect(run({ dateField: 'createdAt', datePreset: '30d' })).not.toContain('solo');
    expect(run({ dateField: 'prazo', datePreset: 'custom', dateFrom: '2026-10-01', dateTo: '2026-10-05' })).toEqual(['solo']);
    expect(run({ dateField: 'prazo', datePreset: 'custom', dateTo: '2026-10-04' })).toEqual([]);
  });

  it('período de arquivamento exclui cards sem data ou fora do intervalo', () => {
    const cards = state.cards.map((c) =>
      c.id === 'login' ? { ...c, archivedAt: NOW - DAY } : c.id === 'bug' ? { ...c, archivedAt: NOW - 10 * DAY } : c,
    );
    const matched = applyFilters(
      { ...state, cards },
      { ...EMPTY_FILTERS, includeRelated: false, dateField: 'archivedAt', datePreset: '7d' },
      NOW,
    );
    expect([...matched!]).toEqual(['login']);
  });

  it('relacionamentos', () => {
    expect(run({ relation: 'withChildren' })).toEqual(['bug', 'login']);
    expect(run({ relation: 'withoutChildren' })).toEqual(['solo']);
    expect(run({ relation: 'pendingChildren' })).toEqual(['login']);
  });

  it('pendência: com a pessoa ou com a IA', () => {
    const cards = state.cards.map((c, i) => ({ ...c, status: (['waiting_review', 'ready', 'blocked'] as const)[i] ?? null }));
    const owned = (owner: Filters['owner']) =>
      [...(applyFilters({ ...state, cards }, { ...EMPTY_FILTERS, includeRelated: false, owner }, NOW) ?? [])].sort();
    const idOf = (status: string) => cards.filter((c) => c.status === status && c.deletedAt === null).map((c) => c.id);
    expect(owned('human')).toEqual([...idOf('waiting_review'), ...idOf('blocked')].sort());
    expect(owned('ai')).toEqual(idOf('ready'));
    expect(activeFilterCount({ ...EMPTY_FILTERS, owner: 'human' })).toBe(1);
  });

  it('includeRelated traz pai e filhos dos resultados', () => {
    expect([...applyFilters(state, { ...EMPTY_FILTERS, text: 'spec' }, NOW)!].sort()).toEqual(['login', 'spec']);
    expect([...applyFilters(state, { ...EMPTY_FILTERS, typeIds: ['bug'] }, NOW)!].sort()).toEqual(['bug', 'fix']);
  });
});

describe('busca por card (#N, N, palavras comuns e E)', () => {
  // Cards com número real: a busca por `#N` e `N` depende de `number`, não do id.
  const buscar = (cards: Card[], text: string): string[] =>
    [
      ...(applyFilters({ ...state, cards, comments: [], fieldValues: [] }, { ...EMPTY_FILTERS, text, includeRelated: false }, NOW) ?? []),
    ].sort();

  const cartoes = [
    card('n980', { number: 980, title: 'Fluxo principal' }),
    card('n9801', { number: 9801, title: 'Fluxo longo' }),
    card('n1980', { number: 1980, title: 'Fluxo antigo' }),
    card('citaHash', { number: 5, title: 'Ajuste', description: 'Veja o #980 antes' }),
    card('citaPuro', { number: 6, title: 'Revisão', description: 'depende de 980 e nada mais' }),
    card('texto9801', { number: 7, title: 'Prazo 9801 dias' }),
    card('texto1980', { number: 8, title: 'Desde', description: 'desde 1980' }),
  ];

  it('#980 retorna só o card 980 (não 9801 nem 1980)', () => {
    expect(buscar(cartoes, '#980')).toEqual(['n980']);
  });

  it('980 retorna o card 980 e os cards que citam #980 ou 980 como palavra inteira', () => {
    expect(buscar(cartoes, '980')).toEqual(['citaHash', 'citaPuro', 'n980']);
  });

  it('980 não casa 1980 nem 9801 no texto', () => {
    const semCitacao = cartoes.filter((c) => ['n9801', 'n1980', 'texto9801', 'texto1980'].includes(c.id));
    expect(buscar(semCitacao, '980')).toEqual([]);
  });

  it('palavras comuns continuam por substring, sem acento', () => {
    expect(buscar(cartoes, 'flux')).toEqual(['n1980', 'n980', 'n9801']);
    expect(buscar(cartoes, 'revis')).toEqual(['citaPuro']);
    expect(buscar(cartoes, 'ajust')).toEqual(['citaHash']);
  });

  it('palavras separadas por espaço são E: todas precisam casar', () => {
    const cards = [card('login', { title: 'Tela de Login' }), card('cadastro', { title: 'Tela de Cadastro' })];
    expect(buscar(cards, 'tela login')).toEqual(['login']);
    expect(buscar(cards, 'login tela')).toEqual(['login']);
    expect(buscar(cards, 'tela cadastro login')).toEqual([]);
  });

  it('#980 bug exige card 980 E a palavra bug', () => {
    const cards = [
      card('a', { number: 980, title: 'Fluxo', description: 'bug aberto' }),
      card('b', { number: 5, description: '#980 bug' }),
      card('c', { number: 981, title: 'bug' }),
    ];
    expect(buscar(cards, '#980 bug')).toEqual(['a']);
  });

  it('#980 bug deixa de fora o card 980 que não tem a palavra bug', () => {
    const cards = [card('semBug', { number: 980, title: 'Fluxo' }), card('outro', { number: 5, title: 'bug' })];
    expect(buscar(cards, '#980 bug')).toEqual([]);
  });
});
