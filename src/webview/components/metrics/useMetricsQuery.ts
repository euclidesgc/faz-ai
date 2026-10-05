import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolvePeriod, type MetricsFilters, type MetricsPanelQuery, type MetricsPanelResult } from '../../../shared/metrics';
import { t } from '../../i18n';
import { useNow } from '../../useNow';
import { onHostMessage, postToHost } from '../../vscode';

/** Quanto a consulta espera o filtro parar de mudar (o `<input type="date">` muda a cada dígito do ano). */
export const QUERY_DEBOUNCE_MS = 300;

/** Quanto o painel espera a resposta do host antes de virar erro com "Consultar de novo". */
export const QUERY_TIMEOUT_MS = 15_000;

/** O pedido ao host para estes filtros: o recorte de dias resolvido agora e o workflow, se houver. */
export function toPanelQuery(filters: MetricsFilters, now: number): MetricsPanelQuery {
  const query: MetricsPanelQuery = resolvePeriod(filters, now);
  if (filters.workflow) query.workflow = filters.workflow;
  return query;
}

export interface MetricsQueryState {
  /** a última resposta aceita; continua na tela enquanto a próxima não chega (RF-08) e quando ela falha */
  result: MetricsPanelResult | null;
  /** há um pedido saindo ou sem resposta */
  loading: boolean;
  /** o erro da última resposta; os números de `result` ficam como estavam */
  error: string | null;
  /** o pedido em vigor (o que `result` responde, quando `loading` é false) */
  query: MetricsPanelQuery;
  /** consulta de novo, na hora, com os mesmos filtros (depois de um erro ou de mudar a retenção) */
  refresh(): void;
}

/** O que todo bloco do painel recebe do `MetricsView`. */
export interface MetricsBlockProps {
  result: MetricsPanelResult;
}

interface Sent {
  key: string;
  nonce: number;
  requestId: string;
}

/**
 * Consulta o log para o painel. Posta `metrics.query` direto (como a `AttachmentModal`), com um
 * `requestId` novo por pedido, e só aceita a resposta do último: a que chega atrasada, depois de o
 * filtro mudar, é descartada. Refaz o pedido quando o recorte resolvido muda, não a cada tecla.
 */
export function useMetricsQuery(filters: MetricsFilters): MetricsQueryState {
  // o relógio por minuto basta: o recorte resolvido só muda na virada do dia
  const now = useNow();
  const key = JSON.stringify(toPanelQuery(filters, now));
  const query = useMemo(() => JSON.parse(key) as MetricsPanelQuery, [key]);
  const [state, setState] = useState<{ result: MetricsPanelResult | null; loading: boolean; error: string | null }>({
    result: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const sent = useRef<Sent | null>(null);
  const inFlight = useRef(false);
  const scheduled = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () =>
      onHostMessage((msg) => {
        if (msg.type !== 'metrics.result' || msg.requestId !== sent.current?.requestId) return;
        inFlight.current = false;
        clearTimeout(timeout.current);
        const loading = scheduled.current;
        if (msg.result && !msg.error) setState({ result: msg.result, loading, error: null });
        else setState((s) => ({ result: s.result, loading, error: msg.error || t('Não foi possível consultar as métricas.') }));
      }),
    [],
  );

  useEffect(() => {
    const prev = sent.current;
    // nada mudou desde o último pedido: o StrictMode remontando o efeito, ou o filtro que voltou ao que era
    if (prev && prev.key === key && prev.nonce === nonce) {
      scheduled.current = false;
      setState((s) => (s.loading === inFlight.current ? s : { ...s, loading: inFlight.current }));
      return;
    }
    const send = () => {
      scheduled.current = false;
      const requestId = crypto.randomUUID();
      sent.current = { key, nonce, requestId };
      inFlight.current = true;
      postToHost({ type: 'metrics.query', requestId, query });
      // o host que não responde não deixa o painel carregando para sempre
      clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        if (sent.current?.requestId !== requestId || !inFlight.current || scheduled.current) return;
        inFlight.current = false;
        setState((s) => ({ result: s.result, loading: false, error: t('A consulta das métricas demorou demais. Tente de novo.') }));
      }, QUERY_TIMEOUT_MS);
    };
    setState((s) => (s.loading ? s : { ...s, loading: true }));
    // o primeiro pedido e o "consultar de novo" saem na hora; a troca de filtro espera ele parar de mudar
    if (!prev || prev.nonce !== nonce) return send();
    scheduled.current = true;
    const timer = setTimeout(send, QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, nonce, query]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, query, refresh };
}
