import type { MetricsPanelResult } from '../../../shared/metrics';
import { t } from '../../i18n';
import { formatDay, formatRange, isBeforeLog, isEmptyResult } from './format';
import { Note } from './Note';

/**
 * Onde a série começa, junto dos filtros (RF-20): "Log do board desde …" e, quando o período pedido
 * começava antes disso (`clamped`), o aviso de que o recorte foi cortado, escrito ali mesmo e não num
 * rodapé. Board sem log (`logSince` vazio) não escreve nada aqui: quem diz "a série começa agora" é o
 * estado vazio da tela, e nenhum número aparece para ser qualificado.
 */
export function PeriodNote({ result }: { result: MetricsPanelResult }) {
  const since = formatDay(result.logSince);
  if (!since) return null;
  const period = formatRange(result.range);
  return (
    <div className="metrics-period-note">
      {/* num período vazio o estado vazio já diz desde quando há dado */}
      {!isEmptyResult(result) && <Note>{t('Log do board desde {date}.', { date: since })}</Note>}
      {result.clamped && isBeforeLog(result.range, true) && (
        <Note role="note">
          {t('O período pedido é anterior ao início do log, que começa em {date}. Não existe dado nesse período.', { date: since })}
        </Note>
      )}
      {result.clamped && !isBeforeLog(result.range, true) && (
        <Note role="note">
          {t(
            'O período pedido começava antes do início da série. O recorte em vigor é {period}. Não existe dado mais antigo: o número não está pequeno, é a série que começa aí.',
            { period },
          )}
        </Note>
      )}
    </div>
  );
}
