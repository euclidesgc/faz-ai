import { choose, lastSent, seedBoard, sentOf, syncStore, type SeededBoard } from './setup';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { GitSettings } from '../../src/webview/components/settings/GitSettings';
import { WORKSPACE_MODES } from '../../src/shared/git';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});
beforeEach(() => syncStore(board.router));

const show = () =>
  render(
    <Theme>
      <GitSettings />
    </Theme>,
  );

describe('GitSettings', () => {
  it('o modo de trabalho grava o escolhido', async () => {
    show();
    const mode = WORKSPACE_MODES.find((m) => m.value === 'branch')!;
    await choose(screen.getByRole('combobox', { name: 'Onde a IA mexe no código' }), mode.label);
    expect(lastSent('settings.board.update').patch).toEqual({ git: { mode: 'branch' } });
  });

  it('explica o paralelismo de histórias conforme o modo: disponível no worktree, uma por vez nos outros', () => {
    const note = () => screen.getByRole('note', { name: 'Histórias em paralelo' });
    const first = show();
    expect(note()).toHaveTextContent('disponíveis neste modo');
    expect(note()).toHaveTextContent('mais uma cópia dos arquivos do projeto em disco');
    first.unmount();
    board.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'branch' } } });
    syncStore(board.router);
    const second = show();
    expect(note()).toHaveTextContent('trata uma história por vez');
    expect(note()).toHaveTextContent('causando conflitos');
    second.unmount();
    board.router.handle({ type: 'settings.board.update', patch: { git: { mode: 'worktree' } } });
    syncStore(board.router);
  });

  it('o nome da branch grava ao sair do campo, não a cada tecla', async () => {
    show();
    const name = screen.getByLabelText('Nome da branch');
    await userEvent.clear(name);
    await userEvent.type(name, 'feat/{{numero}');
    expect(sentOf('settings.board.update')).toHaveLength(0);
    await userEvent.tab();
    expect(lastSent('settings.board.update').patch).toEqual({ git: { branchPattern: 'feat/{numero}' } });
  });

  it('o merge automático liga com aviso, e só então o tipo de merge fica disponível', async () => {
    show();
    const method = screen.getByRole('combobox', { name: 'Tipo de merge' });
    expect(method).toBeDisabled();
    await userEvent.click(screen.getByRole('switch', { name: 'Fazer o merge do PR ao aprovar a homologação' }));
    expect(lastSent('settings.board.update').patch).toEqual({ git: { autoMerge: true } });
  });

  it('o switch de detecção de merge está marcado por padrão', async () => {
    show();
    const sw = screen.getByRole('switch', { name: 'Concluir a história quando o pull request for mergeado' });
    expect(sw).toBeChecked();
  });

  it('o switch de detecção de merge pode ser desligado', async () => {
    show();
    const sw = screen.getByRole('switch', { name: 'Concluir a história quando o pull request for mergeado' });
    await userEvent.click(sw);
    expect(lastSent('settings.board.update').patch).toEqual({ git: { watchMerges: false } });
  });

  it('o intervalo tem valor padrão 15', async () => {
    show();
    const field = screen.getByLabelText('Verificar a cada (minutos)') as HTMLInputElement;
    expect(field.value).toBe('15');
  });
});
