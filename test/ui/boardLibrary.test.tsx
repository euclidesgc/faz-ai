import { lastSent, renderThemed, seedBoard, confirmLast } from './setup';
import { act, screen, waitFor } from '@testing-library/react';
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
    await userEvent.click(screen.getByText('Armazenamento da biblioteca'));
    const field = screen.getByRole('textbox', { name: 'Pasta da biblioteca' });
    expect(field).toHaveValue(useBoardStore.getState().state!.harness.library!.directory);
    await userEvent.clear(field);
    await userEvent.type(field, '/dados/biblioteca');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    expect(lastSent('harness.library.directory')).toEqual({ type: 'harness.library.directory', dir: '/dados/biblioteca' });
  });

  it('agrupa a prévia por tipo e importa os artefatos selecionados', async () => {
    act(() => {
      const state = useBoardStore.getState().state!;
      useBoardStore.setState({
        state: {
          ...state,
          harness: {
            ...state.harness,
            library: {
              ...state.harness.library!,
              preview: {
                directory: '/origem',
                items: [
                  { key: '0', kind: 'skill', name: 'react', description: '' },
                  { key: '1', kind: 'rule', name: 'AGENTS.md', description: '' },
                  { key: '2', kind: 'agent', name: 'revisor', description: '' },
                  { key: '3', kind: 'mcp', name: 'memoria', description: '' },
                ],
              },
            },
          },
        },
      });
    });
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByText('Importar artefatos de uma pasta'));
    expect(screen.getByRole('checkbox', { name: 'react' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'memoria' }));
    await userEvent.click(screen.getByRole('button', { name: 'Importar selecionados (3)' }));
    expect(lastSent('harness.library.apply')).toEqual({ type: 'harness.library.apply', keys: ['0', '1', '2'] });
    confirmLast();
    expect(await screen.findByRole('status')).toHaveTextContent('Importação concluída.');
  });

  it('escolhe uma pasta para todos os tipos e permite atualizar a lista', async () => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByText('Importar artefatos de uma pasta'));
    await userEvent.click(screen.getByRole('button', { name: 'Escolher pasta' }));
    expect(lastSent('harness.library.pickArtifacts')).toEqual({ type: 'harness.library.pickArtifacts' });
    confirmLast();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar lista' }));
    expect(lastSent('harness.refresh')).toEqual({ type: 'harness.refresh' });
  });

  it('o assistente de regras revisa AGENTS.md e só fecha após salvar', async () => {
    renderThemed(<BoardLibrary />);
    confirmLast();
    await userEvent.click(screen.getByRole('tab', { name: /^Regras/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Assistente guiado' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Objetivo' }), 'Usar contratos do projeto');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Executar os testes do projeto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('AGENTS.md');
    expect((screen.getByRole('textbox', { name: 'Conteúdo' }) as HTMLTextAreaElement).value).toContain('Usar contratos do projeto');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    expect(lastSent('harness.library.save')).toMatchObject({ input: { kind: 'rule', name: 'AGENTS.md' } });
    expect(screen.getByRole('textbox', { name: 'Conteúdo' })).toBeInTheDocument();
    confirmLast();
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Conteúdo' })).toBeNull());
  });
});
