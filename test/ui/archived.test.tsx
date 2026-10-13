import { lastSent, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/webview/App';
import { ArchivedView } from '../../src/webview/components/ArchivedView';
import { Dialog } from '../../src/webview/components/Dialog';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { setLocale } from '../../src/webview/i18n';

let board: SeededBoard;
beforeEach(async () => {
  board = await seedBoard();
  // o App aplica o idioma do board ("auto" segue o do navegador, en-US no jsdom): os textos aqui são os em português
  const s = useBoardStore.getState().state!;
  useBoardStore.setState({ state: { ...s, board: { ...s.board, appearance: { ...s.board.appearance, language: 'pt-BR' } } } });
});
afterEach(() => setLocale('pt-BR'));

const state = () => useBoardStore.getState().state!;
/** copia o estado do roteador para a store mantendo o idioma em português (o roteador devolve "auto") */
function sync() {
  syncStore(board.router);
  const s = state();
  useBoardStore.setState({ state: { ...s, board: { ...s.board, appearance: { ...s.board.appearance, language: 'pt-BR' } } } });
}
const row = (name: string) => screen.getByRole('region', { name });

describe('aba Arquivados', () => {
  it('fica na navegação entre Métricas e Lixeira e abre a vista', async () => {
    renderThemed(<App />);
    const nav = screen.getByRole('navigation');
    const labels = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels.indexOf('Arquivados')).toBe(labels.indexOf('Métricas') + 1);
    expect(labels.indexOf('Lixeira')).toBe(labels.indexOf('Arquivados') + 1);
    await userEvent.click(within(nav).getByRole('button', { name: 'Arquivados' }));
    expect(useBoardStore.getState().view).toBe('archived');
    // uma linha por workflow (duas no board padrão), as duas vazias
    expect(screen.getAllByText('Nenhum card arquivado neste workflow.')).toHaveLength(2);
  });

  it('uma linha por workflow, na ordem do board, só com os arquivados daquele workflow, do mais recente ao mais antigo', () => {
    const s = state();
    const pw = s.workflows.find((w) => w.kind === 'parent')!;
    const cw = s.workflows.find((w) => w.kind === 'child')!;
    const type = s.cardTypes.find((t) => t.defaultWorkflowId === pw.id)!;
    const col = s.columns.find((c) => c.workflowId === pw.id)!;
    const old = board.router.createCard({ typeId: type.id, columnId: col.id, parentId: null, title: 'Antiga' });
    const recent = board.router.createCard({ typeId: type.id, columnId: col.id, parentId: null, title: 'Recente' });
    board.router.handle({ type: 'card.archive', cardId: old });
    sync();
    // o arquivamento grava um timestamp: força ordem distinta entre os dois
    const snap = state();
    useBoardStore.setState({
      state: {
        ...snap,
        cards: snap.cards.map((c) =>
          c.id === recent ? { ...c, archivedAt: (snap.cards.find((x) => x.id === old)!.archivedAt ?? 0) + 1000 } : c,
        ),
      },
    });

    renderThemed(<ArchivedView />);
    const sections = screen.getAllByRole('region');
    expect(sections.map((e) => e.getAttribute('aria-label'))).toEqual([pw.name, cw.name]);
    const stories = row(pw.name);
    const titles = within(stories)
      .getAllByRole('article')
      .map((a) => within(a).getByText(/Antiga|Recente/).textContent);
    expect(titles).toEqual(['Recente', 'Antiga']);
    expect(within(stories).queryByText('Login com Google')).toBeNull(); // viva: não aparece
    expect(within(row(cw.name)).getByText('Nenhum card arquivado neste workflow.')).toBeInTheDocument();
    expect(within(stories).getByText('2 cards')).toBeInTheDocument();
  });

  it('restaurar uma história envia card.restoreArchived sem confirmação', async () => {
    board.router.handle({ type: 'card.archive', cardId: board.storyId });
    sync();
    renderThemed(<ArchivedView />);
    const pw = state().workflows.find((w) => w.kind === 'parent')!;
    await userEvent.click(within(row(pw.name)).getByRole('button', { name: /^Restaurar #/ }));
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(lastSent('card.restoreArchived')).toEqual({ type: 'card.restoreArchived', cardId: board.storyId });
  });

  it('sub-tarefa de história arquivada: pede confirmação; confirmando restaura a história, cancelando nada muda', async () => {
    board.router.handle({ type: 'card.archive', cardId: board.storyId });
    sync();
    const s = state();
    const cw = s.workflows.find((w) => w.kind === 'child')!;
    renderThemed(
      <>
        <ArchivedView />
        <Dialog />
      </>,
    );
    const sub = within(row(cw.name)).getByRole('button', { name: /^Restaurar #/ });
    await userEvent.click(sub);
    expect(screen.getByText('Restaurar a história junto?')).toBeInTheDocument();
    expect(screen.getByText(/pertence à história #1, que está arquivada/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(sentOf('card.restoreArchived')).toHaveLength(0);

    await userEvent.click(sub);
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar história' }));
    expect(lastSent('card.restoreArchived')).toEqual({ type: 'card.restoreArchived', cardId: board.subId });
  });

  it('sub-tarefa de história ativa: restaura só ela, sem confirmação', async () => {
    board.router.handle({ type: 'card.archive', cardId: board.subId });
    sync();
    renderThemed(<ArchivedView />);
    await userEvent.click(screen.getByRole('button', { name: /^Restaurar #/ }));
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(lastSent('card.restoreArchived')).toEqual({ type: 'card.restoreArchived', cardId: board.subId });
  });

  it('o host restaura pela mensagem: a história e a sub-tarefa voltam inativas à primeira coluna', () => {
    board.router.handle({ type: 'card.archive', cardId: board.storyId });
    board.router.handle({ type: 'card.restoreArchived', cardId: board.subId });
    sync();
    const s = state();
    for (const id of [board.storyId, board.subId]) {
      const c = s.cards.find((x) => x.id === id)!;
      const first = s.columns.filter((k) => k.workflowId === c.workflowId).sort((a, b) => a.position - b.position)[0]!;
      expect(c.archivedAt).toBeNull();
      expect(c.columnId).toBe(first.id);
      expect(c.status).toBeNull();
    }
  });
});
