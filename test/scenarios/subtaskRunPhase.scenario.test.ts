// Cenário do log de uso de uma sub-tarefa (plano de melhorias da 0.48.0, item A1): a execução da sub-tarefa grava
// como fase a fase da HISTÓRIA (a mesma dos trailers de commit), e a coluna da sub-tarefa ("A fazer") fica em
// `columnName`; o modo da execução vai em `runMode`. Até aqui o log gravava "A fazer"/"Em andamento" como fase, e
// 146 de 615 execuções da semana saíam das fases reais no `get_metrics`. Só o processo da CLI é falso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { monthOf } from '../../src/shared/log';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const until = (cond: () => boolean): Promise<void> => vi.waitFor(() => expect(cond()).toBe(true), { timeout: 5000, interval: 25 });

describe('cenário: a fase da execução de uma sub-tarefa no log de uso', () => {
  it('a linha de ai_runs da sub-tarefa leva a fase da história, a coluna da sub-tarefa à parte e o modo "phase"', async () => {
    let sub = '';
    world = await storyWorld((id, w) => {
      // a "IA" da sub-tarefa conclui o card pela ferramenta, como a real
      if (id !== sub) return;
      const s = w.router.snapshot();
      const c = s.cards.find((x) => x.id === id)!;
      const done = s.columns.find((x) => x.workflowId === c.workflowId && x.category === 'done')!;
      w.router.handle({ type: 'card.move', cardId: id, columnId: done.id, position: 0 }, { author: 'Claude Code', source: 'ai' });
    });
    sub = world.subtask('Sub-tarefa medida', validBrief());
    const before = world.router.snapshot();
    const story = before.cards.find((c) => c.id === world!.storyId)!;
    const storyColumn = before.columns.find((c) => c.id === story.columnId)!.name;
    const subColumn = before.columns.find((c) => c.id === before.cards.find((x) => x.id === sub)!.columnId)!.name;
    expect(subColumn).not.toBe(storyColumn);

    await world.orchestrator.drive(world.storyId, 'manual').catch(() => {});
    await world.orchestrator.settled();
    await until(() => world!.starts.includes(sub));
    const repo = new AiRunRepo(world.db);
    await until(() => repo.byMonth(monthOf(Date.now())).some((r) => r.cardId === sub && r.outcome !== null));

    const run = repo.byMonth(monthOf(Date.now())).find((r) => r.cardId === sub)!;
    expect(run).toMatchObject({ phase: storyColumn, columnName: subColumn, runMode: 'phase', workflow: 'Sub-tarefas' });
  });
});
