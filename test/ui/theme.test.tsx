import { choose, lastSent, posted, seedBoard, syncStore, type SeededBoard } from './setup';
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
  const open = () => {
    withTheme('system');
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
  };

  it('mostra os 4 campos, sem o aviso nem o botão do Settings do editor', () => {
    open();
    expect(screen.getByRole('combobox', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Fonte dos textos' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.queryByText(/agora fica no Settings do editor/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir no Settings do editor' })).toBeNull();
  });

  it('trocar tema, idioma e fonte grava só o campo alterado', async () => {
    open();
    await choose(screen.getByRole('combobox', { name: 'Tema' }), 'Escuro');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { theme: 'dark' } });
    await choose(screen.getByRole('combobox', { name: 'Idioma' }), 'English');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { language: 'en' } });
    await choose(screen.getByRole('combobox', { name: 'Fonte dos textos' }), 'Serifada');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { font: 'serif' } });
  });

  it('o controle deslizante grava o tamanho da fonte', async () => {
    open();
    screen.getByRole('slider').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(lastSent('settings.board.update').patch.appearance!.fontSize).toBeGreaterThan(0);
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
