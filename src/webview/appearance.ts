import { useEffect } from 'react';
import { fontStack } from '../shared/appearance';
import { useBoardStore } from './store/boardStore';
import { isWeb } from './vscode';

/** Aplica o tema e a tipografia do board ao documento deste webview. */
export function useAppearance(): void {
  const appearance = useBoardStore((s) => s.state?.board.appearance);
  useEffect(() => {
    if (!appearance) return;
    const { body } = document;
    body.style.setProperty('--text-font', fontStack(appearance.font));
    body.style.setProperty('--text-size', `${appearance.fontSize}px`);
    if (appearance.theme !== 'system') return void (body.dataset.theme = appearance.theme);
    // no editor, "sistema" são as cores do próprio VS Code; no navegador, o claro ou escuro do sistema operacional
    if (!isWeb) return void delete body.dataset.theme;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => (body.dataset.theme = dark.matches ? 'dark' : 'light');
    apply();
    dark.addEventListener('change', apply);
    return () => dark.removeEventListener('change', apply);
  }, [appearance]);
}
