import { describe, expect, it } from 'vitest';
import { formatMetrics } from '../src/extension/mcp/tools/metrics';
import type { MetricsResult } from '../src/extension/log/metrics';

const BASE: MetricsResult = {
  rows: [],
  othersCount: 0,
  logSince: '2026-01-01',
  archivedMonths: [],
  partialMonths: [],
  costPartial: false,
};

describe('formatMetrics', () => {
  it('nunca produz JSON (RF-08): sem chaves nem colchetes de abertura', () => {
    const result: MetricsResult = { ...BASE, rows: [{ label: 'total', runs: 2, durationMs: 4000, tokens: 300, costUsd: 0.03 }] };
    const text = formatMetrics(result, undefined);
    expect(text.trimStart()).not.toMatch(/^[{[]/);
    expect(text).toContain('total');
  });

  it('omite as colunas de tokens/custo nas dimensões de inventário', () => {
    const result: MetricsResult = {
      ...BASE,
      rows: [{ label: 'sql-queries', runs: 2, durationMs: 0, tokens: undefined, costUsd: undefined, calls: 3 }],
    };
    const text = formatMetrics(result, 'skill');
    expect(text).not.toMatch(/tokens|custo/);
    expect(text).toContain('usos');
  });

  it('valor não medido aparece como "-", nunca "0"', () => {
    const result: MetricsResult = {
      ...BASE,
      rows: [{ label: 'PRD', runs: 1, durationMs: 0, tokens: null, costUsd: null }],
      costPartial: true,
    };
    const text = formatMetrics(result, 'phase');
    const line = text.split('\n').find((l) => l.startsWith('PRD'))!;
    expect(line).toContain('-');
    expect(line).not.toMatch(/\b0\b/);
  });

  it('sem linhas, declara a cobertura em vez de devolver vazio', () => {
    const text = formatMetrics(BASE, undefined);
    expect(text).toContain('nenhum grupo no recorte');
    expect(text).toContain('2026-01-01');
  });

  it('declara meses arquivados e parciais quando existem', () => {
    const result: MetricsResult = { ...BASE, archivedMonths: ['2024-03'], partialMonths: ['2024-03'] };
    const text = formatMetrics(result, undefined);
    expect(text).toContain('2024-03');
  });
});
