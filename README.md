🇧🇷 Português · [🇺🇸 English](README_EN.md)

<img src="media/icon.png" width="96" alt="Ícone do Faz AI Kanban">

# Faz AI Kanban

> ⚠️ **O Faz AI está em fase alpha.**
>
> O projeto é novo e muda rápido: telas, comandos e o formato do board ainda podem mudar. Revise o
> que a IA fizer antes de aprovar. Se algo quebrar, [conte numa issue](https://github.com/euclidesgc/faz-ai/issues).

> **Obrigado a quem está baixando e testando.**
>
> Publiquei a extensão e, no dia seguinte, ela já tinha 160 downloads. A cada pessoa que deu uma
> chance a um projeto recém-nascido: muito obrigado. O Faz AI é **totalmente gratuito e open source**
> (licença MIT); contribuições são bem-vindas. — Euclides G Catunda

Gostou? Ajude o Faz AI a crescer:

- ⭐ **Dê uma estrela** no [repositório do GitHub](https://github.com/euclidesgc/faz-ai).
- 💬 **Avalie a extensão** no [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=euclidesgc.faz-ai&ssr=false#review-details)
  ou no [Open VSX](https://open-vsx.org/extension/euclidesgc/faz-ai/reviews) (a loja do Cursor).
- 🐞 Bug ou ideia? [Abra uma issue](https://github.com/euclidesgc/faz-ai/issues/new?template=bug.yml)
  ou [conte uma sugestão](https://github.com/euclidesgc/faz-ai/issues/new?template=sugestao.yml).

Um board kanban dentro do editor (VS Code e Cursor), feito para conduzir Spec-Driven Development
(SDD) junto com uma IA. Você organiza o trabalho em histórias e sub-tarefas; a IA lê o board, produz
os artefatos de cada fase e move os cards conforme avança.

![Board com histórias nas fases do SDD e sub-tarefas no workflow de baixo](docs/images/board.png)

## Primeiros passos

1. **Instale e abra.** Instale **Faz AI Kanban** no VS Code ou no Cursor, abra a pasta do projeto e
   clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu board, já com as fases do fluxo.
2. **Conecte a IA ao board.** Em **Configurações → Harness**, escolha a ferramenta (Claude Code,
   Cursor ou Kimi Code) e, na aba **Projeto**, clique em **Instalar (padrão da ferramenta)** em
   **Servidores MCP**.
3. **Crie a tarefa.** Na coluna **Backlog**, clique em **+ Novo card**, escreva o título e dê Enter.
   Duplo clique abre o card para descrever o que você quer.
4. **Deixe a IA começar.** Arraste o card para **Discovery** e clique em **Trabalhar na fase**. A IA
   analisa o problema e conversa com você na aba **Conversa**; ao terminar, o status muda para
   **Aguardando revisão**. Se ela precisar de uma decisão sua, a pendência aparece como **Travado em mim**.
5. **Revise e siga.** Leia o documento da fase e clique em **Aprovar** (ou **Pedir ajustes**). A
   história avança por **PRD**, **Spec**, **Plan** e **Implementação**, sempre com a IA produzindo e
   você aprovando.

No topo, **N com você** mostra o que espera por você, e o **Chat** deixa você pedir à IA, em
linguagem natural, para criar e mover cards.

## Como funciona

- **Fases do fluxo.** As colunas das histórias são Backlog, Discovery, PRD, Spec, Plan,
  Implementação, Revisão, Homologação, Concluído e Cancelado. Cada coluna tem uma instrução para a
  IA. Sub-tarefas têm fluxo próprio.
- **Aprovação por fase.** Em Discovery, PRD, Spec, Plan e Homologação (por padrão), a IA termina,
  pede revisão e para. Ela só move o card depois que você aprova.
- **Status e "com você".** Todo card em que a IA atua tem um status (Pronto, Em execução, Aguardando
  resposta, Aguardando revisão, Aprovado, Bloqueado). O filtro **Com você** e o contador na barra
  lateral mostram quando a IA pede revisão, pergunta ou trava.
- **Cada card é uma sessão nova e curta.** A IA abre o card pelo board (`get_card`), faz aquele
  trabalho e para. O histórico fica no card, não na janela de contexto.
- **Contexto controlado.** Toda execução pelo board começa sem regras, skills, agentes, hooks ou
  plugins que você não tenha marcado em **Harness**. PRD, Spec e Plan ficam anexados à história, e a
  IA os lê só quando precisa.
- **Artefatos e agentes definidos no Harness.** Rules, skills, subagentes e servidores MCP vivem numa
  biblioteca do board, no modo **Sempre**, **Pelo card** ou **Desligado**. Um agente libera só o que
  precisa, e toda execução pelo board roda por um agente.
- **Modelo por card.** Cada card pode indicar o modelo, o nível de esforço e as skills obrigatórias;
  regras de sugestão evitam o modelo mais caro onde o mais leve basta.

## Como usar

1. Abra uma pasta no editor e clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu board.
2. Crie histórias com **+ Novo card** e arraste-as entre as colunas. Clicar numa história mostra só
   as sub-tarefas dela; duplo clique abre o detalhe.
3. No card aberto ficam o status, a descrição em Markdown, os campos, o checklist, as sub-tarefas, a
   conversa e os anexos.
4. Busque por texto ou pelo ID (`#12`). A seção **Filtros** da barra lateral filtra por tipo, campos,
   datas e relacionamentos.
5. Cards podem ser arquivados (menu de ações → **Arquivar**) ou enviados para a **Lixeira**. A aba
   **Arquivados** guarda o histórico com filtros próprios, e **Restaurar** devolve o card à primeira
   coluna do workflow dele. Na lixeira, dá para marcar vários cards e **Restaurar** ou **Apagar de vez** o lote.
6. **Duplicar card** (menu de ações do card aberto) cria outro card com o prefixo "Cópia de", copiando
   descrição, tipo, campos e checklist. Sub-tarefas, anexos, comentários e vínculos não vão junto.

No board, cada card mostra o tipo, o título, o status com quem está a pendência (robô ou pessoa), o
modelo de IA, a branch e o PR. Um LED diz o estado de relance: verde com a IA trabalhando, amarelo
esperando por você, vermelho bloqueado.

![Card aberto: status, aprovação, campos, descrição e checklist](docs/images/card.png)

**Cards colapsados e seleção múltipla.** Você pode colapsar um card, uma coluna, o board inteiro ou
só os selecionados para ver mais linhas na mesma tela. A caixa no cabeçalho de uma coluna (ou **Selecionar todos** no menu ⋯) marca as
histórias visíveis dela. Sobre a seleção valem **Aprovar**, **Bloquear**, **Trabalhar na fase**,
**Refinar com IA**, **Parar a IA**, arquivar, mover, concluir e lixeira, com uma confirmação só para o lote.

### Vínculos entre cards

Qualquer card pode ser vinculado a outro, de qualquer workflow, em **Vínculos** no card aberto:
**pai**, **filho** ou **relativo**. O rodapé do card mostra o vínculo e quantos filhos já estão encerrados. Quando o último filho
em aberto é concluído, o board pergunta (ou move sozinho, conforme Configurações → Regras) se o pai
também vai para a conclusão. A IA usa `link_cards` e `unlink_cards`, e o `get_card` devolve os vínculos.

Um card também pode **depender** de outro; o card aberto mostra **Depende de** e **Libera**. A IA usa
isso na Implementação: no Plan ela declara a ordem entre as sub-tarefas (`create_card` ou `link_cards`
com `depends_on`), e o `get_card` da história devolve em `subtasksNow` o que o board executa e o que
espera. Cada sub-tarefa roda numa execução própria da CLI, uma depois da outra, respeitando as
dependências; quando todas terminam, o board chama a IA uma vez para verificar o conjunto, fazer o
commit e mover a história. **"Sub-tarefas em paralelo por história"** fica em **Configurações → Harness de IA**.

### Board no navegador

O board não depende da janela do editor:

- **Abrir no navegador** (no topo do board, ou o comando **Faz AI: Abrir board no navegador**) abre o
  mesmo board numa aba do navegador, sincronizada com o editor.
- **Sem o editor**: rode `~/.faz-ai/bin/faz-ai` na pasta do projeto. O comando serve o board no
  navegador, com o servidor MCP, a execução da IA e o heartbeat, até você encerrar com Ctrl+C.
  Precisa do Node.js no PATH.

A página só responde em `127.0.0.1` e exige o segredo que vem no link aberto pelo editor ou pelo
terminal (guardado num cookie, então o endereço pode ir para os favoritos). Um board é servido por um
lugar de cada vez: com o editor aberto na pasta, use **Abrir no navegador**.

## Usando com IA

Em Configurações → **Ferramentas de IA**, escolha o perfil de CLI padrão do projeto (Claude Code,
Cursor e Kimi Code vêm prontos). Na aba **Projeto**, grupo **Servidores MCP**, clique em **Instalar
(padrão da ferramenta)**: o board registra o servidor `faz-ai` no arquivo global da ferramenta, e faz
isso sozinho ao abrir a pasta. Nada entra na pasta do projeto. A skill do fluxo (`faz-ai-fluxo`) já é
servida pelo MCP (`get_skill`); instalá-la no grupo **Skills** é opcional. **No Cursor não há o que
instalar**: o board grava sozinho o `.cursor/mcp.json` do projeto (fora do git) e pede, na primeira
vez, para **recarregar a janela** e **ligar o `faz-ai`** em Cursor Settings → MCP. Depois, abra uma
sessão da ferramenta na pasta do projeto e peça, por exemplo, "liste os cards do board".

| Item | Onde grava |
|---|---|
| Servidor MCP | `~/.claude.json` e `~/.kimi-code/mcp.json` |
| Skill do fluxo | `~/.claude/skills`, `~/.cursor/skills`, `~/.kimi-code/skills` |

No fluxo sugerido, a IA lê a história e a instrução da fase, constrói o documento da fase, anexa à
história e pede a sua revisão pela conversa do card. Você responde no próprio card:

- **Aprovar** leva o card para a próxima coluna na hora.
- **Pedir ajustes** devolve o card para a IA com o seu texto na conversa.
- Se a IA fizer uma pergunta, o card fica **Aguardando resposta**; ao responder, ele volta para a IA.
- **Bloquear** registra um impedimento, com o motivo.

**Perguntas com opções.** Quando a IA precisa de uma decisão com alternativas, ela registra as
perguntas no card (`ask_questions`), cada uma com opções curtas e a indicada. Elas aparecem no card
aberto num carrossel: uma pergunta por vez, com o contador **{n} de {total}** e o selo **Indicada**.
Clicar numa opção grava a resposta e avança. **Enviar respostas** grava tudo na seção **Perguntas e
respostas** da descrição e devolve a vez para a IA. No modo autônomo, o board responde cada pergunta
com a indicada e a IA segue.

**Diagnóstico do ambiente.** Na primeira abertura do board, abre sozinha uma lista com tudo de que o
board precisa; depois, ela abre pelo botão **Verificar ambiente**, nas Configurações. O board confere
o Node.js (22 ou mais novo) e cada perfil de CLI ligado: se a linha de comando existe e se está
logada. Como recomendados, aponta o Git, o GitHub CLI com login e o Code Review Graph. O board não
instala nada: cada item traz o site oficial e o comando para copiar. A conferência roda ao abrir, a
cada 5 minutos e em **Verificar de novo**.

O aviso só **bloqueia** o board (botões de IA desligados, heartbeat e modo autônomo parados) quando
**nenhum** perfil ligado está disponível. Com login faltando ou vencido, o perfil ganha o aviso "sem
login" e o botão **Abrir no terminal**, que abre o comando de login num terminal (o login é sempre
seu). Se o login vence no meio de uma execução, o card volta ao status que tinha, e a fila retoma
sozinha quando o login é confirmado.

### O que cada fase entrega

- **Trilha curta para histórias pequenas.** Com a regra ligada (Configurações → Regras; desligada por
  padrão), uma história de esforço **Baixo** ou do tipo **Bug** aprovada no Discovery vai direto ao
  Plan, sem PRD nem Spec. Arrastar a história para o PRD ou a Spec força a trilha completa.
- **Spec com o desenho do programa.** Arquitetura, tipos e assinaturas novos ou alterados, quem chama
  quem no caminho principal, diagramas Mermaid e as alternativas descartadas com o motivo.
- **Plan com partes fáceis de revisar.** Cada passo diz como verificá-lo. Acima de umas 400 linhas de
  código, a IA deixa a primeira parte na história e cria as seguintes como **histórias derivadas**
  (`create_card` com `derived_from`); a branch de cada derivada parte da anterior, o PR é empilhado, e
  o card mostra **Derivada de #N**.
- **Revisão antes do pull request.** A coluna **Revisão** roda as checagens do projeto e revisa o diff
  com um olhar independente (o agente `revisor-de-codigo`, quando está no board). Não pede
  aprovação: o resultado vai para a conversa e para o **Como revisar** do PR.
- **Pull request que explica a entrega.** O corpo traz **Objetivo**, **O que foi feito**, **Como
  revisar**, **Decisões** e o roteiro **Como testar**.

**Caminho curto:** crie a história direto na coluna em que ela deve começar (o **+** de cada coluna)
ou arraste-a para lá. A IA começa dali, a partir da descrição, da conversa e do código.

### Chat com a IA

![Chat com a IA: pergunta e resposta usando o board](docs/images/chat.png)

Para dar ordens ao board em linguagem natural, use o **Chat**: na barra lateral do editor, a seção
**Chat com a IA**; no navegador, o botão **Chat** do topo. Escreva, por exemplo, "crie uma história
Login com Google e três sub-tarefas" ou "o que está esperando por mim?". A IA responde e age pelas
ferramentas do board: cria, move e vincula cards. Abaixo do campo você escolhe o **modelo e o
esforço**. Enter envia, Shift+Enter quebra a linha, **Parar** interrompe e **Limpar** apaga a
conversa. O histórico fica guardado por projeto, e vale o limite de Configurações → Harness → "O que
a IA pode fazer".

### Trabalhar na fase e Refinar com IA

O card tem dois botões que chamam a ferramenta em segundo plano. Não é um chat ao vivo: a resposta
chega na conversa quando a execução termina, e enquanto isso o card fica "Em execução", com um botão
**Parar**.

- **Trabalhar na fase** faz o trabalho da coluna em que o card está, o mesmo que o heartbeat faria:
  lê a conversa, responde e termina passando a vez (pede revisão, pergunta, bloqueia ou move o card).
  Com texto escrito, **Enviar e trabalhar na fase** manda a mensagem antes.
- **Refinar com IA** só deixa o card claro e completo: reescreve título e descrição (sem inventar
  requisito), revisa Tags, Esforço, Modelo e Skills e completa o checklist. Não trabalha a fase, não
  move o card nem mexe em arquivos. A descrição anterior fica guardada como anexo.
- **Resumir a conversa**, na aba Conversa, grava um resumo (Decisões, Observações, Pendências) como
  mensagem nova da IA. As mensagens anteriores ficam desativadas e esmaecidas: a IA passa a receber
  só o resumo e o que vier depois. Você pode editar o resumo e **Apagar mensagens resumidas**. O
  heartbeat resume sozinho a conversa que cresceu; também existe como ferramenta MCP
  (`generate_summary`).
- O que a IA pode fazer nessas execuções se define em Configurações → Harness → **Execução pela
  conversa**: só o board (padrão), board e arquivos do projeto, ou sem restrições. O nível em uso
  aparece ao lado do botão. Se o trabalho pedir mais do que o nível permite, a IA bloqueia o card
  dizendo qual opção escolher.
- Se a execução falhar ou passar do tempo limite, o card fica Bloqueado com o motivo. O log completo
  está em **Saída → Faz AI**.

### Contexto e consumo

No rodapé de cada card, um anel mostra quanto da janela de contexto a execução ocupa antes de a IA
começar, com o total ao lado (por exemplo, `5,8 mil`). O clique abre o detalhe: uma barra por grupo
(servidores MCP, agentes, rules e skills, e o card com descrição, conversa, instruções da fase e
documentos). É uma estimativa pelo tamanho do texto, feita para comparar escolhas: desmarcar uma
skill ou trocar o agente muda o número na hora. A janela vem do modelo do card; sem modelo conhecido
(como os do Cursor), o anel mostra só o total. O botão **Reler arquivos** relê os arquivos do harness.

O card aberto tem a aba **Consumo**, que junta as duas contas: **Próxima execução** (a mesma
estimativa do anel, com o bloco **Contexto da execução** e a origem de cada rule, skill e servidor
MCP) e **Gasto até agora** (o que a ferramenta mediu no fim de cada execução, uma linha por fase). O
gasto é histórico e só cresce: apagar mensagens diminui as próximas execuções, nunca o já gasto.

Cada vez que a IA roda, o board registra tokens, turnos e o **inventário** do que ela usou:
ferramentas nativas, ferramentas de MCP, subagentes e skills. O consumo é em tokens, sem custo em
dólar. "Não medido" é falta de medição, nunca zero. O detalhe de cada execução é guardado por uma
janela de 1 a 24 meses (padrão 6); os totais por mês nunca expiram.

O botão **Métricas**, na navegação do topo, mostra o que o board registrou. Você filtra por período
e por **Workflow** e vê quatro totais (atividades concluídas, execuções de IA, tokens e tempo de IA),
os tokens por mês, onde o consumo aconteceu (**Recortar por** fase, tipo de card, modelo, ferramenta,
esforço ou perfil), quanto tempo o card fica em cada fase, o lead time, o **retrabalho** (revisões
pedidas, aprovações de primeira, pedidos de ajuste e sinais da IA), as fases e os cards mais caros, o
que a IA usou e a janela de **Detalhe guardado**, que você ajusta ali. Avisos junto dos números dizem
desde quando o log existe e quais meses só têm o total mensal.

Durante a conversa de um card, a IA consulta as mesmas estatísticas com `get_metrics`, sem abrir
painel: "quanto tempo de IA o card #72 consumiu?", "qual agente foi usado mais?". A ferramenta agrupa
por fase, tipo de card, modelo, agente, skill e outras dimensões, aceita filtros de período e de card,
traz o retrabalho com `rework: true` e responde numa tabela compacta.

### Branch, pull request e gitflow

Cada história trabalha numa branch própria, criada pelo board (ex.: `feature/12-login-com-google`).
Por padrão ela vem com uma **worktree**: uma pasta de trabalho separada, ao lado do projeto, onde a IA
altera o código sem tocar na sua pasta. A branch nasce quando a IA começa a implementação
(`prepare_workspace`) ou pelo botão **Criar branch da história**; o card mostra a branch e abre a
pasta numa janela nova. O modo (worktree, branch na própria pasta ou desligado), o nome da branch e o
merge automático ficam em **Configurações → Git**; cada worktree precisa das dependências instaladas.

As branches seguem o **gitflow**, ligado por padrão (**Usar o gitflow**): História e Débito técnico
geram `feature/` a partir da `develop` e voltam para ela; Retrabalho gera `bugfix/` (um defeito numa
funcionalidade que ainda só está na `develop`); Bug gera `hotfix/` a partir da principal e volta para
ela. A branch principal é detectada sozinha, e a `develop` é criada se não existir. A IA lê a base do
PR em `workspace.prBase` do `get_card` e abre o pull request com `--base`. Em histórias empilhadas
(derivadas ou do modo autônomo), a base é a branch da história anterior.

Na **Homologação**, a IA escreve o roteiro **Como testar** na descrição, envia a branch, abre o pull
request, registra o endereço no card e pede a sua revisão. Com o **merge automático** ligado
(Configurações → Git › Pull request e merge; desligado por padrão), aprovar a história faz o merge do
PR pelo GitHub CLI (`gh`); só depois o card vai para Concluído e a worktree é removida. Se o merge
falhar, o card fica Bloqueado com o erro. Desligado, aprovar leva o card para Concluído na hora.

**Conclusão no gitflow.** Quando a história é concluída com o PR mesclado, o board remove a worktree,
apaga a branch local e a remota e atualiza a `develop` local só por fast-forward, sem trocar a branch
da sua pasta. Quando a limpeza não é segura (mudanças não commitadas, commits fora do PR), ele não
apaga o que está em risco, conclui o card do mesmo jeito e deixa na conversa o comando para você.
Uma história empilhada sobre a concluída tem a base trocada para a `develop` antes. Depois de um
hotfix, o board abre e mescla um PR `main → develop`. Branches e worktrees que sobraram aparecem em
**Configurações → Git → Branches e worktrees órfãs**: as seguras o board limpa sozinho; as outras
esperam o seu **Limpar**, com confirmação.

**Registros de decisão.** Com **Configurações → Git › Registros de decisão** apontando para uma pasta
do repositório, como `docs/decisoes`, a Homologação grava ali, antes do PR, o registro de decisão da
história (contexto, decisão, alternativas descartadas, consequências e diagramas), a partir da Spec
aprovada. O arquivo `<número>-<título>.md` vai num commit da branch e é citado no PR. Vazio, o padrão,
desliga.

**Detecção de merges.** O board observa o pull request de cada história em aberto, a cada rodada do
heartbeat. Quando o PR é mergeado, grava o commit no card, avisa na conversa, move o card para a
conclusão e faz a limpeza do gitflow. Se o PR está aberto com conflito, avisa e chama a IA numa
execução só para resolvê-lo; se não conseguir, bloqueia o card. O merge em si continua sendo seu.
Quando a versão que contém a história é publicada (tag com release no GitHub), o board registra a
versão na conversa e arquiva o card; você pode restaurá-lo pela aba Arquivados.

### Heartbeat

Com o heartbeat ligado (Configurações → Harness), o board chama a IA sozinho a cada intervalo,
enquanto o editor estiver aberto na pasta do projeto. A cada rodada ele primeiro arruma o board e
depois decide o que a IA faz:

- devolve para a IA os cards bloqueados por limite de uso da ferramenta e avisa uma vez o card que
  está com você há dois dias ou mais; quando um perfil esgota o limite do plano, a fila dele pausa até
  a renovação e o topo do board diz até que horas;
- confere os pull requests, limpa as órfãs e sincroniza as branches locais com o origin, só por
  fast-forward;
- confere, só lendo, se a branch de uma história sem PR conflita com a base, e avisa na conversa;
- resume a conversa das histórias que cresceram;
- refina os cards novos do Backlog (**Refinar os cards novos do Backlog**, ligado por padrão) e os
  deixa aguardando a sua revisão;
- trabalha nos cards prontos e responde às mensagens pendentes, uma execução por história.

A fila segue a ordem do board: bugs primeiro, depois a história mais à direita, e na mesma coluna de
cima para baixo. Cards que estão com você não são tocados. As atividades sem branch rodam ao mesmo
tempo até **Histórias ao mesmo tempo** (duas por padrão); as com branch rodam uma por vez, a não ser
que **Tocar histórias em paralelo** esteja ligado no modo worktree.

**Rodar o heartbeat agora** começa uma rodada na hora, mesmo com o heartbeat desligado. A barra de
atividade no pé do board mostra o que a IA está fazendo ("IA em #12 (Discovery, há 3 min)") ou por
que está parada, e o **coração** no topo direito liga e desliga o heartbeat.

### Modo autônomo (YOLO)

Uma **história** pode ser marcada como **YOLO**: ligue **Modo autônomo** no painel do card, clique no
ícone no rodapé do cartão ou marque várias e use a barra de seleção. O board pede confirmação (marque
**Não avisar novamente** para ligar direto) e mostra o seletor **Até onde**: o padrão é a
**Homologação (abre o pull request)**; escolhendo uma fase antes, como o Plan, a IA segue sozinha até
ela, pede a sua revisão e o modo se desliga. A partir daí a IA toca a história **sem pedir
autorização nem confirmação para nada**:

- do **Backlog** até a última coluna em que atua: Discovery, PRD, Spec, Plan, sub-tarefas,
  implementação, revisão e o pull request (`set_pull_request`), onde para e aguarda a sua revisão. O
  pedido de revisão vira aprovação na hora, com o resumo na conversa;
- **sem perguntas**: diante de uma dúvida, ela decide e registra o motivo; `ask_questions` é respondida
  com a indicada. Só um impedimento real bloqueia o card;
- **conversa resumida** entre as fases, para o contexto não carregar a conversa inteira;
- segue os padrões do projeto (`CLAUDE.md`, `AGENTS.md`, `DESIGN.md`) e escolhe o caminho menos
  complexo;
- **sem merge**: o merge e o avanço até Concluído continuam sendo seus;
- **sem restrições**: as execuções rodam com a permissão "Sem restrições", porque precisam de git e
  do `gh`.

O **autopiloto** toca as histórias em modo autônomo uma de cada vez, na ordem do board, corrigida
pelas dependências; cada história na espera mostra o selo **Fila N**. Uma história bloqueada ou
esperando a sua resposta é pulada. A branch de cada história parte da branch mais recente das outras
histórias autônomas abertas, formando uma **pilha de PRs**. A IA pode dividir um pedido grande
criando as histórias seguintes (`create_card` com `autonomous_from`). O disjuntor bloqueia a história
depois de 3 execuções seguidas sem avanço, liberando a fila.

O **botão do modo autônomo** no topo do board diz o que o clique faz: **Ligar modo autônomo** (põe no
modo todas as histórias em aberto, ou só as selecionadas), **Pausar modo autônomo** ou **Retomar modo
autônomo**. A pausa fica gravada no board e sobrevive a reabrir o editor. Um card preso em "Em
execução" sem sessão de IA volta para Pronto sozinho.

### Agentes

Os subagentes são artefatos da **Biblioteca do board**, com instruções, descrição, modelo opcional,
categorias de ferramentas e dependências de skills e MCPs. Criar ou editar pelo Harness grava no
board, sem criar arquivos nas pastas das ferramentas; agentes que já existem nessas pastas podem ser
importados.

A execução escolhe o agente do card; na ausência dele, o agente da fase; depois, o padrão de
**Harness → Ferramenta e execução**. Na aba **Sub-agentes**, use **Criar**, **Assistente guiado** ou
**Gerar com base no projeto**. O editor permite revisar as instruções, selecionar skills e MCPs da
biblioteca e definir as categorias Leitura, Edição, Comandos, Rede e Subagentes. No Claude Code, o
agente é entregue com restrições de ferramentas e modelo; nos demais executores, parte do perfil vai
como orientação no prompt.

Pelo MCP, `get_board` lista os agentes, `set_card_profile` escolhe o do card e `create_agent`,
`update_agent`, `get_agent` e `delete_agent` os editam.

## Harness

O board tem uma **biblioteca particular**, independente da ferramenta de IA. Em **Configurações → Harness**, a aba **Biblioteca do board** guarda **Regras**, **Skills**, **Sub-agentes** e **MCPs**. A aba **Ferramenta e execução** escolhe a IA, os modelos, as permissões, o agente padrão e o heartbeat, e conecta a ferramenta ao servidor MCP do board. Trocar de ferramenta preserva os artefatos e suas seleções.

As execuções usam só as cópias guardadas no banco do board. Um item que existe só na pasta da ferramenta aparece como ausente e não entra. Se um agente ou card citar um servidor MCP que não está no board, a execução não começa.

Cada item tem um modo de uso:

- **Sempre**: entra no contexto de toda execução do board.
- **Pelo card**: fica disponível no planejamento e nos campos Skills, Rules e MCPs; entra quando o card ou seu agente o escolhe.
- **Desligado**: fica na biblioteca sem participar. Regras novas entram assim, para revisão.

Cada aba tem **Criar**, busca, **Editar**, troca de modo e remoção com confirmação; em **Skills**, **Sub-agentes** e **MCPs** dá para mudar o modo ou excluir em massa. Regras, skills e subagentes têm **Assistente guiado** e **Gerar com base no projeto**; o editor de **Sub-agentes** tem **Ajudar com IA**, **Indicar com IA** e **Revisar e salvar**.

**Importar artefatos** aceita um projeto ou uma coleção: escolha a pasta, marque os itens na prévia e **Importar selecionados** copia cada um para sua aba. O board reconhece `AGENTS.md`, pastas `rules/` e `agents/`, skills com `SKILL.md` e `mcp.json`/`.mcp.json` com `mcpServers`. Nomes repetidos pedem confirmação para sobrescrever. **Importar → Ferramenta instalada** lê só a pasta da ferramenta escolhida.

**Exportar para a ferramenta** faz o caminho inverso: copia regras, skills e agentes para a pasta de **Claude Code**, **Cursor** ou **Kimi Code**, na **Pasta do projeto** ou na **Pasta do usuário**. **Substituir os que já existem** regrava o que já está lá. O resultado é uma **cópia desconectada**: o board não a acompanha. Servidores MCP não são exportados; **Conectar ao board** registra o do board na ferramenta.

**MCPs** aceitam formulário (`command` e `args` para stdio, URL para HTTP) ou **Editar JSON diretamente**. A definição fica cifrada no cofre local; MCPs importados ficam pendentes até revisão humana. A ponte **faz-ai** oferece `list_board_mcp_tools` e `call_board_mcp_tool` para qualquer cliente MCP conectado ao board. **Pasta da biblioteca** mostra uma cópia legível, por padrão em `~/faz-ai-library/<projeto>/`.

## Configurações

| Seção | O que ajusta |
| --- | --- |
| Workflows e colunas | Workflows, nomes, ordem e significado das colunas, onde a IA atua e a fase de cada coluna |
| Tipos de card | História, Bug, Sub-tarefa…, com cor e valores padrão por tipo |
| Campos personalizados | Os campos que você cria e onde aparecem; os campos do board (Fase, Tags, Modelo, Skills, Rules, MCPs, Esforço da atividade) não se apagam nem se renomeiam |
| Regras do board | Bloqueios de conclusão e de fase, confirmações, modelo sugerido e trilha curta para histórias pequenas |
| Harness | Biblioteca de regras, skills, subagentes e MCPs; ferramenta, permissão, agente padrão e heartbeat (ver [Harness](#harness)) |
| Ferramentas de IA | Perfis de CLI: ligar, escolher o padrão, duplicar, criar e testar; políticas de execução e fallback |
| Modelos de IA | Modelos e níveis de esforço por perfil; regras que sugerem o modelo de cada card |
| Git | Modo, gitflow, nomes e prefixos das branches, worktrees, merge automático e registros de decisão |
| Aparência | **Idioma**, tema, fonte e tamanho, por board |
| Backup | Exportar e importar o board (ver [Backup do board](#backup-do-board)) |

Um **perfil de CLI** é uma ferramenta que o board pode executar. Os prontos são Claude Code, Cursor e Kimi Code; um **personalizado** aceita outra CLI com saída em texto. Em **Configurações → Ferramentas de IA**, ligue um perfil e escolha o padrão. O campo **Modelo** do card (`<perfil>:<modelo>@<esforço>`) diz qual CLI executa; sem ele, o board usa o modelo do agente, a regra de modelo ou o perfil padrão, nessa ordem. Uma escolha inválida deixa o card **bloqueado**. As regras de sugestão combinam condições com E e OU; o resultado é sempre uma sugestão. O fallback entre CLIs é decidido só pelas **políticas de execução e fallback**, revisadas e ligadas por você. Quando uma versão nova muda o board padrão, o board pergunta se quer atualizá-lo e só acrescenta o que falta.

## Onde ficam os dados

O board e os anexos ficam no armazenamento da extensão, fora do repositório. Cada pasta tem o seu banco (`boards/<chave da pasta>.db`). Agentes, skills, regras e definições MCP ficam no banco do board; a pasta da biblioteca guarda uma cópia legível e cada execução grava um snapshot em `run-artifacts/`. Não abra a mesma pasta em duas janelas: a última a salvar vence.

**Atualizar a extensão atualiza o banco.** Ao abrir o board, a extensão aplica as mudanças de formato que faltam, cada uma numa transação. Uma versão anterior da extensão recusa abrir um board gravado por uma versão mais nova. Erros de gravação ficam em **Saída → Faz AI**.

### Backup do board

No editor, a paleta de comandos (`Ctrl+Shift+P`) tem **Faz AI: Exportar o board** e **Faz AI: Importar um board**; na tela, **Configurações → Backup** tem **Exportar board** e **Importar de um arquivo…**. A exportação gera um `.fazai.json` com tudo o que está no board, inclusive conversas e anexos: guarde-o com cuidado. A importação mostra um resumo, grava uma cópia do banco (`.bak`), move os anexos atuais para backup e substitui o board; nada muda se o arquivo for inválido. Arquivos de versões anteriores são atualizados; de versões mais novas, recusados. Não importe com a IA executando um card. O histórico mensal do log não vai no arquivo, e branches e pastas de trabalho vêm como estavam na máquina de origem.

## Desenvolvimento

```sh
npm install
npm run build
npm test
npm run typecheck
```

Novas funcionalidades são integradas na `develop`. O `npm test` também roda o lint e confere a formatação; `npm run format` formata tudo. `npm run typecheck` confere os tipos e `npm run build` gera o `dist/`. Pressione `F5` para abrir o Extension Development Host. O código fica em `src/extension` (host e servidor MCP), `src/webview` (interface em React), `src/shared` (modelo e regras do board), `src/mcp-bridge` (ponte stdio) e `src/cli` (o board fora do editor). `node dist/cli.js <pasta> --data <pasta de dados de teste>` serve o board no navegador. `npm run test:cli-real` testa à parte o **Claude Code instalado**, sem login nem modelo remoto.

O changelog segue o Keep a Changelog, com uma seção por versão e os títulos **Adicionado**, **Alterado**, **Removido** e **Corrigido**. A seção do topo é a próxima versão (a mesma do `package.json`) e reúne só o que já chegou à `develop`. Integrar na `develop` não publica a extensão.

Com o gitflow, o release parte da branch em que você está. Na `develop`, `npm run release -- X.Y.Z` exige a branch atualizada e limpa, testa, cria `release/vX.Y.Z`, faz o commit e empacota; numa `hotfix/...`, o commit da versão vai na própria branch, e o `npm run release` deve rodar **antes** de aprovar o card. Depois o script publica nas duas lojas, abre o PR para a `main` (sempre com **merge commit**), cria a tag e a GitHub Release com o `.vsix` e devolve a `main` para a `develop` por PR. `npm run release -- finish` retoma de onde parou; `--dry-run` ensaia sem publicar.

Entre empacotar e publicar, o release confere os quatro arquivos de vitrine (`README.md`, `README_EN.md`, `CHANGELOG.md`, `CHANGELOG_EN.md`): o changelog precisa ter a versão que está saindo no topo, sem "Não lançado"/"Unreleased" sobrando, e o README precisa ter os blocos de aviso de fase alpha e de agradecimento. Se algo falhar, o release recusa antes de publicar. Se você reescrever um bloco de aviso, atualize a tabela `SHOWCASE` em `scripts/releaseCheck.mjs`.

Os testes e2e sobem um contêiner Docker com Ubuntu 24.04 limpo para ver o Diagnóstico do ambiente como numa máquina nova; os logins são seus. `npm run e2e:cursor` abre o Cursor com a extensão da branch atual (no macOS, pelo noVNC em `http://localhost:6080`); `npm run e2e:kimi` abre o board pelo `src/cli` em `http://localhost:7878`, e você instala a CLI do Kimi Code seguindo o [roteiro](scripts/e2e-kimi/ROTEIRO.md). Ambos aceitam `-- continuar`, `-- parar` e `-- remover`, e precisam de Docker sem `sudo`.

### Preparar o ambiente de desenvolvimento

Num clone novo, refaça o que fica fora do git.

- Node.js 22+ e git: build, testes e o comando `faz-ai`.
- `.mcp.json` e `.claude/settings.local.json`: ligam a IA ao board; o board não os cria mais.
- `.env.release` com `OVSX_PAT`: token do Open VSX para publicar.
- `az login --allow-no-subscriptions`: login da Azure CLI para o VS Code Marketplace.
- `gh auth login`: cria a GitHub Release.
- `.claude/skills/publicar-extensao/`: passo a passo da publicação; copie da máquina original.

Os quatro últimos só são necessários para publicar.

## Histórico de versões

O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md).

## Licença

[MIT](LICENSE)
