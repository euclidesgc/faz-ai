import { describe, expect, it } from 'vitest';
import {
  admit,
  effectiveLimits,
  orchestrableSubtasks,
  reconcileOutcome,
  storyPlan,
  workKey,
  type WorkEvidence,
  type WorkRuntime,
} from '../src/shared/orchestration';
import { DEFAULT_RUNNER, parseRunner } from '../src/shared/runner';
import { boardState, card, column, sub } from './fakes/board';
import { NOT_REPEATED } from '../src/extension/aiOutput/errors';

describe('limites efetivos da orquestração', () => {
  const writer: WorkRuntime = { activity: 'branch', profile: 'claude', workspace: '/real/story', writer: true };
  it('preserva o pedido mas mantém um escritor por pasta e conta cada CLI como processo', () => {
    const limits = effectiveLimits({ ...DEFAULT_RUNNER, parallel: true, parallelStories: 3, parallelSubtasks: 6 }, 'worktree');
    expect(limits).toMatchObject({ branchProcesses: 3, writersPerWorkspace: 1, subtasks: { requested: 6, effective: 1 } });
    expect(admit(writer, [writer], limits)).toMatchObject({ ok: false });
    const others = ['/real/a', '/real/b', '/real/c'].map((workspace) => ({ ...writer, workspace }));
    expect(admit(writer, others, limits)).toMatchObject({ ok: false });
    expect(admit(writer, others.slice(1), limits)).toEqual({ ok: true });
    expect(effectiveLimits({ ...DEFAULT_RUNNER, parallel: true }, 'branch').branchProcesses).toBe(1);
  });
  it('separa texto, código, teto global e teto por perfil, inclusive em reconciliação', () => {
    const limits = effectiveLimits({ ...DEFAULT_RUNNER, parallel: true, parallelStories: 6 }, 'worktree', {
      globalProcesses: 2,
      perProfile: { claude: 1 },
    });
    const reader: WorkRuntime = { ...writer, activity: 'text', workspace: null, writer: false };
    expect(admit(writer, [reader], limits)).toMatchObject({ ok: false, reason: 'O teto do perfil foi atingido.' });
    expect(
      admit(
        writer,
        [
          { ...reader, profile: 'kimi' },
          { ...reader, profile: 'cursor' },
        ],
        limits,
      ),
    ).toMatchObject({ ok: false, reason: 'O teto global de processos foi atingido.' });
    expect(admit(reader, [], limits)).toEqual({ ok: true });
    expect(admit({ ...writer, workspace: null }, [], limits)).toMatchObject({ ok: false });
    expect(() => effectiveLimits(DEFAULT_RUNNER, 'worktree', { globalProcesses: 0 })).toThrow('inválido');
    expect(() => effectiveLimits(DEFAULT_RUNNER, 'worktree', { perProfile: { claude: Number.NaN } })).toThrow('inválido');
  });
  it('migra o pedido ausente para dois e normaliza apenas configuração do runner', () => {
    expect(parseRunner('{}').parallelSubtasks).toBe(2);
    expect(parseRunner('{"parallelSubtasks":1}').parallelSubtasks).toBe(1);
    expect(parseRunner('{"parallelSubtasks":99}').parallelSubtasks).toBe(6);
    expect(parseRunner('{"parallelSubtasks":null}').parallelSubtasks).toBe(2);
  });
});

describe('decisão de reconciliação', () => {
  const evidence: WorkEvidence = {
    kind: 'subtask',
    processGone: true,
    outcome: 'done',
    usageLimit: false,
    measureError: null,
    cardClosed: false,
    cardWithPerson: false,
    mutations: 0,
    toolCalls: 0,
    workspaceChanged: false,
  };
  it('não confunde sucesso do processo com conclusão do card', () => {
    expect(reconcileOutcome(evidence)).toEqual({ kind: 'needs-decision', reason: NOT_REPEATED });
    expect(reconcileOutcome({ ...evidence, cardClosed: true })).toEqual({ kind: 'done' });
    expect(reconcileOutcome({ ...evidence, cardWithPerson: true })).toEqual({ kind: 'with-person' });
  });
  it('não libera recursos com descendente vivo, mesmo com card concluído', () => {
    expect(reconcileOutcome({ ...evidence, processGone: false, cardClosed: true })).toMatchObject({ kind: 'unconfirmed' });
  });
  it.each(['stopped', 'unsupported'] as const)('repete %s somente com ausência comprovada de todo efeito', (outcome) => {
    expect(reconcileOutcome({ ...evidence, outcome })).toMatchObject({ kind: 'retry-safe' });
    for (const patch of [
      { mutations: 1 },
      { toolCalls: 1 },
      { toolCalls: null },
      { workspaceChanged: true },
      { workspaceChanged: null },
      { measureError: 'ended' as const },
    ])
      expect(reconcileOutcome({ ...evidence, outcome, ...patch })).toMatchObject({ kind: 'needs-decision' });
  });
  it('limite de uso exige as mesmas provas e timeout/falha desconhecida não repetem', () => {
    expect(reconcileOutcome({ ...evidence, usageLimit: true, outcome: 'failed' })).toMatchObject({ kind: 'retry-safe' });
    expect(reconcileOutcome({ ...evidence, usageLimit: true, toolCalls: null })).toMatchObject({ kind: 'needs-decision' });
    expect(reconcileOutcome({ ...evidence, outcome: 'timeout' })).toMatchObject({ kind: 'needs-decision' });
    expect(reconcileOutcome({ ...evidence, outcome: 'unknown' })).toMatchObject({ kind: 'needs-decision' });
  });
});

describe('plano puro de rodadas', () => {
  const story = card('story', { columnId: 'doing', number: 1 });
  function state() {
    const a = sub('a', story.id, 'todo', { number: 2 });
    const b = sub('b', story.id, 'todo', { number: 3 });
    const c = sub('c', story.id, 'todo', { number: 4 });
    const s = boardState({ cards: [story, a, b, c], links: [{ id: 'dependency', fromId: a.id, toId: c.id, kind: 'precedes' }] });
    s.columns = s.columns.map((p) => ({ ...p, aiActive: p.id === 'doing' }));
    return s;
  }
  const live = { byCard: new Map() };
  it('inicia uma tarefa por vez e respeita as dependências usando subtaskWaves', () => {
    const s = state();
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'units', units: [{ cardId: 'a' }] });
    s.cards[1]!.columnId = 'finished';
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'units', units: [{ cardId: 'b' }] });
    s.cards[2]!.status = 'blocked';
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'units', units: [{ cardId: 'c' }] });
    s.cards[3]!.columnId = 'finished';
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'paused' });
  });
  it('posse e reconciliação impedem outra unidade, e cancelar a história mantém filhas sem iniciar', () => {
    const s = state();
    expect(storyPlan(s, story, { byCard: new Map([['a', { state: 'reconciling', key: 'a', kind: 'subtask' }]]) }, new Set())).toMatchObject(
      { kind: 'wait' },
    );
    expect(storyPlan(s, { ...story, columnId: 'cancelled' }, live, new Set())).toEqual({ kind: 'idle' });
    s.columns.push({ ...column('doc', 'wp', 0), aiActive: true, artifactName: 'SPEC.md' });
    expect(storyPlan(s, { ...story, columnId: 'doc' }, live, new Set())).toEqual({ kind: 'idle' });
  });
  it('fechamento é idempotente por conjunto/revisão dos filhos; mudar o nome da fase não muda a chave', () => {
    const s = state();
    for (const child of s.cards.slice(1)) child.columnId = 'finished';
    const key = workKey('closing', s, story, story);
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'units', units: [{ kind: 'closing', key }] });
    expect(storyPlan(s, story, live, new Set([key]))).toMatchObject({ kind: 'paused' });
    s.columns = s.columns.map((p) => ({ ...p, name: 'Renomeada' }));
    expect(workKey('closing', s, story, story)).toBe(key);
    s.cards.push(sub('d', story.id, 'finished', { number: 5 }));
    expect(workKey('closing', s, story, story)).not.toBe(key);
  });
  it('board sem campo Fase aceita as abertas com a IA e exclui as encerradas', () => {
    const s = state();
    s.cards[2]!.status = 'waiting_review';
    s.cards[3]!.columnId = 'finished';
    expect(orchestrableSubtasks(s, story).map((c) => c.id)).toEqual(['a']);
  });
  it('o campo Fase limita as tarefas sem carregar as escolhas de outras fases', () => {
    const s = state();
    s.fieldDefs = [
      {
        id: 'phase',
        boardId: 'b',
        name: 'Fase',
        kind: 'select',
        options: ['doing', 'outra'],
        appliesToTypes: null,
        display: 'hidden',
        position: 0,
      },
    ];
    s.fieldValues = [
      { cardId: 'a', fieldId: 'phase', value: 'outra' },
      { cardId: 'b', fieldId: 'phase', value: 'doing' },
    ];
    expect(orchestrableSubtasks(s, story).map((c) => c.id)).toEqual(['b']);
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'units', units: [{ cardId: 'b' }] });
  });
});
