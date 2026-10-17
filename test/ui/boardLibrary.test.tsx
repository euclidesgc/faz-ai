import { lastSent, renderThemed, seedBoard } from './setup';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BoardLibrary } from '../../src/webview/components/settings/harness/BoardLibrary';
import { useBoardStore } from '../../src/webview/store/boardStore';

beforeEach(async () => {
  await seedBoard();
});

describe('biblioteca do board nas configurações', () => {
  it('mostra a pasta e permite trocar o destino sem selecionar uma ferramenta', async () => {
    renderThemed(<BoardLibrary />);
    const field = screen.getByRole('textbox', { name: 'Pasta da biblioteca' });
    expect(field).toHaveValue(useBoardStore.getState().state!.harness.library!.directory);
    await userEvent.clear(field);
    await userEvent.type(field, '/dados/biblioteca');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    expect(lastSent('harness.library.directory')).toEqual({ type: 'harness.library.directory', dir: '/dados/biblioteca' });
  });

  it('permite selecionar uma coleção inteira e importa diretamente para o board', async () => {
    act(() => {
      const state = useBoardStore.getState().state!;
      useBoardStore.setState({
        state: {
          ...state,
          harnessInstall: {
            source: '/skills',
            skills: ['react', 'sql'].map((name) => ({ rel: name, name, description: name, files: 1, valid: true })),
          },
        },
      });
    });
    renderThemed(<BoardLibrary />);
    await userEvent.click(screen.getByRole('button', { name: 'Selecionar todas' }));
    expect(screen.getByRole('checkbox', { name: 'Instalar react' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Instalar sql' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Instalar 2 selecionada(s)' }));
    act(() => {
      void useBoardStore.getState().dialog!.onConfirm();
    });
    expect(lastSent('harness.library.import')).toEqual({ type: 'harness.library.import', rels: ['react', 'sql'] });
  });
});
