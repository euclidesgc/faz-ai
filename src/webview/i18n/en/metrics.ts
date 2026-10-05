// Painel de métricas (src/webview/components/metrics/). Os blocos do painel acrescentam aqui o texto deles.
export const metrics: Record<string, string> = {
  // visão e estados (MetricsView)
  Métricas: 'Metrics',
  'Carregando métricas…': 'Loading metrics…',
  'Atualizando…': 'Updating…',
  'Números atualizados: {period}': 'Numbers updated: {period}',
  'Números atualizados.': 'Numbers updated.',
  'Não foi possível consultar as métricas.': 'Could not query the metrics.',
  'Consultar de novo': 'Query again',
  'Nenhum dado neste período. O log do board tem dados desde {date}.': 'No data in this period. The board log has data since {date}.',
  'O board ainda não tem log: a série começa agora, com o próximo card movido ou a próxima execução da IA.':
    'The board has no log yet: the series starts now, with the next card moved or the next AI run.',

  // formatação (format.ts); unidades e o "a" entre datas saem do locale, não daqui (ver o comentário lá)
  'não medido': 'not measured',
};
