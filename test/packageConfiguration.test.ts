import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8'));
const pkg = read('package.json');
const en = read('package.nls.json') as Record<string, string>;
const pt = read('package.nls.pt-br.json') as Record<string, string>;

describe('manifesto: as configurações do board moram na tela do board', () => {
  it('não declara contributes.configuration (a categoria Faz AI não aparece no Settings do editor)', () => {
    expect(pkg.contributes.configuration).toBeUndefined();
  });

  it('não sobram textos config.* nem o comando de abrir o Settings nos nls', () => {
    for (const nls of [en, pt]) {
      expect(Object.keys(nls).filter((k) => k.startsWith('config.'))).toEqual([]);
      expect(nls['command.openIdeSettings.title']).toBeUndefined();
    }
    expect(JSON.stringify(pkg)).not.toContain('openIdeSettings');
  });
});

describe('contributes.commands', () => {
  it('os comandos do Diagnóstico e das configurações do board existem, com título nos dois nls', () => {
    const ids = pkg.contributes.commands as { command: string; title: string }[];
    for (const id of ['fazai.openEnvironment', 'fazai.openBoardSettings']) {
      const c = ids.find((x) => x.command === id);
      expect(c, id).toBeTruthy();
      const key = c!.title.replace(/^%|%$/g, '');
      expect(en[key], key).toBeTruthy();
      expect(pt[key], key).toBeTruthy();
    }
  });
});
