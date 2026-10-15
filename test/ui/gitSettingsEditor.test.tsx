import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { choose, lastSent, seedBoard, type SeededBoard } from './setup';
import { GitSettings } from '../../src/webview/components/settings/GitSettings';
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
  it('mostra o aviso do Settings, sem os campos de Git do navegador', () => {
    show();
    expect(screen.getByText('O Git agora fica no Settings do editor.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Onde a IA mexe no código' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Nome da branch' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Usar o gitflow' })).toBeNull();
    expect(screen.queryByLabelText('Prefixo de feature')).toBeNull();
    // a principal e a explicação da renomeação são do navegador: no editor, o Settings é a fonte
    expect(screen.queryByLabelText('Branch principal')).toBeNull();
    expect(screen.queryByRole('note', { name: 'Renomear a principal ou a develop' })).toBeNull();
  });

  it('mostra a explicação, a tabela e a principal', () => {
    show();
    expect(screen.getByText(/Com o gitflow, funcionalidades e correções partem/)).toBeInTheDocument();
    expect(screen.getByText(/Principal:/)).toHaveTextContent('Principal: main (branch padrão do origin)');
    const table = screen.getByRole('table', { name: 'Branches do gitflow' });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getByText('feature/')).toBeInTheDocument();
    expect(within(table).getByText('processo de release do projeto')).toBeInTheDocument();
    // os valores aparecem só para leitura
    const values = screen.getByRole('list', { name: 'Valores no Settings do editor' });
    expect(values).toHaveTextContent('Usar o gitflow: sim');
    expect(values).toHaveTextContent('Branch de integração: develop');
  });

  it('o botão do modo de Git abre o Settings do editor na chave do modo', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no Settings do editor' }));
    expect(lastSent('ui.openIdeSettings')).toEqual({ type: 'ui.openIdeSettings', key: 'fazai.git.mode' });
  });

  it('o botão do gitflow abre o Settings do editor em fazai.git.gitflow', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o gitflow no Settings do editor' }));
    expect(lastSent('ui.openIdeSettings')).toEqual({ type: 'ui.openIdeSettings', key: 'fazai.git.gitflow' });
  });

  it('o tipo de branch de um tipo de card funciona no editor', async () => {
    show();
    const typeId = board.router.snapshot().cardTypes.find((ct) => ct.name === 'Retrabalho')!.id;
    await choose(screen.getByRole('combobox', { name: 'Tipo de branch de Retrabalho' }), 'Feature');
    expect(lastSent('settings.type.update')).toEqual({ type: 'settings.type.update', typeId, patch: { branchKind: 'feature' } });
  });
});
