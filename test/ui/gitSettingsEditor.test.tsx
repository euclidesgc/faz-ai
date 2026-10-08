import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { lastSent, seedBoard, syncStore, type SeededBoard } from './setup';
import { GitSettings } from '../../src/webview/components/settings/GitSettings';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

describe('GitSettings dentro do editor', () => {
  it('mostra só o aviso e o botão do Settings do editor, sem os campos de Git', () => {
    syncStore(board.router);
    render(
      <Theme>
        <GitSettings />
      </Theme>,
    );
    expect(screen.getByText('O Git agora fica no Settings do editor.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Onde a IA mexe no código' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Nome da branch' })).toBeNull();
  });

  it('o botão abre o Settings do editor na chave do modo de Git', async () => {
    syncStore(board.router);
    render(
      <Theme>
        <GitSettings />
      </Theme>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no Settings do editor' }));
    expect(lastSent('ui.openIdeSettings')).toEqual({ type: 'ui.openIdeSettings', key: 'fazai.git.mode' });
  });
});
