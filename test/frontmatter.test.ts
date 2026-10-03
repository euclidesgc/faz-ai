import { describe, expect, it } from 'vitest';
import { frontmatterOf, frontmatterValue } from '../src/extension/frontmatter';
import { parseFrontmatter } from '../src/extension/harness';

describe('frontmatter', () => {
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
