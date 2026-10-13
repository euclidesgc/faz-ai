import { useEffect, useRef, useState } from 'react';
import type { CardUsage } from '../../../shared/cardUsage';
import { t } from '../../i18n';
import { onHostMessage, postToHost } from '../../vscode';
import { QUERY_TIMEOUT_MS } from '../metrics/useMetricsQuery';

export interface CardUsageState {
  /** a última resposta aceita; continua na tela enquanto a próxima não chega e quando ela falha */
  usage: CardUsage | null;
  loading: boolean;
  error: string | null;
}

/**
 * Consulta o que o card já gastou (`card.usage.query`), como o painel de métricas consulta o log: um
 * `requestId` por pedido, e só a resposta do último vale. Refaz o pedido quando `version` muda (uma
 * execução do card começou ou terminou).
 */
export function useCardUsage(cardId: string, version: string): CardUsageState {
  const [state, setState] = useState<CardUsageState>({ usage: null, loading: true, error: null });
  const sent = useRef<string | null>(null);

  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type !== 'card.usage.result' || msg.requestId !== sent.current) return;
        sent.current = null;
        if (msg.usage && !msg.error) setState({ usage: msg.usage, loading: false, error: null });
        else setState((s) => ({ usage: s.usage, loading: false, error: msg.error || t('Não foi possível ler o consumo do card.') }));
      }),
    [],
  );

  useEffect(() => {
    const requestId = crypto.randomUUID();
    sent.current = requestId;
    setState((s) => (s.loading ? s : { ...s, loading: true }));
    postToHost({ type: 'card.usage.query', requestId, cardId });
    // o host que não responde não deixa a aba carregando para sempre
    const timer = setTimeout(() => {
      if (sent.current !== requestId) return;
      sent.current = null;
      setState((s) => ({ ...s, loading: false, error: t('A consulta do consumo demorou demais. Tente de novo.') }));
    }, QUERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cardId, version]);

  return state;
}
