import { t } from '../../i18n';
import { useBoardStore } from '../../store/boardStore';
import { Button } from '../ui';
import { formatDay, formatRange, isEmptyResult } from './format';
import { useMetricsQuery } from './useMetricsQuery';

/**
 * A visão "Métricas": lê o log do board pelo `useMetricsQuery` e monta os blocos na ordem da Spec.
 * Os filtros vêm da store (`metricsFilters`), fora do que é persistido: trocar de visão conserva,
 * reabrir o board volta ao padrão (RF-06).
 *
 * Pontos de montagem: cada bloco ocupa UMA linha marcada com o número do card que o constrói. Quem
 * faz o bloco troca só a sua linha pelo componente (a sugestão de props está no comentário) e não
 * mexe nas outras. Todo bloco que mostra número recebe `result` (ver `MetricsBlockProps`).
 */
export function MetricsView() {
  const filters = useBoardStore((s) => s.metricsFilters);
  const { result, loading, error, refresh } = useMetricsQuery(filters);
  const empty = result !== null && isEmptyResult(result);
  const period = result ? formatRange(result.range) : '';
  // muda só quando uma resposta é aceita; o leitor de tela anuncia sem tirar o foco de onde está (RF-32)
  const announcement =
    result && !loading && !error ? (period ? t('Números atualizados: {period}', { period }) : t('Números atualizados.')) : '';

  return (
    <section className="metrics" aria-labelledby="metrics-title">
      <header className="metrics-header">
        <h2 id="metrics-title">{t('Métricas')}</h2>
        {loading && result && (
          <span className="metrics-updating">
            <span className="spinner" aria-hidden="true" /> {t('Atualizando…')}
          </span>
        )}
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* #158 Filtros (sempre visível, também no vazio e no erro; os workflows são os da última resposta): <MetricsFilters workflows={result?.workflows ?? []} /> */}

      {error && (
        <div className="metrics-error" role="alert">
          <span>{t(error)}</span>
          <Button size="small" onClick={refresh}>
            {t('Consultar de novo')}
          </Button>
        </div>
      )}

      {result === null ? (
        !error && (
          <p className="metrics-state" aria-busy="true">
            <span className="spinner" aria-hidden="true" /> {t('Carregando métricas…')}
          </p>
        )
      ) : (
        <div className="metrics-body" aria-busy={loading || undefined}>
          {/* #162 Avisos, o recorte em vigor junto dos filtros (período, "log desde", recorte cortado): <RangeNote result={result} /> */}
          {empty ? (
            <EmptyPeriod logSince={result.logSince} />
          ) : (
            <>
              {/* #159 Totais: <Totals result={result} /> */}
              {/* #160 Série por mês: <MonthSeries result={result} /> */}
              {/* #162 Avisos, o horizonte do detalhe junto do gráfico que ele qualifica (RF-22): <DetailNote result={result} /> */}
            </>
          )}
          {/* #161 Retenção (vale também num período vazio: é do board, não do recorte): <RetentionCard result={result} onChanged={refresh} /> */}
        </div>
      )}
    </section>
  );
}

/** Período sem dado nenhum (RF-07): diz desde quando há dado, e nenhum total aparece, nem "0". */
function EmptyPeriod({ logSince }: { logSince: string }) {
  return (
    <p className="metrics-state">
      {logSince
        ? t('Nenhum dado neste período. O log do board tem dados desde {date}.', { date: formatDay(logSince) })
        : t('O board ainda não tem log: a série começa agora, com o próximo card movido ou a próxima execução da IA.')}
    </p>
  );
}
