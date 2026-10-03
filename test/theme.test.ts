import { describe, expect, it } from 'vitest';
import { resolveTheme, type ThemeEnv } from '../src/webview/theme';

const env = (over: Partial<ThemeEnv> = {}): ThemeEnv => ({ isWeb: false, bodyClasses: [], prefersDark: false, ...over });

describe('resolveTheme', () => {
  it('respeita o claro ou escuro escolhido, em qualquer ambiente', () => {
    for (const isWeb of [true, false]) {
      expect(resolveTheme('light', env({ isWeb, prefersDark: true, bodyClasses: ['vscode-dark'] }))).toBe('light');
      expect(resolveTheme('dark', env({ isWeb, prefersDark: false, bodyClasses: ['vscode-light'] }))).toBe('dark');
    }
  });

  it('no navegador, "sistema" segue o sistema operacional', () => {
    expect(resolveTheme('system', env({ isWeb: true, prefersDark: true }))).toBe('dark');
    expect(resolveTheme('system', env({ isWeb: true, prefersDark: false }))).toBe('light');
    // classes do editor não contam no navegador
    expect(resolveTheme('system', env({ isWeb: true, prefersDark: false, bodyClasses: ['vscode-dark'] }))).toBe('light');
  });

  it.each([
    ['vscode-light', 'light'],
    ['vscode-high-contrast-light', 'light'],
    ['vscode-dark', 'dark'],
    ['vscode-high-contrast', 'dark'],
  ] as const)('no editor, "sistema" com %s vira %s', (cls, expected) => {
    // prefersDark ao contrário, para provar que a classe do editor manda
    expect(resolveTheme('system', env({ bodyClasses: ['sidebar-view', cls], prefersDark: expected === 'light' }))).toBe(expected);
  });

  it('no editor, as duas classes de alto contraste juntas são o tema claro', () => {
    expect(resolveTheme('system', env({ bodyClasses: ['vscode-high-contrast', 'vscode-high-contrast-light'], prefersDark: true }))).toBe(
      'light',
    );
  });

  it('no editor sem classe do VS Code, cai no sistema operacional', () => {
    expect(resolveTheme('system', env({ prefersDark: true }))).toBe('dark');
    expect(resolveTheme('system', env({ prefersDark: false }))).toBe('light');
  });
});
