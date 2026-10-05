import { useId } from 'react';
import type { MetricsUsage } from '../../../shared/metrics';
import { t } from '../../i18n';
import { formatMonth, formatNumber } from './format';
import type { MetricsBlockProps } from './MetricsBlock';
import { Note } from './Note';

/**
 * "O que a IA usou" (RF-25 a RF-28): quatro grupos (ferramentas, ferramentas de MCP, subagentes e skills),
 * cada um uma tabela com o nome, as execuções em que apareceu e a soma de usos. Na ferramenta de MCP o
 * servidor é coluna própria; quando o registro não trouxe o servidor a linha mostra o nome como foi
 * gravado e diz "servidor não registrado", sem adivinhar (RF-26).
 *
 * Dois estados vazios, de propósito diferentes (RF-27): `measured: false` é "ainda não medido" (nenhuma
 * execução do board gravou inventário), `measured: true` sem linha é "nenhum registro no período".
 */
export function Inventory({ result, sections }: MetricsBlockProps) {
  const { inventory } = sections;
  const since = result.detailFrom ? formatMonth(result.detailFrom, 'long') : '';
  return (
    <div className="metrics-inventory">
      <Note data-inventory-scope>
        {since
          ? t(
              'Este bloco lê só o detalhe guardado, desde {month}. Os totais mensais de uso (por tipo e nome) também vão para o arquivo mensal, mas não aparecem aqui: depois que o detalhe de um mês é descartado, o que cada execução usou deixa de ser listado.',
              { month: since },
            )
          : t(
              'Este bloco lê só o detalhe guardado. Os totais mensais de uso (por tipo e nome) também vão para o arquivo mensal, mas não aparecem aqui: depois que o detalhe de um mês é descartado, o que cada execução usou deixa de ser listado.',
            )}
      </Note>
      <UsageGroup title={t('Ferramentas')} rows={inventory.tools} measured={inventory.measured} />
      <UsageGroup title={t('Ferramentas de MCP')} rows={inventory.mcpTools} measured={inventory.measured} mcp />
      <UsageGroup title={t('Subagentes')} rows={inventory.agents} measured={inventory.measured} />
      <UsageGroup title={t('Skills')} rows={inventory.skills} measured={inventory.measured} />
    </div>
  );
}

function UsageGroup({ title, rows, measured, mcp = false }: { title: string; rows: MetricsUsage[]; measured: boolean; mcp?: boolean }) {
  const titleId = `${useId()}-t`;
  return (
    <section className="metrics-inventory-group" aria-labelledby={titleId} data-mcp={mcp || undefined}>
      <h4 id={titleId} className="metrics-inventory-title">
        {title}
      </h4>
      {!measured ? (
        <p className="metrics-inventory-empty" data-state="unmeasured">
          {t('Ainda não medido: nenhuma execução deste board gravou o que usou. Não significa que nada foi usado.')}
        </p>
      ) : rows.length === 0 ? (
        <p className="metrics-inventory-empty" data-state="empty">
          {t('Nenhum registro no período.')}
        </p>
      ) : (
        <table className="metrics-table">
          <caption className="sr-only">{title}</caption>
          <thead className="metrics-sticky-head">
            <tr>
              {mcp ? (
                <>
                  <th scope="col">{t('Servidor')}</th>
                  <th scope="col">{t('Ferramenta')}</th>
                </>
              ) : (
                <th scope="col">{t('Nome')}</th>
              )}
              <th scope="col" className="is-number">
                {t('Execuções')}
              </th>
              <th scope="col" className="is-number">
                {t('Usos')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.server}\u0000${r.name}`}>
                {mcp ? (
                  <>
                    <td>
                      {r.server !== '' ? r.server : <span className="metrics-inventory-unknown">{t('servidor não registrado')}</span>}
                    </td>
                    <th scope="row">{r.name}</th>
                  </>
                ) : (
                  <th scope="row">{r.name}</th>
                )}
                <td className="is-number">{formatNumber(r.runs)}</td>
                <td className="is-number">{formatNumber(r.calls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
