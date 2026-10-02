import { lastSent, seedBoard, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '../../src/webview/components/FilterBar';
import { FilterPanel } from '../../src/webview/components/FilterPanel';
import { useBoardStore } from '../../src/webview/store/boardStore';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

const filters = () => useBoardStore.getState().filters;

describe('FilterPanel', () => {
  it('clicar num chip de tipo liga o filtro e compartilha com o host', async () => {
    render(<FilterPanel />);
    const type = board.router.snapshot().cardTypes[0]!;
    await userEvent.click(screen.getByRole('button', { name: type.name }));
    expect(filters().typeIds).toEqual([type.id]);
    expect(lastSent('view.set').patch.filters?.typeIds).toEqual([type.id]);
  });

  it('clicar de novo no chip desliga o filtro', async () => {
    render(<FilterPanel />);
    const type = board.router.snapshot().cardTypes[0]!;
    const chip = screen.getByRole('button', { name: type.name });
    await userEvent.click(chip);
    await userEvent.click(chip);
    expect(filters().typeIds).toEqual([]);
    expect(lastSent('view.set').patch.filters?.typeIds).toEqual([]);
  });

  it('chip de um campo de opções acumula valores do mesmo campo', async () => {
    render(<FilterPanel />);
    const field = board.router.snapshot().fieldDefs.find((f) => f.kind === 'select' && f.options.length >= 2)!;
    const [a, b] = field.options as [string, string];
    await userEvent.click(screen.getByRole('button', { name: a }));
    await userEvent.click(screen.getByRole('button', { name: b }));
    expect(filters().fields[field.id]).toEqual([a, b]);
  });

  it('o select de pendência muda o dono filtrado', async () => {
    render(<FilterPanel />);
    // a opção "Com a IA" só existe no select de pendência
    await userEvent.selectOptions(screen.getByRole('option', { name: 'Com a IA' }).closest('select')!, 'human');
    expect(filters().owner).toBe('human');
    expect(lastSent('view.set').patch.filters?.owner).toBe('human');
  });
});

describe('FilterBar', () => {
  it('no editor, o botão Filtros pede ao host para mostrar a barra lateral', async () => {
    render(<FilterBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(lastSent('ui.showFilters')).toEqual({ type: 'ui.showFilters' });
  });

  it('digitar na busca atualiza o texto do filtro', async () => {
    render(<FilterBar />);
    await userEvent.type(screen.getByRole('searchbox'), 'login');
    expect(filters().text).toBe('login');
    expect(lastSent('view.set').patch.filters?.text).toBe('login');
  });

  it('clicar no chip de um filtro ativo remove só aquele filtro; Limpar zera tudo', async () => {
    const type = board.router.snapshot().cardTypes[0]!;
    useBoardStore.setState({ filters: { ...filters(), typeIds: [type.id], owner: 'ai' } });
    render(<FilterBar />);
    await userEvent.click(screen.getByText(`Tipo: ${type.name} ✕`));
    expect(filters().typeIds).toEqual([]);
    expect(filters().owner).toBe('ai');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(filters().owner).toBe('any');
    expect(lastSent('view.set').patch).toMatchObject({ selectedParentId: null, filters: { owner: 'any', typeIds: [] } });
  });
});
