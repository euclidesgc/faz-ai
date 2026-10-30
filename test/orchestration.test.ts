import { describe, expect, it } from 'vitest';
import {
  admit,
  blockNote,
  effectiveLimits,
  handedBackAt,
  orchestrableSubtasks,
  reconcileOutcome,
  repeatedBlockNote,
  stoppedReason,
  UNBLOCK_MARK,
  storyPlan,
  workKey,
  type WorkEvidence,
  type WorkRuntime,
} from '../src/shared/orchestration';
import { DEFAULT_RUNNER, parseRunner } from '../src/shared/runner';
import { boardState, card, column, sub } from './fakes/board';
import { validBrief } from './fixtures/subtaskBrief';
import { isBriefKey } from '../src/shared/subtaskBrief';
import { contextReason, CONTEXT_DONE_MARK, CONTEXT_MARK, isContextKey, MAX_CONTEXT_REQUESTS } from '../src/shared/subtaskOutcome';
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
    expect(admit(writer, [{ ...reader, label: '#7' }], limits)).toEqual({
      ok: false,
      reason:
        'Já há 1 execução do perfil claude rodando (#7), e a política de execução permite 1 desse perfil ao mesmo tempo. Ela começa sozinha quando uma vaga liberar.',
    });
    expect(
      admit(
        writer,
        [
          { ...reader, profile: 'kimi' },
          { ...reader, profile: 'cursor' },
        ],
        limits,
      ),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Já há 2 execuções de IA rodando, e o teto global da política de execução é 2.'),
    });
    expect(admit(reader, [], limits)).toEqual({ ok: true });
    expect(admit({ ...writer, workspace: null }, [], limits)).toMatchObject({ ok: false });
    expect(() => effectiveLimits(DEFAULT_RUNNER, 'worktree', { globalProcesses: 0 })).toThrow('inválido');
    expect(() => effectiveLimits(DEFAULT_RUNNER, 'worktree', { perProfile: { claude: Number.NaN } })).toThrow('inválido');
  });
  it('a recusa pelo limite da atividade diz quem ocupa a vaga, o limite e onde ajustar', () => {
    const busy = [
      { ...writer, workspace: '/real/a', label: '#3' },
      { ...writer, workspace: '/real/b', label: '#3' },
    ];
    const off = effectiveLimits({ ...DEFAULT_RUNNER, parallel: false }, 'worktree');
    expect(admit(writer, busy.slice(0, 1), off)).toEqual({
      ok: false,
      reason:
        'Já há 1 execução mexendo no código rodando (#3), e o limite é 1 ao mesmo tempo: "Tocar histórias em paralelo" está desligado em Configurações → Automação. Ela começa sozinha quando uma vaga liberar.',
    });
    const shared = effectiveLimits({ ...DEFAULT_RUNNER, parallel: true }, 'branch');
    expect(admit(writer, busy.slice(0, 1), shared)).toMatchObject({
      reason: expect.stringContaining('"Worktree por história" (Configurações → Git)'),
    });
    const two = effectiveLimits({ ...DEFAULT_RUNNER, parallel: true, parallelStories: 2 }, 'worktree');
    expect(admit(writer, busy, two)).toMatchObject({
      reason: expect.stringContaining(
        'Já há 2 execuções mexendo no código rodando (#3), e o limite é 2 ao mesmo tempo: o limite vem de "Histórias ao mesmo tempo"',
      ),
    });
    const reader: WorkRuntime = { ...writer, activity: 'text', workspace: null, writer: false };
    expect(
      admit(reader, [{ ...reader, label: '#9' }], effectiveLimits({ ...DEFAULT_RUNNER, parallelStories: 1 }, 'worktree')),
    ).toMatchObject({
      reason: expect.stringContaining('Já há 1 execução só de texto rodando (#9), e o limite é 1'),
    });
    expect(admit(writer, [{ ...writer, label: '#5' }], two)).toMatchObject({
      reason: expect.stringContaining('A pasta desta execução já tem outra IA escrevendo (#5)'),
    });
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
  it('pedido de contexto declarado vira needs-decision com a marca', () => {
    const declared = { kind: 'needs-context', summary: 's', pending: 'p' } as const;
    const r = reconcileOutcome({ ...evidence, declared, card: { description: 'x' } });
    expect(r).toMatchObject({ kind: 'needs-decision', reason: expect.stringContaining('**Pedido de contexto**') });
    expect(reconcileOutcome({ ...evidence, declared, cardClosed: true })).toEqual({ kind: 'done' });
    expect(reconcileOutcome({ ...evidence, declared, cardWithPerson: true })).toEqual({ kind: 'with-person' });
    for (const d of [{ kind: 'none' }, { kind: 'block', reason: 'r' }, { kind: 'concern', text: 't' }] as const)
      expect(reconcileOutcome({ ...evidence, declared: d })).toEqual({ kind: 'needs-decision', reason: NOT_REPEATED });
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
  it('transitória sem efeito é retry-safe, mesmo com a medição encerrada, até 3 vezes', () => {
    const transient = { ...evidence, outcome: 'failed' as const, failureClass: 'transient' as const, transientRetries: 0 };
    expect(reconcileOutcome(transient)).toMatchObject({ kind: 'retry-safe' });
    expect(reconcileOutcome({ ...transient, measureError: 'ended' })).toMatchObject({ kind: 'retry-safe' });
    expect(reconcileOutcome({ ...transient, toolCalls: null })).toMatchObject({ kind: 'retry-safe' });
    expect(reconcileOutcome({ ...transient, transientRetries: 2 })).toMatchObject({ kind: 'retry-safe' });
    expect(reconcileOutcome({ ...transient, transientRetries: 3 })).toMatchObject({
      kind: 'needs-decision',
      reason: expect.stringContaining('3 tentativas'),
    });
  });
  it('transitória com efeito ou medição quebrada falha com o motivo da classe', () => {
    const transient = { ...evidence, outcome: 'failed' as const, failureClass: 'transient' as const, transientRetries: 0 };
    for (const patch of [
      { mutations: 1 },
      { toolCalls: 2 },
      { workspaceChanged: true },
      { workspaceChanged: null },
      { measureError: 'broken' as const },
    ])
      expect(reconcileOutcome({ ...transient, ...patch })).toMatchObject({
        kind: 'needs-decision',
        reason: expect.stringContaining('Falha transitória'),
      });
    expect(reconcileOutcome({ ...transient, failureClass: 'deterministic' })).toMatchObject({
      kind: 'needs-decision',
      reason: NOT_REPEATED,
    });
    expect(reconcileOutcome({ ...transient, cardClosed: true })).toEqual({ kind: 'done' });
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
    const a = sub('a', story.id, 'todo', { number: 2, description: validBrief() });
    const b = sub('b', story.id, 'todo', { number: 3, description: validBrief() });
    const c = sub('c', story.id, 'todo', { number: 4, description: validBrief() });
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
  it('sub-tarefa reprovada na conferência devolve a sessão de correção da história', () => {
    const s = state();
    s.cards[2]!.description = '';
    const plan = storyPlan(s, story, live, new Set());
    expect(plan).toMatchObject({ kind: 'units', units: [{ kind: 'story', cardId: story.id }] });
    const key = plan.kind === 'units' ? plan.units[0]!.key : '';
    expect(isBriefKey(key)).toBe(true);
    expect(storyPlan(s, story, live, new Set([key]))).toMatchObject({ kind: 'paused' });
    expect(storyPlan(s, story, { byCard: new Map([[story.id, { state: 'failed', key, kind: 'story' }]]) }, new Set())).toMatchObject({
      kind: 'paused',
    });
  });
  it('mensagem da pessoa ou sub-tarefa reprovada nova mudam a chave da correção', () => {
    const s = state();
    s.cards[2]!.description = '';
    const keyOf = () => {
      const plan = storyPlan(s, story, live, new Set());
      return plan.kind === 'units' ? plan.units[0]!.key : '';
    };
    const first = keyOf();
    s.comments.push({ id: 'm', cardId: story.id, source: 'human', createdAt: 5 } as (typeof s.comments)[number]);
    const second = keyOf();
    expect(second).not.toBe(first);
    s.cards[3]!.description = '';
    expect(keyOf()).not.toBe(second);
  });
  it('sub-tarefa válida segue como subtask; a que está com a pessoa ou falhou fica fora da conferência', () => {
    const s = state();
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ units: [{ kind: 'subtask' }] });
    s.cards[2]!.description = '';
    s.cards[2]!.status = 'blocked';
    s.cards[3]!.description = '';
    const failedLive = { byCard: new Map([['c', { state: 'failed' as const, key: 'k', kind: 'subtask' as const }]]) };
    expect(storyPlan(s, story, failedLive, new Set())).toMatchObject({ units: [{ kind: 'subtask', cardId: 'a' }] });
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
  it('fechamento que falhou para a história com o motivo, e roda de novo só depois de um gesto da pessoa (a #1098)', () => {
    const s = state();
    for (const child of s.cards.slice(1)) child.columnId = 'finished';
    const key = workKey('closing', s, story, story);
    const failed = {
      byCard: new Map([[story.id, { state: 'failed' as const, key, kind: 'closing' as const, reason: 'interrompido', updatedAt: 10 }]]),
    };
    const paused = storyPlan(s, story, failed, new Set());
    // antes: devolvia a mesma unidade, a posse recusava ("já está reservada") e o autopiloto chamava a IA sem fim
    expect(paused).toMatchObject({ kind: 'paused' });
    expect(paused.kind === 'paused' && paused.reason).toContain('Motivo: interrompido');
    s.comments.push({ id: 'm', cardId: story.id, source: 'human', body: 'pode seguir', createdAt: 20 } as (typeof s.comments)[number]);
    expect(storyPlan(s, story, failed, new Set())).toMatchObject({ kind: 'units', units: [{ kind: 'closing', key }] });
  });
  it('sessão da história que falhou também para até um gesto da pessoa', () => {
    const s = state();
    s.cards = [s.cards[0]!];
    const key = workKey('story', s, story, story);
    const failed = { byCard: new Map([[story.id, { state: 'failed' as const, key, kind: 'story' as const, updatedAt: 10 }]]) };
    expect(storyPlan(s, story, failed, new Set())).toMatchObject({ kind: 'paused' });
    s.comments.push({ id: 'm', cardId: story.id, source: 'human', body: 'ok', createdAt: 20 } as (typeof s.comments)[number]);
    expect(storyPlan(s, story, failed, new Set())).toMatchObject({ kind: 'units', units: [{ kind: 'story', key }] });
  });
  it('sub-tarefa que já rodou só roda de novo quando a pessoa a devolve, na conversa dela ou na da história', () => {
    const s = state();
    // só a sub-tarefa a fica aberta na fase
    s.cards[2]!.columnId = 'finished';
    s.cards[3]!.columnId = 'finished';
    const say = (cardId: string, at: number, source: 'human' | 'ai' = 'human') =>
      s.comments.push({ id: `m${at}`, cardId, author: source === 'human' ? 'a' : 'IA', source, body: 'x', createdAt: at, updatedAt: at });
    const a = s.cards[1]!;
    const ran = new Set([workKey('subtask', s, story, a)]);
    // rodou e ficou aberta: a história para nela, com o que fazer
    const paused = storyPlan(s, story, live, ran);
    expect(paused).toMatchObject({ kind: 'paused' });
    expect(paused.kind === 'paused' && paused.reason).toContain('Responda aqui na conversa da história');
    // a mensagem da IA não devolve a vez: só a da pessoa
    say(a.id, 10, 'ai');
    expect(storyPlan(s, story, live, ran)).toMatchObject({ kind: 'paused' });
    say(a.id, 20);
    expect(storyPlan(s, story, live, ran)).toMatchObject({ kind: 'units', units: [{ cardId: 'a' }] });
    // a resposta na história também devolve, e a chave nova roda uma vez só
    const again = new Set([...ran, workKey('subtask', s, story, a)]);
    expect(storyPlan(s, story, live, again)).toMatchObject({ kind: 'paused' });
    say(story.id, 30);
    expect(storyPlan(s, story, live, again)).toMatchObject({ kind: 'units', units: [{ cardId: 'a' }] });
    // o status que a pessoa mesma definiu também conta; o da IA, não
    const done = new Set([...again, workKey('subtask', s, story, a)]);
    a.statusBy = 'Claude Code';
    a.statusAt = 40;
    expect(workKey('subtask', s, story, a)).toBe([...done].at(-1));
    a.statusBy = 'a';
    expect(done.has(workKey('subtask', s, story, a))).toBe(false);
  });
  it('a nota de tentativa de desbloqueio do heartbeat conta como gesto da pessoa, só quando é da IA e começa pela marca', () => {
    const s = state();
    const a = s.cards[1]!;
    const note = (cardId: string, at: number, body: string, source: 'human' | 'ai' = 'ai') =>
      s.comments.push({ id: `n${at}`, cardId, author: 'Faz AI', source, body, createdAt: at, updatedAt: at });
    expect(handedBackAt(s, a)).toBe(0);
    // uma mensagem qualquer da IA não devolve a vez
    note(story.id, 5, 'Resolvi a causa.');
    expect(handedBackAt(s, a)).toBe(0);
    // a marca num texto da IA que não abre com ela também não
    note(story.id, 6, `Veja: ${UNBLOCK_MARK}`);
    expect(handedBackAt(s, a)).toBe(0);
    // a nota na conversa da história devolve a sub-tarefa, e a chave dela muda para rodar de novo
    const before = workKey('subtask', s, story, a);
    note(story.id, 10, `${UNBLOCK_MARK} (abc12345): o heartbeat chamou a IA.`);
    expect(handedBackAt(s, a)).toBe(10);
    expect(workKey('subtask', s, story, a)).not.toBe(before);
    // a nota de outra história não conta
    note('outra', 50, `${UNBLOCK_MARK} (abc12345): x`);
    expect(handedBackAt(s, a)).toBe(10);
    // vale o gesto mais recente, da pessoa ou da nota
    note(a.id, 20, 'segue', 'human');
    expect(handedBackAt(s, a)).toBe(20);
  });
  it('a parada numa sub-tarefa com a pessoa traz o motivo dela e os passos para destravar', () => {
    const s = state();
    const blocked = sub('x', story.id, 'todo', { number: 9, status: 'blocked', statusReason: 'A base da história é a main.' });
    const reason = stoppedReason(s, story, blocked);
    expect(reason).toContain('#9 está com você: A base da história é a main.');
    expect(reason).toContain('Para destravar:\n1. Abra #9');
    expect(reason).toContain('2. Responda aqui na conversa da história');
    const ran = stoppedReason(s, story, { ...blocked, status: 'ready', statusReason: '' });
    expect(ran).toContain('terminou sem concluir');
    expect(ran).toContain('leia a última mensagem da conversa dela');
  });
  describe('sub-tarefa que falhou ao iniciar', () => {
    const haiku = { id: 'claude:haiku', tool: 'claude', model: 'haiku', label: 'Haiku', efforts: ['medium'], defaultEffort: null };
    // o caso do board: a regra de sugestão propôs um modelo fora do catálogo e a sub-tarefa nasceu com ele
    function withBadModel() {
      const s = state();
      s.board.aiProfiles = s.board.aiProfiles.map((p) => ({ ...p, enabled: p.id === 'claude' }));
      s.board.aiTool = 'claude';
      s.board.modelCatalog = [haiku] as typeof s.board.modelCatalog;
      s.cardTypes = [{ id: 'sub', name: 'Sub-tarefa' }] as typeof s.cardTypes;
      s.fieldDefs = [{ id: 'modelo', name: 'Modelo', kind: 'model', appliesToTypes: null }] as typeof s.fieldDefs;
      s.fieldValues = [{ cardId: 'a', fieldId: 'modelo', value: 'claude:claude-haiku-5-5@medium' }] as typeof s.fieldValues;
      s.board.modelRules = [
        {
          id: 'r',
          name: 'r',
          enabled: true,
          groups: [[{ fieldId: '@type', op: 'is', value: 'Sub-tarefa' }]],
          model: 'claude:claude-haiku-5-5@medium',
        },
      ];
      s.cards[2]!.columnId = 'finished';
      s.cards[3]!.columnId = 'finished';
      return s;
    }
    const failure = 'Não foi possível iniciar a execução: O modelo "claude:claude-haiku-5-5" não está no catálogo de Claude Code.';
    it('diz o motivo real e onde corrigir o modelo, inclusive a regra que o sugeriu', () => {
      const s = withBadModel();
      const a = s.cards[1]!;
      const failed = {
        byCard: new Map([
          ['a', { state: 'failed' as const, key: workKey('subtask', s, story, a), kind: 'subtask' as const, reason: failure }],
        ]),
      };
      const plan = storyPlan(s, story, failed, new Set());
      expect(plan.kind).toBe('paused');
      const reason = plan.kind === 'paused' ? plan.reason : '';
      expect(reason).toContain(`Motivo: ${failure}`);
      expect(reason).toContain('1. Para corrigir o modelo, abra #2 e, no campo Modelo, escolha um modelo da lista');
      expect(reason).toContain('"claude:claude-haiku-5-5@medium", não existe no catálogo do agente');
      expect(reason).toContain('2. Corrija também a regra de sugestão');
      expect(reason).toContain('3. Responda aqui');
      expect(reason).not.toContain('confira o ambiente');
    });
    it('volta a rodar quando a pessoa responde, em vez de bloquear a história de novo', () => {
      const s = withBadModel();
      const a = s.cards[1]!;
      const failed = {
        byCard: new Map([
          ['a', { state: 'failed' as const, key: workKey('subtask', s, story, a), kind: 'subtask' as const, reason: failure }],
        ]),
      };
      expect(storyPlan(s, story, failed, new Set())).toMatchObject({ kind: 'paused' });
      s.comments.push({ id: 'r', cardId: story.id, author: 'a', source: 'human', body: 'troquei o modelo', createdAt: 50, updatedAt: 50 });
      expect(storyPlan(s, story, failed, new Set())).toMatchObject({ kind: 'units', units: [{ cardId: 'a' }] });
    });
  });
  describe('nota do bloqueio sem repetição', () => {
    const say = (s: ReturnType<typeof state>, body: string, at: number, source: 'human' | 'ai' = 'ai', cardId = story.id) =>
      s.comments.push({ id: `m${at}`, cardId, author: source === 'ai' ? 'Faz AI' : 'a', source, body, createdAt: at, updatedAt: at });
    const reason = '#1 está parada: x\n\nPara destravar:\n1. y';
    it('a primeira vez vai para a conversa', () => {
      expect(blockNote(state(), story, reason)).toEqual({ note: reason, quiet: false });
    });
    it('a mesma nota, sem gesto da pessoa, só atualiza o motivo', () => {
      const s = state();
      say(s, reason, 10);
      say(s, 'Resultado de #2: concluída.', 20);
      expect(blockNote(s, story, reason)).toEqual({ note: reason, quiet: true });
    });
    it('depois de a pessoa agir, vem uma vez a versão que explica; depois, silêncio', () => {
      const s = state();
      say(s, reason, 10);
      say(s, 'feito', 20, 'human', 'a');
      const again = blockNote(s, story, reason);
      expect(again).toEqual({ note: repeatedBlockNote(story, reason), quiet: false });
      expect(again.note).toContain('continua parada pelo mesmo motivo');
      expect(again.note).toContain('O que costuma faltar');
      expect(again.note).toContain(reason);
      say(s, again.note, 30);
      say(s, 'de novo', 40, 'human');
      expect(blockNote(s, story, reason)).toMatchObject({ quiet: true });
    });
    it('tirar o bloqueio também conta como gesto da pessoa', () => {
      const s = state();
      say(s, reason, 10);
      const unblocked = { ...story, statusBy: s.currentUser, statusAt: 20 };
      expect(blockNote(s, unblocked, reason).quiet).toBe(false);
    });
    it('um motivo diferente vai para a conversa normalmente', () => {
      const s = state();
      say(s, reason, 10);
      expect(blockNote(s, story, 'outro motivo')).toEqual({ note: 'outro motivo', quiet: false });
    });
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

describe('sessão de contexto no plano da história', () => {
  const story = card('story', { columnId: 'doing', number: 1 });
  type Comment = ReturnType<typeof boardState>['comments'][number];
  const OLD = validBrief();
  function state() {
    const a = sub('a', story.id, 'todo', { number: 2, description: OLD });
    const b = sub('b', story.id, 'todo', { number: 3, description: validBrief() });
    const s = boardState({ cards: [story, a, b] });
    s.columns = s.columns.map((p) => ({ ...p, aiActive: p.id === 'doing' }));
    return s;
  }
  const request = (description: string) => contextReason({ description }, { summary: 'falta o arquivo', pending: 'o caminho do módulo' });
  const failedLive = (s: ReturnType<typeof state>, reason: string, extra: Record<string, unknown> = {}) => {
    const a = s.cards[1]!;
    return {
      byCard: new Map<string, never>([
        [a.id, { state: 'failed', key: workKey('subtask', s, story, a), kind: 'subtask', reason, updatedAt: 1, ...extra } as never],
      ]),
    };
  };
  const note = (s: ReturnType<typeof state>, cardId: string, at: number, body: string, source: 'human' | 'ai' = 'ai') =>
    s.comments.push({ id: `c${at}`, cardId, author: 'x', source, body, createdAt: at, updatedAt: at } as Comment);

  it('a sub-tarefa que pediu contexto abre a unidade story com a chave de contexto, antes da próxima', () => {
    const s = state();
    const plan = storyPlan(s, story, failedLive(s, request(OLD)), new Set());
    expect(plan).toMatchObject({ kind: 'units', units: [{ kind: 'story', cardId: story.id }] });
    const key = plan.kind === 'units' ? plan.units[0]!.key : '';
    expect(isContextKey(key)).toBe(true);
    expect(isBriefKey(key)).toBe(false);
  });
  it('falha comum (sem a marca) não abre a sessão de contexto: segue a parada de hoje', () => {
    const s = state();
    expect(storyPlan(s, story, failedLive(s, 'caiu a rede'), new Set())).toMatchObject({ units: [{ kind: 'subtask', cardId: 'b' }] });
  });
  it('descrição igual depois da sessão pausa a história, e a sessão que falhou também', () => {
    const s = state();
    const live = failedLive(s, request(OLD));
    const plan = storyPlan(s, story, live, new Set());
    const key = plan.kind === 'units' ? plan.units[0]!.key : '';
    const paused = storyPlan(s, story, live, new Set([key]));
    expect(paused).toMatchObject({ kind: 'paused' });
    expect(paused.kind === 'paused' && paused.reason).toContain('a descrição continua a mesma');
    const own = { state: 'failed' as const, key, kind: 'story' as const, updatedAt: 2 };
    const both = { byCard: new Map([...live.byCard, [story.id, own as never]]) };
    expect(storyPlan(s, story, both, new Set())).toMatchObject({ kind: 'paused' });
  });
  it('um gesto da pessoa na história devolve a sub-tarefa (a chave dela muda) em vez de repetir a sessão', () => {
    const s = state();
    const live = failedLive(s, request(OLD));
    const first = storyPlan(s, story, live, new Set());
    const key = first.kind === 'units' ? first.units[0]!.key : '';
    note(s, story.id, 50, 'complete a descrição', 'human');
    expect(storyPlan(s, story, live, new Set([key]))).toMatchObject({ kind: 'units', units: [{ kind: 'subtask', cardId: 'a' }] });
  });
  it('mais de MAX_CONTEXT_REQUESTS pedidos desde o gesto da pessoa pausa com o limite', () => {
    const s = state();
    const a = s.cards[1]!;
    const live = failedLive(s, request(OLD));
    for (let i = 1; i <= MAX_CONTEXT_REQUESTS; i++) note(s, a.id, i * 10, `${CONTEXT_MARK} (x): pedido ${i}`);
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'units', units: [{ kind: 'story' }] });
    note(s, a.id, 100, `${CONTEXT_MARK} (x): pedido extra`);
    const paused = storyPlan(s, story, live, new Set());
    expect(paused).toMatchObject({ kind: 'paused' });
    expect(paused.kind === 'paused' && paused.reason).toContain(`mais de ${MAX_CONTEXT_REQUESTS} vezes`);
    // a pessoa interveio: a contagem recomeça
    note(s, a.id, 200, 'segue', 'human');
    expect(storyPlan(s, story, failedLive(s, request(OLD)), new Set())).toMatchObject({ kind: 'units', units: [{ kind: 'story' }] });
  });
  it('a nota de contexto completado conta em handedBackAt e troca a workKey, mas não zera o teto', () => {
    const s = state();
    const a = s.cards[1]!;
    const before = workKey('subtask', s, story, a);
    note(s, a.id, 30, `${CONTEXT_DONE_MARK}: a descrição mudou; a sub-tarefa roda de novo.`);
    expect(handedBackAt(s, a)).toBe(30);
    expect(workKey('subtask', s, story, a)).not.toBe(before);
    // só a IA, e só abrindo com a marca
    note(s, a.id, 40, `${CONTEXT_DONE_MARK}: x`, 'human');
    note(s, a.id, 50, `Veja ${CONTEXT_DONE_MARK}`);
    expect(handedBackAt(s, a)).toBe(40);
  });
  it('rerun após a nota: a falha da chave antiga deixa de valer e a sub-tarefa volta a ser a próxima', () => {
    const s = state();
    const live = failedLive(s, request(OLD));
    note(s, s.cards[1]!.id, 30, `${CONTEXT_DONE_MARK}: a descrição mudou; a sub-tarefa roda de novo.`);
    expect(storyPlan(s, story, live, new Set())).toMatchObject({ kind: 'units', units: [{ kind: 'subtask', cardId: 'a' }] });
  });
  it('nunca reenvia a mesma descrição: o pedido repetido com o mesmo hash cai na chave já feita', () => {
    const s = state();
    const live = failedLive(s, request(OLD));
    const key = (storyPlan(s, story, live, new Set()) as { units: { key: string }[] }).units[0]!.key;
    // a sub-tarefa rodou de novo, pediu outra vez com a descrição que não mudou: mesma chave, pausa
    expect(storyPlan(s, story, failedLive(s, request(OLD)), new Set([key]))).toMatchObject({ kind: 'paused' });
    // com descrição nova o hash muda e a sessão é nova
    expect(storyPlan(s, story, failedLive(s, request(`${OLD}\n\nmais`)), new Set([key]))).toMatchObject({ kind: 'units' });
  });
  it('não sobrepõe a conferência de brief: a descrição inválida vem antes', () => {
    const s = state();
    s.cards[2]!.description = '';
    const plan = storyPlan(s, story, failedLive(s, request(OLD)), new Set());
    const key = plan.kind === 'units' ? plan.units[0]!.key : '';
    expect(isBriefKey(key)).toBe(true);
  });
  it('sub-tarefa com a pessoa não abre a sessão de contexto', () => {
    const s = state();
    s.cards[1]!.status = 'blocked';
    expect(storyPlan(s, story, failedLive(s, request(OLD)), new Set())).toMatchObject({ units: [{ kind: 'subtask', cardId: 'b' }] });
  });
});
