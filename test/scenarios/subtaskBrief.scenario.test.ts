// Cenário da conferência da descrição da sub-tarefa (#1138): o caminho real do orquestrador até a conversa da
// história. Só o processo da CLI é falso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});
const numberOf = (w: StoryWorld, id: string) => w.router.snapshot().cards.find((c) => c.id === id)!.number;

describe('cenário: descrição da sub-tarefa sem as seções', () => {
  it('recusa a sub-tarefa, abre a sessão da história e registra a nota com a seção que falta', async () => {
    world = await storyWorld(() => {});
    const sub = world.subtask('Sem seções', 'Só um texto solto.');
    const result = await world.orchestrator.drive(world.storyId, 'manual');
    expect(result.kind).toBe('started');
    await world.orchestrator.settled();
    expect(world.starts[0]).toBe(world.storyId);
    expect(world.starts).not.toContain(sub);
    const note = world.storyComments().find((c) => c.includes('Pronto quando'));
    expect(note).toContain(`#${numberOf(world, sub)}`);
  });

  it('a sessão corrige a descrição pelo router e a sub-tarefa roda em seguida, sem bloquear a história', async () => {
    let sub = '';
    world = await storyWorld((id, w) => {
      if (id === w.storyId)
        w.router.handle(
          { type: 'card.update', cardId: sub, patch: { description: validBrief() } },
          { author: 'Claude Code', source: 'ai' },
        );
    });
    sub = world.subtask('Sem seções', 'Só um texto solto.');
    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    await until(() => world!.starts.includes(sub));
    expect(world.starts.slice(0, 2)).toEqual([world.storyId, sub]);
    expect(world.story().status).not.toBe('blocked');
  });

  it('sem correção a história é bloqueada com o motivo e um novo drive não abre outra sessão', async () => {
    world = await storyWorld(() => {});
    const sub = world.subtask('Sem seções', 'Só um texto solto.');
    await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    await until(() => world!.story().status === 'blocked');
    expect(world.starts).toEqual([world.storyId]);
    expect(world.storyComments().join('\n')).toContain(`#${numberOf(world, sub)}`);
    const again = await world.orchestrator.drive(world.storyId, 'manual');
    await world.orchestrator.settled();
    expect(again.kind).toBe('paused');
    expect(world.starts).toEqual([world.storyId]);
  });

  it('o "Trabalhar" manual (runner.start direto) abre a execução sem conferir as seções', async () => {
    world = await storyWorld(() => {});
    const sub = world.subtask('Sem seções', null);
    const before = world.cliCommands.length;
    await new Promise((resolve) => world!.runner.start(sub, { origin: 'manual', onExit: resolve }));
    expect(world.cliCommands.length).toBe(before + 1);
  });
});

function until(cond: () => boolean): Promise<void> {
  return vi.waitFor(() => expect(cond()).toBe(true), { timeout: 5000, interval: 25 });
}
