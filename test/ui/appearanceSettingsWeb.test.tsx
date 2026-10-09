import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';

// liga o modo navegador antes de o setup montar o mock de `src/webview/vscode` (vale para o arquivo inteiro,
// por isso este teste fica separado de theme.test.tsx, no padrão de settingsWeb.test.tsx)
vi.hoisted(() => {
  (globalThis as { __fazaiTestWeb?: boolean }).__fazaiTestWeb = true;
});

import { choose, lastSent, seedBoard, syncStore, type SeededBoard } from './setup';
import { AppearanceSettings } from '../../src/webview/components/settings/AppearanceSettings';

let board: SeededBoard;
beforeAll(async () => {
  board = await seedBoard();
});

const withTheme = () => syncStore(board.router);

describe('AppearanceSettings no navegador', () => {
  it('mostra os 4 campos, sem o aviso nem o botão do Settings do editor', () => {
    withTheme();
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tema' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Fonte dos textos' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir no Settings do editor' })).toBeNull();
    expect(screen.queryByLabelText('Nome do status running')).toBeNull();
  });

  it('trocar o tema no select envia só o campo alterado', async () => {
    withTheme();
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    await choose(screen.getByRole('combobox', { name: 'Tema' }), 'Escuro');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { theme: 'dark' } });
  });

  it('trocar a fonte envia o patch da fonte', async () => {
    withTheme();
    render(
      <Theme>
        <AppearanceSettings />
      </Theme>,
    );
    await choose(screen.getByRole('combobox', { name: 'Fonte dos textos' }), 'Serifada');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { font: 'serif' } });
  });

  it('o controle deslizante muda o tamanho da fonte pelo teclado', async () => {
    withTheme();
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
});
