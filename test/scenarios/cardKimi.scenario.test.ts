// Cenários de ponta a ponta do Kimi Code (modo CLI), só com o processo da CLI falso (ver cardWorld.ts):
// 1. a cota esgotada, como a CLI 2.1.x–2.3.0 a escreve no `stderr` (o texto real das 28 execuções perdidas de
//    20/10/2026: `provider.api_error: 429 You've reached your 5-hour usage limit`), saindo com 1. Do `runner.start`
//    até o desfecho: o leitor liga o limite de uso pelo `stderr`, o card volta para a pessoa decidir, o perfil fica
//    pausado e a falha é classificada como `budget` (antes, o sinal não disparava e o autopiloto repetia a chamada
//    a cada poucos segundos);
// 2. a execução bem-sucedida da CLI 2.3.0 (a SAÍDA REAL de test/fixtures/kimi-stream-json-2.3.0.jsonl), com o
//    registro da sessão gravado na home falsa como a CLI grava (test/fixtures/kimi-session-wire.jsonl): os tokens
//    chegam a `ai_runs`, e o custo sai do preço do catálogo.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { monthOf } from '../../src/shared/log';
import { canDispatch, pauseOf } from '../../src/shared/usageLimit';
import { cardWorld, CONDUTOR_TOOLS, KIMI_MODEL, type CardWorld } from './cardWorld';

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const STREAM = fs.readFileSync(path.join(FIXTURES, 'kimi-stream-json-2.3.0.jsonl'), 'utf8');
const WIRE = fs.readFileSync(path.join(FIXTURES, 'kimi-session-wire.jsonl'), 'utf8');
/** o id de sessão do `session.resume_hint` da fixture */
const SESSION = 'session_0002-0000-4000-8000-000000000002';
const QUOTA =
  "error: failed to run prompt: provider.api_error: 429 You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends. To continue now, purchase extra usage or upgrade your plan: https://www.kimi.com/membership/subscription?tab=quota\nSee log: /home/pessoa/.kimi-code/logs/kimi-code.log\n";

/** O processo da CLI recusando por cota: a linha de versão no stdout, o erro no stderr, saída 1. */
const refusing: SpawnFn = (_command, _cwd, out) => {
  let exit: (code: number | null) => void = () => {};
  setTimeout(() => {
    out('{"role":"meta","type":"system.version","version":"2.3.0"}\n', 'stdout');
    out(QUOTA, 'stderr');
    exit(1);
  }, 5);
  return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
};

/** O processo da CLI respondendo bem: o `stream-json` real, saída 0. */
const answering: SpawnFn = (_command, _cwd, out) => {
  let exit: (code: number | null) => void = () => {};
  setTimeout(() => {
    out(STREAM, 'stdout');
    exit(0);
  }, 5);
  return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
};

/** Grava o registro da sessão na home falsa, no caminho em que a CLI o deixa. */
function writeSession(home: string, sessionId = SESSION): void {
  const dir = path.join(home, '.kimi-code', 'sessions', 'wd_projeto_0000000000ab', sessionId, 'agents', 'main');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'wire.jsonl'), WIRE);
}

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

describe('cenário: o Kimi Code esgota a cota (429 no stderr)', () => {
  it('o leitor liga o limite pelo stderr, o card volta para a pessoa, o perfil pausa e a falha é `budget`', async () => {
    world = await cardWorld({ profile: 'kimi', tools: CONDUTOR_TOOLS, permission: 'board', spawn: refusing });

    const end = await world.run();

    expect(world.cliCommands[0]!.command).toBe('kimi');
    expect(end.code).toBe(1);
    expect(end.report.usageLimitReached).toBe(true);
    expect(end.failureClass).toBe('budget');
    expect(world.aiRun()).toMatchObject({ tool: 'kimi', transport: 'cli', outcome: 'failed', failureClass: 'budget' });
    const card = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!;
    // a pessoa decide: esperar o limite voltar ou seguir com o Claude Code; o perfil Kimi fica pausado
    expect(card.status).toBe('waiting_answer');
    expect(card.questions[0]!.options[0]).toMatch(/^Esperar o limite voltar/);
    expect(pauseOf(world.router.snapshot(), 'kimi')).toMatchObject({ profileId: 'kimi', source: 'backoff' });
    expect(canDispatch(world.router.snapshot(), 'kimi', Date.now())).toBe(false);
    expect(canDispatch(world.router.snapshot(), 'claude', Date.now())).toBe(true);
    expect(world.lines.some((l) => l.includes('Perfil Kimi Code') && l.includes('pausado pelo limite de uso'))).toBe(true);
  });
});

describe('cenário: o Kimi Code responde e o board lê os tokens do registro da sessão', () => {
  it('os quatro pedidos da sessão viram os tokens de `ai_runs`, com o custo pelo preço do catálogo', async () => {
    world = await cardWorld({ profile: 'kimi', tools: CONDUTOR_TOOLS, permission: 'board', spawn: answering });
    writeSession(world.home);
    // US$ 1 por milhão em cada bucket: o custo é a soma dos tokens em milhões
    world.router.handle({
      type: 'settings.models.set',
      catalog: world.router
        .snapshot()
        .board.modelCatalog.map((m) =>
          m.id === KIMI_MODEL.id ? { ...m, pricing: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 } } : m,
        ),
    });

    const end = await world.run();

    expect(end.code).toBe(0);
    expect(end.report.measure).toBe('full');
    expect(end.report.consumption).toMatchObject({
      inputTokens: 36225,
      outputTokens: 611,
      cacheReadTokens: 104704,
      cacheWriteTokens: 0,
      turns: 4,
      sessionId: SESSION,
    });
    const run = world.aiRun()!;
    expect(run).toMatchObject({
      tool: 'kimi',
      outcome: 'done',
      measure: 'full',
      inputTokens: 36225,
      outputTokens: 611,
      cacheReadTokens: 104704,
    });
    expect(run.costUsd).toBeCloseTo((36225 + 611 + 104704) / 1_000_000);
    expect(run.costEstimated).toBe(true);
    // o inventário do stream segue junto
    expect(world.lines.some((l) => l.includes('hello from kimi'))).toBe(true);
  });

  it('sem o registro da sessão na home, a execução fica medida só pelo inventário (sem tokens inventados)', async () => {
    world = await cardWorld({ profile: 'kimi', tools: CONDUTOR_TOOLS, permission: 'board', spawn: answering });

    const end = await world.run();

    expect(end.code).toBe(0);
    expect(end.report.measure).toBe('partial');
    expect(end.report.consumption).toBeNull();
    expect(new AiRunRepo(world.db).byMonth(monthOf(Date.now())).at(-1)).toMatchObject({ measure: 'partial', inputTokens: null });
  });
});
