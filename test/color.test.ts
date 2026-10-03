import { describe, expect, it } from 'vitest';
import { badgeStyle, contrastRatio, luminance, readableOn } from '../src/shared/color';

describe('color', () => {
  it('escolhe preto ou branco para as cores padrão', () => {
    expect(readableOn('#4c8dff')).toBe('#000000');
    expect(readableOn('#9b59b6')).toBe('#ffffff');
    expect(readableOn('#f5a623')).toBe('#000000');
    expect(readableOn('#2ecc71')).toBe('#000000');
    expect(readableOn('#e5484d')).toBe('#000000');
    expect(readableOn('#6b7280')).toBe('#ffffff');
  });

  it('garante contraste ≥ 4.5 em toda a grade de cores', () => {
    const steps = [0x00, 0x33, 0x66, 0x99, 0xcc, 0xff];
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const color = `#${hex(r)}${hex(g)}${hex(b)}`;
          expect(contrastRatio(color, readableOn(color)), color).toBeGreaterThanOrEqual(4.5);
        }
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
