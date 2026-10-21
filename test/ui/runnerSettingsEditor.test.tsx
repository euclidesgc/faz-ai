import { beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { baseInfo } from '../../src/shared/harness';
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
      <RunnerSettings tool={baseInfo('claude')} />
    </Theme>,
  );
};

describe('RunnerSettings dentro do editor', () => {
  it('mostra "Tocar histórias em paralelo", sem o aviso nem o botão do Settings do editor', () => {
    show();
    expect(screen.getByRole('switch', { name: 'Tocar histórias em paralelo' })).toBeInTheDocument();
    expect(screen.queryByText(/agora fica no Settings do editor/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir no Settings do editor' })).toBeNull();
  });

  it('no modo worktree, ligar grava runner.parallel e o número grava runner.parallelStories', async () => {
    await board.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree' } } } as never);
    show();
    await userEvent.click(screen.getByRole('switch', { name: 'Tocar histórias em paralelo' }));
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { parallel: true } });
    await board.router.handle({ type: 'settings.board.update', patch: { runner: { parallel: true } } } as never);
    syncStore(board.router);
    cleanup();
    show();
    const field = screen.getByLabelText('Histórias ao mesmo tempo');
    await userEvent.clear(field);
    await userEvent.type(field, '3{Enter}');
    expect(lastSent('settings.board.update').patch).toEqual({ runner: { parallelStories: 3 } });
  });
});
