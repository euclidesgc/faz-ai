import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { aiToolInfo } from '../../src/shared/harness';
import { lastSent, seedBoard, syncStore, type SeededBoard } from './setup';
import { RunnerSettings } from '../../src/webview/components/settings/harness/RunnerSettings';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

const show = () => {
  syncStore(board.router);
  return render(
    <Theme>
      <RunnerSettings tool={aiToolInfo('claude')} />
    </Theme>,
  );
};

describe('RunnerSettings dentro do editor', () => {
  it('"Tocar histórias em paralelo" vira um aviso e um botão para o Settings do editor', () => {
    show();
    expect(screen.queryByRole('switch', { name: 'Tocar histórias em paralelo' })).toBeNull();
    expect(screen.queryByLabelText('Histórias ao mesmo tempo')).toBeNull();
    expect(screen.getByText('Tocar histórias em paralelo agora fica no Settings do editor, em Faz AI › Git.')).toBeInTheDocument();
  });

  it('o botão abre o Settings do editor na chave do paralelismo de Git', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no Settings do editor' }));
    expect(lastSent('ui.openIdeSettings')).toEqual({ type: 'ui.openIdeSettings', key: 'fazai.git.parallel' });
  });
});
