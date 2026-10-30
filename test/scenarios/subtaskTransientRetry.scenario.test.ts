// Cenário da sub-tarefa da Implementação cuja rede cai (história #1099): o caminho real do orquestrador até a
// conversa da história. A primeira execução falha por rede sem deixar efeito; o orquestrador espera o backoff
// e a executa de novo, e a segunda conclui a sub-tarefa. Só o processo da CLI é falso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const NETWORK_ERROR = {
  stdout:
    '{"type":"system","subtype":"init","session_id":"s1","model":"claude-opus"}\n' +
    '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"API Error: fetch failed (ECONNRESET)","session_id":"s1","total_cost_usd":0,"usage":{"input_tokens":10,"output_tokens":0}}\n',
  code: 1,
};
const AI = { author: 'Claude Code', source: 'ai' } as const;

describe('cenário: sub-tarefa cuja rede cai na Implementação', () => {
  // BUG em src (devolvido ao condutor): depois do `retry-safe` por falha transitória o card da sub-tarefa fica com
  // status `running`, a unidade fica `waiting` e o `storyPlan` não a considera pronta ("aguardam dependências ou
  // liberação da posse"), então a segunda execução nunca começa. Troque `it.fails` por `it` quando corrigir.
  it.fails('a falha transitória sem efeito espera o backoff e a sub-tarefa roda de novo', async () => {
    let sub = '';
    world = await storyWorld((id, w) => {
      if (id !== sub) return;
      if (w.starts.filter((s) => s === sub).length === 1) return NETWORK_ERROR;
      // a segunda execução conclui a sub-tarefa, como o ciclo dela manda
      const s = w.router.snapshot();
      const card = s.cards.find((c) => c.id === sub)!;
      const done = s.columns.find((c) => c.workflowId === card.workflowId && c.category === 'done')!;
      w.router.handle({ type: 'card.move', cardId: sub, columnId: done.id, position: 0 }, AI);
    });
    sub = world.subtask('Documentação', validBrief());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    const runs = () => world!.starts.filter((s) => s === sub).length;
    expect(runs()).toBe(1);
    // ainda esperando: não foi bloqueada nem concluída
    expect(world.story().status).not.toBe('blocked');

    await vi.advanceTimersByTimeAsync(31_000);
    await world.orchestrator.settled();
    await vi.waitFor(() => expect(runs()).toBe(2));
    await world.orchestrator.settled();
    const card = world.router.snapshot().cards.find((c) => c.id === sub)!;
    const column = world.router.snapshot().columns.find((c) => c.id === card.columnId)!;
    expect(column.category).toBe('done');
    expect(world.story().status).not.toBe('blocked');
  });
});
