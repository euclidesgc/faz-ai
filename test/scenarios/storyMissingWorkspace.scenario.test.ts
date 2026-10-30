// Cenário da história em modo autônomo cuja worktree foi apagada (limpeza depois do merge): o caminho real do
// autopiloto ao orquestrador até a conversa. Antes, o ENOENT da pasta voltava ao autopiloto, a nota da recusa
// mudava o board e ele chamava a IA de novo na hora, várias vezes por segundo. Só o processo da CLI é falso.
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Autopilot } from '../../src/extension/autopilot';
import { missingWorkspaceNote } from '../../src/extension/orchestrator';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

describe('cenário: história em modo autônomo sem a pasta de trabalho', () => {
  it('a história para com o motivo na conversa, e o autopiloto chama a IA uma vez só', async () => {
    let gone = '';
    world = await storyWorld(
      () => {},
      () => gone,
    );
    gone = path.join(world.root, 'worktree-apagada');
    world.subtask('Implementar', validBrief());
    world.router.handle({ type: 'card.yolo.set', cardId: world.storyId, enabled: true });
    const logs: string[] = [];
    const autopilot = new Autopilot(world.router, world.runner, {
      log: (l) => logs.push(l),
      driver: world.orchestrator,
      defer: (f) => f(),
    });
    autopilot.resume();
    for (let i = 0; i < 5; i++) {
      await world.orchestrator.settled();
      autopilot.evaluate();
    }
    expect(world.story().status).toBe('blocked');
    expect(world.storyComments().filter((c) => c.includes(missingWorkspaceNote(gone)))).toHaveLength(1);
    expect(logs.filter((l) => l.includes('chamando a IA'))).toHaveLength(1);
    expect(world.starts).toEqual([]);
    expect(world.router.work.live()).toEqual([]);
  });
});
