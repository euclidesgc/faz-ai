import { Text } from '@radix-ui/themes';
import type { AiProfile } from '../../../../shared/aiProfiles';
import { DEFAULT_QUOTA_CRITICAL, quotaCriticalOf, readingStatus, type UsageWindow } from '../../../../shared/quotaReading';
import { QUOTA_CRITICAL_RANGE } from '../../../../shared/runner';
import { settings } from '../../../commands';
import { formatDateTime, t } from '../../../i18n';
import { useBoardStore } from '../../../store/boardStore';
import { FormField, NumberField } from '../../ui';

/** O nome da janela na tela: as duas conhecidas traduzidas, as outras pelo nome que o leitor deu. */
function windowName(window: string): string {
  if (window === 'five_hour') return t('Janela de 5 h');
  if (window.startsWith('seven_day')) return t('Janela semanal');
  return t('Janela {name}', { name: window });
}

function windowLine(w: UsageWindow): string {
  return w.resetAt === null
    ? t('{window}: {percent}%', { window: windowName(w.window), percent: w.percent })
    : t('{window}: {percent}% · renova {date}', { window: windowName(w.window), percent: w.percent, date: formatDateTime(w.resetAt) });
}

/**
 * O uso da cota do perfil do Claude Code: a leitura mais recente (que vale por 30 minutos) e o limite crítico, acima
 * do qual as execuções automáticas já começam no reserva da regra de fallback.
 */
export function QuotaReading({ profile }: { profile: AiProfile }) {
  const state = useBoardStore((s) => s.state)!;
  const runner = state.board.runner;
  const limit = quotaCriticalOf(runner, profile.id);
  const status = readingStatus(state.usageReadings ?? [], profile.id, limit, Date.now());
  const commit = (n: number) => {
    const { [profile.id]: _old, ...rest } = runner.quotaCritical;
    const quotaCritical = n === DEFAULT_QUOTA_CRITICAL ? rest : { ...rest, [profile.id]: n };
    void settings.updateBoard({ runner: { quotaCritical } });
  };
  return (
    <section className="agent-quota" aria-label={t('Uso da cota')}>
      <Text size="2" weight="medium">
        {t('Uso da cota')}
      </Text>
      {status.kind === 'fresh' ? (
        <>
          <ul className="agent-quota-windows">
            {status.reading.windows.map((w) => (
              <li key={w.window}>
                <Text size="2">{windowLine(w)}</Text>
              </li>
            ))}
          </ul>
          <Text as="p" size="1" color="gray">
            {t('Lido há {n} min', { n: Math.max(0, Math.floor((Date.now() - status.reading.readAt) / 60_000)) })}
          </Text>
        </>
      ) : (
        <>
          <Text as="p" size="2">
            {t('Uso desconhecido')}
          </Text>
          <Text as="p" size="1" color="gray">
            {t('O board lê o uso no fim de cada execução; a leitura vale por 30 minutos.')}
          </Text>
        </>
      )}
      <FormField label={t('Limite crítico (%)')} hint={t('Acima dele, as execuções automáticas começam no reserva da regra de fallback.')}>
        {(id) => <NumberField id={id} min={QUOTA_CRITICAL_RANGE.min} max={QUOTA_CRITICAL_RANGE.max} value={limit} onCommit={commit} />}
      </FormField>
    </section>
  );
}
