// Cenário de ponta a ponta do portão que falha fechado (#1102): a história está aprovada numa coluna que exige
// aprovação, e a execução é interrompida pela pessoa. Do `runner.start` até o status no board: a história continua
// aprovada na mesma coluna e nenhuma nova aprovação dispara o avanço, com e sem o modo autônomo. Só o processo da
// CLI é falso (ver cardWorld.ts): ele fica rodando até ser morto, como uma execução de verdade.
import { afterEach, describe, expect, it } from 'vitest';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { cardWorld, CONDUTOR_TOOLS, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

const cardOf = (w: CardWorld) => w.router.snapshot().cards.find((c) => c.id === w.cardId)!;

describe('cenário: a história aprovada que a execução interrompe continua aprovada', () => {
  for (const autonomo of [false, true]) {
    it(`${autonomo ? 'com' : 'sem'} modo autônomo: fica aprovada na mesma coluna, sem nova aprovação, e não avança`, async () => {
      let started = () => {};
      const running = new Promise<void>((resolve) => (started = resolve));
      // o processo da CLI só acaba quando é morto: a interrupção da pessoa é o que encerra a execução
      const hangs: SpawnFn = () => {
        let exit: (code: number | null) => void = () => {};
        started();
        return { kill: () => exit(143), onExit: (fn) => (exit = fn), terminationConfirmed: () => true };
      };
      world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS, permission: 'board', spawn: hangs });
      const w = world;
      const approvals: string[] = [];
      w.router.onDidApprove((id) => approvals.push(id));

      // a aprovação que o board não pôde avançar: o status fica `approved` na coluna de aprovação
      const coluna = cardOf(w).columnId;
      (w.router as any).ctx.cards.setStatus(w.cardId, 'approved', '', 'Pessoa');
      if (autonomo) w.router.handle({ type: 'card.yolo.set', cardId: w.cardId, enabled: true });

      const fim = w.run();
      await running;
      expect(cardOf(w).status).toBe('running');
      w.runner.stop(w.cardId);
      await fim;

      expect(cardOf(w)).toMatchObject({ status: 'approved', columnId: coluna });
      expect(approvals).toEqual([]);
    });
  }
});
