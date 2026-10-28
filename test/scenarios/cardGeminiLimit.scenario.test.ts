// Cenários de ponta a ponta do limite de uso do Gemini (épica "ferramenta por modo", história 12): um card no
// perfil `gemini`, nos três modos, em que a ferramenta devolve o limite. Do `runner.start` (plano, gateway,
// admissão, o transporte do modo, o leitor, a classificação `classifyGeminiFailure`) até o desfecho que o runner
// aplica: o card volta para a IA (não fica bloqueado), o perfil fica pausado até a hora que a falha diz, e a
// conversa explica até quando. Só a ponta externa é falsa (ver cardWorld.ts): a API HTTP no modo API, o agente
// ACP no ACP e o processo da CLI, que emite o `stream-json` gravado da 0.65.0, na CLI.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { LIMIT_SLACK_MS, canDispatch, limitClock, limitHolds, nextWallTime, pauseOf } from '../../src/shared/usageLimit';
import { FakeAgent } from '../fakes/acpAgent';
import { fakeGemini, type FakeGemini } from '../fakes/geminiServer';
import { cardWorld, CONDUTOR_TOOLS, GEMINI_MODEL, type CardWorld } from './cardWorld';

const KEY = 'AIzaChaveDoCenarioLimite-nunca-no-board-444555';
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const LIMIT = 'O limite de uso de';

/**
 * O relógio do cenário, congelado (só o `Date`; os temporizadores seguem reais, que o servidor HTTP e o agente
 * falso usam): 1º/11/2026 10:00 no Pacífico, o dia de 25 h do fim do horário de verão, em que a meia-noite seguinte
 * calculada por "+24 h" caía no passado. A renovação da cota diária é a meia-noite de 2/11 PST (08:00 UTC).
 */
const NOW = Date.UTC(2026, 10, 1, 18, 0);
const PACIFIC_MIDNIGHT = Date.UTC(2026, 10, 2, 8, 0);

let world: CardWorld | undefined;
let server: FakeGemini | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(async () => {
  world?.dispose();
  world = undefined;
  await server?.close();
  server = undefined;
  vi.useRealTimers();
});

/** A próxima meia-noite do Pacífico depois de `now`: quando a cota diária do Gemini renova. */
const nextPacificMidnight = (now: number) => {
  const at = nextWallTime(0, 0, 'America/Los_Angeles', now);
  // o relógio congelado: a conta do código e a esperada à mão têm de bater
  expect(at).toBe(PACIFIC_MIDNIGHT);
  return at;
};

/** O desfecho que o runner aplica no limite, o mesmo nos três modos. */
function expectPaused(w: CardWorld, _statusBefore: string | null, resumeAt: { min: number; max: number }) {
  const card = w.router.snapshot().cards.find((c) => c.id === w.cardId)!;
  const pause = pauseOf(w.router.snapshot(), 'gemini');
  expect(pause).toMatchObject({ profileId: 'gemini', source: 'reset', attempts: 0 });
  expect(pause!.resumeAt).toBeGreaterThanOrEqual(resumeAt.min);
  expect(pause!.resumeAt).toBeLessThanOrEqual(resumeAt.max);
  const clock = limitClock(pause!.resumeAt, Date.now());
  // a pessoa está no circuito e há outro agente que responde (o Claude do mundo): o card pergunta como seguir
  expect(card.status).toBe('waiting_answer');
  expect(card.questions).toHaveLength(1);
  expect(card.questions[0]!.options[0]).toBe(`Esperar o limite voltar (às ${clock})`);
  expect(card.questions[0]!.options.slice(1).every((o) => o.startsWith('Seguir com '))).toBe(true);
  // a conversa diz até quando, no relógio da pausa gravada
  const comment = w.comments().find((b) => b.startsWith(LIMIT));
  expect(comment).toContain(`ficam pausadas até as ${clock}`);
  expect(w.lines.some((l) => l.includes('Perfil Gemini') && l.includes('pausado pelo limite de uso'))).toBe(true);
  return pause!;
}

/** O perfil do Gemini no modo API sem passar pelo Conectar (o cenário do Conectar está em cardApi.scenario). */
function apiProfile(w: CardWorld) {
  w.router.handle({ type: 'settings.aiProfiles.setEnabled', id: 'gemini', enabled: true });
  w.router.setProfileMode('gemini', 'api');
  w.keys.set('gemini', KEY);
  w.router.handle({ type: 'settings.models.set', catalog: [...w.router.snapshot().board.modelCatalog, GEMINI_MODEL] });
  const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value: GEMINI_MODEL.id });
}

describe('cenário: o Gemini esgota o limite de uso, nos três modos', () => {
  it('a resposta da pessoa: seguir com outro modelo grava no campo Modelo do card; esperar deixa o modelo como está', async () => {
    const daily = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gemini-api-429-daily.json'), 'utf8'));
    server = await fakeGemini(() => ({ status: 429, json: daily }));
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    const w = world;
    apiProfile(w);
    const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
    const modelOf = () => w.router.snapshot().fieldValues.find((v) => v.cardId === w.cardId && v.fieldId === field.id)?.value;
    const card = () => w.router.snapshot().cards.find((c) => c.id === w.cardId)!;
    const answer = (text: string) =>
      w.router.handle({
        type: 'card.questions.answer',
        cardId: w.cardId,
        answers: [{ questionId: card().questions[0]!.id, text, custom: false }],
      });

    await w.run();
    const [wait, other] = card().questions[0]!.options;
    expect(other).toMatch(/^Seguir com .+ \(Claude Code\)$/);
    answer(other!);

    expect(card()).toMatchObject({ status: 'ready', questions: [] });
    expect(modelOf()).toMatch(/^claude:/);
    expect(w.comments().at(-1)).toMatch(/escolheu: seguir com .+ O campo Modelo do card foi trocado, e o card voltou para a fila\.$/);
    // a resposta é uma decisão de execução: não entra em "Perguntas e respostas" da descrição
    expect(card().description).not.toContain('esgotou o limite de uso');

    // de novo no Gemini: agora a pessoa espera, e o modelo do card não muda
    w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value: GEMINI_MODEL.id });
    await w.run();
    expect(card().questions[0]!.options[0]).toBe(wait);
    answer(wait!);
    expect(card()).toMatchObject({ status: 'ready', questions: [] });
    expect(modelOf()).toBe(GEMINI_MODEL.id);
    expect(w.comments().at(-1)).toContain('escolheu esperar o limite voltar');
  });

  it('no modo autônomo não há pergunta: o card volta para a IA e o perfil pausa', async () => {
    const daily = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gemini-api-429-daily.json'), 'utf8'));
    server = await fakeGemini(() => ({ status: 429, json: daily }));
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    apiProfile(world);
    const story = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!;
    world.router.handle({ type: 'card.yolo.set', cardId: story.parentId ?? story.id, enabled: true });
    const before = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!.status;

    await world.run();

    const card = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!;
    expect(card.questions).toEqual([]);
    expect(card.status).toBe(before);
    expect(pauseOf(world.router.snapshot(), 'gemini')).not.toBeNull();
    expect(world.comments().some((b) => b.startsWith('O limite de uso do plano do'))).toBe(true);
  });

  it('API: o 429 por minuto (RetryInfo 41s) pausa o perfil por pouco tempo, sem nova tentativa', async () => {
    const minute = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gemini-api-429-minute.json'), 'utf8'));
    server = await fakeGemini(() => ({ status: 429, json: minute }));
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    apiProfile(world);
    const before = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!.status;

    const started = Date.now();
    const end = await world.run();
    const ended = Date.now();

    expect(end.code).toBe(1);
    expect(end.report).toMatchObject({ usageLimitReached: true, usageLimitHint: { retryAfterMs: 41_000 } });
    // um pedido só: o board não tenta de novo às cegas, a fila é que volta depois da pausa
    expect(server.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect(world.aiRun()).toMatchObject({ tool: 'gemini', mode: 'api' });
    expectPaused(world, before, {
      min: started + 41_000 + LIMIT_SLACK_MS,
      max: ended + 41_000 + LIMIT_SLACK_MS + 1000,
    });
    // a chave não vai para a conversa nem para o canal
    expect(world.lines.join('\n')).not.toContain(KEY);
    expect(world.comments().join('\n')).not.toContain(KEY);
  });

  it('API: o 429 da cota diária pausa até a meia-noite do Pacífico, não pelo retryDelay curto', async () => {
    const daily = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gemini-api-429-daily.json'), 'utf8'));
    server = await fakeGemini(() => ({ status: 429, json: daily }));
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    apiProfile(world);
    const before = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!.status;

    const started = Date.now();
    await world.run();

    const midnight = nextPacificMidnight(started) + LIMIT_SLACK_MS;
    expectPaused(world, before, { min: midnight, max: midnight });
  });

  it('ACP: o session/prompt devolve 429 com a cota diária; o perfil pausa até a meia-noite do Pacífico', async () => {
    const agent = new FakeAgent({
      onPrompt: (a) => a.rejectPrompt({ code: 429, message: 'You have exhausted your daily quota on this model.' }),
    });
    world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn });
    const before = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!.status;

    const started = Date.now();
    const end = await world.run();

    expect(agent.methods()).toContain('session/prompt');
    expect(end.code).toBe(1);
    expect(end.report).toMatchObject({ usageLimitReached: true, usageLimitHint: { dailyResetZone: 'America/Los_Angeles' } });
    expect(world.aiRun()).toMatchObject({ tool: 'gemini', mode: 'acp' });
    const midnight = nextPacificMidnight(started) + LIMIT_SLACK_MS;
    expectPaused(world, before, { min: midnight, max: midnight });
  });

  it('ACP: o 429 sem horário ("Rate limit exceeded") pausa pelo backoff de 5 minutos', async () => {
    const agent = new FakeAgent({ onPrompt: (a) => a.rejectPrompt({ code: 429, message: 'Rate limit exceeded. Try again later.' }) });
    world = await cardWorld({ profile: 'gemini', tools: CONDUTOR_TOOLS, spawnAcp: agent.spawn });

    const started = Date.now();
    await world.run();
    const ended = Date.now();

    const pause = pauseOf(world.router.snapshot(), 'gemini');
    expect(pause).toMatchObject({ source: 'backoff', attempts: 1 });
    expect(pause!.resumeAt).toBeGreaterThanOrEqual(started + 5 * 60_000);
    expect(pause!.resumeAt).toBeLessThanOrEqual(ended + 5 * 60_000);
    expect(world.comments().some((b) => b.startsWith(LIMIT))).toBe(true);
  });

  it('CLI: o result de erro gravado da 0.65.0 (cota diária) pausa até a meia-noite do Pacífico', async () => {
    const lines = fs.readFileSync(path.join(FIXTURES, 'gemini-stream-json-quota.jsonl'), 'utf8');
    // o processo da CLI: emite a fixture em pedaços e sai com 1, como a 0.65.0 na cota esgotada
    const spawn: SpawnFn = (_command, _cwd, out) => {
      let exit: (code: number | null) => void = () => {};
      setTimeout(() => {
        for (let i = 0; i < lines.length; i += 97) out(lines.slice(i, i + 97), 'stdout');
        exit(1);
      }, 5);
      return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
    };
    world = await cardWorld({ profile: 'gemini-cli', tools: ['Read'], permission: 'board', spawn });
    world.keys.set('gemini', KEY);
    const before = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!.status;

    const started = Date.now();
    const end = await world.run();

    expect(end.report).toMatchObject({ usageLimitReached: true, usageLimitHint: { dailyResetZone: 'America/Los_Angeles' } });
    expect(world.aiRun()).toMatchObject({ tool: 'gemini', mode: 'cli' });
    const midnight = nextPacificMidnight(started) + LIMIT_SLACK_MS;
    expectPaused(world, before, { min: midnight, max: midnight });
    // a pausa é do perfil: o Claude Code segue despachável pelo heartbeat e pelo autopiloto, o Gemini espera
    const state = world.router.snapshot();
    expect(canDispatch(state, 'gemini', Date.now())).toBe(false);
    expect(canDispatch(state, 'claude', Date.now())).toBe(true);
    expect(limitHolds(state, 'claude', Date.now())).toBe(false);
  });

  it('CLI: o aviso de nova tentativa da CLI numa execução que terminou bem não pausa, e encerra a pausa anterior', async () => {
    const lines = fs.readFileSync(path.join(FIXTURES, 'gemini-stream-json.jsonl'), 'utf8');
    // a CLI avisa a tentativa que esbarrou no 429 e, na seguinte, termina bem (a fixture gravada de sucesso)
    const spawn: SpawnFn = (_command, _cwd, out) => {
      let exit: (code: number | null) => void = () => {};
      setTimeout(() => {
        out('Attempt 1 failed with status 429. Quota exceeded for metric x. Please retry in 2s. Retrying with backoff...\n', 'stderr');
        for (let i = 0; i < lines.length; i += 97) out(lines.slice(i, i + 97), 'stdout');
        exit(0);
      }, 5);
      return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
    };
    world = await cardWorld({ profile: 'gemini-cli', tools: ['Read', 'Grep', 'Glob'], permission: 'board', spawn });
    world.keys.set('gemini', KEY);
    // uma pausa de antes (a execução de teste depois do vencimento é esta)
    world.router.recordUsageLimit('gemini', null, Date.now() - 10 * 60_000);
    expect(pauseOf(world.router.snapshot(), 'gemini')).not.toBeNull();

    const end = await world.run();

    expect(end.code).toBe(0);
    expect(end.report.usageLimitReached).toBe(false);
    expect(pauseOf(world.router.snapshot(), 'gemini')).toBeNull();
    expect(world.comments().some((b) => b.startsWith(LIMIT))).toBe(false);
  });

  it('API com política de quota: o Pro esgota e a execução segue no Flash, sem pausar o perfil', async () => {
    const minute = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'gemini-api-429-minute.json'), 'utf8'));
    server = await fakeGemini((body, _n, url) =>
      url.includes(`/models/${GEMINI_MODEL.model}:`)
        ? { status: 429, json: minute }
        : { json: { candidates: [{ content: { role: 'model', parts: [{ text: 'Feito no Flash.' }] }, finishReason: 'STOP' }] } },
    );
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    apiProfile(world);
    const flash = { ...GEMINI_MODEL, id: 'gemini:gemini-2.5-flash', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' };
    world.router.handle({ type: 'settings.models.set', catalog: [...world.router.snapshot().board.modelCatalog, flash] });
    world.router.handle({
      type: 'settings.executionPolicy.save',
      expectedRevision: 0,
      reviewed: true,
      policy: {
        version: 1,
        id: 'gemini-quota',
        name: 'Cota do Gemini',
        enabled: true,
        priority: 10,
        conditions: {
          profileIds: ['gemini'],
          models: [GEMINI_MODEL.model],
          actions: [],
          agentIds: [],
          phaseIds: [],
          cardTypeIds: [],
          origins: [],
          failures: ['quota'],
          explicit: 'include',
        },
        action: 'auto',
        targets: [{ profileId: 'gemini', model: 'gemini-2.5-flash', effort: null }],
        limits: { maxAttempts: 2, maxElapsedMs: 60_000, backoffMs: 0, globalProcesses: 2, perProfile: { gemini: 1 } },
      },
    });

    // no modo autônomo a regra troca sozinha; com a pessoa no circuito, o card pergunta (ver o cenário seguinte)
    const story = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!;
    world.router.handle({ type: 'card.yolo.set', cardId: story.parentId ?? story.id, enabled: true });
    const end = await world.run();

    const posts = server.requests.filter((r) => r.method === 'POST').map((r) => r.url);
    expect(posts).toEqual([`/v1beta/models/${GEMINI_MODEL.model}:generateContent`, '/v1beta/models/gemini-2.5-flash:generateContent']);
    expect(end.code).toBe(0);
    expect(world.lines.some((l) => l.includes('Política de execução: fallback'))).toBe(true);
    expect(world.comments().find((b) => b.includes('esgotou o limite; a execução segue com'))).toMatch(/2\.5 Pro.*2\.5 Flash/);
    // a política trocou o alvo: o perfil não fica pausado
    expect(pauseOf(world.router.snapshot(), 'gemini')).toBeNull();
  });

  it('a chave recusada não é limite: o card fica bloqueado com a causa, sem pausa', async () => {
    server = await fakeGemini(() => ({
      status: 400,
      json: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } },
    }));
    world = await cardWorld({ profile: 'gemini-api', tools: CONDUTOR_TOOLS, permission: 'board', api: { endpoint: server.endpoint } });
    apiProfile(world);

    const end = await world.run();

    expect(end.report.usageLimitReached).toBe(false);
    expect(pauseOf(world.router.snapshot(), 'gemini')).toBeNull();
    expect(world.router.snapshot().cards.find((c) => c.id === world!.cardId)?.status).toBe('blocked');
    expect(world.comments().some((b) => b.startsWith(LIMIT))).toBe(false);
  });
});
