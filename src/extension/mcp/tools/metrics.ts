import { z } from 'zod';
import type { MetricsDim, MetricsResult, MetricsRow } from '../../log/metrics';
import type { DefineTool } from './registry';
import { SHOW_COST, type MetricsRework } from '../../../shared/metrics';

const GROUP_BY = ['phase', 'card_type', 'model', 'tool', 'card', 'agent', 'skill', 'effort', 'profile', 'used_tool', 'mcp_tool'] as const;
const INVENTORY_DIMS = new Set<MetricsDim | undefined>(['agent', 'skill', 'used_tool', 'mcp_tool']);

const DATE_MESSAGE = 'Data inválida: use AAAA-MM-DD de um dia que existe, ex. 2026-03-31.';

/** 'AAAA-MM-DD' com zeros à esquerda e um dia que existe no calendário (recusa 2026-02-30, 2026-2-3). */
function isRealIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Data de `get_metrics`. Antes, um texto qualquer passava e virava resposta vazia calada (a comparação
 * de strings e o `Date` aceitavam lixo); agora é recusado com a mensagem. Como só passa a forma
 * normalizada, comparar duas datas como string é comparar os dias.
 */
export const isoDateArg = z.string().refine(isRealIsoDate, { message: DATE_MESSAGE });

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

type TableVariant = 'normal' | 'inventory' | 'mcp';

const HEADERS: Record<TableVariant, string[]> = {
  normal: SHOW_COST ? ['grupo', 'execuções', 'duração', 'tokens', 'custo'] : ['grupo', 'execuções', 'duração', 'tokens'],
  inventory: ['grupo', 'execuções', 'usos'],
  mcp: ['grupo', 'servidor', 'execuções', 'usos'],
};

function variantOf(groupBy: MetricsDim | undefined): TableVariant {
  if (groupBy === 'mcp_tool') return 'mcp';
  return INVENTORY_DIMS.has(groupBy) ? 'inventory' : 'normal';
}

function formatRow(r: MetricsRow, variant: TableVariant): string[] {
  if (variant === 'inventory') return [r.label, String(r.runs), String(r.calls ?? 0)];
  if (variant === 'mcp') {
    // A linha "outros" não tem servidor (soma de vários): "-". Vazio = servidor não registrado (RF-26).
    const server = r.server === undefined ? '-' : r.server === '' ? 'servidor não registrado' : r.server;
    return [r.label, server, String(r.runs), String(r.calls ?? 0)];
  }
  return [
    r.label,
    String(r.runs),
    formatDuration(r.durationMs),
    r.tokens == null ? '-' : String(r.tokens),
    ...(SHOW_COST ? [r.costUsd == null ? '-' : formatCost(r.costUsd)] : []),
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
  // tokens e custo têm cada um a sua cobertura: só o Claude Code informa o custo, então uma execução do Cursor tem tokens e não tem custo
  if (result.tokensPartial) lines.push('tokens parciais: parte das execuções do recorte não tem consumo medido');
  if (!SHOW_COST) return lines.join('\n');
  const hasCost = result.rows.some((r) => r.costUsd != null);
  if (result.costPartial)
    lines.push(
      hasCost
        ? 'custo parcial: só o que a ferramenta informa (o Claude Code); parte das execuções do recorte não tem custo informado'
        : 'custo não medido: nenhuma execução do recorte tem custo informado pela ferramenta (só o Claude Code informa)',
    );
  else if (hasCost) lines.push('custo informado pela ferramenta');
  return lines.join('\n');
}

/** Formata a resposta de `get_metrics`: tabela compacta + a cobertura do período (RF-05/RF-06/RF-08). */
export function formatMetrics(result: MetricsResult, groupBy: MetricsDim | undefined): string {
  if (result.rows.length === 0) return `nenhum grupo no recorte.\n${formatCoverage(result)}`;
  const variant = variantOf(groupBy);
  return `${table(
    HEADERS[variant],
    result.rows.map((r) => formatRow(r, variant)),
  )}\n\n${formatCoverage(result)}`;
}

/**
 * O retrabalho em texto compacto: por fase (revisões pedidas, aprovadas de primeira, ajustes), por modelo
 * e as histórias concluídas com bug vinculado.
 */
export function formatRework(rework: MetricsRework): string {
  const parts: string[] = [];
  if (rework.phases.length)
    parts.push(
      `retrabalho por fase (só respostas de uma pessoa)\n${table(
        ['fase', 'revisões', 'de primeira', 'ajustes'],
        rework.phases.map((p) => [p.phase, String(p.reviews), p.resolved ? `${p.firstPass} de ${p.resolved}` : '-', String(p.adjusted)]),
      )}`,
    );
  if (rework.models.length)
    parts.push(
      `por modelo da execução que pediu a revisão\n${table(
        ['modelo', 'revisões', 'ajustes'],
        rework.models.map((m) => [m.model || 'não definido', String(m.reviews), String(m.adjusted)]),
      )}`,
    );
  const e = rework.escapes;
  parts.push(
    e.stories
      ? `histórias concluídas no período: ${e.stories}; com bug vinculado: ${e.withBugs} (${e.bugs} bug(s))`
      : 'nenhuma história concluída no período',
  );
  if (!rework.phases.length) parts.unshift('nenhuma revisão no recorte.');
  return parts.join('\n\n');
}

export function registerMetricsTools(tool: DefineTool): void {
  tool(
    'get_metrics',
    SHOW_COST
      ? 'Uso, custo e tempo agregados do log de utilização do board: agrupe por fase, tipo de card, card, modelo, ferramenta de IA, esforço, perfil, agente, skill, ferramenta usada ou ferramenta MCP, ' +
          'com filtros de período e card. Resposta em tabela compacta; o custo é o que a própria ferramenta informou (só o Claude Code informa; o board não calcula custo por tabela de preços) e os tokens são os medidos; ambos vêm como "-" quando não medidos (nunca 0). ' +
          '"tool" é a ferramenta de IA que rodou (claude, cursor); "used_tool" e "mcp_tool" são o que a execução usou (ferramentas e ferramentas MCP, esta com a coluna "servidor"; vazio = "servidor não registrado"). ' +
          'Nas dimensões "agent", "skill", "used_tool" e "mcp_tool" não há tokens/custo (não é possível repartir o custo de uma execução entre o que ela usou); "effort" e "profile" têm.'
      : 'Uso, tokens e tempo agregados do log de utilização do board: agrupe por fase, tipo de card, card, modelo, ferramenta de IA, esforço, perfil, agente, skill, ferramenta usada ou ferramenta MCP, ' +
          'com filtros de período e card. Resposta em tabela compacta; os tokens são os medidos (entrada, saída e cache) e vêm como "-" quando não medidos (nunca 0). O board não mostra custo em dólar. ' +
          '"tool" é a ferramenta de IA que rodou (claude, cursor); "used_tool" e "mcp_tool" são o que a execução usou (ferramentas e ferramentas MCP, esta com a coluna "servidor"; vazio = "servidor não registrado"). ' +
          'Nas dimensões "agent", "skill", "used_tool" e "mcp_tool" não há tokens (não é possível repartir o consumo de uma execução entre o que ela usou); "effort" e "profile" têm.',
    {
      group_by: z.enum(GROUP_BY).optional().describe('Dimensão de agrupamento; omitido = total do recorte'),
      start_date: isoDateArg.optional().describe('AAAA-MM-DD, inclusive'),
      end_date: isoDateArg.optional().describe('AAAA-MM-DD, inclusive'),
      card: z.union([z.string(), z.number()]).optional().describe('Filtra por um card, ex. 72 ou "#72"'),
      phase: z.string().optional().describe('Filtra por fase (nome da coluna no momento da execução)'),
      card_type: z.string().optional().describe('Filtra por tipo de card'),
      model: z.string().optional(),
      tool: z
        .string()
        .optional()
        .describe('Ferramenta de IA (claude, cursor), não a ferramenta usada pela execução (essa é a dimensão used_tool/mcp_tool)'),
      limit: z.number().int().min(1).max(100).optional().describe('Linhas antes de somar o resto em "outros"; padrão 20'),
      rework: z
        .boolean()
        .optional()
        .describe(
          'Em vez do consumo, o retrabalho do período: revisões pedidas, aprovadas de primeira e pedidos de ajuste por fase e por modelo, e as histórias concluídas com bug vinculado. Usa só start_date e end_date.',
        ),
    },
    (a, router) => {
      if (a.start_date && a.end_date && a.end_date < a.start_date)
        throw new Error(`end_date (${a.end_date}) anterior a start_date (${a.start_date}).`);
      if (a.rework) return formatRework(router.panelMetrics({ startDate: a.start_date, endDate: a.end_date }).sections.rework);
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
