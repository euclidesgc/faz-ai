import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LANGUAGES } from '../src/shared/language';
import { FONTS, FONT_SIZE_RANGE, THEMES } from '../src/shared/appearance';

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
  it('fazai.appearance.theme aceita os mesmos temas de THEMES, escopo application, com enumDescriptions nos dois nls', () => {
    const p = sections[1]!.properties['fazai.appearance.theme']!;
    expect(p.enum).toEqual(THEMES.map((th) => th.value));
    expect(p.default).toBe('system');
    expect(p.scope).toBe('application');
    expect(p.markdownDescription).toBeTruthy();
    nls(String(p.markdownDescription));
    const descriptions = p.enumDescriptions as string[];
    expect(descriptions).toHaveLength(THEMES.length);
    descriptions.forEach((d) => nls(d));
  });

  it('fazai.appearance.font aceita as mesmas fontes de FONTS, escopo application, com enumDescriptions nos dois nls', () => {
    const p = sections[1]!.properties['fazai.appearance.font']!;
    expect(p.enum).toEqual(FONTS.map((f) => f.value));
    expect(p.default).toBe('sans');
    expect(p.scope).toBe('application');
    expect(p.markdownDescription).toBeTruthy();
    nls(String(p.markdownDescription));
    const descriptions = p.enumDescriptions as string[];
    expect(descriptions).toHaveLength(FONTS.length);
    descriptions.forEach((d) => nls(d));
  });

  it('fazai.appearance.fontSize usa a mesma faixa de FONT_SIZE_RANGE, escopo application', () => {
    const p = sections[1]!.properties['fazai.appearance.fontSize']!;
    expect(p.type).toBe('number');
    expect(p.minimum).toBe(FONT_SIZE_RANGE.min);
    expect(p.maximum).toBe(FONT_SIZE_RANGE.max);
    expect(p.default).toBe(14);
    expect(p.scope).toBe('application');
    expect(p.markdownDescription).toBeTruthy();
    nls(String(p.markdownDescription));
  });

  it('a seção Instalação aponta para o Diagnóstico e Git para a aba do board, com argumento válido', () => {
    expect(en['config.install.environment']).toContain('command:fazai.openEnvironment');
    const m = /command:fazai\.openBoardSettings\?([^)\s]+)/.exec(en['config.git.info']!)!;
    expect(JSON.parse(decodeURIComponent(m[1]!))).toEqual([{ tab: 'git' }]);
  });
  it('a seção Backup aponta direto para os comandos exportBoard e importBoard', () => {
    expect(en['config.backup.info']).toContain('command:fazai.exportBoard');
    expect(en['config.backup.info']).toContain('command:fazai.importBoard');
    expect(pt['config.backup.info']).toContain('command:fazai.exportBoard');
    expect(pt['config.backup.info']).toContain('command:fazai.importBoard');
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
