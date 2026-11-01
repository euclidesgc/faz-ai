// Cenário de ponta a ponta do agente capaz (história #1375): do `runner.start` até a linha de comando da CLI e a
// conversa da história. O agente do card não concede o Terminal, que uma fase de código pede. Com outro agente do
// board capaz, a execução vai com ele (o `--agent` da CLI), a história recebe a nota uma vez e o log diz a troca.
// Sem nenhum agente capaz, nenhuma execução começa: a história para com o motivo e o caminho. Só o processo da
// ferramenta é falso.
import { afterEach, describe, expect, it } from 'vitest';
import { CONDUTOR_TOOLS, cardWorld, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

const SEM_TERMINAL = ['Read', 'Grep', 'Glob', 'Edit', 'Write'];

/** Leva o card do cenário para a primeira fase de código (a Implementação do board padrão). */
function moveToCodePhase(w: CardWorld): void {
  const s = w.router.snapshot();
  const card = s.cards.find((c) => c.id === w.cardId)!;
  const code = s.columns
    .filter((c) => c.workflowId === card.workflowId && c.category === 'open' && c.aiActive && c.artifactName === '')
    .sort((a, b) => a.position - b.position)[0]!;
  w.router.handle({ type: 'card.move', cardId: w.cardId, columnId: code.id, position: 0 });
}

describe('o agente do card não concede o que a fase pede', () => {
  it('a execução vai com o agente capaz do board, a história recebe a nota uma vez e a CLI leva o agente trocado', async () => {
    world = await cardWorld({ profile: 'claude', tools: SEM_TERMINAL });
    world.router.handle({
      type: 'harness.agent.create',
      input: {
        name: 'executor',
        description: 'Executa o trabalho de código.',
        body: 'Você executa o trabalho de código da fase.',
        model: '',
        tools: CONDUTOR_TOOLS,
        deniedTools: [],
        skills: [],
        mcp: [],
      },
    });
    moveToCodePhase(world);

    await world.run();

    const command = world.cliCommands[0]!;
    expect(command.args[command.args.indexOf('--agent') + 1]).toBe('executor');
    expect(world.lines.some((l) => l.includes('Agente do board: executor'))).toBe(true);
    expect(world.lines.some((l) => l.includes('agente executor no lugar de condutor-do-board (sem Terminal)'))).toBe(true);
    const note =
      'A execução de #1 vai com o agente executor: o agente condutor-do-board não concede Terminal, que a fase Implementação pede.';
    expect(world.comments().filter((c) => c.includes(note))).toHaveLength(1);

    // a segunda execução pela mesma causa não repete a nota
    await world.run();
    expect(world.comments().filter((c) => c.includes(note))).toHaveLength(1);
  });

  it('sem nenhum agente capaz, nenhuma execução começa e a história para com o motivo', async () => {
    world = await cardWorld({ profile: 'claude', tools: SEM_TERMINAL });
    moveToCodePhase(world);

    await expect(world.run()).rejects.toThrow('Nenhum agente do board concede Terminal');

    expect(world.cliCommands).toHaveLength(0);
    const card = world.router.snapshot().cards.find((c) => c.id === world!.cardId)!;
    expect(card.status).toBe('blocked');
    expect(card.statusReason).toContain('que a fase Implementação de #1 pede');
    expect(card.statusReason).toContain('Configurações → Harness → Agentes');
  });
});
