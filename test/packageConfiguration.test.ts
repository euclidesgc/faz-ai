import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LANGUAGES } from '../src/shared/language';
import { FONTS, FONT_SIZE_RANGE, THEMES } from '../src/shared/appearance';
import { DEFAULT_GIT } from '../src/shared/git';

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

  it('gitflow: as seis chaves novas vêm logo depois de fazai.git.mode, com os padrões de DEFAULT_GIT e escopo resource', () => {
    const props = sections[2]!.properties;
    const keys = Object.keys(props);
    const novas = ['gitflow', 'developBranch', 'featurePrefix', 'bugfixPrefix', 'hotfixPrefix', 'releasePrefix'] as const;
    expect(keys.slice(keys.indexOf('fazai.git.mode') + 1, keys.indexOf('fazai.git.mode') + 1 + novas.length)).toEqual(
      novas.map((n) => `fazai.git.${n}`),
    );
    for (const n of novas) {
      const p = props[`fazai.git.${n}`]!;
      expect(p.type, n).toBe(n === 'gitflow' ? 'boolean' : 'string');
      expect(p.default, n).toBe(DEFAULT_GIT[n]);
      expect(p.scope, n).toBe('resource');
      nls(String(p.markdownDescription));
    }
    expect(props['fazai.git.gitflow']!.default).toBe(true);
  });
  it('fazai.git.mainBranch: vazia por padrão (detectada), escopo resource, descrita nas duas línguas', () => {
    const p = sections[2]!.properties['fazai.git.mainBranch']!;
    expect(p.type).toBe('string');
    expect(p.default).toBe(DEFAULT_GIT.mainBranch);
    expect(DEFAULT_GIT.mainBranch).toBe('');
    expect(p.scope).toBe('resource');
    nls(String(p.markdownDescription));
  });
  it('git: a ordem das chaves é crescente e sem repetição', () => {
    const orders = Object.values(sections[2]!.properties).map((p) => p.order as number);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });
  it('fazai.git.branchPattern: o padrão é o de DEFAULT_GIT e a descrição cita {fluxo}, nas duas línguas', () => {
    expect(sections[2]!.properties['fazai.git.branchPattern']!.default).toBe(DEFAULT_GIT.branchPattern);
    expect(DEFAULT_GIT.branchPattern).toBe('{fluxo}{numero}-{titulo}');
    expect(en['config.git.branchPattern']).toContain('{fluxo}');
    expect(pt['config.git.branchPattern']).toContain('{fluxo}');
  });
  it('fazai.git.branchPattern: com o gitflow desligado a descrição diz que {fluxo} vira <tipo>/, como flowPrefix, nas duas línguas', () => {
    // flowPrefix devolve `<tipo>/` sem gitflow; a descrição não pode prometer `{fluxo}` vazio
    expect(en['config.git.branchPattern']).toContain('`<type>/`');
    expect(en['config.git.branchPattern']).not.toMatch(/empty with/i);
    expect(pt['config.git.branchPattern']).toContain('`<tipo>/`');
    expect(pt['config.git.branchPattern']).not.toMatch(/vazio com/i);
  });
  it('os padrões de fazai.git.* iguais aos de DEFAULT_GIT onde há campo correspondente', () => {
    const props = sections[2]!.properties;
    for (const f of ['mode', 'worktreeDir', 'autoMerge', 'mergeMethod', 'decisionRecords'] as const)
      expect(props[`fazai.git.${f}`]!.default, f).toBe(DEFAULT_GIT[f]);
  });

  it('a seção Instalação aponta para o Diagnóstico', () => {
    expect(en['config.install.environment']).toContain('command:fazai.openEnvironment');
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
