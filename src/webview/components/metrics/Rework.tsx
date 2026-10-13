import { useId } from 'react';
import { t } from '../../i18n';
import { formatNumber, intlLocale } from './format';
import type { MetricsBlockProps } from './MetricsBlock';

/** Fração em porcentagem inteira, no idioma da tela. */
const percent = (part: number, whole: number): string =>
  new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(part / whole);

/**
 * O retrabalho do período: o que a IA entregou para revisão e o que voltou com pedido de ajuste, por
 * fase e por modelo, e os bugs que apareceram em histórias concluídas. Só conta a resposta de uma pessoa:
 * a aprovação automática do modo autônomo não é revisão.
 */
export function ReworkTables({ sections }: MetricsBlockProps) {
  const uid = useId();
  const { phases, models, escapes } = sections.rework;
  const resolved = phases.reduce((n, p) => n + p.resolved, 0);
  const firstPass = phases.reduce((n, p) => n + p.firstPass, 0);
  const adjusted = phases.reduce((n, p) => n + p.adjusted, 0);
  if (!phases.length && !escapes.stories)
    return <p className="metrics-times-empty">{t('Nenhuma revisão nem história concluída neste período.')}</p>;
  return (
    <>
      <dl className="metrics-rework-summary">
        <dt>{t('Aprovadas de primeira')}</dt>
        <dd>
          {resolved
            ? t('{pct} ({n} de {total} respostas)', {
                pct: percent(firstPass, resolved),
                n: formatNumber(firstPass),
                total: formatNumber(resolved),
              })
            : t('nenhuma resposta da pessoa no período')}
        </dd>
        <dt>{t('Pedidos de ajuste')}</dt>
        <dd>{formatNumber(adjusted)}</dd>
        <dt>{t('Histórias concluídas com bug vinculado')}</dt>
        <dd>
          {escapes.stories
            ? t('{n} de {total} ({bugs} bug(s))', {
                n: formatNumber(escapes.withBugs),
                total: formatNumber(escapes.stories),
                bugs: formatNumber(escapes.bugs),
              })
            : t('nenhuma história concluída no período')}
        </dd>
      </dl>
      {phases.length > 0 && (
        <table className="metrics-table" aria-describedby={`${uid}-n`}>
          <caption className="sr-only">{t('Retrabalho por fase')}</caption>
          <thead className="metrics-sticky-head">
            <tr>
              <th scope="col">{t('Fase')}</th>
              <th scope="col" className="is-number">
                {t('Revisões pedidas')}
              </th>
              <th scope="col" className="is-number">
                {t('Aprovadas de primeira')}
              </th>
              <th scope="col" className="is-number">
                {t('Pedidos de ajuste')}
              </th>
            </tr>
          </thead>
          <tbody>
            {phases.map((p) => (
              <tr key={p.phase}>
                <th scope="row">{p.phase}</th>
                <td className="is-number">{formatNumber(p.reviews)}</td>
                <td className="is-number">
                  {p.resolved ? t('{n} de {total}', { n: formatNumber(p.firstPass), total: formatNumber(p.resolved) }) : '—'}
                </td>
                <td className="is-number">{formatNumber(p.adjusted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {models.length > 0 && (
        <table className="metrics-table">
          <caption className="sr-only">{t('Retrabalho por modelo')}</caption>
          <thead className="metrics-sticky-head">
            <tr>
              <th scope="col">{t('Modelo')}</th>
              <th scope="col" className="is-number">
                {t('Revisões pedidas')}
              </th>
              <th scope="col" className="is-number">
                {t('Pedidos de ajuste')}
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.model}>
                <th scope="row">{m.model || t('não definido')}</th>
                <td className="is-number">{formatNumber(m.reviews)}</td>
                <td className="is-number">{formatNumber(m.adjusted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div id={`${uid}-n`} className="metrics-times-notes">
        <p className="metrics-times-hint">
          {t(
            'Conta só a resposta de uma pessoa: aprovar ou pedir ajustes. A aprovação automática do modo autônomo não é revisão. "De primeira" é a primeira resposta da pessoa àquele card naquela fase; o ajuste conta para o modelo da execução que pediu a revisão.',
          )}
        </p>
      </div>
    </>
  );
}
