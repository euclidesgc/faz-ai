import { useId } from 'react';
import { t } from '../../i18n';
import { formatNumber, formatTokens } from './format';
import type { MetricsBlockProps } from './MetricsBlock';
import type { MetricsDeliveryCross } from '../../../shared/metrics';

/**
 * O custo por entrega: os tokens das histórias concluídas no período, por tipo × esforço (com média e
 * mediana por história), por tipo × modelo e por tipo × agente. Tokens sem medida aparecem como "não
 * medido", nunca como zero. O tipo e o esforço são os valores atuais da história.
 */
export function DeliveryTables({ sections }: MetricsBlockProps) {
  const uid = useId();
  const { stories, measured, tokens, groups, byModel, byAgent, omitted } = sections.delivery;
  if (!stories) return <p className="metrics-times-empty">{t('Nenhuma história concluída neste período.')}</p>;
  const hasOmitted = omitted.groups + omitted.byModel + omitted.byAgent > 0;
  const crossTable = (caption: string, label: string, blank: string, rows: MetricsDeliveryCross[]) => (
    <table className="metrics-table">
      <caption className="sr-only">{caption}</caption>
      <thead className="metrics-sticky-head">
        <tr>
          <th scope="col">{t('Tipo')}</th>
          <th scope="col">{label}</th>
          <th scope="col" className="is-number">
            {t('Histórias')}
          </th>
          <th scope="col" className="is-number">
            {t('Medidas')}
          </th>
          <th scope="col" className="is-number">
            {t('Tokens')}
          </th>
          <th scope="col" className="is-number">
            {t('Tokens por história')}
          </th>
          <th scope="col" className="is-number">
            {t('Pedidos de ajuste')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.type}\u0000${r.value}`}>
            <th scope="row">{r.type}</th>
            <td>{r.value || blank}</td>
            <td className="is-number">{formatNumber(r.stories)}</td>
            <td className="is-number">{formatNumber(r.measured)}</td>
            <td className="is-number">{formatTokens(r.tokens)}</td>
            <td className="is-number">{formatTokens(r.tokensPerStory)}</td>
            <td className="is-number">{formatNumber(r.adjusted)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      <dl className="metrics-rework-summary">
        <dt>{t('Histórias concluídas')}</dt>
        <dd>{formatNumber(stories)}</dd>
        <dt>{t('Histórias com tokens medidos')}</dt>
        <dd>{formatNumber(measured)}</dd>
        <dt>{t('Tokens')}</dt>
        <dd>{formatTokens(tokens)}</dd>
      </dl>
      {groups.length > 0 && (
        <table className="metrics-table" aria-describedby={`${uid}-n`}>
          <caption className="sr-only">{t('Custo por entrega por tipo e esforço')}</caption>
          <thead className="metrics-sticky-head">
            <tr>
              <th scope="col">{t('Tipo')}</th>
              <th scope="col">{t('Esforço')}</th>
              <th scope="col" className="is-number">
                {t('Histórias')}
              </th>
              <th scope="col" className="is-number">
                {t('Medidas')}
              </th>
              <th scope="col" className="is-number">
                {t('Tokens')}
              </th>
              <th scope="col" className="is-number">
                {t('Média')}
              </th>
              <th scope="col" className="is-number">
                {t('Mediana')}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={`${g.type}\u0000${g.effort}`}>
                <th scope="row">{g.type}</th>
                <td>{g.effort || t('não definido')}</td>
                <td className="is-number">{formatNumber(g.stories)}</td>
                <td className="is-number">{formatNumber(g.measured)}</td>
                <td className="is-number">{formatTokens(g.tokens)}</td>
                <td className="is-number">{formatTokens(g.meanTokens)}</td>
                <td className="is-number">{formatTokens(g.medianTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {byModel.length > 0 && crossTable(t('Custo por entrega por tipo e modelo'), t('Modelo'), t('não definido'), byModel)}
      {byAgent.length > 0 && crossTable(t('Custo por entrega por tipo e agente'), t('Agente'), t('sem agente'), byAgent)}
      <div id={`${uid}-n`} className="metrics-times-notes">
        <p className="metrics-times-hint">
          {t(
            'Só entram as histórias concluídas cujas execuções o detalhe ainda guarda: com a retenção, histórias antigas ficam fora destas tabelas.',
          )}
        </p>
        <p className="metrics-times-hint">
          {t('O tipo e o esforço são os valores atuais da história, não os de quando ela foi executada.')}
        </p>
        <p className="metrics-times-hint">
          {t(
            'Uma história que usou mais de um modelo ou agente aparece em cada um deles, então as linhas de modelo e de agente não somam o total.',
          )}
        </p>
        {hasOmitted && (
          <p className="metrics-times-hint">
            {t('Linhas além do limite de {cap} por tabela ficaram de fora: {n} no total.', {
              cap: formatNumber(200),
              n: formatNumber(omitted.groups + omitted.byModel + omitted.byAgent),
            })}
          </p>
        )}
      </div>
    </>
  );
}
