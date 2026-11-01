// Cenário do desfecho estruturado da sub-tarefa (#1109): do bloco final da resposta (NEEDS_CONTEXT, DONE_WITH_CONCERNS,
// BLOCKED) até a conversa, pelo orquestrador real. Só o processo da CLI é falso: a "IA" escreve o bloco na resposta e,
// quando é o caso, conclui o card pela ferramenta (card.move).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HeadlessCommand } from '../../src/extension/headless';
import { Heartbeat, unblockTargets } from '../../src/extension/heartbeat';
import { CONCERN_MARK, CONTEXT_DONE_MARK, CONTEXT_MARK } from '../../src/shared/subtaskOutcome';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type ProcessFailure, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const AI = { author: 'Claude Code', source: 'ai' } as const;
const promptOf = (c: HeadlessCommand): string => c.stdin ?? c.args.join(' ');
const until = (cond: () => boolean): Promise<void> => vi.waitFor(() => expect(cond()).toBe(true), { timeout: 5000, interval: 25 });
const card = (w: StoryWorld, id: string) => w.router.snapshot().cards.find((c) => c.id === id)!;

/** A resposta da CLI que termina bem, com o texto dado como resultado. */
const answer = (text: string): ProcessFailure => ({
  stdout: JSON.stringify({ type: 'result', subtype: 'success', result: text, usage: { input_tokens: 2, output_tokens: 1 } }) + '\n',
  code: 0,
});
const block = (b: Record<string, unknown>): ProcessFailure => answer(`Terminei.\n${JSON.stringify(b)}`);
const NEEDS = { outcome: 'NEEDS_CONTEXT', summary: 'falta o arquivo', pending: 'o caminho do módulo' };
const CONCERNS = { outcome: 'DONE_WITH_CONCERNS', summary: 'feito', pending: 'o teste de carga não rodou' };

function finish(w: StoryWorld, cardId: string): void {
  const s = w.router.snapshot();
  const c = s.cards.find((x) => x.id === cardId)!;
  const done = s.columns.find((x) => x.workflowId === c.workflowId && x.category === 'done')!;
  w.router.handle({ type: 'card.move', cardId, columnId: done.id, position: 0 }, AI);
}
async function drive(w: StoryWorld, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await w.orchestrator.drive(w.storyId, 'manual').catch(() => {});
    await w.orchestrator.settled();
  }
}
/**
 * O processo falso termina sem chamar a ferramenta e o card da sub-tarefa fica com status `running` (o mesmo que o
 * cenário `subtaskTransientRetry` documenta): o plano não o considera pronto. A pessoa/heartbeat o devolve à IA aqui.
 */
const release = (w: StoryWorld, id: string) => w.router.handle({ type: 'card.status.set', cardId: id, status: 'ready' }, AI);
const setDescription = (w: StoryWorld, cardId: string, description: string) =>
  w.router.handle({ type: 'card.update', cardId, patch: { description } }, AI);

describe('cenário: NEEDS_CONTEXT da sub-tarefa', () => {
  it('o condutor completa a descrição, a sub-tarefa roda de novo com ela e a nota de contexto fica na conversa', async () => {
    let sub = '';
    let runs = 0;
    world = await storyWorld((id, w) => {
      if (id === w.storyId) {
        setDescription(w, sub, `${validBrief()}\n\nO módulo é src/a.ts.`);
        return;
      }
      if (++runs === 1) return block(NEEDS);
      finish(w, id);
    });
    sub = world.subtask('Precisa de contexto', validBrief());
    await drive(world, 3);
    release(world, sub);
    await drive(world);
    await until(() => world!.starts.length >= 3);
    await world.orchestrator.settled();

    // sub-tarefa, condutor (descrição), sub-tarefa de novo
    expect(world.starts.slice(0, 3)).toEqual([sub, world.storyId, sub]);
    expect(promptOf(world.cliCommands[1]!)).toContain('o caminho do módulo');
    const comments = world.router
      .snapshot()
      .comments.filter((c) => c.cardId === sub)
      .map((c) => c.body);
    expect(comments.some((b) => b.includes(CONTEXT_MARK) && b.includes('o caminho do módulo'))).toBe(true);
    expect(comments.some((b) => b.includes(CONTEXT_DONE_MARK))).toBe(true);
    expect(card(world, sub).description).toContain('src/a.ts');
  });

  it('descrição igual depois da sessão do condutor pausa a história: a sub-tarefa não roda de novo', async () => {
    world = await storyWorld((id, w) => {
      if (id === w.storyId) return;
      return block(NEEDS);
    });
    const sub = world.subtask('Precisa de contexto', validBrief());
    await drive(world, 2);
    const again = await world.orchestrator.drive(world.storyId, 'manual').catch(() => undefined);
    await world.orchestrator.settled();

    expect(world.starts).toEqual([sub, world.storyId]);
    expect(again?.kind).toBe('paused');
  });

  it('NEEDS_CONTEXT com o card concluído pela ferramenta vira ressalva, não pedido de contexto', async () => {
    world = await storyWorld((id, w) => {
      if (id === w.storyId) return;
      finish(w, id);
      return block(NEEDS);
    });
    const sub = world.subtask('Concluída', validBrief());
    await drive(world);
    await until(() => world!.storyComments().some((b) => b.includes(CONCERN_MARK)));

    const concern = world.storyComments().find((b) => b.includes(CONCERN_MARK))!;
    expect(concern).toContain('declarou NEEDS_CONTEXT');
    expect(world.router.snapshot().comments.some((c) => c.cardId === sub && c.body.includes(CONTEXT_MARK))).toBe(false);
  });
});

describe('cenário: DONE_WITH_CONCERNS da sub-tarefa', () => {
  it('conclui, a ressalva aparece na história e no pedido do fechamento', async () => {
    let sub = '';
    world = await storyWorld((id, w) => {
      if (id === w.storyId) return;
      finish(w, id);
      return block(CONCERNS);
    });
    sub = world.subtask('Com ressalva', validBrief());
    await drive(world);
    await until(() => world!.starts.length >= 2);
    await world.orchestrator.settled();

    expect(card(world, sub).columnId).not.toBe(card(world, world.storyId).columnId);
    const concern = world.storyComments().find((b) => b.includes(CONCERN_MARK))!;
    expect(concern).toContain('o teste de carga não rodou');
    expect(world.starts).toEqual([sub, world.storyId]);
    expect(promptOf(world.cliCommands[1]!)).toContain('o teste de carga não rodou');
  });
});

describe('cenário: BLOCKED da sub-tarefa', () => {
  it('bloqueia o card com o motivo e o heartbeat abre o desbloqueio da história', async () => {
    world = await storyWorld((id, w) => {
      if (id === w.storyId) return;
      return block({ outcome: 'BLOCKED', summary: 'sem acesso ao serviço', failure_reason: 'a credencial expirou' });
    });
    const sub = world.subtask('Bloqueada', validBrief());
    await drive(world);

    expect(card(world, sub)).toMatchObject({ status: 'blocked' });
    expect(card(world, sub).statusReason).toContain('a credencial expirou');
    expect(unblockTargets(world.router.snapshot()).map((c) => c.id)).toEqual([world.storyId]);

    const w = world;
    w.router.handle({ type: 'card.status.set', cardId: w.cardId, status: null });
    const heartbeat = new Heartbeat(
      {
        get running() {
          return w.runner.running;
        },
        start: (id: string, origin: 'heartbeat' | 'manual' = 'heartbeat', mode?: 'unblock') => {
          w.starts.push(id);
          w.runner.start(id, { origin, mode });
        },
        stop: (id: string) => w.runner.stop(id),
        onDidFinish: (fn: (id: string) => void) => w.runner.onDidFinish((id) => fn(id)),
      } as never,
      {
        driver: w.orchestrator,
        snapshot: () => w.router.snapshot(),
        now: () => Date.now(),
        log: (l) => w.lines.push(l),
        act: (m) => w.router.handle(m, { author: 'Faz AI', source: 'ai' }),
      },
    );
    expect(heartbeat.runNow()).toBe(1);
    await w.orchestrator.settled();
    expect(w.starts.at(-1)).toBe(w.storyId);
    expect(w.lines.some((l) => l.includes('Desbloquear'))).toBe(true);
  });
});

describe('cenário: sem bloco final', () => {
  it('a resposta sem bloco mantém o comportamento de hoje: a ferramenta decide e nada vira ressalva ou pedido', async () => {
    world = await storyWorld((id, w) => {
      if (id === w.storyId) return;
      finish(w, id);
      return answer('Feito, sem bloco.');
    });
    const sub = world.subtask('Sem bloco', validBrief());
    await drive(world);
    await until(() => world!.starts.length >= 2);
    await world.orchestrator.settled();

    expect(world.starts).toEqual([sub, world.storyId]);
    const all = world.router.snapshot().comments.map((c) => c.body);
    expect(all.some((b) => b.includes(CONCERN_MARK) || b.includes(CONTEXT_MARK))).toBe(false);
    expect(world.lines.some((l) => l.includes('Bloco final: ausente'))).toBe(true);
  });
});
