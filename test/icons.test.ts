import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(__dirname, '../src/webview');
const files = (readdirSync(root, { recursive: true }) as string[])
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ path: relative(root, join(root, f)), text: readFileSync(join(root, f), 'utf8') }));

// emojis e símbolos gráficos usados como ícone (setas, triângulos, dingbats, braille, ⋯ ≡ ‹ ›)
const PICTOGRAPH = new RegExp(
  '[\\u2022\\u2039\\u203A\\u2190-\\u21FF\\u2200-\\u23FF\\u2440-\\u245F\\u25A0-\\u27BF\\u2800-\\u297F\\u2B00-\\u2BFF\\u{1F300}-\\u{1FAFF}]',
  'gu',
);
// setas em frases ("Workflows e colunas → Fase", "use ↑ e ↓") são texto, não ícone
const PROSE = new Set(['→', '↑', '↓', '›']);

describe('ícones do board', () => {
  it('a interface usa os ícones de components/ui/icons.tsx, não emojis nem símbolos soltos', () => {
    const found = files.flatMap(({ path, text }) =>
      text
        .split('\n')
        .flatMap((line, i) => [...line.matchAll(PICTOGRAPH)].filter((m) => !PROSE.has(m[0])).map((m) => `${path}:${i + 1} ${m[0]}`)),
    );
    expect(found).toEqual([]);
  });

  it('só o mapa semântico importa de lucide-react', () => {
    const importers = files.filter((f) => f.text.includes("from 'lucide-react'")).map((f) => f.path);
    expect(importers).toEqual([join('components', 'ui', 'icons.tsx')]);
  });
});
