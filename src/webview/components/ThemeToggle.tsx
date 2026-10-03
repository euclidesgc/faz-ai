import { THEMES, type ThemeMode } from '../../shared/appearance';
import { useBoardStore } from '../store/boardStore';
import { t } from '../i18n';
import { settings } from '../commands';
import { Button } from './ui';

/** Ordem em que o botão percorre os temas a cada clique. */
export const THEME_CYCLE: ThemeMode[] = ['system', 'light', 'dark'];

const ICONS: Record<ThemeMode, JSX.Element> = {
  system: <path d="M3 4h18v12H3zM8 20h8M12 16v4" />,
  light: (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  ),
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
};

export const nextTheme = (theme: ThemeMode): ThemeMode => THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;

/** Atalho no topo do board para trocar o tema; grava a mesma preferência de Configurações > Aparência. */
export function ThemeToggle() {
  const theme = useBoardStore((s) => s.state?.board.appearance.theme) ?? 'system';
  const name = (mode: ThemeMode) => t(THEMES.find((th) => th.value === mode)!.label.split(' (')[0]!);
  const label = t('Tema: {current}. Clique para mudar para {next}.', { current: name(theme), next: name(nextTheme(theme)) });
  return (
    <Button
      variant="icon"
      className="theme-toggle"
      title={label}
      aria-label={label}
      onClick={() => settings.updateBoard({ appearance: { theme: nextTheme(theme) } })}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[theme]}
      </svg>
    </Button>
  );
}
