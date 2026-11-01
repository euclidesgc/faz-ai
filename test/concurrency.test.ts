import { describe, expect, it } from 'vitest';
import { MAINTENANCE_LIMIT, mapLimit } from '../src/extension/concurrency';

/** Uma promessa que o teste resolve quando quiser. */
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mapLimit', () => {
  it('o teto da manutenção é 4, fixo e independente do board', () => {
    expect(MAINTENANCE_LIMIT).toBe(4);
  });

  it('com 10 tarefas, no máximo 4 ficam em andamento ao mesmo tempo, e todas rodam (RF5)', async () => {
    const gates = Array.from({ length: 10 }, () => deferred<number>());
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const done = mapLimit(gates, MAINTENANCE_LIMIT, async (g, i) => {
      started.push(i);
      running++;
      peak = Math.max(peak, running);
      const v = await g.promise;
      running--;
      return v;
    });
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);
    // libera uma de cada vez, fora de ordem: a vaga aberta é ocupada pela próxima
    for (const i of [2, 0, 3, 1, 5, 4, 9, 6, 8, 7]) {
      gates[i]!.resolve(i * 10);
      await flush();
    }
    const out = await done;
    expect(peak).toBe(4);
    expect(started).toHaveLength(10);
    // a ordem do resultado é a da entrada, não a de término
    expect(out).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it('com a lista vazia, resolve [] sem chamar nada', async () => {
    let calls = 0;
    expect(await mapLimit([], 4, async () => ++calls)).toEqual([]);
    expect(calls).toBe(0);
  });

  it('um limite menor que 1 vale 1: uma tarefa por vez', async () => {
    let running = 0;
    let peak = 0;
    await mapLimit([1, 2, 3], 0, async () => {
      running++;
      peak = Math.max(peak, running);
      await flush();
      running--;
    });
    expect(peak).toBe(1);
  });

  it('uma rejeição de fn rejeita o mapLimit', async () => {
    await expect(
      mapLimit([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('falhou');
        return n;
      }),
    ).rejects.toThrow('falhou');
  });
});
