/*
 * RankingTable (card 174): a tabela ordenável dos três rankings do painel (cards, fases, lead time).
 *
 * API por composição, estável (a LeadTable do card 176 usa esta mesma tabela):
 *
 *   <RankingTable<R>
 *     caption="Nome da tabela"                  // vai no <caption> (lido pelo leitor de tela)
 *     columns={RankingColumn<R>[]}              // { key, header, cell(row), sortValue?(row), numeric?, rowHeader?, firstDir? }
 *     rows={R[]}                                // TODAS as linhas que o host mandou (até METRICS_ROW_CAP)
 *     rowKey={(row) => string}
 *     sort={MetricsSort}                        // { key, dir } já resolvido (o padrão do bloco decide quem chama)
 *     onSort={(sort: MetricsSort) => void}      // só troca estado; nunca manda mensagem ao host
 *     sortReason?="por que este é o critério"   // escrito depois de "Ordenado pela coluna ..." (RF-21)
 *     footer?={({ shown, hidden, columns, colSpan }) => ReactNode}  // linhas do <tfoot>
 *     limit?={10} expandedLimit?={25}
 *   />
 *
 * Coluna com `sortValue` é ordenável: o <th> recebe aria-sort e um <button> nativo de 44 px. Uma coluna
 * ordenada por vez; `null` em `sortValue` vai sempre para o fim, nas duas direções ("não medido" não é
 * o menor valor). A tabela corta em `limit` linhas, com "mostrar mais" até `expandedLimit`.
 *
 * O rodapé é de quem chama, com as duas peças prontas daqui:
 *   - `RankingFooterRow` + `othersOf(covered, shown)`: a linha "outros" = coberto menos a soma das linhas
 *     exibidas (RF-18, RF-33). Correta para qualquer critério e qualquer limite, e a soma fecha com o
 *     total por construção.
 *   - `RankingNoteRow`: uma linha de texto que ocupa a largura toda. No lead time não existe "outros"
 *     (somar lead times não significa nada): ali vai a contagem "+N cards concluídos não listados",
 *     com N = `hidden` + `lead.omitted`.
 *
 * `CardRanking` e `PhaseRanking`, no fim do arquivo, são os dois usos com `MetricsCell`.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { METRICS_ROW_CAP, type MetricsCell } from '../../../shared/metrics';
import { t, tn } from '../../i18n';
import type { MetricsSort } from '../../store/boardStore';
import { Button, IconArrowDown, IconArrowUp } from '../ui';
import { formatCost, formatDuration, formatNumber, formatTokens } from './format';
import type { MetricsBlockProps } from './MetricsBlock';

/** Linhas visíveis antes de "mostrar mais". */
export const RANKING_LIMIT = 10;
/** Linhas visíveis depois de "mostrar mais". O resto entra em "outros" ou na contagem. */
export const RANKING_EXPANDED_LIMIT = 25;

export interface RankingColumn<R> {
  /** id da coluna; é o `key` de `MetricsSort` */
  key: string;
  /** texto do cabeçalho, já traduzido; também é o nome do critério na frase "Ordenado pela coluna ..." */
  header: string;
  /** o conteúdo da célula, sempre em texto (RF-38) */
  cell: (row: R) => ReactNode;
  /** presente = coluna ordenável; `null` = sem valor (vai para o fim nas duas direções) */
  sortValue?: (row: R) => number | string | null;
  /** direção do primeiro clique; padrão: decrescente se `numeric`, crescente se não */
  firstDir?: MetricsSort['dir'];
  /** alinhado à direita */
  numeric?: boolean;
  /** a célula desta coluna é o cabeçalho da linha (`<th scope="row">`) */
  rowHeader?: boolean;
}

export interface RankingFooterContext<R> {
  /** as linhas exibidas, na ordem em vigor */
  shown: R[];
  /** linhas recebidas que ficaram fora do corte (não conta o que o host já deixou fora do teto) */
  hidden: number;
  columns: RankingColumn<R>[];
  colSpan: number;
}

export interface RankingTableProps<R> {
  caption: string;
  columns: RankingColumn<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  sort: MetricsSort;
  onSort: (sort: MetricsSort) => void;
  sortReason?: string;
  footer?: (ctx: RankingFooterContext<R>) => ReactNode;
  limit?: number;
  expandedLimit?: number;
}

/** Ordena sem mexer no array recebido. Empate mantém a ordem do host; `null` sempre no fim. */
export function sortRows<R>(rows: R[], value: (row: R) => number | string | null, dir: MetricsSort['dir']): R[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return c === 0 ? a.i - b.i : sign * c;
    })
    .map((x) => x.row);
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

export function RankingTable<R>({
  caption,
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  sortReason,
  footer,
  limit = RANKING_LIMIT,
  expandedLimit = RANKING_EXPANDED_LIMIT,
}: RankingTableProps<R>) {
  const [expanded, setExpanded] = useState(false);
  const active = columns.find((c) => c.key === sort.key && c.sortValue);
  const sorted = useMemo(() => (active?.sortValue ? sortRows(rows, active.sortValue, sort.dir) : rows), [rows, active, sort.dir]);
  const shown = sorted.slice(0, expanded ? expandedLimit : limit);
  const hidden = sorted.length - shown.length;
  const extra = Math.min(sorted.length, expandedLimit) - limit;
  const footerNode = footer?.({ shown, hidden, columns, colSpan: columns.length });

  // ordenar é re-render puro: só o estado de quem chama muda, nenhuma mensagem vai ao host
  const toggle = (c: RankingColumn<R>) =>
    onSort(
      active?.key === c.key
        ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key: c.key, dir: c.firstDir ?? (c.numeric ? 'desc' : 'asc') },
    );

  return (
    <div className="ranking">
      {active && (
        // a frase muda a cada troca de critério e o leitor de tela a anuncia sem tirar o foco do botão (RF-39).
        // aria-live sem role="status": o único status do painel é o "Números atualizados" do MetricsView
        <p className="ranking-sort-note" aria-live="polite" aria-atomic="true">
          {sort.dir === 'desc'
            ? t('Ordenado pela coluna "{column}", decrescente.', { column: active.header })
            : t('Ordenado pela coluna "{column}", crescente.', { column: active.header })}
          {sortReason ? ` ${sortReason}` : ''}
        </p>
      )}
      <table className="metrics-table ranking-table">
        <caption className="sr-only">{caption}</caption>
        <thead className="metrics-sticky-head">
          <tr>
            {columns.map((c) => {
              const isActive = active?.key === c.key;
              const classes = [c.numeric && 'is-number', c.sortValue && 'is-sortable'].filter(Boolean).join(' ') || undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={classes}
                  aria-sort={c.sortValue ? (isActive ? ARIA_SORT[sort.dir] : 'none') : undefined}
                >
                  {c.sortValue ? (
                    <Button type="button" variant="ghost" className="ranking-sort" onClick={() => toggle(c)}>
                      <span>{c.header}</span>
                      {isActive && (sort.dir === 'asc' ? <IconArrowUp /> : <IconArrowDown />)}
                    </Button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) =>
                c.rowHeader ? (
                  <th key={c.key} scope="row" className={c.numeric ? 'is-number' : undefined}>
                    {c.cell(row)}
                  </th>
                ) : (
                  <td key={c.key} className={c.numeric ? 'is-number' : undefined}>
                    {c.cell(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {footerNode ? <tfoot>{footerNode}</tfoot> : null}
      </table>
      {extra > 0 && (
        <Button type="button" variant="ghost" className="ranking-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded
            ? t('Mostrar só as {n} primeiras linhas', { n: limit })
            : tn(extra, 'Mostrar mais {n} linha', 'Mostrar mais {n} linhas')}
        </Button>
      )}
    </div>
  );
}

/** Uma linha do rodapé com as mesmas colunas da tabela: `label` no lugar da primeira, `row` nas outras. */
export function RankingFooterRow<R>({ label, row, columns }: { label: ReactNode; row: R; columns: RankingColumn<R>[] }) {
  return (
    <tr className="ranking-footer-row">
      {columns.map((c, i) =>
        i === 0 ? (
          <th key={c.key} scope="row">
            {label}
          </th>
        ) : (
          <td key={c.key} className={c.numeric ? 'is-number' : undefined}>
            {c.cell(row)}
          </td>
        ),
      )}
    </tr>
  );
}

/** Uma linha de texto do rodapé, na largura toda (a contagem do lead time, o aviso do teto do host). */
export function RankingNoteRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr className="ranking-note-row">
      <td colSpan={colSpan}>{children}</td>
    </tr>
  );
}

type Measures = Omit<MetricsCell, 'value'>;

/**
 * A linha "outros": o que o bloco cobre menos a soma das linhas exibidas (RF-18, RF-33). `null` no
 * coberto continua `null` (não medido não vira zero, RF-30); o resíduo de ponto flutuante vira 0.
 */
export function othersOf(covered: Measures, shown: Measures[]): Measures {
  const rest = (total: number, pick: (c: Measures) => number | null): number => {
    const n = total - shown.reduce((acc, c) => acc + (pick(c) ?? 0), 0);
    return Math.abs(n) < 1e-9 ? 0 : n;
  };
  const restOrNull = (total: number | null, pick: (c: Measures) => number | null): number | null =>
    total === null ? null : rest(total, pick);
  return {
    runs: rest(covered.runs, (c) => c.runs),
    measuredRuns: rest(covered.measuredRuns, (c) => c.measuredRuns),
    costedRuns: rest(covered.costedRuns, (c) => c.costedRuns),
    durationMs: rest(covered.durationMs, (c) => c.durationMs),
    tokens: restOrNull(covered.tokens, (c) => c.tokens),
    costUsd: restOrNull(covered.costUsd, (c) => c.costUsd),
    costEstimatedUsd: restOrNull(covered.costEstimatedUsd, (c) => c.costEstimatedUsd),
  };
}

/**
 * O critério padrão de um ranking (RF-22): custo quando o período tem custo medido, tempo de IA quando
 * não tem. Decidido aqui, a partir do coberto da própria resposta, e escrito na tela com o motivo (RF-21).
 */
export function defaultCellSort(covered: Measures): MetricsSort {
  return hasMeasuredCost(covered) ? { key: 'cost', dir: 'desc' } : { key: 'duration', dir: 'desc' };
}

const hasMeasuredCost = (covered: Measures): boolean => covered.costedRuns > 0 && covered.costUsd !== null;

interface RankingSortProps {
  /** `null` = o padrão do bloco (`defaultCellSort`) */
  sort: MetricsSort | null;
  onSort: (sort: MetricsSort) => void;
}

interface CellRankingProps extends RankingSortProps {
  caption: string;
  labelHeader: string;
  /** o rótulo da categoria `''` ("sem card", "fase não definida") */
  emptyLabel: string;
  cells: MetricsCell[];
  covered: Measures;
  /** grupos que o host deixou fora do teto: já estão no coberto, entram em "outros" e na contagem */
  omitted: number;
}

/** Ranking de categorias com as quatro medidas, "outros" no rodapé e o critério escrito (cards e fases). */
function CellRanking({ caption, labelHeader, emptyLabel, cells, covered, omitted, sort, onSort }: CellRankingProps) {
  if (cells.length === 0 && covered.runs === 0) return <p className="metrics-block-intro">{t('Nenhum registro no período.')}</p>;
  const effective = sort ?? defaultCellSort(covered);
  const reason = sort
    ? undefined
    : hasMeasuredCost(covered)
      ? t('É o padrão quando o período tem custo medido.')
      : t('É o padrão enquanto o período não tem custo medido.');
  const label = (c: MetricsCell): string => c.value || emptyLabel;
  const columns: RankingColumn<MetricsCell>[] = [
    { key: 'label', header: labelHeader, rowHeader: true, cell: (c) => <span title={label(c)}>{label(c)}</span> },
    { key: 'cost', header: t('Custo'), numeric: true, cell: (c) => formatCost(c.costUsd), sortValue: (c) => c.costUsd },
    { key: 'tokens', header: t('Tokens'), numeric: true, cell: (c) => formatTokens(c.tokens), sortValue: (c) => c.tokens },
    { key: 'runs', header: t('Execuções'), numeric: true, cell: (c) => formatNumber(c.runs), sortValue: (c) => c.runs },
    { key: 'duration', header: t('Tempo de IA'), numeric: true, cell: (c) => formatDuration(c.durationMs), sortValue: (c) => c.durationMs },
  ];
  return (
    <RankingTable
      caption={caption}
      columns={columns}
      rows={cells}
      rowKey={(c) => c.value}
      sort={effective}
      onSort={onSort}
      sortReason={reason}
      footer={({ shown, hidden, columns: cols, colSpan }) => {
        const count = hidden + omitted;
        const others = othersOf(covered, shown);
        return (
          <>
            {(count > 0 || others.runs > 0) && (
              <RankingFooterRow label={t('outros ({n})', { n: formatNumber(count) })} row={{ value: '', ...others }} columns={cols} />
            )}
            {omitted > 0 && (
              <RankingNoteRow colSpan={colSpan}>
                {tn(
                  omitted,
                  '{n} grupo além do teto de {cap} linhas não veio na lista: está somado em "outros".',
                  '{n} grupos além do teto de {cap} linhas não vieram na lista: estão somados em "outros".',
                  { cap: formatNumber(METRICS_ROW_CAP) },
                )}
              </RankingNoteRow>
            )}
          </>
        );
      }}
    />
  );
}

/** Ranking por card (RF-18 a RF-22): `cells[].value` é '#N título'; '' são as execuções sem card (RF-20). */
export function CardRanking({ sections, sort, onSort }: MetricsBlockProps & RankingSortProps) {
  const { cards } = sections;
  return (
    <CellRanking
      caption={t('Cards mais caros')}
      labelHeader={t('Card')}
      emptyLabel={t('Execuções sem card')}
      cells={cards.cells}
      covered={cards.covered}
      omitted={cards.omitted}
      sort={sort}
      onSort={onSort}
    />
  );
}

/** Ranking de fases: o corte por fase, que alcança a série inteira (RF-24). '' é a fase não definida (RF-04). */
export function PhaseRanking({ sections, sort, onSort }: MetricsBlockProps & RankingSortProps) {
  const phase = sections.breakdowns.find((b) => b.dim === 'phase');
  if (!phase) return null;
  return (
    <CellRanking
      caption={t('Fases mais caras')}
      labelHeader={t('Fase')}
      emptyLabel={t('Fase não definida')}
      cells={phase.cells}
      covered={phase.covered}
      omitted={0}
      sort={sort}
      onSort={onSort}
    />
  );
}
