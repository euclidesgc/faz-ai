import { lastSent, renderThemed, seedBoard, confirmLast } from './setup';
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
    expect(screen.getByRole('checkbox', { name: 'Importar react' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Importar sql' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Importar selecionadas (2)' }));
    expect(useBoardStore.getState().dialog).toBeNull();
    expect(lastSent('harness.library.import')).toEqual({ type: 'harness.library.import', rels: ['react', 'sql'] });
    confirmLast();
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 skill(s) importada(s). Elas estão na aba Skills abaixo, no modo Pelo card.',
    );
  });
  it('permite escolher uma pasta de origem e reler a biblioteca sem digitar caminhos', async () => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByRole('button', { name: 'Importar de uma pasta' }));
    expect(lastSent('harness.library.pick')).toEqual({ type: 'harness.library.pick' });
    confirmLast();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar lista' }));
    expect(lastSent('harness.refresh')).toEqual({ type: 'harness.refresh' });
  });
});
