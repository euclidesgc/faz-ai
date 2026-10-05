import { describe, expect, it } from 'vitest';
import { settings as settingsEn } from '../src/webview/i18n/en/settings';

describe('tradução inglesa de settings', () => {
  it('a frase de histórias em paralelo cita o rótulo em inglês, não o português', () => {
    const texts = Object.values(settingsEn).join('\n');
    expect(texts).not.toContain('turn on "Tocar histórias em paralelo"');
    expect(texts).toContain('turn on "Drive stories in parallel"');
  });
});
