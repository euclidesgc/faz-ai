import { renderThemed, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { t } from '../../src/webview/i18n';
import { App } from '../../src/webview/App';
import { MetricsView } from '../../src/webview/components/metrics/MetricsView';
import { useBoardStore } from '../../src/webview/store/boardStore';

// Esqueleto da primeira carga: a forma da tela no lugar de um texto solto, com o rótulo para o leitor de tela.

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

describe('Placeholder', () => {
  it('o board sem estado mostra o esqueleto de topo e colunas, e some quando o estado chega', () => {
    useBoardStore.setState({ state: null });
    renderThemed(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(t('Carregando board…'));
    const skeleton = document.querySelector('.placeholder-board')!;
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton.querySelectorAll('.placeholder-column')).toHaveLength(3);
    act(() => syncStore(board.router));
    expect(document.querySelector('.placeholder-board')).toBeNull();
  });

  it('as Métricas sem resposta mostram o esqueleto, não um texto solto', () => {
    syncStore(board.router);
    renderThemed(<MetricsView />);
    expect(screen.getByText(t('Carregando métricas…'))).toBeInTheDocument();
    expect(document.querySelectorAll('.metrics-placeholder .placeholder-line').length).toBeGreaterThan(0);
  });
});
