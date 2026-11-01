// Cenário de ponta a ponta da marca "sem execução bem-sucedida" do catálogo (plano B1 da 0.48): do log `ai_runs`
// ao comando da CLI. Só o processo da CLI do Claude Code é falso (o de sempre do mundo, que guarda o comando).
// O card com Esforço Baixo cairia na regra "Baixo → Haiku"; com o Haiku marcado pelo log, a regra é pulada e a
// execução vai para o padrão do board, sem o `--model haiku`.
import { afterEach, describe, expect, it } from 'vitest';
import { AiRunRepo } from '../../src/extension/log/aiRunRepo';
import { CONDUTOR_TOOLS, cardWorld, type CardWorld } from './cardWorld';

let world: CardWorld | undefined;
afterEach(() => {
  world?.dispose();
  world = undefined;
});

/** O `--model` que o comando montado pede, ou null quando a CLI decide. */
const modelOf = (args: readonly string[]): string | null => {
  const at = args.indexOf('--model');
  return at < 0 ? null : args[at + 1]!;
};

/** Grava no log `n` execuções do Haiku pelo perfil `claude` sem resultado, como o gateway grava. */
function failHaiku(w: CardWorld, n: number): void {
  const runs = new AiRunRepo(w.db);
  const boardId = w.router.snapshot().board.id;
  for (let i = 0; i < n; i++) {
    const id = runs.start({
      boardId,
      startedAt: Date.now() - (n - i) * 60_000,
      origin: 'manual',
      tool: 'claude',
      cardId: null,
      cardNumber: null,
      cardTitle: '',
      cardType: '',
      workflow: '',
      columnName: '',
      phase: '',
    });
    runs.describe(id, {
      model: 'haiku',
      effort: 'medium',
      profile: null,
      agent: null,
      permission: 'default',
      autonomous: false,
      clean: false,
      skills: [],
      mcp: null,
    });
    runs.finish(id, 'failed', 1, 'deterministic');
  }
  w.router.invalidateSnapshot();
}

const setEffort = (w: CardWorld, value: string) => {
  const field = w.router.snapshot().fieldDefs.find((f) => f.name === 'Esforço da atividade')!;
  w.router.handle({ type: 'field.setValue', cardId: w.cardId, fieldId: field.id, value });
};

describe('cenário: regra de modelo cujo modelo não roda', () => {
  it('sem a marca, o card com Esforço Baixo roda no Haiku da regra', async () => {
    const w = (world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS }));
    setEffort(w, 'Baixo');
    await w.run();
    expect(w.cliCommands.map((c) => modelOf(c.args))).toEqual(['haiku']);
  });

  it('com o Haiku marcado pelo log, a regra é pulada e a execução vai para o padrão do board; o get_models diz o porquê', async () => {
    const w = (world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS }));
    failHaiku(w, 3);
    const s = w.router.snapshot();
    expect(s.board.modelFailures?.['claude:haiku']).toMatchObject({ outcome: 'failed', failureClass: 'deterministic', runs: 3 });
    setEffort(w, 'Baixo');
    await w.run();
    expect(w.cliCommands).toHaveLength(1);
    expect(modelOf(w.cliCommands[0]!.args)).not.toBe('haiku');
    // a execução no padrão terminou bem e não é do Haiku: a marca dele continua
    expect(w.router.snapshot().board.modelFailures?.['claude:haiku']).toBeDefined();
  });

  it('uma execução bem-sucedida do Haiku limpa a marca, e a regra volta a valer', async () => {
    const w = (world = await cardWorld({ profile: 'claude', tools: CONDUTOR_TOOLS }));
    failHaiku(w, 3);
    const runs = new AiRunRepo(w.db);
    const id = runs.start({
      boardId: w.router.snapshot().board.id,
      startedAt: Date.now(),
      origin: 'manual',
      tool: 'claude',
      cardId: null,
      cardNumber: null,
      cardTitle: '',
      cardType: '',
      workflow: '',
      columnName: '',
      phase: '',
    });
    runs.describe(id, {
      model: 'haiku',
      effort: 'medium',
      profile: null,
      agent: null,
      permission: 'default',
      autonomous: false,
      clean: false,
      skills: [],
      mcp: null,
    });
    runs.finish(id, 'done', 0, null);
    w.router.invalidateSnapshot();
    expect(w.router.snapshot().board.modelFailures?.['claude:haiku']).toBeUndefined();
    setEffort(w, 'Baixo');
    await w.run();
    expect(w.cliCommands.map((c) => modelOf(c.args))).toEqual(['haiku']);
  });
});
