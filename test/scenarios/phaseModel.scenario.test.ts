// Cenário de ponta a ponta do modelo da fase por coluna (#1411): a história real num mundo de cenário (`storyWorld`),
// a coluna com `phaseModel` e a execução passando o `--model` dela ao processo falso da CLI. Só a CLI é falsa.
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelOption } from '../../src/shared/models';
import { resolveRunTarget } from '../../src/shared/runTarget';
import { valueOf } from '../../src/shared/selectors';
import { storyWorld, type StoryWorld } from './storyWorld';

const opt = (model: string): ModelOption => ({
  id: `claude:${model}`,
  tool: 'claude',
  model,
  label: model,
  efforts: ['low', 'high'],
  defaultEffort: 'high',
});

let world: StoryWorld | undefined;
afterEach(async () => {
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

/** O mundo com o catálogo, o Opus na primeira coluna da IA e o Haiku na seguinte; devolve os ajudantes de leitura. */
async function scenario() {
  const w = (world = await storyWorld(() => {}));
  w.router.handle({ type: 'settings.models.set', catalog: [opt('haiku'), opt('sonnet'), opt('opus')] });
  const s = w.router.snapshot();
  const parent = s.workflows.find((x) => x.kind === 'parent')!;
  const [first, second] = s.columns
    .filter((c) => c.workflowId === parent.id && c.category === 'open' && c.aiActive)
    .sort((a, b) => a.position - b.position);
  w.router.handle({ type: 'settings.column.update', columnId: first!.id, patch: { phaseModel: 'claude:opus@high' } });
  w.router.handle({ type: 'settings.column.update', columnId: second!.id, patch: { phaseModel: 'claude:haiku@low' } });

  const field = () => w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  const newStory = () =>
    w.router.createCard({
      typeId: w.router.snapshot().cardTypes.find((t) => t.defaultWorkflowId === parent.id)!.id,
      columnId: first!.id,
      parentId: null,
      title: 'História da fase',
    });
  const modelOf = (cardId: string) => valueOf(w.router.snapshot(), cardId, field().id) as string | null;
  const run = (cardId: string) =>
    new Promise<void>((resolve, reject) => {
      try {
        w.runner.start(cardId, { origin: 'manual', onExit: () => resolve() });
      } catch (e) {
        reject(e);
      }
    });
  /** o `--model` da última execução da CLI */
  const cliModel = () => {
    const args = w.cliCommands.at(-1)!.args;
    return args[args.indexOf('--model') + 1];
  };
  return { w, first: first!, second: second!, field, newStory, modelOf, run, cliModel };
}

describe('cenário: o modelo da coluna decide a execução em cada fase', () => {
  it('a história criada recebe o modelo da primeira coluna e a execução passa o --model dele', async () => {
    const { newStory, modelOf, run, cliModel } = await scenario();
    const id = newStory();
    expect(modelOf(id)).toBe('claude:opus@high');
    await run(id);
    expect(cliModel()).toBe('opus');
  });

  it('card.move para a coluna seguinte troca o campo e a execução passa o --model da nova fase', async () => {
    const { w, second, newStory, modelOf, run, cliModel } = await scenario();
    const id = newStory();
    await run(id);
    expect(cliModel()).toBe('opus');
    w.router.handle({ type: 'card.move', cardId: id, columnId: second.id, position: 0 });
    expect(modelOf(id)).toBe('claude:haiku@low');
    await run(id);
    expect(cliModel()).toBe('haiku');
  });

  it('o modelo escolhido à mão em sonnet vale nas duas fases', async () => {
    const { w, second, field, newStory, modelOf, run, cliModel } = await scenario();
    const id = newStory();
    w.router.handle({ type: 'field.setValue', cardId: id, fieldId: field().id, value: 'claude:sonnet' });
    await run(id);
    expect(cliModel()).toBe('sonnet');
    w.router.handle({ type: 'card.move', cardId: id, columnId: second.id, position: 0 });
    expect(modelOf(id)).toBe('claude:sonnet');
    await run(id);
    expect(cliModel()).toBe('sonnet');
  });

  it('com o preenchimento automático desligado o campo fica vazio e o alvo da execução vem da coluna', async () => {
    const { w, newStory, modelOf, run, cliModel } = await scenario();
    w.router.handle({ type: 'settings.rules.update', patch: { autoApplyModelSuggestion: false } });
    const id = newStory();
    expect(modelOf(id)).toBeNull();
    const s = w.router.snapshot();
    const res = resolveRunTarget(
      s,
      s.cards.find((c) => c.id === id)!,
    );
    expect(res.blocked).toBeFalsy();
    if (!res.blocked) {
      expect(res.target.source).toBe('column');
      expect(res.target.value).toBe('claude:opus@high');
    }
    await run(id);
    expect(cliModel()).toBe('opus');
  });
});
