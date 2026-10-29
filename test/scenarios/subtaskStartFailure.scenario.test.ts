// Cenário da sub-tarefa que não consegue nem começar (modelo fora do catálogo): o caminho real do orquestrador até
// a conversa da história. A conversa diz o motivo e os passos, não repete a mesma mensagem e, depois que a pessoa
// responde, a sub-tarefa roda de novo. Só o processo da CLI é falso.
import { afterEach, describe, expect, it } from 'vitest';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const BAD_MODEL = 'claude:claude-haiku-5-5@medium';

function setModel(w: StoryWorld, cardId: string, value: string): void {
  const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  w.router.handle({ type: 'field.setValue', cardId, fieldId: field.id, value }, { author: 'Fixture', source: 'ai' });
}
function reply(w: StoryWorld, body: string): void {
  w.router.handle({ type: 'comment.add', cardId: w.storyId, body }, { author: 'Pessoa', source: 'human' });
}
async function drive(w: StoryWorld): Promise<void> {
  // o drive que chega a iniciar a unidade relança o erro da partida; o resultado vai para a conversa
  await w.orchestrator.drive(w.storyId, 'manual').catch(() => {});
  await w.orchestrator.settled();
  await w.orchestrator.drive(w.storyId, 'manual').catch(() => {});
  await w.orchestrator.settled();
}
const parada = (w: StoryWorld) => w.storyComments().filter((c) => c.includes('está parada'));

describe('cenário: sub-tarefa com modelo fora do catálogo', () => {
  it('a conversa traz o motivo real e os passos, e não repete a nota sem gesto da pessoa', async () => {
    world = await storyWorld(() => {});
    const sub = world.subtask('Documentação', validBrief());
    setModel(world, sub, BAD_MODEL);
    await drive(world);
    expect(world.story().status).toBe('blocked');
    const result = world.storyComments().find((c) => c.startsWith('Resultado de'))!;
    expect(result).toContain('não está no catálogo');
    expect(result).not.toContain('confira o ambiente');
    expect(parada(world)).toHaveLength(1);
    expect(parada(world)[0]).toContain('Para destravar:');
    expect(parada(world)[0]).toContain('no campo Modelo, escolha um modelo da lista');
    // um novo drive sem nada mudar não empilha outra mensagem igual
    const before = world.storyComments().length;
    await drive(world);
    expect(world.storyComments()).toHaveLength(before);
    expect(world.story().status).toBe('blocked');
  });

  it('depois da resposta da pessoa a sub-tarefa roda de novo; se parar igual, vem a versão que explica, uma vez', async () => {
    world = await storyWorld(() => {});
    const sub = world.subtask('Documentação', validBrief());
    setModel(world, sub, BAD_MODEL);
    await drive(world);
    const tries = () => world!.storyComments().filter((c) => c.startsWith('Resultado de')).length;
    expect(tries()).toBe(1);
    reply(world, 'Pode tentar de novo.');
    await drive(world);
    // a resposta devolveu a vez: houve outra tentativa, e a nota agora explica o que falta
    expect(tries()).toBe(2);
    const notes = parada(world);
    expect(notes.at(-1)).toContain('continua parada pelo mesmo motivo');
    expect(notes.at(-1)).toContain('O que costuma faltar');
    const before = world.storyComments().length;
    await drive(world);
    expect(world.storyComments()).toHaveLength(before);
  });

  it('com o modelo corrigido e a resposta da pessoa, a sub-tarefa inicia', async () => {
    world = await storyWorld(() => {});
    const sub = world.subtask('Documentação', validBrief());
    setModel(world, sub, BAD_MODEL);
    await drive(world);
    expect(world.starts.filter((id) => id === sub)).toHaveLength(1);
    setModel(world, sub, '');
    reply(world, 'Troquei o modelo.');
    await drive(world);
    expect(world.starts.filter((id) => id === sub).length).toBeGreaterThanOrEqual(2);
    expect(
      world
        .storyComments()
        .filter((c) => c.startsWith('Resultado de'))
        .at(-1),
    ).not.toContain('não está no catálogo');
  });
});
