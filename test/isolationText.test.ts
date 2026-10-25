import { describe, expect, it } from 'vitest';
import { BUILTIN_ISOLATION } from '../src/shared/aiProfiles';
import { isolationText, leakText } from '../src/webview/isolation';

describe('textos de isolamento', () => {
  it('lista vazia sem prova nunca vira "Contexto fechado"', () => {
    expect(isolationText(BUILTIN_ISOLATION.claude, false)).toBe('Contexto não verificado: nenhum item conhecido carregado, sem prova');
    expect(isolationText(BUILTIN_ISOLATION.claude, true)).toBe('Contexto fechado');
  });
  it('com itens, lista tipo e origem e conta os não reconhecidos', () => {
    expect(isolationText({ args: [], loads: [{ kind: 'skill', scope: 'user' }], unrecognized: 1 }, true)).toBe(
      'Contexto aberto: a CLI pode carregar por conta própria skills do usuário, itens não reconhecidos.',
    );
    expect(leakText({ kind: 'instructions', scope: 'project' })).toBe('regras do projeto');
  });
});
