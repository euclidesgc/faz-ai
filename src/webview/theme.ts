import type { ThemeMode } from '../shared/appearance';

export interface ThemeEnv {
  isWeb: boolean;
  bodyClasses: readonly string[];
  prefersDark: boolean;
}

/** Decide o claro ou escuro do board. Pura: não toca em DOM (roda em node nos testes). */
export function resolveTheme(mode: ThemeMode, env: ThemeEnv): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  const fallback = env.prefersDark ? 'dark' : 'light';
  if (env.isWeb) return fallback;
  // as classes claras vêm primeiro: no alto contraste claro o VS Code pode pôr também `vscode-high-contrast`
  if (env.bodyClasses.includes('vscode-high-contrast-light') || env.bodyClasses.includes('vscode-light')) return 'light';
  if (env.bodyClasses.includes('vscode-dark') || env.bodyClasses.includes('vscode-high-contrast')) return 'dark';
  return fallback;
}
