import { z } from 'zod';
import type { MetricsDim, MetricsResult, MetricsRow } from '../../log/metrics';
import type { DefineTool } from './registry';

const GROUP_BY = ['phase', 'card_type', 'model', 'tool', 'card', 'agent', 'skill'] as const;

function parseCardNumber(ref: string | number): number {
  const n = Number(String(ref).trim().replace(/^#/, ''));
  if (!Number.isInteger(n)) throw new Error(`Card "${String(ref)}" inválido: use o número, ex. 72 ou "#72".`);
  return n;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '-';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min}min`;
  return `${h}h${String(min).padStart(2, '0')}min`;
}

function formatCost(usd: number): string {
  return `US$ ${usd.toFixed(2)}`;
}

const HEADERS: Record<'normal' | 'inventory', string[]> = {
  normal: ['grupo', 'execuções', 'duração', 'tokens', 'custo(estimado)'],
  inventory: ['grupo', 'execuções', 'usos'],
};

function formatRow(r: MetricsRow, inventory: boolean): string[] {
  if (inventory) return [r.label, String(r.runs), String(r.calls ?? 0)];
  return [
    r.label,
    String(r.runs),
    formatDuration(r.durationMs),
    r.tokens == null ? '-' : String(r.tokens),
    r.costUsd == null ? '-' : formatCost(r.costUsd),
  ];
}

/** Tabela de texto compacta (RF-08): cabeçalho + uma linha por grupo, colunas alinhadas, sem UUID. */
function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  return [line(headers), ...rows.map(line)].join('\n');
}

function formatCoverage(result: MetricsResult): string {
  const lines: string[] = [];
  lines.push(result.logSince ? `log desde ${result.logSince}` : 'nenhum dado de log neste board ainda');
  if (result.archivedMonths.length) lines.push(`sem detalhe (só total mensal): ${result.archivedMonths.join(', ')}`);
  if (result.partialMonths.length)
    lines.push(`recorte parcial de mês consolidado (valor do mês inteiro): ${result.partialMonths.join(', ')}`);
  if (result.othersCount > 0) lines.push(`"outros" soma ${result.othersCount} grupo(s) fora do limite`);
  if (result.costPartial) lines.push('custo e tokens são estimados e parciais: parte das execuções do recorte não tem consumo medido');
  else if (result.rows.some((r) => r.costUsd != null)) lines.push('custo estimado');
  return lines.join('\n');
}

/** Formata a resposta de `get_metrics`: tabela compacta + a cobertura do período (RF-05/RF-06/RF-08). */
export function formatMetrics(result: MetricsResult, groupBy: MetricsDim | undefined): string {
  if (result.rows.length === 0) return `nenhum grupo no recorte.\n${formatCoverage(result)}`;
  const inventory = groupBy === 'agent' || groupBy === 'skill';
  const headers = inventory ? HEADERS.inventory : HEADERS.normal;
  return `${table(
    headers,
    result.rows.map((r) => formatRow(r, inventory)),
  )}\n\n${formatCoverage(result)}`;
}

export function registerMetricsTools(tool: DefineTool): void {
  tool(
    'get_metrics',
    'Uso, custo e tempo agregados do log de utilização do board: agrupe por fase, tipo de card, card, modelo, ferramenta, agente ou skill, ' +
      'com filtros de período e card. Resposta em tabela compacta; custo e tokens vêm marcados como estimados e "-" quando não medidos (nunca 0). ' +
      'Nas dimensões "agent" e "skill" não há tokens/custo (não é possível repartir o custo de uma execução entre o que ela usou).',
    {
      group_by: z.enum(GROUP_BY).optional().describe('Dimensão de agrupamento; omitido = total do recorte'),
      start_date: z.string().optional().describe('AAAA-MM-DD, inclusive'),
      end_date: z.string().optional().describe('AAAA-MM-DD, inclusive'),
      card: z.union([z.string(), z.number()]).optional().describe('Filtra por um card, ex. 72 ou "#72"'),
      phase: z.string().optional().describe('Filtra por fase (nome da coluna no momento da execução)'),
      card_type: z.string().optional().describe('Filtra por tipo de card'),
      model: z.string().optional(),
      tool: z.string().optional().describe('Ferramenta de IA (claude, codex...), não ferramenta usada'),
      limit: z.number().int().min(1).max(100).optional().describe('Linhas antes de somar o resto em "outros"; padrão 20'),
    },
    (a, router) => {
      const result = router.metrics({
        groupBy: a.group_by,
        startDate: a.start_date,
        endDate: a.end_date,
        card: a.card === undefined ? undefined : parseCardNumber(a.card),
        phase: a.phase,
        cardType: a.card_type,
        model: a.model,
        tool: a.tool,
        limit: a.limit,
      });
      return formatMetrics(result, a.group_by);
    },
    true,
  );
}
