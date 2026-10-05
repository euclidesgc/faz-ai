import type { MetricsPanelResult } from '../../../shared/metrics';
import { t } from '../../i18n';
import { formatMonth, intlLocale } from './format';
import { Note } from './Note';

/** "setembro de 2026, outubro de 2026 e novembro de 2026" / "September 2026, October 2026, and November 2026". */
function monthList(months: string[]): string {
  return new Intl.ListFormat(intlLocale(), { style: 'long', type: 'conjunction' }).format(months.map((m) => formatMonth(m, 'long')));
}

/**
 * O horizonte do detalhe, colado ao gráfico que ele qualifica (RF-21, RF-22): mês arquivado entra na
 * série pelo total mensal, sem corte por dimensão nem detalhe por card, e o aviso diz quais meses são.
 * Com um workflow filtrado, mês arquivado que não guardou a dimensão `workflow` (consolidado antes de
 * ela ser gravada) vem sem número (`present: false`): fica fora da soma e o aviso diz isso, em vez de
 * parecer um mês sem atividade.
 */
export function Horizon({ result, workflow }: { result: MetricsPanelResult; workflow: string }) {
  const { archivedMonths, detailFrom } = result;
  if (archivedMonths.length === 0) return null;
  const plural = archivedMonths.length > 1;
  const left = workflow ? result.months.filter((m) => m.archived && !m.present).map((m) => m.month) : [];
  const months = monthList(archivedMonths);
  return (
    <div className="metrics-horizon">
      <Note>
        {plural
          ? t('{months} só têm o total mensal: entram na série, mas sem corte por dimensão nem detalhe por card.', { months })
          : t('{months} só tem o total mensal: entra na série, mas sem corte por dimensão nem detalhe por card.', { months })}
        {detailFrom ? ` ${t('O detalhe vai desde {month}.', { month: formatMonth(detailFrom, 'long') })}` : ''}
      </Note>
      {left.length > 0 && (
        <Note role="note">
          {left.length > 1
            ? t(
                'Com o workflow {workflow} filtrado, {months} ficaram fora dos números: foram consolidados antes de o log guardar o workflow e só têm o total do board inteiro. Não foram somados por aproximação.',
                { workflow, months: monthList(left) },
              )
            : t(
                'Com o workflow {workflow} filtrado, {months} ficou fora dos números: foi consolidado antes de o log guardar o workflow e só tem o total do board inteiro. Não foi somado por aproximação.',
                { workflow, months: monthList(left) },
              )}
        </Note>
      )}
    </div>
  );
}
