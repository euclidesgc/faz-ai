import { renderThemed, lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen } from '@testing-library/react';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { archiveKey } from '../../src/shared/filters';
import { laneOf } from '../../src/shared/dragLanes';
import type { BoardState, Card, Workflow } from '../../src/shared/model';
import { archivedIn, cardsIn, columnsOf } from '../../src/shared/selectors';
import { WorkflowRow } from '../../src/webview/components/WorkflowRow';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { SETTLE_TIMEOUT_MS, useDragLanes } from '../../src/webview/useDragLanes';

// jsdom não mede layout: os handlers do DndContext são chamados direto, com eventos mínimos.
// O centro vertical do card arrastado decide "acima/abaixo" do alvo (`below`).

type Rect = { top: number; height: number };
const ABOVE: Rect = { top: 0, height: 10 };
const BELOW: Rect = { top: 100, height: 10 };
const OVER_RECT: Rect = { top: 50, height: 10 };

const start = (id: string) => ({ active: { id } }) as unknown as DragStartEvent;
const over = (id: string, overId: string | null, active: Rect = ABOVE) =>
  ({
    active: { id, rect: { current: { translated: active } } },
    over: overId === null ? null : { id: overId, rect: OVER_RECT },
  }) as unknown as DragOverEvent & DragEndEvent;

let board: SeededBoard;
let ids: { a: string; b: string; c: string; d: string; e: string };

const st = (): BoardState => useBoardStore.getState().state!;
const parentWf = (): Workflow => st().workflows.find((w) => w.kind === 'parent')!;
const childWf = (): Workflow => st().workflows.find((w) => w.kind === 'child')!;
const cols = (wf: Workflow) => columnsOf(st(), wf.id);
const order = (colId: string) => cardsIn(st(), colId).map((c) => c.id);
const typeOf = (wf: Workflow) => st().cardTypes.find((t) => t.defaultWorkflowId === wf.id)!;

/** Cria um card no workflow, na coluna dada, no fim. */
function make(wf: Workflow, columnId: string, title: string, parentId: string | null = null): string {
  const id = board.router.createCard({ typeId: typeOf(wf).id, columnId, parentId, title });
  syncStore(board.router);
  return id;
}

type Props = { state: BoardState; error: string | null; filter?: Set<string> | null };

function mount(wf: Workflow, filter: Set<string> | null = null, error: string | null = null) {
  const visible = (cs: Card[]) => (filter ? cs.filter((c) => filter.has(c.id)) : cs);
  return renderHook(
    (p: Props) => {
      const columns = columnsOf(p.state, wf.id);
      return useDragLanes({ workflow: wf, state: p.state, columns, visible, error: p.error });
    },
    { initialProps: { state: st(), error } as Props },
  );
}
type Hook = ReturnType<typeof mount>;

/** Arrasta `id` até `overId` e solta. */
function drag(h: Hook, id: string, overId: string | null, rect: Rect = ABOVE) {
  act(() => h.result.current.handlers.onDragStart(start(id)));
  const from = laneOf(h.result.current.lanes!, id);
  act(() => h.result.current.handlers.onDragOver(over(id, overId, rect)));
  act(() => {
    vi.advanceTimersByTime(20); // libera a guarda de um quadro do onDragOver
  });
  // Quando a prévia troca de faixa, o card abre espaço sob o ponteiro e o `over` passa a ser ele mesmo (no navegador, verificado).
  const moved = laneOf(h.result.current.lanes!, id) !== from;
  act(() => h.result.current.handlers.onDragEnd(over(id, moved ? id : overId, rect)));
}
const shownIds = (h: Hook, lane: string) => h.result.current.shown[lane]!.map((c) => c.id);

beforeEach(async () => {
  board = await seedBoard();
  const wf = parentWf();
  const [c0, c1] = cols(wf);
  const a = make(wf, c0!.id, 'A');
  const b = make(wf, c0!.id, 'B');
  const c = make(wf, c0!.id, 'C');
  const d = make(wf, c1!.id, 'D');
  const e = make(wf, c1!.id, 'E');
  ids = { a, b, c, d, e };
  posted.mockClear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
});

afterEach(() => {
  vi.useRealTimers();
  useBoardStore.setState({ error: null });
});

describe('arraste: mesma coluna', () => {
  it('subir um card envia card.move para antes do alvo', () => {
    const [c0] = cols(parentWf());
    const h = mount(parentWf());
    const before = order(c0!.id);
    drag(h, ids.c, ids.a);
    const m = lastSent('card.move');
    expect(m).toMatchObject({ cardId: ids.c, columnId: c0!.id });
    const expected = before.filter((x) => x !== ids.c);
    expected.splice(expected.indexOf(ids.a), 0, ids.c);
    // a posição enviada reproduz, no host, exatamente a ordem exibida
    board.router.handle(m);
    syncStore(board.router);
    expect(order(c0!.id)).toEqual(expected);
  });

  it('descer um card envia card.move para depois do alvo', () => {
    const [c0] = cols(parentWf());
    const h = mount(parentWf());
    const before = order(c0!.id);
    drag(h, ids.a, ids.b);
    const m = lastSent('card.move');
    expect(m).toMatchObject({ cardId: ids.a, columnId: c0!.id });
    const expected = before.filter((x) => x !== ids.a);
    expected.splice(expected.indexOf(ids.b) + 1, 0, ids.a);
    board.router.handle(m);
    syncStore(board.router);
    expect(order(c0!.id)).toEqual(expected);
  });

  it('soltar sobre si mesmo não envia nada', () => {
    const h = mount(parentWf());
    drag(h, ids.b, ids.b);
    expect(sentOf('card.move')).toHaveLength(0);
    expect(h.result.current.settled).toBeNull();
  });
});

describe('arraste: entre colunas', () => {
  const reach = (h: Hook, id: string, overId: string, rect: Rect) => {
    drag(h, id, overId, rect);
    return lastSent('card.move');
  };

  it('para o início, o meio e o fim da outra coluna', () => {
    const [, c1] = cols(parentWf());
    const cases: { id: string; overId: string; rect: Rect; expected: string[] }[] = [
      { id: ids.a, overId: ids.d, rect: ABOVE, expected: [ids.a, ids.d, ids.e] },
      { id: ids.a, overId: ids.d, rect: BELOW, expected: [ids.d, ids.a, ids.e] },
      { id: ids.a, overId: ids.e, rect: BELOW, expected: [ids.d, ids.e, ids.a] },
    ];
    for (const { id, overId, rect, expected } of cases) {
      const fresh = mount(parentWf());
      const m = reach(fresh, id, overId, rect);
      expect(m.columnId).toBe(c1!.id);
      // a posição enviada, aplicada à coluna de destino, reproduz a ordem esperada
      const idx = m.position;
      const base = order(c1!.id);
      base.splice(idx, 0, id);
      expect(base).toEqual(expected);
      posted.mockClear();
    }
  });

  it('o `over` antigo depois da troca de faixa: a soltura repete o que o SortableContext mostra', () => {
    const [, c1] = cols(parentWf());
    const h = mount(parentWf());
    act(() => h.result.current.handlers.onDragStart(start(ids.a)));
    act(() => h.result.current.handlers.onDragOver(over(ids.a, ids.d, BELOW))); // prévia: [D, A, E]
    act(() => {
      vi.advanceTimersByTime(20);
    });
    // o ponteiro segue sobre D (retângulos ainda não remedidos): o card aparece antes de D, e é aí que ele cai
    act(() => h.result.current.handlers.onDragEnd(over(ids.a, ids.d, BELOW)));
    const m = lastSent('card.move');
    expect(m).toMatchObject({ cardId: ids.a, columnId: c1!.id, position: 0 });
  });

  it('para uma coluna vazia', () => {
    const empty = cols(parentWf())[2]!;
    expect(order(empty.id)).toEqual([]);
    const h = mount(parentWf());
    drag(h, ids.a, empty.id);
    expect(lastSent('card.move')).toMatchObject({ cardId: ids.a, columnId: empty.id, position: 0 });
  });

  it('a prévia muda de faixa antes de soltar', () => {
    const [c0, c1] = cols(parentWf());
    const h = mount(parentWf());
    act(() => h.result.current.handlers.onDragStart(start(ids.a)));
    act(() => h.result.current.handlers.onDragOver(over(ids.a, ids.d)));
    expect(shownIds(h, c0!.id)).not.toContain(ids.a);
    expect(shownIds(h, c1!.id)).toContain(ids.a);
    expect(h.result.current.activeId).toBe(ids.a);
    expect(sentOf('card.move')).toHaveLength(0);
  });
});

describe('arraste: filtro ativo', () => {
  it('manda a posição certa com cards escondidos entre os visíveis', () => {
    const [c0] = cols(parentWf());
    // B fica escondido entre A e C
    const h = mount(parentWf(), new Set([ids.a, ids.c, ...order(c0!.id).filter((x) => ![ids.a, ids.b, ids.c].includes(x))]));
    drag(h, ids.c, ids.a);
    const m = lastSent('card.move');
    board.router.handle(m);
    syncStore(board.router);
    const after = order(c0!.id);
    expect(after.indexOf(ids.c)).toBeLessThan(after.indexOf(ids.a));
    // o escondido continua depois de A, que ficou logo depois de C
    expect(after.indexOf(ids.b)).toBeGreaterThan(after.indexOf(ids.a));
  });
});

describe('arraste: arquivar e desarquivar', () => {
  it('soltar na faixa de arquivados envia card.archive', () => {
    const h = mount(parentWf());
    drag(h, ids.a, archiveKey(parentWf().id));
    expect(lastSent('card.archive')).toEqual({ type: 'card.archive', cardId: ids.a });
    expect(sentOf('card.move')).toHaveLength(0);
  });

  it('soltar sobre um card já arquivado também arquiva', () => {
    board.router.handle({ type: 'card.archive', cardId: ids.e });
    syncStore(board.router);
    const h = mount(parentWf());
    drag(h, ids.a, ids.e);
    expect(lastSent('card.archive')).toEqual({ type: 'card.archive', cardId: ids.a });
  });

  it('ao arquivar, o card some do lugar antigo na hora e fica no topo dos arquivados até o state chegar', () => {
    const [c0] = cols(parentWf());
    const h = mount(parentWf());
    drag(h, ids.a, archiveKey(parentWf().id));
    expect(h.result.current.settled).not.toBeNull();
    expect(shownIds(h, c0!.id)).not.toContain(ids.a);
    expect(shownIds(h, archiveKey(parentWf().id))[0]).toBe(ids.a);
    board.router.handle(lastSent('card.archive'));
    syncStore(board.router);
    h.rerender({ state: st(), error: null });
    expect(h.result.current.settled).toBeNull();
    expect(shownIds(h, archiveKey(parentWf().id))).toEqual([ids.a]);
  });

  it('arrastar um arquivado para uma coluna envia card.unarchive com coluna e posição', () => {
    board.router.handle({ type: 'card.archive', cardId: ids.a });
    syncStore(board.router);
    expect(archivedIn(st(), parentWf().id).map((c) => c.id)).toEqual([ids.a]);
    const [, c1] = cols(parentWf());
    const h = mount(parentWf());
    drag(h, ids.a, ids.d, BELOW);
    const m = lastSent('card.unarchive');
    expect(m).toMatchObject({ cardId: ids.a, columnId: c1!.id });
    expect(m.position).toBe(1);
  });

  it('um card vivo não entra na faixa de arquivados só passando por cima de um arquivado', () => {
    board.router.handle({ type: 'card.archive', cardId: ids.e });
    syncStore(board.router);
    const h = mount(parentWf());
    act(() => h.result.current.handlers.onDragStart(start(ids.a)));
    act(() => h.result.current.handlers.onDragOver(over(ids.a, ids.e)));
    expect(shownIds(h, archiveKey(parentWf().id))).not.toContain(ids.a);
  });
});

describe('arraste: cancelar e soltar fora', () => {
  it('onDragCancel não envia nada e restaura a ordem do state', () => {
    const [c0] = cols(parentWf());
    const h = mount(parentWf());
    const before = order(c0!.id);
    act(() => h.result.current.handlers.onDragStart(start(ids.a)));
    act(() => h.result.current.handlers.onDragOver(over(ids.a, ids.d)));
    expect(h.result.current.lanes).not.toBeNull();
    act(() => h.result.current.handlers.onDragCancel());
    expect(posted).not.toHaveBeenCalled();
    expect(h.result.current.lanes).toBeNull();
    expect(h.result.current.activeId).toBeNull();
    expect(h.result.current.settled).toBeNull();
    expect(shownIds(h, c0!.id)).toEqual(before);
  });

  it('over nulo não envia nada e restaura a ordem do state', () => {
    const [c0] = cols(parentWf());
    const h = mount(parentWf());
    const before = order(c0!.id);
    drag(h, ids.a, null);
    expect(posted).not.toHaveBeenCalled();
    expect(h.result.current.settled).toBeNull();
    expect(shownIds(h, c0!.id)).toEqual(before);
  });
});

describe('soltura otimista', () => {
  const dropAtoE = (h: Hook) => drag(h, ids.a, ids.e, BELOW);

  it('mostra a posição final logo depois de soltar', () => {
    const [c0, c1] = cols(parentWf());
    const h = mount(parentWf());
    dropAtoE(h);
    expect(h.result.current.settled).not.toBeNull();
    expect(shownIds(h, c1!.id)).toEqual([ids.d, ids.e, ids.a]);
    expect(shownIds(h, c0!.id)).not.toContain(ids.a);
  });

  it('um arraste novo antes da resposta do host parte da ordem que está na tela', () => {
    const [c0, c1] = cols(parentWf());
    const h = mount(parentWf());
    dropAtoE(h);
    expect(h.result.current.settled).not.toBeNull();
    act(() => h.result.current.handlers.onDragStart(start(ids.b)));
    expect(h.result.current.settled).toBeNull();
    expect(shownIds(h, c1!.id)).toEqual([ids.d, ids.e, ids.a]);
    expect(shownIds(h, c0!.id)).not.toContain(ids.a);
  });

  it('some quando chega um state equivalente', () => {
    const h = mount(parentWf());
    dropAtoE(h);
    expect(h.result.current.settled).not.toBeNull();
    board.router.handle(lastSent('card.move'));
    syncStore(board.router);
    h.rerender({ state: st(), error: null });
    expect(h.result.current.settled).toBeNull();
    expect(shownIds(h, cols(parentWf())[1]!.id)).toEqual([ids.d, ids.e, ids.a]);
  });

  it('some quando surge um erro', () => {
    const h = mount(parentWf());
    dropAtoE(h);
    expect(h.result.current.settled).not.toBeNull();
    h.rerender({ state: st(), error: 'falhou' });
    expect(h.result.current.settled).toBeNull();
    expect(shownIds(h, cols(parentWf())[0]!.id)).toContain(ids.a);
  });

  it('um erro que já existia ao soltar não descarta a pendência', () => {
    const h = mount(parentWf(), null, 'antigo');
    dropAtoE(h);
    expect(h.result.current.settled).not.toBeNull();
  });

  it(`some depois de ${SETTLE_TIMEOUT_MS} ms sem resposta do host`, () => {
    const h = mount(parentWf());
    dropAtoE(h);
    expect(h.result.current.settled).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(SETTLE_TIMEOUT_MS - 100);
    });
    expect(h.result.current.settled).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(h.result.current.settled).toBeNull();
    expect(shownIds(h, cols(parentWf())[0]!.id)).toContain(ids.a);
  });
});

describe('diálogo de cancelamento', () => {
  it('requestMove devolve "asked": nada é enviado nem fica em settled', () => {
    const wf = parentWf();
    const cancelled = cols(wf).find((c) => c.category === 'cancelled')!;
    // a história semeada tem uma sub-tarefa em aberto
    const h = mount(wf);
    drag(h, board.storyId, cancelled.id);
    expect(sentOf('card.move')).toHaveLength(0);
    expect(h.result.current.settled).toBeNull();
    expect(useBoardStore.getState().dialog).not.toBeNull();
    const first = cols(wf)[0]!;
    expect(shownIds(h, first.id)).toContain(board.storyId);
  });
});

describe('workflows pai e filho no mesmo componente', () => {
  it('WorkflowRow renderiza o pai e o filho com as faixas do hook', () => {
    for (const wf of [parentWf(), childWf()]) {
      const { unmount } = renderThemed(<WorkflowRow workflow={wf} />);
      for (const col of cols(wf)) expect(screen.getAllByText(col.name).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('o filho reordena e move com o mesmo hook', () => {
    const wf = childWf();
    const [k0, k1] = cols(wf);
    const x = make(wf, k0!.id, 'X', board.storyId);
    const y = make(wf, k0!.id, 'Y', board.storyId);
    const h = mount(wf);
    drag(h, y, x);
    expect(lastSent('card.move')).toMatchObject({ cardId: y, columnId: k0!.id });
    posted.mockClear();
    const h2 = mount(wf);
    drag(h2, x, k1!.id);
    expect(lastSent('card.move')).toMatchObject({ cardId: x, columnId: k1!.id, position: 0 });
    // o pai não é afetado pelas faixas do filho
    const hp = mount(parentWf());
    expect(Object.keys(hp.result.current.shown)).not.toContain(k0!.id);
  });
});
