import { describe, expect, it } from 'vitest';
import { byPath, pathKey, samePath } from '../src/extension/samePath';

describe('caminhos comparáveis entre sistemas', () => {
  it('no Windows, a letra do drive, as barras e a caixa não importam', () => {
    expect(samePath('c:\\Users\\Ana\\proj', 'C:/Users/ana/proj/', 'win32')).toBe(true);
    expect(pathKey('C:\\Users\\Ana\\proj', 'win32')).toBe('c:/users/ana/proj');
  });

  it('no macOS a caixa não importa; no Linux importa', () => {
    expect(samePath('/Users/Ana/Proj', '/users/ana/proj', 'darwin')).toBe(true);
    expect(samePath('/home/Ana/proj', '/home/ana/proj', 'linux')).toBe(false);
    expect(samePath('/home/ana/proj/', '/home/ana/proj', 'linux')).toBe(true);
  });

  it('acha a entrada de um objeto indexado por caminho', () => {
    expect(byPath({ '/a/b': 1 }, '/a/b/')).toBe(1);
    expect(byPath({ '/a/b': 1 }, '/a/c')).toBeUndefined();
    expect(byPath(undefined, '/a')).toBeUndefined();
  });
});
