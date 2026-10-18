import { vi, beforeEach, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { confirmLast, lastSent, renderThemed, seedBoard, sentOf } from './setup';
import { BoardLibrary } from '../../src/webview/components/settings/harness/BoardLibrary';
import { useBoardStore } from '../../src/webview/store/boardStore';

vi.hoisted(() => {
  (globalThis as { __fazaiTestWeb?: boolean }).__fazaiTestWeb = true;
});

beforeEach(async () => {
  await seedBoard();
  useBoardStore.setState({ chatOpen: false });
});

it('abre a conversa no navegador ao gerar artefatos do projeto', async () => {
  renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByRole('tab', { name: /^Regras/ }));
  const button = screen.getByRole('button', { name: 'Gerar com base no projeto' });
  await userEvent.click(button);
  expect(lastSent('ai.suggestRules')).toEqual({ type: 'ai.suggestRules' });
  expect(useBoardStore.getState().chatOpen).toBe(true);
  expect(sentOf('ui.showChat')).toHaveLength(0);
  expect(button).toHaveAttribute('aria-busy', 'true');
  confirmLast();
  await waitFor(() => expect(button).toBeEnabled());
});

it('escolhe uma pasta no navegador e só muda o armazenamento ao salvar', async () => {
  renderThemed(<BoardLibrary />);
  confirmLast();
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar pasta' }));
  expect(lastSent('harness.library.folders')).toEqual({ type: 'harness.library.folders', dir: '' });
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'harness.library.foldersResult',
          directory: '/home/person',
          parent: '/home',
          folders: [{ name: 'library', path: '/home/person/library' }],
        },
      }),
    ),
  );
  confirmLast();
  const dialog = within(screen.getByRole('dialog'));
  await userEvent.click(dialog.getByRole('button', { name: 'library' }));
  expect(lastSent('harness.library.folders')).toEqual({ type: 'harness.library.folders', dir: '/home/person/library' });
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'harness.library.foldersResult',
          directory: '/home/person/library',
          parent: '/home/person',
          folders: [],
        },
      }),
    ),
  );
  confirmLast();
  await userEvent.click(dialog.getByRole('button', { name: 'Usar esta pasta' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Pasta da biblioteca' })).toHaveValue('/home/person/library');
  expect(sentOf('harness.library.directory')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar pasta' }));
  expect(lastSent('harness.library.directory')).toEqual({ type: 'harness.library.directory', dir: '/home/person/library' });
  confirmLast();
});
