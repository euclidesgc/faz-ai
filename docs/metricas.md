🇧🇷 Português · [🇺🇸 English](metricas_EN.md)

# Contexto, consumo e métricas

O que o Faz AI Kanban estima antes de cada execução (o contexto do card), o que mede depois (o
consumo e o inventário de cada execução) e onde esses números aparecem: a aba **Consumo** do card, o
painel **Métricas** e a ferramenta MCP `get_metrics`.

## Contexto estimado de cada card

No rodapé de cada card do board, um anel discreto mostra quanto da janela de contexto a execução do
card ocupa antes de a IA começar, com o total ao lado (por exemplo, `5,8 mil`). O clique abre o
detalhe, no formato da janela de contexto do Claude Code: o total sobre a janela do modelo do card,
uma barra por grupo e cada item, com quanto ocupa.

- **Servidores MCP.** No Claude Code, a sessão começa só com os nomes das ferramentas e as instruções
  de cada servidor (cortadas em 2.048 caracteres); as definições completas carregam quando a IA
  procura a ferramenta e aparecem à parte, como **sob demanda**, fora do total. O board mede o próprio
  servidor; os servidores que o agente libera aparecem como **não medido**, porque o board não os
  abre.
- **Agentes.** As instruções do agente da sessão e, numa história no Claude Code, o nome e a descrição
  de cada subagente (as instruções de um subagente vão para o contexto dele, não para o da sessão).
- **Rules e Skills.** As que estão no board em modo **Sempre** e as indicadas no card ou no agente,
  pelo tamanho do arquivo que a sessão lê.
- **Card.** Título e descrição, checklist, conversa, instruções e modelo da fase, e os documentos das
  fases.

### Como ler a estimativa

É uma estimativa pelo tamanho do texto (cerca de 4 caracteres por token), feita para comparar escolhas
e achar o que pesa antes de rodar: desmarcar uma skill, tirá-la do card ou trocar o agente muda o
número na hora. A estimativa acompanha o card: numa coluna em que a IA atua, ela diz a fase e soma as
instruções dela, e a conversa e os documentos entram conforme crescem. Apagar mensagens diminui só as
próximas execuções; o que já foi gasto não volta.

Ao abrir, o detalhe relê do disco os arquivos do harness: se algo mudou desde a última leitura (uma
skill global editada fora do board, por exemplo), ele avisa e já mostra os números novos; o botão
**Reler arquivos** faz o mesmo a pedido. Ficam fora da conta o prompt e as ferramentas nativas da
própria ferramenta de IA.

A janela vem do modelo do card (ou do agente): 1M no Fable 5.1, no Opus 5.5 e no Sonnet 5.5, e 200 mil
no Haiku 4.5. Sem modelo, ou com um modelo de janela desconhecida (como os do Cursor), o anel mostra
só o total. No Cursor, que não impõe o contexto vazio, o que a ferramenta carrega por conta própria
também fica de fora, e as definições das ferramentas MCP contam inteiras. O que a execução gastou de
fato aparece depois, no consumo de cada execução.

### Contexto da execução (prévia)

O bloco **Contexto da execução**, em **Consumo → Próxima execução**, mostra agente, candidatos à
delegação nativa, rules, skills e servidores MCP com todas as origens: card, agente, fase, história,
padrão ou modo Sempre. Um arquivo selecionado por várias origens aparece uma vez por identidade
(a da cópia do board, quando disponível). O bloco também aparece nos editores de agentes, com o
rascunho e os itens Sempre, sem incorporar seleções de um card.

A prévia usa o manifesto atual e não inicia uma execução nem chama IA. Ela distingue restrições
impostas pelo executor de orientações no prompt, aponta parágrafos idênticos nas instruções dos
agentes e informa que não compara o conteúdo de rules e skills. Tamanhos desconhecidos continuam
não medidos; a estimativa inicial não prevê o consumo total de uma tarefa. Essa entrega torna o
comportamento atual visível; configurações por ação e novos limites de autorização ainda não estão
ativos.

### Empréstimo do MCP por arquivo (Cursor e Kimi)

O transporte que precisa de MCP por arquivo (Cursor e Kimi) usa um empréstimo coordenado pelo
caminho real. O diário protegido em `~/.faz-ai/mcp-leases` precede a alteração; tentativas de
formato reutilizam a mesma posse. Ao terminar com confirmação, o arquivo volta ao estado anterior,
preservando servidores acrescentados pela pessoa. Alterações conflitantes da entrada `faz-ai` ou JSON
inválido não são sobrescritos. Quando a CLI sai, o board encerra o que ela deixou no grupo de processos
(o `cursor-agent` deixa um `worker-server` com servidores de linguagem, que viveria minutos) e espera
até 5 s pelo fim do grupo. Sem confirmação do fim da árvore de processos, o empréstimo fica
retido e uma nova execução no mesmo arquivo é recusada. O launcher recebe o comando da CLI somente
depois de sua identidade ser gravada no diário. Na abertura, um dono comprovadamente morto permite
recuperar preparações sem comando liberado e grupos registrados cujo término foi confirmado.
Diários antigos ou ambíguos permanecem retidos. O Windows ainda não tem confirmação de árvore nesse
transporte; esse caso exige reconciliação. Isso não comprova isolamento da CLI nem conclui #729.

### Snapshot dos arquivos da execução

No host, runner e chat publicam os arquivos selecionados da biblioteca em
`run-artifacts/<boardId>/<runId>`, com revisão e SHA-256. Prompts e diretórios extras passam a usar
essa cópia. Atualizar ou apagar o artefato ou seu cache não regrava o snapshot; uma falha de
materialização obrigatória impede o processo. O schema 38 acrescenta revisões monotônicas aos
artefatos. Snapshots publicados são preservados, inclusive em runs inconclusivos; ainda não há coleta
automática. Isso congela os arquivos referenciados pelo prompt; sessões MCP controladas também usam
a cópia, conforme descrito abaixo. Fontes externas legadas e a resolução v1 completa ainda não foram
ativadas na E5.

### Orquestração local

A fundação local da orquestração usa `ai_work` e `ai_work_attempts` (schema 39), com posse por
unidade, gerações, hash do token, identidade do processo e contagem de mutações. Essas tabelas não
são exportadas; importar não cria posses e é recusado enquanto houver trabalho local em execução ou
reconciliação. O flush do banco sincroniza o arquivo antes da troca atômica e o diretório nos
sistemas POSIX. Uma trava por pasta real, compartilhada entre processos, só libera um escritor
depois da confirmação do grupo; adotar uma reserva de um host morto não a libera automaticamente.
Regras puras calculam rodadas, reconciliação e limites solicitados/efetivos. A ligação aos gatilhos
continua pendente; esta base não altera quem executa as sub-tarefas nem comprova isolamento de uma
CLI.

Execuções controladas agora têm identidade MCP por tentativa: o host injeta `FAZAI_RUN_TOKEN` apenas
no ambiente da ponte, que envia um prefácio consumido pelo transporte antes do protocolo MCP. Cada
chamada valida dono, geração e revogação; mutações recebem o run autenticado e são contadas.
`get_skill`, `get_agent`, `get_board_artifact` e `read_rule_file` usam o snapshot capturado, e o
encaminhamento externo fixa os servidores selecionados e suas operações. Sessões externas continuam
disponíveis, mas não assumem um card reservado pelo board. O runner aceita identidade e orientação do
orquestrador, sem concluir a unidade apenas por código zero. Essa API ainda não está ligada aos
gatilhos: a ativação automática, a persistência anterior à liberação da CLI e #824/#825 continuam
pendentes.

O gateway também aceita um registro assíncrono de identidade (`beforeStart`): o launcher aguarda sua
conclusão antes de receber o comando. Falha, cancelamento ou revogação durante a espera impedem
liberação tardia. O transporte medido preserva a identidade e a confirmação de término para a
reconciliação. O Orchestrator descrito a seguir já liga esse ponto ao flush e à posse da pasta por um
UnitStarter injetado; os gatilhos de produção continuam pendentes.

O `Orchestrator` já oferece `drive`, continuação de rodadas, reconciliação na abertura, varredura e
cancelamento, com um `UnitStarter` injetado. Ele sincroniza a preparação e a identidade antes de
liberar a CLI, confirma o grupo de processos e grava o resultado antes de liberar a trava. A
referência à pasta permanece persistida até a liberação física ser confirmada, inclusive após queda
nesse intervalo; a importação também respeita essa reserva. Testes com processos Node, ponte MCP e
banco em disco cobrem três filhas em sequência, fechamento único, trabalho parcial, cancelamento com
descendente e reinício real do controlador. A criação no host e a ligação aos gatilhos continuam
pendentes, assim como os ciclos de devolução humana e a associação estável da Fase. Isso ainda não
ativa o plano v1 nem valida CLIs reais de IA.

## Aba Consumo do card

O card aberto tem a aba **Consumo**, que junta as duas contas:

- **Próxima execução**: a mesma estimativa do anel do board, com a fase, o modelo e o detalhe por
  grupo.
- **Gasto até agora**: o que a ferramenta mediu no fim de cada execução do card, uma linha por fase
  (Discovery, PRD, Spec…), com execuções, tempo, tokens de entrada, de saída, de leitura e de escrita
  de cache, e o total. Numa história, as execuções das sub-tarefas entram numa linha à parte e no
  total. A fase é a coluna em que o card estava quando a execução rodou.

O gasto é histórico e só cresce: apagar mensagens da conversa, desmarcar uma skill ou trocar o agente
diminui as próximas execuções (a estimativa), nunca o que já foi gasto. Uma execução sem medição conta
nas execuções e aparece como **não medido**, nunca como zero; uma execução em andamento entra quando
termina, e a aba se atualiza sozinha. As execuções de meses que passaram da retenção do detalhe ficam
só nos totais mensais do board e a aba avisa até quando. Como no resto do board, o consumo é em
tokens, sem custo em dólar.

## Consumo e inventário de cada execução

Cada vez que a IA roda (pela conversa, pelo heartbeat ou pelo modo autônomo), o board registra no
banco o que a execução consumiu: tokens de entrada, de saída, de leitura de cache e de criação de
cache, o número de turnos e o id da sessão da ferramenta. Registra também o **inventário** do que a
IA usou: ferramentas nativas, ferramentas de MCP (com o servidor de cada uma), subagentes e skills,
com a contagem de chamadas.

- **O consumo é medido em tokens e, com a regra "Mostrar custo em dólar" ligada, também em dólar.** As
  duas ferramentas informam os tokens: no Claude Code, entrada, saída, leitura e criação de cache, por
  modelo, com os subagentes; no Cursor, os mesmos quatro contadores. Só o Claude Code informa também o
  custo em dólar. Quando a ferramenta não informa, o board estima o custo pelo preço por milhão de
  tokens que a pessoa cadastrou para o modelo no catálogo (`upsert_model`, ou a tela de Modelos), bucket
  por bucket (entrada, saída, leitura e criação de cache); o preço vale da próxima execução em diante, e
  um bucket com tokens e sem preço deixa o total estimado em branco. O custo informado pela ferramenta
  sempre vale mais que o estimado. A regra **Mostrar custo em dólar** (`showCost` em `update_rules`)
  vem ligada; desligada, o dólar some (quem usa assinatura costuma preferir só tokens), mas os dados
  seguem gravados. Onde aparecer "não medido" é isso, falta de medição, e nunca consumo zero.
- **Toda execução passa por uma única porta.** O executor de cards (manual, heartbeat e modo
  autônomo) e o chat do board chamam a IA pelo mesmo ponto do código (`AiGateway`), que abre a linha
  no log antes de rodar, fecha com o desfecho e grava o consumo. Cada ferramenta tem um provider
  próprio, que monta o comando e lê a saída. Uma terceira forma de chamar a IA não existe sem passar
  por ali, e um teste falha se algum arquivo tentar. O que fica de fora do registro, por natureza, é
  o que você roda direto no terminal ou no chat da própria ferramenta, sem o board.
- **No canal de log** (**Saída → Faz AI**), a saída da ferramenta aparece em linhas legíveis, e no fim
  de cada execução vem uma linha de resumo com entrada, saída, leitura e criação de cache e turnos,
  por exemplo `Consumo: 1.250 entrada · 3.400 saída · 52.000 leitura de cache · 9.100 criação de
  cache · 8 turnos`. Os turnos ficam de fora quando a ferramenta não os informa.
- **A execução que cai antes do primeiro evento não é repetida.** O board pede a saída estruturada à
  ferramenta e só repete a chamada em modo texto, uma vez e com as mesmas restrições, quando a
  ferramenta recusa um desses argumentos antes de começar (versão antiga da CLI). Qualquer outra
  falha antes do primeiro evento (rede, cota, login, queda, saída truncada) termina como falha, com o
  consumo "não medido": a ferramenta pode ter alterado arquivos ou mexido no board antes de cair, e
  repetir duplicaria o efeito e o consumo. O card bloqueado e o erro do chat avisam que a execução não
  foi repetida, e a linha "Chamando…" do canal diz a tentativa e o id da execução.
- **O Gemini nos três modos.** Cada execução guarda o modo em que rodou (CLI, ACP ou API), e o
  Consumo separa os três pelo corte **Modo da ferramenta**. Na CLI os tokens vêm do `stream-json`, por
  modelo; no ACP, do `usage` que o agente informa a cada turno; na API, do `usageMetadata` de cada
  pedido, somados na execução. Nenhum dos três informa custo em dólar. Quando a cota da API do Gemini
  esgota, nos três modos, a execução termina com o limite de uso: o board não repete às cegas, e a
  pausa do perfil (ou a política de execução com a falha _quota_) decide o que vem depois, como no
  Claude Code (ver [automação](automacao.md)). A execução que esbarrou no limite antes de responder
  fica "não medida".
- **Perguntas no chat do board** também entram no registro, sem card associado.
- **O detalhe de cada execução é guardado por uma janela que você configura**, de 1 a 24 meses (o
  mês corrente mais os anteriores). O padrão é 6 meses. Depois da janela o detalhe é descartado, mas
  os **totais por mês nunca expiram**. Antes o prazo era 12 meses; o padrão menor mantém o arquivo do
  banco dentro do limite de tamanho. Onde ajustar, e o que acontece ao baixar a janela, está em
  [Painel de métricas](#painel-de-métricas), no bloco **Detalhe guardado**.

## Painel de métricas

O botão **Métricas**, o quarto da navegação do topo (Board, Métricas, Lixeira, Configurações), mostra
o que o board registrou sobre o trabalho e o uso da IA. Funciona no editor e também no board aberto
pelo navegador.

### Filtros e totais

- **Filtros.** O período pode ser Hoje, 7 dias, 30 dias, Este mês, Últimos 12 meses, Tudo ou um
  Intervalo livre (data inicial e final). O filtro **Workflow** restringe os números a um workflow, e
  **Limpar filtros** volta ao padrão. Abaixo dos controles o painel escreve o período consultado.
- **Quatro totais.** Atividades concluídas (cards que chegaram a uma coluna de conclusão), execuções
  de IA, tokens e tempo de IA. O **tempo de IA é a soma da duração de cada execução**:
  execuções simultâneas somam, então o total pode passar do tempo decorrido no relógio. O que não
  foi medido aparece como "não medido", nunca como 0, e quando só parte das execuções foi medida o
  aviso diz quantas ficaram de fora.
- **Execuções acima do limite de consumo.** Uma execução que lê mais de 10 milhões de tokens de
  cache passa do limite: o total **Execuções de IA** mostra "{n} acima do limite de consumo" e, ao
  fim da execução, a conversa do card recebe um aviso com o consumo e a duração. O limite é fixo e o
  alerta não interrompe nada. Sem tokens medidos (Cursor) não há alerta, e meses arquivados não contam.
- **Tokens.** Os tokens contam em todas as execuções medidas, do Claude Code e do Cursor, e o aviso
  diz quantas ficaram sem medição. Antes de o board medir consumo, tokens e inventário aparecem
  como "não medido" e quase todo lead time como desconhecido: é o comportamento esperado, não falha.

### Consumo

- **Tokens por mês.** Gráfico de barras com os tokens de cada mês. O mês em andamento aparece com
  hachura, porque ainda não terminou; um mês sem nenhum dado é um espaço marcado "sem dado", não uma
  barra de altura zero. Abaixo do gráfico fica uma tabela com os mesmos números e uma coluna de
  observação (parcial, sem dado, só total mensal).
- **Onde o consumo aconteceu.** O consumo do período repartido por **fase, tipo de card, modelo,
  ferramenta de IA, modo da ferramenta, esforço ou perfil** (seletor **Recortar por**), em barras
  horizontais na medida escolhida em **Medida da barra**: tokens, execuções ou tempo de IA. O **modo da
  ferramenta** é como o board falou com ela (CLI, ACP ou API): o mesmo Gemini mede de formas
  diferentes em cada modo, e a linha da ferramenta soma os três. Execuções anteriores ao registro do
  modo (e os meses arquivados antes dele) aparecem como "não definido". Ao lado fica a tabela com
  as três medidas. As categorias além do limite somam numa linha "outros". Alcança a série inteira
  do período, inclusive os meses já arquivados.
- **Fases mais caras e Cards mais caros.** Dois rankings lado a lado, em tabelas que você ordena por
  tokens, execuções ou tempo de IA clicando no cabeçalho (ou com Enter/Espaço). O padrão são os
  tokens quando o período tem tokens medidos e o tempo de IA quando não tem, e a tela escreve o
  critério em vigor. As fases alcançam a série inteira; os cards, só o detalhe guardado, e cada bloco
  avisa isso.
- **O que a IA usou.** Ferramentas, ferramentas de MCP (com o servidor em coluna própria), subagentes
  e skills, com o número de execuções e de usos. "Ainda não medido" (nenhuma execução gravou
  inventário) é diferente de "nenhum registro no período".

### Tempo e qualidade

- **Quanto tempo o card fica na fase.** Uma linha por fase com as permanências, a mediana, a média,
  as desconhecidas e quantos cards estão nela agora. São permanências, não cards: um card que volta
  para a fase conta duas vezes. É tempo de relógio, diferente do tempo de IA do corte por fase.
- **Lead time.** Da criação do card até a **primeira** conclusão, dos cards concluídos no período: a
  mediana em destaque, a média, quantos entraram na conta, quantos ficaram desconhecidos e a lista por
  card, ordenável. Desconhecido é o card cuja data de criação não está no detalhe guardado (o mês foi
  descartado ou o card é anterior ao log); a data não é estimada.
- **Retrabalho.** O sinal de qualidade que o consumo e o tempo não mostram: quantas revisões a IA pediu
  em cada fase, quantas a pessoa aprovou **de primeira** (a primeira resposta a um card naquela fase
  foi a aprovação) e quantas voltaram com **pedido de ajuste**, também pelo modelo da execução que pediu
  a revisão, e quantas histórias concluídas no período já têm um **Bug vinculado**. Só conta a resposta
  de uma pessoa: a aprovação automática do modo autônomo não é revisão. Por isso o bloco traz também
  os **sinais da IA**, medidos sem revisão de pessoa: **correções na Revisão** (commits em execuções
  da fase Revisão), **`npm test` com falha** e **commits depois do pull request**, no resumo e por
  fase, cada um com a parte feita em execuções do modo autônomo; a linha de bugs diz quantas das
  histórias concluídas foram autônomas. São aproximações (commit ≈ correção), valem só para o Claude
  Code desde o registro de comandos de Bash, e a fase Revisão é reconhecida pelo nome. Sem execução
  com registro de Bash no período, o sinal fica "não medido", não zero.

### Retenção e avisos

- **Detalhe guardado.** Mostra a janela de retenção do detalhe das execuções e quanto espaço ela
  ocupa. Dá para configurá-la de 1 a 24 meses (padrão 6). Aumentar grava na hora. **Baixar pede
  confirmação**, que diz quantos meses perdem o detalhe, e o descarte só acontece na próxima abertura
  do board. Os totais por mês continuam. O campo grava ao pressionar Enter ou ao sair dele. Os tempos
  e o inventário leem só o detalhe guardado: um mês descartado sai desses blocos.
- **Avisos de honestidade**, sempre junto do número: desde quando o log do board existe (antes disso
  não há dado, o número não está pequeno); o aviso de que o período pedido foi cortado no início do
  log; e os meses que só têm o total mensal (entram na série, mas sem corte por dimensão nem detalhe
  por card). Com um workflow filtrado, um mês consolidado antes de o log guardar o workflow fica de
  fora dos números, e o aviso diz isso.

## Métricas de uso com get_metrics

Durante a conversa de um card, a IA pode consultar estatísticas agregadas do histórico do board (uso,
duração e tokens das execuções) sem precisar abrir nenhum painel. Chame a ferramenta `get_metrics` em
linguagem natural: "quanto tempo de IA o card #72 consumiu?", "qual tipo de card consome mais este
mês?", "qual agente foi usado mais?". A ferramenta responde em uma tabela compacta, otimizada para
economizar tokens.

- A agregação pode agrupar por fase (`phase`), tipo de card (`card_type`), ferramenta de IA
  (`tool`), modo da ferramenta (`mode`: `cli`, `acp` ou `api`), modelo (`model`), esforço (`effort`),
  perfil (`profile`), card (`card`), agente (`agent`),
  skill (`skill`), ferramenta usada (`used_tool`), ferramenta de MCP (`mcp_tool`) ou comando de Bash
  (`bash_command`). Omita para obter apenas o total do período.
- `tool` e `used_tool` não são a mesma coisa: `tool` é a ferramenta de IA que rodou (claude, cursor);
  `used_tool` e `mcp_tool` são o que a execução usou (Read, Bash, `get_card`). Em `mcp_tool` o
  servidor vem numa coluna própria, ou "servidor não registrado" quando o nome não o trouxe.
  `bash_command` é o comando-base de cada chamada de Bash, sem argumentos (`npm test`, `git status`,
  `cat`), só do Claude Code.
- Filtros de período (data inicial e final, em `AAAA-MM-DD`), card (ex. `72` ou `#72`), e dimensões
  (ex. fase, modelo, tipo de card).
- Nas dimensões **agent**, **skill**, **used_tool**, **mcp_tool** e **bash_command** a tabela mostra
  só a contagem de execuções e de usos (sem tokens, que não é possível repartir entre componentes de
  uma execução). `effort`, `profile` e `mode` têm tokens.
- Tokens contam em toda execução medida, do Claude Code e do Cursor. Com a regra "Mostrar custo em dólar" ligada, a tabela ganha a coluna `custo` e, abaixo dela, a linha do estimado pelo preço do catálogo (só sem filtro de card, fase, tipo, modelo ou ferramenta); desligada, não traz dólar.
- Os tempos do painel (permanência por fase e lead time) não estão no `get_metrics`. O retrabalho está:
  com `rework: true` (e, se quiser, `start_date` e `end_date`), a resposta traz as revisões, as
  aprovações de primeira e os pedidos de ajuste por fase e por modelo, as histórias concluídas com bug
  vinculado e os sinais da IA (correções na Revisão, `npm test` com falha, commits depois do PR), cada
  um com a parte do modo autônomo; "não medidos" quando não há execução com registro de Bash.
- Valores não medidos aparecem como "-" (nunca 0).
- Sempre informa desde quando o histórico do board existe e quais períodos têm apenas totais mensais
  (sem detalhe por execução). Períodos fora da janela de retenção (6 meses por padrão) não têm
  detalhe e só agregam os totais já consolidados.
