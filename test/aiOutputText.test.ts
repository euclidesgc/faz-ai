import { describe, expect, it } from 'vitest';
import { textReader } from '../src/extension/aiOutput/text';

describe('textReader', () => {
  it('push devolve a linha quando ela tem conteúdo', () => {
    const reader = textReader();
    expect(reader.push('ola mundo', 'stdout')).toEqual(['ola mundo']);
  });

  it('push devolve lista vazia quando a linha é vazia', () => {
    const reader = textReader();
    expect(reader.push('', 'stdout')).toEqual([]);
  });

  it('sawEvent é sempre true: no modo texto toda linha é um evento válido', () => {
    const reader = textReader();
    expect(reader.sawEvent).toBe(true);
  });

  it('report() devolve measure "none"', () => {
    const reader = textReader();
    reader.push('ola', 'stdout');
    expect(reader.report().measure).toBe('none');
  });

  it('report() devolve consumption null, nunca um objeto de zeros', () => {
    const reader = textReader();
    reader.push('ola', 'stdout');
    expect(reader.report().consumption).toBeNull();
  });

  it('report() devolve inventory vazio', () => {
    const reader = textReader();
    reader.push('ola', 'stdout');
    expect(reader.report().inventory).toEqual([]);
  });

  it('report() devolve reason null: quem sabe o motivo é o transporte, não o leitor de texto', () => {
    const reader = textReader();
    reader.push('ola', 'stdout');
    expect(reader.report().reason).toBeNull();
  });

  it('answer junta por \\n tudo que passou por push, inclusive linhas vazias', () => {
    const reader = textReader();
    reader.push('primeiro parágrafo', 'stdout');
    reader.push('', 'stdout');
    reader.push('segundo parágrafo', 'stdout');
    expect(reader.report().answer).toBe('primeiro parágrafo\n\nsegundo parágrafo');
  });

  it('linha de stderr aparece no retorno de push, para a pessoa ver o aviso no canal', () => {
    const reader = textReader();
    expect(reader.push('aviso da ferramenta', 'stderr')).toEqual(['aviso da ferramenta']);
  });

  it('linha de stderr não entra no answer: o chat não pode confundir aviso com resposta da IA', () => {
    const reader = textReader();
    reader.push('resposta da IA', 'stdout');
    reader.push('aviso da ferramenta', 'stderr');
    expect(reader.report().answer).toBe('resposta da IA');
  });
});
