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
  'A consulta das métricas demorou demais. Tente de novo.': 'The metrics query took too long. Try again.',
  'O período escolhido é anterior ao início do log.': 'The chosen period is before the start of the log.',
  'O período pedido é anterior ao início do log, que começa em {date}. Não existe dado nesse período.':
    'The requested period is before the start of the log, which begins on {date}. There is no data in that period.',
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
  // card 177: o inventário (Inventory)
  'Este bloco lê só o detalhe guardado, desde {month}. Os totais mensais de uso (por tipo e nome) também vão para o arquivo mensal, mas não aparecem aqui: depois que o detalhe de um mês é descartado, o que cada execução usou deixa de ser listado.':
    'This block reads only the stored detail, since {month}. The monthly usage totals (by kind and name) also go to the monthly archive, but they do not show here: once a month detail is discarded, what each run used is no longer listed.',
  'Este bloco lê só o detalhe guardado. Os totais mensais de uso (por tipo e nome) também vão para o arquivo mensal, mas não aparecem aqui: depois que o detalhe de um mês é descartado, o que cada execução usou deixa de ser listado.':
    'This block reads only the stored detail. The monthly usage totals (by kind and name) also go to the monthly archive, but they do not show here: once a month detail is discarded, what each run used is no longer listed.',
  Ferramentas: 'Tools',
  'Ferramentas de MCP': 'MCP tools',
  Subagentes: 'Subagents',
  'Ainda não medido: nenhuma execução deste board gravou o que usou. Não significa que nada foi usado.':
    'Not measured yet: no run on this board has recorded what it used. It does not mean nothing was used.',
  'Nenhum registro no período.': 'No records in the period.',
  Servidor: 'Server',
  Ferramenta: 'Tool',
  Execuções: 'Runs',
  Usos: 'Uses',
  'servidor não registrado': 'server not recorded',
  // card 176: permanência por fase e lead time (Times)
  'sem permanência medida': 'no permanence measured',
  'Nenhuma fase com permanência neste período.': 'No phase has a permanence in this period.',
  'Permanência do card em cada fase': 'How long the card stayed in each phase',
  Permanências: 'Permanences',
  Mediana: 'Median',
  Média: 'Mean',
  Desconhecidas: 'Unknown',
  'Aqui agora': 'Here now',
  'Permanências, não cards: um card que volta para uma fase conta duas vezes. Quem está na fase agora aparece em "aqui agora" e fica fora da média e da mediana.':
    'Permanences, not cards: a card that returns to a phase counts twice. Cards in the phase now show under "here now" and are left out of the mean and the median.',
  'Desconhecida é a permanência cuja entrada na fase ficou fora do detalhe guardado: ela é contada à parte, nunca como zero nem como tempo curto.':
    'Unknown is a permanence whose entry into the phase falls outside the stored detail: it is counted separately, never as zero or as a short time.',
  'Medido da criação do card até a primeira conclusão: um card concluído, reaberto e concluído de novo tem um lead time só.':
    'Measured from the creation of the card to its first completion: a card completed, reopened and completed again has a single lead time.',
  'Nenhum card foi concluído neste período.': 'No card was completed in this period.',
  'Desconhecido é o lead time de um card sem data de criação no detalhe guardado. Há dois motivos possíveis e não dá para separá-los com honestidade: o mês em que o card foi criado pode ter sido descartado, ou o card pode ser anterior ao início da série. A data não é estimada.':
    'Unknown is the lead time of a card with no creation date in the stored detail. There are two possible reasons and they cannot be told apart honestly: the month the card was created may have been discarded, or the card may predate the start of the series. The date is not estimated.',
  'Nenhum lead time foi medido neste período: não há mediana nem média para mostrar.':
    'No lead time was measured in this period: there is no median or mean to show.',
  'sem valor medido': 'no measured value',
  'Entraram na conta': 'Counted',
  Desconhecidos: 'Unknown',
  'Lead time de cada card concluído': 'Lead time of each completed card',
  'Concluído em': 'Completed on',
  '+{n} card concluído não listado': '+{n} completed card not listed',
  '+{n} cards concluídos não listados': '+{n} completed cards not listed',
  'É o padrão: os concluídos mais recentes primeiro.': 'This is the default: the most recently completed first.',
  // card 178: acabamentos de acessibilidade
  '{title}: área rolável': '{title}: scrollable area',
  'Grava ao pressionar Enter ou ao sair do campo.': 'Saved when you press Enter or leave the field.',
  // card 174: a tabela ordenável dos rankings (RankingTable, CardRanking, PhaseRanking)
  'Ordenado pela coluna "{column}", decrescente.': 'Sorted by the "{column}" column, descending.',
  'Ordenado pela coluna "{column}", crescente.': 'Sorted by the "{column}" column, ascending.',
  'É o padrão quando o período tem custo medido.': 'This is the default when the period has measured cost.',
  'É o padrão enquanto o período não tem custo medido.': 'This is the default while the period has no measured cost.',
  'Mostrar só as {n} primeiras linhas': 'Show only the first {n} rows',
  'Mostrar mais {n} linha': 'Show {n} more row',
  'Mostrar mais {n} linhas': 'Show {n} more rows',
  'outros ({n})': 'others ({n})',
  '{n} grupo além do teto de {cap} linhas não veio na lista: está somado em "outros".':
    '{n} group beyond the {cap}-row cap was not listed: it is added into "others".',
  '{n} grupos além do teto de {cap} linhas não vieram na lista: estão somados em "outros".':
    '{n} groups beyond the {cap}-row cap were not listed: they are added into "others".',
  'Execuções sem card': 'Runs with no card',
  'Fase não definida': 'Phase not defined',
  // card 175: o corte por dimensão (Breakdown); "outros ({n})" já está no bloco do card 174
  'Recortar por': 'Break down by',
  'Medida da barra': 'Bar measure',
  'Tipo de card': 'Card type',
  'Ferramenta de IA': 'AI tool',
  'Perfil de agente': 'Agent profile',
  fase: 'phase',
  'tipo de card': 'card type',
  modelo: 'model',
  'ferramenta de IA': 'AI tool',
  'esforço do modelo': 'model effort',
  'perfil de agente': 'agent profile',
  'Custo por {dim}, {period}': 'Cost by {dim}, {period}',
  'Tokens por {dim}, {period}': 'Tokens by {dim}, {period}',
  'Execuções por {dim}, {period}': 'Runs by {dim}, {period}',
  'Tempo de IA por {dim}, {period}': 'AI time by {dim}, {period}',
  outros: 'others',
  'não definido': 'not defined',
  'nome em mais de um workflow': 'name in more than one workflow',
  'custo parcial': 'partial cost',
  'tokens parciais': 'partial tokens',
  '{n} execução sem custo medido': '{n} run with no measured cost',
  '{n} execuções sem custo medido': '{n} runs with no measured cost',
  '{n} execução sem tokens medidos': '{n} run with no measured tokens',
  '{n} execuções sem tokens medidos': '{n} runs with no measured tokens',
  'estimado por tabela de preços': 'estimated from a price table',
  'parte estimada por tabela de preços: {estimated}': 'part estimated from a price table: {estimated}',
  'Fase é o nome da coluna em que o card estava no momento da chamada, congelado com a execução: mover o card depois não reescreve o passado. Uma coluna renomeada aparece com os dois nomes, como o log os guardou.':
    'Phase is the name of the column the card was in at the moment of the call, frozen with the run: moving the card later does not rewrite the past. A renamed column shows up under both names, as the log stored them.',
  '{names}: mais de um workflow tem uma coluna com este nome, e as execuções aparecem somadas numa linha só. Escolher o workflow no filtro separa.':
    '{names}: more than one workflow has a column with this name, and their runs are added up in a single row. Choosing the workflow in the filter separates them.',
  '{names}: mais de um workflow tem uma coluna com cada um destes nomes, e as execuções aparecem somadas numa linha só por nome. Escolher o workflow no filtro separa.':
    '{names}: more than one workflow has a column with each of these names, and their runs are added up in a single row per name. Choosing the workflow in the filter separates them.',
  '{months} ficou fora deste corte: só tem o total do board inteiro, sem a divisão pelo workflow escolhido.':
    '{months} is left out of this breakdown: it only has the whole-board total, with no split by the chosen workflow.',
  '{months} ficaram fora deste corte: só têm o total do board inteiro, sem a divisão pelo workflow escolhido.':
    '{months} are left out of this breakdown: they only have the whole-board total, with no split by the chosen workflow.',
  'Nenhuma categoria tem custo medido neste período, então não há barras para desenhar. Escolha outra medida ou leia os números na tabela.':
    'No category has measured cost in this period, so there are no bars to draw. Choose another measure or read the numbers in the table.',
  'Nenhuma categoria tem tokens medidos neste período, então não há barras para desenhar. Escolha outra medida ou leia os números na tabela.':
    'No category has measured tokens in this period, so there are no bars to draw. Choose another measure or read the numbers in the table.',
};
