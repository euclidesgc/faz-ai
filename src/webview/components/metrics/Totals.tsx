import { useId } from 'react';
import type { MetricsPanelResult } from '../../../shared/metrics';
import { t } from '../../i18n';
import { formatCost, formatDuration, formatMoney, formatNumber, formatTokens, unmeasured } from './format';
import { Note } from './Note';

type Totals = MetricsPanelResult['totals'];

/**
 * Os cinco totais do período (RF-09). Cada rótulo diz o que conta (RF-10); o que não foi medido aparece
 * como "não medido", nunca como zero (RF-18), e o que foi medido só em parte vem com o aviso (RF-22).
 * A grade quebra por `auto-fit`, então cabe em barra lateral e no zoom de 200% (RF-33).
 */
export function Totals({ result }: { result: MetricsPanelResult }) {
  const { totals } = result;
  return (
    <section className="metrics-totals" aria-label={t('Totais do período')}>
      <Total label={t('Atividades concluídas')} hint={t('Cards que chegaram a uma coluna de conclusão no período.')}>
        {(valueId) => (
          <span id={valueId} className="metrics-total-value">
            {formatNumber(totals.cardsDone)}
          </span>
        )}
      </Total>

      <Total label={t('Execuções de IA')} hint={t('Vezes em que a IA foi acionada num card, as em andamento incluídas.')}>
        {(valueId) => (
          <>
            <span id={valueId} className="metrics-total-value">
              {formatNumber(totals.runs)}
            </span>
            {totals.runsOpen > 0 && (
              <span className="metrics-total-sub">{t('{n} em andamento', { n: formatNumber(totals.runsOpen) })}</span>
            )}
          </>
        )}
      </Total>

      <Total label={t('Tokens')} hint={t('Entrada, saída e cache das execuções medidas.')}>
        {(valueId, noteId) => <TokensBody totals={totals} valueId={valueId} noteId={noteId} />}
      </Total>

      <Total label={t('Custo')} hint={t('Em dólares, somando as execuções medidas.')}>
        {(valueId, noteId) => <CostBody totals={totals} valueId={valueId} noteId={noteId} />}
      </Total>

      <Total
        label={t('Tempo de IA')}
        hint={t('Soma da duração de cada execução. Execuções simultâneas somam, então o total pode passar do tempo decorrido.')}
      >
        {(valueId) => (
          <>
            <span id={valueId} className="metrics-total-value">
              {formatDuration(totals.durationMs)}
            </span>
            {totals.runsOpen > 0 && (
              <span className="metrics-total-sub">{t('{n} em andamento, fora desta soma', { n: formatNumber(totals.runsOpen) })}</span>
            )}
          </>
        )}
      </Total>
    </section>
  );
}

/** O cartão de um total: rótulo, o que ele conta, e o corpo (número + avisos). */
function Total({ label, hint, children }: { label: string; hint: string; children: (valueId: string, noteId: string) => React.ReactNode }) {
  const uid = useId();
  const valueId = `${uid}-v`;
  const noteId = `${uid}-n`;
  return (
    <div className="metrics-total" role="group" aria-labelledby={`${uid}-l`}>
      <h3 id={`${uid}-l`} className="metrics-total-label">
        {label}
      </h3>
      <p className="metrics-total-hint">{hint}</p>
      {children(valueId, noteId)}
    </div>
  );
}

/**
 * Quantas execuções entram no custo: `costedRuns` (custo é contado à parte dos tokens, uma execução pode ter
 * um e não ter o outro). Se a resposta não trouxer o campo, cai no critério dos tokens.
 */
const costedOf = (totals: Totals): number => totals.costedRuns ?? totals.measuredRuns;

/** Por que não há número, ou quanto dele ficou de fora: junto do valor, ligado por aria-describedby. */
function CoverageNote({ totals, measured, id, what }: { totals: Totals; measured: number; id: string; what: string }) {
  const missing = totals.runs - measured;
  if (totals.runs === 0) return <Note id={id}>{t('Nenhuma execução de IA neste período.')}</Note>;
  if (measured === 0)
    return (
      <Note id={id}>
        {t('Nenhuma das {runs} execuções teve {what} medido: a ferramenta ainda não informa esse dado.', {
          runs: formatNumber(totals.runs),
          what,
        })}
      </Note>
    );
  if (missing > 0)
    return (
      <Note id={id}>
        {t('{missing} de {runs} execuções não foram medidas: o número cobre só as outras.', {
          missing: formatNumber(missing),
          runs: formatNumber(totals.runs),
        })}
      </Note>
    );
  return null;
}

function TokensBody({ totals, valueId, noteId }: { totals: Totals; valueId: string; noteId: string }) {
  const tokens = totals.tokens;
  const note = <CoverageNote totals={totals} measured={totals.measuredRuns} id={noteId} what={t('tokens')} />;
  const hasNote = totals.runs > 0 ? tokens === null || totals.measuredRuns < totals.runs : tokens === null;
  return (
    <>
      <span id={valueId} className="metrics-total-value" aria-describedby={hasNote ? noteId : undefined}>
        {formatTokens(tokens === null ? null : tokens.total)}
      </span>
      {tokens !== null && (
        <dl className="metrics-token-breakdown">
          <BreakdownRow label={t('Entrada')} value={tokens.input} />
          <BreakdownRow label={t('Saída')} value={tokens.output} />
          <BreakdownRow label={t('Leitura de cache')} value={tokens.cacheRead} />
          <BreakdownRow label={t('Escrita de cache')} value={tokens.cacheWrite} />
        </dl>
      )}
      {note}
    </>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="metrics-token-breakdown-row">
      <dt>{label}</dt>
      <dd>{formatNumber(value)}</dd>
    </div>
  );
}

function CostBody({ totals, valueId, noteId }: { totals: Totals; valueId: string; noteId: string }) {
  const cost = totals.costUsd;
  const estimated = totals.costEstimatedUsd;
  const informed = totals.costInformedUsd;
  const costed = costedOf(totals);
  const hasNote = totals.runs > 0 && (cost === null || costed < totals.runs);
  return (
    <>
      <span id={valueId} className="metrics-total-value" aria-describedby={hasNote ? noteId : undefined}>
        {cost === null ? unmeasured() : formatCost(cost)}
      </span>
      {cost !== null && estimated !== null && estimated > 0 && (
        <span className="metrics-total-sub">
          {informed !== null && informed > 0
            ? t('Estimado por tabela de preços: {estimated}; informado pela ferramenta: {informed}', {
                estimated: formatMoney(estimated),
                informed: formatMoney(informed),
              })
            : t('Estimado por tabela de preços: {estimated}', { estimated: formatMoney(estimated) })}
        </span>
      )}
      <CoverageNote totals={totals} measured={costed} id={noteId} what={t('custo')} />
    </>
  );
}
