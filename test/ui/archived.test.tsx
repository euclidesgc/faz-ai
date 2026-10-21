import { confirmLast, lastSent, renderThemed, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
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

describe('aba Arquivados: filtros, paginação e filhos da história', () => {
  const parentWf = () => state().workflows.find((w) => w.kind === 'parent')!;
  const childWf = () => state().workflows.find((w) => w.kind === 'child')!;
  const typeOf = (wfId: string) => state().cardTypes.find((t) => t.defaultWorkflowId === wfId)!;
  const firstCol = (wfId: string) => state().columns.find((c) => c.workflowId === wfId)!;
  /** cria uma história com sub-tarefas e a arquiva (a história leva as sub-tarefas junto) */
  function archivedStory(title: string, subs: string[]) {
    const id = board.router.createCard({ typeId: typeOf(parentWf().id).id, columnId: firstCol(parentWf().id).id, parentId: null, title });
    const subIds = subs.map((s) =>
      board.router.createCard({ typeId: typeOf(childWf().id).id, columnId: firstCol(childWf().id).id, parentId: id, title: s }),
    );
    board.router.handle({ type: 'card.archive', cardId: id });
    return { id, subIds };
  }
  /** semeia N histórias arquivadas direto no estado da store, sem passar pelo roteador (evita lentidão) */
  function seedBulk(n: number) {
    const s = state();
    const base = s.cards.find((c) => c.id === board.storyId)!;
    const bulk = Array.from({ length: n }, (_, i) => ({
      ...base,
      id: `bulk-${i}`,
      number: 1000 + i,
      title: `Massa ${i}`,
      archivedAt: 1_000_000 + i,
    }));
    useBoardStore.setState({ state: { ...s, cards: [...s.cards, ...bulk] } });
  }
  const search = () => screen.getByRole('searchbox', { name: 'Buscar nos arquivados' });

  it('o texto filtra por #número e por parte do título; "Limpar filtros" volta ao conjunto e o contador acompanha', async () => {
    archivedStory('Alfa checkout', []);
    archivedStory('Beta relatório', []);
    sync();
    renderThemed(<ArchivedView />);
    const stories = row(parentWf().name);
    expect(within(stories).getByText('2 cards')).toBeInTheDocument();

    await userEvent.type(search(), 'relat');
    expect(within(stories).getByText('1 card')).toBeInTheDocument();
    expect(within(stories).getByText('Beta relatório')).toBeInTheDocument();
    expect(within(stories).queryByText('Alfa checkout')).toBeNull();

    const alfa = state().cards.find((c) => c.title === 'Alfa checkout')!;
    await userEvent.clear(search());
    await userEvent.type(search(), `#${alfa.number}`);
    expect(within(stories).getByText('1 card')).toBeInTheDocument();
    expect(within(stories).getByText('Alfa checkout')).toBeInTheDocument();
    expect(within(stories).queryByText('Beta relatório')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(search()).toHaveValue('');
    expect(within(stories).getByText('2 cards')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('distingue "nenhum atende aos filtros" de "workflow sem arquivados"', async () => {
    archivedStory('Alfa checkout', []);
    sync();
    renderThemed(<ArchivedView />);
    // o workflow de sub-tarefas não tem arquivados; o de histórias tem
    expect(within(row(childWf().name)).getByText('Nenhum card arquivado neste workflow.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum card arquivado atende aos filtros.')).toBeNull();

    await userEvent.type(search(), 'zzzinexistente');
    expect(within(row(parentWf().name)).getByText('Nenhum card arquivado atende aos filtros.')).toBeInTheDocument();
    expect(within(row(parentWf().name)).queryByText('Nenhum card arquivado neste workflow.')).toBeNull();
    // o workflow vazio continua dizendo que não tem arquivados, filtro ou não
    expect(within(row(childWf().name)).getByText('Nenhum card arquivado neste workflow.')).toBeInTheDocument();
  });

  it('pagina de 50 em 50 com "Mostrar mais" e volta a 50 ao mudar a busca', async () => {
    seedBulk(120);
    renderThemed(<ArchivedView />);
    const stories = row(parentWf().name);
    expect(within(stories).getAllByRole('article')).toHaveLength(50);
    expect(within(stories).getByText('Mostrando 50 de 120')).toBeInTheDocument();

    await userEvent.click(within(stories).getByRole('button', { name: 'Mostrar mais' }));
    expect(within(stories).getAllByRole('article')).toHaveLength(100);
    expect(within(stories).getByText('Mostrando 100 de 120')).toBeInTheDocument();

    await userEvent.click(within(stories).getByRole('button', { name: 'Mostrar mais' }));
    expect(within(stories).getAllByRole('article')).toHaveLength(120);
    expect(within(stories).queryByRole('button', { name: 'Mostrar mais' })).toBeNull();
    expect(within(stories).queryByText(/^Mostrando/)).toBeNull();

    // mudar a busca volta cada linha à primeira página (todos os "Massa" ainda passam: 120 > 50)
    await userEvent.type(search(), 'M');
    expect(within(stories).getAllByRole('article')).toHaveLength(50);
    expect(within(stories).getByText('Mostrando 50 de 120')).toBeInTheDocument();
  });

  it('clicar numa história arquivada seleciona e mostra só as sub-tarefas arquivadas dela, mesmo fora do filtro de texto', async () => {
    const a = archivedStory('Alfa checkout', ['Sub alfa um', 'Sub alfa dois']);
    archivedStory('Beta relatório', ['Sub beta']);
    sync();
    renderThemed(<ArchivedView />);
    const stories = row(parentWf().name);
    const subs = row(childWf().name);
    expect(within(subs).getByText('3 cards')).toBeInTheDocument();

    // o filtro de texto só casa com a história, não com as sub-tarefas
    await userEvent.type(search(), 'Alfa checkout');
    expect(within(subs).getByText('Nenhum card arquivado atende aos filtros.')).toBeInTheDocument();

    const alfa = state().cards.find((c) => c.id === a.id)!;
    const article = within(stories).getByText('Alfa checkout').closest('article')!;
    await userEvent.click(article);
    expect(article).toHaveClass('selected');
    expect(within(subs).getByText('Sub alfa um')).toBeInTheDocument();
    expect(within(subs).getByText('Sub alfa dois')).toBeInTheDocument();
    expect(within(subs).queryByText('Sub beta')).toBeNull();
    expect(within(subs).getByText('2 cards')).toBeInTheDocument();
    expect(within(subs).getByText(`Sub-tarefas de #${alfa.number} Alfa checkout`)).toBeInTheDocument();
    // a seleção é local da aba: não mexe na seleção do board
    expect(useBoardStore.getState().selectedParentId).toBeNull();

    // "Limpar seleção" sai da seleção e mantém o filtro
    await userEvent.click(within(subs).getByRole('button', { name: 'Limpar seleção' }));
    expect(article).not.toHaveClass('selected');
    expect(within(subs).queryByText(/^Sub-tarefas de/)).toBeNull();
    expect(search()).toHaveValue('Alfa checkout');

    // clicar de novo na história seleciona; clicar outra vez limpa
    await userEvent.click(article);
    expect(article).toHaveClass('selected');
    await userEvent.click(article);
    expect(article).not.toHaveClass('selected');
    expect(within(subs).queryByText(/^Sub-tarefas de/)).toBeNull();
    expect(useBoardStore.getState().selectedParentId).toBeNull();
  });

  it('a história arquivada também se seleciona pelo teclado (Espaço) e marca aria-current', async () => {
    archivedStory('Alfa checkout', ['Sub alfa um']);
    sync();
    renderThemed(<ArchivedView />);
    const article = within(row(parentWf().name)).getByText('Alfa checkout').closest('article')!;
    expect(article).not.toHaveAttribute('aria-current');
    article.focus();
    await userEvent.keyboard(' ');
    expect(article).toHaveAttribute('aria-current', 'true');
    expect(within(row(childWf().name)).getByText(/^Sub-tarefas de/)).toBeInTheDocument();
    await userEvent.keyboard(' ');
    expect(article).not.toHaveAttribute('aria-current');
  });

  it('história selecionada que foi restaurada: o aviso "Sub-tarefas de" some', async () => {
    const a = archivedStory('Alfa checkout', ['Sub alfa um']);
    sync();
    renderThemed(<ArchivedView />);
    const subs = row(childWf().name);
    await userEvent.click(within(row(parentWf().name)).getByText('Alfa checkout'));
    expect(within(subs).getByText(/^Sub-tarefas de/)).toBeInTheDocument();

    // novo snapshot do host, sem a história arquivada
    board.router.handle({ type: 'card.restoreArchived', cardId: a.id });
    act(() => sync());
    expect(within(subs).queryByText(/^Sub-tarefas de/)).toBeNull();
    expect(within(subs).queryByRole('button', { name: 'Limpar seleção' })).toBeNull();
  });

  it('o painel abre com "Mostrar filtros", oferece "Arquivado em" e esconde os filtros do board', async () => {
    renderThemed(<ArchivedView />);
    const toggle = screen.getByRole('button', { name: 'Mostrar filtros' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Campo de data')).toBeNull();

    await userEvent.click(toggle);
    const opened = screen.getByRole('button', { name: 'Esconder filtros' });
    expect(opened).toHaveAttribute('aria-expanded', 'true');
    // o select de data da aba só tem "Arquivado em" (não "Criado em" etc.)
    await userEvent.click(screen.getByRole('combobox', { name: 'Campo de data' }));
    expect(screen.getByRole('option', { name: 'Arquivado em' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Criado em' })).toBeNull();
    expect(screen.queryByText('Pendência')).toBeNull();
    expect(screen.queryByText('Relacionamentos')).toBeNull();
  });
  describe('seleção em massa', () => {
    const mark = (name: RegExp) => screen.getByRole('checkbox', { name });
    const bar = () => screen.queryByRole('toolbar', { name: 'Ações em massa' });

    it('a barra aparece com um card marcado, conta, e Limpar desmarca', async () => {
      archivedStory('Alfa checkout', []);
      archivedStory('Beta relatório', []);
      sync();
      renderThemed(<ArchivedView />);
      expect(bar()).toBeNull();
      await userEvent.click(mark(/Alfa checkout/));
      expect(within(bar()!).getByText('1 selecionados')).toBeInTheDocument();
      await userEvent.click(mark(/Beta relatório/));
      expect(within(bar()!).getByText('2 selecionados')).toBeInTheDocument();
      await userEvent.click(within(bar()!).getByRole('button', { name: 'Limpar' }));
      expect(bar()).toBeNull();
    });

    it('marcar não filtra as sub-tarefas e filtrar pela história não marca', async () => {
      archivedStory('Alfa checkout', ['Sub alfa um']);
      sync();
      renderThemed(<ArchivedView />);
      await userEvent.click(mark(/Alfa checkout/));
      expect(within(row(childWf().name)).queryByText(/^Sub-tarefas de/)).toBeNull();
      await userEvent.click(mark(/Alfa checkout/));
      await userEvent.click(within(row(parentWf().name)).getByText('Alfa checkout'));
      expect(within(row(childWf().name)).getByText(/^Sub-tarefas de/)).toBeInTheDocument();
      expect(bar()).toBeNull();
    });

    it('"Selecionar todos os visíveis" respeita o filtro e a poda tira o que sai da lista', async () => {
      archivedStory('Alfa checkout', []);
      archivedStory('Beta relatório', []);
      sync();
      renderThemed(<ArchivedView />);
      await userEvent.click(mark(/Alfa checkout/));
      await userEvent.type(search(), 'Beta');
      // o Alfa saiu da lista: a seleção é podada junto
      expect(bar()).toBeNull();
      await userEvent.click(mark(/Beta relatório/));
      await userEvent.click(within(bar()!).getByRole('button', { name: 'Selecionar todos os visíveis' }));
      expect(within(bar()!).getByText('1 selecionados')).toBeInTheDocument();
      await userEvent.clear(search());
      // voltar o filtro não ressuscita o Alfa
      expect(within(bar()!).getByText('1 selecionados')).toBeInTheDocument();
      expect(mark(/Alfa checkout/)).not.toBeChecked();
    });

    it('Restaurar pede confirmação com a contagem e o que vai junto, e só envia ao confirmar', async () => {
      const a = archivedStory('Alfa checkout', ['Sub alfa um', 'Sub alfa dois']);
      sync();
      renderThemed(
        <>
          <ArchivedView />
          <Dialog />
        </>,
      );
      await userEvent.click(mark(/Alfa checkout/));
      await userEvent.click(within(bar()!).getByRole('button', { name: 'Restaurar' }));
      expect(screen.getByText('Restaurar 1 card(s)?')).toBeInTheDocument();
      expect(screen.getByText(/Voltam junto: 2 cards/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
      expect(sentOf('card.unarchiveMany')).toHaveLength(0);
      expect(bar()).not.toBeNull();

      await userEvent.click(within(bar()!).getByRole('button', { name: 'Restaurar' }));
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restaurar' }));
      expect(lastSent('card.unarchiveMany')).toEqual({ type: 'card.unarchiveMany', cardIds: [a.id] });
      expect(within(bar()!).getByRole('status')).toHaveTextContent('Restaurando 1 card(s)…');
      confirmLast();
      await waitFor(() => expect(bar()).toBeNull());
    });

    it('Enviar para a lixeira pede confirmação e envia card.trashArchivedMany ao confirmar', async () => {
      const a = archivedStory('Alfa checkout', ['Sub alfa um']);
      sync();
      renderThemed(
        <>
          <ArchivedView />
          <Dialog />
        </>,
      );
      await userEvent.click(mark(/Alfa checkout/));
      await userEvent.click(within(bar()!).getByRole('button', { name: 'Enviar para a lixeira' }));
      expect(screen.getByText('Excluir 1 card(s)?')).toBeInTheDocument();
      expect(screen.getByText(/Vão para a lixeira junto: 1 card/)).toBeInTheDocument();
      expect(sentOf('card.trashArchivedMany')).toHaveLength(0);
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
      expect(lastSent('card.trashArchivedMany')).toEqual({ type: 'card.trashArchivedMany', cardIds: [a.id] });
    });
  });
});
