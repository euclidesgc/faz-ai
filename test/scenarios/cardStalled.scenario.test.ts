// Cenário de ponta a ponta do watchdog de execução sem eventos (história #1103): do `runner.start` até a
// conversa do card. Só o processo da ferramenta é falso: a CLI do Claude Code escreve o `system/init` e para
// de emitir. O board tem `runner.idleMinutes: 1` e o relógio é falso; passado o minuto, o gateway mata o
// processo, o card fica bloqueado (nunca aprovado nem avançado), a conversa traz o motivo próprio e o log
// de uso grava o desfecho `timeout`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { CONDUTOR_TOOLS, cardWorld, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  vi.useRealTimers();
  world?.dispose();
  world = undefined;
});

/** A CLI que escreve o init e para: só encerra quando o board a mata. */
const silentAfterInit: SpawnFn = (_command, _cwd, out) => {
  let exit: (code: number | null) => void = () => {};
  queueMicrotask(() => out('{"type":"system","subtype":"init","session_id":"s1","model":"claude-opus"}\n', 'stdout'));
  return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
};

describe('o card cuja ferramenta para de emitir é encerrado pelo watchdog', () => {
  it('bloqueia o card com o motivo próprio e grava o desfecho timeout', async () => {
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, spawn: silentAfterInit });
    world.router.handle({ type: 'settings.board.update', patch: { runner: { idleMinutes: 1 } } });
    const columnBefore = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!.columnId;

    vi.useFakeTimers();
    const running = world.run();
    // o init rearma o relógio; 59 s depois ainda está viva
    await vi.advanceTimersByTimeAsync(59_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const end = await running;

    expect(end.stalled).toBe(true);
    expect(end.timedOut).toBe(true);
    const card = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!;
    expect(card.status).toBe('blocked');
    expect(card.columnId).toBe(columnBefore);
    expect(world.comments().join('\n')).toContain('ficou sem atividade por 1 min');
    expect(world.comments().join('\n')).not.toContain('tempo limite');
    expect(world.aiRun()).toMatchObject({ outcome: 'timeout' });
    expect(world.lines.join('\n')).toContain('Encerrada por falta de atividade.');
  });
});
