import type { CardStatus } from '../../../shared/status';
import { t, tn } from '../../i18n';

/** O que a IA está fazendo por um card: nada (`null`), trabalhando nele, ou em sub-tarefas dele. */
export type AiWork = { mode: 'self' } | { mode: 'children'; count: number } | null;

/** O que o LED mostra: apagado, verde piscando (trabalho em andamento), amarelo (espera a pessoa) ou vermelho (bloqueado). */
export type LedState = 'off' | 'working' | 'attention' | 'error';

/** A IA trabalhando no próprio card vence o status; o status com a pessoa vence o trabalho nas sub-tarefas. */
export const ledState = (work: AiWork, status: CardStatus | null): LedState =>
  work?.mode === 'self'
    ? 'working'
    : status === 'blocked'
      ? 'error'
      : status === 'waiting_answer' || status === 'waiting_review'
        ? 'attention'
        : work
          ? 'working'
          : 'off';

const label = (led: LedState, work: AiWork): string =>
  led === 'error'
    ? t('Card bloqueado')
    : led === 'attention'
      ? t('Este card precisa da sua atenção')
      : led === 'off' || !work
        ? t('IA parada neste card')
        : work.mode === 'self'
          ? t('IA trabalhando neste card')
          : tn(work.count, 'IA trabalhando em {n} sub-tarefa deste card', 'IA trabalhando em {n} sub-tarefas deste card');

/**
 * LED do card, sempre presente na barra: verde e piscando devagar enquanto a IA trabalha (no card ou nas
 * sub-tarefas dele), amarelo fixo quando o card espera a pessoa, vermelho fixo quando está bloqueado e apagado
 * quando não há nada acontecendo. Só o verde pisca; com movimento reduzido ele fica aceso, sem piscar.
 */
export function AiLed({ work, status = null }: { work: AiWork; status?: CardStatus | null }) {
  const led = ledState(work, status);
  const text = label(led, work);
  return <span className={`ai-led ${led}`} role="img" aria-label={text} title={text} />;
}
