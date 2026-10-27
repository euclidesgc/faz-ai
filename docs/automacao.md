🇧🇷 Português · [🇺🇸 English](automacao_EN.md)

# Heartbeat e modo autônomo

O board tem dois automatismos: o **heartbeat**, um relógio que arruma o board e chama a IA nos cards
prontos, e o **modo autônomo (YOLO)**, em que a IA toca uma história de ponta a ponta sem pedir
aprovação. Este documento descreve os dois em detalhe; o fluxo de uma história está em
[fluxo.md](fluxo.md).

## Heartbeat

Com o heartbeat ligado (Configurações → Harness), o board chama a IA sozinho a cada intervalo,
enquanto o editor estiver aberto na pasta do projeto. O heartbeat em si não depende da IA: é um
relógio do board que, a cada rodada, primeiro arruma o board e depois decide o que a IA faz.

### O que cada rodada faz

- **Devolve para a IA** os cards bloqueados por limite de uso da ferramenta (o limite renova
  sozinho), com um aviso na conversa, e **avisa uma vez** o card que está com você há dois dias ou
  mais.
- **Respeita a pausa por limite de uso, perfil a perfil**: quando um perfil de CLI esgota o limite do
  plano e nenhuma política de execução oferece outro destino, o card volta para a IA e a fila daquele
  perfil pausa, no heartbeat, no autopiloto e no orquestrador, até a renovação que a saída informou
  (mais 3 minutos); sem horário, a espera é de 5 minutos e dobra a cada nova falha, até 60. Os outros
  perfis seguem, o log da rodada diz qual perfil espera e até que horas, e o topo do board mostra uma
  linha por perfil ("Limite de uso do Claude Code: a fila dele retoma às 13:53."). Vencida a pausa, a
  primeira execução automática do perfil é o teste. Com política de fallback, a execução segue no
  destino dela. A pausa fica gravada no board (sobrevive a reabrir o editor); a execução pedida à mão
  continua liberada e, terminando bem, encerra a pausa. No Gemini, nos modos CLI, ACP e API, a
  renovação vem do erro da API: a cota diária renova à meia-noite do horário do Pacífico (a regra da
  API do Gemini), e o limite por minuto (429 `RESOURCE_EXHAUSTED`) traz a espera no `retryDelay`, uma
  pausa curta; sem nenhum dos dois, vale o backoff.
- **Confere os pull requests** de toda história que tem um (detecção automática de merges) e limpa
  as branches e worktrees que sobraram (branches e worktrees órfãs).
- **Sincroniza as branches locais** que o board conhece (a principal, a `develop` e a branch de cada
  história em aberto) com o origin, para a próxima tarefa partir da base mais recente e a IA
  encontrar a branch da história em dia. Só por **fast-forward**: a branch anda só quando está atrás
  do origin e não tem nenhum commit que o origin não tenha. Nada é mesclado com commit, reescrito nem
  forçado. Uma branch fica como está quando há uma execução da IA na história dela (ou na pasta em
  que ela está aberta), quando essa pasta tem alterações ou arquivos não rastreados, ou quando a
  branch está à frente do origin ou divergiu dele. Cada branch atualizada, e cada motivo de pulo (uma
  vez por motivo), aparece no log com o prefixo `Branches:`. As suas branches pessoais não são
  tocadas. Sem rede ou sem origin, a sincronização fica para a próxima rodada.
- **Confere o conflito com a base antes do PR**: para cada história com branch e ainda sem pull
  request, pergunta ao git, só lendo (`git merge-tree`, git 2.38 ou mais novo; abaixo disso, a
  conferência é pulada com uma linha no log), se a branch conflita com a base atual no origin. Se
  conflita, avisa na conversa uma vez por commit da branch, com os arquivos, para a IA atualizar a
  branch e resolver antes de abrir o PR. Nada muda no card nem nas branches.
- **Resume a conversa** das histórias com três ou mais mensagens desde o último resumo, ou duas que
  somem muito texto (ao menos uma da IA), antes de trabalhar a fase; a IA passa a receber só o resumo
  e o que vier depois dele.
- **Refina os cards novos do Backlog** (**Refinar os cards novos do Backlog**, nas mesmas
  configurações; nasce ligado): a partir do título, a IA melhora a descrição, preenche modelo,
  skills, rules e checklist e deixa o card aguardando a sua revisão. Aprovar leva o card para a
  primeira fase.
- **Trabalha nos cards prontos** e responde às mensagens pendentes, com uma execução por história. Um
  card aprovado vai para a próxima coluna em "Pronto" na hora, mas o trabalho da fase começa na
  rodada seguinte, se houver vaga (com o heartbeat desligado, aprovar chama a IA na hora). Ao
  terminar a fase, a IA deixa o card aguardando a sua revisão ou a sua resposta.

### Ordem da rodada e fila

- A rodada tem uma ordem fixa: a arrumação (limite de uso, cards parados); um `git fetch` só; os pull
  requests (uma história mesclada perde a branch, então vem antes da sincronização); a sincronização
  das branches; as órfãs e as versões publicadas; e, por último, a fila da IA, que espera a
  sincronização terminar para partir das branches já atualizadas. O número de histórias da rodada sai
  na hora, mesmo assim. Essa manutenção (consultas ao GitHub e ao git, sem IA) roda em paralelo até
  **quatro** tarefas ao mesmo tempo. É um limite fixo e próprio do heartbeat, que não é o **Tocar
  histórias em paralelo** nem o **Histórias ao mesmo tempo**: esses continuam valendo só para as
  execuções da IA. Com duas janelas no mesmo board, só a dona faz a manutenção.
- Sem pendência com a IA, nada é executado, e o log (Saída → Faz AI) diz o motivo: login vencido,
  história em modo autônomo, execução em andamento, com a pessoa ou esperando outro card. Com
  pendência, o log diz quantas histórias estão com você e o que a IA vai fazer em cada uma (fase,
  refinar, resumir).
- A fila da rodada segue a ordem do board: os bugs primeiro; depois a história mais à direita (a mais
  adiantada termina antes de uma nova começar); na mesma coluna, de cima para baixo. O que decide é a
  posição do card, não o número dele nem o que já foi aprovado.
- Cards que estão com você (aguardando revisão ou resposta, bloqueados) não são tocados, a menos que
  você tenha deixado uma mensagem sem resposta na conversa.
- As execuções usam a mesma permissão e o mesmo tempo limite do botão "Trabalhar na fase".

Quais colunas exigem aprovação, e em quais a IA atua, se define em Configurações → Workflows e
colunas. Você mesmo pode mover qualquer card sem aprovação.

### Execuções em paralelo

As atividades **sem branch** (refinar, resumir e as fases que só produzem documento, como Discovery,
PRD, Spec e Plan no board padrão; vale a coluna que tem artefato antes da fase de código) rodam ao
mesmo tempo em qualquer modo de workspace, até **Histórias ao mesmo tempo** (duas por padrão, até
seis), mesmo com **Tocar histórias em paralelo** desligado. As atividades **com branch**
(Implementação e Homologação) seguem o limite de antes: uma por vez fora do worktree.

No modo "Worktree por história", **Tocar histórias em paralelo** (Configurações → Harness ›
Ferramenta e execução; nasce desligado) faz o heartbeat tocar várias histórias com branch ao mesmo
tempo, cada uma na sua pasta de trabalho, até o mesmo **Histórias ao mesmo tempo**. Os dois tetos
(texto e branch) contam separados; cada um conta toda execução em andamento, inclusive as chamadas à
mão. No modo autônomo (cujas histórias são empilhadas), a ordem da fila vale para as histórias que
precisam de branch; uma história em fase de texto começa assim que há vaga, mesmo com a anterior
ainda aberta.

Fora do worktree, o `prepare_workspace` chamado numa fase de texto enquanto outra história tem
execução em andamento é recusado (pasta em uso): a branch nasce na fase de código. Em permissão "Sem
restrições" a IA ainda pode trocar de branch à mão; a guarda cobre só o caminho do board.

A descrição de cada campo de Git em Configurações explica o motivo em cada modo: com branch na
própria pasta, duas histórias ao mesmo tempo trocariam a branch uma debaixo da outra e misturariam
alterações; com worktree elas ficam isoladas, ao custo de mais uma cópia dos arquivos em disco por
história (com as dependências instaladas em cada uma) e de mais memória e processador enquanto
várias sessões de IA, testes e builds rodam juntos. Esses campos são os mesmos no editor e no
navegador.

### Controles e indicadores

- **Rodar o heartbeat agora** (nas configurações ou pelo comando **Faz AI: Rodar o heartbeat
  agora**) começa uma rodada na hora, mesmo com o heartbeat desligado. **Faz AI: Parar as execuções
  da IA e o modo autônomo** interrompe tudo.
- A barra de atividade no pé do board (visível em qualquer vista) mostra o que a IA está fazendo
  agora: com uma execução, "IA em #12 (Discovery, há 3 min)", com a referência do card clicável para
  abri-lo; com várias, "IA em N cards: #12 Discovery · #15 refinando · …" e a lista completa no
  tooltip. Sem nenhuma execução, mostra o motivo: a nota do autopiloto (por que a fila parou), o
  estado do heartbeat ("Heartbeat desligado", "Heartbeat parado: motivo", "Próxima rodada às
  HH:MM") ou, por fim, "IA parada".
- O **coração** no topo direito do board mostra o heartbeat: vermelho e batendo quando ele está
  rodando; cinza e parado quando está desligado ou não consegue rodar (sem ligação com o Faz AI ou
  sem a ferramenta). Clicar nele liga e desliga o heartbeat.

## Modo autônomo (YOLO)

Uma **história** pode ser marcada como **YOLO**: no painel do card, ligue **Modo autônomo**, ou
clique no ícone do modo no rodapé do cartão, sem abrir o card (para várias de uma vez, marque as
histórias e use a barra de seleção). O board pede uma confirmação, porque o modo abre mão de toda
aprovação; marque **Não avisar novamente** no aviso para ligar direto nas próximas vezes. Desligar
uma história não pede confirmação. A partir daí a IA toca a história sozinha, **sem pedir
autorização nem confirmação para nada**.

### Até onde

O aviso de ligar traz o seletor **Até onde**, com as fases em que a IA atua a partir da coluna atual
da história; o padrão é a última, a **Homologação (abre o pull request)**, que é o modo completo
descrito abaixo. Escolha uma fase antes, como o Plan, e a IA segue sozinha até ela: faz o trabalho
dessa fase, pede a sua revisão e o modo se desliga, com um aviso na conversa. Para ela seguir sozinha
dali, ligue o modo de novo. Com o modo ligado, a barra do card mostra **Modo autônomo até [fase]**, e
trocar a fase ali não pede confirmação. O seletor começa na última fase que você escolheu, e com
**Não avisar novamente** marcado o modo liga direto até ela. Na barra de seleção, o seletor só
oferece as fases que valem para todas as histórias marcadas. A IA lê o ponto de parada em
`autonomousUntil` no `get_card`, e na fase de parada `phase.requiresApproval` vem verdadeiro.

### Como a IA se comporta

- **Do Backlog até a última coluna em que a IA atua** (Homologação, no board padrão): ela faz o
  Discovery, o PRD, a Spec e o Plan, cria as sub-tarefas, implementa uma por uma, revisa e, nessa
  última coluna, abre o pull request, registra com `set_pull_request` e para ali. A história fica
  aguardando a sua revisão. As colunas que exigem aprovação deixam de segurar o card, e o pedido de
  revisão da IA vira aprovação na hora, com o resumo registrado na conversa. Nada segura a história
  antes da coluna escolhida: nem uma pendência (`request_review` com `pending`, que fica registrada
  na conversa e a IA é mandada decidir).
- **Sem perguntas**: a IA não usa `ask_question`; diante de uma dúvida ela decide e registra a
  decisão e o motivo na conversa. `ask_questions` é aceita: o board responde cada pergunta com a
  indicada e a registra na seção **Perguntas e respostas** da descrição. Só um impedimento real
  (acesso, ambiente, falha que ela não resolve) bloqueia o card.
- **Conversa resumida entre as fases**: ao passar para outra coluna com três ou mais mensagens desde
  o último resumo (ou duas que somem muito texto; ao menos uma da IA), o autopiloto roda **Resumir a
  conversa** antes da fase nova: as mensagens anteriores ao resumo ficam na conversa, mas
  desativadas (a IA recebe só o resumo e o que vier depois), para o contexto de cada execução não
  carregar a conversa inteira. Um resumo por coluna; se a IA não gravar o resumo, a conversa fica e
  a fase segue.
- **Pelos padrões do projeto**: como ninguém revisa as decisões do meio do caminho, a IA segue os
  padrões e as regras de arquitetura do projeto (`CLAUDE.md`, `AGENTS.md`, `DESIGN.md` e o código
  parecido que já existe) e, entre os caminhos que os seguem, escolhe o menos complexo.
- **Sem merge**: a IA para na última coluna em que atua, com o pull request aberto; o merge e o
  avanço até Concluído continuam sendo seus. Concluído quer dizer mergeado.
- **Sem restrições**: nas execuções do modo, a IA roda com a permissão "Sem restrições" (altera
  arquivos e roda comandos), porque precisa de git e do `gh`. Ligar o modo é aceitar isso para a
  história.
- **Dividir um pedido grande**: a IA pode criar as histórias seguintes a partir de uma história em
  modo autônomo (`create_card` com `autonomous_from`). Elas nascem em modo autônomo, entram na fila e
  ganham um vínculo **relativo** com a história de origem (pulado em silêncio se já existir qualquer
  vínculo entre as duas). Ela nunca liga o modo numa história que você não ligou.

### Fila e pilha de PRs

O **autopiloto** toca as histórias em modo autônomo uma de cada vez, na ordem do board (bugs na
frente, depois a mais à direita, e na mesma coluna de cima para baixo), corrigida pelas
precedências: uma história que depende de outra da fila (vínculo **depende de**, inclusive por uma
sub-tarefa) ou derivada dela vem depois, por mais acima que esteja no board.

Com o modo ligado, cada história que espera a vez mostra no card o selo **Fila N** (1 = a próxima); o
número some quando a IA começa nela, quando ela passa para você e quando ela é concluída, e pausar o
modo apaga todos. O autopiloto segue para a próxima história da fila assim que a atual é entregue
(parada na última coluna da IA, com o pull request registrado), sem esperar a sua revisão nem o
intervalo do heartbeat.

Nenhum impedimento segura a fila: uma história bloqueada, esperando a sua resposta, esperando outro
card terminar (dependência) ou travada num ciclo (aberta, mas sem nada pendente com a IA) é pulada,
e a vez passa para a próxima história da fila que puder avançar: rodar, ou mudar de coluna quando a
IA não atua nela. Uma história que depende de outra continua esperando essa outra terminar, mesmo
com histórias mais abaixo na fila passando na frente dela; ela volta a disputar a vez quando a
dependência sai de aberto. Só quando nenhuma história da fila pode avançar o autopiloto mostra o
aviso de impedimento, com a razão da primeira história parada.

A branch de cada história parte da branch criada mais recentemente entre as outras histórias do modo
autônomo ainda abertas (a mesma ordem em que a fila roda, mesmo depois de arrastar cards), e o pull
request é aberto com `--base` nela, formando uma pilha de PRs; sem nenhuma outra história aberta
antes dela, a branch parte da principal. Uma história cuja anterior na pilha já teve o pull request
mesclado também parte da principal, já que o código dela já está lá.

**Freios.** O autopiloto continua **uma história por vez**: a história destravada volta para a
posição que ocupa no board e espera a que estiver em execução terminar. Uma execução que falha deixa
o card Bloqueado, com o motivo, e o disjuntor bloqueia a história depois de 3 execuções seguidas sem
avanço; bloquear uma história libera a fila para seguir com a próxima, em vez de travá-la (histórias
que emperram podem gastar até 3 execuções cada, em todas da fila). Ao destravar o card, ele continua
sozinho.

### Botão do modo autônomo e comandos

O **botão do modo autônomo** no topo do board existe sempre que há história em aberto e diz o que o
clique faz:

- **Ligar modo autônomo** (nenhuma história no modo): depois da confirmação com o "Até onde", põe no
  modo todas as histórias ainda não concluídas (ou só as selecionadas, quando há seleção), que entram
  na fila e são tocadas cada uma na sua vez, respeitando os tetos de execuções em paralelo.
- **Pausar modo autônomo** (aceso, com o autopiloto tocando): pausar interrompe a IA.
- **Retomar modo autônomo** (apagado, pausado): com histórias em aberto ainda fora do modo, também as
  põe no modo antes de retomar, com a mesma confirmação.

Pelo editor: **Faz AI: Pausar o modo autônomo (YOLO)**, **Faz AI: Retomar o modo autônomo (YOLO)** e
**Faz AI: Parar as execuções da IA e o modo autônomo**.

Ao abrir o editor, o autopiloto liga sozinho quando há história pendente em modo autônomo, a não ser
que você tenha pausado: a pausa fica gravada no board (sobrevive a reabrir o editor), e "Retomar", ou
ligar o modo numa história, a limpa; fechar o editor não conta como pausa. Depois de uma falha ao
iniciar a ferramenta de IA, o autopiloto não religa sozinho até você retomar. Com o login da
ferramenta vencido, o autopiloto e o heartbeat esperam o login voltar, sem gastar execuções. O
heartbeat não toca histórias em modo autônomo; elas são do autopiloto.

## Card preso em "Em execução"

Um card só fica "Em execução" enquanto há uma sessão de IA nele. Se a sessão que o marcou acabou sem
passar a vez (a janela do editor fechou com a IA rodando, a sessão da história terminou com uma
sub-tarefa marcada por `start_work`, uma sessão fora do board caiu), o board o devolve para Pronto:
na abertura, os cards das execuções que a sessão anterior deixou abertas (e as sub-tarefas deles);
ao fim da sessão de uma história, as sub-tarefas dela; e, a cada minuto, qualquer card "Em execução"
sem execução do board há mais tempo que o limite de uma execução (Configurações → Harness → tempo
máximo), com a explicação na conversa.
