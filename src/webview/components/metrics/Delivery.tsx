import { useId } from 'react';
import { t } from '../../i18n';
import { formatCost, formatMoney, formatNumber, formatTokens } from './format';
import type { MetricsBlockProps } from './MetricsBlock';
import type { MetricsDeliveryCost, MetricsDeliveryCross } from '../../../shared/metrics';

/**
 * A célula de custo da entrega: o valor e, quando parte dele veio do preço do catálogo, a marca de estimado
 * (em palavras, nunca só em cor). "não medido" quando nenhuma história da linha tem custo completo.
 */
function CostCell({ usd, estimatedUsd }: { usd: number | null; estimatedUsd: number | null }) {
  if (usd === null) return <td className="is-number muted">{formatCost(null)}</td>;
  return (
    <td className="is-number">
      {formatMoney(usd)}
      {estimatedUsd !== null && estimatedUsd > 0 && <div className="muted">{t('estimado por tabela de preços')}</div>}
    </td>
  );
}

/** As colunas de custo de uma linha (só com a regra "Mostrar custo em dólar" ligada). */
function CostCells({ row, perStory }: { row: MetricsDeliveryCost; perStory: number | null }) {
  return (
    <>
      <td className="is-number">{formatNumber(row.costed)}</td>
      <CostCell usd={row.costUsd} estimatedUsd={row.costEstimatedUsd} />
      <CostCell usd={perStory} estimatedUsd={row.costEstimatedUsd} />
    </>
  );
}

function CostHeaders({ perStory }: { perStory: string }) {
  return (
    <>
      <th scope="col" className="is-number">
        {t('Com custo')}
      </th>
      <th scope="col" className="is-number">
        {t('Custo')}
      </th>
      <th scope="col" className="is-number">
        {perStory}
      </th>
    </>
  );
}

/**
 * O custo por entrega: as histórias concluídas no período, por tipo × esforço (com média e mediana por
 * história), por tipo × modelo e por tipo × agente. O indicador principal é o custo em US$ (informado pela
 * ferramenta ou estimado pelo preço do catálogo, marcado); os tokens seguem ao lado, com a leitura e a
 * escrita de cache separadas, e são o único indicador das histórias com execução de um modelo sem preço.
 * Nada medido aparece como "não medido", nunca como zero. O tipo e o esforço são os valores atuais da história.
 */
export function DeliveryTables({ sections, showCost = false }: MetricsBlockProps & { showCost?: boolean }) {
  const uid = useId();
  const d = sections.delivery;
  const { stories, measured, tokens, groups, byModel, byAgent, omitted } = d;
  if (!stories) return <p className="metrics-times-empty">{t('Nenhuma história concluída neste período.')}</p>;
  const hasOmitted = omitted.groups + omitted.byModel + omitted.byAgent > 0;
  const tokensOnly = measured - d.costed;
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
          {showCost && <CostHeaders perStory={t('Custo por história')} />}
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
            {t('Leitura de cache')}
          </th>
          <th scope="col" className="is-number">
            {t('Escrita de cache')}
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
            {showCost && <CostCells row={r} perStory={r.costPerStory} />}
            <td className="is-number">{formatNumber(r.measured)}</td>
            <td className="is-number">{formatTokens(r.tokens)}</td>
            <td className="is-number">{formatTokens(r.tokensPerStory)}</td>
            <td className="is-number">{formatTokens(r.cacheReadTokens)}</td>
            <td className="is-number">{formatTokens(r.cacheWriteTokens)}</td>
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
        {showCost && (
          <>
            <dt>{t('Histórias com custo')}</dt>
            <dd>{formatNumber(d.costed)}</dd>
            <dt>{t('Custo')}</dt>
            <dd>
              {formatCost(d.costUsd)}
              {d.costEstimatedUsd !== null && d.costEstimatedUsd > 0 && (
                <div className="muted">
                  {t('parte estimada por tabela de preços: {estimated}', { estimated: formatMoney(d.costEstimatedUsd) })}
                </div>
              )}
            </dd>
          </>
        )}
        <dt>{t('Histórias com tokens medidos')}</dt>
        <dd>{formatNumber(measured)}</dd>
        <dt>{t('Tokens')}</dt>
        <dd>{formatTokens(tokens)}</dd>
        <dt>{t('Leitura de cache')}</dt>
        <dd>{formatTokens(d.cacheReadTokens)}</dd>
        <dt>{t('Escrita de cache')}</dt>
        <dd>{formatTokens(d.cacheWriteTokens)}</dd>
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
              {showCost && (
                <>
                  <CostHeaders perStory={t('Custo médio')} />
                  <th scope="col" className="is-number">
                    {t('Custo mediano')}
                  </th>
                </>
              )}
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
              <th scope="col" className="is-number">
                {t('Leitura de cache')}
              </th>
              <th scope="col" className="is-number">
                {t('Escrita de cache')}
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={`${g.type}\u0000${g.effort}`}>
                <th scope="row">{g.type}</th>
                <td>{g.effort || t('não definido')}</td>
                <td className="is-number">{formatNumber(g.stories)}</td>
                {showCost && (
                  <>
                    <CostCells row={g} perStory={g.meanCostUsd} />
                    <CostCell usd={g.medianCostUsd} estimatedUsd={g.costEstimatedUsd} />
                  </>
                )}
                <td className="is-number">{formatNumber(g.measured)}</td>
                <td className="is-number">{formatTokens(g.tokens)}</td>
                <td className="is-number">{formatTokens(g.meanTokens)}</td>
                <td className="is-number">{formatTokens(g.medianTokens)}</td>
                <td className="is-number">{formatTokens(g.cacheReadTokens)}</td>
                <td className="is-number">{formatTokens(g.cacheWriteTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {byModel.length > 0 && crossTable(t('Custo por entrega por tipo e modelo'), t('Modelo'), t('não definido'), byModel)}
      {byAgent.length > 0 && crossTable(t('Custo por entrega por tipo e agente'), t('Agente'), t('sem agente'), byAgent)}
      <div id={`${uid}-n`} className="metrics-times-notes">
        {showCost && (
          <p className="metrics-times-hint">
            {t(
              'O custo é o informado pela ferramenta ou, sem ele, o estimado pelo preço do catálogo (marcado). Uma história só tem custo quando toda execução com tokens tem custo: os tokens são o único indicador onde o modelo não tem preço no catálogo.',
            )}
            {tokensOnly > 0 && ` ${t('Histórias medidas sem custo: {n}.', { n: formatNumber(tokensOnly) })}`}
          </p>
        )}
        <p className="metrics-times-hint">
          {t(
            'A leitura e a escrita de cache vêm separadas porque têm preços diferentes: trocar leitura por escrita faz o custo subir mesmo com menos tokens.',
          )}
        </p>
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
