import { useMemo } from 'react';
import type { CardUsageRow } from '../../../shared/cardUsage';
import { estimateContext } from '../../../shared/contextEstimate';
import type { Card } from '../../../shared/model';
import { useBoardStore } from '../../store/boardStore';
import { dt, t, tn } from '../../i18n';
import { ContextDetail } from '../cardView/ContextGauge';
import { formatCompact, formatDuration, formatMonth, formatNumber, unmeasured } from '../metrics/format';
import { useCardUsage } from './useCardUsage';

/** Tokens compactos na célula, com o número exato na dica; "não medido" quando a linha não tem medição. */
function TokenCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className="is-number muted">{unmeasured()}</td>;
  return (
    <td className="is-number" title={formatNumber(value)}>
      {formatCompact(value)}
    </td>
  );
}

function UsageLine({ label, row, total = false }: { label: string; row: CardUsageRow; total?: boolean }) {
  const tk = row.tokens ?? undefined;
  return (
    <tr className={total ? 'usage-total' : undefined}>
      <th scope="row">{label}</th>
      <td className="is-number">{formatNumber(row.runs)}</td>
      <td className="is-number">{formatDuration(row.durationMs)}</td>
      <TokenCell value={tk?.input} />
      <TokenCell value={tk?.output} />
      <TokenCell value={tk?.cacheRead} />
      <TokenCell value={tk?.cacheWrite} />
      <TokenCell value={tk?.total} />
    </tr>
  );
}

/**
 * Aba Consumo do card aberto: o que o card já gastou, medido em cada execução, por fase e no total, e a
 * estimativa da próxima execução. O gasto é histórico e só cresce; a estimativa acompanha o card.
 */
export function UsageTab({ card }: { card: Card }) {
  const state = useBoardStore((s) => s.state)!;
  const estimate = useMemo(() => estimateContext(state, card), [state, card]);
  // uma execução do card (ou de uma sub-tarefa) que começa ou termina muda o que já foi gasto
  const childIds = state.cards.filter((c) => c.parentId === card.id).map((c) => c.id);
  const version = state.aiRuns.filter((id) => id === card.id || childIds.includes(id)).join(',');
  const { usage, loading, error } = useCardUsage(card.id, version);
  const empty = usage !== null && usage.total.runs === 0;

  return (
    <div className="usage-tab">
      <section className="drawer-section" aria-busy={loading}>
        <h3>{t('Gasto até agora')}</h3>
        {error && <p className="error">{error}</p>}
        {!usage && loading && <p className="muted">{t('Carregando…')}</p>}
        {empty && (
          <p className="muted">
            {card.parentId
              ? t('Nenhuma execução neste card. As sub-tarefas rodam dentro da sessão da história: o consumo delas aparece na história.')
              : t('Nenhuma execução de IA neste card ainda.')}
          </p>
        )}
        {usage && !empty && (
          <>
            <div className="usage-table-wrap">
              <table className="metrics-table usage-table">
                <thead>
                  <tr>
                    <th scope="col">{t('Fase')}</th>
                    <th scope="col" className="is-number">
                      {t('Execuções')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Tempo')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Entrada')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Saída')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Leitura de cache')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Escrita de cache')}
                    </th>
                    <th scope="col" className="is-number">
                      {t('Total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usage.phases.map((row) => (
                    <UsageLine key={row.phase} label={row.phase ? dt(row.phase) : t('sem fase')} row={row} />
                  ))}
                  {usage.subtasks && <UsageLine label={t('Sub-tarefas')} row={usage.subtasks} />}
                </tbody>
                <tfoot>
                  <UsageLine label={t('Total')} row={usage.total} total />
                </tfoot>
              </table>
            </div>
            <div className="context-notes">
              <p>
                {t(
                  'Medido pela ferramenta no fim de cada execução: inclui tudo o que a IA leu e escreveu no trabalho, não só o contexto inicial. Só cresce: apagar mensagens ou desmarcar itens muda as próximas execuções, não o que já foi gasto.',
                )}
              </p>
              {usage.total.open > 0 && (
                <p>
                  {tn(
                    usage.total.open,
                    'Uma execução em andamento: o consumo dela entra quando terminar.',
                    '{n} execuções em andamento: o consumo delas entra quando terminarem.',
                  )}
                </p>
              )}
              {usage.archivedUntil && (
                <p>
                  {t('As execuções até {month} ficaram só nos totais mensais do board (retenção do detalhe) e não aparecem aqui.', {
                    month: formatMonth(usage.archivedUntil, 'long'),
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </section>
      <section className="drawer-section">
        <h3>{t('Próxima execução')}</h3>
        <div className="usage-estimate">
          <ContextDetail estimate={estimate} />
        </div>
      </section>
    </div>
  );
}
