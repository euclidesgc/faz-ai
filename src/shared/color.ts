// Contraste de texto sobre cores escolhidas pelo usuário (selos de status e barra do tipo do card).
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

/**
 * Contraste percebido APCA (Lc, do rascunho da WCAG 3): positivo para texto escuro sobre fundo claro,
 * negativo para texto claro sobre fundo escuro; quanto maior o módulo, mais legível (0 a ~106).
 * Usado para escolher o texto sobre cores do usuário porque a razão WCAG 2 erra nas cores médias e
 * saturadas: ela escolhe texto preto sobre azul e vermelho, que fica difícil de ler em letra pequena.
 */
export function apcaContrast(text: string, background: string): number {
  const y = (hex: string) => {
    const [r, g, b] = (channels(hex) ?? [0, 0, 0]).map((c) => (c / 255) ** 2.4) as [number, number, number];
    const v = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    return v < 0.022 ? v + (0.022 - v) ** 1.414 : v;
  };
  const yt = y(text);
  const yb = y(background);
  if (yb > yt) {
    const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

/** Abaixo deste Lc o texto pequeno e em negrito dos selos fica difícil de ler. */
export const MIN_BADGE_LC = 60;

/** Preto ou branco, o que tiver mais contraste percebido (APCA) com o fundo. */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  return Math.abs(apcaContrast('#000000', hex)) >= Math.abs(apcaContrast('#ffffff', hex)) ? '#000000' : '#ffffff';
}

/** Contraste do texto escolhido sobre a cor: o Lc (em módulo) e se fica abaixo do mínimo dos selos. */
export function badgeContrast(hex: string): { lc: number; low: boolean } {
  const lc = Math.abs(apcaContrast(readableOn(hex), hex));
  return { lc, low: lc < MIN_BADGE_LC };
}

const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** Mistura a cor com preto (`amount` < 0) ou branco (`amount` > 0), de -1 a 1; mantém o matiz. */
function shade(hex: string, amount: number): string {
  const rgb = channels(hex)!;
  return toHex(rgb.map((c) => (amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
}

/**
 * Variantes da mesma cor que deixam o texto legível: a mais próxima escurecendo (texto branco) e a
 * mais próxima clareando (texto preto). Vazio quando a cor já tem contraste suficiente ou não é hex.
 */
export function readableVariants(hex: string, target = MIN_BADGE_LC + 10): string[] {
  if (!HEX.test(hex) || !badgeContrast(hex).low) return [];
  const find = (sign: -1 | 1) => {
    for (let step = 1; step <= 20; step++) {
      const c = shade(hex, (sign * step) / 20);
      if (badgeContrast(c).lc >= target) return c;
    }
    return null;
  };
  return [find(-1), find(1)].filter((c): c is string => c !== null);
}

/** Estilo inline de selo: fundo na cor do usuário e texto legível sobre ela; undefined se a cor não for hex. */
export function badgeStyle(color?: string | null): { background: string; color: string } | undefined {
  if (!color || !HEX.test(color)) return undefined;
  return { background: color, color: readableOn(color) };
}
