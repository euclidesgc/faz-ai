import { describe, expect, it } from 'vitest';
import { splitMcpName } from '../src/shared/log';

describe('splitMcpName', () => {
  it('reconhece a forma do Claude Code, mcp__<servidor>__<ferramenta>', () => {
    expect(splitMcpName('mcp__faz-ai__get_card')).toEqual({ server: 'faz-ai', tool: 'get_card' });
  });

  it('reconhece a forma que o leitor da saída grava, <servidor>/<ferramenta>', () => {
    expect(splitMcpName('faz-ai/get_card')).toEqual({ server: 'faz-ai', tool: 'get_card' });
  });

  it('corta no primeiro separador: o repetido fica na ferramenta', () => {
    expect(splitMcpName('mcp__a__b__c')).toEqual({ server: 'a', tool: 'b__c' });
    expect(splitMcpName('a/b/c')).toEqual({ server: 'a', tool: 'b/c' });
  });

  it('servidor com sublinhado simples continua inteiro', () => {
    expect(splitMcpName('mcp__meu_servidor__ler')).toEqual({ server: 'meu_servidor', tool: 'ler' });
  });

  it('nome sem servidor reconhecível volta como veio, com servidor vazio', () => {
    expect(splitMcpName('get_card')).toEqual({ server: '', tool: 'get_card' });
    expect(splitMcpName('mcp__so-servidor')).toEqual({ server: '', tool: 'mcp__so-servidor' });
    expect(splitMcpName('mcp_tool_call')).toEqual({ server: '', tool: 'mcp_tool_call' });
  });

  it('servidor ou ferramenta vazios não casam, e nada se adivinha', () => {
    expect(splitMcpName('/ferramenta')).toEqual({ server: '', tool: '/ferramenta' });
    expect(splitMcpName('servidor/')).toEqual({ server: '', tool: 'servidor/' });
    expect(splitMcpName('mcp____ferramenta')).toEqual({ server: '', tool: 'mcp____ferramenta' });
    expect(splitMcpName('mcp__servidor__')).toEqual({ server: '', tool: 'mcp__servidor__' });
  });

  it('string vazia volta vazia', () => {
    expect(splitMcpName('')).toEqual({ server: '', tool: '' });
  });
});
