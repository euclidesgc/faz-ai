import { describe, expect, it } from 'vitest';
import { formatMetrics, isoDateArg } from '../src/extension/mcp/tools/metrics';
import type { MetricsResult } from '../src/extension/log/metrics';

const BASE: MetricsResult = {
  rows: [],
  othersCount: 0,
  logSince: '2026-01-01',
  archivedMonths: [],
  partialMonths: [],
  costPartial: false,
  tokensPartial: false,
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

describe('formatMetrics: dimensões de configuração e inventário (#169)', () => {
  it.each(['effort', 'profile'] as const)('%s usa a tabela normal, com "-" no não medido', (dim) => {
    const result: MetricsResult = {
      ...BASE,
      rows: [{ label: 'alto', runs: 1, durationMs: 0, tokens: null, costUsd: null }],
      costPartial: true,
    };
    const text = formatMetrics(result, dim);
    expect(text).toMatch(/tokens/);
    expect(text).toMatch(/custo/);
    const line = text.split('\n').find((l) => l.startsWith('alto'))!;
    expect(line).toContain('-');
    expect(line).not.toMatch(/\b0\b/);
  });

  it('used_tool usa a tabela de inventário, sem tokens/custo', () => {
    const result: MetricsResult = {
      ...BASE,
      rows: [{ label: 'Bash', runs: 2, durationMs: 0, tokens: undefined, costUsd: undefined, calls: 5 }],
    };
    const text = formatMetrics(result, 'used_tool');
    expect(text).toContain('usos');
    expect(text).not.toMatch(/tokens|custo|servidor/);
  });

  it('mcp_tool mostra a coluna servidor', () => {
    const result: MetricsResult = {
      ...BASE,
      rows: [{ label: 'get_card', server: 'faz-ai', runs: 2, durationMs: 0, tokens: undefined, costUsd: undefined, calls: 4 }],
    };
    const text = formatMetrics(result, 'mcp_tool');
    expect(text.split('\n')[0]).toMatch(/^grupo\s+servidor\s+execuções\s+usos/);
    expect(text.split('\n')[1]).toMatch(/^get_card\s+faz-ai\s+2\s+4/);
  });

  it('mcp_tool com servidor vazio imprime "servidor não registrado"', () => {
    const result: MetricsResult = {
      ...BASE,
      rows: [{ label: 'x', server: '', runs: 1, durationMs: 0, tokens: undefined, costUsd: undefined, calls: 1 }],
    };
    expect(formatMetrics(result, 'mcp_tool')).toContain('servidor não registrado');
  });
});

describe('get_metrics: validação das datas (revisão 0.32.0)', () => {
  it('aceita AAAA-MM-DD de um dia que existe', () => {
    expect(isoDateArg.safeParse('2026-02-28').success).toBe(true);
    expect(isoDateArg.safeParse('2024-02-29').success).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-2-3', '03/02/2026', '2026-02-28T10:00', ''])('recusa "%s" com mensagem clara', (value) => {
    const parsed = isoDateArg.safeParse(value);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/AAAA-MM-DD/);
  });
});
