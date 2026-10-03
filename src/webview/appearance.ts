import { useEffect } from 'react';
import { fontStack, type ThemeMode } from '../shared/appearance';
import { resolveLocale } from '../shared/language';
import { setLocale } from './i18n';
import { useBoardStore } from './store/boardStore';
import { resolveTheme } from './theme';
import { isWeb } from './vscode';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Grava em `data-theme` o claro ou escuro que vale agora neste documento. */
export function applyTheme(mode: ThemeMode): void {
  const { body } = document;
  const theme = resolveTheme(mode, {
    isWeb,
    bodyClasses: Array.from(body.classList),
    prefersDark: window.matchMedia(DARK_QUERY).matches,
  });
  body.dataset.theme = theme;
  // os componentes do Radix Themes leem o claro/escuro pela classe `light`/`dark` de um ancestral
  body.classList.toggle('dark', theme === 'dark');
  body.classList.toggle('light', theme === 'light');
}

/** Aplica o tema e a tipografia do board ao documento deste webview. */
export function useAppearance(): void {
  const appearance = useBoardStore((s) => s.state?.board.appearance);
  useEffect(() => {
    if (!appearance) return;
    const locale = resolveLocale(appearance.language, navigator.language);
    setLocale(locale);
    document.documentElement.lang = locale === 'en' ? 'en' : 'pt-BR';
    const { body } = document;
    body.style.setProperty('--text-font', fontStack(appearance.font));
    body.style.setProperty('--text-size', `${appearance.fontSize}px`);
    const { theme } = appearance;
    applyTheme(theme);
    if (theme !== 'system') return;
    const apply = () => applyTheme(theme);
    if (isWeb) {
      const dark = window.matchMedia(DARK_QUERY);
      dark.addEventListener('change', apply);
      return () => dark.removeEventListener('change', apply);
    }
    // no editor, o VS Code troca as classes `vscode-*` do body quando o tema muda
    const observer = new MutationObserver(apply);
    observer.observe(body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [appearance]);
}
