import { choose, lastSent, posted, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import userEvent from '@testing-library/user-event';
import { AutopilotButton } from '../../src/webview/components/AutopilotButton';
import { CardDrawer } from '../../src/webview/components/CardDrawer';
import { Dialog } from '../../src/webview/components/Dialog';
import { Board } from '../../src/webview/components/Board';
import { useBoardStore } from '../../src/webview/store/boardStore';
import type { Autopilot, BoardState, Card } from '../../src/shared/model';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => {
  syncStore(board.router);
  posted.mockClear();
  useBoardStore.getState().setYoloUntilName('');
});

const patchState = (patch: (s: BoardState) => Partial<BoardState>) => {
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, ...patch(s) } });
};
const patchCard = (id: string, patch: Partial<Card>) =>
  patchState((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
const autopilot = (value: Autopilot) => patchState(() => ({ autopilot: value }));
const openDrawer = (id: string) => {
  useBoardStore.getState().openCard(id);
  return render(
    <Theme>
      <CardDrawer cardId={id} />
      <Dialog />
    </Theme>,
  );
};

describe('modo autônomo no painel do card', () => {
  it('ligar pede confirmação, explicando o que o modo faz, e só então envia card.yolo.set', async () => {
    openDrawer(board.storyId);
    const toggle = screen.getByRole('checkbox', { name: /Modo autônomo/ });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(sentOf('card.yolo.set')).toEqual([]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/até a fase que você escolher/)).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Não avisar novamente' })).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar o modo autônomo' }));
    // sem mexer no "Até onde", vai até o fim: o pull request
    expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: true, until: null });
  });

  it('o "Até onde" lista as fases da IA a partir da coluna atual e manda a escolhida; a escolha volta da próxima vez', async () => {
    const col = (name: string) => useBoardStore.getState().state!.columns.find((c) => c.name === name)!;
    const first = openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    const dialog = await screen.findByRole('dialog');
    const until = within(dialog).getByRole('combobox', { name: 'Até onde' });
    expect(until).toHaveTextContent('Homologação (abre o pull request)');
    await userEvent.click(until);
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Discovery',
      'PRD',
      'Spec',
      'Plan',
      'Implementação',
      'Revisão',
      'Homologação (abre o pull request)',
    ]);
    await userEvent.click(screen.getByRole('option', { name: 'Plan' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar o modo autônomo' }));
    expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: true, until: col('Plan').id });
    expect(useBoardStore.getState().yoloUntilName).toBe('Plan');
    first.unmount();

    openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    expect(within(await screen.findByRole('dialog')).getByRole('combobox', { name: 'Até onde' })).toHaveTextContent('Plan');
  });

  it('com o modo ligado até uma fase, a barra mostra até onde e troca a fase sem perguntar de novo', async () => {
    const col = (name: string) => useBoardStore.getState().state!.columns.find((c) => c.name === name)!;
    patchCard(board.storyId, { yolo: true, yoloUntil: col('Spec').id });
    openDrawer(board.storyId);
    expect(screen.getByRole('checkbox', { name: /Modo autônomo até/ })).toBeChecked();
    const until = screen.getByRole('combobox', { name: 'Até onde vai o modo autônomo' });
    expect(until).toHaveTextContent('Spec');
    await choose(until, 'Revisão');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: true, until: col('Revisão').id });
  });

  it('"Não avisar novamente" marcado: liga desta vez e as próximas ligam sem perguntar (#416)', async () => {
    try {
      const first = openDrawer(board.storyId);
      await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Não avisar novamente' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar o modo autônomo' }));
      expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: true, until: null });
      expect(useBoardStore.getState().dontWarnYolo).toBe(true);
      first.unmount();

      openDrawer(board.storyId);
      await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
      expect(useBoardStore.getState().dialog).toBeNull();
      expect(sentOf('card.yolo.set')).toHaveLength(2);
    } finally {
      useBoardStore.getState().setDontWarnYolo(false);
    }
  });

  it('depois de confirmar, a caixa já aparece marcada e travada até o boardState confirmar', async () => {
    openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ligar o modo autônomo' }));
    const toggle = screen.getByRole('checkbox', { name: /Modo autônomo/ });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();

    act(() => patchCard(board.storyId, { yolo: true }));
    expect(screen.getByRole('checkbox', { name: /Modo autônomo/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Modo autônomo/ })).toBeEnabled();
  });

  it('cancelar a confirmação não liga nada', async () => {
    openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(sentOf('card.yolo.set')).toEqual([]);
  });

  it('desligar é direto, sem confirmação', async () => {
    patchCard(board.storyId, { yolo: true });
    openDrawer(board.storyId);
    await userEvent.click(screen.getByRole('checkbox', { name: /Modo autônomo/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastSent('card.yolo.set')).toEqual({ type: 'card.yolo.set', cardId: board.storyId, enabled: false, until: null });
  });

  it('com o modo ligado mostra o andamento do autopiloto e permite pausar e retomar', async () => {
    patchCard(board.storyId, { yolo: true });
    autopilot({ active: true, note: null });
    openDrawer(board.storyId);
    expect(screen.getByText('O modo autônomo está tocando a fila.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pausar modo autônomo' }));
    expect(lastSent('ai.autopilot.pause')).toEqual({ type: 'ai.autopilot.pause' });

    act(() => autopilot({ active: false, note: '#1 está bloqueado: Sem acesso' }));
    expect(screen.getByText('#1 está bloqueado: Sem acesso')).toBeInTheDocument();

    // a nota sobre OUTRA história não entra inteira no card: só uma linha que aponta para ela
    act(() => autopilot({ active: false, note: '#298 está bloqueado: Entrega já concluída e verificada 6x nesta coluna...' }));
    expect(screen.queryByText(/Entrega já concluída/)).toBeNull();
    expect(screen.getByText('A fila está parada em #298: veja a barra de atividade.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retomar modo autônomo' }));
    expect(lastSent('ai.autopilot.resume')).toEqual({ type: 'ai.autopilot.resume' });
  });

  it('a sub-tarefa só informa que herda o modo da história; sem o modo, não mostra nada', () => {
    const { unmount } = openDrawer(board.subId);
    expect(screen.queryByRole('checkbox', { name: /Modo autônomo/ })).toBeNull();
    expect(screen.queryByText(/Modo autônomo, da história/)).toBeNull();
    unmount();

    patchCard(board.storyId, { yolo: true });
    openDrawer(board.subId);
    expect(screen.getByText(/Modo autônomo, da história #/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Modo autônomo/ })).toBeNull();
  });
});

describe('retomar com histórias fora do modo', () => {
  it('pausado e com história em aberto fora do modo: "Retomar" confirma, liga nelas e retoma', async () => {
    const s = useBoardStore.getState().state!;
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const otherId = board.router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: board.router.snapshot().cards.find((c) => c.id === board.storyId)!.columnId,
      parentId: null,
      title: 'Fora do modo',
    });
    syncStore(board.router);
    patchState((st) => ({ cards: st.cards.map((c) => (c.parentId || c.id === otherId ? c : { ...c, yolo: true })) }));
    autopilot({ active: false, note: null });
    render(
      <Theme>
        <AutopilotButton />
        <Dialog />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retomar modo autônomo' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ligar modo autônomo' }));
    expect(lastSent('card.yolo.setMany')).toMatchObject({ cardIds: [otherId], enabled: true });
    expect(lastSent('ai.autopilot.resume')).toBeTruthy();
  });
});

describe('posição na fila do modo autônomo no card', () => {
  it('com o autopiloto ligado, a história que espera a vez mostra a posição; desligado ou em execução, não', () => {
    patchCard(board.storyId, { yolo: true });
    autopilot({ active: true, note: null });
    const { rerender, unmount } = render(<Board />);
    expect(screen.getByText('Fila 1')).toBeInTheDocument();

    act(() => patchCard(board.storyId, { status: 'running' }));
    rerender(<Board />);
    expect(screen.queryByText('Fila 1')).toBeNull();

    act(() => {
      patchCard(board.storyId, { status: 'ready' });
      autopilot({ active: false, note: null });
    });
    rerender(<Board />);
    expect(screen.queryByText('Fila 1')).toBeNull();
    unmount();
  });
});

describe('selo no card do board', () => {
  it('a história em modo autônomo ganha o selo, que é também o botão de desligar (#416)', () => {
    patchCard(board.storyId, { yolo: true });
    render(<Board />);
    const marks = screen.getAllByRole('button', { name: 'Desligar modo autônomo' });
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]).toHaveClass('yolo-mark', 'on');
  });
});

describe('botão do autopiloto no topo', () => {
  it('sem história em modo autônomo oferece "Ligar": confirma e põe no modo todas as histórias em aberto', async () => {
    render(
      <Theme>
        <AutopilotButton />
        <Dialog />
      </Theme>,
    );
    // outros testes criam histórias no mesmo roteador: o lote é tudo o que está em aberto, seja quanto for
    const open = useBoardStore
      .getState()
      .state!.cards.filter((c) => !c.parentId && c.deletedAt === null && c.archivedAt === null)
      .map((c) => c.id);
    await userEvent.click(screen.getByRole('button', { name: 'Ligar modo autônomo' }));
    expect(screen.getByText(new RegExp(`todas as ${open.length} história\\(s\\) em aberto`))).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ligar modo autônomo' }));
    expect(lastSent('card.yolo.setMany')).toMatchObject({ cardIds: open, enabled: true, until: null });
  });

  it('com histórias selecionadas, "Ligar" vale só para elas', async () => {
    const s = useBoardStore.getState().state!;
    const wf = s.workflows.find((w) => w.kind === 'parent')!;
    const otherId = board.router.createCard({
      typeId: s.cardTypes.find((t) => t.defaultWorkflowId === wf.id)!.id,
      columnId: board.router.snapshot().cards.find((c) => c.id === board.storyId)!.columnId,
      parentId: null,
      title: 'Outra história',
    });
    syncStore(board.router);
    act(() => useBoardStore.getState().selectMany([otherId]));
    render(
      <Theme>
        <AutopilotButton />
        <Dialog />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ligar modo autônomo' }));
    expect(screen.getByText(/1 história\(s\) selecionada\(s\)/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ligar modo autônomo' }));
    expect(lastSent('card.yolo.setMany')).toMatchObject({ cardIds: [otherId], enabled: true });
    expect(useBoardStore.getState().selectedIds.size).toBe(0);
    useBoardStore.getState().clearSelected();
  });

  it('tocando: um clique pausa; pausado, com todas as histórias já no modo: um clique retoma direto', async () => {
    // todas as histórias em aberto já estão no modo: não há o que ligar, só retomar
    patchState((s) => ({ cards: s.cards.map((c) => (c.parentId ? c : { ...c, yolo: true })) }));
    autopilot({ active: true, note: null });
    const { rerender } = render(<AutopilotButton />);
    const button = screen.getByRole('button', { name: /modo autônomo/ });
    expect(button).not.toHaveAttribute('aria-pressed');
    await userEvent.click(button);
    expect(lastSent('ai.autopilot.pause')).toBeTruthy();

    act(() => autopilot({ active: false, note: null }));
    rerender(<AutopilotButton />);
    expect(screen.getByRole('button', { name: 'Retomar modo autônomo' })).not.toHaveAttribute('aria-pressed');
    await userEvent.click(screen.getByRole('button', { name: 'Retomar modo autônomo' }));
    expect(lastSent('ai.autopilot.resume')).toBeTruthy();
  });
});
