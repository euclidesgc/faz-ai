import { useId, useState } from 'react';
import type { MetricsMonth } from '../../../shared/metrics';
import { t, tn } from '../../i18n';
import { Button } from '../ui';
import { formatCompact, formatMoney, formatMonth, formatNumber, unmeasured } from './format';
import { Note } from './Note';
import type { MetricsBlockProps } from './useMetricsQuery';

/** A série que o gráfico mostra: uma por vez, então não há legenda de cor (RF-16, RF-28). */
export type SeriesKind = 'cost' | 'tokens';

/**
 * O que a tela faz com um mês. Lê só o que a espinha já traz resolvida pelo host (`present`, `partial`,
 * `archived`): nada disso é recalculado aqui.
 * - `gap`: mês sem dado nenhum. Espaço rotulado "sem dado", nunca barra de altura zero (RF-13).
 * - `unmeasured`: houve dado, mas esta série não foi medida (`null`). Também sem barra, e o texto diz "não medido".
 * - `value`: barra, inclusive de altura zero quando o valor é zero (zero é dado, lacuna não é).
 */
export interface SeriesPoint {
  month: string;
  state: 'gap' | 'unmeasured' | 'value';
  value: number | null;
  partial: boolean;
  archived: boolean;
}

export function seriesPoints(months: MetricsMonth[], kind: SeriesKind): SeriesPoint[] {
  return months.map((m) => {
    const value = kind === 'cost' ? m.costUsd : (m.tokens?.total ?? null);
    const state = !m.present ? 'gap' : value === null ? 'unmeasured' : 'value';
    return { month: m.month, state, value: state === 'value' ? value : null, partial: m.partial, archived: m.archived };
  });
}

const formatValue = (kind: SeriesKind, n: number): string => (kind === 'cost' ? formatMoney(n) : formatNumber(n));
/** Topo da escala: o dinheiro exato (é curto), os tokens encurtados ("1,2 mi"); o valor exato vai na tabela. */
const formatScale = (kind: SeriesKind, n: number): string => (kind === 'cost' ? formatMoney(n) : formatCompact(n));

/** A observação de um mês na tabela: o que o gráfico diz com hachura ou com ausência, aqui em palavra (RF-28). */
function observation(p: SeriesPoint): string {
  if (p.state === 'gap') return t('sem dado');
  const notes: string[] = [];
  if (p.partial) notes.push(t('parcial'));
  if (p.archived) notes.push(t('só total mensal'));
  return notes.join(', ');
}

// Geometria do SVG, em unidades do viewBox. Com `preserveAspectRatio="none"` cada mês ocupa a mesma fração
// da largura, que é a mesma fração das colunas da grade de rótulos logo abaixo: os dois ficam alinhados.
const COL = 10;
const BAR = 6;
const HEIGHT = 100;
const TOP = 4;

/**
 * A série de custo ou de tokens por mês (#160): barras verticais em SVG feito à mão, o alternador
 * Custo/Tokens e a tabela equivalente, visível, com os mesmos números.
 *
 * Barra e não linha, de propósito (Spec da #71): a linha interpolaria por cima do mês sem dado e não
 * tem como marcar mês parcial num ponto. Não troque por linha.
 *
 * Nenhum texto dentro do SVG: rótulos de mês e da escala são HTML, para não encolherem com o zoom nem
 * girarem (RF-33).
 */
export function MonthSeries({ result }: MetricsBlockProps) {
  const [kind, setKind] = useState<SeriesKind>('cost');
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `${uid}-title`;
  const patternId = `${uid}-partial`;

  const points = seriesPoints(result.months, kind);
  const measured = points.filter((p) => p.state === 'value');
  const max = measured.reduce((acc, p) => Math.max(acc, p.value!), 0);
  const peak = measured.find((p) => p.value === max);
  const single = points.length === 1;

  const title = kind === 'cost' ? t('Custo por mês') : t('Tokens por mês');
  const unit = kind === 'cost' ? t('em dólares (US$)') : t('em tokens (entrada, saída e cache)');
  const valueHeader = kind === 'cost' ? t('Custo') : t('Tokens');

  const first = points[0];
  const last = points[points.length - 1];
  const span =
    first && last
      ? single
        ? formatMonth(first.month, 'long')
        : `${formatMonth(first.month, 'long')} – ${formatMonth(last.month, 'long')}`
      : '';
  const gaps = points.filter((p) => p.state === 'gap').length;
  const partials = points.filter((p) => p.partial && p.state !== 'gap').length;
  const summary = [
    `${title}, ${span}.`,
    peak && max > 0
      ? t('Maior valor: {value}, em {month}.', { value: formatValue(kind, max), month: formatMonth(peak.month, 'long') })
      : '',
    gaps ? tn(gaps, '{n} mês sem dado.', '{n} meses sem dado.') : '',
    partials ? tn(partials, '{n} mês parcial.', '{n} meses parciais.') : '',
    t('Os números estão na tabela abaixo do gráfico.'),
  ]
    .filter(Boolean)
    .join(' ');

  const barHeight = (v: number): number => (max > 0 ? (v / max) * (HEIGHT - TOP) : 0);
  const width = points.length * COL;

  return (
    <section className="metrics-series" aria-labelledby={titleId}>
      <header className="metrics-series-header">
        <div>
          <h3 id={titleId} className="metrics-series-title">
            {title}
          </h3>
          <p className="metrics-series-unit">{unit}</p>
        </div>
        <div className="metrics-series-toggle" role="group" aria-label={t('Série do gráfico')}>
          {(['cost', 'tokens'] as const).map((k) => (
            <Button key={k} type="button" size="small" on={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'cost' ? t('Custo') : t('Tokens')}
            </Button>
          ))}
        </div>
      </header>

      {measured.length === 0 ? (
        <Note>
          {kind === 'cost'
            ? t('Nenhum mês deste período tem custo medido, então não há barras para desenhar. A tabela mostra mês a mês.')
            : t('Nenhum mês deste período tem tokens medidos, então não há barras para desenhar. A tabela mostra mês a mês.')}
        </Note>
      ) : (
        <div className={single ? 'metrics-series-chart is-single' : 'metrics-series-chart'}>
          <div className="metrics-series-scale" aria-hidden="true">
            <span>{formatScale(kind, max)}</span>
            <span>{formatScale(kind, 0)}</span>
          </div>
          <div className="metrics-series-plot">
            <svg
              className="metrics-series-svg"
              viewBox={`0 0 ${width} ${HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={summary}
            >
              <defs>
                <pattern id={patternId} patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(45)">
                  <rect className="metrics-series-stripe" x="0" y="0" width="1" height="2" />
                </pattern>
              </defs>
              {points.map((p, i) => {
                if (p.state !== 'value') return null;
                const h = barHeight(p.value!);
                return (
                  <rect
                    key={p.month}
                    className={p.partial ? 'metrics-series-bar is-partial' : 'metrics-series-bar'}
                    data-month={p.month}
                    data-value={p.value!}
                    x={i * COL + (COL - BAR) / 2}
                    y={HEIGHT - h}
                    width={BAR}
                    height={h}
                    fill={p.partial ? `url(#${patternId})` : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              <line className="metrics-series-axis" x1="0" y1={HEIGHT} x2={width} y2={HEIGHT} vectorEffect="non-scaling-stroke" />
            </svg>
            <ol
              className="metrics-series-labels"
              aria-hidden="true"
              style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
            >
              {points.map((p) => (
                <li key={p.month} data-month={p.month}>
                  <span>{formatMonth(p.month, 'short')}</span>
                  {p.state === 'gap' && <span className="metrics-series-mark">{t('sem dado')}</span>}
                  {p.state === 'unmeasured' && <span className="metrics-series-mark">{unmeasured()}</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <div className="metrics-series-table">
        <table className="table">
          <caption className="sr-only">{`${title}, ${unit}`}</caption>
          <thead>
            <tr>
              <th scope="col">{t('Mês')}</th>
              <th scope="col">{valueHeader}</th>
              <th scope="col">{t('Observação')}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month} data-month={p.month}>
                <th scope="row">{formatMonth(p.month)}</th>
                <td className="metrics-series-value">
                  {p.state === 'value' ? (
                    formatValue(kind, p.value!)
                  ) : p.state === 'unmeasured' ? (
                    unmeasured()
                  ) : (
                    <span aria-hidden="true">—</span>
                  )}
                </td>
                <td>{observation(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
