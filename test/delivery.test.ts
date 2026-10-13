import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');
const PR = 'https://github.com/acme/app/pull/7';

let router: MessageRouter;
let storyId: string;

const card = (id: string) => router.snapshot().cards.find((c) => c.id === id)!;
const columnOf = (id: string) => router.snapshot().columns.find((c) => c.id === card(id).columnId)!.name;
const deliveryComments = (id: string) => router.snapshot().comments.filter((c) => c.cardId === id && c.body.includes('entregue com'));

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-delivery'),
  });
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  storyId = router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.name === 'Discovery' && c.workflowId === wf.id)!.id,
    parentId: null,
    title: 'Login',
  });
  router.handle({ type: 'card.yolo.set', cardId: storyId, enabled: true });
});

const homologacao = () => router.snapshot().columns.find((c) => c.name === 'Homologação')!.id;
const moveToHomologacao = () => router.handle({ type: 'card.move', cardId: storyId, columnId: homologacao(), position: 0 });

describe('entrega da história em modo autônomo', () => {
  it('RF1: registrar o PR antes de chegar na última coluna não entrega; mover para lá entrega depois', () => {
    router.handle({ type: 'card.pr.set', cardId: storyId, url: PR });
    expect(card(storyId).status).not.toBe('waiting_review');
    expect(deliveryComments(storyId)).toHaveLength(0);

    moveToHomologacao();
    expect(columnOf(storyId)).toBe('Homologação');
    expect(card(storyId).status).toBe('waiting_review');
    expect(deliveryComments(storyId)).toHaveLength(1);
    expect(deliveryComments(storyId)[0]!.body).toContain(PR);
  });

  it('RF1 variante: mover a SUB-TAREFA para a última coluna entrega a história-mãe', () => {
    const s = router.snapshot();
    const wf = s.workflows.find((w) => w.kind === 'child')!;
    const subId = router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: s.columns.find((c) => c.workflowId === wf.id)!.id,
      parentId: storyId,
      title: 'Passo',
    });
    router.handle({ type: 'card.pr.set', cardId: subId, url: PR });
    expect(card(storyId).status).not.toBe('waiting_review');

    router.handle({ type: 'card.move', cardId: storyId, columnId: homologacao(), position: 0 });
    // o movimento foi da história; agora mover a sub-tarefa (já dentro da coluna correta da história
    // não é o caso aqui, mas o handler deve resolver a história a partir do card movido mesmo quando é
    // a sub-tarefa quem se move)
    const subsWf = router.snapshot().workflows.find((w) => w.kind === 'child')!;
    const subCol = router.snapshot().columns.find((c) => c.workflowId === subsWf.id && c.name !== 'A fazer')!;
    router.handle({ type: 'card.move', cardId: subId, columnId: subCol.id, position: 0 });

    expect(card(storyId).status).toBe('waiting_review');
    expect(deliveryComments(storyId)).toHaveLength(1);
  });

  it('RF2: mover para a última coluna sem prUrl não entrega', () => {
    moveToHomologacao();
    expect(card(storyId).status).not.toBe('waiting_review');
    expect(deliveryComments(storyId)).toHaveLength(0);
  });

  it('RF3: história bloqueada na última coluna com PR não é entregue por nenhum gatilho', () => {
    moveToHomologacao();
    router.handle({ type: 'card.status.set', cardId: storyId, status: 'blocked', note: 'impedimento' });
    router.handle({ type: 'card.pr.set', cardId: storyId, url: PR });
    expect(card(storyId).status).toBe('blocked');
    expect(deliveryComments(storyId)).toHaveLength(0);

    // mover de novo (mesma coluna) não entrega enquanto bloqueada
    moveToHomologacao();
    expect(card(storyId).status).toBe('blocked');
    expect(deliveryComments(storyId)).toHaveLength(0);
  });

  it('RF5 (regressão): já na última coluna sem PR, registrar o PR entrega na hora', () => {
    moveToHomologacao();
    router.handle({ type: 'card.pr.set', cardId: storyId, url: PR });
    expect(card(storyId).status).toBe('waiting_review');
    expect(deliveryComments(storyId)).toHaveLength(1);
  });

  it('a pessoa move o card: o comentário de entrega sai com o autor e a fonte da IA, não com o nome da pessoa', () => {
    router.handle({ type: 'card.pr.set', cardId: storyId, url: PR });
    moveToHomologacao();
    const [comment] = deliveryComments(storyId);
    expect(comment).toMatchObject({ author: 'Claude Code', source: 'ai' });
    expect(comment!.author).not.toBe('Pessoa');
  });

  it('RF6: depois de entregue, reavaliar a entrega não duplica o comentário', () => {
    router.handle({ type: 'card.pr.set', cardId: storyId, url: PR });
    moveToHomologacao();
    expect(deliveryComments(storyId)).toHaveLength(1);

    // simula a reavaliação que o runner faz ao fim de uma execução
    expect(router.settleDelivery(storyId)).toBe(false);
    expect(deliveryComments(storyId)).toHaveLength(1);
    expect(card(storyId).status).toBe('waiting_review');
  });
});
