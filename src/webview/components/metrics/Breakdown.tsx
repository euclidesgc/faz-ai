import { useId, useState } from 'react';
import {
  METRICS_BREAKDOWN_DIMS,
  METRICS_MEASURES,
  SHOW_COST,
  type MetricsBreakdown,
  type MetricsBreakdownDim,
  type MetricsCell,
  type MetricsMeasure,
} from '../../../shared/metrics';
import { t, tn } from '../../i18n';
import { FormField, SelectField } from '../ui';
import {
  formatCompact,
  formatCost,
  formatDuration,
  formatMoney,
  formatMonth,
  formatNumber,
  formatRange,
  formatTokens,
  unmeasured,
} from './format';
import type { MetricsBlockProps } from './MetricsBlock';
import { Note } from './Note';

/** Quantas categorias o corte mostra antes de somar o resto em "outros (N)" (RF-03). */
export const BREAKDOWN_ROWS = 12;

/** O nome da dimensão no seletor e no cabeçalho da tabela. Literal em cada `t()`: o teste do dicionário lê o código. */
const dimLabel = (dim: MetricsBreakdownDim): string => {
  switch (dim) {
    case 'phase':
      return t('Fase');
    case 'card_type':
      return t('Tipo de card');
    case 'model':
      return t('Modelo');
    case 'tool':
      return t('Ferramenta de IA');
    case 'effort':
      return t('Esforço do modelo');
    case 'profile':
      return t('Perfil de agente');
  }
};

/** O nome da dimensão no meio de uma frase ("Custo por fase"). */
const dimInline = (dim: MetricsBreakdownDim): string => {
  switch (dim) {
    case 'phase':
      return t('fase');
    case 'card_type':
      return t('tipo de card');
    case 'model':
      return t('modelo');
    case 'tool':
      return t('ferramenta de IA');
    case 'effort':
      return t('esforço do modelo');
    case 'profile':
      return t('perfil de agente');
  }
};

const measureLabel = (m: MetricsMeasure): string => {
  switch (m) {
    case 'cost':
      return t('Custo');
    case 'tokens':
      return t('Tokens');
    case 'runs':
      return t('Execuções');
    case 'duration':
      return t('Tempo de IA');
  }
};

/**
 * O título do gráfico, que é também o `aria-label` do SVG e o anúncio da troca: dimensão, medida e período
 * em vigor (RF-36, RF-39).
 */
export function breakdownTitle(dim: MetricsBreakdownDim, measure: MetricsMeasure, period: string): string {
  const params = { dim: dimInline(dim), period };
  switch (measure) {
    case 'cost':
      return t('Custo por {dim}, {period}', params);
    case 'tokens':
      return t('Tokens por {dim}, {period}', params);
    case 'runs':
      return t('Execuções por {dim}, {period}', params);
    case 'duration':
      return t('Tempo de IA por {dim}, {period}', params);
  }
}

type Totals = Omit<MetricsCell, 'value'>;

/** Uma linha do corte: uma categoria, ou a linha "outros" com a soma das que não couberam. */
export interface BreakdownRow {
  key: string;
  /** o valor como o log guardou; '' = "não definido" (RF-04). Na linha "outros" fica '' e `other` diz o resto. */
  value: string;
  cell: Totals;
  /** o comprimento da barra na medida escolhida; null = não medido, sem barra (RF-30) */
  bar: number | null;
  /** a linha "outros": quantas categorias ela soma (0 = só o que o host deixou fora do teto) */
  other: { count: number } | null;
  /** o nome existe em mais de um workflow e está somado (RF-07) */
  ambiguous: boolean;
}

/** O valor de uma medida numa categoria. Custo e tokens podem ser null (não medido); execuções e tempo, nunca. */
export function measureOf(cell: Totals, measure: MetricsMeasure): number | null {
  switch (measure) {
    case 'cost':
      return cell.costUsd;
    case 'tokens':
      return cell.tokens;
    case 'runs':
      return cell.runs;
    case 'duration':
      return cell.durationMs;
  }
}

/** Ponto flutuante: o que sobra de uma subtração de dólares abaixo disto é arredondamento, não dinheiro. */
const EPS = 1e-9;
const clean = (x: number): number => (Math.abs(x) < EPS ? 0 : x);

/**
 * "Outros" = o que o corte cobre (`covered`) menos as linhas exibidas (RF-03, RF-33). Calculado do total que
 * viaja no contrato, e não da soma das linhas escondidas, a soma fecha por construção, inclusive com o que o
 * host deixou fora do teto. Tokens e custo do resto só existem se sobrar execução medida neles (RF-30).
 */
export function remainder(covered: Totals, shown: Totals[]): Totals {
  const sum = (pick: (c: Totals) => number | null) => shown.reduce((acc, c) => acc + (pick(c) ?? 0), 0);
  const runs = covered.runs - sum((c) => c.runs);
  const measuredRuns = covered.measuredRuns - sum((c) => c.measuredRuns);
  const costedRuns = covered.costedRuns - sum((c) => c.costedRuns);
  const estimated = covered.costEstimatedUsd === null ? 0 : clean(covered.costEstimatedUsd - sum((c) => c.costEstimatedUsd));
  return {
    runs,
    measuredRuns,
    costedRuns,
    durationMs: covered.durationMs - sum((c) => c.durationMs),
    tokens: measuredRuns > 0 && covered.tokens !== null ? covered.tokens - sum((c) => c.tokens) : null,
    costUsd: costedRuns > 0 && covered.costUsd !== null ? clean(covered.costUsd - sum((c) => c.costUsd)) : null,
    costEstimatedUsd: costedRuns > 0 && estimated > 0 ? estimated : null,
  };
}

/**
 * As linhas do corte na medida escolhida: ordenadas pelo valor, do maior para o menor; as não medidas vão
 * para o fim, por execuções (não têm valor para competir, e não viram zero). Até `BREAKDOWN_ROWS`
 * categorias; o resto vira uma linha "outros (N)" no fim (RF-03). Nenhum valor é fundido (RF-06).
 */
export function breakdownRows(b: MetricsBreakdown, measure: MetricsMeasure): BreakdownRow[] {
  const ambiguous = new Set(b.dim === 'phase' ? b.ambiguous : []);
  const sorted = [...b.cells].sort((x, y) => {
    const vx = measureOf(x, measure);
    const vy = measureOf(y, measure);
    if (vx === null || vy === null) {
      if (vx !== vy) return vx === null ? 1 : -1;
    } else if (vy !== vx) return vy - vx;
    return y.runs - x.runs || x.value.localeCompare(y.value);
  });
  const shown = sorted.slice(0, BREAKDOWN_ROWS);
  const rows: BreakdownRow[] = shown.map(({ value, ...cell }) => ({
    key: `v:${value}`,
    value,
    cell,
    bar: measureOf(cell, measure),
    other: null,
    ambiguous: ambiguous.has(value),
  }));
  const hidden = sorted.length - shown.length;
  const rest = remainder(b.covered, shown);
  if (hidden > 0 || rest.runs > 0)
    rows.push({ key: 'other', value: '', cell: rest, bar: measureOf(rest, measure), other: { count: hidden }, ambiguous: false });
  return rows;
}

/** O nome que a linha mostra. "Não definido" é uma categoria, contada e visível (RF-04). */
function rowLabel(row: BreakdownRow): string {
  if (row.other) return row.other.count > 0 ? t('outros ({n})', { n: row.other.count }) : t('outros');
  return row.value === '' ? t('não definido') : row.value;
}

/**
 * As marcas da linha, em palavras e não em cor (RF-37, RF-38): custo e tokens não medidos ou parciais, com
 * a contagem das execuções sem medição (RF-30), a parte estimada do custo (RF-31) e o nome ambíguo (RF-07).
 */
export function rowMarks(row: BreakdownRow): string[] {
  const c = row.cell;
  const out: string[] = [];
  if (row.ambiguous) out.push(t('nome em mais de um workflow'));
  const noCost = SHOW_COST ? c.runs - c.costedRuns : 0;
  if (noCost > 0) {
    if (c.costedRuns > 0) out.push(t('custo parcial'));
    out.push(tn(noCost, '{n} execução sem custo medido', '{n} execuções sem custo medido'));
  }
  const noTokens = c.runs - c.measuredRuns;
  if (noTokens > 0) {
    if (c.measuredRuns > 0) out.push(t('tokens parciais'));
    out.push(tn(noTokens, '{n} execução sem tokens medidos', '{n} execuções sem tokens medidos'));
  }
  if (SHOW_COST && c.costUsd !== null && c.costEstimatedUsd !== null) {
    if (c.costEstimatedUsd >= c.costUsd - EPS) out.push(t('estimado por tabela de preços'));
    else if (c.costEstimatedUsd > 0)
      out.push(t('parte estimada por tabela de preços: {estimated}', { estimated: formatMoney(c.costEstimatedUsd) }));
  }
  return out;
}

/** O valor exato na unidade da medida, para a escala. */
function formatMeasure(measure: MetricsMeasure, n: number): string {
  switch (measure) {
    case 'cost':
      return formatMoney(n);
    case 'tokens':
      return formatCompact(n);
    case 'runs':
      return formatNumber(n);
    case 'duration':
      return formatDuration(n);
  }
}

// Geometria do SVG, em unidades do viewBox. A largura é 100 (fração da escala); cada linha tem ROW de
// altura, e com `preserveAspectRatio="none"` ela ocupa a mesma altura em em que a linha de rótulo ao lado
// (`--breakdown-row` em styles.css): os dois ficam alinhados em qualquer zoom.
const ROW = 10;
const BAR = 6;
/** Altura de uma linha, em em; a mesma de `.metrics-breakdown-labels li`. */
const ROW_EM = 1.75;

interface Props extends MetricsBlockProps {
  dim: MetricsBreakdownDim;
  measure: MetricsMeasure;
  onChange: (patch: { dim?: MetricsBreakdownDim; measure?: MetricsMeasure }) => void;
}

/**
 * "Onde o consumo aconteceu" (card 175): um corte por vez, escolhido entre seis dimensões (RF-01), com a
 * barra numa das quatro medidas (RF-02) e a tabela das quatro, visível, ao lado.
 *
 * Barras HORIZONTAIS, de propósito: os rótulos são nomes longos e imprevisíveis ("Implementação",
 * `mcp__faz-ai__get_card`), e a barra vertical obrigaria a girar o rótulo, ilegível em zoom de 200% e em
 * largura de barra lateral (RF-40). Não troque por vertical. Base no zero, uma série, nenhuma legenda: a cor
 * não codifica nada (RF-37), e "parcial"/"estimado" são palavras na tabela. Nenhum texto dentro do SVG.
 *
 * Trocar a dimensão ou a medida redesenha no lugar, sem pedir nada ao host (as seis dimensões já vieram), e
 * é anunciado na região `aria-live` do bloco sem mover o foco nem rolar a página (RF-39).
 */
export function Breakdown({ result, sections, dim, measure, onChange }: Props) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const [announcement, setAnnouncement] = useState('');
  const period = formatRange(result.range);
  const title = breakdownTitle(dim, measure, period);

  const breakdown = sections.breakdowns.find((b) => b.dim === dim);
  const empty = !breakdown || (breakdown.cells.length === 0 && breakdown.covered.runs === 0);
  const rows = breakdown && !empty ? breakdownRows(breakdown, measure) : [];
  const max = rows.reduce((acc, r) => Math.max(acc, r.bar ?? 0), 0);
  const hasBars = rows.some((r) => r.bar !== null);

  const change = (patch: { dim?: MetricsBreakdownDim; measure?: MetricsMeasure }) => {
    onChange(patch);
    // o foco fica no seletor usado; quem lê a tela ouve o que mudou e para qual valor
    setAnnouncement(breakdownTitle(patch.dim ?? dim, patch.measure ?? measure, period));
  };

  return (
    <div className="metrics-breakdown">
      <div className="metrics-breakdown-controls">
        <FormField label={t('Recortar por')}>
          {(id) => (
            <SelectField
              id={id}
              size="2"
              options={METRICS_BREAKDOWN_DIMS.map((d) => ({ value: d, label: dimLabel(d) }))}
              value={dim}
              onChange={(d) => change({ dim: d })}
            />
          )}
        </FormField>
        <FormField label={t('Medida da barra')}>
          {(id) => (
            <SelectField
              id={id}
              size="2"
              options={METRICS_MEASURES.map((m) => ({ value: m, label: measureLabel(m) }))}
              value={measure}
              onChange={(m) => change({ measure: m })}
            />
          )}
        </FormField>
      </div>
      {/* aria-live sem role="status": o painel já tem um status (o de "Números atualizados") e dois confundem quem o procura */}
      <p className="sr-only metrics-breakdown-live" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <h4 id={titleId} className="metrics-breakdown-title">
        {title}
      </h4>
      {dim === 'phase' && (
        <Note>
          {t(
            'Fase é o nome da coluna em que o card estava no momento da chamada, congelado com a execução: mover o card depois não reescreve o passado. Uma coluna renomeada aparece com os dois nomes, como o log os guardou.',
          )}
        </Note>
      )}
      {breakdown && dim === 'phase' && breakdown.ambiguous.length > 0 && (
        <Note>
          {tn(
            breakdown.ambiguous.length,
            '{names}: mais de um workflow tem uma coluna com este nome, e as execuções aparecem somadas numa linha só. Escolher o workflow no filtro separa.',
            '{names}: mais de um workflow tem uma coluna com cada um destes nomes, e as execuções aparecem somadas numa linha só por nome. Escolher o workflow no filtro separa.',
            { names: breakdown.ambiguous.join(', ') },
          )}
        </Note>
      )}
      {breakdown && breakdown.excludedMonths.length > 0 && (
        <Note>
          {tn(
            breakdown.excludedMonths.length,
            '{months} ficou fora deste corte: só tem o total do board inteiro, sem a divisão pelo workflow escolhido.',
            '{months} ficaram fora deste corte: só têm o total do board inteiro, sem a divisão pelo workflow escolhido.',
            { months: breakdown.excludedMonths.map((m) => formatMonth(m, 'long')).join(', ') },
          )}
        </Note>
      )}

      {empty ? (
        <p className="metrics-breakdown-empty">{t('Nenhuma execução de IA neste período.')}</p>
      ) : (
        <div className="metrics-breakdown-view">
          {hasBars ? (
            <div className="metrics-breakdown-chart">
              <ol className="metrics-breakdown-labels" aria-hidden="true">
                {rows.map((r) => (
                  <li key={r.key} title={rowLabel(r)}>
                    <span className="metrics-breakdown-label">{rowLabel(r)}</span>
                    {r.bar === null && <span className="metrics-breakdown-mark">{unmeasured()}</span>}
                  </li>
                ))}
              </ol>
              <div className="metrics-breakdown-plot">
                <svg
                  className="metrics-breakdown-svg"
                  viewBox={`0 0 100 ${rows.length * ROW}`}
                  preserveAspectRatio="none"
                  style={{ height: `${rows.length * ROW_EM}em` }}
                  role="img"
                  aria-label={title}
                >
                  {rows.map((r, i) =>
                    r.bar === null ? null : (
                      <rect
                        key={r.key}
                        className="metrics-breakdown-bar"
                        data-value={r.bar}
                        x={0}
                        y={i * ROW + (ROW - BAR) / 2}
                        width={max > 0 ? (r.bar / max) * 100 : 0}
                        height={BAR}
                      />
                    ),
                  )}
                  <line className="metrics-breakdown-axis" x1="0" y1="0" x2="0" y2={rows.length * ROW} vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="metrics-breakdown-scale" aria-hidden="true">
                  <span>{formatMeasure(measure, 0)}</span>
                  <span>{formatMeasure(measure, max)}</span>
                </div>
              </div>
            </div>
          ) : (
            <Note>
              {measure === 'cost'
                ? t(
                    'Nenhuma categoria tem custo medido neste período, então não há barras para desenhar. Escolha outra medida ou leia os números na tabela.',
                  )
                : t(
                    'Nenhuma categoria tem tokens medidos neste período, então não há barras para desenhar. Escolha outra medida ou leia os números na tabela.',
                  )}
            </Note>
          )}

          {/* rola na horizontal em largura de barra lateral: recebe foco para rolar pelo teclado */}
          <div className="metrics-breakdown-table" tabIndex={0} role="region" aria-labelledby={titleId}>
            <table className="metrics-table">
              <caption className="sr-only">{title}</caption>
              <thead className="metrics-sticky-head">
                <tr>
                  <th scope="col">{dimLabel(dim)}</th>
                  {SHOW_COST && (
                    <th scope="col" className="is-number">
                      {t('Custo')}
                    </th>
                  )}
                  <th scope="col" className="is-number">
                    {t('Tokens')}
                  </th>
                  <th scope="col" className="is-number">
                    {t('Execuções')}
                  </th>
                  <th scope="col" className="is-number">
                    {t('Tempo de IA')}
                  </th>
                  <th scope="col">{t('Observação')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} data-category={r.other ? 'other' : r.value}>
                    <th scope="row">{rowLabel(r)}</th>
                    {SHOW_COST && <td className="is-number">{formatCost(r.cell.costUsd)}</td>}
                    <td className="is-number">{formatTokens(r.cell.tokens)}</td>
                    <td className="is-number">{formatNumber(r.cell.runs)}</td>
                    <td className="is-number">{formatDuration(r.cell.durationMs)}</td>
                    <td>{rowMarks(r).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
