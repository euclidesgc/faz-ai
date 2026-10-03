import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastRatio } from '../src/shared/color';

// Verifica o Design System: contraste dos pares de cor em cada tema (tokens.css)
// e que styles.css consome só tokens (sem cor do VS Code, sem hex, sem brilho).

const tokensCss = readFileSync(resolve(__dirname, '../src/webview/tokens.css'), 'utf8');
const stylesCss = readFileSync(resolve(__dirname, '../src/webview/styles.css'), 'utf8');

type Tokens = Record<string, string>;

/** Declarações `--nome: valor;` do bloco cujo seletor é exatamente `selector`. */
function block(selector: string): Tokens {
  const start = tokensCss.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`bloco não encontrado em tokens.css: ${selector}`);
  const body = tokensCss.slice(start, tokensCss.indexOf('\n}', start));
  const out: Tokens = {};
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) out[m[1]!] = m[2]!.trim();
  return out;
}

const base = block('body');
const themes = {
  light: { ...base, ...block("body[data-theme='light']") },
  dark: { ...base, ...block("body[data-theme='dark']") },
};

/** Resolve `var(--x)` recursivamente até chegar num valor literal. */
function resolveToken(tokens: Tokens, name: string, seen: string[] = []): string {
  if (seen.includes(name)) throw new Error(`ciclo em ${seen.join(' -> ')} -> ${name}`);
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`token não definido: ${name}`);
  return raw.replace(/var\((--[\w-]+)\)/g, (_, ref) => resolveToken(tokens, ref, [...seen, name]));
}

// pares [frente, fundo, mínimo]. --border é decorativa (separadores, contornos de cartão) e não entra:
// o contraste exigido para bordas de controle fica em --border-strong/--input-border.
const pairs: Array<[string, string, number]> = [
  ['--fg', '--bg', 4.5],
  ['--fg', '--card-bg', 4.5],
  ['--fg', '--col-bg', 4.5],
  ['--fg', '--hover', 4.5],
  ['--muted', '--bg', 4.5],
  ['--muted', '--card-bg', 4.5],
  ['--muted', '--col-bg', 4.5],
  ['--muted', '--hover', 4.5],
  ['--link', '--bg', 4.5],
  ['--link', '--card-bg', 4.5],
  ['--link', '--col-bg', 4.5],
  ['--error', '--bg', 4.5],
  ['--error', '--card-bg', 4.5],
  ['--error', '--col-bg', 4.5],
  ['--btn-fg', '--btn-bg', 4.5],
  ['--btn-fg', '--btn-bg-hover', 4.5],
  ['--btn2-fg', '--btn2-bg', 4.5],
  ['--btn2-fg', '--btn2-bg-hover', 4.5],
  ['--input-fg', '--input-bg', 4.5],
  ['--badge-fg', '--badge-bg', 4.5],
  ['--fg', '--error-bg', 4.5],
  ['--fg', '--warn-bg', 4.5],
  ['--fg', '--code-bg', 4.5],
  ['--danger-fg', '--danger-bg', 4.5],
  ['--warn-solid-fg', '--warn-solid', 4.5],
  ['--input-border', '--input-bg', 3],
  ['--border-strong', '--bg', 3],
  ['--accent', '--bg', 3],
  ['--accent', '--card-bg', 3],
  ['--accent', '--col-bg', 3],
  ['--warn-border', '--bg', 3],
  ['--success', '--bg', 3],
  ['--success', '--col-bg', 3],
];

describe.each(Object.entries(themes))('tokens.css: tema %s', (_name, tokens) => {
  it('toda cor medida resolve para hex de 6 dígitos', () => {
    const names = new Set(pairs.flat().filter((p): p is string => typeof p === 'string'));
    for (const n of names) expect(resolveToken(tokens, n), n).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(pairs)('%s sobre %s tem contraste >= %s', (fg, bg, min) => {
    const ratio = contrastRatio(resolveToken(tokens, fg), resolveToken(tokens, bg));
    expect(ratio, `${fg} ${resolveToken(tokens, fg)} sobre ${bg} ${resolveToken(tokens, bg)}`).toBeGreaterThanOrEqual(min);
  });
});

describe('styles.css consome só tokens', () => {
  it('não usa variável --vscode-* além das de fonte', () => {
    const found = [...stylesCss.matchAll(/--vscode-[\w-]+/g)].map((m) => m[0]);
    const other = found.filter((v) => v !== '--vscode-font-family' && v !== '--vscode-editor-font-family');
    expect(other).toEqual([]);
  });

  it('não usa filter: brightness', () => {
    expect(stylesCss).not.toMatch(/filter:\s*brightness/);
  });

  it('não tem cor hex literal', () => {
    expect(stylesCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it('só referencia tokens definidos em tokens.css (ou os que o JS define)', () => {
    const defined = new Set(Object.keys({ ...themes.light, ...themes.dark }));
    const fromJs = new Set(['--text-font', '--text-size', '--vscode-font-family', '--vscode-editor-font-family']);
    const used = new Set([...stylesCss.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!));
    const missing = [...used].filter((v) => !defined.has(v) && !fromJs.has(v));
    expect(missing).toEqual([]);
  });
});
