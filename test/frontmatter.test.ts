import { describe, expect, it } from 'vitest';
import { frontmatterOf, frontmatterValue } from '../src/extension/frontmatter';
import { parseFrontmatter } from '../src/extension/frontmatter';

describe('frontmatter', () => {
  it('lê aspas duplas como string JSON, com escapes', () => {
    expect(frontmatterValue('description: "a \\"b\\" c"', 'description')).toBe('a "b" c');
  });

  it('aspas duplas que não são JSON válido só perdem as aspas das pontas', () => {
    expect(frontmatterValue('description: "a \\q b"', 'description')).toBe('a \\q b');
  });

  it('aspas simples e sem aspas seguem como antes', () => {
    expect(frontmatterValue("description: 'x y'", 'description')).toBe('x y');
    expect(frontmatterValue('description: x y', 'description')).toBe('x y');
  });

  it('valor em uma linha, com ou sem aspas', () => {
    const fm = 'name: revisor\ndescription: "Revisa a spec"\nmodel: opus';
    expect(frontmatterValue(fm, 'name')).toBe('revisor');
    expect(frontmatterValue(fm, 'description')).toBe('Revisa a spec');
    expect(frontmatterValue(fm, 'model')).toBe('opus');
    expect(frontmatterValue(fm, 'tools')).toBeUndefined();
  });

  it('bloco | e > viram uma linha só e param na próxima chave', () => {
    const md = '---\nname: humanizer\ndescription: |\n  Remove sinais de texto de IA.\n  Use ao revisar.\n\nversion: 2\n---\n# Corpo';
    expect(parseFrontmatter(md)).toMatchObject({ name: 'humanizer', description: 'Remove sinais de texto de IA. Use ao revisar.' });
    expect(frontmatterValue('description: >-\n  um\n  dois', 'description')).toBe('um dois');
  });

  it('sem frontmatter devolve vazio', () => {
    expect(frontmatterOf('# só corpo')).toBe('');
    expect(parseFrontmatter('# só corpo')).toEqual({ name: undefined, description: undefined, model: undefined });
  });
});
