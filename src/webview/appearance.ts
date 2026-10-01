import { useEffect } from 'react';
import { fontStack } from '../shared/appearance';
import { useBoardStore } from './store/boardStore';

/** Aplica o tema e a tipografia do board ao documento deste webview. */
export function useAppearance(): void {
  const appearance = useBoardStore((s) => s.state?.board.appearance);
  useEffect(() => {
    if (!appearance) return;
    const { body } = document;
    if (appearance.theme === 'system') delete body.dataset.theme;
    else body.dataset.theme = appearance.theme;
    body.style.setProperty('--text-font', fontStack(appearance.font));
    body.style.setProperty('--text-size', `${appearance.fontSize}px`);
  }, [appearance]);
}
