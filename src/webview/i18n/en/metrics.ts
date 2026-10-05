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

  // #158 filtros de período e de workflow (MetricsFilters)
  '7 dias': '7 days',
  '30 dias': '30 days',
  'Este mês': 'This month',
  'Últimos 12 meses': 'Last 12 months',
  Tudo: 'All time',
  'Intervalo livre': 'Custom range',
  Workflow: 'Workflow',
  Todos: 'All',
  'A data final vem antes da inicial.': 'The end date is before the start date.',
  'Período consultado: {period}': 'Period queried: {period}',

  // card 159: Totais do período (Totals.tsx)
  'Totais do período': 'Period totals',
  'Atividades concluídas': 'Completed activities',
  'Cards que chegaram a uma coluna de conclusão no período.': 'Cards that reached a done column in the period.',
  'Execuções de IA': 'AI runs',
  'Vezes em que a IA foi acionada num card, as em andamento incluídas.': 'Times the AI was started on a card, running ones included.',
  '{n} em andamento': '{n} in progress',
  '{n} em andamento, fora desta soma': '{n} in progress, not in this sum',
  Tokens: 'Tokens',
  'Entrada, saída e cache das execuções medidas.': 'Input, output and cache of the measured runs.',
  Entrada: 'Input',
  Saída: 'Output',
  'Leitura de cache': 'Cache read',
  'Escrita de cache': 'Cache write',
  Custo: 'Cost',
  'Em dólares, somando as execuções medidas.': 'In dollars, summing the measured runs.',
  'Estimado por tabela de preços: {estimated}': 'Estimated from a price table: {estimated}',
  'Estimado por tabela de preços: {estimated}; informado pela ferramenta: {informed}':
    'Estimated from a price table: {estimated}; reported by the tool: {informed}',
  'Tempo de IA': 'AI time',
  'Soma da duração de cada execução. Execuções simultâneas somam, então o total pode passar do tempo decorrido.':
    'Sum of each run duration. Simultaneous runs add up, so the total can exceed the elapsed time.',
  'Nenhuma execução de IA neste período.': 'No AI runs in this period.',
  'Nenhuma das {runs} execuções teve {what} medido: a ferramenta ainda não informa esse dado.':
    'None of the {runs} runs had {what} measured: the tool does not report this yet.',
  '{missing} de {runs} execuções não foram medidas: o número cobre só as outras.':
    '{missing} of {runs} runs were not measured: the number covers only the others.',
  tokens: 'tokens',
  custo: 'cost',

  // #161 Detalhe guardado (RetentionCard)
  'Detalhe guardado': 'Detail kept',
  'Meses de detalhe guardados': 'Months of detail kept',
  'menos de 100 KB': 'under 100 KB',
  'cerca de {size} MB': 'about {size} MB',
  '{n} mês com detalhe': '{n} month with detail',
  '{n} meses com detalhe': '{n} months with detail',
  'Acima de 12 meses o arquivo do board pode passar do teto de 10 MB.': 'Above 12 months the board file may exceed the 10 MB ceiling.',
  'Fora da janela some o detalhe por card, o lead time de card antigo e o inventário de ferramentas e skills. Os totais por mês nunca expiram.':
    'Outside the window the per-card detail, the lead time of old cards and the tools and skills inventory go away. The monthly totals never expire.',
  'Guardar o detalhe de {n} mês?': 'Keep the detail of {n} month?',
  'Guardar o detalhe de {n} meses?': 'Keep the detail of {n} months?',
  'Guardar só {n} mês': 'Keep only {n} month',
  'Guardar só {n} meses': 'Keep only {n} months',
  'Na próxima abertura do board, {n} mês perde o detalhe por card, o lead time de card antigo e o inventário de ferramentas e skills. Não acontece agora. Os totais por mês continuam.':
    'The next time the board opens, {n} month loses the per-card detail, the lead time of old cards and the tools and skills inventory. It does not happen now. The monthly totals stay.',
  'Na próxima abertura do board, {n} meses perdem o detalhe por card, o lead time de card antigo e o inventário de ferramentas e skills. Não acontece agora. Os totais por mês continuam.':
    'The next time the board opens, {n} months lose the per-card detail, the lead time of old cards and the tools and skills inventory. It does not happen now. The monthly totals stay.',
  'Nenhum mês guardado hoje sai da janela, mas a partir da próxima abertura do board o detalhe antigo passa a ser descartado mais cedo. Os totais por mês continuam.':
    'No month kept today leaves the window, but from the next time the board opens old detail is discarded sooner. The monthly totals stay.',

  // #160 Série por mês (MonthSeries); "Custo" e "Tokens" já estão acima, no bloco dos totais
  'Custo por mês': 'Cost per month',
  'Tokens por mês': 'Tokens per month',
  'em dólares (US$)': 'in dollars (US$)',
  'em tokens (entrada, saída e cache)': 'in tokens (input, output and cache)',
  'Série do gráfico': 'Chart series',
  'Maior valor: {value}, em {month}.': 'Highest value: {value}, in {month}.',
  '{n} mês sem dado.': '{n} month with no data.',
  '{n} meses sem dado.': '{n} months with no data.',
  '{n} mês parcial.': '{n} partial month.',
  '{n} meses parciais.': '{n} partial months.',
  'Os números estão na tabela abaixo do gráfico.': 'The numbers are in the table below the chart.',
  'Nenhum mês deste período tem custo medido, então não há barras para desenhar. A tabela mostra mês a mês.':
    'No month in this period has measured cost, so there are no bars to draw. The table shows each month.',
  'Nenhum mês deste período tem tokens medidos, então não há barras para desenhar. A tabela mostra mês a mês.':
    'No month in this period has measured tokens, so there are no bars to draw. The table shows each month.',
  Mês: 'Month',
  Observação: 'Note',
  'sem dado': 'no data',
  parcial: 'partial',
  'só total mensal': 'monthly total only',
};
