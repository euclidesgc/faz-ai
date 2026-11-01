// Cenário de ponta a ponta da posição de partida da cadeia de fallback (#1100): um card no Claude Code, em modo
// autônomo, com a regra "Troca sozinho" opus → sonnet. A 1ª execução esgota o limite no `opus` e a regra troca para
// o `sonnet`; a 2ª (automática) já começa no `sonnet`, sem chamar o `opus`, e a conversa explica; depois da
// renovação do limite a 3ª volta ao `opus`. Só o processo da CLI é falso (ver cardWorld.ts).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const LIMITED = fs.readFileSync(path.join(FIXTURES, 'claude-stream-json-rate-limit.jsonl'), 'utf8');
const SUCCESS = fs.readFileSync(path.join(FIXTURES, 'claude-stream-json.jsonl'), 'utf8');

/** Antes da renovação gravada no fixture (2026-10-04 17:40 UTC) e depois dela. */
const BEFORE = Date.UTC(2026, 9, 4, 12, 0);
const AFTER = Date.UTC(2026, 9, 4, 18, 0);

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

/** O processo da CLI: o `opus` esgota o limite e sai com 1; qualquer outro modelo responde bem. */
const spawn: SpawnFn = (command, _cwd, out) => {
  let exit: (code: number | null) => void = () => {};
  const limited = modelOf(command.args) === 'opus';
  setTimeout(() => {
    out(limited ? LIMITED : SUCCESS, 'stdout');
    exit(limited ? 1 : 0);
  }, 5);
  return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
};

/** Uma execução automática do card (a manual testa o modelo pedido e não usa a posição de partida). */
const runAuto = (w: CardWorld): Promise<AiRunEnd> =>
  new Promise((resolve, reject) => {
    try {
      w.runner.start(w.cardId, { origin: 'autopilot', onExit: resolve });
    } catch (e) {
      reject(e);
    }
  });

describe('cenário: a execução seguinte começa no destino da cadeia de fallback', () => {
  it('opus esgota e a regra troca para sonnet; a 2ª começa no sonnet; depois da renovação volta ao opus', async () => {
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, permission: 'board', spawn });
    const w = world;
    const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
    w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value: 'claude:opus' });
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
    // os pedidos de reparo do bloco final (#1098) retomam a sessão no mesmo alvo: não são uma execução nova
    const starts = () => w.cliCommands.filter((c) => !c.args.includes('--resume'));
    const models = () => starts().map((c) => modelOf(c.args));

    // 1ª execução: o opus esgota o limite e a regra troca, na mesma execução, para o sonnet
    const first = await runAuto(w);
    expect(first.code).toBe(0);
    expect(models()).toEqual(['opus', 'sonnet']);
    expect(w.comments().some((b) => b.includes('esgotou o limite; a execução segue com'))).toBe(true);

    // 2ª execução do mesmo card: começa no sonnet, sem chamar o opus
    const before = starts().length;
    const second = await runAuto(w);
    expect(second.code).toBe(0);
    expect(models().slice(before)).toEqual(['sonnet']);
    const note = w.comments().find((b) => b.includes('a execução começa com'));
    expect(note).toMatch(
      /^O `Opus 5.5` está com o limite esgotado até as .+; a execução começa com `Sonnet 5.5` pela regra de fallback\.$/,
    );

    // depois da renovação do limite, a posição de partida não vale mais: volta ao opus
    vi.setSystemTime(AFTER);
    const mid = starts().length;
    await runAuto(w);
    expect(modelOf(starts()[mid]!.args)).toBe('opus');
  });
});
