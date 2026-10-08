🇧🇷 Português · [🇺🇸 English](CHANGELOG_EN.md)

# Changelog

As mudanças de cada versão do Faz AI Kanban, da mais recente para a mais antiga.

## Não lançado

- **História bloqueada segurava a fila inteira do autopiloto.** Com a primeira história da
  fila parada por um impedimento (bloqueio, pergunta sem resposta, dependência de outro card em
  aberto ou um ciclo emperrado), o autopiloto ficava parado e nenhuma das outras histórias
  autônomas independentes rodava, mesmo prontas. Agora qualquer impedimento é pulado na varredura
  da fila: o autopiloto segue para a próxima história que puder avançar (rodar, ou mudar de coluna
  quando a IA não atua nela). Uma história que depende de outra continua esperando essa outra
  terminar. A fila só mostra o aviso de impedimento quando nenhuma história pode avançar, com a
  razão da primeira que ficou parada.
- **Entrega da história autônoma não era detectada quando o PR chegava antes da última coluna.**
  Ao registrar o pull request (`set_pull_request`), o board só marcava `waiting_review` e comentava a
  entrega se a história já estivesse na última coluna em que a IA atua; registrado antes disso, a
  entrega nunca era detectada e o autopiloto ficava tentando executar de novo uma história que já
  tinha sido entregue. Agora essa verificação (`settleDelivery`) também roda ao mover o card para a
  última coluna e no `settle` do runner, ao fim de uma execução.
- **Backup pela paleta de comandos.** No editor, os comandos `fazai.exportBoard` ("Faz AI: Exportar
  o board") e `fazai.importBoard` ("Faz AI: Importar um board") na paleta de comandos (`Ctrl+Shift+P`)
  abrem diálogos nativos de salvamento e abertura de arquivo, funcionam com o board fechado (abrem o
  banco sob demanda) e mostram notificações com o resultado. A aba "Backup" das Configurações do board
  deixou de aparecer no editor — continua só no modo navegador. No Settings nativo (`Ctrl+,`), a
  categoria "Faz AI: Backup" ganhou os links "Exportar o board agora" e "Importar um board" que
  disparam os comandos. Com múltiplas pastas no workspace, os comandos usam a primeira pasta
  (limitação conhecida).
- **Hint formatado nos botões "Trabalhar na fase" e "Refinar com IA".** Os botões que executam essas
  ações (na barra de status do card e na aba de comentários) mostram um tooltip rico com a explicação
  formatada em negrito e tópicos, em lugar do `title` HTML nativo. O hint abre ao passar o mouse ou
  focar com o teclado, fecha com Esc, e continua visível quando o botão está bloqueado, para que você
  saiba o motivo mesmo sem poder clicar.
- **A Implementação em modo autônomo parava com o condutor.** A execução de uma história é quem
  faz as sub-tarefas da Implementação, delegando cada uma a um subagente; mas o `condutor-do-board`
  (padrão desde a migração dos perfis) roda só com leitura, e essa restrição ia para a linha de
  comando do Claude Code (`--tools`), tirando da sessão a ferramenta de lançar subagentes e deixando
  os especialistas de fora (o contexto vazio não carrega os agentes do usuário). O condutor repetia
  que "a execução automática vai cuidar" até o board bloquear o card. Agora a sessão de uma história
  recebe os outros agentes disponíveis do board como subagentes (com as ferramentas e o modelo de
  cada um), o agente dela ganha a ferramenta `Agent`, e a restrição de ferramentas dele vai na
  própria definição, não na sessão. O condutor de fábrica passa a dizer isso nas instruções; o
  `condutor-do-board.md` que já existe na sua pasta não é sobrescrito, mas a correção não depende
  dele. E uma lista de ferramentas num agente é fechada: o Claude Code deixa de fora tudo o que não
  está nela, inclusive os servidores MCP que carregou — o servidor do board conectava, mas a sessão
  do condutor não tinha `get_card` nem `add_comment` e parava sem registrar nada (o Diagnóstico dizia
  que estava tudo certo porque estava: o registro e a conexão nunca foram o problema). Agora toda lista
  de ferramentas que o board monta para um agente, o da história ou um especialista, leva junto as
  ferramentas do servidor do board (`mcp__faz-ai__*`): na linha de comando e também no arquivo do
  agente, para ele falar com o board quando é chamado como subagente no chat do editor. Os arquivos
  que o board já tinha gravado (os de fábrica, como o condutor) são completados uma vez na abertura;
  a interface não mostra esse nome, só a lista que você escolheu.
- **Agente padrão depois da migração dos perfis.** Ao abrir um board gravado por uma versão anterior, o
  "Agente padrão" embutido (sem instruções) virava o arquivo `~/.claude/agents/agente-padr-o.md`, com
  o nome truncado pelo acento e com Opus como modelo, e ficava como padrão do board no lugar do
  `condutor-do-board`. Agora esse perfil não vira arquivo (quem apontava para ele segue o padrão do
  board), os nomes migrados perdem só o acento (`agente-padrao`), e, quando o agente escolhido como
  padrão não existe, vale o condutor, não o primeiro da lista. Se o arquivo truncado já foi criado,
  apague-o em Configurações → Harness → Global → Agentes.
- **Instalar a skill do fluxo marca a skill mesmo quando ela já existia.** Desde o contexto vazio, a
  skill `faz-ai-fluxo` só conta como pronta quando existe **e** está marcada em todo contexto. Quem já
  tinha a skill no disco via o aviso no Diagnóstico e no board, e o botão **Instalar** não fazia nada,
  porque parava ao encontrar o arquivo. Agora o arquivo continua intocado (sem `replace`), mas a
  marcação entra, e o aviso some. O `install_flow_skill` do MCP diz na resposta que marcou.
- **Contexto vazio por padrão e Harness com marcação.** Toda execução pelo board (Trabalhar na fase,
  Refinar com IA, heartbeat, chat do board) passa a partir de contexto vazio: nenhuma regra, skill,
  agente, hook ou plugin da sua máquina ou do projeto entra por conta própria. No Claude Code isso é
  imposto por parâmetro (`--setting-sources ""`, `--disable-slash-commands` e um arquivo de
  servidores MCP só com o do board e os liberados pelo agente); no Cursor, orientação no
  prompt. O que entra é o que você marca em Configurações →
  **Harness de IA**, agora com as abas **Projeto** e **Global**, cada uma com Rules, Agentes e
  Skills. Rules e skills têm duas marcações: **Incluir em todo contexto** (entra em toda execução,
  pelo caminho) e **Usar quando fizer sentido** (vira opção dos campos Skills e do novo campo
  **Rules** dos cards, e o Refinar com IA a indica quando o pedido pede). O que não está marcado não
  existe para a execução. Skills criadas ou instaladas pelo board já nascem marcadas; a skill do
  fluxo é marcada em todo contexto ao ser instalada, e o Diagnóstico só a dá como pronta quando ela
  existe e está marcada. As ferramentas `get_harness` (com `usage` e `onlySelected`) e
  `set_harness_selection` expõem a marcação pelo MCP, e `get_card` devolve `requiredRules` ao lado
  de `requiredSkills`.
- **Agentes como arquivos da ferramenta.** Os perfis de execução deixam de ficar no banco do board:
  um agente é um arquivo de agente da ferramenta (`~/.claude/agents/<nome>.md`,
  `~/.cursor/agents/<nome>.md`), lido do disco; as instruções são o papel da sessão e o frontmatter
  guarda modelo, ferramentas, skills e servidores MCP (o que é só do board vai em chaves `faz-ai-*`).
  O board grava, por projeto, quais estão **disponíveis** e qual é o **padrão** (em Ferramenta e
  execução). Os perfis já gravados viram arquivos na pasta global na primeira abertura, sem
  sobrescrever nada; colunas e cards passam a apontar pelo nome. Um perfil que liberava todos os
  servidores MCP passa a liberar só o do board: os demais voltam no editor do agente. A aba Agentes de Configurações e o
  interruptor **Sessão limpa** saem: o contexto vazio é sempre. No Claude Code o agente vai inline
  (`--agents` + `--agent`), então não depende de nenhuma pasta de agentes. Na primeira abertura, dez
  agentes de fábrica são criados no global e marcados (condutor-do-board como padrão, frontend-web,
  backend-node, backend-python, mobile-flutter, documentacao-tecnica, qa-testes, revisor-de-codigo,
  devops-infra, dados-sql), com instruções mínimas; o que você apagar não volta sozinho, e **Recriar
  os agentes padrão** recria o que faltar. **Sugerir agentes com IA** manda a IA ler o projeto e
  criar ou ajustar agentes pelo MCP (`create_agent` e `update_agent` ganham `scope`, `model`,
  `tools`, `deniedTools`, `skills` e `mcp`; `get_board` lista os disponíveis em `agents`). O Refinar
  com IA recebe o catálogo marcado (agentes, rules e skills) e só indica o que está nele, escolhendo
  o agente do card com `set_card_profile`.
- **O board suporta só o Claude Code e o Cursor.** Codex, Kimi Code e GitHub Copilot saíram do
  **Harness de IA**, que agora oferece só essas duas ferramentas, e do restante da extensão: modelos
  embutidos, registro do servidor MCP, regras, skills e agentes, hooks, execução pela conversa e
  Diagnóstico. Um board que estava configurado com uma delas volta para o Claude Code ao abrir. O
  que o Cursor e o Claude Code ainda carregam de `.codex/skills` ou `AGENTS.md` continua listado.
- **O custo das execuções é o que a ferramenta informa; a tabela de preços saiu (#187).** Um valor
  calculado a partir de preços cadastrados envelhece quando o fornecedor muda a tarifa e deixa o
  relatório errado sem avisar, então o board deixou de calcular custo. O Claude Code grava o
  `total_cost_usd` que a própria CLI informa, mais os quatro contadores de tokens; o Cursor grava os
  tokens e fica sem custo (a CLI não informa). Saem a tabela embutida, a coluna de preço da aba **Modelos de IA**, o
  **Preço variável**, os campos `price_*`, `reset_price` e `variable_price` do `upsert_model`, a
  origem do preço no `get_models` e a regra **Cursor Token Rate** (`cursorTokenRate` no
  `update_rules`). Catálogos gravados antes perdem os campos de preço ao abrir o board. As execuções
  antigas continuam nas Métricas, marcadas como "estimado por tabela de preços". O `get_metrics`
  passa a chamar a coluna de **custo** (informado pela ferramenta), sem "estimado".
- **Toda chamada à IA passa por uma única porta (#187).** O executor de cards (manual, heartbeat e
  modo autônomo) e o chat repetiam o registro de uso, e o registro era opcional. Agora ambos pedem a
  execução a um `AiGateway`, que abre a linha em `ai_runs` antes de rodar, confere a permissão, cuida
  de interrupção e tempo limite e grava desfecho e consumo; cada ferramenta tem um provider próprio
  (comando e leitor da saída). Um teste cobre as quatro origens e falha se algum arquivo fora do
  gateway chamar a IA ou escrever no log. Em consequência, o log de uso não é mais opcional.
- **Configurações do Faz AI no Settings do editor.** Em `Ctrl+,`, buscar "Faz AI" mostra a categoria
  do Faz AI com as seções Instalação, Aparência, Git e Backup, nessa ordem. Instalação tem o link
  **Abrir o Diagnóstico do ambiente**; Aparência já traz o **Idioma** (`fazai.appearance.language`);
  Git e Backup avisam que as opções chegam nas próximas versões, com link para a aba do board. Três
  comandos novos na paleta: **Faz AI: Abrir o Diagnóstico do ambiente**, **Faz AI: Abrir as
  configurações do Faz AI no Settings** e **Faz AI: Abrir as configurações do board**; em
  Configurações do board, o botão **Abrir no Settings do editor** faz o caminho de volta (ele some no
  modo navegador). Dentro do editor o Settings manda e o banco do board é a cópia, para o modo
  navegador e o MCP verem o mesmo valor; fora do editor o banco é a única fonte, e o que for gravado
  por ali é levado ao Settings do Usuário com o editor aberto. Na primeira abertura, um board com
  idioma diferente do padrão grava esse idioma no Settings do Usuário, em vez de ser zerado.
- **Script de instalação do Diagnóstico todo em inglês.** O script gerado por **Instalar o
  necessário** / **Instalar os recomendados** misturava português ("Login da CLI", "instalação
  concluída", "pulado, porque … falhou") com a interface em inglês. Agora os nomes dos passos e as
  mensagens saem em inglês, e o teste varre o script contra texto em português.
- **Teste e2e do Cursor mais limpo.** O `npm run e2e:cursor` mostra só "Gerando a extensão…" e, se
  houver, o erro do build; a saída inteira só aparece quando o empacotamento falha. O aviso
  `groups: cannot find name for group ID` sumiu: os grupos do computador (vídeo, render) passam a
  ser criados dentro do contêiner, no `start.sh`, a partir dos ids recebidos.
- **Correção: o LED da sub-tarefa apagava segundos depois de acender.** Mover um card de coluna
  zerava o status de trabalho dele, inclusive o "Em execução": como a IA chama `start_work` e em
  seguida move a sub-tarefa para "Em andamento", o LED verde piscava por um instante e apagava, e a
  história não mostrava que a IA estava trabalhando nela. Agora o card em execução que vai para
  outra coluna em que a IA atua continua "Em execução"; os demais status seguem recomeçando ao
  trocar de coluna, e na conclusão não há status de trabalho.
- **O modo autônomo retoma sozinho ao abrir o editor.** Antes, as histórias que já estavam em modo
  autônomo ficavam paradas até um clique em **Retomar modo autônomo**, o que parecia o modo
  "não funcionar". Agora, ao abrir o editor (e sempre que a janela passa a ser a dona do board), o
  autopiloto retoma a fila pendente e registra isso no log. A pausa continua sua: o que você pausou,
  ou o que parou por falha ao iniciar a ferramenta, só volta quando você retomar; uma fila só de
  histórias entregues não o religa.
- **Correção: uma história que esperava dependência parava toda a fila do modo autônomo.** A
  primeira história da fila (ordem do board) que dependia de outra ainda aberta segurava o
  autopiloto com "espera #N terminar", mesmo com a própria #N pronta mais abaixo. Agora a história que
  espera dependência é pulada e a vez passa para a próxima que pode rodar; só quando nenhuma pode a
  fila para, com o motivo da primeira.
- **Ordem da fila: a história mais adiantada termina antes de uma nova começar.** A ordem de
  execução (heartbeat, modo autônomo e `get_pending_work`) era bug, linha do card e só então coluna,
  o que fazia uma história recém-criada no topo do Discovery passar na frente de uma Implementação
  pela metade. Agora é bug primeiro; depois a coluna mais à direita; na mesma coluna, de cima para
  baixo. Um bug novo entra como o próximo da fila assim que a execução em andamento termina.
- **Roteiro "Como testar" na descrição do card e no pull request.** Na Homologação, a IA passa a
  gravar o roteiro de testes (o que foi construído, os passos com o resultado esperado e o que ficou
  de fora) na descrição da história e no corpo do PR, e não só na conversa. A instrução padrão da
  coluna e a skill do fluxo mudaram; o board com a instrução padrão anterior recebe a nova pela
  atualização do padrão (versão 5), e a skill já instalada precisa ser reinstalada com
  **Substituir** para trazer o texto novo.

- **Anexos em Markdown abrem formatados.** Um anexo `.md`/`.markdown` (como o PRD, o Spec ou o Plan
  de uma história) agora abre com títulos, listas, tabelas e blocos de código já formatados, em vez
  do texto cru com `#`, `**` e `|---|`. Um seletor **Formatado** / **Código** no cabeçalho da janela
  alterna para o texto cru quando é preciso; Editar, Salvar e Copiar conteúdo continuam operando
  sobre o Markdown, como antes. Imagens, JSON, texto puro e os tipos sem pré-visualização não mudam.
- **Correção: a pilha de branches do modo autônomo saía errada ao reordenar a fila por arrasto.** A
  branch de uma história nova do modo autônomo agora parte da branch criada mais recentemente entre
  as histórias YOLO abertas — a mesma ordem em que a fila de execução roda — em vez de partir da
  história de número de card menor mais próximo. Antes, arrastar um card para cima da fila deixava
  a pilha de pull requests com bases divergentes da ordem real, exigindo rebase manual. Histórias
  cuja história anterior já teve o pull request mesclado passam a partir direto da branch principal.
- **Correção: o board não abria com "FOREIGN KEY constraint failed".** A limpeza única de linhas
  órfãs, que roda ao abrir o banco, parava no primeiro órfão ainda apontado por outro órfão (o
  workflow de um board antigo usado pelos tipos de card dele). Agora ela tenta de novo depois que
  quem segurava sai, e um órfão que não sai não impede o board de abrir.
- **Diagnóstico do ambiente.** Uma lista, no estilo do `flutter doctor`, com o que o board precisa
  (Node.js, linha de comando da ferramenta, login, MCP do board, permissão) e o que ele aproveita
  (skill do fluxo, Git e repositório, GitHub CLI e login, Code Review Graph, grafo do projeto e
  busca semântica). Cada item tem para que serve, como o board o usa, a privacidade, a forma de
  resolver (comando para copiar, botão ou download) e o **Saiba mais**. Os comandos saem do sistema
  detectado (Windows, macOS e as famílias de Linux), e o Code Review Graph mostra dentro dele os
  pré-requisitos `uv` e Python.
- **Instalar tudo, no Diagnóstico.** **Instalar o necessário** e **Instalar os recomendados** mostram
  os passos e o script, e rodam num terminal do editor (bash ou PowerShell, conforme o sistema). Um
  passo que falha não para os outros, e a tela mostra o resultado de cada um, com o erro dos que
  falharam. No modo navegador, o script é para copiar.
- **MCP do board e skill do fluxo passam a ser requisitos** em todas as ferramentas, na faixa amarela e
  no Diagnóstico: o chat do editor depende do MCP, e a skill faz a IA seguir o fluxo. A faixa ganha o
  botão **Instalar a skill**, e o aviso de ligar o MCP no Cursor some segundos depois de ligado.
- **Caminho completo dos MCPs no editor.** O chat do editor não acha o que foi instalado depois que ele
  abriu (o Node pelo `nvm`, o `uvx`): o board grava o caminho completo nos registros do `faz-ai` e do
  `code-review-graph`, fora do git, e a faixa amarela avisa quando falta. A lista abre sozinha na
  primeira abertura do board na máquina e, depois, por **Verificar ambiente** nas Configurações ou
  por **Ver o diagnóstico completo** na faixa amarela.

- **Servidor do board no Cursor e nas outras ferramentas: instalação global que funciona e aviso que
  some.**
  - O botão de instalar mostra o resultado e o erro no próprio board. Antes iam para as notificações
    do editor, que o Cursor guarda na central sem mostrar: a instalação parecia não fazer nada.
  - **No Cursor, nada para instalar.** O global do Cursor é um processo só para todas as janelas,
    que sobe sem saber qual projeto atender: o servidor ficava com erro, e ligado à mão atendia o
    mesmo board em todas as janelas. Agora o board grava sozinho o `.cursor/mcp.json` do projeto
    (fora do git) assim que a pasta abre no Cursor, e tira a entrada global antiga. Na primeira vez
    em cada projeto, o aviso pede para recarregar a janela e depois para ligar o `faz-ai` em Cursor
    Settings → MCP (o Cursor deixa desligado todo servidor novo do projeto), com o botão **Abrir
    MCPs do Cursor**, que leva direto a Customize → MCPs, e some quando o servidor conecta.
  - O registro global das outras ferramentas diz ao servidor onde está o projeto: no Claude Code
    pela variável `CLAUDE_PROJECT_DIR`, no `mcp.json` do VS Code com `${workspaceFolder}`.
  - Um registro quebrado no arquivo do projeto (`.cursor/mcp.json` de outra pasta, de um node que
    sumiu) vale no lugar do global, e reinstalar o global não resolvia: o aviso agora traz
    **Corrigir o registro**, que tira o registro dali e deixa o global valendo.
  - A ponte (`bridge.js`) passa a morar em `~/.faz-ai/mcp/`, a mesma para o VS Code, o Cursor e o
    `faz-ai`. Um registro com a ponte de antes pede para instalar de novo.
  - GitHub Copilot: a instalação global grava também o `mcp.json` do perfil do VS Code.

- **Tema, fonte e tamanho da fonte migraram para o Settings nativo do editor.** As três chaves `fazai.appearance.theme/font/fontSize` agora existem no Settings do VS Code e do Cursor (escopo Usuário), ao lado de `fazai.appearance.language` que já estava lá desde a #179. Dentro do editor, a aba Aparência das Configurações do board mostra um link para abrir o Settings nativo; no modo navegador (`faz-ai` no terminal), a aba continua como antes, com os 4 campos, porque lá não há Settings de editor. A sincronização é automática: se o Settings ainda não tem valor explícito e o board tem valor não-padrão, o do board é copiado para o Settings e passa a valer em todos os projetos; se o Settings já tem valor explícito, ele vence (RF de sincronização #179 estendido para as três chaves novas). Com múltiplos boards diferentes abertos pela primeira vez após a atualização, vale o valor do primeiro board a abrir — os demais seguem o Settings a partir de então.
- **A tabela de status migrou da aba Aparência para a aba Fluxos.** Rótulo e cor de cada status continuam editáveis pelo board, mas agora em Configurações → Fluxos, não mais em Aparência; a interface (os campos e cores) permanece idêntica, nenhuma personalização anterior é perdida.

## 0.33.0

- **Imagens do README** de agentes, harness e modelos refeitas com a interface desta versão, em
  português e em inglês.
- **MCP e skill do fluxo instalados na seção de cada ferramenta, no global por padrão** ([#141](https://github.com/euclidesgc/faz-ai/issues/141)).
  - Em **Harness de IA → Tudo que a ferramenta carrega**, a seção **Servidores MCP** de cada
    ferramenta tem o servidor do board, e a seção **Skills** tem a skill do fluxo, cada um com o
    estado no global e no projeto e dois botões: **Instalar (padrão da ferramenta)**, que grava na
    configuração global (`~/.cursor/mcp.json`, `~/.codex/config.toml`, `claude mcp add --scope user`,
    `~/.claude/skills`…) e vale em qualquer repositório sem arquivo nenhum no projeto, e **Instalar
    neste projeto**, para fixar uma versão num repositório ou num fork.
  - Saíram os botões repetidos: **Conectar IA (MCP)** do menu das configurações e da aba da
    ferramenta, e **Instalar skill do fluxo** da aba Do projeto. A faixa de requisitos leva à seção
    Servidores MCP da ferramenta.
  - Instalar no projeto com um global já instalado pede confirmação, e a skill do fluxo que já existe
    no destino só é substituída depois de confirmar.
  - O registro global conta na faixa de requisitos, e as execuções do Cursor pelo board usam o
    global em vez de gravar `.cursor/mcp.json` no projeto quando ele leva a este board.
  - O Kimi Code, no projeto, grava em `.kimi-code/mcp.json`; antes, ia sempre para o global.
  - A ferramenta `install_flow_skill` do MCP aceita `tool`, `scope` (`user`, o padrão, ou
    `project`) e `replace`.
- **Preços do Cursor.** O **Auto** passa a ter **preço variável**: o Cursor cobra o preço do modelo
  para o qual cada pedido foi roteado, então o board não estima o custo dele em vez de usar um
  número fixo enganoso. A chave **Preço variável** existe em todo modelo de **Modelos de IA** e no
  `upsert_model` (`variable_price`), e "Detectar modelos" a preserva.
- **Tarifa do Cursor (Cursor Token Rate).** Nova chave no cartão do Cursor, desligada por padrão:
  soma US$ 0,25 por milhão de tokens à estimativa dos modelos de terceiros, como o Cursor cobra nos
  planos Teams e Enterprise; Composer, Grok e Auto são isentos. Pelo MCP, `cursorTokenRate` no
  `update_rules`. Execuções já registradas não são recalculadas.
- A dica da tabela de preços e o README explicam o modo rápido (modelo à parte, com preço próprio),
  o contexto longo (não separado: o Cursor só informa o total de tokens) e como o id de
  `cursor-agent models`, o nome da tabela de preços e o modelo do board se correspondem.

## 0.32.0

- **Agentes, modelos e regras não perdem uma mudança feita logo depois de outra.** Escrever a
  intenção de um agente e logo clicar em **Só leitura** apagava a intenção: a segunda mudança partia
  da lista de antes da primeira. O mesmo valia para o catálogo de modelos e para as regras de
  sugestão. Agora cada mudança parte da última enviada.
- **Regras de sugestão em inglês:** o nome do campo "Esforço da atividade", as opções e o nome das
  regras criadas pelo board aparecem traduzidos ("Task effort = Low"), como no card.
- **Imagens do README refeitas** com a interface desta versão, em português e em inglês.

- **Windows, macOS e Linux: o mesmo board, sem perda de dados.**
  - **Mesmo board no editor e no terminal:** no Windows, o `faz-ai` do terminal e o servidor do
    board iniciado pela IA chegavam à pasta com a letra do drive maiúscula (`C:\`), e o editor com
    minúscula (`c:\`): eram dois boards, dois bancos e dois servidores. Agora a chave é a mesma. No
    macOS, o `faz-ai` não resolve mais links simbólicos, para dar a mesma pasta que o editor.
  - **O banco nunca abre vazio por engano:** um arquivo que existe mas não pôde ser lido (no
    Windows, preso pelo antivírus ou pela sincronização de nuvem) abria um board vazio que apagava o
    verdadeiro no primeiro salvamento. Agora o board espera o arquivo ser liberado, ou avisa o erro.
    O salvamento também tenta de novo enquanto o arquivo estiver preso.
  - **Worktrees no Windows:** a pasta de trabalho de uma história era recusada ("já existe e não é
    uma worktree") a partir da segunda fase, porque o git lista o caminho com `/`. Uma worktree que
    não sai (arquivo preso) não deixa mais o registro pela metade.
  - **Duas janelas na mesma pasta no Windows** recebem o mesmo aviso de dados sobrescritos que no
    macOS e no Linux.
  - **`npm test` no Windows:** o `.gitattributes` fixa LF, e o checkout com CRLF não reprova mais
    todos os arquivos no Prettier. A política de skill do Codex (`agents/openai.yaml`) com CRLF é
    lida e trocada sem duplicar a chave.
  - **Atalho `faz-ai.cmd`** funciona com acento no nome do usuário. Abrir arquivos e pastas pelo
    board no navegador não passa mais pelo `cmd.exe`, que lia `&` e `%` do caminho como comandos.
  - **PATH do terminal (macOS e Linux):** um shell que demora a abrir (nvm, conda, oh-my-zsh) tem
    mais tempo, e uma falha não fica guardada até reabrir o editor. O board procura a CLI e o node
    também no nvm, Volta, fnm, asdf e mise, e no Windows na pasta do instalador do Cursor.

- **Execuções do Claude Code e do Cursor mais robustas.**
  - **Cursor:** o pedido vai pela entrada padrão, e não mais na linha de comando. No Windows, a CLI
    instalada como `.cmd` passava pelo `cmd.exe`, que corta a linha em 8191 caracteres e junta as
    linhas do pedido. No Copilot e no Kimi, que só recebem o pedido na linha de comando, um pedido
    longo vai para um arquivo que a ferramenta lê.
  - **Agente que restringe os servidores MCP (Claude Code):** usa o servidor do board da própria
    execução. Antes copiava o do `.mcp.json`, e falhava sem o registro ou rodava contra outra pasta.
    Os servidores da pasta no `~/.claude.json` são encontrados também no Windows.
  - **Nível "Board e arquivos" (Claude Code):** a leitura fica liberada também fora do projeto, onde
    estão as skills obrigatórias do card (`~/.claude/skills`).
  - **Parar e o tempo limite encerram a árvore inteira** (servidores MCP, testes, comandos que a IA
    iniciou), e não só a CLI.
  - **Como root** (contêineres, WSL como root), o Claude Code não roda "Sem restrições": o board
    avisa, em vez de cada execução falhar.
  - **Sem Node.js no PATH,** o servidor do board roda com o próprio runtime do editor.
  - O Claude Code embutido na extensão do editor é encontrado também no lado remoto (SSH, WSL,
    contêiner). Pastas temporárias de execuções interrompidas são apagadas no dia seguinte, e nomes
    de servidores MCP com ponto ou espaço são liberados certo.

- **O card aberto não perde mais o que foi escrito.**
  - **Descrição reescrita pela IA:** com o card aberto, a descrição nova aparece na tela, e fechar o
    card não grava mais a antiga por cima. Um rascunho seu continua valendo sobre a mudança de fora.
  - **Esc:** com o menu Ações aberto, fecha só o menu, e não o card. Num campo de texto, o primeiro
    Esc só sai do campo (e salva o título ou o item do checklist); o segundo fecha o card. Numa
    confirmação com lista de opções aberta, fecha só a lista.
  - **Título:** um título novo vindo da IA não apaga o que você está digitando.
  - **Conversa:** a mensagem em escrita sobrevive à troca de aba.
  - **Anexo de texto editado:** Esc ou clique fora não descartam mais a edição sem aviso, e Salvar
    não envia duas vezes.
  - A busca da seção Vínculos não passa de um card para o outro.
  - Em Harness de IA, o botão que começa uma rodada do heartbeat se chama **Rodar o heartbeat
    agora**, como o comando da paleta (era "Chamar a IA agora", confundível com os botões do card).

- **O "Chamar IA" virou dois botões, cada um com uma tarefa.**
  - **Trabalhar na fase** é o antigo Chamar IA, com o nome do que ele faz: o trabalho da coluna em
    que o card está (em Implementação, código), até passar a vez.
  - **Refinar com IA** é novo: reescreve título e descrição com clareza, revisa Tags, Esforço da
    atividade, Modelo e Skills e completa o checklist, sem trabalhar a fase, sem mover o card e sem
    mexer em arquivos (roda só com o board; no Kimi, que não tem esse nível, o pedido proíbe). O
    resumo do que mudou fica na conversa, com o texto anterior da descrição, e o card volta ao
    status que tinha, também quando a execução falha (a falha fica na conversa, sem bloquear o
    card). Refinar não conta como execução sem progresso para o modo autônomo.

- **Modos rápidos do Cursor.** Em Configurações → Modelos de IA, o cartão do Cursor ganhou a chave
  **Incluir os modos rápidos**, desligada por padrão. Ligada, a versão rápida de cada modelo (que
  responde mais depressa e cobra mais pelos mesmos tokens) entra no catálogo como um modelo à parte,
  por exemplo "Claude Opus 5.5 1M Fast", com preço próprio para a estimativa de custo; o board monta o
  id que o Cursor espera (`claude-opus-5-5-high-fast`). Só entram as versões rápidas dos modelos que
  estão no catálogo: um modelo que você tirou não volta, nem a versão rápida dele. Desligada, elas
  saem do catálogo. Pelo MCP, é a regra `includeFastModels` do `update_rules`.

- **Aviso dos requisitos do board.** Enquanto faltar alguma coisa para o board trabalhar com a
  ferramenta de IA, uma faixa fica no topo do board (em todas as telas) e no painel de chat, sem
  botão de fechar. Ela aponta: Node.js fora do PATH, linha de comando da ferramenta não instalada,
  CLI do Cursor sem login, servidor do board não registrado no arquivo que a ferramenta lê, registro
  apontando para um node ou caminho que não existe mais (o nvm trocou de versão), registro de outra
  pasta (o arquivo veio de outra máquina pelo git, ou o projeto mudou de lugar) e nível de
  permissão que a ferramenta não aceita. No Claude, vale também o servidor registrado para o seu
  usuário (`claude mcp add -s user`). Cada item traz a ação: o comando para copiar, **Conectar IA
  (MCP)** ou o atalho para o Harness de IA. A faixa some sozinha quando tudo é resolvido;
  **Verificar de novo** confere na hora, relendo o PATH do terminal (um node instalado com o board
  aberto é encontrado sem recarregar a janela), e diz quando nada mudou.
  - **Recomendado não é requisito.** No Claude e no Cursor as execuções pelo board levam o servidor
    do board sozinhas: o registro só falta nas conversas fora do board. Esse item aparece como
    recomendado, fora da contagem; sozinho, vira uma linha discreta em vez da faixa amarela.
  - **Os botões de IA do card ficam desligados** enquanto a linha de comando falta ou está sem
    login, com o motivo na dica, em vez de dar erro depois do clique.
  - No painel de chat, a versão compacta mostra a explicação quando o item não tem botão que o
    resolva (Node.js, permissão, site de instalação).

- **Os botões de IA do card mostram o erro no próprio board.** Quando a execução nem começa (CLI não encontrada, por
  exemplo), o motivo aparece como aviso na tela do board e fica no canal Faz AI. Antes ele ia só
  para as notificações do editor, que o Cursor guarda na central sem mostrar: o clique parecia não
  fazer nada.

- **Os modelos do Cursor são os da sua conta.** Com a CLI autenticada, o board lê
  `cursor-agent models` ao abrir e quando o projeto passa a usar o Cursor; a primeira lista real
  substitui a embutida uma vez só, e depois **Detectar modelos** a traz de novo (um catálogo que você
  reduziu não volta a encher sozinho). As cerca de 250 variantes que o
  Cursor lista (uma por nível, mais as `-fast`) viram umas 50 entradas, cada modelo com os níveis
  dele. A lista embutida perdeu o `grok-4.7`, que não existe com esse id, e as regras de sugestão do
  Cursor começam em Auto, o único modelo que o plano gratuito aceita. Num board que já tinha outras
  regras, a recusa do plano gratuito vem explicada no card, com o caminho para escolher Auto.

- **As ferramentas do board recusam parâmetro desconhecido.** Antes, um nome errado era descartado
  em silêncio e a ferramenta seguia com o padrão: um `parent` escrito errado no `create_card` criava
  uma história em vez da sub-tarefa. Agora a chamada volta com erro dizendo qual parâmetro não existe.

- **Catálogo do Cursor atualizado.** Os servidores MCP locais acrescentados pelo board no
  `.cursor/mcp.json` levam `"type": "stdio"`, como a documentação pede; os subagentes de
  `.grok/agents` aparecem no inventário; e os eventos de hook `afterAgentThought`, `workspaceOpen`,
  `beforeTabFileRead` e `afterTabFileEdit` entram na lista.

- **O servidor do board é registrado com o caminho completo do node.** O editor aberto pelo menu do
  sistema não herda o PATH do terminal; com o node instalado só pelo nvm, `"command": "node"` não
  iniciava o servidor.

- **O Cursor em segundo plano funciona de verdade.** O botão Trabalhar na fase (antigo Chamar IA), o heartbeat e o modo
  autônomo com o Cursor tinham quatro defeitos, corrigidos:
  - **Sem o servidor do board.** Se ninguém tivesse clicado em Conectar IA (MCP), a execução rodava
    sem as ferramentas do board e terminava como sucesso sem mover nem comentar nada. Agora o board
    grava o servidor no `.cursor/mcp.json` antes de rodar, e refaz um registro que aponta para outra
    pasta. Um `.cursor/mcp.json` que não é JSON válido fica como está, com aviso no canal Faz AI.
  - **Consumo zerado.** O Cursor informa os tokens em camelCase e o board lia os nomes do Claude: as
    execuções apareciam medidas com 0 tokens e custo zero. Agora os tokens são lidos, e o custo é
    estimado pelo modelo que de fato rodou (o Cursor o informa no início; com `auto` era impossível).
  - **Inventário vazio.** As ferramentas usadas, inclusive as de MCP, não eram contadas. Agora são,
    uma vez por chamada.
  - **Fora da worktree.** A pasta de trabalho da história não era entregue ao Cursor; agora vai por
    `--add-dir`, como nas outras ferramentas.

- **O Cursor aceita os níveis "só o board" e "board e arquivos".** Antes ele só rodava "sem
  restrições". Nos níveis menores, a sessão recebe só as ferramentas do nível, sem terminal.

- **A CLI do Cursor é procurada como `cursor-agent`.** O board também acha a CLI na pasta do
  instalador, antes de tentar o nome curto `agent` (que pode ser outro programa). O esforço do
  modelo vai como sufixo do id (`claude-opus-5-5-high`), como `cursor-agent models` lista as
  variantes; um modelo sem nível escolhido roda no nível padrão dele, também no chat do board e no
  modelo que o `get_card` informa.

- **Windows: o prompt chega inteiro às CLIs instaladas pelo npm.** Aspas, `&` e `|` no texto eram
  interpretados pelo `cmd.exe`, e **Parar** deixava a CLI rodando. Agora os argumentos são escapados
  e Parar encerra a árvore de processos; se nem assim o processo fechar, a execução termina para o
  board em vez de deixar o card "Em execução". O login e a lista de modelos do Cursor também são
  lidos no Windows.

- **O board registra o consumo, o custo e o inventário de cada execução da IA.** Para cada execução
  ficam gravados os tokens de entrada, de saída, de leitura de cache e de criação de cache, o custo
  em dólar, os turnos e o id da sessão, mais o inventário do que foi usado: ferramentas, ferramentas
  de MCP (com o servidor), subagentes e skills. Quando a ferramenta não informa o custo, o board o
  estima pelo **preço por milhão de tokens** do modelo, que você preenche em Configurações → Modelos
  de IA (ou pelo MCP, com `upsert_model`), e o valor estimado vem marcado. Modelo sem preço fica sem
  custo, nunca com 0. No canal de log, a saída da ferramenta passa a aparecer em linhas legíveis, e
  cada execução termina com uma linha de resumo do consumo. O Copilot não tem saída estruturada: as
  execuções dele ficam registradas **sem consumo medido** ("não medido", e não zero). Perguntas no
  chat do board também entram no registro, sem card. O `get_metrics` passa a trazer tokens e custo.

- **Nova visão Métricas, o quarto botão da navegação.** Mostra o trabalho e o uso da IA do board, no
  editor e no board pelo navegador. Tem filtros de período (Hoje, 7 dias, 30 dias, Este mês, Últimos
  12 meses, Tudo e intervalo livre) e de workflow, e cinco totais: atividades concluídas, execuções
  de IA, tokens, custo e tempo de IA. O tempo de IA é a soma da duração de cada execução, então
  execuções simultâneas somam e o total pode passar do tempo decorrido. O que não foi medido aparece
  como "não medido", nunca como 0.

- **O painel de métricas traz a série de custo e tokens por mês.** Gráfico de barras, uma série por
  vez. O mês em andamento vem com hachura, o mês sem dado é um espaço marcado "sem dado" e há uma
  tabela com os mesmos números. Os avisos ficam junto do número: desde quando o log do board existe,
  o período cortado no início do log e os meses que só têm o total mensal.

- **O painel de métricas mostra onde o consumo aconteceu, quanto o card espera em cada fase e o que
  a IA usou.** Cinco blocos novos abaixo da série por mês, cada um dizendo até onde enxerga: a série
  inteira do período ou só o detalhe guardado, com o mês em que ele começa.
  - **Onde o consumo aconteceu:** o consumo repartido por fase, tipo de card, modelo, ferramenta de
    IA, esforço ou perfil, em barras horizontais na medida escolhida (custo, tokens, execuções ou
    tempo de IA), com a tabela das quatro medidas ao lado.
  - **Quanto tempo o card fica na fase:** mediana e média de cada passagem por uma fase, quantas
    permanências ficaram desconhecidas e quantos cards estão na fase agora. É tempo de relógio, não
    tempo de IA: o card pode estar parado esperando alguém.
  - **Lead time:** da criação do card até a primeira conclusão, com a mediana em destaque, a média, a
    contagem de desconhecidos e a lista por card. Desconhecido é o card cuja criação ficou fora do
    detalhe guardado; a data não é estimada.
  - **Fases mais caras e Cards mais caros:** dois rankings lado a lado, em tabelas ordenáveis por
    qualquer medida. O padrão é o custo quando o período tem custo medido e o tempo de IA quando não
    tem, e a tela escreve o critério em vigor. O que passa do limite de linhas soma numa linha
    "outros".
  - **O que a IA usou:** ferramentas, ferramentas de MCP (com o servidor em coluna própria),
    subagentes e skills, com execuções e usos. "Ainda não medido" e "nenhum registro no período" são
    estados diferentes.

  Tokens contam mesmo quando o modelo não tem preço configurado; o custo soma só as execuções que
  têm preço, e o aviso diz quantas ficaram de fora. Custo não medido ou parcial é explicado nos
  Totais e na série; custo minúsculo aparece como "menos de US$ 0,0001". Os tempos e o inventário
  leem só o detalhe guardado: quando um mês sai da janela de retenção, ele sai desses blocos. As
  tabelas que rolam recebem foco pelo teclado, o erro de intervalo invertido é anunciado ao leitor
  de tela, e o campo da janela de retenção diz que grava ao pressionar Enter ou ao sair dele. A tela
  avisa quando a consulta demora mais de 15 s (com "Consultar de novo"). Período escolhido antes do
  início do log é dito assim.

- **O `get_metrics` agrupa por esforço, perfil, ferramenta usada e ferramenta de MCP.** As
  dimensões novas são `effort`, `profile`, `used_tool` e `mcp_tool`. Cuidado com os nomes: `tool` é
  a ferramenta de IA que rodou (claude, codex); `used_tool` e `mcp_tool` são o que a execução usou
  (Read, Bash, `get_card`), e `mcp_tool` traz o servidor numa coluna própria, ou "servidor não
  registrado" quando o nome não o trouxe. Como em `agent` e `skill`, as dimensões de inventário só
  contam execuções e usos, sem tokens nem custo. `effort` e `profile` têm tokens e custo. Os tempos
  do painel (permanência e lead time) não estão no `get_metrics`.

- **A janela do detalhe de cada execução é configurável, de 1 a 24 meses, e o padrão caiu de 12
  para 6.** No bloco **Detalhe guardado** da visão Métricas você escolhe quantos meses de detalhe
  (consumo e inventário por execução) o board guarda além do mês corrente; depois disso só
  permanecem os totais por mês, que nunca expiram. A retenção só aceita número inteiro (12,5 vira
  13) e cancelar a redução volta o valor. Baixar a janela pede confirmação e o descarte acontece na
  próxima abertura do board. Quem atualiza perde o detalhe individual das execuções com mais de 6
  meses, não os totais. O padrão menor mantém o arquivo do banco dentro do limite de tamanho.

- **Um clique no nome da branch copia o nome.** No card aberto, a branch da história virou um botão:
  clicar copia o nome para a área de transferência e a tela confirma com "Nome copiado".

- **O heartbeat pode tocar várias histórias ao mesmo tempo.** Em Configurações, na execução pela IA,
  o interruptor **Tocar histórias em paralelo** (nasce desligado) faz o heartbeat executar várias
  histórias juntas: duas por padrão, até seis em **Histórias ao mesmo tempo**. Só vale no modo "Worktree por história", em que cada história trabalha na sua
  própria pasta; fora dele, e no modo autônomo (histórias empilhadas), continua uma por vez. O limite
  conta toda execução em andamento, e mais histórias em paralelo gastam mais do limite de uso da conta.
  A tela de Git passa a explicar, em cada modo, se o paralelo está disponível e por quê: branch na
  mesma pasta causa conflito entre histórias; worktree isola, mas ocupa mais disco e usa mais
  memória
  e processador enquanto várias rodam juntas. Card que espera outro (dependência em aberto) não
  entra na fila; o heartbeat não inicia história com sub-tarefa rodando e usa as vagas livres do
  limite de execuções em paralelo mesmo com execução ativa; o modo autônomo e o heartbeat se
  revezam nas vagas; sub-tarefas com a pessoa ou já rodando não entram na rodada paralela; vínculo
  de dependência entre um card e a própria história é recusado.

- **Sub-tarefas independentes rodam ao mesmo tempo.** Um card pode agora **depender** de outro
  (novo vínculo, em Vínculos: "precisa terminar antes deste card" / "só começa depois deste card",
  com os grupos "Depende de" e "Libera"). No Plan a IA declara a ordem entre as sub-tarefas
  (`create_card` com `depends_on`); na Implementação ela delega as que não têm dependência pendente
  a subagentes simultâneos, cada um com o modelo do seu card, e segue em rodadas (`subtasksNow` no
  `get_card` da história). `start_work` recusa a sub-tarefa que ainda espera outra. Antes era sempre
  uma sub-tarefa por vez. Quem já tinha a skill do fluxo instalada precisa apagá-la e instalar de
  novo para receber a instrução nova.

- **O LED do card agora parece um LED e diz o estado de relance.** Antes era um ponto na cor do
  texto da barra, com um pulso quase invisível. Agora ele fica verde e pisca devagar enquanto a IA
  trabalha no card (ou numa sub-tarefa da história), amarelo quando o card espera por você, vermelho
  quando está bloqueado e apagado quando não há nada acontecendo. Só o verde pisca. Vale para os
  cards do board, as sub-tarefas e o cabeçalho do card aberto.

- **Os botões dizem o que o clique faz.** Rótulos que mostravam só um estado ou um nome genérico
  viraram ações: no topo, "Pausar modo autônomo" / "Retomar modo autônomo", "Ver 2 com você" /
  "Ver todos os cards" e "Abrir chat" / "Fechar chat"; no board, "Mostrar filtros", "Limpar
  filtros", "+ Nova coluna" e "Criar card"; no card, "Parar a IA" e "Salvar descrição"; nas
  configurações, "Criar tipo", "Criar coluna", "Adicionar modelo", "Fechar edição", "Reler pastas",
  "Chamar a IA agora", "Restaurar aparência padrão" e outros. Na interface, o modo autônomo passa a
  ter um nome só (sem "YOLO" nem "autopiloto" nos rótulos).

- **Exportar e importar o board.** Em **Configurações → Backup**, **Exportar board** gera um
  arquivo `.fazai.json` com tudo o que está no board da pasta: configurações, cards (inclusive
  arquivados e na lixeira), conversas, checklists, vínculos, histórico e os anexos embutidos.
  **Importar de um arquivo…** mostra um resumo, pede confirmação, grava uma cópia do banco
  (`.bak`) e substitui o board atual pelo do arquivo, com os mesmos números de card. Os anexos do
  board que estava sendo substituído vão para uma pasta de backup ao lado da pasta de anexos
  (`<anexos>.bak-<data>`), e a confirmação diz isso. Arquivo de importação com id de card ou nome de
  anexo contendo caminho (`../`) é recusado. Arquivo de versão anterior é atualizado ao importar;
  de versão mais nova é recusado. Importar com a IA executando um card é recusado. Funciona no
  editor e no navegador. É o caminho para migrar o board entre máquinas, já que ele fica fora do
  repositório.
- **Dividir um pedido grande em histórias agora as vincula de verdade.** Ao criar uma história com
  `autonomous_from`, ela ganha um vínculo **relativo** com a história de origem — antes, a origem só
  ficava registrada em texto, num comentário que nem a interface nem a IA liam como relação. Se já
  existir qualquer vínculo entre as duas (caso de uma história ligada à mão), a criação é pulada em
  silêncio, sem duplicar.
- **A seção Vínculos do card aberto passa a mostrar a relação de sub-tarefa.** Numa sub-tarefa, um
  grupo "Pai" com a história; numa história, a contagem de sub-tarefas com um atalho até a seção
  Sub-tarefas (sem repetir a lista). A relação é somente leitura e não entra nas regras de
  conclusão, que continuam valendo só para o vínculo manual de pai/filho.

- **A história sai do board quando a versão dela é publicada.** Na mesma rodada que olha os pull
  requests, o board verifica se o commit do merge de uma história concluída já está numa versão
  publicada — uma tag que contém o commit **e** que tem release publicada no GitHub. Está: ele
  registra na conversa qual versão levou a história (tag e link da release) e arquiva o card, que vai
  para os arquivados do workflow e pode ser desarquivado com um clique. A coluna Concluído passa a
  significar "mergeado e ainda não entregue". O **recurso nasce ligado**, junto com a detecção de
  merges e no mesmo intervalo dela: não há ajuste novo para ligar. Tag sem release não conta, release
  em rascunho não conta, pré-lançamento conta, e a versão registrada é a mais antiga entre as que
  contêm o commit, pela data de publicação. É melhor esforço: projeto sem releases, fora do GitHub ou
  sem o `gh` não arquiva nada, sem bloquear card nenhum. O board não publica versão — o
  `npm run release` continua como está —, e histórias concluídas antes desta versão, sem o commit do
  merge guardado, continuam sendo arquivadas por você.

- **A IA pode consultar as métricas de uso do board direto na conversa do card com `get_metrics`.** A
  ferramenta agrega dados do histórico — execuções, duração, custo e tokens — por fase, tipo de card,
  ferramenta, modelo, card, agente ou skill, com filtros de período e card. Responde em tabela
  compacta. Não lista execuções individuais (a agregação por card já basta para a IA saber o custo de
  cada um). Valores não medidos aparecem como "-" (nunca 0), e o custo estimado pelo preço do modelo
  vem marcado como estimado. Data que não existe (como 2026-02-30) é recusada; só com
  `start_date`, a consulta vai até o mês atual, inclusive os meses já consolidados.

- **Avisos de configuração do Claude Code saíram do chat e da falha do card.** Linhas como
  "Permission allow rule …" apareciam no erro do chat e nas linhas de falha do card, empurrando o
  motivo real para fora. Agora ficam só no canal de log; o motivo do erro (login expirado, por
  exemplo) continua aparecendo.

## 0.31.1

- **O card aberto voltou a funcionar.** Na 0.31.0 o card abria encostado à esquerda e fechava a
  qualquer clique: o fundo escuro ficava por cima dele. Agora ele abre como uma janela centralizada,
  só fecha ao clicar fora dela ou com Esc, e os seletores e menus do card abrem por cima. O Esc que
  fecha um seletor aberto não fecha mais o card junto.

## 0.31.0

- **O board passou a guardar o histórico do que acontece nele.** Cada acontecimento de um card
  (criação, passagem de coluna com de/para, mudança de status, mensagem da conversa, anexo e
  artefato, sub-tarefa, vínculo, pull request, conclusão, arquivamento e lixeira) e cada execução de
  IA iniciada pelo board (card, coluna e fase no momento da chamada, ferramenta, modelo, esforço,
  agente, permissão, modo autônomo, origem, duração e desfecho) ficam registrados no próprio arquivo
  do board. É a base para o painel de métricas, que ainda não existe: nesta versão não há tela nem
  consulta — o histórico só começa a ser acumulado. Ele vale de agora em diante: nada é reconstruído
  para trás, e sessões de IA abertas por você no terminal, fora do board, não são medidas.
- **Nenhum conteúdo de conversa vai para o histórico.** O registro guarda o que aconteceu, não o que
  foi dito: o texto dos comentários, das descrições e das respostas da IA não entra, e os títulos de
  card são cortados em 120 caracteres. O detalhe fica 12 meses completos além do mês corrente e
  depois é descartado, sobrando os totais por mês, que não expiram. Reiniciar o board apaga o
  histórico junto com o resto, e apagar um card não apaga o histórico dele — é o que mantém os
  totais de meses fechados estáveis.

- **O pacote publicado sai com as notas da versão no topo do changelog, não mais com "Não
  lançado".** O `npm run release` agora abre o `.vsix` gerado e confere o README e o CHANGELOG (nos
  dois idiomas) antes de publicar: recusa se o changelog ainda tiver "Não lançado" sobrando, se a
  primeira seção não for a versão que está saindo, ou se faltar algum dos blocos de aviso do README
  (fase alpha e agradecimento). Antes, era possível publicar com o changelog desatualizado.
- **O modo autônomo (YOLO) para na Homologação, com o pull request aberto, em vez de ir até
  Concluído.** A IA vai do Backlog até a última coluna em que ela atua (Homologação, no board
  padrão), abre o pull request, registra com `set_pull_request` e para ali: a história fica
  aguardando a sua revisão, com o status "aguardando revisão", e Concluído volta a significar
  mergeado. O autopiloto deixa de travar nessa história entregue e segue direto para a próxima da
  fila, sem esperar a revisão. Histórias YOLO já concluídas com o pull request aberto antes dessa
  mudança ficam como estão, sem migração.
- **A fila da IA segue a ordem do board, não o número do card.** O heartbeat, o autopiloto e o
  `get_pending_work` passam a pegar os cards com os bugs na frente e, depois, de cima para baixo —
  o que decide é a posição do card no board. A categoria também deixou de pesar: um bug pronto não
  fica mais atrás de um card aprovado que está mais abaixo. O `get_pending_work` ganhou o campo
  `order` com a fila inteira em ordem; os grupos `approved`, `unanswered` e `ready` continuam
  dizendo o que fazer com cada card. A base da branch das histórias em modo autônomo continua sendo
  a da história de número anterior, então uma história que roda antes de outra de número menor abre
  o pull request fora da pilha.

- **Release sem push direto na `main`.** O `npm run release` agora cria a branch `release/vX.Y.Z`
  a partir da main atualizada e ajusta nela a versão e os CHANGELOGs ("Não lançado" vira a versão).
  Depois de publicar nas lojas, envia a branch, abre o PR e, com o push concluído, faz o merge
  sozinho (squash), atualiza a main local, apaga a branch de release (local e remota) e cria a tag e
  a GitHub Release sobre o commit mergeado. Antes, o push direto era recusado pela `main` protegida
  e deixava uma tag solta no remoto. Se algo parar depois da publicação, `npm run release -- finish`
  retoma de onde parou, sem publicar de novo.
- **Board padrão em inglês.** Com a interface em inglês, os nomes do board que a extensão cria (os
  workflows Histórias e Sub-tarefas, colunas como Implementação, Homologação e Concluído, os tipos de
  card, os campos Fase e Esforço da atividade, suas opções e o Agente padrão) aparecem traduzidos, no
  board, no card, nos filtros, na lixeira e nas listas das configurações. Muda só a exibição: o nome
  guardado continua o mesmo, então nada quebra ao trocar de idioma, e o que você criou ou renomeou
  nunca é traduzido. As caixas de nome das configurações continuam mostrando o nome guardado.
- **Logo da tecnologia nos campos de seleção.** Opções de campos de seleção e de múltipla seleção
  que nomeiam uma tecnologia (Flutter, Dart, React, TypeScript, Python, Rust, Docker, GitHub e cerca
  de 80 outras, também por apelido: "node", "ts", "k8s") ganham o logo, na cor da marca, no card,
  no seletor do card e nos filtros. Opções que não são tecnologia ficam como antes.
- **Anexo abre numa janela do próprio board.** Clicar num anexo abre uma modal em vez de um editor
  ou aplicativo externo: texto e JSON podem ser lidos e editados ali, imagens são exibidas e os
  outros tipos avisam que não há pré-visualização. A modal traz **Salvar como** (o diálogo do
  editor ou, no navegador, o download) e **Copiar conteúdo**.
- **Triagem automática na primeira chamada da IA.** Num card sem Tags, Esforço da atividade, Modelo
  e Skills, a IA lê a descrição, escolhe e preenche os quatro campos e cria a checklist antes de
  começar o trabalho da fase. Se qualquer um deles já estiver preenchido, a triagem não acontece.
- **LED da IA no topo do card aberto.** O LED de atividade da IA aparece também no cabeçalho do card
  aberto e acende quando a IA está trabalhando no card ou numa de suas sub-tarefas.
- **O card aberto não cobre mais o chat.** O card abre como uma janela centralizada na tela, e não
  mais como um painel preso à direita, que ficava por cima do chat com a IA.
- **O board detecta o merge do pull request e conclui a história.** Uma rotina periódica observa, a
  cada intervalo configurável, se um pull request de uma história entregue em modo autônomo foi
  mergeado: quando o merge é detectado, o board grava o commit do merge no card, registra na
  conversa, move a história para a coluna de conclusão e remove a pasta de trabalho. O aviso de PR
  fechado sem merge aparece uma única vez. O **recurso está ligado por padrão** (Configurações → Git,
  **Concluir a história quando o pull request for mergeado**), e o intervalo de consulta é
  configurável (**Verificar a cada (minutos)**, padrão 15, faixa 5 a 1440). O merge continua sendo
  feito pela pessoa (manualmente ou pelo merge automático); o board só observa.

## 0.30.0

- **Modo autônomo (YOLO)**: uma história marcada como YOLO é tocada pela IA do Backlog ao pull
  request, sem pedir autorização nem confirmação. As colunas que exigem aprovação não seguram o
  card, o pedido de revisão vira aprovação na hora e a IA decide as dúvidas sozinha, registrando
  na conversa. Roda com a permissão "Sem restrições" e não faz o merge. Um **autopiloto** toca as
  histórias em fila, uma de cada vez, e empilha os pull requests: a branch de cada história parte
  da anterior. A IA pode dividir um pedido grande em várias histórias (`create_card` com
  `autonomous_from`). Para quando o card é bloqueado, quando uma execução falha e depois de 3
  execuções seguidas sem avanço. Interruptor no painel do card (com confirmação), selo no cartão,
  botão **Autônomo** no topo do board e comandos para pausar e retomar.
- **Pedido de avaliação e canais de retorno no README.** O começo do README (em português e em
  inglês) ganhou um convite para dar uma estrela no repositório, avaliar a extensão no VS Code
  Marketplace e no Open VSX (a loja do Cursor), reportar bugs e sugerir melhorias pelas issues do
  repositório. As issues agora têm dois formulários prontos, **Reportar um bug** (com versão,
  editor, ferramenta de IA e sistema) e **Sugerir uma melhoria**.
- **Interface em português e em inglês.** Em Configurações → Aparência, o **Idioma** pode ser
  **Automático** (segue o idioma do editor ou do navegador: inglês para qualquer `en`, português
  para o resto), **Português (Brasil)** ou **English**. A interface inteira troca na hora: board,
  card, filtros, chat, configurações e as mensagens de erro e aviso do board. Os nomes de comandos e
  seções do editor (paleta de comandos e barra lateral) também seguem o idioma do editor. O que você
  escreve (títulos, descrições, nomes) e o que é lido pela IA (instruções das fases, ferramentas MCP)
  não é traduzido.

- **Chat com a IA no board.** Uma conversa para criar, mover e vincular cards e consultar o board em
  linguagem natural: na barra lateral do editor (seção **Chat com a IA**, abaixo de Board e Filtros)
  e, no navegador, no botão **Chat** do topo. Dá para escolher o **modelo e o esforço** das próximas
  mensagens; a IA age pelas ferramentas do board e responde em markdown. Há **Parar** e **Limpar**,
  e o histórico fica guardado por projeto. Usa o mesmo limite de execução do restante (por padrão,
  só o board).

- **Controles do card aberto, do board e dos filtros no mesmo padrão.** Tipo, coluna, status, agente,
  filtros e escolha do diálogo agora são os seletores do Radix, assim como as caixas de seleção da
  checklist e dos filtros e os campos de busca, de adicionar item e de data. Ficaram como texto
  editável só o título, o item da checklist, o nome da coluna e o editor de markdown.

- **Vínculos entre cards.** Qualquer card pode ser vinculado a outro, de qualquer workflow: **pai**,
  **filho** ou **relativo**, na seção **Vínculos** do card aberto, com busca por número ou título. O
  rodapé do card mostra o vínculo e o progresso dos filhos; vínculo repetido e ciclo são recusados.
  Quando o último filho em aberto entra numa coluna de conclusão, vale a regra "ao concluir todos os
  filhos" (perguntar, mover sozinho ou nada) também para o pai vinculado. A IA ganha `link_cards` e
  `unlink_cards`, e o `get_card` devolve os vínculos. As sub-tarefas seguem como estão.

- **Skills automáticas por tipo de card.** Em Tipos de card → Padrões por tipo, o campo Skills usa
  a janela de escolha (antes mostrava "Sem opções ainda" quando o projeto não tinha skills próprias)
  e todo card novo do tipo nasce com as skills escolhidas. Há teste de ponta a ponta.

- **Harness de IA em três abas.** A tela era uma rolagem longa com três assuntos misturados. Agora:
  **Ferramenta e execução** (a IA do projeto, execução pela conversa e heartbeat), **Do projeto**
  (regras, skills e agentes que fazem parte do repositório) e **Tudo que a ferramenta carrega** (o
  inventário, com global e plugins). A aba escolhida fica lembrada. Os arquivos de agente da própria
  ferramenta aparecem como **Subagentes** nesta tela, para não se confundir com **Agentes**.

- **Perfis de execução viram Agentes.** A tela, o menu e o card passam a dizer **Agente**: é ele que
  define como a IA trabalha (skills, servidores MCP, ferramentas, modelo e esforço). Toda execução
  pelo board roda através de um agente, o do card, o da fase ou o padrão, e o board sempre tem ao
  menos um (**Agente padrão**, sem restrições); o último não pode ser apagado. O arquivo de agente
  da própria ferramenta agora se chama **Subagente** (opcional).
- **Agentes configuráveis por intenção.** Cada agente tem o campo **O que este agente faz**; com
  ele, **Sugerir pela intenção** marca skills e servidores MCP que combinam (busca por palavras,
  sem chamar IA). As skills do agente usam a janela de escolha com busca, e as ferramentas têm
  conjuntos prontos: **Só leitura** e **Editar código**. A tabela do que o Claude Code aceita por
  parâmetro foi para uma seção recolhida.

- **Campo Skills do card com janela de escolha.** No lugar da parede de chips (uma para cada skill,
  centenas com plugins), o campo mostra as marcadas e abre uma janela com busca por nome ou
  descrição, abas Todas / Marcadas / Projeto / Globais / Plugins, caixa de seleção por skill e a
  origem de cada uma. O mesmo seletor serve aos agentes e usa a descrição da intenção para sugerir
  skills.

- **Harness de IA: lista nova de skills, agentes, hooks e servidores MCP.** Cada item tem o nome, a
  descrição como dica (duas linhas, com o texto completo ao passar o mouse) e o caminho do arquivo
  numa linha própria, por inteiro; clicar nele abre o arquivo no editor. Saiu a tabela que
  quebrava o caminho e a descrição em várias linhas. Cada linha tem uma caixa de seleção, e a do
  cabeçalho marca o grupo; com itens marcados, uma barra permite deixar as skills automáticas ou só
  quando indicadas, copiar para o projeto ou para o global, e apagar. O grupo **Projeto** vem
  sempre primeiro, em destaque, com a frase de que faz parte do repositório; **Global** e
  **Plugins** dizem que não fazem.
- **Descrição em bloco do frontmatter**: skills e agentes com `description: |` ou `>` (em várias
  linhas) apareciam com a descrição vazia ou só com a barra; agora a descrição é lida inteira.

- **Botão de tema no topo do board**: o ícone no canto superior direito alterna entre **Sistema**,
  **Claro** e **Escuro**. É a mesma preferência de Configurações > Aparência, então a escolha fica
  salva e vale no editor e no navegador.
- **Cores próprias do board**: o board passa a usar a mesma paleta no editor e no navegador, em
  claro e escuro, em vez de herdar as cores do tema do VS Code. Com **Sistema**, ele acompanha só
  se o editor está em tema claro ou escuro. Temas de alto contraste usam o claro ou o escuro do
  board com bordas reforçadas.
- O painel de **Filtros** da barra lateral usa o fundo do tema do board. Antes, com o VS Code
  escuro e o board claro, os filtros ficavam quase invisíveis.
- Os selos de status e de tipo de card ficam legíveis em qualquer cor escolhida: o texto vira preto
  ou branco conforme a cor de fundo.
- O botão principal é azul índigo nos dois temas (no escuro era verde).
- Os cards perderam a faixa colorida à esquerda: a cor do tipo fica na barra do card.
- As barras de rolagem usam as cores do board, e a barra horizontal das colunas ganhou um espaço de
  respiro abaixo dos cards.
- O contraste de textos, controles e foco do teclado é verificado por teste automático nos dois
  temas. As regras de cor estão em `DESIGN.md`.
- Interno: lint (ESLint) e formatação (Prettier) configurados, e testes de interação (cliques e
  teclado) do board. Nada muda para quem usa.
- Interno: o front passa a usar primitivas de interface (botão, seletor tipado, chips, linha de
  campo, botão de apagar com confirmação, campo de adicionar, campo numérico) em vez de repetir o
  mesmo HTML em cada tela. Nada muda na aparência nem para quem usa.
- Interno: a tela Configurações > Harness foi quebrada em arquivos por seção, e o front pede as
  ações ao host por comandos com nome (`src/webview/commands.ts`). Nada muda para quem usa.
- Interno: o código todo segue o Prettier, conferido pelo `npm test`, e o `npm run typecheck`
  passa a cobrir os testes da interface.
- Interno: as regras do board que o host e o front repetiam (card ativo, coluna do card, sub-tarefas
  em aberto, o que vai junto ao cancelar ou concluir) ficam num só lugar, em `src/shared`, com
  testes. Nada muda para quem usa.
- O botão "⋯" dos menus avisa aos leitores de tela se o menu está aberto.
- Interno: as ferramentas MCP saem de um arquivo de 1147 linhas para `src/extension/mcp/tools/`,
  um arquivo por grupo. A lista que a IA vê (nomes, descrições, parâmetros) não muda.
- Interno: o roteador de mensagens do host (690 linhas) vira um despachante tipado com handlers
  por domínio em `src/extension/panel/handlers/`; a regra da história fica em `src/shared/story.ts`.
- Interno: a tela Configurações > Harness (483 linhas) vira composição de seções em
  `settings/harness/`, com testes de interação novos; regras sem React vão para `src/shared`.
- Interno: o painel do card (399 linhas) vira composição de partes em `components/card/`, com 21
  testes de interação novos; tipos, checklist e vaga da sub-tarefa entram em `src/shared/selectors.ts`.
- Corrigido: trocar de card com a descrição em edição salvava o rascunho no card aberto em seguida
  (por exemplo, na sub-tarefa); agora ele vai para o card em que foi escrito.
- **Ícones novos**: emojis e símbolos soltos (✕ ⋯ ▾ ↗ 🗑 💬 📎) deram lugar a um conjunto único de
  ícones de traço ([Lucide](https://lucide.dev)) em todo o board: card, colunas, painel do card,
  editor de descrição, filtros e configurações.
- **Card novo no board**: uma barra na cor do tipo, como a de uma janela, com o ID, o tipo e os
  botões de abrir e de ações. O título fica numa linha (inteiro no tooltip), o status mostra com
  quem está a pendência por um ícone (robô para a IA, pessoa para você) e há quanto tempo está
  assim, e bloqueado mostra o motivo no tooltip. O modelo de IA ganha uma linha própria, com o
  esforço em português ("Sonnet 5.5 - baixo"), e o rodapé mostra a branch e o link do PR.
- Cards com pendência sua ganham a borda na cor do status, para achar de relance o que espera por
  você.
- Um LED pisca devagar na barra do card enquanto a IA trabalha nele (fica aceso, sem piscar, com
  movimento reduzido no sistema).
- **Texto legível na cor do tipo e do status**: a cor do texto (preto ou branco) passa a ser
  escolhida pelo contraste percebido, e não mais pela fórmula antiga, que punha texto preto sobre o
  azul da História e o vermelho do Bug. Em Configurações > Tipos de card, cada tipo mostra a prévia
  do card enquanto você escolhe a cor; se a cor deixar o texto difícil de ler, aparece um aviso com
  a mesma cor mais escura e mais clara para aplicar com um clique. O aviso também vale para as
  cores dos status em Aparência.
- **Configurações mais organizadas**: cada seção tem o título e a ação principal na mesma linha.
  Em **Tipos de card**, o botão **Novo tipo** no topo abre uma linha na tabela, alinhada com as
  outras, com a prévia do card (Enter adiciona, Esc cancela). As configurações e a Lixeira ocupam
  toda a largura da tela, e o menu lateral das configurações recolhe numa faixa só com ícones (a
  escolha fica lembrada).
- Campos de texto, link e número do card não perdem mais letras quando você digita rápido. O
  valor é gravado ao sair do campo, com Enter ou ao fechar o card, em vez de a cada tecla.
- **Tela de Campos refeita**: cada campo vira um cartão com o nome numa caixa de texto, o tipo com
  a explicação do que ele guarda, como ele aparece no board (com a prévia ao vivo), as opções como
  selos (Enter inclui, X tira) e os tipos de card em que ele existe. **Novo campo**, no topo, abre o
  rascunho com a escolha do tipo; campos de seleção pedem ao menos uma opção. A exibição "Só no
  detalhe" passou a se chamar **Oculto**.
- Os formulários passam a usar os componentes do [Radix Themes](https://www.radix-ui.com/themes),
  da mesma família das cores do board. As outras telas migram aos poucos.
- **Workflows e colunas refeitos**: você pode criar quantos workflows quiser com **Novo workflow**
  (escolhendo se recebe cards independentes ou sub-tarefas; ele nasce com A fazer, Em andamento e
  Concluído) e excluir os que estiverem vazios. O nome de cada workflow é editável, e **Nova
  coluna** fica no topo de cada um, abrindo uma linha alinhada na tabela. Saíram os rótulos "linha
  de cima" e "linha de baixo" e as opções "começa colapsada" do workflow, da coluna e dos
  arquivados: o board guarda o estado em que você deixou cada workflow e coluna.
- O assistente de IA (MCP) ganhou `create_workflow` e `delete_workflow`; `set_workflow_layout` e o
  parâmetro `collapsed` de `update_column` foram removidos.
- Os logs do navegador de teste (`.playwright-mcp`) entraram por engano em PRs anteriores e agora
  são ignorados pelo git.
- **Ordem dos workflows**: cada workflow tem uma alça para arrastar e mudar a posição dele no
  board (com a alça em foco, ↑ e ↓ movem uma posição). O assistente de IA (MCP) ganhou
  `move_workflow`.
- **LED da IA sempre no card**: o LED na barra do card agora existe o tempo todo. Pisca devagar
  enquanto a IA trabalha no card, e a história também acende quando a IA trabalha numa sub-tarefa
  dela. Quando a IA termina, o LED continua no card, apagado (só o contorno). A prévia dos tipos
  também mostra o LED apagado.
- **Coração do heartbeat** no topo direito do board: vermelho e batendo enquanto o heartbeat está
  rodando; cinza e parado quando ele está desligado ou não consegue rodar (sem ligação com o Faz
  AI ou sem a ferramenta do projeto, com o motivo no tooltip). Um clique no coração liga e desliga o
  heartbeat.
- Em Configurações > Campos, o seletor "No board" (Selo, Selo vazado, Nome: valor, Oculto) não
  invade mais a coluna das opções quando a janela é estreita: as colunas do cartão do campo passam
  a quebrar de linha antes de ficarem menores que o seletor.
- **Regras do board com o novo design**: cada regra vira um cartão com o selo Ativa/Desligada, o
  interruptor ou o seletor à direita e o "Quando / Então" embaixo. Os controles são os do Radix
  Themes, iguais aos de Campos e Workflows. É a primeira das telas de Configurações que ainda usavam
  os controles antigos.
- **Harness de IA com o novo design**: regras, skills e agentes do projeto viram cartões com o
  título, o selo de estado e as ações à direita; cada seção tem o botão principal no topo (Nova
  skill, Novo agente, Conectar ao board, Rodar agora, Atualizar). Formulários de criação, seletores,
  interruptores, caixas de marcar e as abas de ferramenta usam o Radix Themes, como Campos,
  Workflows e Regras.
- **Perfis de execução com o novo design**: o botão **Novo perfil** fica no topo à direita; cada
  perfil é um cartão com o nome numa caixa de texto, o selo "padrão" e as ações à direita, e o
  editor usa os seletores, interruptores e campos do Radix Themes. O seletor de **modelo e
  esforço** (também usado no card aberto) passou a ser o do Radix.
- **Modelos de IA com o novo design**: **Detectar modelos** e **Novo modelo** ficam no topo à
  direita. O modelo novo abre um rascunho com os campos alinhados (nome, identificador e
  esforços), no lugar da linha solta no fim da tabela. A lista e a **Sugestão de modelo** usam os
  campos, seletores e interruptores do Radix Themes; **Montar nova regra** fica no topo da seção e
  o montador abre acima da lista de regras.
- **Git e Aparência com o novo design**: os campos viram cartões de formulário com o rótulo acima
  de cada caixa e a ajuda embaixo. Seletores, interruptor do merge automático, o aviso do merge
  (agora um aviso do Radix) e o controle deslizante do tamanho da fonte são os do Radix Themes;
  Restaurar padrões da Aparência é o botão do mesmo estilo das outras telas.
- **Sobras do novo design nas Configurações**: a tabela de colunas (nome, "Representa", "IA atua" e
  "Exige aprovação"), a linha de coluna nova, o editor da Fase, a tabela de Tipos de card, o nome do
  board no menu lateral e os padrões por tipo passam a usar os campos, seletores e caixas de marcar
  do Radix Themes. Os campos personalizados (texto, número, data, seleção e caixa) também usam o
  Radix, inclusive no card aberto. O botão "Novo workflow", "Nova coluna", "Novo tipo" e "Novo
  campo" têm o mesmo estilo em todas as telas.

## 0.29.1

- O README avisa que o projeto está em **fase alpha**: erros e mudanças entre versões podem acontecer.
- Nova seção **Preparar o ambiente de desenvolvimento**, com o que fica fora do git e precisa ser
  refeito num clone novo, e como publicar com a `main` aceitando só pull requests.

## 0.29.0

- **Board no navegador, fora do editor**: **Abrir no navegador ↗** (ou o comando **Faz AI: Abrir
  board no navegador**) abre o mesmo board numa aba, sincronizado com o editor. Sem o editor, o
  comando `~/.faz-ai/bin/faz-ai` serve o board de uma pasta com o servidor MCP, a execução da IA e
  o heartbeat. A página só responde em `127.0.0.1` e exige o segredo do link.
- **Chamar a IA funciona sem a CLI no PATH**: o board procura o executável nas pastas de instalação
  usuais e dentro das extensões do editor (Claude Code, Codex). Antes, quem só usava a extensão do
  Claude Code recebia "comando não encontrado".
- Com o Claude Code, o servidor do board vai na linha de comando de cada execução: chamar a IA não
  depende mais de **Conectar IA (MCP)** nem da aprovação do `.mcp.json`.
- A IA é avisada do nível de permissão da execução e, quando ele não basta, bloqueia o card dizendo
  qual opção escolher. O nível aparece ao lado do botão **Chamar IA**, com atalho para mudar.
- Falhas da execução levam o fim da saída da ferramenta para o card, e o motivo do bloqueio é
  mostrado formatado.
- **Usabilidade**: botão **Chamar IA** no cabeçalho do card; avisos e erros em caixas flutuantes
  que não empurram o board; contador **N com você** e indicador de IA trabalhando no topo; campo
  Skills recolhido, com busca; cabeçalho do card fixo; orientação no board vazio e na linha de
  sub-tarefas; abrir card com Enter; foco visível pelo teclado; abas do topo mais discretas.
- **Um banco por pasta**: janelas em projetos diferentes não gravam mais uma por cima da outra. O
  board parte de uma cópia do banco das versões anteriores, que fica intacto.

## 0.28.0

- **Buscar e instalar skills**: a partir de uma pasta, de `dono/repositorio` do GitHub ou de um
  endereço git. O board lista as skills encontradas e copia as escolhidas para o projeto ou para a
  pasta do usuário. O repositório é clonado numa pasta temporária e nada dele é executado.
- A seção Plugins mostra os comandos de cada ferramenta para instalar e remover plugins.

## 0.27.0

- **Modelos e referências nas skills**: os arquivos de apoio de cada skill (`references/`,
  `assets/`, `scripts/`) aparecem na tela, com abrir, criar (com o link no `SKILL.md`) e apagar.
- **Criar skill de modelos**: skill do projeto para modelos de classe e exemplos de código.
- `get_card` devolve os arquivos de apoio das skills do card; nova ferramenta MCP `write_skill_file`.

## 0.26.0

- **Hooks**: listados um por comando, com o filtro; acrescentar e remover no formato de Claude
  Code, Codex, Cursor e Copilot. Os do Kimi Code são só listados.
- **Regras de permissão** (permitir, perguntar, negar) do Claude Code e da CLI do Cursor:
  listar, acrescentar e remover.

## 0.25.0

- **Servidores MCP**: acrescentar e remover nos arquivos de cada ferramenta, do projeto e da pasta
  do usuário, incluindo o `config.toml` do Codex. O `~/.claude.json` é só leitura.

## 0.24.0

- **Perfis de execução**: agente, skills, servidores MCP, ferramentas, modelo e sessão limpa, por
  fase, com troca por card e um padrão do board.
- A execução pelo board passa o perfil à ferramenta por parâmetro onde ela aceita, e como instrução
  no prompt onde não aceita.
- O modelo e o esforço indicados no card passam a ser enviados à ferramenta na execução.
- MCP: `get_card` devolve `execution`; `get_board` lista os perfis; `update_column` aceita
  `exec_profile`; nova ferramenta `set_card_profile`.

## 0.23.0

- **Skills sob demanda**: cada skill pode ser Automática ou Só quando indicada, gravado no formato
  de cada ferramenta.
- O campo "Skills" dos cards oferece também as skills desligadas, e a execução pelo board recebe o
  caminho de cada skill do card.

## 0.22.0

- **Harness**: criar, apagar e copiar skills, agentes, comandos e regras entre a pasta do usuário,
  os plugins e o projeto. Alterações na pasta do usuário pedem confirmação.

## 0.21.0

- **Harness por ferramenta e por escopo**: uma aba por ferramenta, com o que ela carrega no
  projeto, na pasta do usuário e em plugins (instruções, skills, agentes, comandos, hooks,
  servidores MCP, plugins e configurações).
- O campo "Skills" dos cards oferece as skills globais e de plugins, com filtro por origem.
- Kimi Code: a pasta de skills do projeto passa a ser `.kimi-code/skills`. A pasta antiga,
  `.kimi/skills`, continua listada, mas skills novas vão para a atual.

## 0.20.0

- **Ordem das colunas**: arrastar a linha da coluna nas configurações, no lugar dos botões de seta.
- A coluna nova entra depois da coluna escolhida; por padrão, antes da primeira coluna de conclusão.

## 0.19.0

- **Agentes no harness**: criar, editar e apagar agentes (subagentes) do projeto, no formato de
  cada ferramenta. Ferramentas MCP `get_agent`, `create_agent`, `update_agent` e `delete_agent`.

## 0.18.0

- **Pull request na Homologação**: a IA abre o PR da história e registra o endereço no card.
- **Merge automático** (opcional, desligado por padrão): ao aprovar a homologação, o board faz o
  merge pelo GitHub CLI e conclui o card; se o merge falhar, o card fica Bloqueado.

## 0.17.0

- **Branch e pasta de trabalho por história**: cada história tem uma branch própria, por padrão
  numa worktree separada. Nova aba Git nas configurações.

## 0.16.0

- **Heartbeat**: o board chama a IA sozinho a cada intervalo, quando há pendência com ela.

## 0.15.0

- **Chamar IA pela conversa**: roda a ferramenta do projeto em segundo plano para um card, com
  nível de permissão e tempo limite configuráveis.
- Imagens coladas na conversa viram anexos do card.

## 0.14.0

- **Fila de pendências**: filtro "Com você", contador na barra lateral e aviso quando a IA passa a
  vez. Ferramenta MCP `get_pending_work`.
- **Skill do fluxo** (`faz-ai-fluxo`), que ensina a IA a conduzir os cards pelo board.

## 0.13.0

- **Fases configuráveis**: cada coluna tem a instrução para a IA e o modelo do documento que a
  fase produz.
- Novas colunas **Discovery** e **Homologação** no board padrão.
- Os documentos das fases ficam anexados à história e aparecem como links nas sub-tarefas.

## 0.12.0

- **Status do card**: Pronto, Em execução, Aguardando resposta, Aguardando revisão, Aprovado e
  Bloqueado, mostrando se a pendência está com você ou com a IA.
- **Revisão antes de avançar**: nas colunas que exigem aprovação, a IA só move o card depois que
  você aprova.
- A aba "Comentários" passa a se chamar **Conversa**.
- **Atualização do board**: boards existentes são levados ao padrão novo, com confirmação e sem
  mover cards.

## 0.11.1 e anteriores

Ver o histórico de commits do repositório.
