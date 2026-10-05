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

  // card 162 avisos de honestidade (PeriodNote, Horizon)
  'Log do board desde {date}.': 'Board log since {date}.',
  'O período pedido começava antes do início da série. O recorte em vigor é {period}. Não existe dado mais antigo: o número não está pequeno, é a série que começa aí.':
    'The requested period started before the start of the series. The range in effect is {period}. No older data exists: the number is not small, the series is what starts there.',
  '{months} só têm o total mensal: entram na série, mas sem corte por dimensão nem detalhe por card.':
    '{months} only have the monthly total: they are in the series, but with no breakdown by dimension or per-card detail.',
  '{months} só tem o total mensal: entra na série, mas sem corte por dimensão nem detalhe por card.':
    '{months} only has the monthly total: it is in the series, but with no breakdown by dimension or per-card detail.',
  'O detalhe vai desde {month}.': 'Detail goes back to {month}.',
  'Com o workflow {workflow} filtrado, {months} ficaram fora dos números: foram consolidados antes de o log guardar o workflow e só têm o total do board inteiro. Não foram somados por aproximação.':
    'With the {workflow} workflow filtered, {months} are left out of the numbers: they were consolidated before the log stored the workflow and only have the whole-board total. They were not added up by approximation.',
  'Com o workflow {workflow} filtrado, {months} ficou fora dos números: foi consolidado antes de o log guardar o workflow e só tem o total do board inteiro. Não foi somado por aproximação.':
    'With the {workflow} workflow filtered, {months} is left out of the numbers: it was consolidated before the log stored the workflow and only has the whole-board total. It was not added up by approximation.',

  // card 173: os cinco blocos (MetricsBlocks, MetricsBlock) e o formatSpan
  'Onde o consumo aconteceu': 'Where the usage happened',
  'O consumo do período repartido por fase, tipo de card, modelo, ferramenta, esforço ou perfil.':
    'The period usage split by phase, card type, model, tool, effort or profile.',
  'Quanto tempo o card fica na fase': 'How long a card stays in a phase',
  'Média e mediana de cada passagem por uma fase, e quantos cards estão nela agora.':
    'Mean and median of each pass through a phase, and how many cards are in it now.',
  'Lead time': 'Lead time',
  'Do primeiro registro do card até a conclusão, dos cards concluídos no período.':
    'From the first record of the card to its completion, for the cards completed in the period.',
  'Mais caros e mais demorados': 'Most expensive and slowest',
  'Os dois rankings olham horizontes diferentes: leia o aviso de cada um antes de compará-los.':
    'The two rankings look at different horizons: read the notice on each before comparing them.',
  'Fases mais caras': 'Most expensive phases',
  'As fases ordenadas pelo consumo, com a série inteira do período.': 'The phases ordered by usage, over the whole series of the period.',
  'Cards mais caros': 'Most expensive cards',
  'Os cards ordenados pelo consumo, com as execuções que o detalhe ainda guarda.':
    'The cards ordered by usage, with the runs the detail still holds.',
  'O que a IA usou': 'What the AI used',
  'Ferramentas, ferramentas MCP, agentes e skills que apareceram nas execuções.':
    'Tools, MCP tools, agents and skills that showed up in the runs.',
  'Alcança toda a série do período, inclusive os meses já arquivados.': 'Covers the whole series of the period, archived months included.',
  'Só alcança o detalhe guardado, desde {month}: o que aconteceu antes não aparece aqui.':
    'Only covers the stored detail, since {month}: what happened before does not show here.',
  'Este bloco depende do detalhe guardado, e o board ainda não tem nenhum.':
    'This block depends on the stored detail, and the board has none yet.',
  desconhecido: 'unknown',
  'menos de 1min': 'less than 1m',
};
