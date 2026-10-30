// Cenário da leitura de uso da cota (#1114): a CLI falsa emite um `rate_limit_event` com 86% da janela de 5 h. A 1ª
// execução automática grava a leitura e a 2ª já começa no `sonnet` (regra opus → sonnet), sem chamar o `opus`. Uma
// leitura velha (31 min), a falta de regra e a execução manual começam no `opus`. Só o processo da CLI é falso.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

const FIXTURES = path.join(__dirname, '..', 'fixtures');
// a resposta bem-sucedida com a janela de 5 h em 86% (no fixture ela vem em 40%)
const SUCCESS = fs
  .readFileSync(path.join(FIXTURES, 'claude-stream-json.jsonl'), 'utf8')
  .replace('"five_hour": {"utilization": 0.4,', '"five_hour": {"utilization": 0.86,');

/** Antes da renovação gravada no fixture (2026-10-04 17:40 UTC). */
const BEFORE = Date.UTC(2026, 9, 4, 12, 0);

let world: CardWorld | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BEFORE);
});
afterEach(() => {
  world?.dispose();
  world = undefined;
  vi.useRealTimers();
});

/** O modelo que o comando montado pede (`--model <x>`). */
const modelOf = (args: readonly string[]): string | null => {
  const at = args.indexOf('--model');
  return at < 0 ? null : (args[at + 1] ?? null);
};

/** O processo da CLI: qualquer modelo responde bem e informa 86% da janela de 5 h. */
const spawn: SpawnFn = (_command, _cwd, out) => {
  let exit: (code: number | null) => void = () => {};
  setTimeout(() => {
    out(SUCCESS, 'stdout');
    exit(0);
  }, 5);
  return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
};

/** Uma execução do card (a manual testa o modelo pedido e não usa a posição de partida). */
const run = (w: CardWorld, origin: 'autopilot' | 'manual'): Promise<AiRunEnd> =>
  new Promise((resolve, reject) => {
    try {
      w.runner.start(w.cardId, { origin, onExit: resolve });
    } catch (e) {
      reject(e);
    }
  });

const runAuto = (w: CardWorld) => run(w, 'autopilot');

/** O mundo do card no `opus`, em modo autônomo, com ou sem a regra "Troca sozinho" opus → sonnet. */
async function setup(withPolicy: boolean): Promise<CardWorld> {
  world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, permission: 'board', spawn });
  const w = world;
  const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value: 'claude:opus' });
  if (withPolicy)
    w.router.handle({
      type: 'settings.executionPolicy.save',
      expectedRevision: 0,
      reviewed: true,
      policy: {
        version: 1,
        id: 'opus-sonnet',
        name: 'Opus → Sonnet',
        enabled: true,
        priority: 10,
        conditions: {
          profileIds: ['claude'],
          models: ['opus'],
          actions: [],
          agentIds: [],
          phaseIds: [],
          cardTypeIds: [],
          origins: [],
          failures: ['quota'],
          explicit: 'include',
        },
        action: 'auto',
        targets: [{ profileId: 'claude', model: 'sonnet', effort: null }],
        limits: { maxAttempts: 2, maxElapsedMs: 60_000, backoffMs: 0, globalProcesses: 2, perProfile: { claude: 1 } },
      },
    });
  const story = w.router.snapshot().cards.find((c) => c.id === w.cardId)!;
  w.router.handle({ type: 'card.yolo.set', cardId: story.parentId ?? story.id, enabled: true });
  return w;
}

describe('cenário: a leitura de uso crítica começa a execução seguinte no reserva', () => {
  it('86% na 1ª execução: a 2ª começa no sonnet, sem chamar o opus, e a conversa explica', async () => {
    const w = await setup(true);
    await runAuto(w);
    expect(w.cliCommands.map((c) => modelOf(c.args))).toEqual(['opus']);
    const before = w.cliCommands.length;
    await runAuto(w);
    expect(w.cliCommands.map((c) => modelOf(c.args)).slice(before)).toEqual(['sonnet']);
    const note = w.comments().find((b) => b.includes('a execução começa com'));
    expect(note).toMatch(
      /^O `Opus 5.5` está em 86% da janela de 5 h \(renova às .+\); a execução começa com `Sonnet 5.5` pela regra de fallback\.$/,
    );
  });

  it('a leitura de 31 min já não vale: começa no opus', async () => {
    const w = await setup(true);
    await runAuto(w);
    vi.setSystemTime(BEFORE + 31 * 60_000);
    const before = w.cliCommands.length;
    await runAuto(w);
    expect(modelOf(w.cliCommands[before]!.args)).toBe('opus');
  });

  it('sem regra de fallback: começa no opus', async () => {
    const w = await setup(false);
    await runAuto(w);
    const before = w.cliCommands.length;
    await runAuto(w);
    expect(modelOf(w.cliCommands[before]!.args)).toBe('opus');
  });

  it('a execução manual com leitura crítica começa no opus', async () => {
    const w = await setup(true);
    await runAuto(w);
    const before = w.cliCommands.length;
    await run(w, 'manual');
    expect(modelOf(w.cliCommands[before]!.args)).toBe('opus');
  });
});
