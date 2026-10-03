import { DEFAULT_STATUS_STYLES, parseStatusStyles, type StatusStyles } from './status';

/** Aparência do board: tema, tipografia dos textos longos (descrição, conversa) e os status dos cards. */

export type ThemeMode = 'system' | 'light' | 'dark';
export type TextFont = 'sans' | 'ui' | 'serif' | 'mono' | 'editor';

export interface Appearance {
  /** 'system' acompanha só o claro ou escuro do VS Code (no navegador, o do sistema operacional); as cores são sempre as do board */
  theme: ThemeMode;
  /** fonte dos campos de texto longo */
  font: TextFont;
  /** tamanho, em px, da fonte dos campos de texto longo */
  fontSize: number;
  /** rótulo e cor de cada status de card */
  statuses: StatusStyles;
}

export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', font: 'sans', fontSize: 14, statuses: DEFAULT_STATUS_STYLES };
export const FONT_SIZE_RANGE = { min: 11, max: 22 };

export const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Sistema (acompanha o editor ou o sistema)' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

export const FONTS: { value: TextFont; label: string; stack: string }[] = [
  {
    value: 'sans',
    label: 'Sem serifa do sistema',
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif',
  },
  { value: 'ui', label: 'Fonte da interface do VS Code', stack: 'var(--vscode-font-family), system-ui, sans-serif' },
  { value: 'serif', label: 'Serifada', stack: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  { value: 'mono', label: 'Monoespaçada', stack: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' },
  { value: 'editor', label: 'Fonte do editor do VS Code', stack: 'var(--vscode-editor-font-family), ui-monospace, monospace' },
];

export const fontStack = (font: TextFont): string => (FONTS.find((f) => f.value === font) ?? FONTS[0]!).stack;

/** Lê a aparência salva, completando com os padrões o que faltar ou for inválido. */
export function parseAppearance(json: string | null | undefined): Appearance {
  let raw: Partial<Record<keyof Appearance, unknown>> = {};
  try {
    const v: unknown = JSON.parse(json ?? '');
    if (v && typeof v === 'object') raw = v as typeof raw;
  } catch {
    /* inválido: usa os padrões */
  }
  const size = Math.round(Number(raw.fontSize));
  return {
    theme: THEMES.some((t) => t.value === raw.theme) ? (raw.theme as ThemeMode) : DEFAULT_APPEARANCE.theme,
    font: FONTS.some((f) => f.value === raw.font) ? (raw.font as TextFont) : DEFAULT_APPEARANCE.font,
    fontSize:
      Number.isFinite(size) && size > 0 ? Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, size)) : DEFAULT_APPEARANCE.fontSize,
    statuses: parseStatusStyles(raw.statuses),
  };
}
