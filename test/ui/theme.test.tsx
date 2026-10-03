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

describe('AppearanceSettings', () => {
  it('trocar o tema no select envia só o campo alterado', async () => {
    withTheme('system');
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    await choose(screen.getByRole('combobox', { name: 'Tema' }), 'Escuro');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { theme: 'dark' } });
  });

  it('trocar a fonte envia o patch da fonte', async () => {
    withTheme('system');
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    await choose(screen.getByRole('combobox', { name: 'Fonte dos textos' }), 'Serifada');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { font: 'serif' } });
  });
});

describe('AppearanceSettings: tamanho da fonte e status', () => {
  it('o controle deslizante muda o tamanho da fonte pelo teclado', async () => {
    withTheme('system');
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    const thumb = screen.getByRole('slider');
    thumb.focus();
    await userEvent.keyboard('{ArrowRight}');
    const { fontSize } = lastSent('settings.board.update').patch.appearance!;
    expect(fontSize).toBeGreaterThan(0);
  });

  it('o nome de um status é uma caixa de texto e grava ao sair', async () => {
    withTheme('system');
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    const name = screen.getByLabelText('Nome do status running');
    await userEvent.clear(name);
    await userEvent.type(name, 'Rodando');
    await userEvent.tab();
    expect(lastSent('settings.board.update').patch.appearance!.statuses!.running!.label).toBe('Rodando');
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
