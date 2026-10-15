import { confirmLast, lastSent, posted, renderThemed, requestIds, seedBoard, sentOf, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/webview/App';
import { Dialog } from '../../src/webview/components/Dialog';
import { GitSettings } from '../../src/webview/components/settings/GitSettings';
import { useBoardStore } from '../../src/webview/store/boardStore';
import { EMPTY_ORPHANS, type OrphanItem, type OrphanReport } from '../../src/shared/orphans';

// A tela das órfãs (#465, parte 4): o relatório vem do host em `BoardState.orphans`; a webview só mostra o
// veredito, pede a limpeza e, nas de decisão, envia o que a pessoa confirmou.

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

const safeBranch: OrphanItem = {
  id: 'branch:feature/12-login',
  kind: 'branch',
  ref: 'feature/12-login',
  branch: 'feature/12-login',
  cardNumber: 12,
  situation: 'merged',
  verdict: 'safe',
  proof: 'merge-commit',
  blockers: [],
  dirtyFiles: 0,
  uniqueCommits: 3,
};
const dirtyWorktree: OrphanItem = {
  id: 'worktree:/tmp/wt/13',
  kind: 'worktree',
  ref: '/tmp/wt/13',
  branch: 'feature/13-pagamento',
  cardNumber: 13,
  situation: 'cancelled',
  verdict: 'decision',
  proof: null,
  blockers: ['dirty'],
  dirtyFiles: 4,
  uniqueCommits: 0,
};
const uniqueBranch: OrphanItem = {
  id: 'branch:feature/14-busca',
  kind: 'branch',
  ref: 'feature/14-busca',
  branch: 'feature/14-busca',
  cardNumber: 14,
  situation: 'done',
  verdict: 'decision',
  proof: null,
  blockers: ['unique'],
  dirtyFiles: 0,
  uniqueCommits: 2,
};

const show = (report: OrphanReport) => {
  useBoardStore.setState({ state: { ...board.router.snapshot(), orphans: report } });
};
const report = (items: OrphanItem[], extra: Partial<OrphanReport> = {}): OrphanReport => ({ ...EMPTY_ORPHANS, items, ...extra });

beforeEach(() => {
  show(EMPTY_ORPHANS);
});

describe('seção das órfãs na aba Git', () => {
  it('sem órfãs mostra o estado vazio e desabilita "Limpar todas as seguras"', () => {
    show(report([], { scannedAt: Date.UTC(2026, 9, 15, 12, 0) }));
    renderThemed(<GitSettings />);
    expect(screen.getByText(/Nenhuma branch ou worktree órfã\./)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Branches e worktrees órfãs' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Limpar todas as seguras' })).toBeDisabled();
  });

  it('lista cada item com a história, a situação e o veredito', () => {
    show(report([safeBranch, dirtyWorktree]));
    renderThemed(<GitSettings />);
    const table = screen.getByRole('table', { name: 'Branches e worktrees órfãs' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('feature/12-login');
    expect(rows[1]).toHaveTextContent('#12');
    expect(rows[1]).toHaveTextContent('história com merge feito');
    expect(rows[1]).toHaveTextContent('Segura');
    expect(rows[1]).toHaveTextContent('já mesclada na base');
    expect(rows[2]).toHaveTextContent('/tmp/wt/13');
    expect(rows[2]).toHaveTextContent('Precisa de decisão');
    expect(rows[2]).toHaveTextContent('4 arquivos não commitados');
  });

  it('Verificar de novo envia git.orphans.scan', async () => {
    renderThemed(<GitSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(lastSent('git.orphans.scan')).toEqual({ type: 'git.orphans.scan' });
  });

  it('Limpar todas as seguras envia git.orphans.cleanSafe', async () => {
    show(report([safeBranch, uniqueBranch]));
    renderThemed(<GitSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Limpar todas as seguras' }));
    expect(lastSent('git.orphans.cleanSafe')).toEqual({ type: 'git.orphans.cleanSafe' });
  });

  it('Limpar uma segura envia na hora, sem acceptLoss e sem diálogo', async () => {
    show(report([safeBranch]));
    renderThemed(
      <>
        <GitSettings />
        <Dialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Limpar feature/12-login' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastSent('git.orphans.clean')).toEqual({ type: 'git.orphans.clean', id: 'branch:feature/12-login' });
  });

  it('Limpar uma de decisão pede confirmação com o aviso e só então envia acceptLoss', async () => {
    show(report([dirtyWorktree]));
    renderThemed(
      <>
        <GitSettings />
        <Dialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Limpar /tmp/wt/13' }));
    const dialog = await screen.findByRole('dialog');
    expect(sentOf('git.orphans.clean')).toHaveLength(0);
    expect(dialog).toHaveTextContent('4 arquivos não commitados');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Limpar mesmo assim' }));
    expect(lastSent('git.orphans.clean')).toEqual({
      type: 'git.orphans.clean',
      id: 'worktree:/tmp/wt/13',
      acceptLoss: { dirtyFiles: 4, uniqueCommits: 0 },
    });
  });

  it('cancelar a confirmação não envia nada', async () => {
    show(report([uniqueBranch]));
    renderThemed(
      <>
        <GitSettings />
        <Dialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Limpar feature/14-busca' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2 commits só nesta branch');
    await userEvent.keyboard('{Escape}');
    expect(posted).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'git.orphans.clean' }));
  });

  it('mostra "Não removido" com o erro da última falha', () => {
    show(report([safeBranch], { failed: { [safeBranch.id]: 'a branch está protegida no remoto' } }));
    renderThemed(<GitSettings />);
    expect(screen.getByRole('note', { name: 'Não removido' })).toHaveTextContent('a branch está protegida no remoto');
  });

  it('o botão fica ocupado até o done do host', async () => {
    show(report([safeBranch]));
    renderThemed(<GitSettings />);
    const button = screen.getByRole('button', { name: 'Limpar feature/12-login' });
    await userEvent.click(button);
    expect(requestIds).toHaveLength(1);
    expect(button).toBeDisabled();
    confirmLast();
    await screen.findByRole('button', { name: 'Limpar feature/12-login' });
    expect(screen.getByRole('button', { name: 'Limpar feature/12-login' })).toBeEnabled();
  });
});

// o idioma da interface pode ter virado inglês quando o nome é lido: o selo aceita os dois
describe('selo no topo do board', () => {
  it('conta só as de decisão e abre a aba Git das Configurações', async () => {
    show(report([safeBranch, dirtyWorktree, uniqueBranch]));
    renderThemed(<App />);
    const badge = screen.getByRole('button', { name: /^2 (órfãs|orphans)$/ });
    await userEvent.click(badge);
    expect(useBoardStore.getState().view).toBe('settings');
    expect(useBoardStore.getState().settingsTab).toBe('git');
  });

  it('usa o singular com uma só', () => {
    show(report([dirtyWorktree]));
    renderThemed(<App />);
    expect(screen.getByRole('button', { name: /^1 (órfã|orphan)$/ })).toBeInTheDocument();
  });

  it('não aparece quando só há órfãs seguras', () => {
    show(report([safeBranch]));
    renderThemed(<App />);
    expect(screen.queryByRole('button', { name: /órfã|orphan/ })).toBeNull();
  });
});
