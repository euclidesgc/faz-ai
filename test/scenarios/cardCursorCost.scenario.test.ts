// Cenário de ponta a ponta do custo em US$ de uma execução do Cursor: a CLI informa os tokens e nenhum custo, o
// modelo do catálogo tem preço, e o gateway estima o total e os buckets. Do `runner.start` até a linha de consumo
// do canal de log e as colunas de `ai_runs`; a regra "Mostrar custo em dólar" só esconde o US$ da linha. Só o
// processo da CLI é falso (ver cardWorld.ts).
import { afterEach, describe, expect, it } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { monthOf } from '../../src/shared/log';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

const SESSION = '9356450d-ec17-46dd-93d5-fc15f3bf4190';

/** O que o cursor-agent escreve ao terminar: o `usage` da fixture real, sem custo. */
const answering: SpawnFn = (_command, _cwd, out) => {
  let exit: (code: number | null) => void = () => {};
  setTimeout(() => {
    out(
      JSON.stringify({ type: 'system', subtype: 'init', apiKeySource: 'login', cwd: '/projeto', session_id: SESSION, model: 'Auto' }) +
        '\n',
      'stdout',
    );
    out(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        duration_ms: 100,
        duration_api_ms: 100,
        is_error: false,
        result: 'feito',
        session_id: SESSION,
        usage: { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 2_000_000, cacheWriteTokens: 0 },
      }) + '\n',
      'stdout',
    );
    exit(0);
  }, 5);
  return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
};

// 1M × 3 + 0,1M × 15 + 2M × 0,3 = 3 + 1,5 + 0,6
const PRICING = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

const consumption = (w: CardWorld) => w.lines.find((l) => /Consumo/.test(l));

describe('cenário: o custo estimado de uma execução do Cursor', () => {
  it('com a regra ligada (padrão): a linha traz "US$ … (estimado)" e ai_runs guarda os buckets', async () => {
    world = await cardWorld({ profile: 'cursor', tools: CONDUTOR_TOOLS, permission: 'board', spawn: answering, cursorPricing: PRICING });

    await world.run();

    expect(consumption(world)).toContain('US$ 5,10 (estimado)');
    const run = new AiRunRepo(world.db).byMonth(monthOf(Date.now())).at(-1)!;
    expect(run.costUsd).toBeCloseTo(5.1);
    expect(run.costEstimated).toBe(true);
    expect(run.costBuckets).toMatchObject({ input: 3, cacheWrite: 0 });
    expect(run.costBuckets!.output).toBeCloseTo(1.5);
    expect(run.costBuckets!.cacheRead).toBeCloseTo(0.6);
  });

  it('com a regra desligada: a linha não tem US$, mas o custo segue gravado', async () => {
    world = await cardWorld({ profile: 'cursor', tools: CONDUTOR_TOOLS, permission: 'board', spawn: answering, cursorPricing: PRICING });
    world.router.handle({ type: 'settings.rules.update', patch: { showCost: false } });

    await world.run();

    expect(consumption(world)).not.toContain('US$');
    expect(new AiRunRepo(world.db).byMonth(monthOf(Date.now())).at(-1)!.costUsd).toBeCloseTo(5.1);
  });

  it('sem preço no catálogo: nada de US$ nem custo inventado', async () => {
    world = await cardWorld({ profile: 'cursor', tools: CONDUTOR_TOOLS, permission: 'board', spawn: answering });

    await world.run();

    expect(consumption(world)).not.toContain('US$');
    expect(new AiRunRepo(world.db).byMonth(monthOf(Date.now())).at(-1)!.costUsd).toBeNull();
  });
});
