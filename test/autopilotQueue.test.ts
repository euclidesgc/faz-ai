import { beforeEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { autopilotQueue, queuePositions } from '../src/shared/autopilotQueue';
import type { CardStatus } from '../src/shared/status';

// A fila do modo autônomo: a ordem em que o autopiloto trata as histórias e a posição que cada card mostra.

const WASM_DIR = path.resolve(__dirname, '../node_modules/sql.js/dist');

let router: MessageRouter;
const card = (n: number) => router.snapshot().cards.find((c) => c.number === n)!;
const ai = (msg: Parameters<MessageRouter['handle']>[0]) => router.handle(msg, { author: 'Claude Code', source: 'ai' });
const yolo = (n: number) => router.handle({ type: 'card.yolo.set', cardId: card(n).id, enabled: true });
const status = (n: number, s: CardStatus | null, note?: string) => ai({ type: 'card.status.set', cardId: card(n).id, status: s, note });
const create = (title: string, column: string, parent?: number) => {
  const s = router.snapshot();
  const wf = s.workflows.find((w) => w.kind === (parent ? 'child' : 'parent'))!;
  return router.createCard({
    typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
    columnId: s.columns.find((c) => c.workflowId === wf.id && c.name === column)!.id,
    parentId: parent ? card(parent).id : null,
    title,
  });
};
const order = () => autopilotQueue(router.snapshot()).map((c) => c.number);
const positions = () =>
  Object.fromEntries(
    [...queuePositions(router.snapshot())].map(([id, n]) => [router.snapshot().cards.find((c) => c.id === id)!.number, n]),
  );

beforeEach(async () => {
  const db = await openInMemory(WASM_DIR);
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(os.tmpdir(), 'fazai-queue'),
  });
});

describe('autopilotQueue', () => {
  it('segue a ordem do board: a coluna mais à direita primeiro, depois de cima para baixo; só histórias em modo autônomo', () => {
    create('A', 'PRD'); // #1
    create('B', 'Spec'); // #2, mais à direita
    create('C', 'PRD'); // #3, abaixo da A
    create('D', 'PRD'); // #4, fora do modo
    yolo(1);
    yolo(2);
    yolo(3);
    expect(order()).toEqual([2, 1, 3]);
  });

  it('a história que depende de outra da fila vem depois dela, mesmo estando acima no board', () => {
    create('Depende', 'PRD'); // #1, no topo
    create('Base', 'PRD'); // #2, abaixo
    ai({ type: 'link.add', fromId: card(2).id, toId: card(1).id, kind: 'precedes' });
    yolo(1);
    yolo(2);
    expect(order()).toEqual([2, 1]);
  });

  it('a história derivada vem depois da origem, e a dependência de uma sub-tarefa também segura a história', () => {
    create('Parte 2', 'Backlog'); // #1
    create('Parte 1', 'Backlog'); // #2
    ai({ type: 'card.derive', cardId: card(1).id, fromId: card(2).id });
    create('Outra', 'Backlog'); // #3, cuja sub-tarefa depende da #1
    create('Passo', 'A fazer', 3); // #4
    ai({ type: 'link.add', fromId: card(1).id, toId: card(4).id, kind: 'precedes' });
    yolo(1);
    yolo(2);
    yolo(3);
    expect(order()).toEqual([2, 1, 3]);
  });

  it('dependência de fora da fila não muda a ordem (a história espera, mas a vez é decidida pelo autopiloto)', () => {
    create('Base', 'PRD'); // #1, fora do modo
    create('Depende', 'PRD'); // #2
    create('Livre', 'PRD'); // #3
    ai({ type: 'link.add', fromId: card(1).id, toId: card(2).id, kind: 'precedes' });
    yolo(2);
    yolo(3);
    expect(order()).toEqual([2, 3]);
  });

  it('um ciclo de dependências não trava a fila: a primeira pela ordem do board entra, as outras seguem', () => {
    create('A', 'PRD'); // #1
    create('B', 'PRD'); // #2
    ai({ type: 'link.add', fromId: card(2).id, toId: card(1).id, kind: 'precedes' });
    // o segundo vínculo fecharia o ciclo pelo handler; simula o estado direto
    yolo(1);
    yolo(2);
    const s = router.snapshot();
    const cyclic = { ...s, links: [...s.links, { id: 'x', fromId: card(1).id, toId: card(2).id, kind: 'precedes' as const }] };
    expect(autopilotQueue(cyclic).map((c) => c.number)).toEqual([1, 2]);
  });
});

describe('queuePositions', () => {
  it('numera só quem espera a vez: a história em execução e a que está com a pessoa ficam sem posição', () => {
    create('Rodando', 'Spec'); // #1
    create('Espera', 'PRD'); // #2
    create('Bloqueada', 'PRD'); // #3
    create('Espera também', 'PRD'); // #4
    yolo(1);
    yolo(2);
    yolo(3);
    yolo(4);
    status(1, 'running');
    status(3, 'blocked', 'Falta acesso');
    expect(positions()).toEqual({ 2: 1, 4: 2 });
  });

  it('a história cuja sub-tarefa está em execução também fica sem posição', () => {
    create('H', 'Implementação'); // #1
    create('Passo', 'A fazer', 1); // #2
    create('Próxima', 'PRD'); // #3
    yolo(1);
    yolo(3);
    status(2, 'running');
    expect(positions()).toEqual({ 3: 1 });
  });

  it('a história concluída sai da fila', () => {
    create('A', 'PRD'); // #1
    create('B', 'PRD'); // #2
    yolo(1);
    yolo(2);
    const done = router.snapshot().columns.find((c) => c.category === 'done' && c.workflowId === card(1).workflowId)!;
    ai({ type: 'card.move', cardId: card(1).id, columnId: done.id, position: 0 });
    expect(positions()).toEqual({ 2: 1 });
  });
});
