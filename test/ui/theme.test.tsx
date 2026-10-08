import { lastSent, posted, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import type { ThemeMode } from '../../src/shared/appearance';
import { ThemeToggle } from '../../src/webview/components/ThemeToggle';
import { AppearanceSettings } from '../../src/webview/components/settings/AppearanceSettings';
import { applyTheme } from '../../src/webview/appearance';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

/** Deixa o board com o tema pedido (como se o host já tivesse aplicado a mudança). */
const withTheme = (theme: ThemeMode) => {
  board.router.handle({ type: 'settings.board.update', patch: { appearance: { theme } } });
  syncStore(board.router);
  posted.mockClear();
};

describe('ThemeToggle', () => {
  it.each([
    ['system', 'light'],
    ['light', 'dark'],
    ['dark', 'system'],
  ] as const)('com o tema %s, o clique pede %s', async (current, next) => {
    withTheme(current);
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button'));
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { theme: next } });
  });
});

describe('AppearanceSettings dentro do editor', () => {
  it('não mostra os 4 campos nem a tabela de status; mostra o aviso e o botão para o Settings do editor', async () => {
    withTheme('system');
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    expect(screen.queryByRole('combobox', { name: 'Tema' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Fonte dos textos' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Idioma' })).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByLabelText('Nome do status running')).toBeNull();
    expect(screen.getByText('A aparência do board (idioma, tema, fonte e tamanho) agora fica no Settings do editor.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no Settings do editor' }));
    expect(lastSent('ui.openIdeSettings')).toEqual({ type: 'ui.openIdeSettings', key: 'fazai.appearance.theme' });
  });
});

describe('applyTheme', () => {
  it('marca data-theme e a classe light/dark que os componentes do Radix Themes leem', () => {
    applyTheme('dark');
    expect(document.body.dataset.theme).toBe('dark');
    expect(document.body).toHaveClass('dark');
    expect(document.body).not.toHaveClass('light');
    applyTheme('light');
    expect(document.body).toHaveClass('light');
    expect(document.body).not.toHaveClass('dark');
  });
});
