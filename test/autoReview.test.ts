// A sub-tarefa de revisão independente nasce do board quando a história entra na Revisão (rodada real de 04/11/2026:
// a IA gastava uma execução inteira só para criá-la). Com o `revisor-de-codigo` nos agentes do board, a história que
// entra na coluna com branch e sem sub-tarefa na fase ganha a sub-tarefa, com Fase, agente, descrição conferível e a
// nota na conversa; sem o agente, sem branch, ou fora da janela dona do board, nada muda.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AUTO_REVIEW_MARK, autoReviewOf, reviewBrief, watchAutoReview } from '../src/extension/autoReview';
import { briefFailures } from '../src/shared/subtaskBrief';
import { valueOf } from '../src/shared/selectors';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
let dir: string;
let router: MessageRouter;
let storyId: string;
let log: string[];
const person = { author: 'Pessoa', source: 'human' as const };

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-autoreview-'));
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'anexos'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
  const s = router.snapshot();
  const parent = s.workflows.find((w) => w.kind === 'parent')!;
  storyId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === parent.id)!.id,
    columnId: s.columns.find((c) => c.name === 'Implementação')!.id,
    parentId: null,
    title: 'Login',
  });
  log = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const reviewer = () =>
  router.handle({
    type: 'harness.agent.create',
    input: {
      name: 'revisor-de-codigo',
      description: 'Revisa o diff da história.',
      body: 'Revise o diff.',
      model: '',
      tools: ['Read', 'Grep', 'Bash'],
      deniedTools: [],
      skills: [],
      mcp: [],
    },
  });
const branch = (name = 'historia/1-login') => {
  (router as unknown as { ctx: { cards: { setWorkspace(id: string, branch: string, path: string): void } } }).ctx.cards.setWorkspace(
    storyId,
    name,
    '',
  );
  router.invalidateSnapshot();
};
const column = (name: string) => router.snapshot().columns.find((c) => c.name === name)!;
const toReview = () => router.handle({ type: 'card.move', cardId: storyId, columnId: column('Revisão').id, position: 0 }, person);
const children = () => router.snapshot().cards.filter((c) => c.parentId === storyId);
const storyComments = () =>
  router
    .snapshot()
    .comments.filter((c) => c.cardId === storyId)
    .map((c) => c.body);

describe('sub-tarefa de revisão criada pelo board', () => {
  it('a história com branch entra na Revisão e ganha a sub-tarefa do revisor, com Fase, agente, descrição conferível e a nota', () => {
    reviewer();
    branch();
    watchAutoReview(
      router,
      () => true,
      (l) => log.push(l),
    );
    toReview();
    const kids = children();
    expect(kids).toHaveLength(1);
    const sub = kids[0]!;
    const s = router.snapshot();
    expect(sub.title).toBe('Revisar diff da história #1 contra a base');
    expect(valueOf(s, sub.id, s.fieldDefs.find((f) => f.name === 'Fase')!.id)).toBe('Revisão');
    expect(s.board.execProfiles.find((p) => p.id === sub.execProfile)?.name).toBe('revisor-de-codigo');
    // a descrição passa na conferência do orquestrador e traz o roteiro e o veredito
    expect(briefFailures([sub])).toEqual([]);
    expect(sub.description).toContain('VEREDITO: APROVADO|REPROVADO|NÃO COMPROVADO');
    expect(sub.description).toContain('`historia/1-login`');
    expect(storyComments().some((b) => b.startsWith(AUTO_REVIEW_MARK) && b.includes(`#${sub.number}`))).toBe(true);
    expect(log.join('\n')).toContain('criada pelo board');
    // de volta e de novo na Revisão: a sub-tarefa que já existe na fase basta
    router.handle({ type: 'card.move', cardId: storyId, columnId: column('Implementação').id, position: 0 }, person);
    toReview();
    expect(children()).toHaveLength(1);
  });

  it('com a base conhecida, o título e a descrição dizem contra que branch revisar', () => {
    reviewer();
    branch();
    (router as unknown as { ctx: { cards: { setBaseBranch(id: string, base: string): void } } }).ctx.cards.setBaseBranch(
      storyId,
      'develop',
    );
    router.invalidateSnapshot();
    watchAutoReview(
      router,
      () => true,
      () => {},
    );
    toReview();
    const sub = children()[0]!;
    expect(sub.title).toBe('Revisar diff da história #1 contra develop');
    expect(sub.description).toContain('`git diff develop...HEAD`');
  });

  it('sem o revisor-de-codigo nos agentes do board, sem branch ou fora da janela dona, nada é criado', () => {
    // sem o agente
    branch();
    watchAutoReview(
      router,
      () => true,
      () => {},
    );
    toReview();
    expect(children()).toHaveLength(0);
    expect(
      autoReviewOf(
        router.snapshot(),
        router.snapshot().cards.find((c) => c.id === storyId)!,
      ),
    ).toBeNull();
  });

  it('sem branch não há diff a revisar: a IA conduz a fase como antes', () => {
    reviewer();
    watchAutoReview(
      router,
      () => true,
      () => {},
    );
    toReview();
    expect(children()).toHaveLength(0);
  });

  it('a janela que não é dona do board não cria', () => {
    reviewer();
    branch();
    watchAutoReview(
      router,
      () => false,
      () => {},
    );
    toReview();
    expect(children()).toHaveLength(0);
  });

  it('a história já parada na Revisão ao abrir o board não ganha sub-tarefa; só a que entra depois', () => {
    reviewer();
    branch();
    toReview();
    const stop = watchAutoReview(
      router,
      () => true,
      () => {},
    );
    router.handle({ type: 'card.update', cardId: storyId, patch: { title: 'Login com e-mail' } }, person);
    expect(children()).toHaveLength(0);
    stop();
  });

  it('a descrição tem as quatro seções obrigatórias', () => {
    const story = router.snapshot().cards.find((c) => c.id === storyId)!;
    const text = reviewBrief({ ...story, branch: 'historia/1-login' }, 'main');
    for (const name of ['Objetivo', 'Pronto quando', 'Pode tocar', 'Não pode tocar']) expect(text).toContain(`### ${name}`);
  });
});
