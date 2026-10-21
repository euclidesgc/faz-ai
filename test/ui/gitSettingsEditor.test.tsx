import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { choose, lastSent, seedBoard, type SeededBoard } from './setup';
import { GitSettings } from '../../src/webview/components/settings/GitSettings';
import { BranchRenameDialog } from '../../src/webview/components/BranchRenameDialog';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

/** O snapshot com a principal detectada (quem a detecta é o host, que o teste não tem). */
const show = () => {
  useBoardStore.setState({ state: { ...board.router.snapshot(), mainBranch: { name: 'main', source: 'origin' } } });
  render(
    <Theme>
      <GitSettings />
    </Theme>,
  );
};

describe('GitSettings dentro do editor', () => {
  it('mostra os campos de Git e do gitflow editáveis, sem o aviso do Settings', () => {
    show();
    expect(screen.queryByText('O Git agora fica no Settings do editor.')).toBeNull();
    expect(screen.queryByRole('button', { name: /Settings do editor/ })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Onde a IA mexe no código' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome da branch' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Usar o gitflow' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prefixo de feature')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch principal')).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Renomear a principal ou a develop' })).toBeInTheDocument();
  });

  it('mudar o modo de Git grava o patch do board', async () => {
    show();
    await choose(screen.getByRole('combobox', { name: 'Onde a IA mexe no código' }), 'Branch por história');
    expect(lastSent('settings.board.update').patch).toEqual({ git: { mode: 'branch' } });
  });

  it('desligar o gitflow e editar o nome da branch gravam o patch do board', async () => {
    show();
    await userEvent.click(screen.getByRole('switch', { name: 'Usar o gitflow' }));
    expect(lastSent('settings.board.update').patch).toEqual({ git: { gitflow: false } });
    const field = screen.getByRole('textbox', { name: 'Nome da branch' });
    await userEvent.clear(field);
    await userEvent.type(field, 'x/{{numero}{Enter}');
    expect(lastSent('settings.board.update').patch).toEqual({ git: { branchPattern: 'x/{numero}' } });
  });

  it('o diálogo de renomeação não abre no editor, onde quem pergunta é o modal da extensão', () => {
    const pending = { kind: 'main' as const, from: 'master', to: 'main', previous: '' };
    useBoardStore.setState({ state: { ...board.router.snapshot(), branchRenames: [pending] } });
    render(
      <Theme>
        <BranchRenameDialog />
      </Theme>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    useBoardStore.setState({ state: { ...board.router.snapshot(), branchRenames: [] } });
  });

  it('mostra a explicação, a tabela e a principal', () => {
    show();
    expect(screen.getByText(/Com o gitflow, funcionalidades e correções partem/)).toBeInTheDocument();
    expect(screen.getByText(/Principal:/)).toHaveTextContent('Principal: main (branch padrão do origin)');
    const table = screen.getByRole('table', { name: 'Branches do gitflow' });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getByText('feature/')).toBeInTheDocument();
    expect(within(table).getByText('processo de release do projeto')).toBeInTheDocument();
  });

  it('o tipo de branch de um tipo de card funciona no editor', async () => {
    show();
    const typeId = board.router.snapshot().cardTypes.find((ct) => ct.name === 'Retrabalho')!.id;
    await choose(screen.getByRole('combobox', { name: 'Tipo de branch de Retrabalho' }), 'Feature');
    expect(lastSent('settings.type.update')).toEqual({ type: 'settings.type.update', typeId, patch: { branchKind: 'feature' } });
  });
});
