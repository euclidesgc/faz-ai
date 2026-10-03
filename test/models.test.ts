import { describe, expect, it } from 'vitest';
import { effortLabel, modelDisplay, modelLabel, type ModelOption } from '../src/shared/models';

const catalog: ModelOption[] = [
  { id: 'claude:sonnet', tool: 'claude', model: 'sonnet', label: 'Sonnet 5.5', efforts: ['low', 'high'], defaultEffort: 'high' },
];

describe('rótulo do modelo', () => {
  it('na interface o esforço vem em português depois do modelo', () => {
    expect(modelDisplay(catalog, 'claude:sonnet@low')).toBe('Sonnet 5.5 - baixo');
    expect(modelDisplay(catalog, 'claude:sonnet@xhigh', true)).toBe('Claude Code · Sonnet 5.5 - muito alto');
    expect(modelDisplay(catalog, 'claude:sonnet')).toBe('Sonnet 5.5');
    expect(modelDisplay(catalog, null)).toBe('');
  });

  it('para a IA e o MCP o texto continua com o esforço como a ferramenta escreve', () => {
    expect(modelLabel(catalog, 'claude:sonnet@low')).toBe('Sonnet 5.5 · low');
  });

  it('esforço desconhecido aparece como veio', () => {
    expect(effortLabel('HIGH')).toBe('alto');
    expect(effortLabel('turbo')).toBe('turbo');
  });
});
