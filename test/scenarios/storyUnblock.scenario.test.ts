// Cenário do desbloqueio pelo heartbeat: a sub-tarefa não consegue nem começar (modelo fora do catálogo) e o
// orquestrador bloqueia a história. A rodada do heartbeat chama a IA em modo de desbloqueio na história (a CLI falsa
// faz o papel da IA: corrige a causa e escreve na conversa), a história volta para a fila e, por causa da nota da
// tentativa (um gesto que muda a chave da sub-tarefa), o orquestrador roda a sub-tarefa de novo. A rodada seguinte,
// com o mesmo bloqueio já tentado, não chama a IA outra vez. Só o processo da CLI é falso.
import { afterEach, describe, expect, it } from 'vitest';
import { Heartbeat } from '../../src/extension/heartbeat';
import { isUnblockNote } from '../../src/shared/orchestration';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const BAD_MODEL = 'claude:claude-haiku-5-5@medium';
const AI = { author: 'Claude Code', source: 'ai' } as const;

function setModel(w: StoryWorld, cardId: string, value: string): void {
  const field = w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  w.router.handle({ type: 'field.setValue', cardId, fieldId: field.id, value }, AI);
}
async function drive(w: StoryWorld): Promise<void> {
  // o drive que chega a iniciar a unidade relança o erro da partida; o resultado vai para a conversa
  await w.orchestrator.drive(w.storyId, 'manual').catch(() => {});
  await w.orchestrator.settled();
  await w.orchestrator.drive(w.storyId, 'manual').catch(() => {});
  await w.orchestrator.settled();
}
const storyCard = (w: StoryWorld) => w.router.snapshot().cards.find((c) => c.id === w.storyId)!;
const notes = (w: StoryWorld) => w.router.snapshot().comments.filter((c) => c.cardId === w.storyId && isUnblockNote(c));

/** O heartbeat do board sobre o runner do cenário, como o `boardHost` o monta (o `start` passa pelo `starts` do cenário). */
function heartbeatOf(w: StoryWorld): Heartbeat {
  const runner = {
    get running() {
      return w.runner.running;
    },
    start: (id: string, origin: 'heartbeat' | 'manual' = 'heartbeat', mode?: 'unblock') => {
      w.starts.push(id);
      w.runner.start(id, { origin, mode });
    },
    stop: (id: string) => w.runner.stop(id),
    onDidFinish: (fn: (id: string) => void) => w.runner.onDidFinish((id) => fn(id)),
  };
  // o card avulso do cenário não entra na fila: a rodada só tem a história desta prova
  w.router.handle({ type: 'card.status.set', cardId: w.cardId, status: null });
  return new Heartbeat(runner as never, {
    driver: w.orchestrator,
    snapshot: () => w.router.snapshot(),
    now: () => Date.now(),
    log: (l) => w.lines.push(l),
    act: (m) => w.router.handle(m, { author: 'Faz AI', source: 'ai' }),
  });
}

describe('cenário: a rodada do heartbeat desbloqueia a história parada por uma sub-tarefa', () => {
  it('a IA corrige a causa, a história volta para a fila e a sub-tarefa roda de novo', async () => {
    let sub = '';
    // a CLI do desbloqueio: corrige o modelo da sub-tarefa (a causa) e registra o que fez na conversa da história
    world = await storyWorld((id, w) => {
      if (id !== w.storyId) return;
      setModel(w, sub, '');
      w.router.handle(
        { type: 'comment.add', cardId: w.storyId, body: 'O modelo da sub-tarefa estava fora do catálogo; usei o padrão.' },
        AI,
      );
    });
    const w = world;
    sub = w.subtask('Documentação', validBrief());
    setModel(w, sub, BAD_MODEL);
    await drive(w);
    expect(storyCard(w).status).toBe('blocked');
    expect(w.starts.filter((id) => id === sub)).toHaveLength(1);

    const heartbeat = heartbeatOf(w);
    expect(heartbeat.runNow()).toBe(1);
    await w.orchestrator.settled();
    await new Promise((r) => setTimeout(r, 20));

    // a execução foi o desbloqueio da história, e a nota da tentativa ficou na conversa dela
    expect(w.lines.some((l) => l.includes('Desbloquear'))).toBe(true);
    expect(notes(w)).toHaveLength(1);
    expect(w.storyComments()).toContain('O modelo da sub-tarefa estava fora do catálogo; usei o padrão.');
    expect(storyCard(w).status).not.toBe('blocked');

    // a nota devolve a vez à sub-tarefa: o orquestrador a roda de novo, agora com o modelo corrigido
    await drive(w);
    expect(w.starts.filter((id) => id === sub).length).toBeGreaterThanOrEqual(2);
    expect(
      w
        .storyComments()
        .filter((c) => c.startsWith('Resultado de'))
        .at(-1),
    ).not.toContain('não está no catálogo');
  });

  it('o bloqueio que a IA do desbloqueio mantém com block_card vale, e a rodada seguinte não repete a tentativa', async () => {
    world = await storyWorld((id, w) => {
      if (id !== w.storyId) return;
      // depois de a execução assumir o card (status "running") e antes de a CLI terminar
      queueMicrotask(() =>
        w.router.handle(
          { type: 'card.status.set', cardId: w.storyId, status: 'blocked', note: 'Preciso de uma credencial que só a pessoa tem.' },
          AI,
        ),
      );
    });
    const w = world;
    const sub = w.subtask('Documentação', validBrief());
    setModel(w, sub, BAD_MODEL);
    await drive(w);

    const heartbeat = heartbeatOf(w);
    expect(heartbeat.runNow()).toBe(1);
    await w.orchestrator.settled();
    await new Promise((r) => setTimeout(r, 20));
    expect(storyCard(w)).toMatchObject({ status: 'blocked', statusReason: 'Preciso de uma credencial que só a pessoa tem.' });
    expect(notes(w)).toHaveLength(1);

    // o motivo mudou (chave nova): há mais uma tentativa; depois dela o mesmo motivo já foi tentado e as rodadas
    // seguintes não chamam a IA para a história outra vez (podem resumir a conversa, que cresceu)
    for (let round = 0; round < 3; round++) {
      heartbeat.runNow();
      await w.orchestrator.settled();
      await new Promise((r) => setTimeout(r, 20));
    }
    const keys = notes(w).map((n) => /\((\w+)\)/.exec(n.body)![1]);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(storyCard(w)).toMatchObject({ status: 'blocked', statusReason: 'Preciso de uma credencial que só a pessoa tem.' });
  });
});
