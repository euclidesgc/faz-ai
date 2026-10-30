// O núcleo da avaliação (`runStory`, `configureBoard`, o placar) sobre o board de cenário, com o processo da CLI
// falso: nada gasta tokens. O `act` de cada teste faz o papel da IA.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configureBoard, parseModel } from '../../evals/lib/evalBoard';
import { runStory } from '../../evals/lib/runStory';
import { scoreStory } from '../../evals/lib/scoreboard';
import { loadStories, prepareProject, runAcceptance, type ReferenceStory } from '../../evals/lib/stories';
import { columnOf } from '../../src/shared/selectors';
import { evalWorld, type EvalAct, type EvalWorld } from './evalWorld';

const CONFIG = parseModel('claude:sonnet@high');
const STORIES_ROOT = path.resolve(__dirname, '../../evals/stories');

let world: EvalWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

const story = (patch: Partial<ReferenceStory> = {}): ReferenceStory => ({
  id: 'exemplo',
  title: 'História de exemplo',
  description: 'Faça algo.',
  startPhase: 'Plan',
  timeoutMinutes: 1,
  acceptance: { command: ['node', '-e', ''], timeoutSeconds: 10 },
  dir: STORIES_ROOT,
  ...patch,
});

/** A IA que termina cada fase: leva a história para a coluna seguinte do fluxo. */
function advance(a: EvalAct): void {
  const s = a.world.router.snapshot();
  const card = s.cards.find((c) => c.id === a.cardId)!;
  const columns = s.columns.filter((c) => c.workflowId === card.workflowId).sort((x, y) => x.position - y.position);
  const next = columns[columns.findIndex((c) => c.id === card.columnId) + 1]!;
  a.world.router.handle({ type: 'comment.add', cardId: a.cardId, body: 'Fase concluída.' }, { author: 'Claude Code', source: 'ai' });
  a.world.router.handle({ type: 'card.move', cardId: a.cardId, columnId: next.id, position: 0 }, { author: 'Claude Code', source: 'ai' });
}

const columnName = (w: EvalWorld, id: string): string =>
  columnOf(
    w.router.snapshot(),
    w.router.snapshot().cards.find((c) => c.id === id)!,
  )!.name;

describe('parseModel', () => {
  it('lê <perfil>:<modelo>@<esforço>', () => {
    expect(parseModel('claude:opus@medium')).toEqual({ model: 'claude:opus@medium', profile: 'claude' });
  });

  it.each(['opus', 'claude:opus', 'claude@high', ':opus@high', 'claude:@high', 'claude:opus@', 'claude: opus@high'])(
    'recusa "%s" com a explicação do formato',
    (value) => {
      expect(() => parseModel(value)).toThrow(/<perfil>:<modelo>@<esforço>/);
    },
  );
});

describe('configureBoard', () => {
  it('fixa o modelo nos tipos, zera as regras de modelo, libera a permissão e põe o git em branch', async () => {
    world = await evalWorld(CONFIG, () => {});
    const s = world.router.snapshot();
    const field = s.fieldDefs.find((f) => f.kind === 'model')!;
    expect(s.board.aiTool).toBe('claude');
    expect(s.board.modelRules).toEqual([]);
    expect(s.board.runner.permission).toBe('full');
    expect(s.board.git).toMatchObject({ mode: 'branch', gitflow: false, mainBranch: 'main' });
    for (const type of s.cardTypes) expect(type.defaults[field.id]).toBe(CONFIG.model);
  });

  it('para com a lista de modelos quando o modelo não está no catálogo', async () => {
    world = await evalWorld(CONFIG, () => {});
    expect(() => configureBoard(world!.router, parseModel('claude:inexistente@high'))).toThrow(/Disponíveis: .*claude:/);
  });
});

describe('runStory', () => {
  it('delivered: começa no Plan, anda até a Homologação, desliga o yolo e não executa a Homologação', async () => {
    world = await evalWorld(CONFIG, (a) => advance(a));
    const run = await runStory(world, story(), CONFIG, { timeoutMs: 20_000 });
    expect(run).toMatchObject({ storyId: 'exemplo', end: 'delivered', endNote: null });
    const id = world.starts[0]!;
    expect(world.startColumns).toEqual(['Plan', 'Implementação', 'Revisão']);
    expect(new Set(world.starts)).toEqual(new Set([id]));
    expect(columnName(world, id)).toBe('Homologação');
    expect(world.router.snapshot().cards.find((c) => c.id === id)!.yolo).toBe(false);
    expect(world.runner.running).toEqual([]);
    // o Modelo do card é o da rodada
    const state = world.router.snapshot();
    const field = state.fieldDefs.find((f) => f.kind === 'model')!;
    expect(state.fieldValues.find((v) => v.cardId === id && v.fieldId === field.id)?.value).toBe(CONFIG.model);
  });

  it('blocked: a IA bloqueia o card', async () => {
    world = await evalWorld(CONFIG, (a) =>
      a.world.router.handle(
        { type: 'card.status.set', cardId: a.cardId, status: 'blocked', note: 'Falta acesso ao serviço.' },
        { author: 'Claude Code', source: 'ai' },
      ),
    );
    const run = await runStory(world, story(), CONFIG, { timeoutMs: 20_000 });
    expect(run.end).toBe('blocked');
    expect(run.endNote).toContain('Falta acesso ao serviço.');
  });

  it('timeout: a execução não termina e o tempo limite a encerra', async () => {
    world = await evalWorld(CONFIG, (a) => a.hang());
    const run = await runStory(world, story(), CONFIG, { timeoutMs: 300 });
    expect(run.end).toBe('timeout');
    expect(run.endedAt - run.startedAt).toBeLessThan(10_000);
    expect(world.runner.running).toEqual([]);
  });

  it('fase inicial configurada: startPhase "Implementação" começa nela', async () => {
    world = await evalWorld(CONFIG, (a) => advance(a));
    const run = await runStory(world, story({ startPhase: 'Implementação' }), CONFIG, { timeoutMs: 20_000 });
    expect(run.end).toBe('delivered');
    expect(world.startColumns).toEqual(['Implementação', 'Revisão']);
  });

  it('recusa uma fase inicial que o board não tem', async () => {
    world = await evalWorld(CONFIG, () => {});
    await expect(runStory(world, story({ startPhase: 'Inexistente' }), CONFIG, { timeoutMs: 1000 })).rejects.toThrow(/Colunas: .*Plan/);
  });
});

describe('ponta a ponta com a CLI falsa (slugify)', () => {
  it('prepara o projeto, conduz a história, roda o aceite e o placar sai aceito, sem custo informado', async () => {
    const slugify = loadStories(STORIES_ROOT, ['slugify'])[0]!;
    const solution = (name: string): string => path.join(slugify.dir, 'acceptance', name);
    let acceptanceVisible = false;
    world = await evalWorld(CONFIG, (a) => {
      const project = a.world.projectDir;
      // os testes de aceite só existem depois do fim
      acceptanceVisible ||= fs.existsSync(path.join(project, '.eval-acceptance'));
      if (columnName(a.world, a.cardId) === 'Implementação') {
        fs.mkdirSync(path.join(project, 'src'), { recursive: true });
        fs.writeFileSync(
          path.join(project, 'src', 'slugify.js'),
          [
            'export function slugify(texto) {',
            "  return texto.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');",
            '}',
            '',
          ].join('\n'),
        );
        fs.writeFileSync(path.join(project, 'src', 'index.js'), "export { slugify } from './slugify.js';\n");
      }
      advance(a);
    });
    expect(fs.existsSync(solution('slugify.test.js'))).toBe(true);
    prepareProject(slugify, world.projectDir);

    const run = await runStory(world, slugify, CONFIG, { timeoutMs: 30_000 });
    expect(run.end).toBe('delivered');
    expect(acceptanceVisible).toBe(false);
    expect(fs.existsSync(path.join(world.projectDir, '.eval-acceptance'))).toBe(false);

    const acceptance = await runAcceptance(slugify, world.projectDir);
    expect(acceptance.passed).toBe(true);

    const log = await world.close({ start: run.startedAt, end: Date.now() });
    const score = scoreStory(slugify, run, log, acceptance, CONFIG);
    expect(score).toMatchObject({
      id: 'slugify',
      accepted: true,
      end: 'delivered',
      costUsd: null,
      costRuns: 0,
      runs: 3,
      modelMismatches: 0,
    });
    expect(score.tokens).toEqual({ input: 300, cacheRead: 3000, cacheWrite: 600, output: 150 });
  });

  it('soma o custo quando a execução o informa', async () => {
    world = await evalWorld(CONFIG, (a) => {
      a.usage({ costUsd: 0.25 });
      advance(a);
    });
    const run = await runStory(world, story(), CONFIG, { timeoutMs: 20_000 });
    const log = await world.close({ start: run.startedAt, end: Date.now() });
    const score = scoreStory(story(), run, log, null, CONFIG);
    expect(score).toMatchObject({ costUsd: 0.75, costRuns: 3, accepted: false });
  });
});
