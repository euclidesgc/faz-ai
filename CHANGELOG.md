🇧🇷 Português · [🇺🇸 English](CHANGELOG_EN.md)

# Changelog

## 0.48.0

### Adicionado

- A biblioteca do board marca o que é de fábrica e as cópias passam a acompanhar a origem.
- Novo tipo de card Hotfix, que parte da principal e gera tag e GitHub Release.
- Nova ferramenta MCP `set_base_branch` para trocar a base de uma história.
- Nova ferramenta MCP `release_card` para devolver à IA um card que estava com a pessoa.
- O contexto do card ganha sugestões, importação como regra e junção de arquivos para o que entra sozinho (#1116, #1117).
- Em Conectar agentes, o board descobre com o próprio agente o que a ferramenta dele carrega por conta própria.
- Nova tela Conectar agentes reúne o agente de IA do board, no lugar de Ferramentas de IA e Modelos de IA.
- Cada agente mostra a conta em uso e permite entrar e sair dela pelo board.
- A aba Testar conversa com o agente pelo ACP em tempo real e mostra o log do protocolo.
- O board grava um rastreio diário de tudo o que acontece, para investigar defeitos, e o comando **Faz AI: Abrir rastreio do board** o abre.
- Novo teste real do Gemini nos modos CLI, ACP e API, para quem desenvolve a extensão.
- O limite de uso do Gemini passa a valer nos três modos, e as Métricas mostram o modo da ferramenta.
- O Gemini passa a rodar pela CLI, com a chave guardada no cofre e uma home isolada a cada execução.
- Nova tela Conectar ferramenta liga o Gemini em ACP com a chave de API guardada no cofre.
- O Gemini pode rodar pela API, com o board conduzindo o ciclo de chamadas e as ferramentas MCP do card.
- O Gemini pela API também lê, grava arquivos e roda comandos, dentro dos limites da permissão e da pasta do projeto.
- Agentes ACP como Gemini CLI, Codex e OpenCode aparecem como perfis prontos do catálogo, desligados (#1095).
- O botão **Detectar modelos** passa a funcionar em agentes ACP, lendo os modelos que o agente anuncia (#1094).
- A opção **Regime de admissão** permite escolher entre o regime exclusivo e o compatível (#1091).
- A admissão por capacidades passa a cobrir o transporte ACP (#1090).
- Perfis de CLI ganham o transporte ACP para rodar agentes como Gemini CLI, OpenCode e Codex (#983).
- Ao fim de cada execução, o board confere o que a IA usou contra o que o card liberou (#972).
- No Cursor, um hook garante que a execução respeite o que o card permite (#965).
- O card selecionado ganha uma sombra que o destaca dos demais (#1069).

### Alterado

- O diálogo de importar artefatos fica mais organizado, com as ações num só rodapé.
- Agentes de fábrica não podem mais ser apagados e todo agente pode ser desligado.
- **Enviar** sempre chama a IA, mesmo com o card bloqueado, e vira **Parar** enquanto ela trabalha.
- O Bug passa a partir da `develop`, em vez da principal.
- Em Conectar agentes, a lista segue a ordem de uso e cada agente mostra um cadeado de contexto fechado ou aberto.
- A aba Conexão de Conectar agentes ficou mais simples.
- Um único botão **Atualizar** substitui **Verificar situação** e **Atualizar lista** em Conectar agentes.
- A sugestão de modelo foi para Harness › Ferramenta e execução.
- As regras de fallback passam a ser de cada agente, com cadastro validado e teste com veredito.
- As regras de fallback viram uma lista simples, no lugar de "Políticas de execução e fallback".
- O board roda cards de qualquer agente ligado ao mesmo tempo, e o agente em uso vira o agente padrão (#387).
- O perfil personalizado vira um caminho avançado e só aceita CLI.
- O regime de admissão passa a ser definido por perfil, a partir do que ele prova no Conectar.
- Cada perfil de IA passa a guardar a ferramenta e o modo (CLI ou ACP), e o banco sobe para o formato 48.
- A verificação de capacidades passa a ser feita por perfil e vale para o perfil que vai executar o card.
- A prova de isolamento vale para todas as permissões e sobrevive ao reinício do editor.
- O **Refinar com IA** não guarda mais o texto anterior da descrição (#1076).
- A IA recebe no máximo as últimas 20 mensagens da conversa (#1076).

### Removido

- Saiu o "Agente padrão" de Harness › Ferramenta e execução, que repetia o "Tornar padrão" da aba Agentes.
- A aba Detalhes de Conectar agentes sai; as ações do perfil passam para o fim da aba Conexão.
- Saiu o cartão "Agente padrão" do topo de Conectar agentes.
- Saiu a seção "Ferramenta deste projeto" do Harness.
- Saiu o item **Recriar board padrão** e a ferramenta MCP `reset_board`.
- Saíram as telas Ferramentas de IA e Modelos de IA, que foram para Conectar agentes.
- Saiu o comando **Faz AI: Verificar o isolamento da CLI de IA**, porque a verificação roda no Conectar.
- Saiu o campo Agente ACP do perfil personalizado novo, porque o agente ACP entra pelo Conectar ferramenta.

### Corrigido

- O texto do heartbeat diz que ele chama o agente de cada card, não uma ferramenta só.
- Os arquivos antigos do log do protocolo ACP passam a ser apagados junto com os do rastreio, também com a janela aberta por dias.
- O interruptor Ocultar session/update ganha um hint que explica que só filtra a lista.
- Revisão da interface: espaçamentos, títulos, campos vazios, blocos recolhíveis e tabelas estreitas ficam consistentes em todas as telas.
- O heartbeat e os outros interruptores das Configurações ficam com o espaçamento certo.
- Os diálogos de importar e exportar artefatos e os editores de contexto não ocupam mais a tela inteira.
- O Importar volta a encontrar as ferramentas instaladas, como o Claude Code.
- O Diagnóstico do ambiente passa a listar as cópias antigas do fluxo do board e dos agentes de fábrica (#1115).
- Resumir ou refinar um card bloqueado não o deixa mais "Em execução" para sempre.
- A sub-tarefa respondida pela pessoa volta a rodar, e a história não fica mais parada.
- O Claude Code passa a ter os modelos lidos da documentação oficial, com o Haiku 5.5 no nome certo.
- Codex e Google Antigravity pelo ACP voltam a conectar.
- A tela não desloca mais ao abrir um seletor ou menu no editor.
- Os seletores de modelo agrupam por agente e ganham filtro por nome.
- O teste das regras de fallback ignora o intervalo entre tentativas.
- O simulador das regras de fallback foi reformulado e passa a dar a decisão em uma frase.
- No Cursor, a cota esgotada do agente deixa de ser tratada como falha comum.
- No Cursor, um processo filho que sobrevive à saída não retém mais o `.cursor/mcp.json`.
- O hook do Cursor passa a ser instalado em qualquer editor quando o `cursor-agent` está no PATH.
- No Cursor, uma execução sem fim confirmado não recusa mais as seguintes até reabrir a janela.
- A tela inteira não rola mais além do limite, como se houvesse uma tela dentro da outra.
- Os botões de cada regra da sugestão de modelo não ficam mais colados.
- Corrigidos os defeitos de Configurações › Ferramentas de IA achados no teste de ponta a ponta com o rastreio do board.
- Corrigido o layout de Configurações › Ferramentas de IA e da barra do topo em painéis estreitos.
- As políticas de execução passam a aceitar perfis além das três CLIs prontas, como o Gemini e agentes ACP.
- As ferramentas negadas pelo card passam a valer também em execuções por ACP.
- Com o Gemini ou outro perfil ACP como padrão, o agente mantém as ferramentas do card.
- O log não troca mais "gemini" por "[credencial local]".
- A conferência da execução por ACP passa a comparar no vocabulário do card, sem falsos desvios.
- O agente do card volta a rodar com perfil ACP ou personalizado.
- Perfis personalizados e ACP aparecem no campo Modelo do card (#1093).
- Um perfil personalizado ou ACP volta a rodar cards e o chat no runtime padrão (#1091).
- A seção de execução pela conversa e heartbeat volta a aparecer com um perfil personalizado como padrão (#1091).

## 0.47.0

### Adicionado

- A configuração do contexto mínimo é congelada e verificada antes de cada execução (#998, #999, #1045, #1001).
- Em Plano de execução, **Propor com IA** sugere skills e MCPs adicionais para cada ação (#996, #1002).
- Novo runtime v1 do contexto mínimo nas portas de IA, opcional (#1000).
- Nova regra opcional de trilha curta leva histórias pequenas direto do Discovery ao Plan (#602).
- O runner avisa na conversa quando uma execução de IA passa de 10 milhões de tokens de leitura de cache (#603).
- Em Harness, o botão **Exportar para a ferramenta** copia regras, skills e agentes para Claude Code, Cursor ou Kimi Code (#623, #901, #902).
- O painel de métricas passa a medir a precisão também no modo autônomo (#605).
- O Diagnóstico mostra capacidades, o botão Testar, a próxima execução e os limites (#880).
- A IA passa a fazer perguntas com opções pela ferramenta `ask_questions` (#895).
- O card aberto mostra as perguntas da IA num carrossel, uma por vez (#955).
- Um assistente de IA ajuda a criar, sugerir fallbacks e revisar conflitos das políticas de execução (#734).
- Cada perfil de CLI declara o que a ferramenta ainda carrega por conta própria, sem prometer contexto vazio (#619).
- O menu do card ganha **Duplicar card** (#723).
- A aba Arquivados ganha busca, filtros, paginação e as sub-tarefas arquivadas de cada história (#724).
- A lixeira ganha seleção múltipla e ações em massa (#721).
- A aba Arquivados ganha seleção de vários cards com restaurar e enviar para a lixeira em massa (#775).
- O inventário do Harness e o **Importar** passam a ler o `.kimi-code/AGENTS.md` do projeto (#623).
- Adaptadores de execução por perfil de CLI preservam o leitor da base nas cópias e rodam perfis personalizados.
- Perfis personalizados de CLI passam a ter resolução de comando e sondas próprias.
- Perfis de CLI prontos, cópias e personalizados passam a ser guardados no banco, no schema 42.
- As políticas de execução e fallback ganham base versionada, avaliador compartilhado e editor manual.
- A CLI real passa a ser testada pelo caminho de execução do board.
- `npm run test:cli-real` verifica o contrato com o Claude Code real.
- O orquestrador persistido passa a conduzir execuções com processos controlados.
- O gateway aceita um registro assíncrono da identidade antes de liberar o launcher.
- Execuções controladas passam a ter identidade MCP por tentativa.
- A orquestração ganha uma fundação persistida de unidades e tentativas, no schema 39.
- Os arquivos da biblioteca ficam fixados por execução.
- O plano de execução passa a ser revisável por atividade.
- O gateway ganha a base de admissão de contratos v1 por capacidades.
- A identidade da execução é registrada antes de a IA iniciar.
- O MCP do projeto passa a ser emprestado durante a execução no Cursor e no Kimi Code.
- O board ganha a base de contratos de contexto versionados, no schema 35.
- A aba Consumo e os editores de agentes mostram o contexto efetivo com a origem de cada item.
- A criação e a edição de subagentes ganham assistência de IA em cada parte.
- A barra de seleção e o menu da coluna ganham ações contextuais em lote (#616).
- O log guarda o comando de cada chamada de Bash (#604).
- O `get_card` aceita `only` para devolver só os blocos que interessam.

### Alterado

- A busca de card por número fica mais precisa (#1065).
- O board responde mais rápido com histórico grande (#1066).
- O limite de uso do plano passa a pausar a fila do perfil de CLI, em vez dos cards (#1047).
- O ciclo do card usa menos chamadas do MCP, com respostas resumidas (#601).
- As configurações do board voltam para a tela de Configurações do próprio board (#726).
- Os textos da IA e o board padrão v13 passam a usar as perguntas com opções (#956).
- O board passa a executar as sub-tarefas da Implementação, uma por execução própria (#621, #824).
- O modelo escolhido passa a decidir a CLI de cada execução (#620).
- A reserva de modelo vira uma proposta de política de execução (#735).
- As políticas de execução e fallback passam a ficar em Configurações → Ferramentas de IA (#733).
- O chat, os assistentes e as sugestões usam a mesma política de execução dos cards (#732).
- O fluxo do board chega pelo MCP, sem arquivo na pasta da ferramenta (#617).
- As ferramentas de IA viram perfis de CLI que dá para ligar, duplicar, criar e testar (#618).
- A importação passa a usar o adaptador de formato, e o Diagnóstico avisa da cópia antiga da skill do fluxo (#851).
- O Diagnóstico e o aviso do topo passam a ser por perfil de CLI (#622).
- A tela do Harness passa a ter as abas Ferramenta e execução e Artefatos do board (#616).
- O board passa a guardar a própria cópia dos agentes, skills, regras e servidores MCP (#615).
- Os IDs de perfis passam a ser separados das bases de CLI.
- As configurações de MCP ficam num cofre local, e a importação passa por revisão.
- O Harness passa a ter a biblioteca do board numa pasta compartilhada entre ferramentas (#615).
- A importação por tipo ganha revisão e proteção contra duplicatas.
- A criação de regras e skills ganha orientação passo a passo.
- A gestão da biblioteca ganha ações em massa e descrições dos MCPs.
- A IA resolve o conflito do pull request numa execução própria, e o board confere o conflito antes do PR (#747).
- As fases de documento partem do mapa do código que a fase anterior já leu (#600).
- O heartbeat sincroniza as branches locais e faz a manutenção numa ordem fixa e em paralelo (#722).
- O `get_board` fica enxuto, com uma lista de agentes e sem aparência nem inventário repetido (#598).
- As notas fixas do `get_card` ficam curtas, e o texto completo vai para skills por assunto (#588).
- Na conversa do card, o botão "Resumir a conversa" fica à direita e em destaque.
- O resumo automático também considera o tamanho da conversa.
- No card aberto, o botão "Salvar descrição" sobe para o cabeçalho da seção.
- A caixa de selecionar todos da coluna passa para o início do cabeçalho (#579).
- O heartbeat passa a cuidar do board inteiro a cada rodada.
- Aprovar não chama mais a IA na hora quando o heartbeat está ligado.
- O resumo desativa as mensagens anteriores em vez de apagá-las.
- Toda ação do board passa a mostrar que está esperando a confirmação.

### Removido

- O modelo de reserva por regra sai de vez (#853).
- Saem a delegação nativa a subagentes e o limite de sub-tarefas em paralelo na tela (#825).
- O board deixa de ler e gravar as pastas das ferramentas (#926).
- Regras não mostra mais o aviso sobre a aba Modelos (#725).
- O campo Criticidade saiu do board.

### Corrigido

- O modo autônomo não recusa mais os cards do agente que declara a skill do fluxo.
- O editor de contrato de contexto volta a abrir pelo agente (#1054).
- A ponte MCP ignora o token de execução não interpolado (#823).
- As sub-tarefas do card aberto ficam alinhadas (#844).
- O MCP e a skill do board são instalados no usuário sozinhos, e o aviso de desatualizado só aparece quando é real (#809).
- A execução que cai antes do primeiro evento não é mais repetida (#739).
- O refinar não cola mais a descrição anterior inteira na conversa (#599).
- Abrir um seletor não desloca mais o board.
- O limite de uso esgotado do Claude Code não bloqueia mais o card.
- O aviso "Como usar o Harness" não volta mais depois de dispensado.

## 0.46.0

### Adicionado

- O registro do MCP é refeito ao atualizar a extensão (#563).

### Alterado

- O servidor MCP do board é instalado só no global da ferramenta (#563).

### Corrigido

- A skill `faz-ai-fluxo` volta a carregar no Cursor (#563).
- O limite de uso esgotado do Kimi Code não bloqueia mais o card (#570).

## 0.45.0

### Adicionado

- O board passa a trabalhar com o Kimi Code, a terceira ferramenta de IA.
- O heartbeat diz por que não executou (#551).
- O Harness do Kimi Code lista, acrescenta e remove hooks, e os agentes de fábrica ganham ajustes para ele.
- Mudar a principal ou a `develop` para um nome novo permite renomear também no `origin` (#466).
- Nova opção `fazai.git.mainBranch` para fixar a branch principal.
- O board limpa as branches e worktrees órfãs (#465).
- Novo `npm run e2e:kimi` testa o Kimi Code num contêiner limpo.
- A principal e a `develop` também podem ser renomeadas pelo navegador (#498).
- O Diagnóstico ganha o item Nome da branch principal/develop (#498).

### Alterado

- O release do repositório passa a seguir o gitflow (#481).

### Corrigido

- Retomar o modo autônomo numa janela que não é a dona do board passa a avisar.
- O limite de uso esgotado não bloqueia mais o card (#551).
- O menu da coluna acomoda o item da lixeira (#530).

## 0.44.0

### Adicionado

- O board cria a `develop` quando ela falta.
- A branch principal é detectada sozinha.
- Novos avisos na conversa da história sobre o estado das branches.
- A IA lê para onde abrir o pull request.
- Nova tela Configurações → Git para o gitflow.
- Seis novas opções do Settings do editor, em Faz AI › Git.
- A limpeza das órfãs e o renomear da principal no `origin` vêm nas próximas entregas.

### Alterado

- As branches criadas pelo board seguem o gitflow (#462).
- O nome da branch passa a aceitar `{fluxo}`.
- A branch passa a nascer do que está no `origin`.
- A conclusão da história no gitflow limpa a worktree e as branches (#464).
- A pilha e o hotfix passam a ser tratados na conclusão da história (#480).

## 0.43.0

### Adicionado

- Toda ação demorada passa a mostrar que está trabalhando.

### Alterado

- No Harness de IA, o escopo passa a vir antes do assunto.
- Os botões do Harness ganham tamanho, espaço e dica.

## 0.42.0

### Adicionado

- O Harness fica mais claro de usar, com o aviso **Como usar o Harness**.

## 0.41.0

### Adicionado

- O harness vira uma pendência do Diagnóstico (5/5).
- **Indicar artefatos** e o planejamento passam a usar só o que está no board (3/5).

### Alterado

- Novo banco de artefatos do board, com modos, servidores MCP, regras desligadas e pastas importadas (1/5).
- O editor de agentes passa a ser por ferramenta e ganha assistentes de criação (4/5).
- A tela do Harness passa a ser por ferramenta e por assunto (2/5).

## 0.40.0

### Adicionado

- A fila do modo autônomo fica visível no card.
- O modo autônomo pode ser ligado pelo board.
- O cabeçalho da coluna ganha uma caixa de selecionar todos.

### Alterado

- Aprovar chama a IA na hora (#475).

### Corrigido

- Cards presos em "Em execução" voltam para a IA.

## 0.39.0

### Adicionado

- Os documentos das fases ganham a seção "Perguntas para você" (#441).
- O autopiloto resume a conversa entre as fases do modo autônomo (#441).

### Alterado

- Aprovar leva o card para a próxima coluna (#441).
- O modo autônomo segue sem paradas até a coluna escolhida (#441).
- A dica do status Aprovado passa a dizer "O card segue para a próxima coluna".

## 0.38.0

### Adicionado

- Colar uma imagem na descrição do card a envia para os anexos (#440).

### Alterado

- O menu da coluna ganha "Selecionar todos" e ações em lote (#436).

### Corrigido

- O card "Skill do fluxo" e o "Servidor do board" não se duplicam mais no Harness de IA (#437).

## 0.37.0

### Adicionado

- Cada card mostra o contexto estimado da execução, com detalhe por grupo e por item.
- O card aberto ganha a aba **Consumo**, com a estimativa e o gasto medido por fase.

### Alterado

- Os campos do board saem das configurações e a aba passa a se chamar Campos personalizados.
- A Fase da sub-tarefa passa a ser do board e da IA.
- O harness global é relido na hora quando muda.

### Corrigido

- As instruções do MCP passam a ser lidas por inteiro no Claude Code.

## 0.36.0

### Adicionado

- Nova opção `fazai.git.decisionRecords` grava o registro de decisão da história no repositório, na Homologação.
- Painel de métricas e `get_metrics` mostram o retrabalho: revisões pedidas, aprovadas de primeira e pedidos de ajuste.
- Áreas críticas do projeto exigem a sua aprovação nas histórias do núcleo, mesmo no modo autônomo.
- O modo autônomo pode seguir só até a fase escolhida, em vez de ir até o pull request.
- Nova coluna Revisão, entre Implementação e Homologação, em que a IA roda as checagens e revisa o diff.
- Histórias pequenas podem começar direto numa fase adiante, sem os documentos das fases anteriores.

### Alterado

- O agente `revisor-de-codigo` classifica cada achado e é mais breve, inclusive ao procurar código que só passa no teste.
- O modelo da Spec ganha a seção Desenho do programa, e as alternativas descartadas vêm com o motivo.
- O Plan divide a entrega em partes fáceis de revisar e cria histórias derivadas quando passa de umas 400 linhas.
- O corpo do pull request explica a entrega: objetivo, o que foi feito, como revisar, decisões e como testar.
- No modo autônomo, a IA segue os padrões do projeto e escolhe o caminho menos complexo.
- Atualizar board troca os textos das fases que ainda estão no padrão anterior e preserva os personalizados.

## 0.35.0

### Adicionado

- O Harness mostra os arquivos que as instruções do Claude Code importam com `@caminho` e os arquivos de subpastas lidos sob demanda.
- Nova aba Global no Harness de IA reúne o que vale em todos os seus projetos, incluindo plugins e política da organização.
- Nova aba Projeto no Harness de IA lista, em grupos, tudo o que a ferramenta lê na pasta do projeto.
- O Diagnóstico do ambiente ganha um botão para recarregar a janela e fazer valer uma versão recém-instalada.
- O Harness ganha ações em massa nas abas Projeto e Global, com confirmação para apagar e remover.
- O Harness passa a encontrar o `AGENTS.md`, a memória automática, a política da organização e itens do Cursor, cada um com seu grupo.
- Arquivos do harness abrem numa janela do próprio board, com visualização formatada e edição.
- A outra ferramenta de IA encontrada na máquina aparece em Opcionais no Diagnóstico.
- O Diagnóstico confere a versão do Node.js e exige a 22 ou mais nova.

### Alterado

- O Diagnóstico do ambiente vira uma lista de conferência com Necessários, Opcionais e Recomendados, sem o instalador.
- Os botões do Diagnóstico ganham mais destaque, com a ação que resolve cada item em azul.
- A lista de plugins mostra só os instalados de verdade e permite desativar, ativar e desinstalar em massa.
- A detecção de merges passa a acontecer no heartbeat, e as chaves `fazai.git.watchMerges` e `fazai.git.watchMergeMinutes` saem do Settings.
- O tempo limite de execução padrão passa a 45 minutos e o intervalo do heartbeat a 10 minutos.
- Um ícone de atenção na aba Configurações e em Verificar ambiente substitui a faixa amarela.

### Removido

- A aba "Tudo que a ferramenta carrega" saiu, pois as abas Projeto e Global mostram o mesmo conteúdo.

### Corrigido

- O editor do harness não fica mais carregando para sempre quando o board não responde.
- O Harness não treme mais ao escolher uma opção, e os botões de cada linha quebram em painéis estreitos.
- Os avisos das telas de Git, de execução e do Harness agora aparecem em âmbar.
- O aviso de login do Claude Code sugere `claude auth login`.

## 0.34.1

### Corrigido

- Uma versão anterior da extensão recusa abrir um board gravado por versão mais nova, em vez de falhar pela metade.
- O erro ao abrir o board vem explicado, não trava a janela e permite tentar de novo.

## 0.34.0

### Adicionado

- Login vencido da ferramenta de IA agora aparece como aviso de erro no board, em vez de parar sem explicação (#189).
- O modo autônomo liga e desliga direto pelo ícone do cartão, com um aviso mais curto (#416).
- Cada regra de sugestão de modelo ganha um modelo reserva, usado quando o principal esgota o limite.
- Cards podem ser colapsados para mostrar só a faixa e o título.
- Nova barra de atividade no pé do board mostra o que a IA está fazendo agora.
- Novo botão resume a conversa do card, também disponível como `generate_summary`.
- Exportar e importar o board agora funcionam pela paleta de comandos do editor.
- As configurações do Faz AI aparecem no Settings do editor, com novos comandos na paleta.
- Anexos em Markdown abrem formatados, com seletor para ver o código.
- Novo Diagnóstico do ambiente lista o que o board precisa e como resolver cada item.
- O Diagnóstico ganha Instalar tudo, que roda os passos num terminal do editor.
- O board grava o caminho completo dos MCPs, para o chat do editor encontrá-los.
- Configurações mostram avisos de dependência entre opções e links para navegar até a opção relacionada.

### Alterado

- O consumo da IA passa a aparecer só em tokens, sem custo em dólar.
- A pausa do modo autônomo fica gravada no board e vale até você retomar (#220).
- Uma aba Arquivados substitui a coluna de arquivados, e Restaurar substitui Desarquivar.
- Fases só de texto rodam em paralelo em qualquer modo de workspace (#331).
- Arrastar cards ficou suave, com os outros cards se afastando e a posição final correta (#286).
- O botão Salvar descrição ganha destaque e fica abaixo do editor (#287).
- O botão de criar card passa para o topo da coluna.
- As chaves de Git e paralelo passam para o Settings do editor, com migração automática.
- Os botões Trabalhar na fase e Refinar com IA mostram um hint formatado.
- Toda execução pelo board parte de contexto vazio, e o Harness de IA define o que entra.
- Os agentes passam a ser arquivos da ferramenta, com dez agentes de fábrica criados na primeira abertura.
- Toda chamada à IA passa por um único gateway, e o log de uso deixa de ser opcional (#187).
- O teste e2e do Cursor mostra uma saída mais limpa.
- O modo autônomo retoma sozinho ao abrir o editor, respeitando o que você pausou.
- Na fila, o bug vem primeiro e a história mais adiantada termina antes de uma nova começar.
- O roteiro "Como testar" passa a ser gravado na descrição do card e no pull request.
- O MCP do board e a skill do fluxo passam a ser requisitos em todas as ferramentas.
- Tema, fonte e tamanho da fonte passam para o Settings nativo do editor.
- A tabela de status passa da aba Aparência para a aba Fluxos.

### Removido

- O board passa a suportar só o Claude Code e o Cursor.
- A tabela de preços saiu, e o board deixa de calcular custo (#187).

### Corrigido

- O modo autônomo não reexecuta nem bloqueia mais uma história já entregue (#413).
- Uma história bloqueada não segura mais a fila inteira do autopiloto.
- A entrega da história autônoma agora é detectada quando o PR chega antes da última coluna.
- A Implementação em modo autônomo não para mais com o condutor.
- O agente padrão deixa de virar um arquivo com nome truncado na migração dos perfis.
- Instalar a skill do fluxo marca a skill mesmo quando ela já existia.
- O script de instalação do Diagnóstico sai todo em inglês.
- O LED da sub-tarefa não apaga mais segundos depois de acender.
- Uma história que espera dependência não para mais a fila do modo autônomo.
- A pilha de branches do modo autônomo respeita a ordem da fila ao reordenar por arrasto.
- O board volta a abrir sem o erro "FOREIGN KEY constraint failed".
- O servidor do board no Cursor e nas outras ferramentas tem instalação global que funciona e aviso que some.
- A barra de modo autônomo do card mostra só uma linha curta sobre o bloqueio de outra história.
- Pendência com a pessoa agora passa a vez no status do card, por meio do parâmetro `pending` do `request_review`.
- O aviso `allowed_warning` do Claude Code não conta mais como limite esgotado.
- A troca para o modelo reserva só acontece quando a execução falhou.
- Se a retentativa com o modelo reserva não começar, o card é bloqueado com o motivo.
- Numa sub-tarefa, a execução conta como texto ou branch pela fase da história.
- Os comandos Exportar o board e Importar um board têm título em inglês quando o editor está em inglês.
- O comentário de história entregue sai sempre com o nome da ferramenta de IA como autor.
- A nota do autopiloto na barra de atividade mostra só a primeira linha do motivo, com até 160 caracteres.
- No Windows, as execuções e consultas às CLIs não abrem mais uma janela do `cmd.exe`.
- No Windows, o named pipe do servidor MCP leva o nome do usuário.
- A barra de seleção múltipla ganhou fundo, borda e espaçamento nos dois temas.
- A caixa Modo autônomo e o botão em lote refletem o clique na hora e travam até o board confirmar.
- Colapsar ou expandir um card pelo teclado mantém o foco no botão de colapso.
- A caixa de marcação do card aparece quando recebe foco pelo teclado.
- A barra de atividade não anuncia mais a linha toda ao leitor de tela a cada minuto.
- Arrastar um card logo depois de soltar outro parte da ordem que está na tela.
- Em Modelos de IA, Preencher o modelo sugerido automaticamente aparece desligado quando não há regra de sugestão.
- Resumir a conversa trava logo após o clique, e dois cliques seguidos não disparam duas execuções.
- Só um formulário Novo card fica aberto por vez no board, e Esc o fecha.

## 0.33.0

### Adicionado

- O Auto do Cursor passa a ter preço variável, e o board não estima o custo dele.
- Nova chave Tarifa do Cursor (`cursorTokenRate`) soma a taxa por token dos planos Teams e Enterprise à estimativa.

### Alterado

- As imagens do README de agentes, harness e modelos foram refeitas com a interface atual.
- O servidor MCP e a skill do fluxo são instalados na seção de cada ferramenta, no global por padrão (#141).
- A dica da tabela de preços e o README explicam modo rápido, contexto longo e a correspondência dos nomes de modelo do Cursor.

## 0.32.0

### Adicionado

- A chave "Incluir os modos rápidos" coloca as versões rápidas dos modelos do Cursor no catálogo, cada uma com preço próprio.
- Uma faixa no topo do board avisa o que falta para a ferramenta de IA trabalhar, com a ação para resolver cada item.
- O Cursor aceita os níveis "só o board" e "board e arquivos", além de "sem restrições".
- O board registra tokens, custo e inventário de uso de cada execução da IA, estimando o custo pelo preço do modelo.
- A nova visão Métricas mostra atividades concluídas, execuções, tokens, custo e tempo de IA, com filtros de período e workflow.
- O painel de métricas traz a série mensal de custo e tokens, em gráfico e tabela.
- O painel de métricas mostra onde o consumo aconteceu, o tempo do card em cada fase, o lead time, os rankings mais caros e o que a IA usou.
- O `get_metrics` agrupa também por esforço, perfil, ferramenta usada e ferramenta de MCP.
- A janela do detalhe de cada execução é configurável de 1 a 24 meses, com padrão de 6.
- Clicar no nome da branch no card aberto copia o nome.
- O heartbeat pode tocar várias histórias ao mesmo tempo, no modo "Worktree por história", com a chave "Tocar histórias em paralelo".
- Sub-tarefas independentes rodam ao mesmo tempo, e um card pode depender de outro.
- Em Configurações → Backup, dá para exportar o board para um arquivo `.fazai.json` e importá-lo de volta.
- A seção Vínculos do card aberto passa a mostrar a relação entre história e sub-tarefas.
- A história concluída sai do board, arquivada, quando a versão que a contém é publicada.
- A IA pode consultar as métricas de uso do board na conversa do card com `get_metrics`.

### Alterado

- As imagens do README foram refeitas com a interface desta versão.
- O "Chamar IA" virou dois botões: "Trabalhar na fase" e o novo "Refinar com IA".
- Os modelos do Cursor passam a ser os da sua conta, lidos de `cursor-agent models`.
- As ferramentas do board recusam parâmetro desconhecido em vez de ignorá-lo em silêncio.
- O catálogo do Cursor foi atualizado: `"type": "stdio"` nos servidores MCP, subagentes do Grok e novos eventos de hook.
- A CLI do Cursor é procurada como `cursor-agent`, e o esforço do modelo vai como sufixo do id.
- O LED do card agora parece um LED e mostra o estado de relance: verde, amarelo, vermelho ou apagado.
- Os botões passam a dizer o que o clique faz, e o modo autônomo tem um nome só na interface.
- Dividir um pedido grande em histórias com `autonomous_from` agora as vincula como relacionadas.

### Corrigido

- Agentes, modelos e regras de sugestão não perdem mais uma mudança feita logo depois de outra.
- As regras de sugestão aparecem traduzidas na interface em inglês.
- Windows, macOS e Linux usam o mesmo board no editor e no terminal, sem abrir banco vazio nem perder dados.
- As execuções do Claude Code e do Cursor ficaram mais robustas.
- O card aberto não perde mais o que foi escrito, e o Esc fecha só o que está por cima.
- Os botões de IA do card mostram no board o erro de uma execução que nem começou.
- O servidor do board é registrado com o caminho completo do node.
- O Cursor em segundo plano funciona de verdade, com o servidor do board, o consumo, o inventário e a pasta da história.
- No Windows, o prompt chega inteiro às CLIs instaladas pelo npm, e Parar encerra a árvore de processos.
- Avisos de configuração do Claude Code não escondem mais o motivo real do erro no chat e no card.

## 0.31.1

### Corrigido

- O card aberto voltou a funcionar: abre centralizado e fecha só ao clicar fora ou com Esc.

## 0.31.0

### Adicionado

- O board passou a guardar o histórico dos acontecimentos dos cards e das execuções da IA.
- Nenhum conteúdo de conversa vai para o histórico, e o detalhe fica 12 meses além dos totais mensais.
- O board padrão aparece traduzido quando a interface está em inglês.
- Opções de campos de seleção que nomeiam uma tecnologia ganham o logo dela.
- A IA preenche Tags, Esforço, Modelo e Skills e cria o checklist na primeira chamada de um card sem esses campos.
- O LED da IA aparece também no topo do card aberto.
- O board detecta o merge do pull request e conclui a história sozinho.

### Alterado

- O modo autônomo para na Homologação, com o pull request aberto, em vez de ir até Concluído.
- A fila da IA segue a ordem do board, com os bugs na frente, e não o número do card.
- O anexo abre numa janela do próprio board, onde texto e JSON podem ser lidos e editados.
- O card aberto abre como janela centralizada e não cobre mais o chat.

### Corrigido

- O pacote publicado sai com as notas da versão no topo do changelog.
- O release deixou de fazer push direto na `main` e passa por uma branch de release com PR.

## 0.30.0

### Adicionado

- Modo autônomo (YOLO): a IA toca a história do Backlog ao pull request sem pedir confirmação, com autopiloto em fila.
- O README pede avaliação e indica as issues, que ganharam formulários de bug e de melhoria.
- Interface em português e inglês, com o **Idioma** escolhido em Configurações → Aparência.
- Chat com a IA no board para criar, mover, vincular e consultar cards em linguagem natural.
- Vínculos de pai, filho e relativo entre cards de qualquer workflow, com `link_cards` e `unlink_cards`.
- Todo card novo de um tipo nasce com as skills escolhidas em Padrões por tipo.
- Agentes ganham o campo **O que este agente faz**, que sugere skills e servidores MCP, e conjuntos prontos de ferramentas.
- Botão de tema no topo do board alterna entre Sistema, Claro e Escuro.
- O contraste de textos, controles e foco do teclado passa a ser verificado por teste automático nos dois temas.
- Interno: ESLint, Prettier e testes de interação do board configurados, sem mudança para quem usa.
- O botão "⋯" dos menus avisa aos leitores de tela se o menu está aberto.
- Cards com pendência sua ganham borda na cor do status.
- Um LED pisca devagar na barra do card enquanto a IA trabalha nele.
- O MCP ganhou `create_workflow` e `delete_workflow`, e perdeu `set_workflow_layout` e o parâmetro `collapsed` de `update_column`.
- Cada workflow tem uma alça para arrastar sua posição no board, e o MCP ganhou `move_workflow`.
- Um coração no topo do board mostra se o heartbeat está rodando e liga ou desliga ao clique.

### Alterado

- Controles do card aberto, do board e dos filtros passam a usar os seletores e campos do Radix.
- O Harness de IA ganha três abas: Ferramenta e execução, Do projeto e Tudo que a ferramenta carrega.
- Os perfis de execução viram Agentes, e toda execução pelo board passa por um agente.
- O campo Skills do card abre uma janela de escolha com busca, abas e origem de cada skill.
- O Harness de IA ganha uma lista nova de skills, agentes, hooks e servidores MCP, com seleção em grupo e ações em lote.
- O board usa uma paleta própria, igual no editor e no navegador, em claro e escuro.
- O botão principal é azul índigo nos dois temas.
- As barras de rolagem usam as cores do board e a das colunas ganhou espaço de respiro.
- Interno: o front usa primitivas de interface em vez de repetir o mesmo HTML em cada tela.
- Interno: a tela Harness foi dividida em arquivos por seção, com ações pedidas ao host por comandos nomeados.
- Interno: o código todo segue o Prettier, e o `npm run typecheck` cobre os testes da interface.
- Interno: as regras do board repetidas no host e no front ficam num só lugar, em `src/shared`.
- Interno: as ferramentas MCP saem de um arquivo gigante para um arquivo por grupo, sem mudar o que a IA vê.
- Interno: o roteador de mensagens do host vira um despachante tipado com handlers por domínio.
- Interno: a tela Harness vira composição de seções, com novos testes de interação.
- Interno: o painel do card vira composição de partes, com novos testes de interação.
- Emojis e símbolos soltos dão lugar a um conjunto único de ícones de traço (Lucide) em todo o board.
- O card do board ganha barra na cor do tipo, status com ícone e tempo, linha própria para o modelo e rodapé com branch e PR.
- As Configurações ficam mais organizadas, em largura total, com título e ação principal na mesma linha e menu lateral recolhível.
- A tela de Campos é refeita com um cartão por campo, prévia ao vivo e o botão **Novo campo**.
- Os formulários passam a usar os componentes do Radix Themes.
- Workflows e colunas são refeitos: dá para criar e excluir workflows, e o board lembra o estado de cada um.
- O LED da IA fica sempre no card, apagado quando a IA termina, e a história acende com o trabalho nas sub-tarefas.
- As regras do board ganham o novo design, com um cartão por regra.
- O Harness de IA ganha o novo design, com cartões e o botão principal no topo de cada seção.
- Os perfis de execução ganham o novo design, com cartões e seletores do Radix.
- Os modelos de IA ganham o novo design, com rascunho de modelo novo e botões no topo.
- As telas Git e Aparência ganham o novo design, com cartões de formulário e controles do Radix.
- Os últimos controles antigos das Configurações, inclusive os campos personalizados do card aberto, passam para o Radix.

### Removido

- Os cards perdem a faixa colorida à esquerda, e a cor do tipo fica na barra do card.

### Corrigido

- Skills e agentes com `description: |` ou `>` em várias linhas agora mostram a descrição inteira.
- O painel de Filtros da barra lateral usa o fundo do tema do board e deixa de ficar quase invisível.
- Os selos de status e de tipo ficam legíveis em qualquer cor escolhida.
- Trocar de card com a descrição em edição não salva mais o rascunho no card errado.
- O texto sobre a cor do tipo e do status passa a ser escolhido pelo contraste percebido, com prévia e aviso na escolha da cor.
- Campos de texto, link e número do card não perdem mais letras ao digitar rápido.
- Os logs do navegador de teste (`.playwright-mcp`) passam a ser ignorados pelo git.
- Em Configurações > Campos, o seletor "No board" não invade mais a coluna das opções em janelas estreitas.

## 0.29.1

### Adicionado

- O README avisa que o projeto está em fase alpha.
- Nova seção sobre preparar o ambiente de desenvolvimento e publicar com a `main` aceitando só pull requests.

## 0.29.0

### Adicionado

- O board abre no navegador, sincronizado com o editor, e o comando `faz-ai` o serve fora do editor.
- A IA é avisada do nível de permissão da execução e bloqueia o card dizendo qual opção escolher quando ele não basta.
- Falhas da execução levam o fim da saída da ferramenta para o card, com o motivo do bloqueio formatado.

### Alterado

- Com o Claude Code, chamar a IA não depende mais de **Conectar IA (MCP)** nem da aprovação do `.mcp.json`.
- Melhorias de usabilidade: botão **Chamar IA** no cabeçalho do card, avisos flutuantes, contador **N com você**, foco visível pelo teclado e outras.

### Corrigido

- Chamar a IA funciona sem a CLI no PATH, pois o board procura o executável nas pastas usuais e nas extensões do editor.
- Cada pasta tem seu próprio banco, e janelas de projetos diferentes não gravam mais uma por cima da outra.

## 0.28.0

### Adicionado

- Buscar e instalar skills a partir de uma pasta, de um repositório do GitHub ou de um endereço git.
- A seção Plugins mostra os comandos de cada ferramenta para instalar e remover plugins.

## 0.27.0

### Adicionado

- Os arquivos de apoio de cada skill aparecem na tela, com abrir, criar e apagar.
- Nova opção **Criar skill de modelos**, para modelos de classe e exemplos de código.
- `get_card` devolve os arquivos de apoio das skills do card, e a nova ferramenta MCP `write_skill_file` os grava.

## 0.26.0

### Adicionado

- Hooks listados um por comando, com acrescentar e remover nos formatos de Claude Code, Codex, Cursor e Copilot.
- Regras de permissão do Claude Code e da CLI do Cursor podem ser listadas, acrescentadas e removidas.

## 0.25.0

### Adicionado

- Servidores MCP podem ser acrescentados e removidos nos arquivos de cada ferramenta, do projeto e da pasta do usuário.

## 0.24.0

### Adicionado

- Perfis de execução definem agente, skills, servidores MCP, ferramentas e modelo por fase, com troca por card.
- O MCP ganhou `set_card_profile`, e `get_card`, `get_board` e `update_column` passam a tratar os perfis.

### Alterado

- A execução pelo board passa o perfil à ferramenta por parâmetro ou como instrução no prompt.
- O modelo e o esforço indicados no card passam a ser enviados à ferramenta na execução.

## 0.23.0

### Adicionado

- Cada skill pode ser Automática ou Só quando indicada, no formato de cada ferramenta.

### Alterado

- O campo "Skills" dos cards oferece também as skills desligadas, e a execução recebe o caminho de cada skill do card.

## 0.22.0

### Adicionado

- Harness permite criar, apagar e copiar skills, agentes, comandos e regras entre a pasta do usuário, os plugins e o projeto.

## 0.21.0

### Adicionado

- O Harness ganha uma aba por ferramenta, mostrando o que ela carrega no projeto, na pasta do usuário e em plugins.

### Alterado

- O campo "Skills" dos cards oferece as skills globais e de plugins, com filtro por origem.
- No Kimi Code, a pasta de skills do projeto passa a ser `.kimi-code/skills`.

## 0.20.0

### Alterado

- A ordem das colunas muda arrastando a linha nas configurações, no lugar dos botões de seta.
- A coluna nova entra depois da coluna escolhida, ou antes da primeira coluna de conclusão por padrão.

## 0.19.0

### Adicionado

- Agentes do projeto podem ser criados, editados e apagados no harness, com as ferramentas MCP `get_agent`, `create_agent`, `update_agent` e `delete_agent`.

## 0.18.0

### Adicionado

- Na Homologação, a IA abre o pull request da história e registra o endereço no card.
- Merge automático opcional, desligado por padrão, que conclui o card ao aprovar a homologação.

## 0.17.0

### Adicionado

- Cada história tem branch e pasta de trabalho próprias, com uma nova aba Git nas configurações.

## 0.16.0

### Adicionado

- Heartbeat: o board chama a IA sozinho a cada intervalo quando há pendência com ela.

## 0.15.0

### Adicionado

- Chamar IA pela conversa roda a ferramenta do projeto em segundo plano para um card.
- Imagens coladas na conversa viram anexos do card.

## 0.14.0

### Adicionado

- Fila de pendências com filtro "Com você", contador na barra lateral, aviso e a ferramenta MCP `get_pending_work`.
- A skill do fluxo (`faz-ai-fluxo`) ensina a IA a conduzir os cards pelo board.

## 0.13.0

### Adicionado

- Cada coluna tem a instrução para a IA e o modelo do documento que a fase produz.
- Novas colunas Discovery e Homologação no board padrão.
- Os documentos das fases ficam anexados à história e aparecem como links nas sub-tarefas.

## 0.12.0

### Adicionado

- O status do card mostra se a pendência está com você ou com a IA.
- Nas colunas que exigem aprovação, a IA só move o card depois que você aprova.
- Boards existentes são levados ao padrão novo, com confirmação e sem mover cards.

### Alterado

- A aba "Comentários" passa a se chamar **Conversa**.

## 0.11.1 e anteriores

Ver o histórico de commits do repositório.
