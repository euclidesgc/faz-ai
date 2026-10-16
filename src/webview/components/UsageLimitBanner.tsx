import { aiToolInfo } from '../../shared/harness';
import { limitHolds } from '../../shared/usageLimit';
import { formatClock, t } from '../i18n';
import { useBoardStore } from '../store/boardStore';
import { useNow } from '../useNow';

/**
 * A fila pausada pelo limite de uso do plano (RF11, história #800): logo abaixo da barra superior, como o aviso "Sem
 * ligação". Usa o relógio da página para sumir quando a pausa vence, sem esperar outro estado do host.
 */
export function UsageLimitBanner() {
  const state = useBoardStore((s) => s.state);
  const now = useNow();
  if (!state?.usageLimit || !limitHolds(state, now)) return null;
  const { tool, resumeAt, source } = state.usageLimit;
  const params = { tool: aiToolInfo(tool).label, time: formatClock(resumeAt, now) };
  return (
    <div
      className="banner warn usage-limit"
      role="status"
      title={t(
        'A ferramenta de IA esgotou o limite de uso do plano: o autopiloto e o heartbeat não disparam nada dela até a hora indicada. A execução pedida à mão continua liberada.',
      )}
    >
      {source === 'reset'
        ? t('Limite de uso do {tool}: a fila retoma às {time}.', params)
        : t('Limite de uso do {tool}: nova tentativa às {time}.', params)}
    </div>
  );
}
