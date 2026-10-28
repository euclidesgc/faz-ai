🇧🇷 Português · [🇺🇸 English](fluxo_EN.md)

# Fluxo da história com a IA

Este é o manual detalhado de como uma história anda pelo board com a IA: o que cada fase pede, como
você responde no card, o que os botões de IA fazem e como os cards se relacionam.

## Para que serve

- **Planejar em fases.** As colunas das histórias são as fases do fluxo: Backlog, Discovery, PRD,
  Spec, Plan, Implementação, Revisão, Homologação, Concluído e Cancelado. Cada história se desdobra em
  sub-tarefas, que têm um fluxo próprio (A fazer, Em andamento, Concluído).
- **Dizer à IA o que fazer em cada fase.** Cada coluna tem uma instrução para a IA e, se a fase gera
  um documento (Discovery, PRD, Spec, Plan), o modelo desse documento. No Discovery a IA analisa o
  problema e conversa com você antes de qualquer requisito; na Homologação a história só é concluída
  com a sua aprovação. O Discovery registra um **Mapa do código** (arquivos, funções, padrões e
  testes), a Spec o completa, e PRD, Spec e Plan partem dele e leem só o que falta; cada sub-tarefa do
  Plan traz na descrição os arquivos que vai tocar.
- **Trabalhar com a IA no mesmo quadro.** A extensão expõe o board por MCP. Claude Code, Cursor ou
  outro cliente MCP podem consultar e editar tudo o que a interface permite, e as mudanças aparecem
  no board na hora.
- **Saber com quem está cada card.** Todo card em que a IA atua tem um status (Pronto, Em execução,
  Aguardando resposta, Aguardando revisão, Aprovado, Bloqueado) que mostra se a pendência está com
  você ou com a IA.
- **Revisar antes de a IA avançar.** Nas colunas que exigem aprovação (Discovery, PRD, Spec, Plan e
  Homologação, por padrão), a IA termina o trabalho, pede a revisão e para. Ela só move o card depois
  que você aprova.
- **Ver o que espera por você.** O filtro "Com você", o contador no ícone da barra lateral e um aviso
  do editor mostram quando a IA pede revisão, faz uma pergunta ou trava num impedimento. A IA, por
  sua vez, pergunta ao board o que está com ela.
- **Dizer à IA como executar cada card.** Cada card pode indicar o modelo, o nível de esforço e as
  skills obrigatórias. O modelo pode ser sugerido por regras a partir do tamanho da tarefa.
- **Decidir antes o que a IA usa.** Um agente define as skills, os servidores MCP, as ferramentas e o
  modelo de cada fase ou card, em vez de a ferramenta descobrir sozinha durante a conversa. Toda
  execução pelo board roda através de um agente.
- **Um harness só do board.** Regras, skills, subagentes e servidores MCP vivem numa biblioteca
  guardada no banco do board, no modo de cada um (Sempre, Pelo card ou Desligado). O board não varre
  as pastas das ferramentas de IA nem grava nelas: só lê o que você importa. Plugins, hooks e
  permissões da ferramenta não aparecem na tela de Harness; a conexão com o board fica em **Conectar
  ao board**.

## O fluxo sugerido

Abra uma sessão nova da ferramenta na pasta do projeto e peça, por exemplo, "liste os cards do
board", "pegue a história #1 e escreva o PRD" ou "veja o que está pendente no board e dê andamento".

A IA lê a história e a instrução da fase, cria uma sub-tarefa para construir o documento da fase,
anexa o documento à história e pede a revisão pela conversa do card. Você responde no próprio card:

- **Aprovar** leva o card para a próxima coluna na hora (o status recomeça lá, Pronto para a IA). Só
  fica Aprovado, para a IA mover, quando o board não pode: a aprovação que faz o merge automático
  conclui o card depois do merge, e a conclusão recusada por sub-tarefa em aberto deixa o aviso na
  conversa.
- **Pedir ajustes** devolve o card para a IA com o seu texto na conversa.
- Se a IA fizer uma pergunta, o card fica Aguardando resposta; ao responder na conversa, ele volta
  para a IA.
- **Bloquear** registra um impedimento, com o motivo.

Quais colunas exigem aprovação, e em quais a IA atua, se define em Configurações → Workflows e
colunas. Você mesmo pode mover qualquer card sem aprovação.

### Perguntas com opções

Quando a IA precisa de uma decisão com alternativas, ela registra as perguntas no card
(`ask_questions`), cada uma com opções curtas e a indicada, e explica os detalhes na descrição. O
card fica em **Aguardando resposta**. As respostas ficam na seção **Perguntas e respostas** da
descrição; responder de novo a mesma pergunta substitui a resposta anterior. No modo autônomo, o
board responde cada pergunta com a indicada, registra na mesma seção e a IA segue o trabalho. A
pergunta aberta, sem opções, continua sendo `ask_question`.

As perguntas com opções aparecem no card aberto, abaixo da descrição, num carrossel: uma pergunta
por vez, com o contador **{n} de {total}** e a opção indicada marcada com o selo **Indicada**. Clicar
numa opção grava a resposta e avança; para escrever uma resposta própria, use o campo da própria
pergunta. **Anterior** e **Próxima** voltam e avançam. A última tela é o resumo, com as perguntas não
respondidas; **Enviar respostas** grava tudo na seção **Perguntas e respostas** e devolve a vez para
a IA.

## O que cada fase entrega

As instruções e os modelos de documento do board padrão pedem, em cada fase, o que deixa a revisão
do código rápida depois:

- **Trilha curta para histórias pequenas.** Com a regra ligada (Configurações → Regras; desligada
  por padrão), uma história de esforço **Baixo** ou do tipo **Bug** aprovada no Discovery, ou levada
  adiante pelo autopiloto, vai direto ao Plan, sem PRD nem Spec, e o Plan parte do DISCOVERY. A regra
  lê o esforço e o tipo atuais a cada avanço: se o Discovery descobre que a história é maior do que
  parecia, a IA sobe o esforço e a história segue a trilha completa. Para forçar a trilha completa
  numa história pequena, arraste-a (ou peça à IA que a mova com `move_card`) para o PRD ou a Spec: o
  movimento explícito nunca é redirecionado. As colunas puladas são reconhecidas pelo documento que
  produzem (PRD.md e SPEC.md), então renomeá-las não desliga a regra.
- **Spec com o desenho do programa.** Além da arquitetura, a Spec traz os tipos e as assinaturas
  novos ou alterados, o arquivo de cada um e quem chama quem no caminho principal, com o fluxo da
  funcionalidade em diagramas Mermaid. As alternativas descartadas vêm com o motivo de cada uma.
- **Plan com partes fáceis de revisar.** Cada sub-tarefa é a menor parte da entrega que se
  verifica sozinha (teste, typecheck, comando ou tela). O board as executa uma por vez, cada uma numa
  execução nova da IA: as partes pequenas da mesma área e do mesmo agente se juntam, e a separação vem
  quando o agente muda ou a parte é grande o bastante para ser revisada sozinha. Recortar por camada
  vale quando cada camada se verifica sozinha, e a documentação pequena vai com a última sub-tarefa de
  código. O plano estima as linhas de código da entrega: acima de umas 400, a IA deixa na
  história a primeira parte e cria as seguintes como **histórias derivadas**, em ordem (`create_card`
  com `derived_from` apontando para a parte anterior). A branch de cada derivada parte da branch da
  parte anterior e o pull request dela é empilhado sobre o dela; o card mostra **Derivada de #N**. Se
  a parte anterior ainda não tem branch, a derivada espera por ela antes de criar a sua.
- **Revisão antes do pull request.** Depois da Implementação, a coluna **Revisão** roda as checagens
  do projeto (typecheck, lint, testes e build, como o projeto os define) e revisa o diff da história
  com um olhar independente: delega ao agente `revisor-de-codigo`, numa sessão nova, quando ele está
  entre os agentes do board. Além dos defeitos, a revisão procura o código que só passa no teste
  (teste novo que já passava antes da mudança, teste alterado junto com o código que ele cobre,
  try/catch que engole erro, cast forçado, acoplamento novo). O que tem diretriz clara é corrigido na
  hora; o que é ambíguo ou muda o comportamento combinado vira pergunta para você, e a IA para. A
  coluna não pede aprovação: o resultado fica na conversa e entra no **Como revisar** do PR.
- **Pull request que explica a entrega.** Na Homologação, o corpo do PR traz o **Objetivo**, **O que
  foi feito**, **Como revisar** (por onde começar a ler, a ordem dos commits e o tamanho do diff), as
  **Decisões** (por que o caminho escolhido, as alternativas descartadas e os desvios do plano) e o
  roteiro **Como testar**.

**Caminho curto para histórias pequenas.** Crie a história direto na coluna em que ela deve começar
(o **+** no topo de cada coluna) ou arraste-a para lá, por exemplo para o Plan. A IA começa dali: sem
os documentos das fases anteriores, trabalha a partir da descrição, da conversa e do código, e o
`get_card` diz quais documentos não existem para ela não os criar nem bloquear por falta deles. Na
Implementação, uma história sem sub-tarefas ganha uma a partir da descrição.

Boards criados antes recebem os textos novos pelo **Atualizar board** (Configurações), só nas colunas
que ainda têm o texto padrão anterior: o que você personalizou fica como está. O fluxo que a IA lê é
o texto atual do board, pelo MCP: não depende de reinstalar nada.

## Chat com a IA

![Chat com a IA: pergunta e resposta usando o board](images/chat.png)

Para dar ordens ao board em linguagem natural, use o **Chat**: na barra lateral do editor, a seção
**Chat com a IA** (abaixo de Board e Filtros); no navegador, o botão **Chat** do topo, que abre um
painel à direita. Escreva, por exemplo, "crie uma história Login com Google e três sub-tarefas" ou
"o que está esperando por mim?". A IA do projeto responde e age pelas ferramentas do board: cria,
move e vincula cards, e consulta o que há nele. Abaixo do campo você escolhe o **modelo e o esforço**
das próximas mensagens (a escolha fica lembrada). Enter envia, Shift+Enter quebra a linha, **Parar**
interrompe e **Limpar** apaga a conversa. O histórico fica guardado por projeto.

O chat usa a mesma execução em segundo plano dos cards, então vale o limite de Configurações →
Automação → "O que a IA pode fazer" (por padrão, só o board) e o tempo limite de lá.

## Trabalhar na fase e Refinar com IA

O card tem dois botões que chamam a ferramenta do projeto em segundo plano. Não é um chat ao vivo: a
resposta chega como mensagem na conversa quando a execução termina, e enquanto isso o card fica "Em
execução" (com um botão **Parar**). Os botões mostram um hint explicativo (com negrito e tópicos) ao
passar o mouse ou focar com o teclado; o hint abre por hover e por foco de teclado, fecha com Esc, e
continua visível mesmo quando o botão está bloqueado.

- **Trabalhar na fase** faz o trabalho da coluna em que o card está, o mesmo que o heartbeat faria:
  em Discovery analisa o problema, em PRD escreve o PRD, em Implementação escreve o código (se a
  permissão deixar). Lê a conversa e responde a ela, e termina passando a vez: pede revisão, faz uma
  pergunta, bloqueia ou move o card. Se Tags, Esforço da atividade, Modelo e Skills estiverem todos
  vazios, ela os preenche antes. Fica no cabeçalho do card e na conversa.
- **Enviar**, na conversa, grava a mensagem e chama a IA para respondê-la ou fazer o que ela pede,
  sem trabalhar a fase além do pedido. Vale com o card **bloqueado**, aguardando resposta ou revisão:
  a mensagem da pessoa devolve a vez à IA (o card volta para "Pronto"), e se ainda faltar uma decisão
  dela, a IA pergunta ou bloqueia de novo. Numa história parada por uma sub-tarefa, a história é onde
  se destrava: o bloqueio dela diz o que a sub-tarefa pede, a IA responde e devolve a sub-tarefa à
  fila (`release_card`), e o board a executa de novo, o que também acontece quando a pessoa responde
  na própria sub-tarefa. Com outra execução da mesma história em curso, a mensagem só fica na
  conversa. A resposta não conta como volta sem progresso no modo autônomo.
- Enquanto a IA trabalha no card (ou, numa história, numa sub-tarefa dela), o **Enviar** vira **Parar**:
  interrompe a execução e o card volta ao status que tinha. Um card que ficou "Em execução" sem nenhuma
  execução da IA passa para a pessoa, com o motivo, e a mensagem dela devolve a vez à IA.
- **Refinar com IA** só deixa o card claro e completo para quem vai trabalhar nele: reescreve título
  e descrição (sem inventar requisito; o que estiver ambíguo vira uma lista "Dúvidas em aberto"),
  revisa Tags, Esforço da atividade, Modelo e Skills mesmo que já tenham valor e acrescenta ao
  checklist os passos que faltam. Não trabalha a fase, não cria sub-tarefas, não move o card e não
  mexe em arquivos: roda só com o board. Não guarda o texto anterior da descrição: ela é reescrita.
  No fim, resume na conversa o que mudou e por quê, e o card volta ao status que tinha, também quando
  a execução falha: a falha fica na conversa, sem bloquear o card. Um refino não conta como execução
  sem progresso para o modo autônomo.

Imagens coladas na mensagem ou na descrição do card viram anexos dele e a IA as recebe.

### Resumir a conversa

**Resumir a conversa**, na aba Conversa, aparece a partir de 2 mensagens: lê a conversa inteira e
grava um resumo (Decisões, Observações, Pendências) como uma mensagem nova da IA (`kind: "summary"`),
sem apagar nada automaticamente, sem trabalhar a fase, mover o card ou mudar o status. Roda só com o
board, sempre na faixa de modelo "Alto" (independente do Esforço do card). O resumo **desativa** as
mensagens anteriores: a IA passa a receber a conversa a partir do último resumo (`comments` do
`get_card`), o resumo ganha destaque na tela e as mensagens anteriores ficam esmaecidas. Você revisa
o resumo como revisa qualquer mensagem: concorda deixando como está ou edita o texto. Qualquer
mensagem pode ser apagada por você; logo abaixo do resumo, o botão **Apagar mensagens resumidas**
apaga, com confirmação, todas as anteriores a ele; resumir de novo cria um registro novo, sem
substituir o anterior. O [heartbeat](automacao.md) resume sozinho a conversa que cresceu. Está
disponível também como ferramenta MCP (`generate_summary`), com o mesmo resultado.

Sem resumo, a IA lê só as **últimas 20 mensagens** da conversa, e o `get_card` avisa quantas ficaram de
fora (`omittedBefore`). Com resumo, ela lê o resumo e, se a conversa passar de 20 mensagens, as últimas
19 depois dele. Assim uma conversa longa não cresce no contexto de cada execução. A aba **Conversa** segue
mostrando tudo.

### Permissão, ferramenta e falhas

- O que a IA pode fazer nessas execuções se define em Configurações → Automação → **Execução pela
  IA**: só o board (padrão), board e arquivos do projeto, ou sem restrições. O nível em uso
  aparece ao lado do botão, com um atalho para mudar. A IA é avisada do limite: se o trabalho pedir
  mais do que o nível permite, ela bloqueia o card dizendo qual opção escolher.
- O Cursor aceita os três níveis: em "só o board" e "board e arquivos" a sessão dele recebe só as
  ferramentas do nível (leitura e MCP; leitura, MCP e edição), sem terminal.
- A ferramenta precisa estar instalada e autenticada. A CLI não precisa estar no PATH: o board a
  procura também nas pastas de instalação usuais e dentro das extensões do editor (quem só usa a
  extensão do Claude Code já tem o executável). A do Cursor é a `cursor-agent` (o instalador de
  `curl https://cursor.com/install -fsS | bash` cria também o atalho `agent`); entre na conta uma vez
  com `cursor-agent login`.
- Com o Claude Code, o servidor do board vai na linha de comando de cada execução: não depende de
  instalar o MCP nem da aprovação do `.mcp.json`. Com o Cursor, o board usa o registro global do
  `~/.cursor/mcp.json` quando ele leva a este board; sem ele (ou numa worktree fora da pasta do
  projeto), grava o servidor no `.cursor/mcp.json` antes de rodar (e põe o arquivo no
  `.git/info/exclude` quando o cria). Nas outras ferramentas, instale antes.
- Quando a história tem pasta de trabalho própria (worktree), a ferramenta recebe essa pasta junto
  com a do projeto, inclusive o Cursor.
- Parar e o tempo limite encerram a ferramenta e tudo o que ela iniciou (servidores MCP, testes,
  comandos). O Claude Code não roda "sem restrições" como root (contêineres, WSL como root): o board
  avisa. Sem Node.js no PATH, o servidor do board roda com o runtime do próprio editor.
- Se a execução falhar ou passar do tempo limite, o card fica Bloqueado com o motivo e o fim da saída
  da ferramenta. O log completo está no painel **Saída → Faz AI** (ou no terminal do `faz-ai`).

### Trabalhar na fase pela API

Com o Gemini no modo **API** ([detalhes](harness.md#o-gemini-pela-api)) não há agente da ferramenta: o
modelo pede e o **board** executa no seu computador, só o que o nível de permissão libera.

| Permissão            | O que o modelo recebe do board                                                     |
| -------------------- | ---------------------------------------------------------------------------------- |
| **Só o board**       | o servidor do board e os MCPs do card, mais ler (`read_file`), achar arquivos (`glob`) e buscar texto (`grep`) |
| **Board e arquivos** | o mesmo, mais criar ou sobrescrever (`write_file`) e trocar um trecho (`edit_file`) |
| **Sem restrições**   | o mesmo, mais rodar um programa (`run_command`)                                    |

- As ferramentas usam os nomes do card: `read_file` é **Read**, `glob` é **Glob**, `grep` é **Grep**,
  `write_file` é **Write**, `edit_file` é **Edit** e `run_command` é **Bash**. Uma ferramenta que o
  agente do card nega não chega ao modelo, em nenhum nível. A negação vale sem diferenciar maiúsculas
  e por grupo: negar **Read** tira também **Glob** e **Grep**; negar **Edit** ou **Write** tira as duas
  de escrita; negar **Bash** tira o comando. Os nomes do Gemini CLI (`run_shell_command`, `replace`,
  `write_file`…) também valem. Um nome negado que o board não reconhece faz a execução não partir, com
  o nome na causa. A lista de ferramentas do agente vai pelo
  pedido, e a conferência acusa o que o modelo usou fora dela (por exemplo, **Write** num agente que
  não a lista, com a permissão **Sem restrições**).
- Os caminhos ficam presos à pasta do projeto e à pasta de trabalho da história: `..`, um caminho
  absoluto fora delas e um link simbólico que sai delas são recusados, e a recusa volta ao modelo
  como erro, sem gravar nada. O `.git` e os arquivos do board nunca são lidos nem escritos, e a
  configuração das ferramentas de IA e do editor não é escrita, em qualquer pasta: `.claude`,
  `.cursor`, `.kimi-code`, `.gemini`, `.agents`, `.opencode`, `opencode.json`, `.codex`, `.qwen`,
  `.goose`, `.github/hooks`, `.github/copilot`, `.vscode`, `.devcontainer`, `.mcp.json` e
  `*.code-workspace`. As pastas de credenciais da sua conta (`~/.ssh`, `~/.gnupg`, `~/.aws`,
  `~/.faz-ai`) ficam de fora. No macOS e no Windows essas listas não diferenciam maiúsculas (`.SSH` é
  o `.ssh`), e no Windows um caminho com nome curto (`~`), fluxo (`:`) ou trecho terminado em ponto ou
  espaço é recusado. O padrão de `glob` é casado sem expressão regular, então um padrão do modelo não
  trava o editor.
- O comando roda **sem shell**: o programa e os argumentos vão separados, e pipe, `&&` e `$VAR` não
  são interpretados (para isso, o modelo precisa chamar o shell como programa, o que só vale em
  **Sem restrições**). Ele roda numa pasta do card, sem a chave da API nem variáveis com cara de
  segredo no ambiente, por até 2 minutos (o modelo pode pedir até 10). A saída longa guarda o começo e
  o fim.
- Ler, buscar e gravar têm limite de tamanho, e a busca com expressão regular tem limite de tempo: o
  resultado cortado vem com aviso.
- **Parar** cancela o pedido ao modelo e encerra o comando em curso com tudo o que ele iniciou.
- O canal **Saída → Faz AI** mostra cada chamada com a ferramenta e o caminho (ou o programa), sem o
  conteúdo dos arquivos nem os argumentos do comando.

## O board no dia a dia

1. Abra uma pasta no editor e clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu
   board.
2. Crie histórias com **+ Novo card** e arraste-as entre as colunas. Ao arrastar, os outros cards se
   afastam com uma animação suave e um espaço tracejado mostra onde o card vai ficar; ao soltar, ele
   assenta direto no lugar, sem piscar. Clicar numa história mostra só as sub-tarefas dela; duplo
   clique abre o detalhe.
3. No detalhe do card ficam o status, a descrição em Markdown, os campos, o checklist, as
   sub-tarefas, a conversa e os anexos. A conversa é o lugar em que você e a IA falam sobre o card. Os
   documentos das fases (PRD, Spec, Plan…) são construídos nas sub-tarefas, mas ficam anexados à
   história; nas sub-tarefas eles aparecem como links.
4. Busque por texto ou pelo ID (`#12`). A seção **Filtros** da barra lateral filtra por tipo, campos,
   datas e relacionamentos.

![Card aberto: status, aprovação, campos, descrição e checklist](images/card.png)

Nada acontece em silêncio: toda ação que vai ao board espera a confirmação e mostra que está
trabalhando. Uma barra fina no topo acende enquanto qualquer pedido está em andamento; o card que
está sendo movido, arquivado, mudando de status ou de título esmaece e ganha um spinner na faixa (no
board e no card aberto); o botão clicado (criar card, enviar mensagem, aprovar, restaurar…) e a linha
afetada (item de checklist, vínculo, campo) mostram a espera no lugar; e o que troca o board inteiro
(recriar, importar um backup, esvaziar a lixeira) fica atrás de um véu. Um campo de texto só limpa
quando o host confirma: se a ação falhar, o aviso aparece e o que você escreveu fica.

Por padrão, uma história não é concluída nem avança de fase enquanto tiver sub-tarefas em aberto
daquela fase. Essas regras podem ser desligadas nas configurações. A fase da sub-tarefa é o campo
**Fase**, que a IA preenche ao criá-la: no card aberto ele aparece só para leitura e não vira padrão
do tipo de card.

No topo do board, **N com você** mostra quantos cards esperam revisão, resposta ou desbloqueio (um
clique filtra só eles), e um indicador aparece enquanto a IA trabalha em algum card.

### O card no board

Cada card tem uma barra na cor do tipo, com o ID, o tipo e os botões de abrir e de ações. Abaixo vêm
o título (inteiro no tooltip, se não couber), o status com um ícone de com quem está a pendência
(robô para a IA, pessoa para você) e há quanto tempo ele está assim, os campos, o modelo de IA (ex.:
"Sonnet 5.5 - baixo") e, no rodapé, os contadores, a branch e o PR. Cards com pendência sua ganham a
borda na cor do status, e o LED da barra diz o estado do card de relance: verde piscando devagar
enquanto a IA trabalha nele (na história, também quando ela trabalha numa sub-tarefa), amarelo quando
ele espera por você, vermelho quando está bloqueado e apagado quando não há nada acontecendo. Na
história, a lista de sub-tarefas mostra o mesmo LED em cada uma: verde piscando em execução, vermelho
bloqueada, amarelo esperando a pessoa e apagado parada.

**Cards colapsados.** Você pode colapsar cards para enxergar mais linhas de uma coluna na mesma tela.
Um card colapsado mantém a faixa colorida do tipo (com o LED da IA, o número, o tipo e os botões) e
mostra o título em até duas linhas, escondendo o resto; a borda de status continua (se o card espera
por você), para você varrer o board de relance e saber o que precisa de atenção. O colapso pode ser
aplicado em quatro escopos: um card isolado (botão no próprio card), todos os cards de uma coluna
(item no menu de ações da coluna), todos os cards do board (botão na barra de filtros) ou só os cards
selecionados (botão na barra de seleção múltipla). O estado fica lembrado entre sessões.

### Seleção múltipla

**Selecionar todos de uma coluna.** A caixa no início do cabeçalho de uma coluna de histórias, na
mesma linha das caixas dos cards (ou **Selecionar todos**, no menu ⋯), marca as histórias visíveis da
coluna (o filtro ativo vale); marcada de novo, limpa a seleção. Numa coluna sem cards, a caixa fica
oculta, mas o espaço dela continua reservado. Com a seleção feita, o mesmo menu oferece **Arquivar
selecionados**, **Mover selecionados para...**, **Concluir selecionados** e **Mandar selecionados para
a lixeira**, cada uma com uma confirmação só para o lote; **Limpar seleção** desmarca tudo. A seleção
vale para uma coluna por vez: marcar um card de outra coluna substitui a seleção. Na ação em lote,
uma história com sub-tarefa em aberto não é concluída (as outras seguem), e mover para uma coluna de
cancelamento cancela as sub-tarefas em aberto.

**Ações sobre a seleção.** A barra de seleção múltipla (dois ou mais cards) e o menu ⋯ da coluna
oferecem as mesmas ações: **Aprovar**, **Bloquear**, **Desbloquear**, **Trabalhar na fase**, **Refinar
com IA**, **Parar a IA**, modo autônomo, colapsar/expandir, arquivar, mover, concluir e lixeira. As
ações indisponíveis continuam visíveis e desabilitadas, sem mostrar o motivo; no menu, isso também
vale sem seleção. Cada ação atinge só os cards elegíveis e visíveis. Aprovar vale para quem aguarda
revisão e usa o avanço automático da aprovação individual; bloquear pede um motivo obrigatório,
registrado na conversa de cada card; desbloquear devolve os bloqueados para **Pronto**. Trabalhar e
refinar respeitam as vagas de execução em paralelo: quem já está em execução ou não cabe no limite
fica de fora. **Parar a IA** interrompe só execuções iniciadas pelo board.

### Arquivados, lixeira e duplicar

Cards podem ser arquivados (menu de ações do card → **Arquivar**) ou enviados para a **Lixeira**, de
onde podem ser restaurados. Os arquivados saem das linhas do board e ficam na aba **Arquivados**
(entre Métricas e Lixeira), que preserva o histórico: uma linha por workflow, na ordem do board, do
mais recente ao mais antigo.

- **Restaurar** devolve o card ao fim da primeira coluna do workflow dele (Backlog / A fazer no board
  padrão), inativo. Restaurar uma história traz também todas as sub-tarefas arquivadas dela e desliga
  o modo autônomo; restaurar uma sub-tarefa cuja história está arquivada pede confirmação e restaura
  a história inteira (uma sub-tarefa de história ativa volta sozinha, sem confirmação).
- A aba tem uma barra de filtros própria, que não muda o filtro do board: busca por texto (título,
  descrição, conversa, campos e `#número`), tipo, campos de opção (como Tags) e período de
  arquivamento. O contador mostra os filtros ativos, e **Limpar filtros** os desfaz; ao sair e voltar,
  a aba abre limpa. Cada linha mostra 50 cards por vez, e **Mostrar mais** traz os seguintes.
- Clicar numa história arquivada a seleciona: a linha de Sub-tarefas passa a mostrar só as
  sub-tarefas arquivadas dela, mesmo as que não batem no filtro. Clicar de novo, ou em **Limpar
  seleção**, desfaz a seleção. Abrir o card continua listando todas as sub-tarefas.
- Para agir sobre vários de uma vez, marque os cards arquivados que quiser: **Selecionar todos os
  visíveis** marca só os que os filtros mostram. **Restaurar** em massa segue a mesma regra do
  individual (uma história volta com as sub-tarefas arquivadas dela, e uma sub-tarefa cuja história
  está arquivada traz a história inteira), e **Enviar para a lixeira** em massa leva junto as
  sub-tarefas arquivadas de cada história. Toda ação em massa pede confirmação, dizendo quantos cards
  serão afetados e o que vai junto. Excluir definitivamente continua só pela Lixeira.

**Seleção múltipla na lixeira.** Na lixeira, marque cards um a um ou use **Selecionar todos** no
cabeçalho da tabela; a caixa fica em estado parcial quando só alguns estão marcados. Com ao menos um
card marcado, aparece a barra com a contagem e as ações **Restaurar** e **Apagar de vez**, que valem
para a seleção inteira. Restaurar segue direto; apagar de vez pede uma única confirmação para o lote.
**Limpar** desmarca tudo. Restaurar ou apagar um card leva junto as sub-tarefas dele que estão na
lixeira. **Esvaziar lixeira** continua como estava e não depende da seleção.

**Duplicar card** (menu de ações do card aberto) cria outro card a partir dele, um por vez. O título
ganha o prefixo "Cópia de"; a descrição, o tipo, os campos e o checklist (desmarcado) são copiados, e
o card novo vai para o fim da primeira coluna do workflow, sem confirmação. Sub-tarefas, anexos,
comentários e vínculos não são copiados. Não há duplicação em massa: na seleção de vários cards, a
opção não aparece.

## Vínculos entre cards

Além das sub-tarefas, qualquer card pode ser vinculado a outro, de qualquer workflow, em **Vínculos**
no card aberto (como em Kanbanize ou Businessmap): **pai**, **filho** ou **relativo**. Busque o outro
card pelo número ou título e escolha o tipo do vínculo. O rodapé do card no board mostra o vínculo e,
se há filhos, quantos já estão encerrados. O vínculo repetido e o que fecharia um ciclo (o pai já ser
filho do card) são recusados.

Um pai vinculado segue a regra de Configurações → Regras: quando o último filho em aberto entra numa
coluna de conclusão, o board pergunta (ou move sozinho, conforme a regra) se o pai também vai para a
conclusão. A IA usa as ferramentas `link_cards` e `unlink_cards`, e o `get_card` devolve os vínculos.

A seção **Vínculos** também mostra, só para exibição, a relação de sub-tarefa: numa sub-tarefa, um
grupo "Pai" com a história; numa história, a contagem de sub-tarefas com um atalho até a seção
**Sub-tarefas**. Essa relação é somente leitura (sem botão de remover) e não entra na regra de
conclusão acima, que continua valendo só para o vínculo manual de pai/filho.

### Dependência e ordem das sub-tarefas

Um card pode **depender** de outro: em **Vínculos**, escolha "precisa terminar antes deste card" (o
outro é pré-requisito) ou "só começa depois deste card". O card aberto mostra os grupos **Depende
de** (com quantas dependências ainda estão em aberto) e **Libera**. O board recusa ciclo de
dependência.

A IA usa isso para ordenar a Implementação. No Plan ela declara a ordem entre as sub-tarefas
(`create_card` com `depends_on`, ou `link_cards` com `depends_on`): uma depende da outra quando usa o
que ela produz ou quando as duas alteram os mesmos arquivos. Na Implementação, o `get_card` da
história devolve em `subtasksNow` o que o **board executa** (`byBoard`, na ordem) e o que espera
(`waiting`).

Na fase de código quem executa as sub-tarefas é o board, não a sessão da história: cada uma roda numa
execução própria da CLI, com o agente, o modelo e as skills do card dela, **uma depois da outra** na
pasta da história (um escritor por vez), respeitando as dependências; a sessão da história só as cria
e para. O ciclo de cada sub-tarefa cabe em duas chamadas: `start_work` já a leva para "Em andamento"
e `move_card` com `comment` conclui e registra o resultado; no Plan, `create_card` já recebe o agente
(`profile`) e o checklist e devolve o card resumido. `start_work` recusa a sub-tarefa que ainda espera
outra. Sem dependências declaradas, todas as sub-tarefas em aberto são consideradas independentes.
Quando todas terminam, o board chama a IA uma vez para o fechamento: verificar o conjunto, fazer o
commit e mover a história.

Nenhuma execução delega a subagentes da ferramenta (no Claude Code, `Agent` — antes `Task` — fica
negada; no Cursor e no Kimi Code, sem bloqueio comprovado, a capacidade fica "desconhecida" e a
admissão decide). Em **Configurações → Automação** (e em `fazai.git.parallelSubtasks`, de 1 a 6)
a pessoa define **"Sub-tarefas em paralelo por história"**; a tela mostra o pedido e o efetivo (hoje
1). O texto do fluxo é o atual do board, servido pelo MCP; uma cópia da skill do fluxo já instalada
na pasta da ferramenta não é substituída pelo board. Para a ferramenta não carregar o texto antigo
por conta própria, apague essa cópia.
