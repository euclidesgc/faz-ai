import { lastSent, posted, seedBoard, syncStore, type SeededBoard } from './setup';
import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ThemeMode } from '../../src/shared/appearance';
import { ThemeToggle } from '../../src/webview/components/ThemeToggle';
import { AppearanceSettings } from '../../src/webview/components/settings/AppearanceSettings';

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
    render(<AppearanceSettings />);
    await userEvent.selectOptions(screen.getByLabelText('Tema'), 'dark');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { theme: 'dark' } });
  });

  it('trocar a fonte envia o patch da fonte', async () => {
    withTheme('system');
    render(<AppearanceSettings />);
    await userEvent.selectOptions(screen.getByLabelText('Fonte dos textos'), 'serif');
    expect(lastSent('settings.board.update').patch).toEqual({ appearance: { font: 'serif' } });
  });
});
