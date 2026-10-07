import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LANGUAGES } from '../src/shared/language';

const read = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'));
const pkg = read('package.json');
const en = read('package.nls.json') as Record<string, string>;
const pt = read('package.nls.pt-br.json') as Record<string, string>;
const sections = pkg.contributes.configuration as { title: string; order: number; properties: Record<string, Record<string, unknown>> }[];
const nls = (ref: string) => {
  const key = ref.replace(/^%|%$/g, '');
  expect(en[key], `${key} em package.nls.json`).toBeTruthy();
  expect(pt[key], `${key} em package.nls.pt-br.json`).toBeTruthy();
};

describe('contributes.configuration', () => {
  it('tem 4 seções em ordem: Instalação, Aparência, Git e Backup', () => {
    expect(sections.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(sections.map((s) => s.title)).toEqual([
      '%config.install.title%',
      '%config.appearance.title%',
      '%config.git.title%',
      '%config.backup.title%',
    ]);
    sections.forEach((s) => nls(s.title));
  });
  it('toda chave começa com fazai. e toda descrição está nos dois nls', () => {
    for (const s of sections)
      for (const [key, prop] of Object.entries(s.properties)) {
        expect(key.startsWith('fazai.'), key).toBe(true);
        nls(String(prop.markdownDescription));
      }
  });
  it('fazai.appearance.language aceita os mesmos idiomas da interface, escopo application', () => {
    const p = sections[1]!.properties['fazai.appearance.language']!;
    expect(p.enum).toEqual(LANGUAGES);
    expect(p.default).toBe('auto');
    expect(p.scope).toBe('application');
  });
  it('a seção Instalação aponta para o Diagnóstico e Git/Backup para a aba do board, com argumento válido', () => {
    expect(en['config.install.environment']).toContain('command:fazai.openEnvironment');
    for (const [key, tab] of [
      ['config.git.info', 'git'],
      ['config.backup.info', 'backup'],
    ] as const) {
      const m = /command:fazai\.openBoardSettings\?([^)\s]+)/.exec(en[key]!)!;
      expect(JSON.parse(decodeURIComponent(m[1]!))).toEqual([{ tab }]);
    }
  });
});

describe('contributes.commands', () => {
  it('os três comandos novos existem, com título nos dois nls', () => {
    const ids = pkg.contributes.commands as { command: string; title: string }[];
    for (const id of ['fazai.openEnvironment', 'fazai.openIdeSettings', 'fazai.openBoardSettings']) {
      const c = ids.find((x) => x.command === id);
      expect(c, id).toBeTruthy();
      nls(c!.title);
    }
  });
});
