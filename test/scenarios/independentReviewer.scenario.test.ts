// Cenário de ponta a ponta do revisor independente (#1111): a história real num mundo de cenário (`storyWorld`), a
// sub-tarefa de implementação com um modelo, a IA (cliente do servidor MCP de verdade) cria a sub-tarefa de Revisão e o
// board escolhe o modelo dela: outro e nunca o barato. A execução da revisão passa o `--model` ao processo falso da CLI.
// Só o processo da CLI é falso.
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/extension/mcp/server';
import type { ModelOption } from '../../src/shared/models';
import { valueOf } from '../../src/shared/selectors';
import { storyWorld, type StoryWorld } from './storyWorld';

const opt = (model: string): ModelOption => ({ id: `claude:${model}`, tool: 'claude', model, label: model, efforts: [], defaultEffort: null });

let world: StoryWorld | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
  await world?.orchestrator.settled();
  world?.dispose();
  world = undefined;
});

/** O mundo com o catálogo (e a escada, quando houver) do Claude e a sub-tarefa de implementação feita com `implementer`. */
async function scenario(ladder: boolean, implementer = 'claude:opus') {
  const w = (world = await storyWorld(() => {}));
  w.router.handle({ type: 'settings.models.set', catalog: [opt('haiku'), opt('sonnet'), opt('opus')] });
  if (ladder) w.router.handle({ type: 'models.ladder.set', tool: 'claude', ladder: ['claude:haiku', 'claude:sonnet', 'claude:opus'] });
  const impl = w.subtask('Implementar', null);
  const model = () => w.router.snapshot().fieldDefs.find((f) => f.kind === 'model')!;
  w.router.handle({ type: 'field.setValue', cardId: impl, fieldId: model().id, value: implementer });

  const server = createMcpServer({ getRouter: async () => w.router, getRunner: async () => w.runner, workspaceDir: w.project, version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'claude-code', version: '1' });
  await client.connect(b);

  const story = w.router.snapshot().cards.find((c) => c.id === w.storyId)!;
  /** a IA cria a sub-tarefa de Revisão pelo MCP; devolve o card */
  const createReview = async (fields: Record<string, string> = {}) => {
    const res = await client!.callTool({
      name: 'create_card',
      arguments: { title: 'Revisar', parent: story.number, fields: { Fase: 'Revisão', ...fields } },
    });
    expect(res.isError).not.toBe(true);
    return w.router.snapshot().cards.find((c) => c.title === 'Revisar')!;
  };
  const modelOf = (cardId: string) => valueOf(w.router.snapshot(), cardId, model().id) as string | null;
  /** o `--model` da última execução da CLI */
  const cliModel = () => {
    const args = w.cliCommands.at(-1)!.args;
    return args[args.indexOf('--model') + 1];
  };
  const textOf = (cardId: string) =>
    w.router
      .snapshot()
      .comments.filter((c) => c.cardId === cardId)
      .map((c) => c.body);
  return { w, createReview, modelOf, cliModel, textOf, model };
}

describe('cenário: a revisão nasce com outro modelo', () => {
  it('implementação no Opus: a revisão criada pela IA nasce no Sonnet (não o barato), a execução usa esse --model e a conversa registra', async () => {
    const { w, createReview, modelOf, cliModel, textOf } = await scenario(true);
    const review = await createReview({ Modelo: 'claude:haiku' });
    expect(modelOf(review.id)).toBe('claude:sonnet');
    expect(modelOf(review.id)).not.toBe('claude:opus');

    await new Promise<void>((resolve, reject) => {
      try {
        w.runner.start(review.id, { origin: 'manual', onExit: () => resolve() });
      } catch (e) {
        reject(e);
      }
    });
    expect(cliModel()).toBe('sonnet');

    const note = (id: string) => textOf(id).find((b) => b.includes('Revisor') && b.includes('definido pelo board'));
    expect(note(review.id)).toContain('sonnet');
    expect(note(review.id)).toContain('implementação: opus');
    expect(note(w.storyId)).toContain(`#${review.number}`);
  });

  it('só um perfil pronto e sem o Modelo da IA: o board usa outro modelo do mesmo perfil e diz que não houve outro agente', async () => {
    const { createReview, modelOf, textOf } = await scenario(true);
    const review = await createReview();
    expect(modelOf(review.id)).toBe('claude:sonnet');
    expect(textOf(review.id).join('\n')).toContain('só há um agente pronto; usei outro modelo dele');
  });

  it('sem escada nem preço nada é barato: o modelo diferente do implementador é escolhido, nunca o mesmo', async () => {
    const { createReview, modelOf } = await scenario(false);
    const review = await createReview({ Modelo: 'claude:opus' });
    expect(modelOf(review.id)).not.toBe('claude:opus');
  });

  it('o Modelo independente que a IA passou é mantido, sem comentário do board', async () => {
    const { createReview, modelOf, textOf } = await scenario(true);
    const review = await createReview({ Modelo: 'claude:sonnet' });
    expect(modelOf(review.id)).toBe('claude:sonnet');
    expect(textOf(review.id).some((b) => b.includes('definido pelo board'))).toBe(false);
  });

  it('o modelo escolhido à mão pela pessoa nunca é trocado', async () => {
    const { w, createReview, modelOf, model, textOf } = await scenario(true);
    const review = await createReview();
    w.router.handle({ type: 'field.setValue', cardId: review.id, fieldId: model().id, value: 'claude:haiku' });
    // a mesma sub-tarefa reaplicada pelo gancho não muda o que a pessoa escolheu
    w.router.applyReviewerModelToNewCard(review.id);
    expect(modelOf(review.id)).toBe('claude:haiku');
    expect(textOf(review.id).filter((b) => b.includes('definido pelo board'))).toHaveLength(1);
  });
});
