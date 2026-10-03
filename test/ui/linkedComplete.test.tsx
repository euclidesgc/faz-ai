import { lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { requestMove } from '../../src/webview/store/actions';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
let ids: { pai: string; filho: string; outro: string; done: string };
beforeAll(async () => {
  board = await seedBoard();
  const s = board.router.snapshot();
  const wf = s.workflows.find((w) => w.kind === 'parent')!;
  const typeId = s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id;
  const cols = s.columns.filter((c) => c.workflowId === wf.id).sort((a, b) => a.position - b.position);
  const make = (title: string) => board.router.createCard({ typeId, columnId: cols[0]!.id, parentId: null, title });
  ids = { pai: make('Pai'), filho: make('Filho'), outro: make('Outro filho'), done: cols.find((c) => c.category === 'done')!.id };
});
beforeEach(() => {
  for (const l of board.router.snapshot().links) board.router.handle({ type: 'link.remove', linkId: l.id });
  board.router.handle({ type: 'settings.rules.update', patch: { onAllChildrenDone: 'ask' } });
  board.router.handle({
    type: 'card.move',
    cardId: ids.filho,
    columnId: board.router.snapshot().cards.find((c) => c.id === ids.pai)!.columnId,
    position: 0,
  });
  syncStore(board.router);
  useBoardStore.setState({ dialog: null });
  posted.mockClear();
});

describe('concluir o pai quando o último filho vinculado conclui', () => {
  it('pergunta e, ao confirmar, move o pai para a coluna de conclusão', () => {
    board.router.handle({ type: 'link.add', fromId: ids.pai, toId: ids.filho, kind: 'child' });
    syncStore(board.router);
    requestMove(ids.filho, ids.done, 0);
    expect(lastSent('card.move')).toMatchObject({ cardId: ids.filho, columnId: ids.done });
    const dialog = useBoardStore.getState().dialog!;
    expect(dialog.title).toBe('Todos os filhos vinculados foram concluídos');
    dialog.onConfirm();
    expect(sentOf('card.move').at(-1)).toMatchObject({ cardId: ids.pai, columnId: ids.done });
  });

  it('com outro filho ainda em aberto, não pergunta', () => {
    board.router.handle({ type: 'link.add', fromId: ids.pai, toId: ids.filho, kind: 'child' });
    board.router.handle({ type: 'link.add', fromId: ids.pai, toId: ids.outro, kind: 'child' });
    syncStore(board.router);
    requestMove(ids.filho, ids.done, 0);
    expect(useBoardStore.getState().dialog).toBeNull();
  });

  it('com a regra em automático, move o pai sem perguntar', () => {
    board.router.handle({ type: 'settings.rules.update', patch: { onAllChildrenDone: 'auto' } });
    board.router.handle({ type: 'link.add', fromId: ids.pai, toId: ids.filho, kind: 'child' });
    syncStore(board.router);
    requestMove(ids.filho, ids.done, 0);
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(sentOf('card.move').at(-1)).toMatchObject({ cardId: ids.pai, columnId: ids.done });
  });
});
