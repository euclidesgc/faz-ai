import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EN } from '../src/webview/i18n/en';
import { board } from '../src/webview/i18n/en/board';
import { card } from '../src/webview/i18n/en/card';
import { harness } from '../src/webview/i18n/en/harness';
import { host } from '../src/webview/i18n/en/host';
import { settings } from '../src/webview/i18n/en/settings';
import { shared } from '../src/webview/i18n/en/shared';
import { workflows } from '../src/webview/i18n/en/workflows';
import { fill, setLocale, t, tn } from '../src/webview/i18n';

const ROOT = path.resolve(__dirname, '../src/webview');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'i18n' ? [] : files(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const LIT = String.raw`('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|` + '`[^`$\\\\]*`)';
const unquote = (lit: string): string =>
  lit
    .slice(1, -1)
    .replace(/\\(['"`\\])/g, '$1')
    .replace(/\\n/g, '\n');
const CALLS = [
  new RegExp(String.raw`(?<![\w.])(?:t|rich)\(\s*` + LIT, 'g'),
  new RegExp(String.raw`(?<![\w.])tn\(\s*[^,()]+,\s*` + LIT + String.raw`\s*,\s*` + LIT, 'g'),
];

/** Os textos que o código passa a t(), tn() e rich() como literais. */
function usedKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const re of CALLS)
      for (const m of src.matchAll(re)) for (const lit of m.slice(1)) if (lit) found.set(unquote(lit), path.relative(ROOT, file));
  }
  return found;
}

const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
const tags = (s: string) => [...s.matchAll(/<\/?(?:b|i|code)>/g)].map((m) => m[0]).sort();

describe('i18n: dicionário', () => {
  it('todo texto passado a t(), tn() e rich() tem tradução em inglês', () => {
    const missing = [...usedKeys()].filter(([key]) => !(key in EN)).map(([key, file]) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });

  it('a tradução usa os mesmos {parâmetros} e as mesmas tags do texto em português', () => {
    const wrong = Object.entries(EN).filter(([pt, en]) => names(pt).join() !== names(en).join() || tags(pt).join() !== tags(en).join());
    expect(wrong.map(([pt]) => pt)).toEqual([]);
  });

  it('o mesmo texto em duas áreas tem a mesma tradução', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const area of [shared, host, board, card, settings, workflows, harness])
      for (const [pt, en] of Object.entries(area)) {
        if (seen.has(pt) && seen.get(pt) !== en) clashes.push(`${pt} => "${seen.get(pt)}" / "${en}"`);
        seen.set(pt, en);
      }
    expect(clashes).toEqual([]);
  });

  it('nenhuma tradução ficou vazia nem igual ao português com acento (esquecida)', () => {
    const empty = Object.entries(EN).filter(([pt, en]) => !en.trim() || (en === pt && /[áéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ]/.test(pt)));
    expect(empty.map(([pt]) => pt)).toEqual([]);
  });
});

describe('i18n: t, tn e mensagens do host', () => {
  it('em português a chave volta como está, com os parâmetros preenchidos', () => {
    setLocale('pt-BR');
    expect(t('Novo card')).toBe('Novo card');
    expect(t('Apagar o tipo "{name}"?', { name: 'Bug' })).toBe('Apagar o tipo "Bug"?');
    expect(tn(1, '{n} item', '{n} itens')).toBe('1 item');
    expect(tn(3, '{n} item', '{n} itens')).toBe('3 itens');
  });

  it('fill deixa o que não tem parâmetro como está', () => {
    expect(fill('Olá {nome} e {outro}', { nome: 'Ana' })).toBe('Olá Ana e {outro}');
  });
});
