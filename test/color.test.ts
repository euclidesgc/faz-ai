import { describe, expect, it } from 'vitest';
import {
  apcaContrast,
  badgeContrast,
  badgeStyle,
  contrastRatio,
  luminance,
  MIN_BADGE_LC,
  readableOn,
  readableVariants,
} from '../src/shared/color';

describe('color', () => {
  it('escolhe o texto pelo contraste percebido: branco sobre azul e vermelho, preto sobre laranja e verde', () => {
    expect(readableOn('#4c8dff')).toBe('#ffffff');
    expect(readableOn('#9b59b6')).toBe('#ffffff');
    expect(readableOn('#f5a623')).toBe('#000000');
    expect(readableOn('#2ecc71')).toBe('#000000');
    expect(readableOn('#e5484d')).toBe('#ffffff');
    expect(readableOn('#6b7280')).toBe('#ffffff');
  });

  it('as cores padrão de tipo e status ficam acima do mínimo, sem aviso', () => {
    for (const c of ['#4c8dff', '#9b59b6', '#f5a623', '#2ecc71', '#e5484d']) expect(badgeContrast(c).low, c).toBe(false);
  });

  it('APCA: sinal pela polaridade e 0 sem contraste', () => {
    expect(apcaContrast('#000000', '#ffffff')).toBeGreaterThan(100);
    expect(apcaContrast('#ffffff', '#000000')).toBeLessThan(-100);
    expect(apcaContrast('#777777', '#777777')).toBe(0);
  });

  it('em toda a grade, a cor já é legível ou há uma variante da mesma cor que é', () => {
    const steps = [0x00, 0x33, 0x66, 0x99, 0xcc, 0xff];
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const color = `#${hex(r)}${hex(g)}${hex(b)}`;
          if (!badgeContrast(color).low) continue;
          const variants = readableVariants(color);
          expect(variants.length, color).toBeGreaterThan(0);
          for (const v of variants) expect(badgeContrast(v).lc, `${color} → ${v}`).toBeGreaterThanOrEqual(MIN_BADGE_LC);
        }
  });

  it('sugere uma variante mais escura e uma mais clara para cor de meio-tom', () => {
    const [darker, lighter] = readableVariants('#00aaaa');
    expect(luminance(darker!)).toBeLessThan(luminance('#00aaaa'));
    expect(luminance(lighter!)).toBeGreaterThan(luminance('#00aaaa'));
    expect(readableVariants('#4c8dff')).toEqual([]);
  });

  it('preto e branco têm contraste 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('aceita #rgb como #rrggbb', () => {
    expect(luminance('#fff')).toBe(luminance('#ffffff'));
    expect(luminance('#4c8')).toBe(luminance('#44cc88'));
  });

  it('badgeStyle ignora cores ausentes ou inválidas', () => {
    expect(badgeStyle(undefined)).toBeUndefined();
    expect(badgeStyle(null)).toBeUndefined();
    expect(badgeStyle('')).toBeUndefined();
    expect(badgeStyle('red')).toBeUndefined();
    expect(badgeStyle('#12')).toBeUndefined();
    expect(badgeStyle('#f5a623')).toEqual({ background: '#f5a623', color: '#000000' });
  });
});
