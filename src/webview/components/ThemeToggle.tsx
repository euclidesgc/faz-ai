import { THEMES, type ThemeMode } from '../../shared/appearance';
import { useBoardStore } from '../store/boardStore';

/** Ordem em que o botão percorre os temas a cada clique. */
export const THEME_CYCLE: ThemeMode[] = ['system', 'light', 'dark'];

const ICONS: Record<ThemeMode, JSX.Element> = {
  system: <path d="M3 4h18v12H3zM8 20h8M12 16v4" />,
  light: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
};

export const nextTheme = (theme: ThemeMode): ThemeMode => THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;

/** Atalho no topo do board para trocar o tema; grava a mesma preferência de Configurações > Aparência. */
export function ThemeToggle() {
  const theme = useBoardStore((s) => s.state?.board.appearance.theme) ?? 'system';
  const send = useBoardStore((s) => s.send);
  const label = `Tema: ${THEMES.find((t) => t.value === theme)?.label.split(' (')[0]}. Clique para mudar para ${THEMES.find((t) => t.value === nextTheme(theme))?.label.split(' (')[0]}.`;
  return (
    <button
      className="icon theme-toggle"
      title={label}
      aria-label={label}
      onClick={() => send({ type: 'settings.board.update', patch: { appearance: { theme: nextTheme(theme) } } })}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[theme]}
      </svg>
    </button>
  );
}
