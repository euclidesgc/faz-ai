// Contraste de texto sobre cores escolhidas pelo usuário (selos de status e de tipo).
// Funções puras: rodam no webview, no renderToString e nos testes em node.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Canais 0–255 de #rgb ou #rrggbb; null quando não é hex. */
function channels(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null;
  const h = hex.length === 4 ? hex.slice(1).replace(/./g, '$&$&') : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Luminância relativa WCAG (0 = preto, 1 = branco); entrada inválida conta como preto. */
export function luminance(hex: string): number {
  const rgb = channels(hex);
  if (!rgb) return 0;
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Preto ou branco, o que contrastar mais com o fundo. */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  // preto puro, não cinza-escuro: assim o pior caso fica em ~4.58:1, sempre ≥ 4.5
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff';
}

/** Estilo inline de selo: fundo na cor do usuário e texto legível sobre ela; undefined se a cor não for hex. */
export function badgeStyle(color?: string | null): { background: string; color: string } | undefined {
  if (!color || !HEX.test(color)) return undefined;
  return { background: color, color: readableOn(color) };
}
