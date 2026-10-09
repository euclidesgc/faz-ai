🇧🇷 Português · [🇺🇸 English](README_EN.md)

<img src="media/icon.png" width="96" alt="Ícone do Faz AI Kanban">

# Faz AI Kanban

> ⚠️ **O Faz AI está em fase alpha.**
>
> O projeto é novo e muda rápido: quase toda semana sai uma versão, e nem tudo foi testado em todas
> as ferramentas de IA e sistemas operacionais. Erros e comportamentos inesperados podem acontecer,
> e telas, comandos e o formato do board ainda podem mudar de uma versão para outra.
>
> Use à vontade, mas com esse cuidado em mente: revise o que a IA fizer antes de aprovar e não
> dependa do board como único registro de algo importante. Se algo quebrar ou parecer estranho,
> [conte numa issue](https://github.com/euclidesgc/faz-ai/issues): é assim que ele sai do alpha.

> **Obrigado a quem está baixando e testando.**
>
> Publiquei a extensão no marketplace do Cursor e fui dormir. Quando acordei para instalá-la na
> minha máquina de trabalho, ela já tinha 160 downloads. Eu não esperava isso, e fiquei muito feliz.
>
> A cada pessoa que instalou, abriu o board e deu uma chance a um projeto que acabou de nascer:
> muito obrigado. É por vocês que ele continua.
>
> O Faz AI é **totalmente gratuito e open source** (licença MIT), e contribuições são bem-vindas:
> conte o que funcionou e o que não funcionou, [abra uma issue](https://github.com/euclidesgc/faz-ai/issues)
> ou [mande um pull request](https://github.com/euclidesgc/faz-ai/pulls).
>
> Euclides G Catunda

> **Gostou? Ajude o Faz AI a crescer.**
>
> Um projeto novo melhora com o retorno de quem usa. Se ele já te poupou tempo, estes gestos de um
> minuto fazem muita diferença:
>
> - ⭐ **Dê uma estrela** no [repositório do GitHub](https://github.com/euclidesgc/faz-ai): é o que
>   mais ajuda outras pessoas a encontrarem o projeto.
> - 💬 **Avalie a extensão** na loja onde você a instalou, com estrelas e, se puder, duas linhas
>   sobre o que achou: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=euclidesgc.faz-ai&ssr=false#review-details)
>   ou [Open VSX](https://open-vsx.org/extension/euclidesgc/faz-ai/reviews) (a loja do Cursor).
> - 🐞 **Encontrou um bug?** [Abra uma issue](https://github.com/euclidesgc/faz-ai/issues/new?template=bug.yml)
>   dizendo o que você fez, o que esperava e o que aconteceu. A versão da extensão e o editor que
>   você usa ajudam bastante.
> - 💡 **Tem uma ideia ou sugestão?** [Conte numa issue](https://github.com/euclidesgc/faz-ai/issues/new?template=sugestao.yml):
>   fluxos que faltam, telas confusas e integrações que você gostaria de ver.
>
> Antes de abrir, vale uma olhada nas [issues já abertas](https://github.com/euclidesgc/faz-ai/issues):
> às vezes a ideia já existe, e um 👍 nela ajuda a decidir a ordem do que vem a seguir.

Um board kanban dentro do editor (VS Code e Cursor), feito para conduzir Spec-Driven Development
(SDD) junto com uma IA. Você organiza o trabalho em histórias e sub-tarefas; a IA lê o board, produz
os artefatos de cada fase e move os cards conforme avança.

![Board com histórias nas fases do SDD e sub-tarefas no workflow de baixo](docs/images/board.png)

## Primeiros passos

Em cinco minutos você tem uma tarefa andando no board, com a IA trabalhando nela.

1. **Instale e abra.** Instale **Faz AI Kanban** no VS Code ou no Cursor (pelo marketplace da
   própria ferramenta), abra a pasta do seu projeto e clique no ícone **Faz AI** na barra lateral.
   Cada pasta tem o seu board, já com as fases do fluxo.
2. **Conecte a IA ao board.** Em **Configurações → Harness de IA**, escolha a ferramenta do projeto
   (Claude Code ou Cursor). Na aba **Tudo que a ferramenta
   carrega**, na ferramenta, clique em **Instalar (padrão da ferramenta)** na seção **Servidores
   MCP** e de novo na seção **Skills**, para a skill do fluxo, que ensina a IA a conduzir as fases.
3. **Crie a tarefa.** Na coluna **Backlog**, clique em **+ Novo card**, escreva o título (por
   exemplo, "Login com Google") e dê Enter. Duplo clique abre o card: descreva o que você quer, em
   Markdown, e, se quiser, escolha o modelo da IA e as skills que ela deve ler.
4. **Deixe a IA começar.** Arraste o card para **Discovery** e clique em **Trabalhar na fase** no card. A IA
   lê o card pelo board, analisa o problema e conversa com você na aba **Conversa**. Quando termina,
   o status muda para **Aguardando revisão**: é a sua vez. O mesmo acontece quando a IA deixa
   algo dependendo de você (uma decisão, um ponto em aberto): a pendência aparece na conversa como
   **Travado em mim** e o card fica com você, mesmo em modo autônomo.
5. **Revise e siga.** Leia o documento da fase, responda ou clique em **Aprovar** (ou **Pedir
   ajustes**). Com a aprovação, a história avança para **PRD**, **Spec**, **Plan** e
   **Implementação**, sempre com a IA produzindo e você aprovando. As sub-tarefas da implementação
   nascem no workflow de baixo e a IA as conclui uma a uma.

Para o dia a dia: o contador **N com você** no topo mostra o que espera por você, o **Chat** deixa
você pedir à IA, em linguagem natural, para criar e mover cards, e o **heartbeat** pode chamar a IA
sozinho quando há pendência com ela.

### Por que isso poupa contexto

A IA gasta contexto com o que carrega em toda sessão. O board existe para ela carregar só o
necessário, na hora certa:

- **Cada card é uma sessão nova e curta.** Em vez de uma conversa longa que acumula tudo, a IA abre o
  card pelo board (`get_card`), faz aquele trabalho e para. O histórico fica no card, e não na janela
  de contexto.
- **Contexto vazio por padrão.** Toda execução pelo board começa sem nenhuma regra, skill, agente,
  hook ou plugin da sua máquina ou do projeto: só entra o que você marcou em **Harness de IA**. No
  Claude Code isso é imposto por parâmetro (`--setting-sources ""`, `--disable-slash-commands` e um
  arquivo de servidores MCP só com o do board); nas outras ferramentas, o que a linha de comando
  aceita (ver a tabela de [Agentes](#agentes)).
- **Rules e skills marcadas, não descobertas.** Cada arquivo tem duas marcações: **Incluir em todo
  contexto** (entra em toda execução, pelo caminho) ou **Usar quando fizer sentido** (vira opção dos
  campos Rules e Skills do card, e o Refinar com IA a indica quando o pedido pede). O que não está
  marcado não existe para a execução.
- **Agentes com o mínimo.** Um agente libera só os servidores MCP e as ferramentas de que precisa,
  carrega as skills dele e tem instruções curtas; o resto fica de fora.
- **Documentos como anexos.** PRD, Spec e Plan ficam anexados à história; a IA os lê quando o card
  precisa, em vez de recebê-los colados em cada mensagem.
- **Anexos em Markdown abrem formatados.** Um `.md`/`.markdown` abre como uma página, com títulos,
  listas, tabelas e blocos de código formatados; um seletor **Formatado**/**Código** mostra o texto
  cru quando é preciso. Editar, Salvar e Copiar conteúdo continuam operando sobre o Markdown.
- **Modelo certo para cada tarefa.** Regras de sugestão e o modelo por card ou por agente evitam usar
  o modelo mais caro onde o mais leve basta.

A economia de contexto de skills sob demanda é documentada no Claude Code e no Cursor; nas outras
ferramentas, a documentação diz só que a IA deixa de invocar a skill sozinha. O board não promete
um percentual: ele mostra, no inventário, o que está sendo carregado.

## Para que serve

- **Planejar em fases.** As colunas das histórias são as fases do fluxo: Backlog, Discovery, PRD,
  Spec, Plan, Implementação, Homologação, Concluído e Cancelado. Cada história se desdobra em
  sub-tarefas, que têm um fluxo próprio (A fazer, Em andamento, Concluído).
- **Dizer à IA o que fazer em cada fase.** Cada coluna tem uma instrução para a IA e, se a fase
  gera um documento (Discovery, PRD, Spec, Plan), o modelo desse documento. No Discovery a IA
  analisa o problema e conversa com você antes de qualquer requisito; na Homologação a história só
  é concluída com a sua aprovação.
- **Trabalhar com a IA no mesmo quadro.** A extensão expõe o board por MCP. Claude Code,
  Cursor ou outro cliente MCP podem consultar e editar tudo o que a interface permite, e
  as mudanças aparecem no board na hora.
- **Saber com quem está cada card.** Todo card em que a IA atua tem um status (Pronto, Em execução,
  Aguardando resposta, Aguardando revisão, Aprovado, Bloqueado) que mostra se a pendência está com
  você ou com a IA.
- **Revisar antes de a IA avançar.** Nas colunas que exigem aprovação (Discovery, PRD, Spec, Plan
  e Homologação, por padrão), a IA termina o trabalho, pede a revisão e para. Ela só move o card depois que você aprova.
- **Ver o que espera por você.** O filtro "Com você", o contador no ícone da barra lateral e um
  aviso do editor mostram quando a IA pede revisão, faz uma pergunta ou trava num impedimento. A IA,
  por sua vez, pergunta ao board o que está com ela.
- **Dizer à IA como executar cada card.** Cada card pode indicar o modelo, o nível de esforço e as
  skills obrigatórias. O modelo pode ser sugerido por regras a partir do tamanho da tarefa.
- **Decidir antes o que a IA usa.** Um agente define as skills, os servidores MCP, as ferramentas e o
  modelo de cada fase ou card, em vez de a ferramenta descobrir sozinha durante a conversa. Toda
  execução pelo board roda através de um agente.
- **Ver e configurar o harness inteiro.** Para cada ferramenta de IA instalada, o board mostra o
  que ela carrega (instruções, skills, subagentes, comandos, hooks, servidores MCP, plugins e
  configurações), separado entre o projeto, a sua pasta de usuário e os plugins.

## Como usar

1. Abra uma pasta no editor e clique no ícone **Faz AI** na barra lateral. Cada pasta tem o seu board.
2. Crie histórias com **+ Novo card** e arraste-as entre as colunas. Ao arrastar, os outros cards se
   afastam com uma animação suave e um espaço tracejado mostra onde o card vai ficar; ao soltar, ele
   assenta direto no lugar, sem piscar. Clicar numa história mostra só as sub-tarefas dela; duplo
   clique abre o detalhe.
3. No detalhe do card ficam o status, a descrição em Markdown, os campos, o checklist, as
   sub-tarefas, a conversa e os anexos. A conversa é o lugar em que você e a IA falam sobre o card.
   Os documentos das fases (PRD, Spec, Plan…) são construídos nas sub-tarefas, mas ficam anexados à
   história; nas sub-tarefas eles aparecem como links.
4. Busque por texto ou pelo ID (`#12`). A seção **Filtros** da barra lateral filtra por tipo,
   campos, datas e relacionamentos.
5. Cards podem ser arquivados (menu de ações do card → **Arquivar**) ou enviados para a
   **Lixeira**, de onde podem ser restaurados. Os arquivados saem das linhas do board e ficam na aba
   **Arquivados** (entre Métricas e Lixeira), que preserva o histórico: uma linha por workflow, na
   ordem do board, do mais recente ao mais antigo. **Restaurar** devolve o card ao fim da primeira
   coluna do workflow dele (Backlog / A fazer no board padrão), inativo. Restaurar uma história traz
   também todas as sub-tarefas arquivadas dela e desliga o modo autônomo; restaurar uma sub-tarefa
   cuja história está arquivada pede confirmação e restaura a história inteira (uma sub-tarefa de
   história ativa volta sozinha, sem confirmação).

![Card aberto: status, aprovação, campos, descrição e checklist](docs/images/card.png)

Por padrão, uma história não é concluída nem avança de fase enquanto tiver sub-tarefas em aberto
daquela fase. Essas regras podem ser desligadas nas configurações.

No topo do board, **N com você** mostra quantos cards esperam revisão, resposta ou desbloqueio (um
clique filtra só eles), e um indicador aparece enquanto a IA trabalha em algum card.

Cada card tem uma barra na cor do tipo, com o ID, o tipo e os botões de abrir e de ações. Abaixo
vêm o título (inteiro no tooltip, se não couber), o status com um ícone de com quem está a
pendência (robô para a IA, pessoa para você) e há quanto tempo ele está assim, os campos, o modelo
de IA (ex.: "Sonnet 5.5 - baixo") e, no rodapé, os contadores, a branch e o PR. Cards com
pendência sua ganham a borda na cor do status, e o LED da barra diz o estado do card de relance: verde piscando devagar enquanto a IA trabalha nele (na história, também quando ela trabalha numa sub-tarefa), amarelo quando ele espera por você, vermelho quando está bloqueado e apagado quando não há nada acontecendo.

**Cards colapsados.** Você pode colapsar cards para enxergar mais linhas de uma coluna na mesma tela. Um card colapsado mantém a faixa colorida do tipo (com o LED da IA, o número, o tipo e os botões) e mostra o título em até duas linhas, escondendo o resto; a borda de status continua (se o card espera por você), para você varrer o board de relance e saber o que precisa de atenção. O colapso pode ser aplicado em quatro escopos: um card isolado (botão no próprio card), todos os cards de uma coluna (item no menu de ações da coluna), todos os cards do board (botão na barra de filtros) ou só os cards selecionados (botão na barra de seleção múltipla). O estado fica lembrado entre sessões.

### Vínculos entre cards

Além das sub-tarefas, qualquer card pode ser vinculado a outro, de qualquer workflow, em **Vínculos**
no card aberto (como em Kanbanize ou Businessmap): **pai**, **filho** ou **relativo**. Busque o
outro card pelo número ou título e escolha o tipo do vínculo. O rodapé do card no board mostra o
vínculo e, se há filhos, quantos já estão encerrados. O vínculo repetido e o que fecharia um ciclo
(o pai já ser filho do card) são recusados.

Um pai vinculado segue a regra de Configurações → Regras: quando o último filho em aberto entra numa
coluna de conclusão, o board pergunta (ou move sozinho, conforme a regra) se o pai também vai para a
conclusão. A IA usa as ferramentas `link_cards` e `unlink_cards`, e o `get_card` devolve os
vínculos.

A seção **Vínculos** também mostra, só para exibição, a relação de sub-tarefa: numa sub-tarefa, um
grupo "Pai" com a história; numa história, a contagem de sub-tarefas com um atalho até a seção
**Sub-tarefas**. Essa relação é somente leitura (sem botão de remover) e não entra na regra de
conclusão acima, que continua valendo só para o vínculo manual de pai/filho.

#### Dependência e sub-tarefas em paralelo

Um card pode **depender** de outro: em **Vínculos**, escolha "precisa terminar antes deste card" (o
outro é pré-requisito) ou "só começa depois deste card". O card aberto mostra os grupos **Depende
de** (com quantas dependências ainda estão em aberto) e **Libera**. O board recusa ciclo de
dependência.

A IA usa isso para acelerar a Implementação. No Plan ela declara a ordem entre as sub-tarefas
(`create_card` com `depends_on`, ou `link_cards` com `depends_on`): uma depende da outra quando usa o
que ela produz ou quando as duas alteram os mesmos arquivos. Na Implementação, o `get_card` da
história devolve em `subtasksNow` o que pode rodar agora, e a IA delega **as sub-tarefas sem
dependência pendente a subagentes simultâneos**, cada um com o modelo do seu card; ao fim da rodada
ela verifica o conjunto, faz o commit e parte para a rodada seguinte. `start_work` recusa a
sub-tarefa que ainda espera outra. Sem dependências declaradas, todas as sub-tarefas em aberto são
consideradas independentes. Depende de a ferramenta de IA ter subagentes (o Claude Code tem); sem
eles, a execução segue uma por vez, na ordem das dependências. Projetos que já tinham a skill do
fluxo instalada continuam com o texto antigo dela (o board não sobrescreve uma skill que você pode
ter ajustado): apague-a e instale de novo em Configurações para receber a instrução nova.

### Board no navegador, fora do editor

O board não depende da janela do editor:

- **Abrir no navegador** (no topo do board, ou o comando **Faz AI: Abrir board no navegador**)
  abre o mesmo board numa aba do navegador. O editor continua aberto e é ele que guarda o board;
  as duas telas ficam sincronizadas.
- **Sem o editor**: rode `~/.faz-ai/bin/faz-ai` na pasta do projeto (ou `faz-ai <pasta>`). O
  comando serve o board no navegador, com o servidor MCP, a execução da IA e o heartbeat, e fica
  rodando até você encerrar com Ctrl+C. O atalho é criado pela extensão e usa os mesmos dados dela;
  precisa do Node.js no PATH. Para chamar só `faz-ai`, ponha `~/.faz-ai/bin` no PATH.
  `faz-ai --help` lista as opções (`--port`, `--data`, `--no-open`).

A página só responde em `127.0.0.1` e exige o segredo que vem no link aberto pelo editor ou pelo
terminal (ele fica guardado num cookie, então o endereço pode ir para os favoritos). O tema
"Sistema" acompanha o claro ou escuro do VS Code no editor e o do sistema operacional no navegador,
sempre com as cores do próprio board. No navegador, os filtros abrem na própria barra do board. Um
board é servido por um lugar de cada vez: com o editor aberto na pasta, use **Abrir no navegador**;
o `faz-ai` do terminal avisa e não inicia.

## Usando com IA

1. Em Configurações → **Harness de IA**, escolha a ferramenta do projeto (Claude Code ou
   Cursor).
2. Na aba **Tudo que a ferramenta carrega**, escolha a ferramenta e, na seção **Servidores MCP**,
   clique em **Instalar (padrão da ferramenta)**. O board registra o servidor `faz-ai` no arquivo
   global que a ferramenta lê.
3. Na seção **Skills** da mesma ferramenta, clique em **Instalar (padrão da ferramenta)** para a
   skill do fluxo (`faz-ai-fluxo`): ela ensina a IA a conduzir os cards pelas fases, gerar os
   documentos, pedir revisão e retomar pendências. Pode ser editada.

**Global ou neste projeto.** Os dois itens ficam só na seção do tipo, em cada ferramenta, cada um
com dois botões:

| | Onde grava | Quando usar |
|---|---|---|
| **Instalar (padrão da ferramenta)** | configuração global: `~/.claude.json` (por `claude mcp add --scope user`), `~/.cursor/mcp.json`; a skill em `~/.claude/skills`, `~/.cursor/skills` e equivalentes | o recomendado: o board funciona em qualquer repositório aberto com ele, sem nenhum arquivo no projeto |
| **Instalar neste projeto** | `.mcp.json` ou `.cursor/mcp.json`; a skill em `.claude/skills`, `.cursor/skills` e equivalentes | fixar uma versão num repositório ou num fork, ou uma skill ajustada para o time |

O registro global não fixa a pasta do projeto: o Claude Code informa a pasta pela variável
`CLAUDE_PROJECT_DIR`, e a ponte do board acha o board subindo a partir da pasta em que a ferramenta
foi aberta.

**No Cursor não há o que instalar.** O global do Cursor é um processo só para todas as janelas e não
sabe qual board atender, então o board grava sozinho o `.cursor/mcp.json` do projeto (fora do git,
pelo `.git/info/exclude`) assim que a pasta abre no Cursor. Na primeira vez em cada projeto, a faixa
pede para **recarregar a janela** (o Cursor só lê os servidores do projeto ao abrir a janela) e depois
para **ligar o `faz-ai`** em Cursor Settings → MCP (o Cursor deixa desligado todo servidor novo do
projeto). O do projeto vale sobre o global naquele projeto, então
instalar no projeto com um global já instalado pede confirmação, assim como substituir uma skill do
fluxo que já existe no destino (o que foi ajustado nela se perde). O comando **Faz AI: Instalar o
MCP do board (global)** da paleta faz a instalação padrão na ferramenta do projeto, e a ferramenta
`install_flow_skill` do MCP aceita `scope` (`user`, o padrão, ou `project`).
4. Abra uma sessão nova da ferramenta na pasta do projeto e peça, por exemplo, "liste os cards do
   board", "pegue a história #1 e escreva o PRD" ou "veja o que está pendente no board e dê andamento".

Enquanto faltar alguma coisa para o board trabalhar com a ferramenta, uma faixa amarela fica no topo
do board, em todas as telas, e no painel de chat. Ela confere o Node.js (o servidor do board roda
com ele), a linha de comando da ferramenta, o login dela (no Cursor, por `cursor-agent status`), o
registro do servidor do board no arquivo que a ferramenta lê (no Claude, vale também o registro
para o seu usuário, de `claude mcp add -s user`), um registro apontando para um node ou um caminho
que não existe mais, para outra pasta ou para a ponte de uma versão anterior, e o nível de
permissão. Cada item diz o efeito e traz a ação: o comando para copiar, **Instalar o MCP do board**
(abre a seção Servidores MCP da ferramenta), **Corrigir o registro** (um registro quebrado no arquivo
do projeto vale no lugar do global; corrigir tira ele dali e deixa o global valendo), **Recarregar a
janela** ou o atalho para o Harness de IA. A faixa não
fecha: some sozinha quando o último item é resolvido. A conferência roda ao abrir o board, quando a
ferramenta ou a permissão mudam, depois de conectar, a cada 5 minutos e em **Verificar de novo**,
que relê também o PATH do terminal (um node instalado com o board aberto é encontrado sem recarregar
a janela), e diz quando nada mudou.

O MCP do board e a skill do fluxo (`faz-ai-fluxo`) contam como requisito em todas as ferramentas:
mesmo onde as execuções pelo board levam o MCP sozinhas (Claude, Cursor), a conversa no chat do
editor ou no terminal depende dele, e a skill é o que faz a IA seguir o fluxo. A falta da skill tem o
botão **Instalar a skill** na própria faixa. Enquanto a linha de comando falta ou está sem login, os botões de IA do card ficam
desligados, com o motivo na dica.

**Diagnóstico do ambiente.** Na primeira abertura do board na máquina, abre sozinha uma lista, no
estilo do `flutter doctor`, com tudo de que o board precisa e o que ele aproveita. Depois, ela abre
pelo botão **Verificar ambiente**, nas Configurações, ou por **Ver o diagnóstico completo**, na
faixa amarela. **Necessário:** Node.js 18 ou mais novo, a linha de comando da ferramenta, o login
dela, o MCP do board, a skill do fluxo e o nível de permissão (os mesmos itens da faixa, com as
mesmas ações). **Recomendado:** o Git e um repositório na pasta
(`git init`), o GitHub CLI e o login dele (`gh auth login`, para o merge automático e o
acompanhamento dos PRs) e o [Code Review Graph](https://github.com/tirth8205/code-review-graph), um
grafo do código que a IA consulta em vez de ler arquivos inteiros. Com o Code Review Graph
instalado, a lista sugere o build do grafo do projeto e a busca semântica. Cada item diz para que
serve, como o board o usa e o que sai da sua máquina, e traz os comandos para copiar, um botão ou o
link de download, além do **Saiba mais**. Os comandos de instalação saem do sistema detectado:
`winget` no Windows, Homebrew ou `xcode-select` no macOS, e `apt`, `dnf` ou `pacman` no Linux (o Node
pelo `nvm`); numa distribuição desconhecida, fica o link de download. Quando o programa cai numa
pasta fora do PATH (a CLI do Cursor e o `uv`, em `~/.local/bin`), os comandos incluem o passo que a
põe no PATH. O Code Review Graph mostra os pré-requisitos dentro dele, na ordem de instalar: o `uv` e
o Python 3.10 ou mais novo, que o `uv` baixa só para ele, sem mexer no Python do sistema.

**Instalar tudo.** Os botões **Instalar o necessário** e **Instalar os recomendados** mostram antes
os passos, em ordem, e o script inteiro. Só depois de **Rodar no terminal** é que eles rodam, num
terminal do editor à vista: a senha do `sudo` e os logins (`cursor-agent login`, `gh auth login`)
ficam com você, ali. O script é montado para o sistema detectado (bash no Linux e no macOS,
PowerShell no Windows) e roda tudo numa sessão só, para o PATH que um passo ajusta valer nos
seguintes. Um passo que falha não para os outros, só pula os que dependem dele, e no fim a tela mostra
o resultado de cada passo: instalado, pulado ou não instalado, com o comando, o código de saída e as
últimas linhas do erro. O que não tem comando (ligar o MCP no Cursor, a permissão) fica listado como
tarefa sua. No modo navegador, em vez de rodar, a tela dá o script para copiar.

O chat do editor inicia os MCPs com o PATH de quando o editor abriu: o que foi instalado depois (o
Node pelo `nvm`, o `uvx` do Code Review Graph) não está nele até o editor fechar e abrir de novo. Por
isso, no fim do **Instalar tudo**, quando o Node aparece e pelo botão **Corrigir o caminho**, o board
grava o caminho completo do comando nos registros do `faz-ai` e do `code-review-graph` que o editor
não acha. O caminho é descoberto na hora, na máquina onde a extensão roda, e o arquivo fica fora do
git (`.git/info/exclude`). Se o arquivo de MCPs do projeto estiver versionado, o board não grava nele e
explica as saídas. A busca semântica usa o provedor `local`: o modelo é
baixado uma vez do Hugging Face e roda na máquina. A tela avisa que os provedores de nuvem
(`openai`, `google`, `minimax`, `voyage`) mandam trechos do código para terceiros, o que muitas
empresas não permitem.

Fluxo sugerido: a IA lê a história e a instrução da fase, cria uma sub-tarefa para construir o
documento da fase, anexa o documento à história e pede a revisão pela conversa do card. Você
responde no próprio card:

- **Aprovar** deixa o card Aprovado, e a IA o leva para a próxima coluna.
- **Pedir ajustes** devolve o card para a IA com o seu texto na conversa.
- Se a IA fizer uma pergunta, o card fica Aguardando resposta; ao responder na conversa, ele volta
  para a IA.
- **Bloquear** registra um impedimento, com o motivo.

### Chat com a IA

![Chat com a IA: pergunta e resposta usando o board](docs/images/chat.png)

Para dar ordens ao board em linguagem natural, use o **Chat**: na barra lateral do editor, a seção
**Chat com a IA** (abaixo de Board e Filtros); no navegador, o botão **Chat** do topo, que abre um
painel à direita. Escreva, por exemplo, "crie uma história Login com Google e três sub-tarefas" ou
"o que está esperando por mim?". A IA do projeto responde e age pelas ferramentas do board: cria,
move e vincula cards, e consulta o que há nele. Abaixo do campo você escolhe o **modelo e o esforço**
das próximas mensagens (a escolha fica lembrada). Enter envia, Shift+Enter quebra a linha, **Parar**
interrompe e **Limpar** apaga a conversa. O histórico fica guardado por projeto.

O chat usa a mesma execução em segundo plano dos cards, então vale o limite de Configurações →
Harness de IA → "O que a IA pode fazer" (por padrão, só o board) e o tempo limite de lá.

### Trabalhar na fase e Refinar com IA

O card tem dois botões que chamam a ferramenta do projeto em segundo plano. Não é um chat ao vivo:
a resposta chega como mensagem na conversa quando a execução termina, e enquanto isso o card fica
"Em execução" (com um botão **Parar**). Os botões mostram um hint explicativo (com negrito e tópicos)
ao passar o mouse ou focar com o teclado; o hint abre por hover e por foco de teclado, fecha com Esc,
e continua visível mesmo quando o botão está bloqueado.

- **Trabalhar na fase** faz o trabalho da coluna em que o card está, o mesmo que o heartbeat faria:
  em Discovery analisa o problema, em PRD escreve o PRD, em Implementação escreve o código (se a
  permissão deixar). Lê a conversa e responde a ela, e termina passando a vez: pede revisão, faz
  uma pergunta, bloqueia ou move o card. Se Tags, Esforço da atividade, Modelo e Skills estiverem
  todos vazios, ela os preenche antes. Fica no cabeçalho do card e na conversa (com texto escrito,
  **Enviar e trabalhar na fase** manda a mensagem antes).
- **Refinar com IA** só deixa o card claro e completo para quem vai trabalhar nele: reescreve
  título e descrição (sem inventar requisito; o que estiver ambíguo vira uma lista "Dúvidas em
  aberto"), revisa Tags, Esforço da atividade, Modelo e Skills mesmo que já tenham valor e
  acrescenta ao checklist os passos que faltam. Não trabalha a fase, não cria sub-tarefas, não move
  o card e não mexe em arquivos: roda só com o board. No fim, resume na conversa o que mudou (com o texto anterior da
  descrição, se a reescreveu) e o card volta ao status que tinha, também quando a execução falha:
  a falha fica na conversa, sem bloquear o card. Um refino não conta como execução sem progresso
  para o modo autônomo.

Imagens coladas na mensagem viram anexos do card e a IA as recebe.

- **Resumir a conversa**, na aba Conversa, aparece a partir de 2 mensagens: lê a conversa inteira e
  grava um resumo (Decisões, Observações, Pendências) como uma mensagem nova da IA (`kind:
  "summary"`), sem apagar nada automaticamente, sem trabalhar a fase, mover o card ou mudar o
  status — roda só com o board, sempre na faixa de modelo "Alto" (independente do Esforço do card).
  Você revisa o resumo como revisa qualquer mensagem: concorda deixando como está ou edita o texto.
  Logo abaixo dele, uma recomendação com o botão **Apagar mensagens resumidas** apaga, com
  confirmação, todas as mensagens anteriores ao resumo; resumir de novo cria um registro novo, sem
  substituir o anterior. Está disponível também como ferramenta MCP (`generate_summary`), com o
  mesmo resultado.
- O que a IA pode fazer nessas execuções se define em Configurações → Harness de IA → **Execução
  pela conversa**: só o board (padrão), board e arquivos do projeto, ou sem restrições. O nível em
  uso aparece ao lado do botão, com um atalho para mudar. A IA é avisada do limite: se o trabalho
  pedir mais do que o nível permite, ela bloqueia o card dizendo qual opção escolher.
- O Cursor aceita os três níveis: em "só o board" e "board e arquivos" a sessão dele recebe só as ferramentas do nível
  (leitura e MCP; leitura, MCP e edição), sem terminal.
- A ferramenta precisa estar instalada e autenticada. A CLI não precisa estar no PATH: o board a
  procura também nas pastas de instalação usuais e dentro das extensões do editor (quem só usa a
  extensão do Claude Code já tem o executável). A do Cursor é a `cursor-agent` (o
  instalador de `curl https://cursor.com/install -fsS | bash` cria também o atalho `agent`); entre na
  conta uma vez com `cursor-agent login`.
- Com o Claude Code, o servidor do board vai na linha de comando de cada execução: não depende de
  instalar o MCP nem da aprovação do `.mcp.json`. Com o Cursor, o board usa o registro global do
  `~/.cursor/mcp.json` quando ele leva a este board; sem ele (ou numa worktree fora da pasta do
  projeto), grava o servidor no `.cursor/mcp.json` antes de rodar (e põe o arquivo no
  `.git/info/exclude` quando o cria). Nas outras ferramentas, instale antes.
- Quando a história tem pasta de trabalho própria (worktree), a ferramenta recebe essa pasta junto
  com a do projeto, inclusive o Cursor.
- Parar e o tempo limite encerram a ferramenta e tudo o que ela iniciou (servidores MCP, testes,
  comandos). O Claude Code não roda "sem restrições" como root (contêineres, WSL como root): o
  board avisa. Sem Node.js no PATH, o servidor do board roda com o runtime do próprio editor.
- Se a execução falhar ou passar do tempo limite, o card fica Bloqueado com o motivo e o fim da
  saída da ferramenta. O log completo está no painel **Saída → Faz AI** (ou no terminal do `faz-ai`).

### Consumo, custo e inventário de cada execução

Cada vez que a IA roda (pela conversa, pelo heartbeat ou pelo modo autônomo), o board registra no
banco o que a execução consumiu: tokens de entrada, de saída, de leitura de cache e de criação de
cache, o custo em dólar, o número de turnos e o id da sessão da ferramenta. Registra também o
**inventário** do que a IA usou: ferramentas nativas, ferramentas de MCP (com o servidor de cada
uma), subagentes e skills, com a contagem de chamadas.

- **O custo é o que a ferramenta informa; o board não calcula nada.** Não existe tabela de preços: um
  valor calculado a partir de uma lista de preços envelhece quando o fornecedor muda a tarifa e
  produz relatório errado com cara de certo. Hoje:

  | Ferramenta | Tokens | Custo em dólar |
  | --- | --- | --- |
  | Claude Code | medidos (entrada, saída, leitura e criação de cache, por modelo, subagente incluído) | o `total_cost_usd` que a própria CLI informa |
  | Cursor | medidos (os quatro contadores) | a CLI não informa: fica em branco |

  Onde aparecer "não medido" ou um custo em branco é isso, falta de medição, e nunca consumo zero.
  Uma execução com tokens e sem custo (o caso do Cursor) conta nos tokens e fica de fora do custo;
  o aviso das Métricas diz quantas execuções ficaram de fora.
- **Toda execução passa por uma única porta.** O executor de cards (manual, heartbeat e modo
  autônomo) e o chat do board chamam a IA pelo mesmo ponto do código (`AiGateway`), que abre a linha
  no log antes de rodar, fecha com o desfecho e grava o consumo. Cada ferramenta tem um provider
  próprio, que monta o comando e lê a saída. Uma terceira forma de chamar a IA não existe sem passar
  por ali, e um teste falha se algum arquivo tentar. O que fica de fora do registro, por natureza, é
  o que você roda direto no terminal ou no chat da própria ferramenta, sem o board.
- **No canal de log** (**Saída → Faz AI**), a saída da ferramenta aparece em linhas legíveis, e no fim
  de cada execução vem uma linha de resumo com entrada, saída, leitura e criação de cache, turnos e
  custo, por exemplo `Consumo: 1.250 entrada · 3.400 saída · 52.000 leitura de cache · 9.100 criação
  de cache · 8 turnos · US$ 0,4210`. Turnos e custo ficam de fora quando a ferramenta não os informa.
- **Perguntas no chat do board** também entram no registro, sem card associado.
- **O detalhe de cada execução é guardado por uma janela que você configura**, de 1 a 24 meses (o
  mês corrente mais os anteriores). O padrão é 6 meses. Depois da janela o detalhe é descartado, mas
  os **totais por mês nunca expiram**. Antes o prazo era 12 meses; o padrão menor mantém o arquivo do
  banco dentro do limite de tamanho. Onde ajustar, e o que acontece ao baixar a janela, está em
  **Painel de métricas**, logo abaixo.

### Painel de métricas

O botão **Métricas**, o quarto da navegação do topo (Board, Métricas, Lixeira, Configurações), mostra
o que o board registrou sobre o trabalho e o uso da IA. Funciona no editor e também no board aberto
pelo navegador.

- **Filtros.** O período pode ser Hoje, 7 dias, 30 dias, Este mês, Últimos 12 meses, Tudo ou um
  Intervalo livre (data inicial e final). O filtro **Workflow** restringe os números a um workflow, e
  **Limpar filtros** volta ao padrão. Abaixo dos controles o painel escreve o período consultado.
- **Cinco totais.** Atividades concluídas (cards que chegaram a uma coluna de conclusão), execuções
  de IA, tokens, custo e tempo de IA. O **tempo de IA é a soma da duração de cada execução**:
  execuções simultâneas somam, então o total pode passar do tempo decorrido no relógio. O que não
  foi medido aparece como "não medido", nunca como 0, e quando só parte das execuções foi medida o
  aviso diz quantas ficaram de fora.
- **Custo e tokens por mês.** Gráfico de barras, uma série por vez (alternador **Custo** / **Tokens**).
  O mês em andamento aparece com hachura, porque ainda não terminou; um mês sem nenhum dado é um
  espaço marcado "sem dado", não uma barra de altura zero. Abaixo do gráfico fica uma tabela com os
  mesmos números e uma coluna de observação (parcial, sem dado, só total mensal).
- **Onde o consumo aconteceu.** O consumo do período repartido por **fase, tipo de card, modelo,
  ferramenta de IA, esforço ou perfil** (seletor **Recortar por**), em barras horizontais na medida
  escolhida em **Medida da barra**: custo, tokens, execuções ou tempo de IA. Ao lado fica a tabela com
  as quatro medidas. As categorias além do limite somam numa linha "outros". Alcança a série inteira
  do período, inclusive os meses já arquivados.
- **Quanto tempo o card fica na fase.** Uma linha por fase com as permanências, a mediana, a média,
  as desconhecidas e quantos cards estão nela agora. São permanências, não cards: um card que volta
  para a fase conta duas vezes. É tempo de relógio, diferente do tempo de IA do corte por fase.
- **Lead time.** Da criação do card até a **primeira** conclusão, dos cards concluídos no período: a
  mediana em destaque, a média, quantos entraram na conta, quantos ficaram desconhecidos e a lista por
  card, ordenável. Desconhecido é o card cuja data de criação não está no detalhe guardado (o mês foi
  descartado ou o card é anterior ao log); a data não é estimada.
- **Fases mais caras e Cards mais caros.** Dois rankings lado a lado, em tabelas que você ordena por
  custo, tokens, execuções ou tempo de IA clicando no cabeçalho (ou com Enter/Espaço). O padrão é o
  custo quando o período tem custo medido e o tempo de IA quando não tem, e a tela escreve o critério
  em vigor. As fases alcançam a série inteira; os cards, só o detalhe guardado, e cada bloco avisa
  isso.
- **O que a IA usou.** Ferramentas, ferramentas de MCP (com o servidor em coluna própria), subagentes
  e skills, com o número de execuções e de usos. "Ainda não medido" (nenhuma execução gravou
  inventário) é diferente de "nenhum registro no período".
- **Tokens e custo.** O custo soma só as execuções em que a ferramenta informou o custo (o Claude Code),
  e o aviso diz quantas ficaram de fora; os tokens contam em todas as execuções medidas. Execuções
  antigas, de antes de o board deixar de calcular custo por tabela de preços, continuam marcadas como
  "estimado por tabela de preços". Antes de o board medir consumo,
  custo e inventário aparecem como "não medido" e quase todo lead time como desconhecido: é o
  comportamento esperado, não falha.
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

### Métricas de uso com get_metrics

Durante a conversa de um card, a IA pode consultar estatísticas agregadas do histórico do board — uso,
duração e custo de execuções — sem precisar abrir nenhum painel. Chame a ferramenta `get_metrics` em
linguagem natural: "quanto tempo de IA o card #72 consumiu?", "qual tipo de card consome mais este
mês?", "qual agente foi usado mais?". A ferramenta responde em uma tabela compacta, otimizada para
economizar tokens.

- A agregação pode agrupar por fase (`phase`), tipo de card (`card_type`), ferramenta de IA
  (`tool`), modelo (`model`), esforço (`effort`), perfil (`profile`), card (`card`), agente (`agent`),
  skill (`skill`), ferramenta usada (`used_tool`) ou ferramenta de MCP (`mcp_tool`). Omita para obter
  apenas o total do período.
- `tool` e `used_tool` não são a mesma coisa: `tool` é a ferramenta de IA que rodou (claude, cursor);
  `used_tool` e `mcp_tool` são o que a execução usou (Read, Bash, `get_card`). Em `mcp_tool` o
  servidor vem numa coluna própria, ou "servidor não registrado" quando o nome não o trouxe.
- Filtros de período (data inicial e final, em `AAAA-MM-DD`), card (ex. `72` ou `#72`), e dimensões
  (ex. fase, modelo, tipo de card).
- Nas dimensões **agent**, **skill**, **used_tool** e **mcp_tool** a tabela mostra só a contagem de
  execuções e de usos (sem tokens nem custo, que não é possível repartir entre componentes de uma
  execução). `effort` e `profile` têm tokens e custo.
- Tokens contam em toda execução medida; o custo vem só das execuções em que a ferramenta o informou (o Claude Code).
- Os tempos do painel (permanência por fase e lead time) não estão no `get_metrics`.
- Valores não medidos aparecem como "-" (nunca 0), por exemplo o custo do Cursor.
- Sempre informa desde quando o histórico do board existe e quais períodos têm apenas totais mensais
  (sem detalhe por execução). Períodos fora da janela de retenção (6 meses por padrão) não têm detalhe e só agregam os
  totais já consolidados.

### Branch e pasta de trabalho por história

Cada história trabalha numa branch própria, criada pelo board (ex.: `historia/12-login-com-google`).
Por padrão ela vem com uma worktree: uma pasta de trabalho separada, ao lado do projeto, onde a IA
altera o código sem tocar na sua pasta nem nas suas alterações em andamento. As sub-tarefas fazem
commits na branch da história.

- A branch é criada quando a IA começa a implementação (ela chama `prepare_workspace`) ou pelo
  botão **Criar branch da história** no card.
- O card mostra a branch e abre a pasta de trabalho numa janela nova.
- O modo (worktree, branch na própria pasta ou desligado), o padrão do nome da branch, a pasta das
  worktrees, **tocar histórias em paralelo**, o merge automático do PR ao aprovar a homologação e a
  detecção automática de merges, com o arquivamento das histórias já publicadas (ligada por padrão),
  ficam no Settings do editor, em **Faz AI › Git** (ver [Configurações no Settings do
  editor](#configurações-no-settings-do-editor)); no navegador seguem na aba Git e no bloco de
  paralelo do Harness, como antes.
- Cada worktree é uma cópia de trabalho: as dependências precisam ser instaladas nela.

### Pull request e merge na Homologação

Na Homologação a IA escreve o roteiro **"Como testar"** (o que foi construído, os passos para
verificar com o resultado esperado e o que ficou de fora) na descrição da história, envia a branch,
abre o pull request com o mesmo roteiro no corpo, registra o endereço no card e pede a sua revisão.
O card mostra o link do PR.

O merge automático é opcional e começa desligado (Settings do editor, Faz AI › Git). Com ele ligado, quando você
aprova uma história que está na última coluna antes da conclusão:

1. o board faz o merge do PR pelo GitHub CLI (`gh`), no tipo configurado (squash, merge ou rebase);
2. só com o merge feito o card vai para Concluído, e a pasta de trabalho da história é removida;
3. se o merge falhar (conflito, checks obrigatórios, sem acesso), o card fica Bloqueado com o erro
   e continua na Homologação.

O merge não acontece se a história não tiver PR registrado ou ainda tiver sub-tarefas em aberto. Com
o merge automático desligado, aprovar só marca o card, e a IA o move para Concluído.

### Detecção automática de merges

O board pode observar o pull request de uma história entregue e detectar quando ele é mergeado,
concluindo a história automaticamente. A opção nasce ligada (Settings do editor, Faz AI › Git,
**Concluir a história quando o pull request for mergeado**). Uma rotina periódica verifica o estado do PR a cada
intervalo configurável (**Verificar a cada (minutos)**, padrão 15, faixa de 5 a 1440). Quando o
merge é detectado:

1. o board grava o commit do merge no card;
2. registra na conversa que a história foi concluída;
3. move o card para Concluído e remove a pasta de trabalho.

Se o pull request é fechado sem merge, o board registra um aviso na conversa uma única vez. O merge
continua sendo feito pela pessoa, manualmente ou pelo merge automático; o board só observa. Falhas
na consulta do estado do PR (sem rede, sem autenticação, sem o `gh` instalado) não bloqueiam nada
— o aviso aparece no log, e a rotina continua tentando no próximo intervalo.

Na mesma rodada, depois de olhar os pull requests, o board dá o último passo do ciclo: **quando a
versão que contém uma história concluída é publicada, ele registra na conversa qual versão a levou
(tag e link da release) e arquiva o card**. Assim a coluna Concluído fica só com o que está mergeado
e ainda não chegou a quem usa; o que já foi entregue vai para a aba Arquivados, de onde você pode
restaurar a história (com as sub-tarefas arquivadas dela) a qualquer momento. Não há o que ligar: o passo vem junto com a detecção de merges,
no mesmo intervalo e no mesmo liga/desliga, e nasce ligado com ela.

Uma história conta como publicada quando existe uma tag que **contém** o commit do merge **e** que
tem uma **release publicada** no GitHub — é o que o `npm run release` deste projeto cria. Tag sem
release não vale, release em rascunho não vale, pré-lançamento vale. A versão registrada é a mais
antiga entre as que contêm o commit, pela data de publicação. O critério é conservador de propósito:
arquivar tarde se corrige na rodada seguinte, arquivar cedo esconde um card sem ninguém notar.

Tudo aqui é melhor esforço. Projeto sem releases, fora do GitHub ou numa máquina sem o `gh`
simplesmente não arquiva nada: nenhum card é bloqueado e o motivo aparece uma vez no log. O board
nunca publica versão — ele só lê o que você publicou — e histórias concluídas antes desta versão, que
não têm o commit do merge guardado, continuam sendo arquivadas por você, com um clique.

### Heartbeat

Com o heartbeat ligado (Configurações → Harness de IA), o board chama a IA sozinho a cada
intervalo, enquanto o editor estiver aberto na pasta do projeto. Em cada rodada ela avança os cards
aprovados, responde às mensagens pendentes e trabalha nos cards prontos, com uma execução por história.
As atividades **sem branch** (refinar, resumir e as fases que só produzem documento, como Discovery,
PRD, Spec e Plan no board padrão; vale a coluna que tem artefato antes da fase de código) rodam ao
mesmo tempo em qualquer modo de workspace, até **Histórias ao mesmo tempo** (duas por padrão, até
seis), mesmo com **Tocar histórias em paralelo** desligado. As atividades **com branch**
(Implementação e Homologação) seguem o limite de antes: uma por vez fora do worktree. No modo
"Worktree por história", **Tocar histórias em paralelo** (Settings do editor, Faz AI › Git; nasce desligado) faz o heartbeat
tocar várias histórias com branch ao mesmo tempo, cada uma na sua pasta de trabalho, até o mesmo
**Histórias ao mesmo tempo**. Os dois tetos (texto e branch) contam separados; cada um conta toda
execução em andamento, inclusive as chamadas à mão. No modo autônomo (cujas histórias são
empilhadas), a ordem da fila vale para as histórias que precisam de branch; uma história em fase de
texto começa assim que há vaga, mesmo com a anterior ainda aberta. Fora do worktree, o
`prepare_workspace` chamado numa fase de texto enquanto outra história tem execução em andamento é
recusado (pasta em uso): a branch nasce na fase de código. Em permissão "Sem restrições" a IA ainda
pode trocar de branch à mão; a guarda cobre só o caminho do board. A descrição de cada chave de Git no
Settings explica o motivo em cada modo: com branch na própria pasta, duas histórias ao mesmo tempo
trocariam a branch uma debaixo da outra e misturariam alterações; com worktree elas ficam isoladas,
ao custo de mais uma cópia dos arquivos em disco por história (com as dependências instaladas em
cada uma) e de mais memória e processador enquanto várias sessões de IA, testes e builds rodam
juntos. No editor a aba Git e o bloco de paralelo do Harness de IA viram um link para o Settings; no
navegador seguem como campos editáveis, como antes.

- Sem pendência com a IA, nada é executado.
- A fila da rodada segue a ordem do board: os bugs primeiro; depois a história mais à direita (a
  mais adiantada termina antes de uma nova começar); na mesma coluna, de cima para baixo — o que
  decide é a posição do card, não o número dele nem o que já foi aprovado.
- Cards que estão com você (aguardando revisão ou resposta, bloqueados) não são tocados, a menos
  que você tenha deixado uma mensagem sem resposta na conversa.
- **Rodar o heartbeat agora** (nas configurações ou pelo comando **Faz AI: Rodar o heartbeat agora**) começa
  uma rodada na hora, mesmo com o heartbeat desligado. **Faz AI: Parar as execuções da IA e o modo autônomo**
  interrompe tudo.
- A barra de atividade no pé do board (visível em qualquer vista) mostra o que a IA está fazendo
  agora: com uma execução, "IA em #12 (Discovery, há 3 min)", com a referência do card clicável
  para abri-lo; com várias, "IA em N cards: #12 Discovery · #15 refinando · …" e a lista completa
  no tooltip. Sem nenhuma execução, mostra o motivo: a nota do autopiloto (por que a fila parou), o
  estado do heartbeat ("Heartbeat desligado", "Heartbeat parado: motivo", "Próxima rodada às
  HH:MM") ou, por fim, "IA parada".
- O **coração** no topo direito do board mostra o heartbeat: vermelho e batendo quando ele está
  rodando; cinza e parado quando está desligado ou não consegue rodar (sem ligação com o Faz AI ou
  sem a ferramenta). Clicar nele liga e desliga o heartbeat.
- As execuções usam a mesma permissão e o mesmo tempo limite do botão "Trabalhar na fase".

Quais colunas exigem aprovação, e em quais a IA atua, se define em Configurações → Workflows e
colunas. Você mesmo pode mover qualquer card sem aprovação.

### Modo autônomo (YOLO)

Uma **história** pode ser marcada como **YOLO**: no painel do card, ligue **Modo autônomo**
(o board pede uma confirmação, porque o modo abre mão de toda aprovação). A partir daí a IA toca a
história sozinha, **sem pedir autorização nem confirmação para nada**:

- Do **Backlog** até a última coluna em que a IA atua (Homologação, no board padrão): ela faz o
  Discovery, o PRD, a Spec e o Plan, cria as sub-tarefas, implementa uma por uma e, nessa última
  coluna, abre o pull request, registra com `set_pull_request` e para ali — a história fica
  aguardando a sua revisão. As colunas que exigem aprovação deixam de segurar o card, e o pedido de
  revisão da IA vira aprovação na hora, com o resumo registrado na conversa.
- **Sem perguntas**: a IA não usa `ask_question`; diante de uma dúvida ela decide e registra a
  decisão e o motivo na conversa. Só um impedimento real (acesso, ambiente, falha que ela não
  resolve) bloqueia o card.
- **Sem merge**: a IA para na última coluna em que atua, com o pull request aberto; o merge e o
  avanço até Concluído continuam sendo seus. Concluído quer dizer mergeado.
- **Sem restrições**: nas execuções do modo, a IA roda com a permissão "Sem restrições" (altera
  arquivos e roda comandos), porque precisa de git e do `gh`. Ligar o modo é aceitar isso para a história.
- **Em fila e em pilha**: o **autopiloto** toca as histórias em modo autônomo uma de cada vez, na
  ordem do board — bugs na frente, depois a mais à direita, e na mesma coluna de cima para baixo —, e segue para a próxima história da
  fila assim que a atual é entregue (parada na última coluna da IA, com o pull request registrado),
  sem esperar a sua revisão nem o intervalo do heartbeat. Nenhum impedimento segura a fila: uma
  história bloqueada, esperando a sua resposta, esperando outro card terminar (dependência) ou
  travada num ciclo (aberta, mas sem nada pendente com a IA) é pulada, e a vez passa para a próxima
  história da fila que puder avançar — rodar, ou mudar de coluna quando a IA não atua nela. Uma
  história que depende de outra continua esperando essa outra terminar, mesmo com histórias mais
  abaixo na fila passando na frente dela; ela volta a disputar a vez quando a dependência sai de
  aberto. Só quando nenhuma história da fila pode avançar o autopiloto mostra o aviso de
  impedimento, com a razão da primeira história parada. A branch de cada história parte da branch
  criada mais recentemente entre as outras histórias do modo autônomo ainda abertas — a mesma ordem em
  que a fila roda, mesmo depois de arrastar cards —, e o pull request é aberto com `--base` nela,
  formando uma pilha de PRs; sem nenhuma outra história aberta antes dela, a branch parte da principal.
  Uma história cuja anterior na pilha já teve o pull request mesclado também parte da principal, já que
  o código dela já está lá.
- **Dividir um pedido grande**: a IA pode criar as histórias seguintes a partir de uma história em
  modo autônomo (`create_card` com `autonomous_from`). Elas nascem em modo autônomo, entram na fila
  e ganham um vínculo **relativo** com a história de origem (pulado em silêncio se já existir
  qualquer vínculo entre as duas). Ela nunca liga o modo numa história que você não ligou.
- **Freios**: o autopiloto para quando a IA bloqueia o card ou quando uma execução falha (o card
  fica Bloqueado, com o motivo) e bloqueia a história depois de 3 execuções seguidas que não
  avançaram nada. Ao destravar o card, ele continua sozinho.

O **botão do modo autônomo** no topo do board aparece enquanto houver história na fila e diz o que
o clique faz: **Pausar modo autônomo** (aceso, com o autopiloto tocando; pausar interrompe a IA) ou
**Retomar modo autônomo** (apagado, pausado). Pelo editor: **Faz AI: Pausar o modo autônomo (YOLO)**, **Faz AI: Retomar o modo autônomo
(YOLO)** e **Faz AI: Parar as execuções da IA e o modo autônomo**. Ao abrir o editor, o autopiloto
retoma sozinho a fila que ficou pendente (a pausa é sua: o que você pausou só volta quando você
retomar). O heartbeat não toca histórias em modo autônomo; elas são do autopiloto.


### Agentes

![Agente com intenção, skills escolhidas e ferramentas só de leitura](docs/images/agents.png)

Um agente é um **arquivo de agente da ferramenta de IA** (`~/.claude/agents/<nome>.md`,
`~/.cursor/agents/<nome>.md`): as instruções são o papel da
sessão, e o frontmatter diz o modelo e o esforço, as ferramentas (disponíveis e negadas), as skills e
os servidores MCP que ela recebe. Para o board, agente e perfil de execução são a mesma coisa. Os
arquivos são lidos do disco; o board só guarda, por projeto, quais estão **disponíveis** e qual é o
**padrão** (Harness de IA → Ferramenta e execução). Toda execução pelo board roda através de um
agente: o escolhido no card; senão, o da fase (Workflows e colunas → Fase); senão, o padrão. Sem
nenhum marcado, vale o agente embutido, sem instruções.

Os agentes que o board cria vão para a pasta global da ferramenta (valem em qualquer projeto), e os
que já existem no projeto aparecem na aba **Projeto**. Na primeira abertura do board, dez agentes de
fábrica são criados no global, marcados como disponíveis, com o **condutor-do-board** como padrão:
ele conduz os cards pelo fluxo, indica o especialista certo em cada sub-tarefa e, na Implementação,
delega cada uma a esse especialista como subagente (a sessão da história recebe os outros agentes
disponíveis do board como subagentes). Os outros
(frontend-web, backend-node, backend-python, mobile-flutter, documentacao-tecnica, qa-testes,
revisor-de-codigo, devops-infra, dados-sql) têm instruções mínimas, para você ou a IA adaptar ao
projeto. O que você apagar não volta sozinho; **Recriar os agentes padrão** recria o que faltar.

Na aba Agentes de cada escopo:

- **Disponível no board**: os cards e as fases podem escolher o agente. **Tornar padrão** o faz
  executar quando nenhum deles escolhe.
- **Novo agente**: nome, descrição (é por ela que o Refinar com IA escolhe), modelo e instruções.
- **Editar**: cada campo do frontmatter grava ao sair; as instruções têm Salvar. As skills vêm da
  mesma janela do card (só as marcadas); as ferramentas têm conjuntos prontos (**Só leitura**,
  **Editar código**).
- **Sugerir agentes com IA**: a IA lê o projeto (estrutura, dependências, README) e cria ou ajusta
  de 3 a 8 agentes para ele, pelo MCP, deixando-os disponíveis. O resultado fica no chat do board.

Cada execução pelo board ("Trabalhar na fase", "Refinar com IA" e heartbeat) é uma sessão nova, de
contexto vazio, só com o que está no card. O agente vira parâmetros da linha de comando onde a
ferramenta aceita; o resto segue no prompt, como instrução:

| Ferramenta | Imposto por parâmetro | Só orientado |
| --- | --- | --- |
| Claude Code | agente (inline, em `--agents`), servidores MCP, ferramentas, modelo e esforço, contexto vazio | skills e rules |
| Cursor | modelo | todo o resto |

As skills e as rules vão sempre pelo caminho do arquivo. Numa conversa aberta por você, o agente
chega à IA pelo `get_card` (`execution`), como orientação. Pelo MCP, `get_board` lista os agentes
disponíveis, `set_card_profile` escolhe o de um card e `create_agent`, `update_agent`, `get_agent` e
`delete_agent` gerenciam os arquivos.

## Harness de IA

![Skills do projeto e globais, com a instalação da skill do fluxo no global ou no projeto](docs/images/harness.png)

Toda execução pelo board parte de **contexto vazio**: nenhuma regra, skill ou agente da sua máquina
ou do projeto entra por conta própria. Em Configurações → **Harness de IA** você marca o que entra,
em quatro abas: **Ferramenta e execução** (a IA do projeto, a permissão, o agente padrão e o
heartbeat), **Projeto** e **Global** (os arquivos de cada pasta, em três sub-abas: **Rules**,
**Agentes** e **Skills**, com a marcação em cada linha) e **Tudo que a ferramenta carrega**. Projeto
e Global são só a pasta de onde o arquivo vem; o que vale é a marcação, que é deste board.

Em Rules e Skills, cada linha tem duas caixas que se excluem:

- **Incluir em todo contexto**: o arquivo entra em toda execução (trabalhar a fase, refinar, chat do
  board), pelo caminho. É o lugar da skill do fluxo e das regras que valem sempre.
- **Usar quando fizer sentido**: vira opção dos campos **Rules** e **Skills** dos cards (e das skills
  dos agentes), e o **Refinar com IA** a indica quando o pedido pede. Sem marcação, a execução não a
  vê, mesmo que a ferramenta a carregue numa conversa sua.

Uma marcação cujo arquivo sumiu aparece como **não encontrada**, para desmarcar ou recriar. Skills e
agentes criados ou instalados pelo board já nascem marcados. O que ainda entra apesar do contexto
vazio depende da ferramenta: no Claude Code 2.1 nada da sua pasta nem do projeto (verificado na
CLI); no Cursor, tudo o que a ferramenta carregar, e o board só orienta.

Na aba **Tudo que a ferramenta carrega**, em **Tudo que cada ferramenta carrega**, há uma aba por
ferramenta com oito seções (instruções e regras, skills, subagentes, comandos e prompts, hooks,
servidores MCP, plugins, configurações e permissões), cada uma dividida em três escopos:

- **Projeto**: arquivos desta pasta; valem só aqui e vão no repositório. Esse grupo aparece sempre,
  em destaque, e diz quando o projeto não tem nada daquele tipo.
- **Global**: arquivos da sua pasta de usuário (`~/.claude`, `~/.cursor`…); valem em
  todos os seus projetos. Toda alteração neles pede confirmação.
- **Plugins**: vêm de pacotes instalados; não são alterados pelo board, mas podem ser copiados.

O que dá para fazer:

- **Ler a lista sem esforço.** Cada item mostra o nome, a descrição como dica (limitada a duas
  linhas) e, numa linha própria, o caminho do arquivo por inteiro. Clicar no caminho abre o arquivo
  no editor, onde ele também é editado.
- **Agir em vários de uma vez.** Cada linha tem uma caixa de seleção, e a do cabeçalho marca o
  grupo todo. Com itens marcados aparece uma barra: deixar as skills automáticas ou só quando
  indicadas, copiar para o projeto ou para o global, e apagar, sempre com confirmação.
- **Criar** um item no lugar e no formato que a ferramenta espera, **apagar**, e **copiar** skills,
  subagentes, comandos e regras do global ou de um plugin para o projeto (e do projeto para o global).
- **Servidores MCP**: acrescentar e remover, no formato de cada arquivo.
- **Hooks e permissões**: acrescentar e remover hooks e regras de permitir, perguntar e negar.
- **Buscar e instalar skills** de uma pasta ou de um repositório git: o board lista as skills
  encontradas e copia só as que você escolher. Nada do repositório é executado.

### Skills sob demanda

Cada skill tem um modo:

- **Automática**: a IA vê a descrição em toda sessão e decide quando usar.
- **Só quando indicada**: a IA não a invoca sozinha; vale quando um card a indica ou quando é
  chamada pelo nome.
- **Desligada** (só no projeto): a ferramenta não a enxerga, e ela sai das opções do board.

O modo diz como a ferramenta trata a skill numa conversa sua; nas execuções do board o que vale é a
marcação. O campo "Skills" do card mostra um resumo do que está marcado e abre uma janela para
escolher entre as skills marcadas como **Usar quando fizer sentido**: busca por nome ou descrição,
abas **Todas / Marcadas / Projeto / Globais / Plugins** e uma caixa de seleção por skill, com a
origem à vista. O campo "Rules" faz o mesmo com os arquivos de instruções marcados. O card entrega à
IA o caminho de cada arquivo, então ele não precisa estar à vista da ferramenta para ser usado. Assim
dá para ter muitas skills disponíveis sem ocupar o contexto de toda sessão. A economia de contexto é documentada no Claude Code e no Cursor;
nas outras ferramentas, a documentação diz só que a IA deixa de invocar a skill sozinha.

Para não marcar skills card a card, escolha-as no tipo: em Configurações → **Tipos de card** →
**Padrões por tipo**, as skills do campo "Skills" (e o modelo) ficam preenchidas em todo card novo
daquele tipo. Cada card ainda pode mudá-las.

### Modelos e referências

Modelos de classe e exemplos de código ficam dentro da pasta da skill (`references/`, `assets/`,
`scripts/`). O botão **Arquivos** de cada skill lista, cria e apaga esses arquivos, e **Criar skill
de modelos** cria no projeto uma skill própria para eles. O card que indica a skill recebe os
caminhos dos arquivos de apoio.

O editor precisa estar aberto na pasta do projeto para a IA alcançar o board. O registro manual, os
formatos de cada ferramenta e a solução de problemas estão em [docs/mcp.md](docs/mcp.md).

## Configurações

![Configurações: catálogo de modelos e regras de sugestão](docs/images/settings.png)

| Seção | O que ajusta |
| --- | --- |
| Workflows e colunas | Quantos workflows quiser (cards independentes ou sub-tarefas), com nome editável e posição que você muda arrastando; **Nova coluna** em cada um; nomes, ordem (arrastando) e significado das colunas; em quais a IA atua e quais exigem aprovação; a fase de cada coluna (instrução para a IA e modelo do documento). Abrir e fechar workflows e colunas é feito no próprio board e fica lembrado |
| Tipos de card | História, Bug, Sub-tarefa…, com cor e valores padrão de campos por tipo |
| Campos | Campos personalizados (texto, seleção, data, modelo…) e onde aparecem; opções de seleção que são tecnologias (Flutter, React, Python…) ganham o logo |
| Regras do board | Bloqueios de conclusão e de avanço de fase, confirmações, preenchimento do modelo sugerido |
| Harness de IA | Ferramenta do projeto, permissão, agente padrão e heartbeat; rules, agentes e skills do projeto e do global, com a marcação do que as execuções usam; tudo que cada ferramenta carrega, por escopo (ver [Harness de IA](#harness-de-ia) e [Agentes](#agentes)) |
| Modelos de IA | Modelos e níveis de esforço da ferramenta; regras que sugerem o modelo de cada card |
| Git | Fica só na aba Git do modo navegador; no editor, aponta para o Settings (Faz AI › Git) |
| Aparência | **Idioma** (automático, Português (Brasil) ou English; fica no Settings do editor junto com tema, fonte e tamanho); status (nome e cor, na aba Fluxos; aqui só no modo navegador) |
| Backup | No editor, exportar e importar pela paleta de comandos (`fazai.exportBoard`, `fazai.importBoard`); no modo navegador, pela aba Configurações (ver [Backup do board](#backup-do-board)) |

### Configurações no Settings do editor

Em `Ctrl+,` (Settings do VS Code ou do Cursor), buscar **Faz AI** mostra a categoria do Faz AI, com
quatro seções, nesta ordem:

| Seção | O que tem hoje |
| --- | --- |
| Instalação | Um texto curto e o link **Abrir o Diagnóstico do ambiente**, que abre o board na tela do Diagnóstico |
| Aparência | **Idioma** (`fazai.appearance.language`), **Tema** (`fazai.appearance.theme`), **Fonte** (`fazai.appearance.font`) e **Tamanho** (`fazai.appearance.fontSize`), todos com escopo Usuário — valem em todos os projetos desta pessoa. Status (rótulo e cor de cada status) continuam no board, agora na aba Fluxos |
| Git | As nove chaves `fazai.git.*`, todas com escopo **Recurso** (o valor do Usuário é o padrão de todos os projetos; Workspace ou Folder sobrescreve só no projeto ou na pasta): `fazai.git.mode` (onde a IA mexe no código: `worktree`, `branch` ou `off`), `fazai.git.branchPattern` (padrão do nome da branch), `fazai.git.worktreeDir` (pasta das worktrees), `fazai.git.parallel` e `fazai.git.parallelStories` ("Tocar histórias em paralelo", de 2 a 6; o teto de "Histórias ao mesmo tempo" vale também, em qualquer modo, para as fases só de texto), `fazai.git.autoMerge` e `fazai.git.mergeMethod` (merge automático do PR e o tipo: squash, merge ou rebase) e `fazai.git.watchMerges` e `fazai.git.watchMergeMinutes` (acompanhar merges fora do board, de 5 a 1440 minutos). No editor, a aba Git e o bloco de paralelo do Harness de IA viram link para estas chaves; no navegador seguem como campos editáveis |
| Backup | Dois links de ação: **Exportar o board agora** e **Importar um board**, que disparam os comandos da paleta |

Três comandos novos na paleta (`Ctrl+Shift+P`): **Faz AI: Abrir o Diagnóstico do ambiente**,
**Faz AI: Abrir as configurações do Faz AI no Settings** (o Settings já filtrado no Faz AI) e
**Faz AI: Abrir as configurações do board** (a tela de Configurações do board). Em Configurações do
board, o botão **Abrir no Settings do editor** faz o caminho de volta; no modo navegador
(`faz-ai` no terminal) ele não aparece, porque não há editor.

Quem manda: dentro do editor, o Settings é a fonte e o banco do board (SQLite) é a cópia, mantida
igual a cada mudança, para o modo navegador e o servidor MCP continuarem enxergando o mesmo valor;
fora do editor, o SQLite é a única fonte, e uma gravação feita por ali (pelo MCP ou pelo navegador)
é levada ao Settings do Usuário quando o editor está aberto. Nas quatro chaves de Aparência
(idioma, tema, fonte, tamanho): na primeira abertura de um board, se o Settings do editor ainda não
tem valor explícito e o board tem um valor não-padrão, ele é copiado para o Settings (e passa a valer
em todos os projetos); se o Settings já tem um valor explícito, ele vence e o board adota aquele
valor. Com múltiplos boards diferentes abertos pela primeira vez após uma atualização, o valor do
primeiro board a abrir é o que passa para o Settings, e os demais boards subsequentes herdam esse
valor — até a pessoa alterar o Settings, momento em que todos veem o novo valor.

Sobre os modelos: **Detectar modelos** lê a lista da ferramenta (no Cursor, dos modelos da sua conta, pelo comando `cursor-agent models`, lido ao abrir o board
com a CLI autenticada, e a primeira lista lida substitui a embutida uma vez só; no Claude Code, uma lista embutida que pode ser editada). No Cursor, a lista traz uma linha por nível de cada modelo
(`claude-opus-5-5-low`, `-medium`, `-high`…); o board junta as variantes num modelo com os níveis
dele. As versões rápidas (`-fast`, respondem mais depressa e cobram mais pelos mesmos tokens) ficam
de fora até você ligar **Incluir os modos rápidos** no cartão do Cursor: aí cada uma entra como um
modelo à parte ("Claude Opus 5.5 1M Fast"), só para os modelos que estão no
catálogo; desligar a chave as tira do catálogo.
Pelo MCP, é a regra `includeFastModels` do `update_rules`. No plano gratuito do Cursor só o **Auto** roda: os outros
modelos são recusados antes de começar (o card bloqueado explica como escolher Auto), e por isso
as regras de sugestão do Cursor começam todas em Auto. As regras de sugestão combinam
condições com E e OU, por exemplo `Esforço da atividade = Alto E Tags = backend`. O resultado é
sempre uma sugestão: no card, o modelo e o esforço podem ser trocados a qualquer momento.

Cada regra pode ter um **modelo reserva** (opcional). Quando a execução de um card falha porque o modelo principal esgotou o limite de uso do plano, e esse modelo veio de uma regra com reserva configurada, o sistema repete automaticamente a execução com o modelo reserva, uma única vez. Se o reserva também falhar ou não estiver configurado, o card é bloqueado como hoje. A troca automática aparece como um comentário na conversa do card ("O `<modelo principal>` esgotou o limite; a execução segue com `<modelo reserva>`"), e o campo Modelo do card continua mostrando o modelo principal — a próxima execução tenta o principal de novo.

**Avisos de dependência entre configurações e links cruzados.** Várias opções de Configurações só fazem efeito por causa de outra. O board mostra uma linha discreta sob as opções dependentes (por exemplo, "Depende de **uma regra de sugestão de modelo** (agora: nenhuma)" abaixo de "Preencher o modelo sugerido automaticamente", ou "Depende de **agentes marcados como disponíveis**" abaixo de "Agente padrão"); a opção fica desabilitada quando a dependência não está satisfeita. Os links permitem navegar: clique em um para ir até a seção correspondente do board, que rola e destaca por 2 segundos, ou clique em um link do Settings para abrir o board na seção certa. No modo navegador, os links para o Settings aparecem só como texto. **"Preencher o modelo sugerido automaticamente"** saiu de Regras e foi para Modelos, onde faz mais sentido — um aviso simples em Regras indica a mudança de lugar. O campo Intervalo do heartbeat fica desabilitado quando o heartbeat está desligado, sem um componente de dependência adicional. Cabeçalhos novos em Modelos, Agentes, Rules e Skills mostram "Mostrando os X do [ferramenta] · trocar ferramenta", permitindo mudar a ferramenta de qualquer uma dessas telas do board.

Quando uma versão nova da extensão muda o board padrão, o board pergunta se você quer atualizá-lo
(ou use **Faz AI: Atualizar board para o padrão atual**). A atualização só acrescenta o que falta:
nenhum card sai do lugar e o que você personalizou é mantido. Uma cópia do banco é gravada antes.

## Onde ficam os dados

O board e os anexos ficam no armazenamento da extensão, fora do repositório. Cada pasta tem o seu
arquivo de banco (`boards/<chave da pasta>.db`), então janelas em projetos diferentes não
interferem uma na outra. Na primeira vez, o board parte de uma cópia do banco único das versões
anteriores (`fazai.db`), que fica intacto. Regras e skills são arquivos da pasta do projeto e
entram no git normalmente. Evite abrir a mesma pasta em duas janelas do editor ao mesmo tempo: a
última a salvar vence (a extensão avisa quando isso acontece).

### Backup do board

Para levar o board a outra máquina ou guardar uma cópia:

**No editor (VS Code ou Cursor):** use a paleta de comandos (`Ctrl+Shift+P`):

- **Faz AI: Exportar o board** abre o diálogo nativo de salvamento com o nome sugerido no padrão
  `<nome do board>-<data>.fazai.json`. Gera um arquivo com tudo o que está no board: colunas, tipos,
  campos, regras, modelos, agentes, cards (inclusive arquivados e na lixeira), conversas, checklists,
  vínculos, histórico e os anexos embutidos. Só o board da pasta atual sai no arquivo. Ele contém as
  conversas e os anexos: guarde-o com cuidado. Ao terminar, a extensão mostra a notificação "Board
  exportado em …" com o botão **Abrir pasta**.
- **Faz AI: Importar um board** abre o diálogo nativo de abertura de arquivo. Ao escolher um arquivo,
  mostra um resumo modal (nome do board, quantidade de cards e anexos, tamanho, versão) com aviso de
  que o board atual será substituído e que uma cópia de segurança (`.bak`) é feita antes. Ao
  confirmar, substitui o board e mostra a notificação com o resultado da importação.

Os comandos funcionam com o board fechado (sem o painel aberto): eles abrem o banco da pasta atual
do workspace sob demanda. Em um workspace com várias pastas, os comandos usam a primeira pasta
(mesma limitação já existente na extensão); não há seletor de pasta.

**No modo navegador** (rodando `~/.faz-ai/bin/faz-ai` no terminal): use **Configurações → Backup**:

- **Exportar board** gera um arquivo `.fazai.json` no seu computador (download).
- **Importar de um arquivo…** abre o seletor nativo da página.

**Em ambos os modos,** o arquivo importado:

- Mostra um resumo (nome, cards, anexos, tamanho, versão) e, depois da confirmação, grava uma cópia
  do banco (`<arquivo>.bak`, ao lado dele ou na pasta de dados), move os anexos do board atual para
  uma pasta de backup (`<anexos>.bak-<data>`), apaga o board atual e o substitui pelo do arquivo, com
  os mesmos números de card. O board importado passa a ser o desta pasta. Nada muda no banco se o
  arquivo for inválido ou se algo falhar no meio. A confirmação diz que os anexos foram para backup.
- Um arquivo exportado por uma versão anterior da extensão é atualizado ao ser importado; um arquivo
  de versão mais nova é recusado com a versão necessária. Importar com a IA executando um card não é
  permitido: espere a execução terminar. Arquivo de importação com id de card ou nome de anexo
  contendo caminho (`../`) é recusado.

Limites conhecidos: o histórico mensal consolidado do log não vai no arquivo, e as branches e pastas
de trabalho das histórias são importadas como estavam na máquina de origem (recrie a pasta pelo botão
do card).

## Desenvolvimento

```sh
npm install
npm run build
npm test
npm run typecheck
```

O `npm test` também roda o lint e confere a formatação; `npm run format` formata tudo. Para o
`git blame` pular o commit que só formatou o código: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

Pressione `F5` para abrir o Extension Development Host. O código fica em `src/extension` (host e
servidor MCP), `src/webview` (interface em React), `src/shared` (modelo, protocolo e as regras do
board usadas pelo host e pela interface), `src/mcp-bridge` (ponte stdio usada pelos clientes de IA)
e `src/cli` (o board fora do editor).

Para testar a interface sem o editor, `node dist/cli.js <pasta> --data <pasta de dados de teste>`
serve o board no navegador. Os testes cobrem a ativação da extensão (com um editor de mentira em
`test/fakes/vscode.ts`) e o servidor da página (`test/webServer.test.ts`).

### Teste e2e numa máquina recém-instalada (Cursor)

`npm run e2e:cursor` abre o Cursor dentro de um contêiner Docker com Ubuntu 24.04 limpo: sem Node,
git, gh, uv, Code Review Graph nem a CLI do Cursor. É o mesmo Cursor do computador, montado só para
leitura e sem nenhuma configuração sua, e já vem com a extensão empacotada da branch atual, no
projeto de teste `meu-app`. A janela abre na sua tela, e os links (login, **Saiba mais**) abrem no
navegador do computador. Serve para ver o Diagnóstico do ambiente e a instalação de cada item como
numa máquina nova. Dentro dele, o usuário `dev` tem `sudo` sem senha. Os logins são seus, feitos por
você.

| Comando | O que faz |
|---|---|
| `npm run e2e:cursor` | do zero: contêiner novo, com a extensão da branch atual |
| `npm run e2e:cursor -- continuar` | o mesmo contêiner (logins e instalações ficam), com a extensão atualizada |
| `npm run e2e:cursor -- parar` | fecha o Cursor e para o contêiner |
| `npm run e2e:cursor -- remover` | apaga o contêiner, a imagem e o cache (`~/.cache/faz-ai-e2e`) |

Precisa de Docker sem `sudo`, de uma sessão Wayland e do Cursor instalado em `/usr/share/cursor`
(pacote `.deb`). Os arquivos ficam em `scripts/e2e-cursor/`.

### Preparar o ambiente de desenvolvimento

O repositório tem todo o código, mas alguns itens ficam fora do git. Num clone novo (outra máquina,
por exemplo), eles precisam ser refeitos:

| Item | Para que serve | Como obter |
|---|---|---|
| Node.js 18+ e git | build, testes e o comando `faz-ai` | instalação normal |
| `.mcp.json` e `.claude/settings.local.json` | ligam a IA ao board; guardam caminhos da máquina | **Instalar neste projeto** na seção Servidores MCP do Harness de IA |
| Board e anexos | ficam no armazenamento da extensão, não no repositório | o board da pasta começa vazio na outra máquina |
| `.env.release` com `OVSX_PAT` | publicar no Open VSX | token em https://open-vsx.org/user-settings/tokens |
| Login da Azure CLI | publicar no VS Code Marketplace | `az login --allow-no-subscriptions`, com a conta dona do publisher |
| `gh` autenticado | criar a GitHub Release | `gh auth login` |
| `.claude/skills/publicar-extensao/` | passo a passo da publicação para a IA | copiar a pasta da máquina original |

Os três últimos só são necessários para publicar. A `main` só aceita mudanças por pull request, e o
script já cuida disso: `npm run release -- <patch|minor|major>` parte da main atualizada e limpa,
testa, cria a branch `release/vX.Y.Z` e nela ajusta a versão e os CHANGELOGs ("Não lançado" vira a
versão), faz o commit e empacota. Publica nas duas lojas, envia a branch, abre o PR para a main e,
com o push concluído, faz o merge (squash). Por fim atualiza a main local, apaga a branch de release
(local e remota) e cria a tag e a GitHub Release com o `.vsix`. Se algo parar depois da publicação,
`npm run release -- finish` retoma de onde parou (na branch de release ou na main), sem publicar de
novo. `--dry-run` ensaia sem publicar. As opções estão no topo de `scripts/release.mjs`.

Entre empacotar e publicar, o release abre o `.vsix` e confere os quatro arquivos de vitrine
(`README.md`, `README_EN.md`, `CHANGELOG.md`, `CHANGELOG_EN.md`): o changelog precisa ter o título
da versão que está saindo no topo, sem nenhum "Não lançado"/"Unreleased" sobrando em lugar nenhum, e
o README precisa ter os blocos de aviso de fase alpha e de agradecimento. Falhando qualquer coisa, o
release recusa antes de publicar em qualquer loja. O renomear de "Não lançado" para a versão
acontece em todos os modos, inclusive no `--dry-run`; quando o release não chega a commitar (dry-run
ou `--no-git`), os CHANGELOGs renomeados são restaurados ao original ao final. Sem nenhuma seção
"Não lançado"/"Unreleased" para renomear, use `--allow-no-notes` — só é exigida quando faltar essa
seção **e** a primeira seção do CHANGELOG não for a versão que está saindo.

Dois cuidados:

- se reescrever o texto de um bloco de aviso do README, atualize a tabela `SHOWCASE` em
  `scripts/releaseCheck.mjs` com o novo texto; do contrário o release recusa publicar um README
  correto, por desenho (falso positivo).
- um Ctrl+C no meio do release pode deixar os CHANGELOGs com o título renomeado em disco; desfaça com
  `git checkout CHANGELOG.md CHANGELOG_EN.md`.

## Histórico de versões

O que mudou em cada versão está no [CHANGELOG.md](CHANGELOG.md).

## Licença

[MIT](LICENSE)
