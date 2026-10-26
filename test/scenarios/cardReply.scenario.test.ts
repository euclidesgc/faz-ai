// Cenário de ponta a ponta da resposta à pessoa: o card está bloqueado, a pessoa escreve na conversa e "Enviar"
// chama a IA no modo de resposta. Do comentário até a conversa: a mensagem devolve a vez à IA, o runner monta o
// pedido de resposta (não o da fase), a IA responde pela conversa e o card fica com a pessoa para ela seguir. Só o
// processo da CLI é falso (ver cardWorld.ts): ele faz o papel da IA respondendo pelo MCP.
import { afterEach, describe, expect, it } from 'vitest';
import type { AiRunEnd } from '../../src/extension/ai/gateway';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

/** A CLI que responde na conversa do card (como a IA faria pelo add_comment) e termina bem; sem `say`, só termina. */
const answering =
  (w: () => CardWorld, say?: string): SpawnFn =>
  () => {
    let exit: (code: number | null) => void = () => {};
    setTimeout(() => {
      if (say) w().router.handle({ type: 'comment.add', cardId: w().cardId, body: say }, { author: 'Claude Code', source: 'ai' });
      exit(0);
    }, 5);
    return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
  };

const reply = (w: CardWorld) =>
  new Promise<AiRunEnd>((resolve, reject) => {
    try {
      w.runner.start(w.cardId, { origin: 'manual', mode: 'reply', onExit: resolve });
    } catch (e) {
      reject(e);
    }
  });

const cardOf = (w: CardWorld) => w.router.snapshot().cards.find((c) => c.id === w.cardId)!;

describe('cenário: a pessoa escreve num card bloqueado e a IA responde', () => {
  it('a mensagem devolve a vez, a resposta usa o pedido de resposta e o card fica com a pessoa', async () => {
    world = await cardWorld({
      profile: 'claude',
      tools: CONDUTOR_TOOLS,
      permission: 'board',
      spawn: answering(() => world!, 'A base fica na develop.'),
    });
    const w = world;
    w.router.handle(
      { type: 'card.status.set', cardId: w.cardId, status: 'blocked', note: 'Falta decidir a base.' },
      { author: 'Claude Code', source: 'ai' },
    );
    w.router.handle({ type: 'comment.add', cardId: w.cardId, body: 'Qual base você vai usar?' });
    expect(cardOf(w)).toMatchObject({ status: 'ready', statusReason: '' });

    const end = await reply(w);

    expect(end.code).toBe(0);
    const prompt = w.cliCommands[0]!.stdin ?? w.cliCommands[0]!.args.join(' ');
    expect(prompt).toContain('A pessoa escreveu na conversa do card');
    expect(prompt).toContain('O bloqueio do card ou da história não impede');
    expect(prompt).not.toContain('Faça o trabalho da fase');
    expect(w.lines.some((l) => l.includes('Responder à pessoa'))).toBe(true);
    expect(w.comments()).toContain('A base fica na develop.');
    // respondeu e encerrou: a vez volta para a pessoa, como numa resposta da fase
    expect(cardOf(w).status).toBe('waiting_answer');
  });

  it('a resposta que termina sem escrever nada bloqueia com o motivo, como a fase', async () => {
    world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, permission: 'board', spawn: answering(() => world!) });
    const w = world;
    w.router.handle({ type: 'comment.add', cardId: w.cardId, body: 'Pode seguir?' });

    await reply(w);

    expect(cardOf(w).status).toBe('blocked');
    expect(cardOf(w).statusReason).toContain('encerrou sem responder');
  });
});
