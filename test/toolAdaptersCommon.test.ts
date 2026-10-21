import { describe, expect, it } from 'vitest';
import { ensureSkillFrontmatter, modelParts, ruleSlug, stripFrontmatter, yamlString } from '../src/extension/toolAdapters/common';

describe('funções comuns dos adaptadores', () => {
  it('ruleSlug', () => {
    expect(ruleSlug('CLAUDE.md')).toBe('claude');
    expect(ruleSlug('.cursor/rules/Estilo de Código.mdc')).toBe('estilo-de-c-digo');
    expect(ruleSlug('///')).toBe('regra');
  });
  it('yamlString vira string JSON de uma linha', () => {
    expect(yamlString('a: "b"\nc')).toBe('"a: \\"b\\" c"');
  });
  it('stripFrontmatter', () => {
    expect(stripFrontmatter('---\npaths: x\n---\n\nTexto\n')).toEqual({ text: 'Texto\n', had: true });
    expect(stripFrontmatter('Texto')).toEqual({ text: 'Texto', had: false });
  });
  it('ensureSkillFrontmatter acrescenta só o que falta e preserva o resto', () => {
    const ok = '---\nname: a\ndescription: b\n---\n\nX';
    expect(ensureSkillFrontmatter(ok, 'n', 'd')).toBe(ok);
    expect(ensureSkillFrontmatter('---\nname: a\n---\nX', 'n', 'd')).toBe('---\ndescription: "d"\nname: a\n---\nX');
    expect(ensureSkillFrontmatter('Só texto', 'n', 'd')).toBe('---\nname: "n"\ndescription: "d"\n---\n\nSó texto');
  });
  it('modelParts separa a ferramenta no primeiro ":"', () => {
    expect(modelParts('claude:opus@high')).toEqual({ tool: 'claude', id: 'opus', effort: 'high' });
    expect(modelParts('cursor:gpt-5:fast')).toEqual({ tool: 'cursor', id: 'gpt-5:fast', effort: null });
    expect(modelParts('')).toEqual({ tool: '', id: '', effort: null });
  });
});
