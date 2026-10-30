// Cenário de ponta a ponta da retentativa por falha transitória (história #1099): do `runner.start` até a
// conversa do card. Só o processo da CLI do Claude Code é falso: ele escreve a falha de rede no `stream-json`
// e sai com 1. O relógio é falso, para cobrir o backoff de 30 s, 2 min e 5 min.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { CONDUTOR_TOOLS, cardWorld, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  vi.useRealTimers();
  world?.dispose();
  world = undefined;
});

const INIT = '{"type":"system","subtype":"init","session_id":"s1","model":"claude-opus"}\n';
const NETWORK_ERROR =
  '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"API Error: fetch failed (ECONNRESET)","session_id":"s1"}\n';
const TOOL_CALL =
  '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}\n';
const OK = '{"type":"result","subtype":"success","is_error":false,"result":"Pronto","session_id":"s1"}\n';

/** `plan(n)` diz o que a n-ésima execução (de 1) faz; `replyOnOk` é o gesto que a execução boa faz no card. */
function fakeCli(plan: (n: number) => 'network' | 'tool-then-network' | 'ok', replyOnOk: () => void): { spawn: SpawnFn; calls: () => number } {
  let calls = 0;
  const spawn: SpawnFn = (_command, _cwd, out) => {
    const kind = plan(++calls);
    let exit: (code: number | null) => void = () => {};
    queueMicrotask(() => {
      out(INIT, 'stdout');
      if (kind === 'tool-then-network') out(TOOL_CALL, 'stdout');
      if (kind === 'ok') {
        replyOnOk();
        out(OK, 'stdout');
        exit(0);
      } else {
        out(NETWORK_ERROR, 'stdout');
        exit(1);
      }
    });
    return { kill: () => exit(143), onExit: (fn) => (exit = fn) };
  };
  return { spawn, calls: () => calls };
}
const status = (w: CardWorld) => w.router.snapshot().cards.find((c) => c.id === w.cardId)!.status;

describe('cenário: card cuja rede cai', () => {
  it('cai 2 vezes, espera 30 s e 2 min, e na terceira execução conclui', async () => {
    let w!: CardWorld;
    const cli = fakeCli(
      (n) => (n < 3 ? 'network' : 'ok'),
      () => w.router.handle({ type: 'comment.add', cardId: w.cardId, body: 'Feito.' }, { author: 'Claude Code', source: 'ai' }),
    );
    w = world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, spawn: cli.spawn });
    vi.useFakeTimers();
    await w.run();
    expect(cli.calls()).toBe(1);
    expect(w.comments().join('\n')).toContain('tentativa 1 de 3');
    expect(w.runner.usageHold(w.cardId)).toContain('Aguardando nova tentativa');
    expect(status(w)).not.toBe('blocked');

    // antes dos 30 s a segunda execução ainda não começou
    await vi.advanceTimersByTimeAsync(29_000);
    expect(cli.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(w.comments().join('\n')).toContain('tentativa 2 de 3'));
    expect(cli.calls()).toBe(2);

    await vi.advanceTimersByTimeAsync(120_000);
    await vi.waitFor(() => expect(w.comments()).toContain('Feito.'));
    await vi.waitFor(() => expect(w.runner.running).toHaveLength(0));
    expect(cli.calls()).toBe(3);
    expect(status(w)).not.toBe('blocked');
    expect(w.runner.usageHold(w.cardId)).toBeNull();
    expect(w.comments().join('\n')).not.toContain('esgotou');
  });

  it('falha transitória depois de uma chamada de ferramenta bloqueia sem repetir', async () => {
    const cli = fakeCli(() => 'tool-then-network', () => {});
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, spawn: cli.spawn });
    vi.useFakeTimers();
    await world.run();
    expect(status(world)).toBe('blocked');
    expect(world.comments().join('\n')).toContain('a IA já agiu neste card');
    expect(world.runner.usageHold(world.cardId)).toBeNull();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(cli.calls()).toBe(1);
  });

  it('quatro falhas seguidas bloqueiam com 1 + 3 execuções', async () => {
    const cli = fakeCli(() => 'network', () => {});
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, spawn: cli.spawn });
    vi.useFakeTimers();
    await world.run();
    for (const wait of [30_000, 120_000, 300_000]) await vi.advanceTimersByTimeAsync(wait + 1_000);
    await vi.waitFor(() => expect(status(world!)).toBe('blocked'));
    expect(cli.calls()).toBe(4);
    const text = world.comments().join('\n');
    expect(text).toContain('esgotou as 3 tentativas');
    expect(text).toContain('tentativa 3 de 3');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(cli.calls()).toBe(4);
  });
});
