// Cenário do fechamento automático da fase (rodada real de 04/11/2026): quando as sub-tarefas da fase de código terminam
// sem ressalvas, o portão da fase deixa e a pasta está limpa, o board registra e move a história sozinho, sem a execução
// de fechamento da IA (8 a 10 pedidos ao modelo só para rodar os testes e mover o card). Qualquer dúvida devolve o
// fechamento à IA, como antes. Só o processo da CLI é falso.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrchestratorOptions } from '../../src/extension/orchestrator';
import { validBrief } from '../fixtures/subtaskBrief';
import { storyWorld, type ProcessFailure, type StoryWorld } from './storyWorld';

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const AI = { author: 'Claude Code', source: 'ai' } as const;
const until = (cond: () => boolean): Promise<void> => vi.waitFor(() => expect(cond()).toBe(true), { timeout: 5000, interval: 25 });
const answer = (text: string): ProcessFailure => ({
  stdout: JSON.stringify({ type: 'result', subtype: 'success', result: text, usage: { input_tokens: 2, output_tokens: 1 } }) + '\n',
  code: 0,
});
const CONCERNS = { outcome: 'DONE_WITH_CONCERNS', summary: 'feito', pending: 'o teste de carga não rodou' };

function finish(w: StoryWorld, cardId: string): void {
  const s = w.router.snapshot();
  const c = s.cards.find((x) => x.id === cardId)!;
  const done = s.columns.find((x) => x.workflowId === c.workflowId && x.category === 'done')!;
  w.router.handle({ type: 'card.move', cardId, columnId: done.id, position: 0 }, AI);
}
const columnName = (w: StoryWorld) => w.router.snapshot().columns.find((c) => c.id === w.story().columnId)!.name;

/** O mundo com o fechamento automático ligado como o boardHost o liga: o movimento pelo router, a pasta e o portão à escolha. */
async function scenario(
  act: (id: string, w: StoryWorld) => void | ProcessFailure,
  o: { clean?: boolean | null; exit?: { ok: boolean; reason?: string }; refuse?: boolean; commit?: boolean | 'falha' } = {},
) {
  const ref: { w?: StoryWorld } = {};
  const extra: Partial<OrchestratorOptions> = {
    workspaceClean: async () => (o.clean === undefined ? true : o.clean),
    phaseExit: () => o.exit ?? { ok: true },
    ...(o.commit
      ? {
          commitPhase: async () => {
            if (o.commit === 'falha') throw new Error('hook recusou');
            return 'abcdef1234567890';
          },
        }
      : {}),
    advance: async (storyId, columnId) => {
      if (o.refuse) return 'refused';
      ref.w!.router.handle(
        { type: 'card.move', cardId: storyId, columnId, position: Number.MAX_SAFE_INTEGER },
        { author: 'Faz AI', source: 'ai' },
      );
      return ref.w!.router.snapshot().cards.find((c) => c.id === storyId)!.columnId === columnId ? 'moved' : 'refused';
    },
  };
  const w = (world = ref.w = await storyWorld(act, undefined, undefined, extra));
  const before = columnName(w);
  const sub = w.subtask('Implementar', validBrief());
  await w.orchestrator.drive(w.storyId, 'manual');
  return { w, sub, before };
}

describe('cenário: fechamento automático da fase', () => {
  it('a sub-tarefa termina sem ressalvas e com a pasta limpa: o board move a história para a próxima coluna e registra, sem a execução de fechamento', async () => {
    const { w, sub, before } = await scenario((id, w) => {
      finish(w, id);
    });
    await until(() => columnName(w) !== before);
    await w.orchestrator.settled();
    expect(columnName(w)).toBe('Revisão');
    expect(w.starts).toEqual([sub]);
    const note = w.storyComments().find((b) => b.startsWith('Fechamento automático da fase Implementação'));
    expect(note).toContain('a sub-tarefa terminou sem ressalvas');
    expect(note).toContain('segue para Revisão');
    expect(w.lines.some((l) => l.includes('fechamento automático da fase Implementação'))).toBe(true);
  });

  it('com ressalva (DONE_WITH_CONCERNS) o fechamento é da IA, como antes', async () => {
    const { w, sub, before } = await scenario((id, w) => {
      if (id !== w.storyId) {
        finish(w, id);
        return answer(`Feito.\n${JSON.stringify(CONCERNS)}`);
      }
    });
    await until(() => w.starts.length === 2);
    await w.orchestrator.settled();
    expect(w.starts).toEqual([sub, w.storyId]);
    expect(columnName(w)).toBe(before);
    expect(w.storyComments().some((b) => b.startsWith('Fechamento automático'))).toBe(false);
  });

  it('pasta com alterações das sub-tarefas: o board faz o commit da fase, registra o sha e move a história', async () => {
    const { w, sub, before } = await scenario(
      (id, w) => {
        finish(w, id);
      },
      { clean: false, commit: true },
    );
    await until(() => columnName(w) !== before);
    await w.orchestrator.settled();
    expect(columnName(w)).toBe('Revisão');
    expect(w.starts).toEqual([sub]);
    const note = w.storyComments().find((b) => b.startsWith('Fechamento automático da fase Implementação'));
    expect(note).toContain('o board fez o commit abcdef1234 com as alterações delas');
  });

  it('o git recusa o commit da fase: o motivo vai ao log e o fechamento é da IA', async () => {
    const { w, sub } = await scenario(
      (id, w) => {
        if (id !== w.storyId) finish(w, id);
      },
      { clean: false, commit: 'falha' },
    );
    await until(() => w.starts.length === 2);
    await w.orchestrator.settled();
    expect(w.starts).toEqual([sub, w.storyId]);
    expect(w.lines.some((l) => l.includes('não fez o commit da fase') && l.includes('hook recusou'))).toBe(true);
  });

  it('pasta com alterações sem quem faça o commit, ou estado desconhecido: o fechamento é da IA', async () => {
    for (const clean of [false, null]) {
      const { w, sub } = await scenario(
        (id, w) => {
          if (id !== w.storyId) finish(w, id);
        },
        { clean },
      );
      await until(() => w.starts.length === 2);
      await w.orchestrator.settled();
      expect(w.starts).toEqual([sub, w.storyId]);
      w.dispose();
      world = undefined;
    }
  });

  it('o portão da fase não deixa (Revisão sem APROVADO): o fechamento é da IA, que corrige e abre a rodada seguinte', async () => {
    const { w, sub } = await scenario(
      (id, w) => {
        if (id !== w.storyId) finish(w, id);
      },
      { exit: { ok: false, reason: 'A última rodada terminou em REPROVADO.' } },
    );
    await until(() => w.starts.length === 2);
    await w.orchestrator.settled();
    expect(w.starts).toEqual([sub, w.storyId]);
  });

  it('movimento recusado pelas regras do board: a nota fica, o motivo vai ao log e o fechamento é da IA, uma só vez', async () => {
    const { w, sub } = await scenario(
      (id, w) => {
        if (id !== w.storyId) finish(w, id);
      },
      { refuse: true },
    );
    await until(() => w.starts.length === 2);
    await w.orchestrator.settled();
    expect(w.starts).toEqual([sub, w.storyId]);
    expect(w.lines.some((l) => l.includes('fechamento automático foi recusado'))).toBe(true);
  });
});
