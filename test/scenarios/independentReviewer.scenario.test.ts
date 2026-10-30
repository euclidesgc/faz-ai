// Cenário de ponta a ponta do revisor independente (#1111): a história real num mundo de cenário (`storyWorld`), a
// sub-tarefa de implementação com um modelo, a IA (cliente do servidor MCP de verdade) cria a sub-tarefa de Revisão e o
// board escolhe o modelo dela: outro e nunca o barato. A execução da revisão passa o `--model` ao processo falso da CLI.
// Só o processo da CLI é falso.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/extension/mcp/server';
import type { ModelOption } from '../../src/shared/models';
import { valueOf } from '../../src/shared/selectors';
import { storyWorld, type StoryWorld } from './storyWorld';

const opt = (model: string): ModelOption => ({
  id: `claude:${model}`,
  tool: 'claude',
  model,
  label: model,
  efforts: [],
  defaultEffort: null,
});

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

  const server = createMcpServer({
    getRouter: async () => w.router,
    getRunner: async () => w.runner,
    workspaceDir: w.project,
    version: 'test',
  });
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

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

describe('cenário: rodadas e portão de saída da Revisão (#1324)', () => {
  it('REPROVADO → rodada 2 com o diff e os achados → NÃO COMPROVADO segura → APROVADO libera a saída', async () => {
    const { w, textOf } = await scenario(true);
    git(w.project, 'init', '-q');
    fs.writeFileSync(path.join(w.project, 'a.txt'), '1');
    git(w.project, 'add', '.');
    git(w.project, 'commit', '-q', '-m', 'um');
    w.router.handle({
      type: 'harness.agent.create',
      input: {
        name: 'revisor-de-codigo',
        description: 'Revisão.',
        body: 'Revise.',
        model: '',
        tools: ['Read'],
        deniedTools: [],
        skills: [],
        mcp: [],
      },
    });
    const s = w.router.snapshot();
    const parent = s.workflows.find((x) => x.kind === 'parent')!;
    const column = (name: string) => s.columns.find((c) => c.workflowId === parent.id && c.name === name)!;
    // a implementação já terminou: a história chega à Revisão sem sub-tarefa em aberto
    const child = s.workflows.find((x) => x.kind === 'child')!;
    const implemented = s.cards.find((c) => c.title === 'Implementar')!;
    const done = s.columns.find((c) => c.workflowId === child.id && c.category === 'done')!;
    w.router.handle({ type: 'card.move', cardId: implemented.id, columnId: done.id, position: Number.MAX_SAFE_INTEGER });
    w.router.handle({ type: 'card.move', cardId: w.storyId, columnId: column('Revisão').id, position: Number.MAX_SAFE_INTEGER });
    const story = () => w.router.snapshot().cards.find((c) => c.id === w.storyId)!;
    const call = (name: string, args: Record<string, unknown>) => client!.callTool({ name, arguments: args });

    const open = async (title: string) => {
      const res = await call('create_card', { title, parent: story().number, profile: 'revisor-de-codigo', fields: { Fase: 'Revisão' } });
      expect(res.isError).not.toBe(true);
      return w.router.snapshot().cards.find((c) => c.title === title)!;
    };
    const close = (card: { number: number }, comment: string) => call('move_card', { card: card.number, column: 'Concluído', comment });
    const exit = () => call('move_card', { card: story().number, column: 'Homologação' });
    const advance = (file: string) => {
      fs.writeFileSync(path.join(w.project, file), file);
      git(w.project, 'add', '.');
      git(w.project, 'commit', '-q', '-m', file);
    };

    // rodada 1: REPROVADO segura a saída
    const first = await open('Revisão 1');
    const base = git(w.project, 'rev-parse', 'HEAD');
    expect((await close(first, '- A1 [bloqueia] a.txt:1: sem teste\nNão checado: nada\nVEREDITO: REPROVADO')).isError).not.toBe(true);
    expect((await exit()).isError).toBe(true);

    // a correção entra e a rodada 2 nasce com os achados e o diff desde o commit da rodada 1
    advance('b.txt');
    const second = await open('Revisão 2');
    const description = w.router.snapshot().cards.find((c) => c.id === second.id)!.description;
    expect(description).toContain('## Rodada 2');
    expect(description).toContain('A1 [bloqueia] a.txt:1: sem teste');
    expect(description).toContain(`git diff ${base}...HEAD`);
    expect(textOf(first.id).join('\n')).toContain('VEREDITO: REPROVADO');

    // NÃO COMPROVADO também segura; APROVADO libera
    expect(
      (await close(second, '- A1 [bloqueia] a.txt:1: sem teste [RESOLVIDO]\nNão checado:\n- a integração\nVEREDITO: NÃO COMPROVADO'))
        .isError,
    ).not.toBe(true);
    expect((await exit()).isError).toBe(true);
    advance('c.txt');
    const third = await open('Revisão 3');
    expect((await close(third, '- A1 [bloqueia] a.txt:1: sem teste [RESOLVIDO]\nNão checado: nada\nVEREDITO: APROVADO')).isError).not.toBe(
      true,
    );
    expect((await exit()).isError).not.toBe(true);
    expect(story().columnId).toBe(column('Homologação').id);
  });
});
