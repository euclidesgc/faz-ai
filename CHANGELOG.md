🇧🇷 Português · [🇺🇸 English](CHANGELOG_EN.md)

# Changelog

## 0.48.0

### Adicionado

- **Conectar agentes: uma tela só para o agente de IA do board.** Configurações ganha **Conectar agentes**, antes do Harness, no lugar de Ferramentas de IA e Modelos de IA. No topo fica o agente padrão (o que roda os cards sem modelo), com o modo, a conexão e a conta. A lista junta os agentes que o board executa com o registro oficial do ACP, de onde vêm o ícone, a descrição e a versão de cada um; os agentes do registro que o board ainda não executa ficam à parte, só para teste. Cada agente tem as abas **Conexão** (a ferramenta instalada, a conta, o Conectar com o board, o modo e o uso nos cards), **Modelos** (o catálogo do agente, que era a tela Modelos de IA), **Testar** e **Detalhes** (o tipo do perfil, o isolamento, as capacidades, a ciência do regime, duplicar, editar e apagar). As regras de sugestão de modelo e as políticas de execução e fallback ficam no fim da tela.
- **A conta de cada agente: entrar e sair pelo board.** A aba Conexão diz se o agente tem login e qual conta ele usa (por exemplo, "Claude Max · pessoa@exemplo.com"), conferida sem gastar a conta: o status da CLI no Claude Code e no Cursor, ou o `initialize` e uma sessão sem pedido nos agentes pelo ACP; o agente ligado e instalado é conferido ao abrir. **Entrar no terminal** abre o login da própria ferramenta num terminal do editor e, quando ele fecha sem erro, o board confere a conta sozinho e retoma o Conectar que tinha parado por falta de login. O agente que faz o login pelo protocolo entra com **Entrar**, e o que pede chave, com **Entrar com a chave**. **Sair da conta** pede confirmação, porque vale para a máquina inteira (o terminal e o editor também saem).
- **Sessão de teste pelo ACP, com o log do protocolo.** A aba Testar conversa com o agente pelo SDK oficial do ACP, em tempo real: o texto, o raciocínio, as ferramentas, o plano e os pedidos de permissão, que você responde ali, com as opções que o agente anuncia (modelo, modo, esforço). A sessão abre só quando você pede e fecha sozinha depois de 10 minutos parada, sem deixar processo aberto. O log do protocolo mostra cada mensagem JSON-RPC das verificações, dos logins e da sessão, nos dois sentidos, com o tempo de cada pedido, e o arquivo do dia guarda tudo. O **teste rápido** pelo caminho dos cards continua na mesma aba.
- **Rastreio do board: o registro de tudo o que acontece, para investigar defeitos.** O board passa a gravar um arquivo por dia (`trace-AAAA-MM-DD.jsonl`, na pasta de dados do Faz AI, em `trace/<pasta>`; os de mais de 7 dias são apagados) com uma linha por coisa que acontece. Na tela: cada clique (o rótulo do controle e o diálogo em que está), cada mudança de campo, os atalhos de teclado, o tempo que cada ação levou até o host confirmar, as ações que estouraram o tempo, os erros de JavaScript, as rejeições sem tratamento, o `console.error` e a queda da ligação. No host: cada mensagem recebida da tela e o `done` com a duração e o erro, a mudança aplicada no banco (com `changed`, quem fez e se foi a IA), o estado e os avisos enviados à tela, cada ferramenta MCP que a IA chamou (com os argumentos, a duração e o erro), o começo, a configuração e o fim de cada execução de IA e tudo o que já ia para o canal de log. Segredos (chave de API, token, senha) nunca entram, e o texto que a pessoa escreve (descrição, comentário, arquivo) entra só com o tamanho. No editor, o comando **Faz AI: Abrir rastreio do board** abre o arquivo do dia; a variável `FAZAI_TRACE=1` repete cada linha, legível, no canal de log (ou no terminal do `faz-ai`).
- **Teste real do Gemini nos três modos (ferramenta por modo, história 14).** O repositório ganha `test/cli-real/gemini.real.ts` e o roteiro `scripts/gemini-real.mjs`: um card mínimo roda pelo board em CLI, ACP e API com o binário e a API do Google de verdade e confere que a execução termina, que a conferência não acusa desvio falso, que o inventário vem no vocabulário do modo, que os tokens são registrados e que o modo aparece no log de uso. É para quem desenvolve a extensão, fora do `npm test`, e **gasta cota da conta**: só roda com `--sim` ou `FAZAI_REAL_CONFIRM=1`, e cada modo sem o binário `gemini` ou sem `GEMINI_API_KEY` é pulado com o motivo. O registro `docs/decisoes/ferramenta-por-modo-14-teste-real-gemini.md` rotula cada ponto como verificado ou não validado (hoje, todos não validados até alguém rodar) e diz como conferir o consumo no painel do AI Studio e como capturar um 429 real.
- **Limite de uso e consumo do Gemini nos três modos (ferramenta por modo, história 12).** Quando a cota da API do Gemini esgota, na CLI, no ACP ou na API, a execução termina com o limite de uso, como no Claude Code: o card volta para a IA em vez de ficar bloqueado, e as execuções automáticas do perfil do Gemini ficam pausadas até a hora que o erro diz. A cota diária renova à meia-noite do horário do Pacífico, e o limite por minuto (429 `RESOURCE_EXHAUSTED`) traz a espera no `retryDelay`, uma pausa curta; sem nenhum dos dois, vale a espera de 5 minutos que dobra a cada falha. A conversa do card diz até quando. Uma política de execução com a falha _quota_ passa a valer para o Gemini: com ela, o Pro que esgotou segue no Flash, por exemplo. A chave recusada continua sendo login vencido, não limite. O painel **Métricas** ganha o corte **Modo da ferramenta** (CLI, ACP, API) em **Onde o consumo aconteceu**, e o `get_metrics` aceita `group_by` `mode`; o Diagnóstico do ambiente mostra o modo no título de cada perfil; e os modelos lidos da ferramenta guardam a data da leitura, que Configurações › Modelos de IA mostra ("lista lida da ferramenta em …").
- **Gemini pela CLI (ferramenta por modo, história 8).** O Gemini ganha o modo **CLI**: no cartão **CLI** do Gemini em **Conectar ferramenta**, o perfil do Gemini passa a rodar o Gemini CLI numa passada (`gemini -p`), com a mesma chave do cofre, conferida na hora pela lista de modelos da API (que entram no catálogo). Cada execução roda com uma home isolada e temporária (`GEMINI_CLI_HOME`) só com o settings do board, apagada no fim: a configuração, o `GEMINI.md`, as extensões, as skills e os hooks da sua conta não entram, a delegação fica desligada, e o settings fixa as ferramentas que a CLI registra e os servidores MCP do card, cada um só com as operações admitidas. A chave vai só no ambiente do processo, nunca nos argumentos, no settings, no log ou no registro de uso; um `.env` da pasta ou das pastas acima dela não muda o endereço da API, a credencial, os cabeçalhos nem o proxy, e os comandos de shell do modelo não recebem a chave. O consumo são os tokens por modelo do `stream-json`; o inventário, as chamadas que rodaram, e a conferência lê os nomes do Gemini (`read_file`, `run_shell_command`…) no vocabulário do card. O regime vem das sondas, contra uma API local e sem gastar a conta: o Gemini CLI 0.65.0 ainda lê o `GEMINI.md` da pasta do projeto, então o perfil roda no regime compatível, depois da sua ciência (a dada no ACP não vale para a CLI). A cota esgotada liga o limite de uso, e a chave recusada marca o login como vencido.
- **Conectar ferramenta: o Gemini em ACP com a chave no cofre (ferramenta por modo, história 7).** Configurações › Ferramentas de IA ganha **Conectar ferramenta**: a lista fixa das ferramentas que a extensão traz (o Gemini primeiro, com a nota de cobrança) e, escolhida a ferramenta, um cartão por modo oferecido, com a mesma ficha em cada um (o que o board controla, regime esperado, precisão, consumo, o que a ferramenta traz, como se entra, cobrança e quando escolher) e o selo **Recomendado** com o motivo, só quando o modo recomendado é oferecido (no Gemini, o selo fica no modo API; o Claude Code mostra a CLI e o porquê de ser a única). **Conectar** acha a ferramenta e a versão, pede a **chave de API** do Gemini num campo de senha, entrega a chave ao agente pelo login do protocolo (`authenticate`), verifica as capacidades (o regime sai das provas, sem pergunta), pede a sua ciência quando o regime é compatível (**Entendo o que a ferramenta carrega**, gravada para aquele perfil) e lê os modelos para o catálogo; no fim, **Conectada** com a versão, o login, o regime, os modelos e a data. Um erro fica no passo em que ocorreu, com **Tentar de novo**. Cada perfil do catálogo mostra o estado da conexão e **Reconectar**. A chave fica só no cofre deste computador (a mesma em todas as pastas) e nunca volta à tela, nem vai para o log, o registro das execuções ou a exportação do board; cada execução do Gemini autentica com ela. O Gemini CLI aceita a chave no login sem consultá-la: ela é conferida de fato na primeira execução, e uma chave errada aparece ali, com a mensagem do Gemini. **Trocar a chave** fica no cartão conectado: a chave nova só substitui a guardada depois de aceita (no ACP, pelo login do agente; na API, pela conferência), e aí a cifrada anterior sai do disco; uma chave recusada deixa a anterior como estava. Sem a chave no cofre, nada muda para quem já usa o Gemini com `GEMINI_API_KEY`.
- **Gemini pela API, parte 1: o board faz o ciclo com MCP (ferramenta por modo, história 10).** O Gemini ganha o modo **API**, o recomendado para ele: sem CLI nem processo da ferramenta, o board chama o `generateContent` da API do Gemini com a chave de API do cofre local e faz ele mesmo o ciclo de chamadas de função. O modelo recebe o pedido do board e, como funções, só as ferramentas do servidor do board e dos MCPs que o card libera; uma ferramenta que o card não libera nunca chega ao modelo, e a chamada a ela é recusada sem rodar. O board é cliente do próprio servidor MCP, o mesmo que atende a pasta, então a resposta do Gemini vai para a conversa do card como em qualquer ferramenta. O regime é exclusivo por construção: o board assina a prova das capacidades sozinho, sem sonda e sem gastar a conta, e a prévia de admissão do card avalia a prova do modelo escolhido no card. O consumo são os tokens de cada pedido; o inventário, as chamadas que o board executou; **Parar** cancela o pedido em curso. Editar arquivos e rodar comandos pela API estão no item seguinte (história 11). A chave vai à API só no cabeçalho, nunca na URL, no log, no registro de uso, na tela ou na exportação. Para usar, clique em **Conectar** no cartão **API** do Gemini em **Conectar ferramenta** (o do selo **Recomendado**): o perfil do Gemini passa para o modo API, com a mesma chave do cofre que o ACP usa (um perfil por ferramenta, o modo trocável); diferente do ACP, a chave é conferida na hora com a API, pela leitura dos modelos da conta, que entram no catálogo, e a tela diz que ela foi conferida. Reconectar pelo cartão **ACP** volta o perfil para o ACP.
- **Gemini pela API, parte 2: arquivos e comandos (ferramenta por modo, história 11).** O Gemini pela API passa a servir **Trabalhar na fase** com as três permissões. Sem agente da ferramenta, quem lê, grava e roda comandos no seu computador é o próprio board, e só o que o nível libera: em **Só o board**, ler arquivos, achar arquivos por padrão e buscar texto; em **Board e arquivos**, também criar, sobrescrever e editar trechos; em **Sem restrições**, também rodar um programa. As ferramentas usam os nomes do card (**Read**, **Glob**, **Grep**, **Write**, **Edit** e **Bash**): a que o agente do card nega nunca chega ao modelo, em nenhum nível, e a conferência compara o que foi usado com a lista do agente, acusando, por exemplo, um **Write** que o agente não lista. Todo caminho fica preso à pasta do projeto e à pasta de trabalho da história, pelo caminho real: `..`, caminho absoluto fora e link simbólico que sai delas são recusados, o `.git` e os arquivos do board nunca são lidos nem escritos, a configuração das ferramentas de IA do catálogo e do editor (`.claude`, `.cursor`, `.kimi-code`, `.gemini`, `.opencode`, `.codex`, `.qwen`, `.github/hooks`, `.vscode`, `.devcontainer`, `*.code-workspace` e as demais) não é escrita em pasta nenhuma, e as pastas de credenciais da sua conta ficam de fora; no macOS e no Windows os nomes valem sem diferenciar maiúsculas. Negar uma ferramenta no card vale por grupo e sem diferenciar maiúsculas (negar **Read** tira também **Glob** e **Grep**; negar **Edit** ou **Write** tira as duas de escrita), também pelos nomes do Gemini CLI; um nome negado que o board não reconhece impede a execução, com a causa. O comando roda sem shell (o programa e os argumentos separados; pipe, `&&` e `$VAR` não são interpretados), sem a chave da API nem variáveis com cara de segredo no ambiente, com tempo limite; **Parar** encerra o comando com tudo o que ele iniciou. Leitura, busca e saída têm limite de tamanho, e a busca com expressão regular tem limite de tempo. O canal de log mostra cada chamada com a ferramenta e o caminho (ou o programa), sem conteúdo nem argumentos.
- **Agente ACP como perfil pronto do catálogo (#1095).** Gemini CLI, Codex, OpenCode, GitHub Copilot CLI, Qwen Code, goose e Google Antigravity aparecem em Configurações › Ferramentas de IA como perfis prontos do tipo **Agente ACP**, desligados: ligue o que você usa, sem criar perfil personalizado. O id do perfil é o do agente (`gemini`, `codex-acp`…) e é a ferramenta do catálogo de modelos, então **Detectar modelos** e a execução por ACP funcionam nele como no personalizado. **Verificar situação** mostra se o comando do agente está no PATH e a versão, com o link **Instalar** para a página oficial; o login fica "não verificado" até o Conectar pela tela. **Duplicar** cria um personalizado com o mesmo agente. Cursor e Kimi Code seguem nas CLIs prontas de uma passada, e o Claude Code na CLI `claude`.
- **Modelos do agente ACP descobertos na conexão (#1094).** Num perfil com **Agente ACP**, Configurações › Modelos de IA ganha o botão **Detectar modelos**: o board abre uma sessão com o agente (`initialize` e `session/new`, sem pedido, então sem gastar a sua conta) e grava no catálogo os modelos que ele anuncia, com o modelo atual do agente em primeiro. O board lê as duas formas do protocolo: o seletor de modelo das opções da sessão, do esquema atual do ACP, e o bloco `models` da forma anterior, que o Gemini CLI 0.65.0 ainda usa. Pelo MCP, `detect_models` faz o mesmo. Na execução, o modelo do card vai pelo seletor da sessão (`session/set_config_option`) quando o agente o expõe, além da linha de comando onde o agente aceita; um modelo que o agente não oferece não derruba a execução, e o log diz com qual ela segue. O agente ACP de um perfil gravado volta a ser reconhecido pelo board inteiro: o id do agente, que não é segredo, passou a vir na leitura pública do perfil.
- **Regime de admissão escolhido por você (#1091).** Harness › Ferramenta e execução ganha a opção **Regime de admissão**: **Exclusivo** (o padrão) exige as cinco capacidades verificadas e a IA vê só o contexto que o board montou; **Compatível** aceita que a ferramenta carregue os próprios arquivos de contexto, o que o perfil declara em "O que a CLI carrega por conta própria", e continua exigindo permissões, MCP e delegação. Ligar o compatível é a sua revisão: o board conta uma revisão a cada vez que você liga e a mostra no aviso da opção. Até aqui o regime era fixo em exclusivo, então um perfil ACP passava na verificação mas nenhum card rodava com ele; agora roda no regime compatível. A prévia de admissão dos cards, o Diagnóstico do ambiente e as políticas de execução seguem o regime escolhido.
- **Admissão por capacidades cobre o transporte ACP (#1090).** Um perfil ACP passa a rodar pelo gateway. A admissão vincula o comando e os argumentos do agente do catálogo (mais o binário, o ambiente, a pasta e a permissão), e o gateway confere o comando contra esse vínculo antes de iniciar o agente. O comando **Faz AI: Verificar o isolamento da CLI de IA** sonda o agente ACP com dois handshakes numa pasta descartável, sem gastar a sua conta: versão do protocolo, sessão nova a cada processo e o servidor MCP do `session/new` conectado. O que o protocolo não deixa observar, os arquivos de contexto que o agente lê por conta própria, fica sem prova de propósito: o perfil ACP é admissível só no **regime compatível**, revisado por você. As permissões, a delegação e os servidores MCP seguem respondidos pelo card a cada pedido. O formulário do perfil personalizado ganha o campo **Agente ACP** (o id do catálogo); com ele, o comando é o do agente.
- **Transporte ACP como tipo de executor do perfil de CLI (#983).** O board ganha o transporte para um perfil de CLI rodar pelo Agent Client Protocol (ACP), com Gemini CLI, OpenCode, Codex, Cursor, Kimi Code, GitHub Copilot CLI, Qwen Code, goose e Google Antigravity. O registro de uso de cada execução segue o mesmo. As permissões são respondidas pelo card: um servidor MCP ou ferramenta fora da lista do card é negado. Os servidores MCP do card entram na sessão sem escrever arquivo no projeto; a exceção é o Cursor, que lê o servidor do board no próprio `.cursor/mcp.json`. Parar pede ao agente que cancele antes de encerrar o processo. Antes da primeira execução, entre na ferramenta no terminal (`gemini`, `opencode auth login`, `codex login`, `cursor-agent login`, `kimi`, `copilot`, `qwen`, `goose configure`); o board não abre o navegador. O consumo segue o que cada agente informa: tokens por turno, só o último pedido ou nada, e o que não foi informado fica desconhecido. **Handshake validado com as CLIs reais (#988):** Gemini CLI 0.65.0, OpenCode 1.19.4, Codex 2.2.2, Kimi Code 2.2.0 e Google Antigravity 1.4.1 abrem a sessão e respondem um pedido curto pelo transporte do board; o card inteiro pelo board, Parar e a conferência do consumo seguem pendentes. Duas correções vieram do teste: o `initialize` informa a versão do cliente (Gemini e OpenCode recusavam sem ela) e o Gemini roda com `--skip-trust`, porque sem a pasta confiável ele não responde ao pedido. **Ainda não roda na extensão:** o perfil ACP é personalizado, e a admissão por capacidades o recusa até vincular o comando do agente (hoje ela vincula o da CLI de uma passada); o transporte fica pronto atrás do gateway. Claude Code segue pela CLI `claude`.
- **Conferência da execução: o que a IA usou contra o que o card pediu (#972).** Ao terminar cada execução, o board compara o que a sessão usou (servidores MCP, subagentes, skills e ferramentas nativas, quando a CLI informa) com o que o card liberou: agente, skills, servidores MCP e ferramentas. Cada execução fica em um de três estados: **sem desvio** (usou só o liberado), **com desvio** (a lista do que saiu do liberado, com o número de chamadas) ou **não conferida** (a CLI não informou o que usou, ou a execução não foi medida; nunca vira "sem desvio"). O servidor do próprio board e as skills do fluxo (`faz-ai-*`) não contam como desvio. A conferência só informa: não bloqueia a execução, e uma falha nela não a derruba. O desvio aparece em três lugares: um comentário na conversa do card, só quando há desvio; a linha "Conferência" do log da execução; e o painel **Métricas**, que mostra por ferramenta de IA as colunas **conferidas**, **com desvio** e **não conferidas** (o `get_metrics` com `group_by` `tool` traz as mesmas contagens). Execuções anteriores a esta versão aparecem como não conferidas.
- **Cursor: o board garante pelo hook o que o card permite (#965).** Ao abrir uma pasta do board no Cursor, a extensão registra um hook global em `~/.cursor/hooks.json`, sem mexer nos seus hooks. Durante cada execução do board, o Cursor nega o que o card não permite: servidores MCP, subagentes e ferramentas fora da lista do card (e as ferramentas negadas por ele). O texto do agente e as skills seguem como orientação para a IA, porque o hook não cobre toda leitura de skill. Fora das execuções do board, o hook libera tudo e o Cursor segue como antes. Sem o hook instalado e atualizado, a execução roda sem essa garantia e o log registra o motivo. Para remover, apague do `~/.cursor/hooks.json` as entradas cujo comando termina em `cursor-hook.js`; a extensão as registra de novo na próxima vez que abrir uma pasta do board no Cursor.

- **Sombra no card selecionado (#1069).** O card selecionado ganha uma sombra que sai do canto superior esquerdo e o destaca dos demais, sem tirar o contorno de foco do teclado. Os cards marcados na seleção múltipla recebem o mesmo destaque, e as linhas selecionadas das listas (como as do Harness) recebem uma sombra mais discreta. Um card pendente selecionado mantém o anel da cor do status, e a sombra vai por cima dele.

### Alterado

- **Board multiagente: qualquer modelo de qualquer agente ligado, ao mesmo tempo (#387).** Todo agente ligado em Conectar agentes roda cards, junto com os outros: cada card vai para o agente do modelo dele (o do card, o do agente do harness ou o da regra), e dois cards em agentes diferentes rodam lado a lado, sem trocar nada. O agente em uso passa a se chamar **agente padrão**, e só roda os cards sem modelo; o cartão do topo diz quais outros agentes também rodam cards, e **Usar nos cards** vira **Tornar padrão**. O motivo de um agente não rodar pelo board (o personalizado de CLI, a permissão que a ferramenta não aceita) passa a ser dele: o **Trabalhar na fase** desliga só nos cards desse agente, o heartbeat e o autopiloto pulam só esses cards, e o board só para quando nenhum agente ligado roda. Pelo MCP, o `get_models` diz em `runsWith` o agente ligado que executa cada modelo do catálogo e em `ready` se cada perfil roda agora, e o modelo livre vale em qualquer perfil personalizado ligado, não só no padrão. A aba Contexto do card e o chat mostram o que o board impõe no agente que executa, não no padrão. O Diagnóstico conta os agentes dos cards na fila entre os que seguram a próxima execução.
- **Perfil personalizado vira caminho avançado (ferramenta por modo, história 13).** Em Configurações › Ferramentas de IA, o botão **Novo perfil** saiu do topo da tela: o formulário do personalizado fica em **Avançado**, abaixo da lista de perfis (**Novo perfil de CLI personalizado**), para uma linha de comando que o catálogo não traz; as ferramentas do catálogo entram pelo **Conectar ferramenta**. O personalizado novo é só de CLI. Os personalizados ACP de versões anteriores continuam rodando como estão, com um aviso na lista e no formulário e o botão **Abrir o Conectar** no agente deles. A cópia do Claude Code e o personalizado ACP, que não passam pelo Conectar, ganham **Verificar capacidades** na lista; o aviso de prova vencida leva ao **Reconectar** do perfil do catálogo ou a esse botão, e o Diagnóstico diz onde verificar.
- **Regime de admissão por perfil; a opção saiu de Harness › Ferramenta e execução (ferramenta por modo, história 7).** O regime passa a ser consequência do que cada perfil prova no **Conectar**: o perfil com as cinco capacidades provadas roda no exclusivo; o que prova permissões, MCP e delegação roda no compatível depois da sua ciência para ele. Assim o Gemini pode rodar no compatível enquanto o Claude Code segue no exclusivo. A prévia de admissão dos cards e o Diagnóstico usam o regime do perfil. Quem ligou o compatível para o board inteiro numa versão anterior continua com ele, e Harness › Ferramenta e execução mostra o aviso com **Voltar ao exclusivo**. A ciência pode sair: **Revogar ciência** (no cartão conectado e na lista dos perfis) a tira, reconectar um perfil que passa a provar o exclusivo a tira sozinho, e **importar um board não traz a ciência dos perfis** (quem importa dá a própria). Cópias e perfis personalizados, que não passam pelo Conectar, dão a ciência na lista, com **Dar ciência do regime compatível**. Uma política de execução não troca mais o perfil por outro com regime diferente. A verificação automática de um agente ACP passa a usar a chave do cofre, e o aviso de login do Gemini abre o Conectar já no Gemini.
- **Perfil = ferramenta × modo, banco no formato 48 (ferramenta por modo, história 4).** Cada perfil de IA passa a guardar a ferramenta e o modo em que o board fala com ela (CLI ou ACP), e cada execução do log guarda o modo em que rodou. Em Configurações › Ferramentas de IA, o selo de cada perfil mostra os dois: "Claude Code · CLI", "Gemini · ACP", "Cópia de Claude Code · CLI", "Personalizado · ACP". Os perfis gravados antes são convertidos sozinhos na primeira leitura do board, sem mudar a ferramenta usada nos campos de modelo, nas políticas e no Consumo; os ajustes das cópias seguem no cofre local, como estavam. As execuções anteriores ficam sem modo registrado. Um arquivo exportado por uma versão anterior importa normalmente, e os perfis saem com ferramenta e modo. Pelo MCP, `get_models` traz `tool` e `mode` de cada perfil, e o `kind` passa a `catalog` (o perfil que vem da extensão, pronto ou cópia) ou `custom`.
- **Verificação de capacidades por perfil (ferramenta por modo, história 2).** O comando **Faz AI: Verificar o isolamento da CLI de IA** pergunta qual perfil verificar, entre os ligados que têm verificação (o Claude Code, as cópias dele e os agentes ACP), com o padrão do board primeiro; antes ele só verificava o perfil padrão, e com o Claude Code recusava o perfil. Num agente ACP, a verificação também roda sozinha quando você o liga e ao conectar a ferramenta dele ao board, a menos que a prova atual ainda valha, com o resultado em Saída › Faz AI; o Claude Code segue verificado pelo comando. Cada perfil guarda a própria prova: o Diagnóstico do ambiente mostra as capacidades lidas dos recibos daquele perfil e, enquanto um perfil verificável não tem recibos, diz como verificá-lo pela paleta. A prévia de admissão do card avalia o perfil que vai executar o card (o do modelo do card, do agente ou da regra), não o padrão do board.
- **Vínculo de isolamento saneado: a prova vale para todas as permissões e sobrevive ao reinício do editor (ferramenta por modo, história 3).** A verificação de capacidades, feita em **Só o board**, passa a valer também para **Board e arquivos** e **Sem restrições**: a permissão saiu do vínculo da prova, porque no modo estrito o comando do Claude Code é o mesmo nos três níveis e no ACP ela não entra no comando. Num agente ACP em **Sem restrições**, o board não pede mais o modo sem perguntas do agente (o `yolo` do Gemini, o `agent-full-access` do Codex): nele o agente deixava de pedir permissão, e as negações do card (delegação, ferramentas negadas, servidores MCP fora do card) não valiam; agora o board responde cada pedido nos três níveis, e o modo da sessão faz parte do vínculo. O vínculo também deixou de levar o ambiente inteiro do editor, que mudava a cada reinício (terminal, sessão, sockets, as variáveis da sessão do Claude Code que abriu o editor) e derrubava a prova: entram só o PATH, as pastas da pessoa, o proxy e os certificados, a carga de bibliotecas nativas, as variáveis do provedor que o verificador observa e as do perfil; das que guardam credencial entra só a presença, nunca o valor, e o recibo continua guardando só o hash do vínculo. Com o formato novo, **toda prova gravada antes perde a validade**: num agente ACP o board refaz sozinho, sem gastar a sua conta; no Claude Code, rode **Faz AI: Verificar o isolamento da CLI de IA** de novo. Daqui em diante, quando o vínculo de um perfil verificado muda (a ferramenta foi atualizada, uma dessas variáveis mudou), o aviso do topo diz "a verificação de capacidades perdeu a validade" e como refazer, sem bloquear o board; no agente ACP, o board já refaz sozinho.
- **Refinar não guarda mais o texto anterior da descrição (#1076).** O **Refinar com IA** deixou de gravar o anexo `descricao-anterior-*.md` antes de reescrever a descrição, e a instrução que pedia isso saiu do prompt. O texto anterior não fica guardado em lugar nenhum; o comentário do refino resume o que mudou e por quê. Anexos antigos com esse nome continuam na história, sem uso.
- **A IA recebe no máximo as últimas 20 mensagens da conversa (#1076).** Sem resumo, o `get_card` manda só as 20 últimas mensagens e diz em `omittedBefore` quantas ficaram de fora. Com resumo, ele sempre vem; passando de 20 mensagens, vêm as 19 últimas depois dele. A aba **Conversa** segue mostrando tudo. Mensagens repetidas e avisos do board continuam como estavam.

### Removido

- **Telas Ferramentas de IA e Modelos de IA.** O conteúdo delas foi para Conectar agentes: o Conectar, os perfis de CLI, o perfil personalizado (pelo botão **Agente personalizado (CLI)**), as capacidades e a ciência ficam no agente; o catálogo de modelos, na aba Modelos dele; as regras de sugestão e as políticas de execução, no fim da tela. Um link antigo para essas abas abre Conectar agentes.
- **Comando "Faz AI: Verificar o isolamento da CLI de IA" (ferramenta por modo, história 13).** A verificação de capacidades não tem mais comando à parte: ela roda no **Conectar** e no **Reconectar** (o Claude Code e o Gemini pela CLI inclusive), sozinha quando você liga um agente ACP e por **Verificar capacidades** em Ferramentas de IA, nos perfis que não passam pelo Conectar. Nenhuma das sondas gasta a sua conta.
- **Campo Agente ACP no perfil personalizado novo (ferramenta por modo, história 13).** Um agente ACP entra pelo **Conectar ferramenta**, e o board recusa transformar uma CLI personalizada em agente ACP. O Cursor e o Kimi Code pelo ACP, que só existiam por esse campo, seguem nos personalizados já criados até o teste real deles.

### Corrigido

- **Configurações › Ferramentas de IA: os defeitos achados no teste de ponta a ponta com o rastreio do board.**
  - **Perfil de CLI personalizado:**
    - Com o perfil personalizado de CLI como padrão, **Trabalhar na fase** ficava desligado com um motivo errado ("O perfil não declara argumentos para esta permissão restrita.", mesmo com os argumentos preenchidos). O motivo real é que esse perfil não passa na admissão por capacidades: o board não consegue provar o que um comando qualquer acessa. Agora o botão fica desligado com esse motivo e a indicação de usar uma ferramenta do catálogo pelo Conectar. O personalizado ACP antigo segue rodando.
    - Editar os argumentos de um nível de permissão apagava os dos outros níveis, ao contrário do "deixe vazio para manter". Agora cada nível é gravado sozinho, e um nível enviado vazio é esvaziado de propósito.
  - **Gemini pelo ACP com a chave recusada:** a chave errada passava pelo Conectar (o Gemini não a confere no login), e na execução o card ia para **Bloqueado** com o JSON cru da API. Agora o board reconhece a recusa da API (`API_KEY_INVALID`) também no ACP e trata como login vencido, como já fazia na CLI.
  - **Situação dos perfis:**
    - Um perfil desligado ou pendente aparecia como **Não encontrada**, mesmo com a ferramenta instalada. Agora aparece **Desligada: ligue para verificar** ou **Pendente de revisão: salve o perfil para verificar**.
    - Ligar, desligar e conectar um perfil passam a refazer a situação na hora. Antes, a linha podia mostrar "Conectada" ao lado do "Não encontrada" de antes.
  - **Conferência dos requisitos:** com o perfil padrão sem login, ela roda a cada 10 s, e cada rodada remontava e reenviava o board inteiro às telas abertas. Agora só uma mudança na lista avisa as telas.
  - **Ciência revogada:** os passos do Conectar diziam "Ciência do regime: feito" ao lado do "sem ciência". Agora o passo volta a **espera você**, com o botão **Entendo o que a ferramenta carrega**, sem precisar reconectar.
  - **Testar e execução bloqueados pela admissão:** em vez dos códigos internos ("capability-not-verified/conversation…"), a mensagem diz quais capacidades faltam verificar e onde resolver.
- **Layout de Configurações › Ferramentas de IA e da barra do topo.** Em **Conectar ferramenta**, o texto de cobrança de cada ferramenta da lista vazava da borda do botão e invadia os cartões dos modos; agora ele quebra linha dentro do botão, e o lado dos cartões abre com o nome da ferramenta, a cobrança e a página oficial. A cobrança das ferramentas sem nota própria passa a dizer "Cobrança da conta da própria ferramenta". Num painel estreito do editor, a barra do topo empurrava o nome do board e os ícones para fora da tela, com rolagem lateral em todas as telas; agora as ações descem para uma segunda linha.
- **Políticas de execução com perfis que não são as três CLIs prontas (ferramenta por modo, história 12).** As políticas e o simulador conheciam só o Claude Code, o Cursor e o Kimi Code: uma política com o perfil do Gemini, de um agente ACP ou de um personalizado era recusada com "Destino inválido", e o simulador não oferecia esses perfis. Agora eles são os perfis do board, com o modo no nome ("Gemini · API").
- **Ferramentas negadas pelo card valem no ACP (ferramenta por modo).** Numa execução por um perfil ACP (o Gemini, por exemplo), um `Bash` negado no agente do card não era imposto: o agente pedia permissão para rodar um comando e o board liberava pelo nível. Agora cada pedido de permissão é lido no vocabulário do card (o tipo da chamada no protocolo, ou o nome interno da ferramenta do Gemini CLI quando ele vem no pedido) e recusado quando alguma ferramenta equivalente está negada, a mesma regra da conferência. A lista de ferramentas do card continua conferida, como no modo API: o uso fora dela é liberado pelo nível e vira aviso na conversa do card. `delete` e `move` contam como `Bash`, e uma ferramenta MCP negada pelo nome (`mcp__servidor__ferramenta` ou `mcp__servidor__*`) também é recusada. Um pedido cujo título cita um servidor MCP do card (no Gemini o título do shell é o próprio comando) não passa mais por MCP: no Gemini a ferramenta MCP é reconhecida pelo id do pedido, e nos outros agentes só um pedido sem tipo definido que começa pelo nome do servidor, e o pedido sem tipo reconhecível é recusado quando o card nega ferramentas. Uma negada que o board não sabe traduzir (`Bash(rm:*)`, `bash`) bloqueia a execução em vez de ser ignorada. Não depende do modo sem perguntas: a execução admitida nunca roda nele.
- **Com o Gemini (ou outro perfil ACP) como padrão do board, o agente mantém as ferramentas do card (ferramenta por modo, história 1).** O agente criado para o Claude era tratado como de outra ferramenta e traduzido por uma tabela que não tem entrada para perfis ACP ou personalizados; resultado: lista de ferramentas vazia, e a conferência e a permissão do ACP nunca acusavam desvio de ferramenta. Agora só Claude, Cursor e Kimi traduzem; os demais perfis mantêm as ferramentas do card no vocabulário do card.
- **O log não troca mais "gemini" por "[credencial local]" (ferramenta por modo, história 1).** A linha "Chamando Gemini CLI (ACP)" saía com o nome do agente e o comando mascarados, porque a configuração do perfil inteira entrava na lista de segredos. Agora campos que não são segredo (agente ACP, comando, formato do prompt, servidor do board) ficam de fora; chaves, tokens, argumentos e variáveis de ambiente (e os padrões de autenticação) continuam mascarados.
- **Conferência da execução ACP compara no vocabulário do card (ferramenta por modo, história 1).** Uma execução com perfil ACP (Gemini, por exemplo) terminava com "Conferência: a execução usou algo fora do que o card liberou (ferramenta think; ferramenta other)", mesmo dentro do permitido: o inventário ACP traz o tipo da chamada no protocolo (`read`, `execute`, `think`…) e a conferência o comparava com `Read`, `Bash`… do card. Agora cada tipo vira as ferramentas equivalentes do card: `think`, `switch_mode` e `other` nunca são desvio (a permissão já é decidida a cada chamada), e os demais só são desvio se nenhum equivalente está em `tools` ou algum está em `deniedTools`. A conferência do Claude e do Cursor não muda.
- **Agente do card volta a rodar com perfil ACP ou personalizado (ferramenta por modo, história 1).** Refinar e Trabalhar na fase falhavam com "Agente obrigatório precisa de definição do board; descoberta nativa não é permitida" quando o perfil ACP ou personalizado não trazia a definição do agente, mesmo com o agente escolhido no card. Agora o agente segue no prompt, pela orientação do perfil, e o board não pede a descoberta nativa dele: no ACP, que não tem descoberta nativa, a execução segue sem o nome do agente. O card, o resumo e o log seguem mostrando o agente escolhido.
- **Perfil personalizado e ACP aparecem no campo Modelo do card (#1093).** O grupo de um perfil personalizado sumia do campo **Modelo** enquanto ele não tinha modelo cadastrado, e **Outro modelo…** só existia para o perfil padrão: um agente ACP ligado como segundo perfil não tinha como receber um modelo. Agora todo perfil personalizado ligado forma um grupo, com os modelos cadastrados e o seu próprio **Outro modelo…**, que grava `<perfil>:<modelo>` (o Gemini CLI em ACP recebe o modelo por `--model`). O nome de cada grupo virou um cabeçalho com linha, para separar à vista os catálogos do Claude Code, do Cursor e dos demais perfis.
- **Um perfil personalizado (ou ACP) volta a rodar cards e o chat no runtime padrão (#1091).** O gateway exige a admissão por capacidades de todo perfil que não é pronto, mas o runtime padrão só montava o pedido no runtime v1: o card era recusado com "Perfis configuráveis exigem contrato e admissão por capacidades". Agora o runner e o chat montam o pedido no runtime padrão (regime do board, categorias do nível de permissão e os servidores MCP do plano). No ACP, o servidor do board, por onde o card responde cada pedido de permissão, fica na sessão admitida mesmo sem ferramenta nativa liberada.
- **Execução pela conversa e heartbeat volta a aparecer com um perfil personalizado como padrão (#1091).** Com um perfil personalizado (ou ACP) escolhido como ferramenta do projeto, Harness › Ferramenta e execução escondia toda a seção com o aviso "Perfil de CLI ainda não disponível para execução": o board conferia o id do perfil em vez do perfil resolvido. Agora a seção aparece, com o regime de admissão, o agente padrão e o heartbeat. Num perfil ACP a permissão é respondida pelo board a cada pedido do agente, então ele não precisa declarar argumentos por nível.

## 0.47.0

### Adicionado

- **Configuração do contexto mínimo congelada e verificada antes de cada execução (#998, #999, #1045, #1001).** A configuração resolvida da atividade (agente, skills e MCPs) vai no `AiPrepared`, é validada no gateway antes de abrir o processo (recurso obrigatório ausente ou desativado impede a execução e mostra o motivo) e fica no manifesto do snapshot da execução, de modo que editar a biblioteca depois não muda uma execução em andamento. O gateway recusa MCP fora da configuração da atividade. O host lê as políticas gerenciadas do Claude Code (`environmentEvidence`) e o novo comando **Faz AI: Verificar o isolamento da CLI de IA** grava os recibos de isolamento da CLI do Claude, válidos por 14 dias. Isso só vale no runtime v1 (opcional, abaixo): sem ele, a execução continua legada.
- **Proposta de plano pela IA (#996, #1002).** No **Plano de execução**, cada ação com agente válido ganha **Propor com IA**: a IA lê a tarefa e o catálogo resumido e sugere só skills adicionais e MCPs ativos, dentro do que o contrato do agente permite, com a justificativa de cada item. O host valida a resposta (id fora do catálogo, repetido, sem motivo ou em formato errado é recusado) e nada é gravado: a proposta vira rascunho só quando você clica em **Usar como rascunho** e passa pela comparação de sempre. Mudar o card, o agente ou o catálogo marca a proposta como desatualizada. A IA não troca agente, permissões nem prioridades.
- **Runtime v1 do contexto mínimo nas portas de IA, opcional (#1000).** O gateway aceita o runtime `v1`, ligado com `FAZ_AI_CONTEXT_RUNTIME=v1`: nele, runner (fase, refinar, resumo e conflito), chat, assistentes do Harness e teste do perfil só executam com a configuração resolvida e a admissão por capacidades; sem agente com contrato válido ou sem recibos do verificador, o processo não abre. O legado segue como padrão.
- **Trilha curta para histórias pequenas (#602).** Regra nova em Configurações → Regras, desligada por padrão. Ligada, uma história de esforço **Baixo** ou do tipo **Bug** que é aprovada no Discovery (ou levada adiante pelo autopiloto) vai direto ao Plan, sem passar pelo PRD nem pela Spec; o Plan parte do DISCOVERY. Arrastar a história, ou a IA movê-la com `move_card`, para o PRD ou a Spec continua valendo e força a trilha completa; no Discovery, a IA sobe o esforço quando descobre que a história é maior do que parecia. As colunas de PRD e Spec são reconhecidas pelo documento que produzem (PRD.md e SPEC.md), então renomear a coluna não desliga a regra. Os textos de fase de Discovery e Plan do board padrão explicam a trilha curta; a atualização do board troca só o texto padrão, e o texto personalizado não muda.
- **Alerta de execução longa (#603).** Quando uma execução de IA passa de **10 milhões de tokens de leitura de cache**, o runner registra um aviso na conversa do card, ao fim da execução, com o consumo e a duração em minutos. No **Painel de métricas**, o total **Execuções de IA** mostra a linha "{n} acima do limite de consumo". O limite é fixo, não há configuração, e **só alerta**: nada interrompe a execução. Sem medida de tokens (Cursor) não há aviso nem contagem; meses arquivados, que não guardam o detalhe por execução, não entram na contagem.
- **Exportar para a ferramenta (#623, #901, #902).** Em **Configurações → Harness**, ao lado de **Importar**, o botão **Exportar para a ferramenta** copia regras, skills e agentes do board para a pasta de **Claude Code**, **Cursor** ou **Kimi Code**, no formato de cada uma (projeto ou usuário). O diálogo tem três passos: ferramenta e destino, prévia (agrupada em Regras, Skills e Agentes, com busca, caixas, situação "novo", "já existe · será pulado" ou "recusado", o que o formato perde ou mapeia e os arquivos extras que ficam) e resumo por situação. Por padrão marca o que está em "Sempre" ou "Pelo card"; a skill do fluxo vem desmarcada, com aviso; **Substituir os que já existem** regrava o que já está no destino. O resultado é uma cópia desconectada: o board não a atualiza nem apaga, e os servidores MCP não são exportados. Não há ferramenta MCP nem comando da CLI para exportar.
- **Precisão medida também no modo autônomo (#605).** O bloco Retrabalho do painel de métricas e o `get_metrics` com `rework: true` passam a mostrar sinais do lado da IA, que a revisão de uma pessoa não cobre: correções na Revisão (commits em execuções dessa fase), `npm test` com falha, commits depois de aberto o pull request e bugs vinculados depois da conclusão, cada um com a parte feita em modo autônomo, no total e por fase. Quando o período não tem execução com registro de comandos de Bash, o sinal aparece como "não medido", não como zero. Os sinais valem só para o Claude Code, desde o registro de comandos de Bash; as falhas de `npm test` só a partir desta versão (o banco do board sobe para a versão 45).
- **Diagnóstico com capacidades, Testar, próxima execução e limites (#880).** Cada bloco de perfil mostra uma linha por capacidade (Verificada, Parcial ou Desconhecida: só a verificada leva o selo de pronto), a admissão ("Admissível no regime ..." ou "Não admissível", com um motivo por exigência) e, no regime compatível, o que a CLI pode carregar por conta própria. O botão **Testar** do bloco é o mesmo da tela Ferramentas de IA: avisa que usa a assinatura, mostra "Testando…", mostra a falha numa caixa de aviso e confere o ambiente de novo ao fim, então o aviso do topo reflete o resultado sem recarregar. A nova seção **Próxima execução e limites** mostra o regime, o alvo padrão (regra e versão, ou o bloqueio), os cards cujo alvo está indisponível e a tabela de limites (pedido, efetivo e motivo), tudo vindo do simulador de políticas e de `effectiveLimits`; sem eles na base, mostra "Indisponível nesta versão". Novo teste garante que os textos lidos pela IA não citam o Diagnóstico como requisito.
- **Perguntas com opções para a IA (#895).** A IA passa a fazer perguntas com alternativas pela ferramenta `ask_questions`: cada pergunta traz opções curtas e a indicada, e o detalhe (motivo da indicada, consequências) vai na descrição do card. Enquanto as perguntas esperam, o card fica em "Aguardando resposta". As respostas entram na seção "Perguntas e respostas" da descrição, e a pergunta com o mesmo texto de uma já respondida substitui a resposta dela. No modo autônomo, o board responde cada pergunta com a indicada, registra na seção e o card segue com a IA. O `get_card` mostra as perguntas pendentes.
- **Carrossel de perguntas no card (#955).** Quando a IA faz perguntas com opções, o card aberto mostra, abaixo da descrição, uma pergunta por vez, com o contador "{n} de {total}" e a opção indicada marcada com o selo "Indicada". Clicar numa opção grava a resposta e avança para a próxima; dá para escrever uma resposta própria e voltar com "Anterior" ou seguir com "Próxima". A última tela é o resumo, que mostra as perguntas não respondidas, e "Enviar respostas" grava tudo na seção "Perguntas e respostas" da descrição e devolve a vez para a IA.
- **Assistente de IA para políticas de execução (#734).** No editor de políticas, **Criar com ajuda de IA**, **Sugerir fallbacks** e **Revisar conflitos** pedem à IA uma proposta a partir do seu objetivo. A IA recebe só o catálogo, os perfis e as políticas, sem segredos, e a resposta passa pelo mesmo validador do editor: a proposta mostra a explicação, as diferenças em relação ao rascunho e exemplos na simulação local. Propostas inválidas, com perfil ou modelo fora do catálogo, ambíguas ou que reduziriam o isolamento são recusadas. Nada é salvo nem ligado até você revisar e confirmar; sem IA disponível, o editor manual continua igual.
- **O que cada CLI carrega por conta própria, com honestidade (#619).** Cada perfil de CLI declara os argumentos de isolamento e o que a ferramenta ainda lê sozinha (regras, skills, agentes, hooks e servidores MCP, do projeto ou do usuário), com a data e a versão da documentação conferida. Lista vazia significa "nenhum item conhecido", nunca prova de contexto vazio: só capacidades verificadas pelo host mostram "Contexto vazio (imposto)". O resumo da execução, `ai_runs.clean` (só para execuções novas; o histórico não é reinterpretado), o `execution.cliLoads` do `get_card` e do `get_harness`, o selo da lista de perfis e a linha "Fora da conta" do card usam a mesma decisão. O formulário de cópia e de perfil personalizado permite declarar o que a CLI carrega. A execução real com Claude Code passou em `npm run test:cli-real` (ambiente local controlado, sem políticas gerenciadas); Cursor não estava instalado e Kimi Code ainda não tem roteiro real: ambos seguem **não validados**.
- **Duplicar card pelo menu de 3 pontinhos (#723).** No menu de ações do card aberto, **Duplicar card** cria um card novo a partir dele. O título ganha o prefixo "Cópia de"; a descrição, o tipo, os campos e o checklist (desmarcado) são copiados, e o card novo vai para o fim da primeira coluna do workflow, sem confirmação. Sub-tarefas, anexos, comentários e vínculos não são copiados. A opção vale para um card por vez: na seleção de vários cards não há duplicação em massa.
- **Aba Arquivados com busca, filtros, paginação e sub-tarefas da história (#724).** A aba ganha uma barra de filtros própria, que não muda o filtro do board: busca por texto (título, descrição, conversa, campos e `#número`), tipo, campos de opção (como Tags) e período de arquivamento. Um contador mostra quantos filtros estão ativos, e "Limpar filtros" os desfaz. Ao sair e voltar, a aba abre limpa. Cada linha de workflow mostra 50 cards por vez, com "Mostrar mais" e "Mostrando X de Y"; mudar o filtro volta ao começo. Clicar numa história arquivada a seleciona, e a linha de Sub-tarefas passa a mostrar só as sub-tarefas arquivadas dela, mesmo as que não batem no filtro, com o aviso "Sub-tarefas de #N" e "Limpar seleção"; clicar de novo desfaz a seleção. Abrir o card continua listando todas as sub-tarefas.
- **Seleção múltipla e ações em massa na lixeira (#721).** A lixeira ganha caixas de marcação em cada card e **Selecionar todos** no cabeçalho da tabela. Com cards marcados, a barra oferece **Restaurar** e **Apagar de vez** para a seleção inteira: restaurar segue direto, e apagar de vez pede uma única confirmação para o lote. **Esvaziar lixeira** continua como estava.
- **Seleção de vários cards na aba Arquivados (#775).** Histórias e sub-tarefas arquivadas podem ser marcadas várias de uma vez, com **Selecionar todos os visíveis** (só os que os filtros mostram) e uma barra de ações. **Restaurar** e **Enviar para a lixeira** valem para toda a seleção, com as mesmas regras do individual: restaurar uma história traz as sub-tarefas arquivadas dela, e restaurar uma sub-tarefa cuja história está arquivada traz a história inteira; enviar uma história para a lixeira leva junto as sub-tarefas arquivadas dela. Toda ação em massa pede confirmação, dizendo quantos cards serão afetados e o que vai junto. Excluir definitivamente continua só pela Lixeira.
- **Instruções do Kimi Code na pasta do projeto (#623).** O inventário do Harness e o "Importar" passam a ler também o `.kimi-code/AGENTS.md` do projeto, além do `AGENTS.md` da raiz e do `~/.kimi-code/AGENTS.md`.
- **Adaptadores de execução por perfil.** Cópias preservam leitor/formato da base e usam comando, ambiente e argumentos próprios. O adaptador genérico monta prompt e MCP, usa comando exato sem shell e mantém consumo desconhecido. Gateway resolve o cofre no host, congela o perfil e exige contrato/admissão para configuráveis; cópias não herdam recibos e mudanças de configuração invalidam a prova. Genérico sem tradução verificada continua bloqueado. Schema 43 acrescenta origem `test`, preservando execuções, inventário e comandos Bash. A ativação nos preparadores e a verificação de produção continuam pendentes.
- **Resolução e sondas por perfil de CLI.** Personalizados procuram o comando exato apenas no PATH ou no caminho absoluto; não usam aliases, instalações usuais ou binários de extensões. Sondas revisadas usam argumentos separados e nenhum shell, retornando versão/login sem saída bruta. Perfis pendentes, desativados ou sem credencial local não executam consultas. Requisitos usam o rótulo público do perfil e não cobram registro MCP nativo de personalizados/cópias. O cache de login distingue perfil, executável e referência de credenciais. Isso não comprova capacidades nem habilita execução.
- **Domínio e persistência de perfis de CLI.** Schema 42 adiciona perfis prontos, cópias e personalizados sem alterar padrões/modelos existentes. Comandos, argumentos, ambiente e extensões ficam no cofre local; estado e exportação carregam referências. Perfis importados entram desativados/pendentes, com aviso e revisão humana. Cópias ganham referência própria e não herdam revisão ou capacidades comprovadas. A integração dos perfis com execução e telas continua pendente.
- **Base versionada das políticas de execução e fallback.** Schema 41 guarda políticas, revisões e histórico no board; snapshots anteriores permanecem fixos. Importação mantém as definições e versões, com execução pendente de revisão humana local. A resolução diferencia vazio de escolha explícita inválida e preserva a identidade do perfil-cópia. Um avaliador puro compartilhado com a simulação retorna regra/versão, recusas e sequência, aplicando tentativas/prazo/backoff, tetos, destinos visitados, credenciais/admissão e escopo obrigatório. Trabalho parcial/desconhecido exige reconciliação; consumo ausente permanece desconhecido. O editor manual em Configurações → Harness permite comparar/revisar, duplicar, remover e recuperar versões com controle de conflitos. Simulação no host sem IA, com cenário hipotético e invalidação após mudanças. A integração com runner/chat/assistentes e a migração do modelo reserva ainda faltam; o runtime continua legado.
- **CLI real pelo caminho de execução do board.** A suíte separada agora usa AiGateway, transporte medido, spawnHeadless e SQLite descartável em disco. Sete testes cobrem também cancelamento, encerramento forçado e falha antes da liberação da CLI. Conferem o log reaberto do disco, uma única tentativa, consumo desconhecido após interrupção e limpeza dos arquivos MCP privados. Essa evidência não habilita admissão de produção.
- **Verificação do contrato com Claude Code real.** `npm run test:cli-real`, separado da suíte comum, usa a CLI instalada com API e MCPs locais controlados, sentinelas e controles positivos. Confere fontes externas, ferramentas permitidas/proibidas, operações MCP, delegação, vazio explícito e conversa nova. O teste revelou e corrigiu o carregamento de memória de pastas adicionais por variável herdada no contrato estrito. A evidência é limitada ao ambiente de teste: não verifica políticas gerenciadas, Cursor/Kimi, consumo real nem habilita admissão de produção.
- **Orquestrador persistido com processos controlados.** O `Orchestrator` já oferece `drive`, continuação de rodadas, reconciliação na abertura, varredura e cancelamento, com um `UnitStarter` injetado. Ele sincroniza a preparação e a identidade antes de liberar a CLI, confirma o grupo de processos e grava o resultado antes de liberar a trava. A referência à pasta permanece persistida até a liberação física ser confirmada, inclusive após queda nesse intervalo; a importação também respeita essa reserva. Testes com processos Node, ponte MCP e banco em disco cobrem três filhas em sequência, fechamento único, trabalho parcial, cancelamento com descendente e reinício real do controlador. A criação no host e a ligação aos gatilhos continuam pendentes, assim como os ciclos de devolução humana e a associação estável da Fase. Isso ainda não ativa o plano v1 nem valida CLIs reais de IA.
- **Liberação assíncrona do launcher.** O gateway também aceita um registro assíncrono de identidade (`beforeStart`): o launcher aguarda sua conclusão antes de receber o comando. Falha, cancelamento ou revogação durante a espera impedem liberação tardia. O transporte medido preserva a identidade e a confirmação de término para a reconciliação. O Orchestrator descrito abaixo já liga esse ponto ao flush e à posse da pasta por um UnitStarter injetado; os gatilhos de produção continuam pendentes.
- **Identidade MCP por execução controlada.** Execuções controladas agora têm identidade MCP por tentativa: o host injeta `FAZAI_RUN_TOKEN` apenas no ambiente da ponte, que envia um prefácio consumido pelo transporte antes do protocolo MCP. Cada chamada valida dono, geração e revogação; mutações recebem o run autenticado e são contadas. `get_skill`, `get_agent`, `get_board_artifact` e `read_rule_file` usam o snapshot capturado, e o encaminhamento externo fixa os servidores selecionados e suas operações. Sessões externas continuam disponíveis, mas não assumem um card reservado pelo board. O runner aceita identidade e orientação do orquestrador, sem concluir a unidade apenas por código zero. Essa API ainda não está ligada aos gatilhos: a ativação automática, a persistência anterior à liberação da CLI e #824/#825 continuam pendentes.
- **Fundação persistida para a orquestração.** Schema 39 separa unidades e tentativas locais, com posse, gerações, hash do token, revogação e contagem de mutações. Não entra no export e bloqueia importação sobre trabalho vivo. Flush confirma os bytes antes da publicação. A trava por pasta real conserva a reserva após queda até reconciliar o grupo de processos. Regras puras distinguem conclusão, repetição segura, revisão e encerramento não confirmado, preservando consumo desconhecido. Os gatilhos e a execução de sub-tarefas pelo board continuam pendentes.
- **Arquivos da biblioteca fixados por execução.** O host publica uma cópia atômica dos artefatos selecionados do runner/chat, com revisões monotônicas (schema 38), manifesto e hashes. Os prompts usam caminhos por run; editar a biblioteca não altera os arquivos já publicados. Falha obrigatória impede o processo e a integridade é conferida antes das tentativas. Snapshots são preservados sem coleta automática. As fontes externas legadas e a ativação completa da E5 continuam pendentes.
- **Plano de execução revisável por atividade.** Histórias mostram fases abertas; tarefas mantêm trabalho, refino, resumo e conflito independentes. O editor configura agente, modelo, skills, MCPs, entradas e resultado, com padrões de board/workflow e ações sem card. Antes de aplicar um lote, mostra diferenças, origens, justificativa e estimativa conhecida. Salvamento atômico com revisão otimista, schema 37, rascunhos preservados em falhas e entre abas. Os planos continuam rascunhos; o runtime permanece legado.
- **Base de admissão de contratos v1 no gateway.** Cinco capacidades independentes e recibos locais vinculados à configuração substituem declarações manuais como fonte de prova no novo caminho. O mapeamento estrito do Claude intersecta ferramentas e operações MCP, impõe vazio explícito e revalida as restrições antes de iniciar. O schema 36 preserva a decisão de auditoria, sem exportar recibos locais nem reutilizar autorização importada. O verificador de CLIs reais e a ativação das ações continuam pendentes; execuções atuais permanecem legadas.
- **Identidade registrada antes de iniciar a IA.** O launcher aguarda o registro durável da identidade antes de receber o comando. A recuperação distingue queda antes da liberação, execução órfã ainda viva e grupo comprovadamente encerrado. Testes com processos reais cobrem essas fronteiras; identidades ambíguas e a árvore Windows permanecem sem confirmação.
- **MCP do projeto emprestado durante a execução.** O transporte de Cursor e Kimi coordena o arquivo pelo caminho real, registra um diário antes de escrever e restaura a configuração anterior quando o encerramento é confirmado. As tentativas de formato compartilham o empréstimo. JSON inválido bloqueia antes de iniciar a IA; edições conflitantes são preservadas. Processos com término desconhecido mantêm o empréstimo para reconciliação.
- **Base de contratos de contexto versionados.** O schema 35 separa rascunhos de agentes e seleções por ação dos campos legados, com IDs estáveis, revisões, validação no host e export/import. Herança difere de seleção vazia. A migração preserva as escolhas atuais e a prévia identifica o modo legado; os novos contratos ainda não governam execuções. MCPs legados não se tornam autorizações automaticamente. A prévia de rascunhos no protocolo resolve herança e incompatibilidades sem inferência, retornando metadados. O editor do contrato v1 está disponível nos subagentes já salvos da biblioteca, com essenciais, sugestões, MCPs permitidos, restrições e prévia. Salva separadamente, sem IA, e preserva referências ausentes; revisões atrasadas são recusadas. A mesma prévia está disponível pelo MCP `preview_context_draft`. A admissão por capacidades de #729 continua pendente.
- **Contexto da execução com origens e limites do executor.** A aba Consumo do card e os editores de agentes mostram o contexto efetivo, a origem de cada item e o tamanho inicial estimado, sem iniciar IA. Arquivos são agrupados pela identidade da cópia do board ou pelo caminho legado, preservando todas as origens. A prévia aponta parágrafos repetidos entre agentes e distingue restrições impostas de orientações. Consumo futuro desconhecido permanece desconhecido; esta entrega não altera a seleção usada nas execuções.
- **Subagentes com assistência de IA em cada parte.** Criação, edição e assistente abrem em um modal separado da lista. As abas Instruções, Modelo, Permissões, Skills, MCPs e Revisão explicam cada escolha, com dicas e exemplos. O formulário usa Nome e Conteúdo; modelos vêm do catálogo, com opção de herdar o do card. Skills e MCPs mostram descrições e indicações justificadas pela IA, que a pessoa pode selecionar. Antes de salvar, a IA analisa a definição e oferece melhorias; a pessoa pode aplicá-las ou manter o texto. Sugestões não gravam nem alteram permissões automaticamente.
- **Ações contextuais em lote (#616).** A barra de seleção e o menu da coluna compartilham aprovar, bloquear com motivo, desbloquear, trabalhar na fase, refinar, parar a IA, modo autônomo e as ações de organização. Itens indisponíveis ficam visíveis e desabilitados, sem motivo. Seleções mistas afetam só os elegíveis; filtros e limites de execução são respeitados. Aprovações em lote avançam a fase e preservam os eventos do histórico.
- **O log guarda o comando de cada chamada de Bash (#604).** Para saber se o tempo vai em `npm test` repetido, em `git` ou em `cat`/`grep` que poderiam ser Read e Grep, o leitor da saída do Claude Code registra, por execução, o comando-base de cada chamada de Bash, sem argumentos (que podem ter caminhos ou dados seus): `npm test`, `npx vitest`, `git status`, `cat`. Comandos encadeados contam um termo por trecho (`cd x && npm test` conta `npm test`) e o que não dá para reconhecer vira `outro`. O `get_metrics` ganha `group_by: "bash_command"` (execuções e chamadas por comando; combine com `phase` para ver por fase). Os dados vão para a tabela nova `ai_run_bash` (migração 33, mantida pela mesma retenção do log) e só existem para execuções do Claude Code feitas depois desta versão.
- **`get_card` aceita `only`** com os blocos que interessam (`phase`, `subtasks`, `checklist`, `links`, `conversation`, `attachments`): título, descrição, campos, modelo, harness e pasta de trabalho vêm sempre. A IA relê só a conversa, por exemplo, sem repetir o card inteiro no contexto.

### Alterado

- **Busca de card por número (#1065).** Na busca do board e no `list_cards` do MCP (`text`), `#980` mostra só o card 980, e `980` mostra o card 980 e os cards que o citam (`#980` ou `980` como número no texto). **Mudança de comportamento:** `#980` deixa de trazer `#9801`, e `980` deixa de trazer cards que só contêm `1980`.
- **O board responde mais rápido com histórico grande: estado montado uma vez por mudança, envios juntos e só o que a tela mostra (#1066).** O aviso "O Faz AI demorou para responder" aparecia porque cada mudança do board (um comentário da IA, um card movido) fazia o host montar o estado inteiro uma dezena de vezes, uma por ouvinte, e mandar tudo a cada webview, com a lixeira, os arquivados e todas as conversas; num board com centenas de histórias concluídas eram vários megabytes por mudança e mais de um segundo com o host travado. Agora o estado é montado uma vez por mudança e guardado até a seguinte; mudanças seguidas vão à tela num envio só (uma ação sua não espera: o estado novo chega antes da confirmação); a aba ou barra lateral escondida não recebe nada até voltar; e cada tela recebe só os cards vivos (a lixeira e os arquivados chegam ao abrir essas telas, e a conversa só do card aberto), com as contagens no lugar. Na tela, o que não mudou mantém a identidade e os cards não redesenham à toa. O canal de log passa a registrar as operações que levam mais de 200 ms, com a duração. O que a IA lê pelo MCP não muda.
- **Limite de uso do plano pausa a fila do perfil de CLI, não os cards (#1047, reaplica a #800).** Quando um perfil de CLI esgota o limite de uso (de sessão, semanal ou rate limit) e nenhuma política de execução oferece outro destino, o card volta para a IA e o heartbeat, o autopiloto e o orquestrador deixam de iniciar execuções **daquele perfil** até a renovação informada na saída (mais 3 minutos de folga) ou, sem horário, até o backoff de 5 minutos que dobra a cada nova falha, até 60. Os outros perfis seguem normalmente, e o motivo aparece no log da rodada ("Heartbeat: ... esperando") e no topo do board, uma linha por perfil ("Limite de uso do Claude Code: a fila dele retoma às 13:53."). Vencida a pausa, a primeira execução automática é o teste: se o limite esgotar de novo, a pausa recomeça. Com uma política de fallback executável, a execução segue no destino dela e o perfil de origem não é pausado. A pausa fica gravada no board e sobrevive a reabrir o editor; a execução pedida à mão continua liberada e, terminando bem, encerra a pausa.
- **Ciclo do card em menos chamadas do MCP, com respostas resumidas (#601).** `start_work` numa sub-tarefa já a leva de "A fazer" para "Em andamento" (a coluna seguinte do workflow filho, quando é aberta e não exige aprovação). `move_card` aceita `comment`: a mensagem de conclusão entra na conversa do card depois do movimento, e um movimento recusado não grava nada. `create_card` aceita `profile` (o agente, como em `set_card_profile`) e `checklist` (os itens, na ordem), e passa a devolver o card resumido, como `move_card`; `set_card_profile` também. `add_checklist_item` aceita `items` com vários itens de uma vez. A skill do fluxo e as instruções do servidor ensinam o ciclo novo; as chamadas de hoje continuam valendo. **Mudança de comportamento:** a resposta do `create_card` não traz mais `phase`, `execution`, notas e descrição; o detalhe vem pelo `get_card`.
- **As configurações do board voltam para a tela de Configurações do próprio board (#726).** Aparência (idioma, tema, fonte e tamanho), Git (modo, gitflow, branches, worktrees, merge automático e registros de decisão), **Tocar histórias em paralelo** (Harness de IA › Ferramenta e execução) e Backup se editam de novo em Configurações, no editor e no navegador, agrupados por assunto. A categoria Faz AI some do Settings do editor (`Ctrl+,`), assim como o comando **Abrir as configurações do Faz AI no Settings** e o botão **Abrir no Settings do editor**. Na primeira abertura de cada board no editor, os valores que já estavam gravados no Settings são trazidos uma vez para o board (a Aparência só do Usuário; valor inválido é ignorado). As chaves `fazai.*` antigas do `settings.json` podem ser apagadas. **Mudança de comportamento:** um projeto novo não herda mais o Git do Usuário, e a Aparência volta a ser por board.
- **Textos da IA e board padrão v13 para as perguntas com opções (#956).** A skill do fluxo, as instruções do MCP, o pedido da fase e o modo autônomo passam a citar `ask_questions` (pergunta com alternativas) e `ask_question` (pergunta aberta); `request_review` com `pending` fica para o que não é pergunta com opções. Os modelos de Discovery, PRD, Spec e Plan perdem a seção "Perguntas para você": a IA pergunta antes de escrever o documento e usa as respostas da seção "Perguntas e respostas" da descrição. O board padrão sobe para a versão 13; a atualização só troca a coluna que ainda tem o texto padrão anterior.
- **O board executa as sub-tarefas da Implementação (#621, #824).** Na fase de código, a sessão da IA na história só cria e descreve as sub-tarefas e para; quem as executa é o **board**, cada uma numa execução própria da CLI, com o agente, o modelo (e a CLI), as skills e os MCPs do card dela, uma depois da outra na pasta da história (um escritor por vez) e na ordem das dependências. Quando todas terminam, o board chama a IA **uma vez** para o fechamento (verificar o conjunto, fazer o commit e mover a história); se o fechamento não avançar a história, ela fica bloqueada com o motivo. **Chamar IA**, o autopiloto e o heartbeat entregam a história ao mesmo orquestrador, com uma posse só; durante as rodadas a história aparece "Em execução", e cancelá-la interrompe as execuções das filhas e só então libera a pasta. Só a janela dona do board executa. A skill do fluxo, as instruções do MCP, as notas do `get_card` (`subtasksNow.byBoard`) e o agente condutor deixam de mandar delegar a subagentes.
- **O modelo escolhido decide a CLI de cada execução (#620).** O board não tem mais uma ferramenta única: o valor do campo Modelo (`<perfil>:<modelo>@<esforço>`) carrega o **perfil de CLI** que executa. A ordem é: Modelo do card, depois o modelo do agente, depois a regra de modelo e, sem nenhum dos três, o **perfil de CLI padrão** (Configurações → Ferramentas de IA). Sub-tarefas da mesma história podem rodar em CLIs diferentes, e as regras por esforço podem apontar para perfis diferentes. O primeiro nível preenchido é definitivo: **escolha explícita inválida bloqueia** o card (perfil desligado, modelo fora do catálogo ou esforço inexistente), com o motivo na conversa, sem cair para o próximo nível. A regra de modelo vale na execução mesmo com "Preencher o modelo sugerido automaticamente" desligado, quando o card e o agente não têm modelo. O campo Modelo, o chat e o editor de regras mostram o **catálogo de todos os perfis ligados**, agrupado por perfil. Login vencido e CLI ausente passam a ser **problemas por perfil**: param só os cards daquele perfil, e o aviso aparece só para os perfis em uso. **Sugerir regras** age só no perfil sugerido e não apaga as faixas de outro perfil. O `get_card` mostra em `model` o alvo que de fato executa: `tool` (o perfil de CLI), `from` (`card`, `agent` ou `rule`) e, numa escolha inválida, `blocked` com o motivo; o que o board impõe (`execution`) segue o perfil que executa. **Mudança de comportamento:** a regra de modelo agora decide a CLI e o modelo mesmo com o preenchimento automático desligado.
- **Reserva de modelo vira proposta de política (#735).** A reserva das regras de sugestão deixou de trocar de modelo ou de CLI: cada reserva legada vira, uma única vez, uma proposta de política **desligada e pendente de revisão**, com a regra de origem no id e no nome, histórico na versão 1 e um aviso em Políticas de execução. Reservas sem conversão (modelo ou esforço fora do catálogo) são listadas. O editor de regras aponta para as políticas e não cria reserva; o MCP `set_model_rules` recusa `fallback`. Exportar avisa que credenciais dos perfis não vão no arquivo, e importar lista os perfis desligados e as políticas pendentes. **Mudança de comportamento:** nenhuma troca automática acontece até a pessoa revisar e ligar a política.
- **Políticas de execução e fallback em Configurações → Ferramentas de IA (#733).** O editor de políticas (condições, destinos, limites, histórico, comparação e revisão antes de salvar) saiu do Harness e fica abaixo dos perfis de CLI, no editor e no navegador, sem IA nem executor. Nova simulação **Próxima execução**: avalia só as políticas salvas e ligadas, pelo mesmo avaliador do runner, sem gastar tokens nem abrir a CLI.
- **Chat, assistentes e sugestões usam a mesma política de execução dos cards (#732).** Quando o limite de uso do plano esgota no chat, em "Sugerir agentes, regras ou skills" ou em "Indicar artefatos", a decisão vem do avaliador único de políticas, o mesmo do runner: com política aplicável a execução segue no destino dela, sem repetir a pergunta na conversa; sem política, a conversa mostra o aviso e nada roda noutro alvo. O log explica a regra vencedora, o destino, as alternativas e as recusas. A CLI ausente ou sem login recusa antes de abrir o processo. A IA consulta as políticas pelo MCP (`get_execution_policies`, só leitura); criar, revisar e ativar continua sendo ação da pessoa nas Configurações.
- **O fluxo do board chega pelo MCP, sem arquivo na pasta da ferramenta (#617).** A skill do fluxo (`faz-ai-fluxo`) e as skills `faz-ai-*` por assunto são servidas pelo board com `get_skill`, e têm prioridade sobre um arquivo de mesmo nome. Todo pedido do board traz uma linha que manda ler o fluxo; `get_card` e `get_pending_work` trazem `flowNote` com a mesma indicação, e as skills do fluxo em `requiredSkills` vêm sem caminho, com `via: "get_skill"`. A skill do fluxo deixou de ser requisito: instalá-la na ferramenta é opcional (`install_flow_skill`). O resumo do log da execução marca a origem de cada item (pelo pedido, pelo MCP ou imposto pela CLI), e o pedido de "Indicar artefatos" passa a receber o contexto "Sempre". **Mudança de comportamento:** a faixa de requisitos não cobra mais a instalação da skill do fluxo, e uma cópia dela na pasta da ferramenta não substitui o texto servido pelo board.
- **Ferramentas de IA viram perfis de CLI (#618).** Em Configurações → Ferramentas de IA, é possível ligar, escolher como padrão, duplicar, criar e testar perfis. Os prontos mantêm suas ferramentas; uma cópia usa o catálogo e a medição da origem, mas tem configuração e verificação próprias. Um perfil personalizado aceita outra CLI com saída em texto, sem medição de tokens ou custo. O campo Modelo oferece “Outro modelo…” para personalizados. Pelo MCP, `set_ai_tool` escolhe um perfil ligado e `get_models.profiles` lista os perfis sem revelar configurações privadas. Testar usa a assinatura e uma resposta OK não comprova isolamento, permissões ou MCP.
- **Importação pelo adaptador de formato e aviso da cópia antiga da skill do fluxo (#851, parte 2a).** **Importar → Ferramenta instalada** e **Pasta** passam a ler as pastas das ferramentas (regras, skills, agentes e servidores MCP) pelo mesmo adaptador de formato do **Exportar para a ferramenta**, no projeto e no usuário, só leitura. O Diagnóstico mostra, em Recomendados, o item **Cópia antiga da skill do fluxo** quando versões anteriores deixaram `faz-ai-fluxo` em `.claude/`, `.cursor/` ou `.kimi-code/` (projeto ou usuário), com o caminho de cada arquivo; o board não apaga nada, apague à mão. Os agentes que o banco guardava de versões antigas passam a ir direto para o board, sem criar arquivo em `~/.claude/agents`, e a cópia da marcação antiga procura as dependências dos agentes sem varrer as pastas. **Mudança de comportamento:** a importação de uma ferramenta lê só a pasta dela (o Cursor não traz mais as skills do `.claude`).
- **Diagnóstico e aviso do topo por perfil de CLI (#622, parte 1).** O Diagnóstico do ambiente passa a ter um bloco por perfil de CLI (o padrão primeiro, e os desligados e pendentes de revisão num grupo fechado), com a situação, a linha de comando (caminho, versão e instalação), o login, as credenciais (só o nome da referência e se está preenchida) e o estado da verificação real, que ainda aparece como "Não validado", sem selo. O aviso do topo só bloqueia o board quando nenhum perfil ligado está disponível; um perfil com problema, com outro pronto, vira um aviso dele, com o link para o bloco. Com o Claude Code instalado e logado e o Cursor ausente, o board trabalha e o Cursor aparece como não encontrado. O login vencido numa execução trava o heartbeat e o modo autônomo só quando é o do perfil padrão. **Mudança de comportamento:** saem do Diagnóstico e do aviso o MCP do board registrado na ferramenta, a skill do fluxo instalada, o nível de permissão no arquivo da ferramenta e o MCP do Code Review Graph, junto com os botões que os resolviam (**Instalar o MCP do board**, **Corrigir o registro**, **Corrigir o caminho**, **Instalar a skill**, **Liberar as ferramentas do board**, **Abrir MCPs do Cursor**) e as mensagens `environment.pinMcp` e `environment.allowKimiMcp`; o caso `cursor` do banco de artefatos também saiu. Capacidades e admissão detalhadas, Testar no Diagnóstico, próxima execução e limites efetivos ficam para a parte 2 (#880).
- **Tela do Harness com os artefatos do board (#616).** Configurações → Harness tem agora duas abas: **Ferramenta e execução** e **Artefatos do board**. A segunda reúne Regras, Skills, Agentes e Servidores MCP, igual para qualquer ferramenta, com busca, seleção múltipla e modo (Sempre / Pelo card / Desligado). Dá para criar, editar e apagar cada tipo direto no board, sem nenhuma ferramenta instalada; os servidores MCP mascaram segredos e os agentes mostram ferramentas por categoria. **Importar** é uma ação explícita de três origens (pasta ou repositório git, ferramenta instalada, arquivo exportado): copia, pergunta antes de substituir o mesmo nome, traz regras desligadas e configuração executável pendente de revisão. **Mudança de comportamento:** saem as abas por ferramenta, o seletor de escopo, Comandos/Hooks/Demais e as gravações do board nas pastas das ferramentas; as ferramentas MCP do harness (`create_skill`, `write_rule_file`, `set_harness_selection` etc.) mantêm os nomes e passam a operar só no banco do board.
- **O board guarda a própria cópia dos agentes, skills, regras e servidores MCP (#615).** As execuções usam só as cópias guardadas no banco do board. Um item marcado em Configurações → Harness que existe só na pasta da ferramenta, sem ter sido copiado, aparece como ausente e não entra nas execuções; apagar ou mover o arquivo original depois da cópia não muda nada no board. Os servidores MCP de uma execução vêm só das definições do board: se um agente ou card citar um servidor que não está lá, a execução não começa, e o erro pede para enviá-lo ao board em Configurações → Harness. Agentes criados ou editados pelo board ficam no banco, não em `~/.claude/agents` nem em `.cursor/agents`: editar uma cópia não altera o arquivo original, `delete_agent` tira o agente só do board, e `scope` em `create_agent` é ignorado. Os agentes de fábrica são criados em cada board, e o que você apagou não volta sem pedido. Cada execução guarda no seu snapshot a configuração resolvida (modelo, esforço, agente, skills e nomes dos servidores MCP), nunca credenciais; editar ou apagar um artefato só vale para as próximas execuções. **Mudança de comportamento:** agentes criados por versões anteriores em `~/.claude/agents` ficam onde estão, mas o board não grava mais nessa pasta, e editar o agente na pasta da ferramenta não atualiza a cópia do board; para atualizar, remova-o da biblioteca e envie-o de novo.
- **IDs de perfis separados das bases de CLI.** `AiTool` aceita os IDs persistidos; tabelas de arquivos, modelos embutidos e ferramentas nativas usam `AiBase`. O padrão aceita somente perfil ligado/revisado. Cópias consultam o catálogo da base preservando sua identidade; personalizados recebem metadados neutros, sem inventário nativo presumido. Host recusa perfis desativados/importados antes da preparação. A execução de cópias/personalizados aguarda a integração dos providers.
- **Configurações MCP locais e importação revisada.** Schema 40 troca definições da biblioteca por referências a um cofre cifrado no host, após confirmar os valores no disco. Exportação e editor não devolvem comando, argumentos, URL, ambiente ou cabeçalhos salvos. Importações ficam pendentes até a pessoa fornecer uma definição revisada; preparação e ponte recusam configurações pendentes ou ausentes. Logs e respostas de MCPs ocultam valores conhecidos pelo cofre. Perfis de CLI e caminhos legados ainda dependem da continuação de #728.
- **Harness e biblioteca do board (#615).** O menu e o título passam a usar Harness, com Ferramenta e execução antes de Biblioteca do board. Regras, skills, subagentes e MCPs ficam numa biblioteca particular compartilhada entre ferramentas, com pasta padrão dentro de `~/faz-ai-library`. O campo Pasta da biblioteca permite escolher outro destino; salvar transfere a biblioteca, preservando a pasta anterior. Skills particulares ficam fora do pacote da extensão.
- **Importação por tipo, com revisão e proteção contra duplicatas.** A prévia mantém abas de regras, skills, subagentes e MCPs, inclusive vazias, com filtro por nome e seleção entre abas para uma única importação. Artefatos de mesmo nome e tipo não são substituídos: os demais são importados e os ignorados são listados por tipo, com opção de sobrescrever após confirmação explícita. Importar e colar pastas não apaga arquivos; Atualizar lista reconhece as skills e edições locais. Abrir pasta usa o gerenciador de arquivos.
- **Criação de regras e skills com orientação.** Criar e Assistente guiado usam o editor Markdown compartilhado. As etapas explicam o que preencher e oferecem exemplos editáveis; regras cobrem objetivo, mapa do projeto, comandos de teste e validação, convenções, regras inegociáveis e exceções. O formulário de regras tem apenas Nome e Conteúdo. Gerar com base no projeto considera a estrutura e os artefatos existentes. Sai o bloco de contexto detectado do assistente; botões mantêm texto e indicador durante a espera, e sugestões usam fonte maior e entrelinha mais legível.
- **Gestão da biblioteca e descrições de MCPs.** Skills, subagentes e MCPs têm seleção e ações em massa, incluindo Excluir com confirmação, e deixam de oferecer Atualizar da origem. Regras mantêm atualização explícita da origem. MCPs exibem a descrição cadastrada e importam descrições da configuração quando disponíveis; o editor oferece o campo Para que serve este MCP?, com área de texto e exemplo. A conexão stdio/HTTP pelo servidor faz-ai permite usar as ferramentas dos MCPs entre executores. Avisos explicam o papel de cada tipo, com botão de fechar e opção de reabrir; regras novas ficam desligadas para revisão.
- **A IA resolve o conflito do pull request numa execução própria, e o board confere o conflito com a base antes do PR (#747).** Quando o pull request aberto de uma história entra em conflito, o board avisa na conversa citando o commit do PR e, na mesma rodada do heartbeat, chama a IA com um pedido só para isso, à frente da fila: atualizar a branch por merge a partir da base do PR (sem rebase nem push forçado), resolver os conflitos, rodar as checagens, enviar e registrar na conversa. A execução vale para qualquer história, inclusive as autônomas e as já entregues, menos a bloqueada e a que espera a sua resposta; ela usa o modelo e a permissão da fase, segue os tetos das atividades com branch, aparece no card como "resolvendo conflito" e, no fim, o card volta ao status que tinha. Se a IA não conseguir, ela bloqueia o card com o motivo; se terminar e o PR continuar em conflito no mesmo commit, o board bloqueia o card. Desbloquear vale como "tente de novo". Para a história com branch e ainda sem PR, o board confere a cada rodada, só lendo (`git merge-tree`, git 2.38 ou mais novo), se a branch conflita com a base atual e, se conflita, avisa na conversa uma vez por commit, com os arquivos, para a IA tratar antes de abrir o PR. **Correção:** um segundo conflito no mesmo pull request, depois de o primeiro ser resolvido, agora ganha aviso novo. **Mudança de comportamento:** o aviso de conflito não devolve mais o card para "Pronto" nem faz a IA trabalhar a fase de novo.
- **Mapa do código: as fases de documento partem do que a fase anterior já leu (#600).** Discovery, PRD, Spec e Plan são mais da metade do custo do board, e cada execução relia o código que a fase anterior já tinha explorado. Agora o modelo do Discovery ganha a seção **"Mapa do código"** (arquivos, funções, padrões e testes envolvidos) e o da Spec a completa; as instruções de PRD, Spec e Plan mandam partir do mapa e ler só o que falta, usando antes de Read e Grep as ferramentas de índice de código que o Harness liberou, se houver (o arquivo lido continua sendo a fonte de verdade); no Plan, a descrição de cada sub-tarefa lista os arquivos que ela vai tocar. A instrução da Spec não cita mais o code-review-graph. **Atualizar board** (versão 12) troca esses textos nas colunas que ainda estão no padrão; as personalizadas ficam como estão.
- **O heartbeat sincroniza as branches locais e faz a manutenção numa ordem fixa, em paralelo (#722).** A cada rodada, depois de conferir os pull requests, o board atualiza com o origin as branches que conhece (a principal, a `develop` e a branch de cada história em aberto), só por fast-forward: a branch anda só quando está atrás do origin, sem nenhum commit à frente, sem execução da IA na história e com a pasta em que está aberta limpa; nada é mesclado com commit, reescrito ou forçado, e as suas branches pessoais não são tocadas. Cada branch atualizada e cada motivo de pulo (uma vez por motivo) aparecem no log com o prefixo `Branches:`. A rodada passa a ter uma ordem: arrumação, um `git fetch` só, pull requests, sincronização, órfãs e versões publicadas, e por último a fila da IA, que espera a sincronização para partir das branches em dia. As consultas ao GitHub vão em paralelo, até quatro ao mesmo tempo, com um limite próprio da manutenção que não é o **Tocar histórias em paralelo** do board. O git das rotinas de fundo não espera mais por uma senha no terminal: falha na hora e o motivo vai para o log. **Mudança de comportamento:** a IA da rodada começa depois do fetch e das consultas, em vez de junto com elas.
- **`get_board` enxuto: uma lista de agentes, sem aparência nem inventário repetido (#598).** A resposta trazia os agentes três vezes (`agents`, `harness.agents` e `harness.inventory`), além de `appearance` e do inventário inteiro do Harness, que a IA não usa para conduzir os cards. Agora vem só `agents` (com `default`), workflows, tipos, campos e regras; o bloco `harness` e o `appearance` saíram, e o inventário continua no `get_harness`. As instruções do servidor MCP, a descrição da ferramenta e a skill do fluxo pedem o `get_board` só no Plan, no refinar e ao editar o board. **Mudança de comportamento:** quem lia `get_board.harness` ou `get_board.appearance` passa a usar `get_harness`.
- **As notas fixas do `get_card` ficam curtas e o texto completo vai para skills por assunto (#588).** A IA lia, a cada `get_card`, as mesmas instruções sobre harness, rules e skills obrigatórias, rodadas da Implementação, modelo, pasta de trabalho, base do pull request e modo autônomo. Agora cada nota é uma frase que só aparece quando o estado do card pede e aponta a skill (`faz-ai-harness-do-card`, `faz-ai-workspace-e-pr`, `faz-ai-implementacao-rodadas`, `faz-ai-revisao-e-homologacao`, `faz-ai-modo-autonomo`); o texto completo está nelas, e a `faz-ai-fluxo` ficou mais enxuta. Instalar a skill do fluxo (pelo botão ou por `install_flow_skill`) instala o conjunto. Os dados do card não mudam; num `get_card` de teste de uma história autônoma com sub-tarefas, as notas caíram de 2.515 para cerca de 1.400 caracteres (a resposta, de 4.573 para 3.232). **Mudança de comportamento:** quem já tem a `faz-ai-fluxo` instalada precisa clicar em instalar de novo (sem substituir a dela) para receber as skills por assunto.
- Na conversa do card, o botão "Resumir a conversa" passa a ficar à direita e em destaque (botão primário).
- **O resumo automático também olha o tamanho da conversa.** Além de três ou mais mensagens desde o último resumo, duas mensagens que somem muito texto (12 mil caracteres, ao menos uma da IA) já pedem o resumo antes da próxima fase: o que pesa no contexto é o texto, não a contagem.
- **Card aberto: o botão "Salvar descrição" sobe para o cabeçalho da seção**, ao lado do título, onde continua à vista mesmo com uma descrição longa; **Pedir ajustes** ganha uma dica explicando o que acontece (o card volta para "Pronto" e a IA refaz a fase com o seu pedido na conversa).
- **A caixa de selecionar todos da coluna fica no início do cabeçalho (#579).** Ela sai do lado da contagem e passa a ser a primeira coisa do cabeçalho, alinhada com as caixas dos cards da coluna, para marcar a coluna inteira de uma vez. Numa coluna sem cards, a caixa fica oculta e o espaço dela continua reservado, então o cabeçalho não muda de altura nem de posição.
- **O heartbeat cuida do board inteiro a cada rodada.** Além de trabalhar os cards prontos e responder às mensagens pendentes, cada rodada agora: (1) **refina os cards novos do Backlog** (a partir do título, a IA melhora a descrição, preenche modelo, skills, rules e checklist e deixa o card aguardando a sua revisão; aprovar leva o card para a primeira fase) — liga e desliga em Configurações → Harness, **Refinar os cards novos do Backlog**, nasce ligado; (2) **resume a conversa que cresceu** (três ou mais mensagens desde o último resumo, ao menos uma da IA) antes de trabalhar a fase, em qualquer história; (3) **devolve para a IA os cards bloqueados por limite de uso** da ferramenta, com aviso na conversa; (4) **avisa, uma vez por parada, o card que está com você há dois dias ou mais**; (5) confere os pull requests e limpa branches e worktrees, como antes, agora para **toda história com pull request**, em qualquer coluna e com ou sem modo autônomo (a conclusão vai para a coluna de conclusão à frente). O log da rodada diz quantas histórias estão com você e o que a IA vai fazer em cada uma (fase, refinar, resumir).
- **Aprovar não chama mais a IA na hora com o heartbeat ligado.** O card aprovado vai para a próxima coluna em "Pronto" e é trabalhado na rodada seguinte, se houver vaga; com o heartbeat desligado, a aprovação continua chamando a IA na hora.
- **O resumo "desativa" as mensagens anteriores em vez de apagá-las.** A IA passa a receber a conversa a partir do último resumo (`comments` do `get_card`); na tela, o resumo ganha destaque e as mensagens anteriores ficam esmaecidas, com o aviso de que não vão mais para a IA. Nada é apagado sozinho: o botão **Apagar mensagens resumidas** continua lá, e o autopiloto também deixa de apagar depois do resumo entre fases. Uma pergunta sua feita antes do resumo continua contando como "sem resposta".
- **Toda ação do board mostra que está esperando.** Criar, mover, arquivar, excluir e restaurar cards, mudar status, título, tipo, coluna, campos e agente, mensagens, checklist, vínculos, anexos, modo autônomo, heartbeat e as ações das Configurações (colunas, workflows, tipos, campos, regras, harness) passam a esperar a confirmação do host em vez de sair em silêncio. Uma barra fina no topo do board acende enquanto há qualquer pedido em andamento; o card com um pedido em espera esmaece e ganha um spinner na faixa, no board e no card aberto; o botão clicado e a linha afetada (item de checklist, vínculo, campo, mensagem) mostram a espera no lugar; **Trabalhar na fase**, **Refinar com IA** e **Parar a IA** ficam travados até a execução começar (ou parar). Os campos de texto (novo card, mensagem, item de checklist, sub-tarefa, busca de vínculo, formulários de coluna, workflow, tipo e campo) só limpam ou fecham quando o host confirma: se a ação falhar, o aviso aparece e o que você escreveu fica. Arquivar e excluir em lote mostram o andamento na barra de seleção e só limpam a seleção no fim.

### Removido

- **O modelo reserva por regra sai de vez (#853).** O editor de regras de modelo (Configurações → Modelos) não mostra mais o campo "Fallback", o botão para as políticas nem a linha "reserva legada (desativada)": a regra só tem nome, condições e o modelo sugerido. As ferramentas MCP `set_model_rules` e `get_models` não têm mais o parâmetro `fallback` nem os campos `fallbackSuggest` e `fallbackValue`. A troca de modelo numa execução é decidida só pelas **Políticas de execução e fallback**. Reservas gravadas em boards antigos continuam sendo convertidas em proposta de política desativada ao abrir o board, e o aviso de migração fica em **Políticas → Gerenciar políticas**; métricas, tentativas e logs antigos abrem como antes. **Mudança de comportamento:** o campo deixou de existir; numa chamada de `set_model_rules`, a chave `fallback` é ignorada e a regra é salva sem reserva (antes a chamada era recusada com aviso).
- **Sem delegação nativa e limite de sub-tarefas na tela (#825).** Nenhuma execução do board leva mais outros agentes em `--agents` nem depende de subagentes da CLI: as sub-tarefas são execuções separadas do board, e `MAX_AGENT_ARG` vale só para o agente da própria execução. No Claude Code a ferramenta de subagente (`Agent`, antes `Task`) fica negada em toda execução; no Cursor e no Kimi Code, sem bloqueio comprovado, a capacidade fica "desconhecida" e a admissão decide. O aviso "os agentes especialistas do board não couberam" e a linha de subagentes da estimativa de contexto saíram. Em **Configurações → Harness de IA**, o controle **Sub-tarefas em paralelo por história** (1 a 6) mostra o pedido e o efetivo ("Efetivo: 1. As sub-tarefas escrevem na mesma pasta da história, então rodam uma por vez."), e a chave `fazai.git.parallelSubtasks` espelha `fazai.git.parallelStories` no Settings do editor.
- **O board deixa de ler e gravar as pastas das ferramentas (#926, 9/9).** A varredura do harness por ferramenta, o observador de arquivos, os plugins, os hooks e permissões e o inventário "Projeto/Global" saem da tela de Harness: o harness é a biblioteca do board (regras, skills, subagentes e servidores MCP no banco). Fora de **Conectar ao board**, de **Exportar para a ferramenta** e do MCP temporário da execução, nenhum código do board escreve em `~/.claude`, `.claude/`, `.cursor/` ou `.kimi-code/` (guardado por `test/toolFolderWrites.test.ts`). O botão "Instalar a skill" saiu: o fluxo chega pelo `get_skill`, e o requisito aponta para o Harness. O "Indicar artefatos" saiu junto com o inventário. **Mudança de comportamento no MCP:** removidos `install_flow_skill` e `set_skill_enabled`; `get_harness` não aceita mais `onlySelected` e devolve só o board; `set_harness_selection` identifica cada item por `{ kind, name }` (o item é estrito: `location` dá erro). O schema 46 apaga a tabela `harness_imports` (a marcação em `harness_selection` fica); exports antigos com a tabela continuam sendo importados. Os agentes `faz-ai-*` gravados por versões antigas nas pastas das ferramentas não são apagados sozinhos: remova os arquivos `faz-ai-*.md` de `.claude/agents`, `.cursor/agents`, `.kimi-code/agents` e `~/.claude/agents`.
- **Regras não mostra mais o aviso sobre a aba Modelos (#725).** O bloco que dizia que "Preencher o modelo sugerido automaticamente" tinha mudado para Modelos, com o botão "Abrir em Modelos", saiu de Configurações → Regras. A opção continua na aba Modelos, sem mudança.
- **O campo Criticidade saiu do board.** Desde a #441 ele não mudava o fluxo (nada segura a história do núcleo no modo autônomo) e só servia de sinal para a revisão; saem com ele a regra **Áreas críticas (núcleo)**, o `criticalPaths` do `update_rules`, o `criticalAreas` do `get_card` e a seção da skill do fluxo. **Atualizar board** (versão 11) apaga o campo e os valores dele onde ele ainda existir.

### Corrigido

- **Correção: o modo autônomo não recusa mais os cards do agente que declara a skill do fluxo.** Desde a #880, a skill `faz-ai-fluxo` (e as `faz-ai-*`) sai de propósito das referências do pedido, porque a IA a lê pelo `get_skill`; mas o snapshot da execução continuava exigindo que toda skill do agente estivesse nelas. Todo card conduzido por um agente com `skills: faz-ai-fluxo` (o `condutor-do-board`, agente padrão) parava antes de a CLI abrir, com "Artefato obrigatório do card está indisponível", e o autopiloto se desligava. Agora o snapshot ignora as skills do fluxo; uma skill de verdade que falta continua recusando a execução.
- **Editor de contrato de contexto volta a abrir pelo agente (#1054).** Depois da #926, nenhuma tela levava ao contrato de contexto de um agente. O editor do agente, em **Configurações → Harness**, ganha de novo o botão **Editar contrato de contexto (rascunho)**, que abre o contrato do agente existente sem copiar permissões nem skills do formato antigo. As traduções que faltavam para esse texto e para as mensagens de linha de comando do {tool} entram no inglês.
- **Correção: a ponte MCP ignora o token de execução não interpolado (#823).** Quando a ferramenta de IA passa a variável `FAZAI_RUN_TOKEN` sem substituir o valor (o texto literal `${FAZAI_RUN_TOKEN}`), a ponte trata como ausente em vez de recusar a conexão com "token de execução inválido".
- **Correção: as sub-tarefas do card aberto ficam alinhadas (#844).** Na seção de sub-tarefas da história, o título agora ocupa o espaço até o status, que fica na borda direita da linha, em vez de ficar centralizado entre o LED e a coluna. Vale nos temas claro e escuro; os vínculos e os filhos não mudam.
- **O MCP e a skill do board são instalados no seu usuário sozinhos, e o aviso de desatualizado só aparece quando é real (#809).** Ao abrir a pasta, a extensão grava a versão ao lado da ponte (`~/.faz-ai/mcp/bridge.version`) e instala ou atualiza, em silêncio, o servidor `faz-ai` no escopo do usuário (nunca no do projeto) na ferramenta do board aberto e nas que já o tinham, além dos arquivos da skill do fluxo quando ainda não existem (uma skill que você ajustou não é sobrescrita). Se der certo, nada é mostrado; se falhar, um aviso oferece abrir o board, onde a faixa tem o botão de instalar. **Correção:** o aviso "MCP de uma versão anterior" não é mais decidido pelo caminho da ponte e sim pela versão, então não aparece com o MCP em dia; um registro no projeto (`.mcp.json`) é ignorado, sem aviso, remoção nem migração (o Cursor continua com o registro de projeto, único que ele suporta).
- **Correção: a execução que cai antes do primeiro evento não é mais repetida (#739).** Quando a CLI terminava com erro sem que o board entendesse um único evento da saída estruturada, o board presumia que nada tinha acontecido e chamava a ferramenta de novo em modo texto. Mas a CLI pode ter alterado arquivos, comentado ou movido cards e gastado tokens antes de cair (rede, cota, login, queda, saída truncada), e a segunda chamada duplicava o efeito e o consumo. Agora o board só repete em texto quando a ferramenta recusa, antes de começar e sem escrever nada, um dos argumentos da saída estruturada; a repetição leva as mesmas restrições (permissão, ferramentas, servidores). Nos outros casos a execução termina como falha, com o consumo "não medido" (desconhecido, nunca zero), e o card bloqueado e o erro do chat avisam que ela não foi repetida e pode ter feito parte do trabalho. A linha "Chamando…" do canal de log passa a dizer a tentativa e o id da execução. **Mudança de comportamento:** falhas antes do primeiro evento que antes "se resolviam" na segunda chamada passam a bloquear o card com o motivo.
- **Refinar não cola mais a descrição anterior inteira na conversa (#599).** A IA colava o texto anterior da descrição no comentário do refinar, e a conversa é lida a cada `get_card`: numa história refinada, a descrição aparecia duas vezes em toda consulta. Agora, quando reescreve a descrição, o refinar grava o texto anterior, sem alteração, como anexo da história (`descricao-anterior-AAAA-MM-DD-HHMM.md`, sem virar artefato), antes de trocar a descrição; o comentário resume o que mudou e cita o anexo. Se a gravação falhar, a descrição não é trocada. O texto continua recuperável pelo anexo.
- **Abrir um seletor não desloca mais o board.** O Radix trava o scroll do `body` ao abrir um seletor ou menu e compensava a largura da barra de rolagem com uma margem; como quem rola é o conteúdo, e não o `body`, a margem só empurrava tudo para o lado a cada abertura.
- **Correção: o limite de uso esgotado do Claude Code bloqueava o card.** A CLI atual escreve "You've hit your limit · resets 3pm" e, em alguns casos, sai com código 0: o board não reconhecia o texto e tratava como falha comum. Agora o texto é reconhecido (também pelo heartbeat, para desbloquear cards antigos) e o card volta para a IA com ou sem código de erro.
- **Correção: o aviso "Como usar o Harness" voltava depois de dispensado.** "Entendi, não mostrar de novo", "Não avisar novamente" do modo autônomo e a última escolha de "Até onde" ficavam só na memória do painel, que o editor descarta ao fechar o board ou recarregar a janela. Agora essas preferências ficam guardadas na extensão, por pessoa e não por pasta: valem em qualquer projeto, no board do navegador e entre reinícios.

## 0.46.0

### Adicionado

- **O registro do MCP é refeito ao atualizar a extensão (#563).** Na primeira ativação de uma versão nova, o board refaz o registro global nas ferramentas em que ele já estava (Claude Code e Kimi Code; o Cursor já é refeito a cada abertura de pasta). Se falhar, o motivo vai para Saída → Faz AI e a faixa de requisitos continua avisando.

### Alterado

- **O servidor MCP do board é instalado só no global da ferramenta (#563).** O Claude Code registra em `~/.claude.json` (por `claude mcp add-json --scope user`) e o Kimi Code em `~/.kimi-code/mcp.json`. Sai a opção **Instalar neste projeto** (MCP e skill do fluxo, na tela Harness e na ferramenta `install_flow_skill`), e os artefatos padrão do board não entram mais na pasta do projeto, que pode ser compartilhada com quem não tem a extensão. O Cursor segue como exceção: o `.cursor/mcp.json` do projeto, fora do git pelo `.git/info/exclude`, porque o global dele é um processo só para todas as janelas. Quem quiser uma cópia da skill no projeto usa **Copiar para o projeto** no Harness. Some também o aviso e o botão **Adicionar ao .gitignore** do comando **Conectar IA**. Um registro de projeto antigo (`.mcp.json`, `.kimi-code/mcp.json`) não é migrado: a faixa de requisitos continua oferecendo **Corrigir o registro**, que o tira e refaz o global. **Mudança de comportamento:** `install_flow_skill` perde o parâmetro `scope` e recusa chamadas que o enviem; quem automatizou com `scope` precisa tirá-lo.

### Corrigido

- **Correção: a skill `faz-ai-fluxo` não carregava no Cursor (#563).** O Cursor mostrava "Error parsing skill" porque a `description` do `SKILL.md` tinha `: ` sem aspas, o que quebra o YAML. Agora a `description` vai entre aspas na skill do fluxo e também nas skills e regras `.mdc` criadas pelo board. Quem já tinha a skill instalada clica em **Reinstalar** no Harness.
- **Limite de uso esgotado do Kimi Code não bloqueia mais o card (#570).** O erro de cota da CLI (`provider.auth_error` 403 "usage limit") agora é reconhecido: o card volta para a IA, como já acontecia no Claude Code, em vez de ficar bloqueado.

## 0.45.0

### Adicionado

- **O board agora trabalha com o Kimi Code.** O Kimi Code (`kimi`, a CLI da Moonshot AI) vira a terceira ferramenta de IA do board, ao lado do Claude Code e do Cursor: escolha em Configurações → Harness de IA. O botão de conectar registra o servidor do board no `.kimi-code/mcp.json` do projeto ou no `~/.kimi-code/mcp.json` (global), as execuções rodam por `kimi -p` com o servidor materializado antes de cada chamada, e os modelos são lidos do `kimi provider list --json`. O Diagnóstico do ambiente mostra todas as outras ferramentas instaladas (não mais só uma), e a faixa de avisos ganha um item recomendado para liberar as ferramentas do board de uma vez nas conversas do Kimi Code (a regra `mcp__faz-ai__*` no `config.toml` dele). Hooks do Kimi Code e a semeadura dos agentes de fábrica nas pastas dele chegam numa próxima versão.
- **Heartbeat diz por que não executou (#551).** Quando uma rodada não inicia nada, o log (Saída → Faz AI) traz o motivo: login vencido, história em modo autônomo, execução já em andamento, história com a pessoa sem mensagem pendente ou à espera de outro card. Antes aparecia sempre "nada pendente com a IA".
- **Hooks e agentes de fábrica no Kimi Code.** O Harness do Kimi Code passa a listar, acrescentar e remover os hooks `[[hooks]]` do `~/.kimi-code/config.toml` (20 eventos, filtro, comando e timeout de 1 a 600 s); o resto do arquivo fica intacto e blocos que o board não reconhece são recusados com a orientação de editar à mão. Hooks do Kimi falham em aberto e não são controle de segurança. Os agentes de fábrica gravados na pasta dele não levam mais `model:` nem `skills:` (a CLI os ignora; o modelo segue em `faz-ai-model`), ganham `subagents: "*"` quando têm a ferramenta `Agent`, e a lista de ferramentas passa a oferecer `FetchURL` e `WebSearch`. O teste de ponta a ponta com a CLI real fica para a #540.
- **Renomear a principal e a `develop` também no `origin` (#466).** Mudar `fazai.git.developBranch` ou o novo `fazai.git.mainBranch` (vazio = detectada) para um nome que ainda não existe abre um aviso no editor: **Renomear** ou **Desfazer**. Renomear faz, nesta ordem: a branch no GitHub (`gh api .../branches/<antiga>/rename`), `git fetch --prune`, `git branch -m`, o upstream e, só na principal, o `origin/HEAD`. Sem `gh`, fora do GitHub ou sem permissão, nada é executado: o aviso mostra os comandos prontos (e os dos outros clones) com o botão **Copiar comandos**. Se um passo falha, a mensagem diz o que já mudou e o que falta, e renomear de novo é seguro. **Desfazer** só devolve o nome anterior à configuração, sem tocar o repositório. Com a IA executando uma história, a mudança é recusada com os números. O pedido fica guardado e a pergunta volta ao reabrir o board. Workflows de CI, regras de proteção e outros clones não são alterados (o aviso diz isso); não há ferramenta nova no MCP.
- **Nova opção `fazai.git.mainBranch`.** Deixa a branch principal fixa em vez de detectada; a tela Git mostra "definida nas configurações" como origem. O diálogo no navegador, os campos na tela Git e o item no Diagnóstico do ambiente vêm na #498.
- **Limpeza de branches e worktrees órfãs (#465).** Na abertura do board e a cada rodada do heartbeat (depois de conferir os merges), o board procura as branches e worktrees que criou e cuja história já terminou ou não existe mais. As **seguras** (sem arquivos alterados, sem commits só delas ou já mescladas na base) são limpas sozinhas: remove a worktree e apaga a branch local; a remota não é tocada. As que **precisam de decisão** (arquivos não commitados, commits só nelas, história desconhecida ou branch em uso por uma worktree) ficam. Em Configurações → Git, a nova seção **Branches e worktrees órfãs** lista cada item com a história, a situação e o veredito, e tem **Limpar** (com confirmação e o aviso do que se perde nos de decisão), **Limpar todas as seguras** e **Verificar de novo**. Com órfãs de decisão, o topo do board mostra o selo **N órfãs**, que abre essa seção.
- **Teste e2e com o Kimi Code (`npm run e2e:kimi`).** Sobe um contêiner Ubuntu limpo, com o board do Faz AI da branch atual pelo `src/cli`, para instalar a CLI `kimi`, fazer o login e percorrer o roteiro `scripts/e2e-kimi/ROTEIRO.md`; `continuar`, `parar` e `remover` como no e2e do Cursor. O roteiro registra o resultado em `docs/decisoes/0540-e2e-real-com-a-cli-kimi.md`.
- **Renomear a principal e a `develop` pelo navegador (#498).** Fora do editor, o mesmo aviso **Renomear** / **Desfazer** vira um diálogo do board, que abre em qualquer tela ao mudar o nome ou ao abrir o board com o repositório ainda no nome antigo. Mostra o que muda e o que não muda e, depois de Renomear, o resultado: passos feitos, o que falta, a mensagem do erro e os comandos prontos (para este clone e para os outros) com **Copiar comando**; na falha parcial, **Renomear de novo**. Fechar o diálogo (botão ou Esc) não envia nada e ele não volta na sessão. A tela Configurações → Git ganha o campo **Branch principal** (vazio = detectada) e o texto que explica a renomeação, e a **Branch de integração** grava ao sair do campo. No editor nada muda: quem pergunta é o aviso do editor.
- **Diagnóstico do ambiente: Nome da branch principal/develop (#498).** Novo item, em recomendações (não bloqueia o trabalho com a IA), fica pendente enquanto houver renomeação à espera de resposta, com o comando `git branch -m <antiga> <nova>` para este clone e o botão **Abrir a tela Git**.

### Alterado

- **Release do repositório no gitflow (#481).** `npm run release` parte da `develop` (cria `release/vX.Y.Z`) ou de uma `hotfix/...` (commit da versão na própria branch, reaproveitando o PR aberto) e recusa outras branches; a opção `--allow-branch` saiu. O PR para a principal entra com merge commit, sem apagar a branch; a tag sai sobre `origin/main` sem trocar de branch; a principal volta para a `develop` por PR com merge commit. `finish` é retomável: cada passo confere se já foi feito.

### Corrigido

- **Retomar o modo autônomo numa janela que não é a dona do board agora avisa.** Quando o board da pasta está sendo atendido em outro lugar (outra janela do editor ou o comando `faz-ai` no terminal), o botão de retomar parecia não fazer nada. Agora ele mostra um aviso dizendo onde o modo autônomo roda, e a barra de atividade guarda o motivo.
- **Limite de uso esgotado não bloqueia mais o card (#551).** Quando o plano da ferramenta atinge o limite (renova a cada 5 h), o card volta para a IA com um aviso na conversa, e o heartbeat testa uma história por rodada até o limite voltar, sem bloquear tudo.
- **Menu da coluna acomoda o item da lixeira (#530).** O item **Mandar selecionados para a lixeira** do menu ⋯ da coluna saía dos limites do menu; agora o menu cresce até caber o item mais largo.

## 0.44.0

### Adicionado

- **`develop` criada quando falta.** Se a `develop` não existe nem local nem no `origin`, o board a cria a partir da principal e a envia com `git push -u origin develop` (sem `origin`, só a cria); se o envio falha, ou se ela existe só na máquina, um aviso na conversa traz o comando para enviá-la à mão. Com o `git fetch` falhando, ou sem saber qual é a principal (sem o HEAD do `origin`, `main` nem `master`), o board não cria a `develop` e recusa criar a branch, dizendo o que fazer. O board não apaga, renomeia nem reescreve nenhuma branch nesta entrega.
- **Branch principal detectada sozinha.** Sem rede: o HEAD do `origin`; senão `main` ou `master` (local ou já baixada); senão a branch atual, que não serve para criar a `develop`. A tela Git mostra a principal detectada e de onde veio a detecção.
- **Avisos na conversa da história.** Sem `origin`, fetch que falhou, `develop` criada, `develop` que não pôde ser enviada, `develop` que existe só na máquina e a base de uma branch recriada que não existe mais (ela volta da base do fluxo) viram um comentário do "Faz AI" na história, traduzido na tela quando a interface está em inglês.
- **A IA lê para onde abrir o pull request.** O `get_card` traz em `workspace` a `baseBranch` (de onde a branch partiu), a `prBase` (a base do PR) e a `prNote`, e `prepare_workspace` devolve a `prBase`. A skill, as instruções do MCP, a nota do modo autônomo e o texto padrão da Homologação mandam abrir o PR com `gh pr create --base <prBase>` e dizer, em histórias empilhadas, de qual PR ele depende. Boards com o texto padrão anterior da Homologação recebem o novo pelo **Atualizar board**; o que você personalizou fica como está.
- **Tela Configurações → Git.** Nova seção do gitflow: liga e desliga, mostra a principal detectada, a tabela das branches com os nomes configurados, o tipo de branch de cada tipo de card e o botão para abrir as opções no Settings do editor.
- **Seis opções novas no Settings do editor**, em **Faz AI › Git**: `fazai.git.gitflow`, `fazai.git.developBranch`, `fazai.git.featurePrefix`, `fazai.git.bugfixPrefix`, `fazai.git.hotfixPrefix` e `fazai.git.releasePrefix` (esta só informativa: nenhum tipo de card gera `release/`). Um prefixo ou nome vazio ou que o git não aceita volta ao padrão.
- A limpeza das órfãs e o renomear da principal no `origin` vêm nas próximas entregas.

### Alterado

- **Gitflow nas branches criadas pelo board (#462).** O gitflow vem ligado por padrão (`fazai.git.gitflow`, também em boards que já existem). O tipo de card define o tipo de branch: História e Débito técnico geram `feature/`, Retrabalho gera `bugfix/` e Bug gera `hotfix/`. `feature/` e `bugfix/` partem da `develop`; `hotfix/` parte da branch principal; qualquer tipo de card novo ou sem tipo de branch parte da `develop` como feature. Na pilha do modo autônomo e nas histórias derivadas, a base continua sendo a branch da história anterior. Desligado, toda branch parte da principal, como antes.
- **Nome da branch com `{fluxo}`.** O padrão passou a ser `{fluxo}{numero}-{titulo}` (ex.: `feature/12-login-com-google`). `{fluxo}` recebe o prefixo do tipo de branch (com o gitflow desligado, `<tipo>/`). O padrão de fábrica antigo, `{tipo}/{numero}-{titulo}`, é convertido para o novo ao ler a configuração; qualquer outro padrão fica como você escreveu. As branches já criadas não mudam.
- **A branch nasce do que está no `origin`.** Antes de criar uma branch de história, o board roda `git fetch origin` (limite de 20 s, sem pedir senha) e cria a branch a partir de `origin/<base>`, com `--no-track`, para um `git push` não ir para a `develop` nem para a principal. Enquanto o fetch roda, o editor espera até 20 s. Sem `origin`, ou com o fetch falhando, a branch parte das refs locais (com o fetch falhando, só se a base já está nesta máquina).
- **Conclusão limpa da história no gitflow (#464).** Com o gitflow ligado, ao concluir uma história mesclada (merge feito pelo board ou detectado) o board remove a worktree, apaga a branch local (mesmo com squash) e a remota (se o GitHub já a apagou, não é erro) e atualiza a `develop` local só por fast-forward, sem trocar a branch da pasta do projeto. Nada é apagado quando há mudanças não commitadas, commits fora do PR, a branch aberta na pasta do projeto ou uma remota que recebeu commits depois do PR; o card é concluído do mesmo jeito e a conversa traz um comentário com o resultado e o comando para fazer à mão. Com o gitflow desligado nada muda: só a worktree é removida. Não há opção para desligar a limpeza.
- **Pilha e hotfix na conclusão da história (#480).** Uma história empilhada sobre a concluída passa a ter a `develop` como base, e o PR dela também, antes de a branch remota ser apagada (se a troca falha, a remota fica). O PR para a branch principal entra com merge commit. Depois de um hotfix, o board abre e mescla o PR `main → develop`; com conflito, o PR fica aberto e a conversa avisa.

## 0.43.0

### Adicionado

- **Toda ação demorada mostra que está trabalhando.** A interface não tinha espera visível: clicar em algo que leva segundos dava a sensação de travamento. Agora **criar a branch da história**, **recriar** e **atualizar o board**, **importar um backup**, **esvaziar a lixeira**, **reler o harness** (que passa a esperar também a lista de plugins da CLI), **importar artefatos**, **procurar e instalar skills**, desativar ou desinstalar **plugins**, **recriar os agentes padrão**, **instalar o MCP e a skill do fluxo**, **enviar ao board** e definir o modo em massa, **trocar a ferramenta de IA**, **anexar arquivos** (um "Enviando…" por arquivo), **mover e concluir cards em lote**, **detectar modelos**, recriar as **regras de Esforço** e os botões de correção do aviso de requisitos mostram a espera: no próprio botão, num status na seção que vai mudar ou, para o que troca o board inteiro, num véu sobre a tela. A primeira carga do board, das **Métricas** e da aba **Consumo** mostra a forma da tela (esqueleto) em vez de um texto solto. **Correção:** **Verificar de novo** e o **Diagnóstico do ambiente** não ficam mais presos em "Conferindo…" quando a conferência falha; o erro aparece na tela e o botão volta. A falha de uma tarefa em segundo plano do host passa a chegar à interface como erro, não só ao log. Por baixo, a interface ganhou um protocolo de confirmação por ação (`requestId` na mensagem, `done` na resposta), que é o padrão para qualquer ação nova ([DESIGN.md](DESIGN.md), "Estados de espera").

### Alterado

- **Harness de IA: o escopo vem antes do assunto.** Em Configurações → Harness de IA, dentro da aba da ferramenta, o seletor **Board | Projeto | Global | Importados** e a busca sobem para cima das abas de assunto e valem para todas elas: você escolhe onde olhar uma vez e passeia por Regras, Skills, Sub-agentes, MCPs, Comandos, Hooks e Demais sem o seletor voltar para Projeto nem a busca se perder. As abas de assunto são as mesmas, na mesma ordem; no Board, os assuntos sem marcação (Comandos, Hooks, Demais) dizem que não entram no board. O título de cada aba conta o que há no escopo escolhido ("3 no board" no Board; o número de artefatos no catálogo). O atalho da pendência **nenhum agente do board** (Diagnóstico e Ferramenta e execução) leva a Board → Sub-agentes. Registro: adendo em [docs/decisoes/revisao-do-harness-por-ferramenta.md](docs/decisoes/revisao-do-harness-por-ferramenta.md).
- **Botões do Harness com tamanho, espaço e dica.** Em Configurações → Harness de IA, os botões de ação (Reler pastas, Importar artefatos, Novo agente, Criar agente com ajuda, Sugerir agentes com IA, Indicar artefatos, Buscar skills para instalar, Enviar para o board, os de plugins e de instalação do MCP e da skill…) estavam pequenos e colados, e a explicação de cada um era só o `title` nativo, que não aparece pelo teclado nem no toque. Agora toda ação de toolbar é um `ActionButton`: tamanho normal, folga entre os botões, um separador entre o grupo de criação e o de IA, e um **hint** que diz o que o clique faz, aberto ao passar o mouse ou ao focar; desabilitado, o hint diz **por quê** (a IA ainda está respondendo, marque pelo menos uma skill…). O mesmo vale para as toolbars de Modelos de IA e de Backup. Regra nova no [DESIGN.md](DESIGN.md) ("Componentes").

## 0.42.0

### Adicionado

- **Harness mais claro de usar.** A tela de Harness de IA abre com o aviso **Como usar o Harness**: para que a área serve, por que o board trabalha com contexto vazio e por onde começar (Indicar artefatos, criar um agente com ajuda, revisar as regras desligadas), com **Entendi, não mostrar de novo**; o botão **Como funciona** no cabeçalho traz o aviso de volta. As abas de assunto da ferramenta do projeto passam a dizer no título quantos artefatos estão no board e, nas regras, quantas esperam revisão. A origem Board de um assunto vazio explica o próximo passo e leva direto a Projeto ou Global.

## 0.41.0

### Adicionado

- **O harness vira uma pendência do Diagnóstico (5/5).** O Diagnóstico do ambiente ganha o item **Definição do harness**, dentro do bloco da ferramenta do projeto, logo depois da skill do fluxo, com um filho por falta: nenhuma skill, agente ou servidor MCP em modo Pelo card, nenhum agente do board, regras enviadas e ainda desligadas, artefato que sumiu da origem e, no Cursor, artefatos do projeto que entram no contexto sem passar pelo board. É recomendação, não bloqueio: não pesa no estado do bloco da ferramenta, e no aviso do topo do board aparece como a linha discreta de recomendação, com o atalho para o Harness de IA. Pulado enquanto a CLI da ferramenta não está instalada.
- **Indicar artefatos e planejamento só do board (3/5).** Cada assunto da ferramenta do projeto (origens Projeto, Global e Importados) ganha o botão **Indicar artefatos**: a IA lê o projeto e o catálogo daquele assunto (só o que ainda não está no board), devolve poucos artefatos com o motivo de cada um, e a tela os deixa pré-selecionados com o selo **indicado**, para você conferir e usar "Enviar para o board". A execução é só de leitura, roda pela ferramenta do chat sem entrar na conversa, e nada entra no board sem a sua confirmação; **Descartar indicação** limpa a pré-seleção. A skill do fluxo (no Plan) e o `get_card` passam a mandar o planejamento escolher skills, rules, servidores MCP e agente **só entre o que está no board em modo Pelo card**, no mínimo: uma skill por assunto e só os servidores de que a tarefa precisa, na história e em cada sub-tarefa.

### Alterado

- **Banco de artefatos do board (1/5): modos, servidores MCP no board, regras desligadas e pastas importadas.** Primeira parte da revisão do Harness ([docs/decisoes/revisao-do-harness-por-ferramenta.md](docs/decisoes/revisao-do-harness-por-ferramenta.md)). A marcação do Harness vira o **banco de artefatos do board**: cada rule, skill e, agora, **servidor MCP** enviado ao board tem um **modo**: **Sempre** (entra em toda execução, independente do card), **Pelo card** (só quando o card o lista, pela escolha do planejamento, do Refinar com IA ou sua) ou, nas regras, **Desligado**. **Regras entram desligadas**: um `CLAUDE.md` escrito para outro contexto pode conflitar com o fluxo e as definições do board, e a tela convida a revisar antes de ativar. O board **referencia** o artefato pelo caminho de origem (não copia): uma mudança no arquivo vale no board, e uma origem apagada deixa o artefato **ausente**, sem quebrar os cards. Os cards ganham o campo **MCPs** (os servidores do board em modo Pelo card), e a execução no Claude Code recebe no arquivo de servidores o do board, os do agente, os do campo e os em modo Sempre; um servidor MCP é identificado pelo arquivo mais o nome. O catálogo do **Refinar com IA** passa a listar os servidores, avisa o que já vai sempre e pede o mínimo: no máximo uma skill por assunto. **Pastas importadas**: o board aceita importar pastas de fora do projeto e da pasta global, varre o que a ferramenta reconhece num projeto (regras, skills, agentes, comandos, hooks, servidores MCP, configurações, ou a própria pasta como pasta de skills) e lista com a origem **Importados**; nada entra no board sem você enviar, e tirar a pasta tira os artefatos dela do board. Pelo MCP, `set_harness_selection` aceita `kind: "mcp"` e `usage: "off"`, e `get_harness` traz o escopo `imported`. Banco: formato 30 (a marcação aceita os tipos e modos novos; tabela de pastas importadas; campo MCPs nos boards existentes). A tela por ferramenta e por assunto, com busca, "Importar artefatos" e "Indicar artefatos", vem nas partes seguintes.
- **Editor de agentes por ferramenta e assistentes de criação (4/5).** Quarta parte da revisão do Harness ([docs/decisoes/revisao-do-harness-por-ferramenta.md](docs/decisoes/revisao-do-harness-por-ferramenta.md)). O editor de agentes passa a mostrar só o que a ferramenta do agente aceita (documentação oficial lida em 2026-10-14). No **Claude Code**, as ferramentas disponíveis e as negadas deixam de ser texto livre e viram **listas marcáveis** por grupo de escopo (leitura, edição de arquivos, comandos, rede, outros agentes e outras), com o aviso **amplia o escopo** nos grupos que dão mais poder ao agente; as ferramentas que o Claude Code sempre tira de um subagente não são oferecidas. Nomes que o arquivo já tem e a lista não conhece (como `mcp__github__*`) aparecem como chips marcados que dá para tirar, e dá para acrescentar um servidor MCP do board como `mcp__<nome>__*`. No **Cursor**, que não tem lista de ferramentas, skills nem MCP por subagente, o editor mostra só **Somente leitura** (`readonly: true`) e **Em segundo plano** (`is_background: true`), que o arquivo do agente passa a ler e gravar. Um agente criado para uma ferramenta fica na pasta dela e só aparece na aba dela. **Criar agente com ajuda** é um assistente de sete passos (diretriz, ferramentas, servidores MCP, skills, modelo e esforço, instruções, resumo), cada um com exemplo de resposta e sugestão sem esconder as opções: o conjunto mínimo de ferramentas pela diretriz, o menor modelo com esforço baixo para ler e revisar, um maior para planejar e implementar, um rascunho de instruções para editar; nada é gravado antes do resumo. As **Sugestões prontas** (revisor somente leitura, escritor de testes, redator de documentação, executor de migrações) abrem o assistente já preenchido. Nos assuntos Regras e Skills, **Criar regra com ajuda** (onde vale, o que garante, convenções que o board lê do projeto sem IA, conferência contra o fluxo do board, rascunho; a regra entra no board **desligada**) e **Criar skill com ajuda** (tarefa, gatilho, passo a passo, limites, arquivos de apoio, `SKILL.md`; a skill entra em **Pelo card**), e os botões **Sugerir regras com IA** e **Sugerir skills com IA**, que pedem de 3 a 5 itens à IA pelo chat do board. Pelo MCP, `create_agent` e `update_agent` aceitam `readonly` e `background` (Cursor).
- **Tela do Harness por ferramenta e por assunto (2/5).** Segunda parte da revisão do Harness ([docs/decisoes/revisao-do-harness-por-ferramenta.md](docs/decisoes/revisao-do-harness-por-ferramenta.md)). Em Configurações → Harness de IA, as abas **Projeto** e **Global** dão lugar a **uma aba por ferramenta** (Claude Code e Cursor, a do projeto primeiro, com o selo "ferramenta deste projeto"); o seletor de ferramenta de dentro da tela some. Dentro da ferramenta, **uma aba por assunto**: Regras (principais e por assunto juntas), Skills, Sub-agentes, MCPs, Comandos, Hooks e Demais (memória, configurações e permissões, estilos de saída, plugins e organização), só os que a ferramenta tem, e só o assunto à vista é montado, o que deixa a tela leve com muitos artefatos. Em cada assunto, a **origem**: **Board**, **Projeto**, **Global** e, com pasta importada, **Importados**. Projeto, Global e Importados são o catálogo; **Board** lista o que foi enviado, com o seletor de modo (Sempre, Pelo card, Desligado), a origem, o botão **Remover do board** e o selo **ausente** para a origem que sumiu; nas regras, um aviso convida a revisar o texto antes de ativar. Cada assunto ganha **busca** por parte do nome ou da descrição (catálogo e Board). Na seleção múltipla, a ação principal é **Enviar para o board** (cada tipo entra no seu modo: as regras, desligadas), além de definir o modo e **Remover do board**. O botão **Importar artefatos** (seletor de pasta no editor; campo de caminho no navegador) e, em Importados, a lista das pastas com **Remover pasta** (com confirmação: os artefatos dela saem do board). A aba do **Cursor** ganha um aviso fixo: a linha de comando dele não desliga artefatos, então o "tudo desligado" depende de você desligar nas configurações dele ou remover do projeto o que não quer no contexto. No card, o resumo do agente mostra também o que está em modo **Sempre**, marcado "(sempre)". Os valores antigos das abas Projeto e Global caem na aba da ferramenta do projeto.

## 0.40.0

### Adicionado

- **Fila do modo autônomo visível no card.** Com o modo autônomo ligado, cada história que espera a vez mostra o selo **Fila N** (1 = a próxima). O número só existe enquanto ela espera: some quando a IA começa nela, quando ela passa para você (bloqueada, aguardando resposta) e quando ela é concluída; pausar o modo apaga todos. A ordem respeita as precedências: uma história que depende de outra da fila (vínculo "depende de", inclusive por uma sub-tarefa) ou derivada dela vem depois, por mais acima que esteja no board; o autopiloto segue a mesma ordem.
- **Ligar o modo autônomo pelo board.** O botão do topo passou a existir sempre que há história em aberto: sem nenhuma no modo, **Ligar modo autônomo** põe no modo, depois da confirmação com o "Até onde", todas as histórias ainda não concluídas, que entram na fila e são tocadas cada uma na sua vez, respeitando os tetos de execuções em paralelo. Com histórias selecionadas, a ação vale só para elas. **Retomar modo autônomo**, com histórias em aberto ainda fora do modo, também as põe no modo (com a mesma confirmação) antes de retomar; com todas já no modo, retoma direto.
- **Caixa de selecionar todos no cabeçalho da coluna.** As colunas de histórias ganharam uma caixa ao lado da contagem que marca todas as histórias visíveis da coluna (o filtro ativo vale); marcada de novo, limpa a seleção; com parte marcada, fica indeterminada. O item **Selecionar todos** do menu ⋯ continua.

### Alterado

- **Aprovar chama a IA na hora (#475).** Aprovar uma história agora inicia a IA imediatamente, respeitando os tetos de execuções em paralelo, sem esperar a próxima rodada do heartbeat e mesmo com ele desligado.

### Corrigido

- **Cards presos em "Em execução" voltam para a IA.** Um card ficava "Em execução" para sempre quando a sessão que o marcou acabava sem passar a vez: a janela do editor fechada com a IA rodando, a sub-tarefa marcada por `start_work` numa sessão da história que terminou, ou uma sessão fora do board que caiu. O autopiloto e o heartbeat pulavam a história (achavam que ela estava rodando) e nada mais acontecia. Agora: ao abrir o board, os cards das execuções que a sessão anterior deixou abertas voltam para Pronto na hora (e as sub-tarefas delas junto); ao terminar a sessão de uma história, as sub-tarefas que ela deixou "Em execução" voltam para Pronto; e, a cada minuto, um card "Em execução" sem nenhuma execução do board há mais tempo que o limite de uma execução (Configurações → Harness de IA → tempo máximo) volta para Pronto, com a explicação na conversa. O autopiloto também deixou de devolver para Pronto, a cada mudança do board, a sub-tarefa que a sessão viva da história tinha acabado de marcar.

## 0.39.0

### Adicionado

- **Seção "Perguntas para você" nos documentos das fases (#441).** Os modelos do Discovery, do PRD, da Spec e do Plan ganham no fim a seção **❓ Perguntas para você**, em destaque: cada pergunta vem com as alternativas e o impacto de cada uma, a **Recomendação** da IA com a justificativa e o espaço **R. >** para a sua resposta. No PRD ela substitui "Questões em aberto". A skill do fluxo manda a IA usar a seção (e repetir as perguntas no pedido de revisão). Boards que ainda têm o modelo padrão anterior recebem o novo pelo **Atualizar board**; o que você personalizou fica como está.
- **Resumo automático da conversa entre as fases do modo autônomo (#441).** Quando uma história em modo autônomo passa para outra coluna e a conversa tem três ou mais mensagens desde o último resumo (com pelo menos uma da IA), o autopiloto roda **Resumir a conversa** antes de trabalhar a fase nova e apaga as mensagens anteriores ao resumo, como o botão **Apagar mensagens resumidas** faz. Assim o contexto de cada execução não carrega a conversa inteira das fases anteriores. É um resumo por coluna; se a IA não gravar o resumo, a conversa fica como está e a fase segue.

### Alterado

- **Aprovar leva o card para a próxima coluna (#441).** Clicar em **Aprovar** numa história levava o card a Aprovado e esperava a IA movê-lo; com frequência ela refazia o trabalho da mesma coluna e pedia a revisão de novo. Agora a aprovação de uma pessoa move a história para a coluna seguinte na hora, com o status recomeçando lá (Pronto, onde a IA atua), e a IA trabalha a fase nova e pede a sua revisão ao terminar. Ficam para a IA só os casos em que o board não pode mover: a aprovação que faz o merge automático (a conclusão é feita depois do merge) e a conclusão recusada por sub-tarefa em aberto, que deixa o card Aprovado com o aviso na conversa. As métricas de retrabalho continuam contando a aprovação.
- **Modo autônomo sem paradas até a coluna escolhida (#441).** No modo autônomo, nada mais segura a história antes da coluna escolhida ao ligar o modo (ou da última coluna da IA, com o pull request): nem uma pendência em `request_review` (`pending`), nem a história ser do núcleo (campo Criticidade). A pendência fica registrada na conversa e a IA é mandada decidir e seguir; as perguntas continuam sendo escritas no documento da fase, com alternativas e recomendação, e a própria IA as responde no espaço de resposta, marcando "(decidido pela IA no modo autônomo)". Na coluna escolhida, o trabalho continua até o fim; só então a IA pede a sua revisão e o modo se desliga. Fora do modo autônomo, a história do núcleo espera a aprovação como qualquer outra. A skill do fluxo, as instruções do servidor MCP, as notas do `get_card` e `request_review` dizem o mesmo. **Mudança de comportamento:** a exceção da história do núcleo no modo autônomo deixou de existir.
- O hint do status Aprovado passa a dizer "O card segue para a próxima coluna".

## 0.38.0

### Adicionado

- **Colar imagem na descrição do card (#440).** Colar uma imagem (ou outro arquivo) na caixa de descrição agora o envia para os anexos do card e insere no texto a referência `![nome](attachment:nome)`, como a conversa já fazia. A descrição em modo leitura e a aba **Visualizar** do editor (inclusive a caixa de mensagem da conversa) mostram a imagem de verdade, em vez de um ícone quebrado. O limite continua 20 MB por arquivo, com o mesmo aviso. A IA recebe a descrição com `attachment:<nome>` e lê o arquivo pelo anexo de mesmo nome em `get_card`, igual às mensagens.

### Alterado

- **"Selecionar todos" e ações em lote no menu da coluna (#436).** O menu ⋯ de uma coluna de histórias ganhou **Selecionar todos**, que marca as histórias da coluna que estão visíveis (o filtro ativo vale: o que ele esconde fica de fora). Com histórias marcadas, o mesmo menu passa a oferecer **Arquivar selecionados**, **Mover selecionados para...**, **Concluir selecionados**, **Mandar selecionados para a lixeira** e **Limpar seleção**; Renomear, Colapsar, "Esta coluna representa", mover e excluir a coluna ficam desabilitados enquanto houver seleção. Cada ação abre um único diálogo de confirmação para o lote inteiro e, ao confirmar, limpa a seleção. Em lote, uma história com sub-tarefa em aberto não é concluída e o resto segue; mover para uma coluna de cancelamento cancela as sub-tarefas em aberto sem perguntar de novo. **Mudança de comportamento:** a seleção múltipla passou a valer para uma coluna por vez; marcar um card de outra coluna substitui a seleção em vez de somar.

### Corrigido

- **Correção: o card "Skill do fluxo" (e o "Servidor do board") não se duplica mais no Harness de IA (#437).** Em Configurações → Harness, abrir e fechar "Buscar skills para instalar" (ou o formulário de novo item ao lado dele) empilhava cópias do card "Skill do fluxo", e o mesmo valia para o "Servidor do board" na seção Servidores MCP. A causa era uma chave de lista repetida entre os painéis da mesma seção; cada painel agora tem a sua, e a tela só remonta ao trocar de ferramenta, como antes.

## 0.37.0

### Adicionado

- **Contexto estimado de cada card.** No rodapé do card, um anel discreto mostra quanto da janela de
  contexto a execução do card ocupa antes de a IA começar; o clique abre o detalhe por grupo
  (servidores MCP, agentes, rules, skills e o próprio card) e por item, como a janela de contexto do
  Claude Code. No Claude Code, o servidor do board conta só os nomes das ferramentas e as instruções,
  e as definições aparecem como sob demanda; os servidores liberados pelo agente aparecem como não
  medidos. É uma estimativa pelo tamanho do texto, para achar o que pesa antes de rodar, e acompanha o
  card: a fase da coluna, a conversa e os documentos entram na próxima execução. Ao abrir, o detalhe
  relê os arquivos do harness e avisa quando algo mudou desde a última leitura.
- **Aba Consumo no card.** O card aberto ganha a aba **Consumo**: a estimativa da próxima execução e o
  que o card já gastou, medido em cada execução, por fase (execuções, tempo, tokens de entrada, saída e
  cache) e no total, com as sub-tarefas de uma história numa linha à parte. O gasto é histórico e só
  cresce; apagar mensagens muda só a estimativa das próximas execuções.

### Alterado

- **Campos do board fora das configurações.** Fase, Tags, Modelo, Skills, Rules, Esforço da atividade
  e Criticidade são usados pelas regras, pela triagem e pela IA, e saíram de Configurações → **Campos
  personalizados** (o novo nome da aba), que agora lista só os campos que você cria. Esses campos não
  se apagam nem se renomeiam, e as opções e os tipos de card deles são mantidos pelo board (as opções
  de Tags continuam suas, pela IA). Um campo novo não pode usar o nome de um deles nem o tipo
  **Modelo de IA**. Um tipo de card novo das histórias entra sozinho na Criticidade, e um das
  sub-tarefas na Fase. No card aberto, os campos personalizados ficam na seção própria, abaixo dos
  campos do board. Pelo MCP, `get_board` marca esses campos com `board: true`, e `update_field`,
  `delete_field` e `create_field` recusam o que quebraria o uso deles.
- **A Fase da sub-tarefa é do board e da IA.** No card aberto ela aparece só para leitura: a pessoa
  não muda nem limpa o valor, e ele não vira padrão do tipo de card. É a Fase que diz a que fase da
  história a sub-tarefa pertence e que segura o avanço da história. A IA continua gravando a Fase ao
  criar a sub-tarefa (`create_card`) e pode corrigi-la com `update_card`.
- **O harness global relido na hora.** Uma skill, um subagente, uma regra, um settings ou um servidor
  MCP da sua pasta de usuário (`~/.claude`, `~/.claude.json`, `~/.cursor`, `~/.agents`) editado por
  fora, no editor, pela IA ou pelo git, aparece no board na hora, e o contexto estimado de cada card
  acompanha, como já acontecia com os arquivos do projeto; o mesmo vale para a memória do projeto e
  para os plugins instalados, ativados ou removidos. Antes, o board só via a mudança quando era aberto
  de novo ou quando a própria tela mexia no harness. São observados só as pastas e os arquivos que a
  aba Global mostra, nunca a home inteira: de `~/.claude/projects`, só a pasta `memory` deste projeto;
  de `~/.claude/plugins`, só o registro dos instalados. Uma skill instalada como link para outra pasta
  também é observada. No modo navegador (`faz-ai`), que relia tudo a cada 15 segundos, passam a ser
  observados os mesmos arquivos globais e, no projeto, as pastas e os arquivos que a aba Projeto
  mostra; a releitura completa fica a cada minuto, para o que um watcher não vê (regras de subpasta,
  sistemas de arquivos de rede).

### Corrigido

- **Instruções do MCP lidas por inteiro no Claude Code.** O Claude Code corta as instruções de cada
  servidor MCP em 2.048 caracteres, e as do board tinham 4.316: toda sessão lia só a primeira metade,
  sem o contexto vazio, as rodadas da Implementação, os testes sem terminal e os documentos das fases.
  As instruções agora cabem no limite, com o ciclo do card no começo, e o resto foi para onde a IA lê
  quando precisa: a descrição de `get_card`, `get_board`, `get_models` e `link_cards`, a nota do
  `model` no `get_card` e a nota nova `subtasksNowNote`, com as rodadas da Implementação. Um teste
  barra instruções ou descrição de ferramenta acima do limite.

## 0.36.0

### Adicionado

- **Registros de decisão no repositório.** A nova opção **Faz AI › Git › Registros de decisão**
  (`fazai.git.decisionRecords`) aponta para uma pasta do repositório; com ela, a Homologação grava ali
  o registro de decisão da história (contexto, decisão, alternativas descartadas, consequências e
  diagramas), a partir da Spec aprovada, e o leva no pull request. Desligada por padrão.
- **Retrabalho no painel de métricas e no `get_metrics`.** O bloco novo **Retrabalho** mostra, por fase,
  as revisões pedidas pela IA, as aprovadas de primeira e os pedidos de ajuste; os pedidos de ajuste
  pelo modelo da execução que pediu a revisão; e quantas histórias concluídas no período já têm um bug
  vinculado. Só conta a resposta de uma pessoa. No MCP, `get_metrics` com `rework: true`.
- **Áreas críticas (núcleo).** Em Configurações → Regras, liste os caminhos do núcleo do projeto, um
  por linha. A IA marca o novo campo **Criticidade** (Núcleo ou Periferia) das histórias na Spec ou no
  Plan, e a história do núcleo espera a sua aprovação nas colunas que exigem aprovação, mesmo no modo
  autônomo; depois de aprovada, segue sozinha. Só uma pessoa tira a história do núcleo, e ligar o modo
  numa história do núcleo que aguarda revisão não a aprova. Na Revisão e no PR, os arquivos do núcleo
  vêm à parte.
  Boards existentes ganham o campo pelo **Atualizar board**; `update_rules` aceita `criticalPaths` e
  `get_card` traz `criticalAreas`.
- **Modo autônomo até uma fase.** Ao ligar o modo autônomo, o aviso traz o seletor **Até onde**, com
  as fases em que a IA atua a partir da coluna atual. O padrão continua sendo ir até o pull request.
  Escolhendo uma fase antes, como o Plan, a IA segue sozinha até ela, faz o trabalho dela, pede a sua
  revisão e o modo se desliga. A barra do card mostra **Modo autônomo até [fase]**, com o seletor para
  trocar; a barra de seleção oferece só as fases que valem para todas as marcadas; o seletor lembra a
  última escolha. Pelo MCP, `get_card` traz `autonomousUntil`, e `card.yolo.set` e `card.yolo.setMany`
  aceitam `until`. As histórias criadas com `autonomous_from` vão até o mesmo ponto da de origem.
- **Nova coluna Revisão, entre a Implementação e a Homologação.** Antes do pull request, a IA roda as
  checagens do projeto e revisa o diff da história com o agente `revisor-de-codigo`, numa sessão
  nova. A revisão procura também o código que só passa no teste (teste que já passava antes, teste
  alterado junto com o código, try/catch que engole erro, cast forçado, acoplamento novo). O que tem
  diretriz clara é corrigido na hora; o que é ambíguo vira pergunta para você. A coluna não pede
  aprovação. Boards existentes recebem a coluna e a opção **Revisão** do campo Fase pelo **Atualizar
  board**.
- **Caminho curto para histórias pequenas.** Uma história criada ou movida direto para uma fase
  adiante, como o Plan, começa dali: o `get_card` lista em `phase.missingArtifacts` os documentos das
  fases anteriores que não existem, e a IA trabalha a partir da descrição e da conversa, sem criá-los.
  Na Implementação, uma história sem sub-tarefas ganha uma a partir da descrição.

### Alterado

- **Revisor de código com roteiro novo.** O agente de fábrica `revisor-de-codigo` passa a classificar
  cada achado (bloqueia ou sugestão; correção clara ou ambígua), a procurar o código que só passa no
  teste e a ser breve: todos os que bloqueiam e no máximo três sugestões. Vale para os agentes
  criados a partir de agora; o que você já tem não muda.
- **Spec com o desenho do programa.** O modelo da Spec ganha a seção **Desenho do programa**: os
  tipos e as assinaturas novos ou alterados, o arquivo de cada um e quem chama quem, com o fluxo da
  funcionalidade em diagramas Mermaid. As alternativas descartadas passam a vir com o motivo.
- **Plan com partes fáceis de revisar e histórias derivadas.** Cada passo do plano é uma parte
  inteligível e verificável sozinha (recortar por camada vale), e o plano estima as linhas de código
  da entrega. Acima de umas 400, a IA cria as próximas partes como histórias derivadas, em ordem, com
  o novo parâmetro `derived_from` do `create_card` apontando para a parte anterior: a branch da
  derivada parte da branch da anterior e o pull request dela é empilhado sobre o da anterior, também
  fora do modo autônomo. O card mostra **Derivada de #N**.
- **Pull request que explica a entrega.** O corpo do PR da Homologação passa a ter **Objetivo**,
  **O que foi feito**, **Como revisar** (por onde começar, a ordem dos commits e o tamanho do diff),
  **Decisões** (o caminho escolhido, as alternativas descartadas e os desvios do plano) e o roteiro
  **Como testar**.
- **Modo autônomo pelos padrões do projeto.** No modo autônomo, a IA segue os padrões e as regras de
  arquitetura do projeto e, entre os caminhos que os seguem, escolhe o menos complexo.
- **Atualizar board** troca os textos das fases PRD, Spec, Plan, Implementação e Homologação que ainda
  estão no padrão anterior; os personalizados ficam. Reinstale a skill do fluxo (substituindo) para ela
  acompanhar.

## 0.35.0

### Adicionado

- **O que as regras puxam.** Nas instruções do Claude Code, o Harness mostra os arquivos importados
  com `@caminho` (fora de código, até quatro níveis, como o Claude Code faz), e cada um abre no editor
  do board. Os `CLAUDE.md`, `CLAUDE.local.md` e `AGENTS.md` de subpastas, que a ferramenta lê quando
  mexe nelas, entram em Regras principais com o selo "sob demanda"; a busca ignora pastas ocultas e
  de dependências.
- **Nova aba Global no Harness de IA.** O mesmo modelo da aba Projeto para o que vale em todos os
  seus projetos: os grupos da pasta do usuário, os **Plugins** instalados (um bloco por plugin, com o
  que cada um traz) e a **Organização**, com a política gerenciada da empresa, só para leitura. No
  Cursor, o que não fica em arquivo (User Rules, Team Rules e a lista global de ignorados) aparece como
  aviso no grupo certo.
- **Nova aba Projeto no Harness de IA.** Tudo que a ferramenta lê na pasta do projeto, em grupos:
  regras principais, regras por assunto, memória, skills, subagentes, comandos, hooks, servidores
  MCP, configurações e permissões, e estilos de saída. Cada item diz o que é numa frase, mostra se é
  sempre carregado ou sob demanda e traz o caminho, que abre o arquivo no editor do board. Os arquivos
  que a ferramenta leria e ainda não existem aparecem com o botão de criar e a frase de cada um, e o
  arquivo novo já abre no editor. Em Regras principais, o board oferece o `CLAUDE.md`, o
  `CLAUDE.local.md` e, só quando o projeto não tem `CLAUDE.md`, o `AGENTS.md`. Se o projeto tem os
  dois, o `AGENTS.md` aparece como não lido pelo Claude Code, com o `@import` que faz ele entrar; se
  tem só o `AGENTS.md`, o board avisa que criar um `CLAUDE.md` faz o Claude Code parar de lê-lo. Um seletor mostra o que o Claude Code ou o Cursor carregam. Nas
  rules e skills, o uso nas execuções do board vira uma escolha na própria linha.
- **Recarregar a janela pelo Diagnóstico do ambiente.** Ao lado de **Verificar de novo**, no editor,
  o botão reinicia a extensão, o que faz valer uma versão recém-instalada. Com a IA trabalhando em
  algum card, pergunta antes, porque a execução para.
- **Ações em massa no Harness.** Cada grupo das abas Projeto e Global tem caixas de seleção, e a do
  topo marca todos. A barra mostra só as ações que valem para o que foi marcado: uso nas execuções do
  board, modo da skill, copiar para o projeto ou o global, apagar arquivos e remover entradas de
  hook, permissão e MCP. Apagar e remover pedem confirmação.
- **O harness completo de cada ferramenta.** O board passa a encontrar também o `AGENTS.md` (e o
  `.claude/AGENTS.md`), que o Claude Code lê quando o projeto não tem `CLAUDE.md`; a memória automática
  do Claude Code deste projeto (`~/.claude/projects/<projeto>/memory/`); a política da organização (o
  `CLAUDE.md` e o `managed-settings.json` da pasta do sistema, só leitura); o `.cursorignore` e os
  comandos da pasta do usuário do Cursor. Cada lugar do catálogo ganhou um grupo e uma frase simples
  dizendo o que é, e o `get_harness` devolve o grupo de cada item.
- **Arquivos do harness abrem no board.** Clicar no caminho de uma rule, skill, agente, comando ou
  arquivo de configuração no Harness de IA abre o arquivo numa janela do próprio board, no mesmo
  modelo dos anexos: Markdown formatado ou código, edição com salvar e cancelar, e o botão **Abrir no
  editor** para quem preferir o editor. JSON inválido não é gravado, e o que vem de plugin e o
  `~/.claude.json` abrem só para leitura.
- **A outra ferramenta de IA aparece em Opcionais.** Num projeto com o Claude Code, o Cursor
  encontrado na máquina aparece com a linha de comando, o login, o MCP do board, a skill e o nível de
  permissão dele, e vice-versa.
- **Node.js 22 ou mais novo.** O Diagnóstico confere a versão do Node.js e mostra falta abaixo da 22,
  a versão que o Claude Code pede e a LTS mais antiga ainda com suporte.

### Alterado

- **Diagnóstico do ambiente vira uma lista de conferência, sem instalador.** O **Instalar tudo**
  saiu: o board não instala mais nada de terceiros, só o próprio MCP e a skill do fluxo. A tela agora
  tem três listas, **Necessários**, **Opcionais** e **Recomendados**, com um ícone de pronto ou de
  falta em cada item e o que depende de outro item aninhado dentro dele. Cada programa traz o site
  oficial entre parênteses e, enquanto falta, o comando de instalação oficial para copiar (`curl` no
  Linux e no macOS, PowerShell no Windows). O Code Review Graph aparece dentro do uv, que o instala e
  baixa o Python quando falta. Os logins e as ações na pasta do projeto (`git init`, o build do grafo do
  Code Review Graph, o MCP dele e a busca semântica) trazem o comando com botão de copiar. O hint de
  cada linha explica como o board usa o item.
- **Botões do Diagnóstico com mais destaque.** A ação que resolve um item (instalar a skill, corrigir o
  registro, abrir no terminal) é o botão azul principal; o **Copiar comando** ganhou contorno e os
  botões da tela saíram do tamanho pequeno. No topo, **Ir para o board** é o principal e **Verificar de
  novo** deixou de ser um botão discreto.
- **Plugins: desativar, ativar e desinstalar em massa, e só os instalados de verdade.** A lista de
  plugins do Claude Code passa a vir de `claude plugin list --json`. Antes o board mostrava também os
  do catálogo dos marketplaces (`~/.claude/plugins/marketplaces`), que estão disponíveis mas não
  instalados. Cada plugin ganha caixa de seleção, e a barra desativa, ativa ou desinstala os
  marcados pela própria CLI. Os sincronizados do claude.ai e os da organização só se desativam. No
  Cursor, desinstalar tira a pasta de `~/.cursor/plugins/local`. Desinstalar pede confirmação.
- **A detecção de merges acontece no heartbeat.** Saíram do Git a opção **Concluir a história
  quando o pull request for mergeado** e o intervalo próprio dela (15 minutos), com as chaves
  `fazai.git.watchMerges` e `fazai.git.watchMergeMinutes` do Settings do editor. Agora cada rodada do
  heartbeat confere o pull request das histórias entregues e conclui a que foi mergeada, e o
  **Rodar o heartbeat agora** também confere na hora. O arquivamento das histórias publicadas vem
  junto, na mesma rodada. Com o heartbeat desligado, a conferência só acontece quando você pede uma
  rodada.
- **Novos padrões no Harness.** O tempo limite de execução passa a ser de 45 minutos (era 30) e o
  intervalo do heartbeat de 10 minutos (era 60). Boards que já salvaram outros valores continuam com
  eles.
- **Aviso compacto no lugar da faixa amarela.** O que falta para o board trabalhar com a IA não ocupa
  mais o topo do board: a aba **Configurações** e o botão **Verificar ambiente** ganham um ícone de
  atenção, e o hint dele resume o que falta. O ícone fica vermelho quando o motivo é login. No painel
  de chat, que não tem as Configurações, a faixa continua.

### Removido

- **Sai a aba "Tudo que a ferramenta carrega".** O que ela mostrava agora está nas abas Projeto e
  Global, em grupos e com a frase de cada item; os formulários de servidor MCP, hook, regra de
  permissão e a busca de skills foram junto. O aviso de MCP não
  registrado leva para a aba Projeto.

### Corrigido

- **Editor do harness não fica carregando para sempre.** Se o board não responde à leitura do
  arquivo em 8 segundos, a modal para de carregar e diz o que fazer: quando o pacote da extensão é
  reinstalado sem recarregar a janela, a tela nova conversa com o host antigo, que não conhece o
  pedido. Basta recarregar a janela (Developer: Reload Window).
- **Harness sem tremer ao escolher uma opção.** O seletor de uso nas execuções e o do modo da skill
  ficam com a largura da opção mais longa: trocar o valor não faz mais o texto ao lado quebrar de
  outro jeito e empurrar a tela. Num painel estreito, os botões de cada linha ocupam no máximo metade
  dela e quebram em mais linhas, em vez de espremer a descrição até sumir.
- **Avisos em âmbar de verdade.** Os avisos das telas de Git, de execução e do Harness pediam uma
  cor que o board não carregava e apareciam sem cor; agora usam o âmbar da paleta.
- **Login do Claude Code com `claude auth login`.** O aviso de login sugeria `claude login`, que a
  documentação atual do Claude Code não traz.

## 0.34.1

### Corrigido

- **Board gravado por uma versão mais nova não abre pela metade.** Ao voltar para uma versão
  anterior da extensão (por exemplo, a da loja depois de testar uma versão nova), o board antes
  falhava com "FOREIGN KEY constraint failed". Agora a extensão recusa abrir antes de tocar no banco
  e explica: o board foi gravado por uma versão mais nova, atualize a extensão.
- **Erro ao abrir o board fica explicado e não trava a janela.** Quando o banco recusa uma gravação
  (como "FOREIGN KEY constraint failed"), a mensagem passa a dizer qual comando falhou, e o erro
  completo vai para **Saída → Faz AI**. Abrir o board de novo tenta outra vez, sem precisar recarregar
  a janela. A manutenção feita na abertura (fechar execuções que ficaram abertas e consolidar o log de
  uso) não impede mais o board de abrir: se falhar, o motivo vai para o log.

## 0.34.0

### Adicionado

- **Login vencido: aviso de erro no board, em vez de parar sem explicação (#189).** O login do
  Claude Code passa a ser conferido de verdade (`claude auth status`), além do Cursor já existente;
  antes de cada chamada da IA (botão do card, heartbeat, modo autônomo), o board confere de novo, com
  um cache curto. Quando o motivo da faixa amarela é login, ela ganha destaque de erro e o botão
  **Abrir no terminal**, que roda o comando ali, mas o login em si continua sendo sempre feito por
  você. Quando o login vence no meio de uma execução, a primeira falha com um padrão conhecido
  ("OAuth session expired", "not logged in", "401" etc.) não bloqueia mais o card: ele volta ao
  status anterior, com um comentário curto, e liga o mesmo aviso de erro. O heartbeat e o modo
  autônomo param de tentar sozinhos enquanto ele estiver ligado, sem desligar, e retomam quando o
  login é confirmado de novo. O Diagnóstico do ambiente mostra o mesmo item.
- **Ligar e desligar o modo autônomo direto do cartão, sem abrir o card (#416).** O ícone no rodapé do cartão que já indicava "modo autônomo ligado" agora é também um botão: um clique liga ou desliga o modo autônomo sem precisar abrir o detalhe da história. O aviso mostrado ao ligar ficou mais curto — era um parágrafo longo com vários detalhes operacionais, agora é só o essencial: a IA toca a história sozinha até o pull request, sem aprovação, pergunta ou confirmação, e como parar. Esse mesmo texto e diálogo são usados nos três pontos que ligam o modo autônomo (o botão novo do cartão, o toggle do detalhe do card e a ação em lote de seleção múltipla), com a lógica de confirmação unificada entre eles. O diálogo ganhou um checkbox "Não avisar novamente": quem marcar e confirmar deixa de ver esse aviso nas próximas vezes, nos três pontos, como preferência pessoal guardada no navegador ou editor de quem usa (não no board). Desligar o modo autônomo em lote continua sempre pedindo confirmação, sem o checkbox, por ser a ação mais arriscada.
- **Modelo reserva numa regra de sugestão: a execução repete automaticamente quando o principal esgota o limite.** Cada regra de sugestão de modelo (Configurações → Modelos de IA) agora tem um campo **Reserva (opcional)**. Quando a execução de um card falha porque o modelo principal de uma regra esgotou o limite de uso do plano, o sistema repete automaticamente a execução com o modelo reserva, uma única vez. Se o reserva também falhar, ou se não houver reserva configurada, o card é bloqueado como antes. A troca automática registra um comentário na conversa do card ("O `<modelo principal>` esgotou o limite; a execução segue com `<modelo reserva>`"), sem alterar o campo Modelo do card — a próxima execução tenta o principal de novo. Em modo autônomo (YOLO), a fila segue adiante sem travar quando o principal esgota o limite e há reserva configurada.
- **Cards podem ser colapsados para mostrar só a faixa e o título.** Em colunas com muitos cards, você pode colapsar cards em qualquer um de quatro escopos: um card isolado (botão no card), todos os cards da coluna (item no menu de ações), todos os cards do board (botão na barra de filtros) ou só os cards selecionados (botão na barra de seleção múltipla). Um card colapsado continua mostrando o LED de atividade da IA e a borda de status para você saber o que precisa de atenção sem expandir. O estado fica lembrado entre sessões.
- **Barra de atividade no pé do board.** Uma linha sempre visível, em qualquer vista, mostra o que
  a IA está fazendo agora: com uma execução, "IA em #12 (Discovery, há 3 min)"; com várias, "IA em
  N cards: #12 Discovery · #15 refinando · …" (lista completa no tooltip). Clicar na referência do
  card abre o card. Sem nenhuma execução, mostra o motivo: a nota do autopiloto (por que a fila
  parou), o estado do heartbeat ("Heartbeat desligado", "Heartbeat parado: motivo", "Próxima
  rodada às HH:MM") ou "IA parada". O contador "IA trabalhando em N cards" do topo saiu,
  substituído por essa barra.
- **Resumir a conversa do card.** Um botão novo na aba Conversa, a partir de 2 mensagens, lê a
  conversa inteira e grava um resumo (Decisões, Observações, Pendências) como uma mensagem nova da
  IA, sem apagar nada automaticamente. O resumo se revisa como qualquer mensagem: concorde deixando
  como está ou edite o texto. Depois dele aparece uma recomendação para apagar, com confirmação, as
  mensagens anteriores ao resumo (não é automático); resumir de novo cria um registro novo, sem
  substituir o anterior. Também disponível como ferramenta MCP (`generate_summary`).
- **Backup pela paleta de comandos.** No editor, os comandos `fazai.exportBoard` ("Faz AI: Exportar
  o board") e `fazai.importBoard` ("Faz AI: Importar um board") na paleta de comandos (`Ctrl+Shift+P`)
  abrem diálogos nativos de salvamento e abertura de arquivo, funcionam com o board fechado (abrem o
  banco sob demanda) e mostram notificações com o resultado. A aba "Backup" das Configurações do board
  deixou de aparecer no editor — continua só no modo navegador. No Settings nativo (`Ctrl+,`), a
  categoria "Faz AI: Backup" ganhou os links "Exportar o board agora" e "Importar um board" que
  disparam os comandos. Com múltiplas pastas no workspace, os comandos usam a primeira pasta
  (limitação conhecida).
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
- **Anexos em Markdown abrem formatados.** Um anexo `.md`/`.markdown` (como o PRD, o Spec ou o Plan
  de uma história) agora abre com títulos, listas, tabelas e blocos de código já formatados, em vez
  do texto cru com `#`, `**` e `|---|`. Um seletor **Formatado** / **Código** no cabeçalho da janela
  alterna para o texto cru quando é preciso; Editar, Salvar e Copiar conteúdo continuam operando
  sobre o Markdown, como antes. Imagens, JSON, texto puro e os tipos sem pré-visualização não mudam.
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
- **Caminho completo dos MCPs no editor.** O chat do editor não acha o que foi instalado depois que ele
  abriu (o Node pelo `nvm`, o `uvx`): o board grava o caminho completo nos registros do `faz-ai` e do
  `code-review-graph`, fora do git, e a faixa amarela avisa quando falta. A lista abre sozinha na
  primeira abertura do board na máquina e, depois, por **Verificar ambiente** nas Configurações ou
  por **Ver o diagnóstico completo** na faixa amarela.
- **Avisos de dependência entre configurações e links cruzados.** Várias opções de Configurações só fazem efeito por causa de outra, mas nada avisa isso. Um novo componente mostra uma linha discreta sob a opção dependente (por exemplo, "Depende de **uma regra de sugestão de modelo** (agora: nenhuma)") que fica desabilitada quando a dependência não está satisfeita. Os links cruzados permitem navegar: clique em um para ir até a seção correspondente do board (que rola e destaca por 2 s), ou para abrir o Settings do editor na opção correspondente; em modo navegador, os links para o Settings aparecem só como texto. **"Preencher o modelo sugerido automaticamente"** saiu de Regras e foi para Modelos, onde faz mais sentido — em Regras fica um aviso simples avisando a mudança de lugar. O campo Intervalo do heartbeat fica desabilitado quando o heartbeat está desligado, sem um componente de dependência adicional. Cabeçalhos novos em Modelos, Agentes, Rules e Skills mostram "Mostrando os X do Cursor · trocar ferramenta" (ou da ferramenta configurada), permitindo trocar a ferramenta de qualquer uma dessas telas. Um link em Settings (`fazai.git.parallel`) abre de volta o board, na seção do heartbeat do Harness.

### Alterado

- **Consumo em tokens, sem custo em dólar.** Por enquanto, o board mede o uso da IA só em tokens,
  que o Claude Code e o Cursor informam. O custo em dólar saiu das Métricas (o total, a série mensal,
  o corte por categoria e os rankings), da linha de consumo na conversa do card e do `get_metrics` do
  MCP: só o Claude Code informa o custo, e um total que cobria parte das execuções confundia mais do
  que ajudava. A série mensal mostra os tokens, e os rankings passam a ordenar por tokens quando o
  período tem tokens medidos. O valor que o Claude Code informa continua gravado no banco, para poder
  voltar depois sem perder o histórico.
- **A pausa do modo autônomo fica gravada no board (#220).** Pausar agora vale até você retomar,
  mesmo depois de fechar e reabrir o editor; antes, reabrir o editor religava a fila. Fechar o
  editor continua não contando como pausa, e ligar o modo numa história (ou **Retomar**) limpa a
  pausa. Depois de uma falha ao iniciar a ferramenta, o autopiloto não religa sozinho até você
  retomar. A lista de
  sub-tarefas no painel da história passa a mostrar o LED de atividade de cada uma.
- **Aba Arquivados no lugar da coluna de arquivados.** A coluna "Arquivados" saiu do fim de cada linha do board (e com ela o arquivar por arraste e o colapsar/expandir dessa coluna): as linhas ficam estreitas o bastante para ver Histórias e Sub-tarefas ao mesmo tempo com os cards colapsados. Os cards arquivados ficam na nova aba **Arquivados**, entre Métricas e Lixeira, que preserva o histórico: uma linha por workflow, na ordem do board, só com os arquivados daquele workflow, do mais recente ao mais antigo. Arquivar continua pelo menu de ações do card (com a confirmação de sempre) e pelos caminhos automáticos. No lugar de "Desarquivar", o menu e a aba têm **Restaurar**: o card volta ao fim da primeira coluna do workflow dele (Backlog / A fazer), inativo. Restaurar uma história traz também todas as sub-tarefas arquivadas dela e desliga o modo autônomo; restaurar uma sub-tarefa cuja história está arquivada pede confirmação ("Restaurar a história junto?") e restaura a história inteira; uma sub-tarefa de história ativa volta sozinha. A ferramenta MCP `unarchive_card` segue como antes.
- **Fases só de texto rodam em paralelo em qualquer modo de workspace (#331).** Refinar, resumir e as fases que só produzem documento (Discovery, PRD, Spec e Plan no board padrão) agora rodam ao mesmo tempo, até **Histórias ao mesmo tempo** (padrão 2), mesmo com **Tocar histórias em paralelo** desligado. Implementação e Homologação seguem como antes: uma por vez fora do worktree, e o paralelo só no worktree com a opção ligada; os dois tetos contam separados e continua uma execução por história. No modo autônomo, a ordem da fila vale para histórias que precisam de branch; as em fase de texto começam quando há vaga. Fora do worktree, `prepare_workspace` numa fase de texto com outra história em execução é recusado (pasta em uso) e a branch nasce na fase de código; com permissão "Sem restrições" a IA ainda pode trocar de branch à mão, pois a guarda cobre só o caminho do board.
- **Arrastar cards ficou suave (#286).** Ao arrastar um card, na mesma coluna ou para outra coluna (vazia ou recolhida), os outros cards se afastam com uma transição de ~200 ms e um espaço tracejado marca onde ele vai ficar. A coluna de destino abre espaço e a de origem fecha o vazio. Ao soltar, o card assenta direto na posição final, sem voltar à origem nem piscar enquanto o board atualiza; se o movimento for recusado, a tela volta ao estado real. Vale para histórias e sub-tarefas (qualquer workflow) e respeita `prefers-reduced-motion` (sem transições). **Correção:** descer um card na mesma coluna e soltá-lo sobre outro agora o salva depois dele, onde a prévia mostrava (antes era salvo antes dele).
- **"Salvar descrição" ganhou destaque (#287).** Ao editar a descrição de um card, o botão agora é primário (indigo sólido) e fica abaixo do editor, à direita, em vez de um botão discreto no cabeçalho. A regra de hierarquia de botões foi registrada no `DESIGN.md`; os demais botões do board já seguiam o padrão.
- **Botão de criar card no topo da coluna.** O **+ Novo card** / **+ Nova sub-tarefa** passou do
  rodapé para o topo da coluna, logo abaixo do cabeçalho, para não precisar rolar a lista em
  colunas cheias. Mudou só a posição: nenhum comportamento ou dado muda. O print
  `docs/images/board.png` ainda mostra o botão no rodapé e não foi atualizado nesta entrega.
- **Git e paralelo saem do board e vão para o Settings do editor.** As nove chaves de Git
  (`fazai.git.mode`, `branchPattern`, `worktreeDir`, `parallel`, `parallelStories`, `autoMerge`,
  `mergeMethod`, `watchMerges`, `watchMergeMinutes`) agora ficam em `Ctrl+,` → **Faz AI: Git**, com
  escopo **Recurso**: o valor do Usuário é o padrão de todos os projetos, e Workspace ou Folder
  sobrescreve só no projeto. No editor, a aba Git e o bloco "Tocar histórias em paralelo" do Harness
  de IA viram um link para essas chaves; no navegador seguem como campos editáveis, como antes.
  **Migração automática:** na primeira abertura depois desta versão, cada chave que só existe no
  board vira o padrão do Usuário; se o Usuário já tinha outro valor, o do board é preservado gravando
  no Workspace (ou no Workspace Folder, com múltiplas pastas abertas) — **isso pode criar um
  `.vscode/settings.json` no projeto**. O board não altera o `.gitignore`: decidir se esse arquivo
  entra no repositório fica com quem usa o projeto.
- **Hint formatado nos botões "Trabalhar na fase" e "Refinar com IA".** Os botões que executam essas
  ações (na barra de status do card e na aba de comentários) mostram um tooltip rico com a explicação
  formatada em negrito e tópicos, em lugar do `title` HTML nativo. O hint abre ao passar o mouse ou
  focar com o teclado, fecha com Esc, e continua visível quando o botão está bloqueado, para que você
  saiba o motivo mesmo sem poder clicar.
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
- **Toda chamada à IA passa por uma única porta (#187).** O executor de cards (manual, heartbeat e
  modo autônomo) e o chat repetiam o registro de uso, e o registro era opcional. Agora ambos pedem a
  execução a um `AiGateway`, que abre a linha em `ai_runs` antes de rodar, confere a permissão, cuida
  de interrupção e tempo limite e grava desfecho e consumo; cada ferramenta tem um provider próprio
  (comando e leitor da saída). Um teste cobre as quatro origens e falha se algum arquivo fora do
  gateway chamar a IA ou escrever no log. Em consequência, o log de uso não é mais opcional.
- **Teste e2e do Cursor mais limpo.** O `npm run e2e:cursor` mostra só "Gerando a extensão…" e, se
  houver, o erro do build; a saída inteira só aparece quando o empacotamento falha. O aviso
  `groups: cannot find name for group ID` sumiu: os grupos do computador (vídeo, render) passam a
  ser criados dentro do contêiner, no `start.sh`, a partir dos ids recebidos.
- **O modo autônomo retoma sozinho ao abrir o editor.** Antes, as histórias que já estavam em modo
  autônomo ficavam paradas até um clique em **Retomar modo autônomo**, o que parecia o modo
  "não funcionar". Agora, ao abrir o editor (e sempre que a janela passa a ser a dona do board), o
  autopiloto retoma a fila pendente e registra isso no log. A pausa continua sua: o que você pausou,
  ou o que parou por falha ao iniciar a ferramenta, só volta quando você retomar; uma fila só de
  histórias entregues não o religa.
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
- **MCP do board e skill do fluxo passam a ser requisitos** em todas as ferramentas, na faixa amarela e
  no Diagnóstico: o chat do editor depende do MCP, e a skill faz a IA seguir o fluxo. A faixa ganha o
  botão **Instalar a skill**, e o aviso de ligar o MCP no Cursor some segundos depois de ligado.
- **Tema, fonte e tamanho da fonte migraram para o Settings nativo do editor.** As três chaves `fazai.appearance.theme/font/fontSize` agora existem no Settings do VS Code e do Cursor (escopo Usuário), ao lado de `fazai.appearance.language` que já estava lá desde a #179. Dentro do editor, a aba Aparência das Configurações do board mostra um link para abrir o Settings nativo; no modo navegador (`faz-ai` no terminal), a aba continua como antes, com os 4 campos, porque lá não há Settings de editor. A sincronização é automática: se o Settings ainda não tem valor explícito e o board tem valor não-padrão, o do board é copiado para o Settings e passa a valer em todos os projetos; se o Settings já tem valor explícito, ele vence (RF de sincronização #179 estendido para as três chaves novas). Com múltiplos boards diferentes abertos pela primeira vez após a atualização, vale o valor do primeiro board a abrir — os demais seguem o Settings a partir de então.
- **A tabela de status migrou da aba Aparência para a aba Fluxos.** Rótulo e cor de cada status continuam editáveis pelo board, mas agora em Configurações → Fluxos, não mais em Aparência; a interface (os campos e cores) permanece idêntica, nenhuma personalização anterior é perdida.

### Removido

- **O board suporta só o Claude Code e o Cursor.** Codex, Kimi Code e GitHub Copilot saíram do
  **Harness de IA**, que agora oferece só essas duas ferramentas, e do restante da extensão: modelos
  embutidos, registro do servidor MCP, regras, skills e agentes, hooks, execução pela conversa e
  Diagnóstico. Um board que estava configurado com uma delas volta para o Claude Code ao abrir. O
  que o Cursor e o Claude Code ainda carregam de `.codex/skills` ou `AGENTS.md` continua listado.
- **A tabela de preços saiu (#187).** Um valor calculado a partir de preços cadastrados envelhece
  quando o fornecedor muda a tarifa e deixa o relatório errado sem avisar, então o board deixou de
  calcular custo. As execuções gravam os quatro contadores de tokens, e o Claude Code grava também o
  `total_cost_usd` que a própria CLI informa (o Cursor não informa custo); nesta versão as telas
  mostram só os tokens (veja "Consumo em tokens, sem custo em dólar"). Saem a tabela embutida, a coluna de preço da aba **Modelos de IA**, o
  **Preço variável**, os campos `price_*`, `reset_price` e `variable_price` do `upsert_model`, a
  origem do preço no `get_models` e a regra **Cursor Token Rate** (`cursorTokenRate` no
  `update_rules`). Catálogos gravados antes perdem os campos de preço ao abrir o board. As execuções
  antigas continuam no banco, com os tokens que tinham.

### Corrigido

- **Correção: o modo autônomo não reexecuta nem bloqueia uma história já entregue (#413).** Uma história em modo autônomo que chegou à Homologação e ficou com a pessoa (aguardando revisão ou resposta, bloqueada, ou aprovada à espera da próxima coluna) era tratada como "sem avanço": o autopiloto a rodava de novo e acabava bloqueando-a sozinho. Agora ela sai da fila enquanto estiver com a pessoa, e a IA, numa entrega sem pull request, chama `request_review` para marcar a história como entregue.
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
- **Script de instalação do Diagnóstico todo em inglês.** O script gerado por **Instalar o
  necessário** / **Instalar os recomendados** misturava português ("Login da CLI", "instalação
  concluída", "pulado, porque … falhou") com a interface em inglês. Agora os nomes dos passos e as
  mensagens saem em inglês, e o teste varre o script contra texto em português.
- **Correção: o LED da sub-tarefa apagava segundos depois de acender.** Mover um card de coluna
  zerava o status de trabalho dele, inclusive o "Em execução": como a IA chama `start_work` e em
  seguida move a sub-tarefa para "Em andamento", o LED verde piscava por um instante e apagava, e a
  história não mostrava que a IA estava trabalhando nela. Agora o card em execução que vai para
  outra coluna em que a IA atua continua "Em execução"; os demais status seguem recomeçando ao
  trocar de coluna, e na conclusão não há status de trabalho.
- **Correção: uma história que esperava dependência parava toda a fila do modo autônomo.** A
  primeira história da fila (ordem do board) que dependia de outra ainda aberta segurava o
  autopiloto com "espera #N terminar", mesmo com a própria #N pronta mais abaixo. Agora a história que
  espera dependência é pulada e a vez passa para a próxima que pode rodar; só quando nenhuma pode a
  fila para, com o motivo da primeira.
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
- A barra de modo autônomo dentro do card não mostra mais o motivo inteiro do bloqueio de outra história (a nota do autopiloto é do board todo): sobre outro card, fica uma linha curta apontando para ele; o texto completo continua na barra de atividade.
- **Pendência com a pessoa passa a vez no status do card.** Quando a IA deixava algo dependendo de você (uma decisão, um ponto em aberto, algo que ficou de fora da entrega), ela registrava isso num comentário e seguia adiante, e o card não mostrava que a vez era sua. Agora `request_review` tem o parâmetro `pending`: a pendência vai para a conversa no bloco **Travado em mim** e o card fica em **Aguardando revisão**, mesmo em modo autônomo (nesse caso o pedido deixa de ser aprovado automaticamente e a fila segue com as outras histórias). A skill do fluxo e as instruções do servidor MCP passaram a exigir esse caminho e ganharam a seção "Pendências com a pessoa" e o fechamento de fase em três blocos (Travado em mim, O que mudou, O que encontrei). Reinstale a skill do fluxo em Configurações → Harness para atualizar o texto.
- O aviso `allowed_warning` do Claude Code (perto do teto do plano) não é mais tratado como limite esgotado: a troca para o modelo reserva só acontece com `rejected` ou janela a 100%.
- A troca para o modelo reserva só acontece quando a execução falhou; uma execução que terminou bem não é mais refeita com a reserva.
- Se a retentativa com o modelo reserva não conseguir começar (card arquivado, ferramenta recusou), o card é bloqueado com o motivo em vez de ficar "em execução" sem execução.
- Numa sub-tarefa, a execução passa a contar como texto ou branch pela fase da história, como no cálculo da fila, e a barra de atividade mostra essa fase.
- Os comandos **Exportar o board** e **Importar um board** da paleta agora têm título em inglês quando o editor está em inglês.
- O comentário "História entregue com o pull request…" sai sempre com o nome da ferramenta de IA como autor, mesmo quando foi a pessoa que moveu o card.
- A nota do autopiloto na barra de atividade mostra só a primeira linha do motivo do bloqueio, sem cercas de código e limitada a 160 caracteres.
- No Windows, as execuções e as consultas às CLIs não abrem mais uma janela do `cmd.exe`.
- No Windows, o named pipe do servidor MCP leva o nome do usuário: dois usuários com a mesma pasta não disputam mais o mesmo pipe.
- A barra de seleção múltipla ganhou fundo, borda e espaçamento, como a barra de filtros, nos dois temas.
- A caixa **Modo autônomo** do card e o botão em lote da barra de seleção refletem o clique na hora e ficam travados (a barra mostra "Aplicando…") até o board confirmar; sem resposta em 3 s, voltam ao valor anterior.
- Colapsar ou expandir um card pelo teclado mantém o foco no botão de colapso: Enter de novo reverte.
- A caixa de marcação do card aparece quando recebe foco pelo teclado (e quando o foco está dentro do card).
- A barra de atividade não anuncia mais a linha toda ao leitor de tela a cada minuto: só a referência e a fase são anunciadas; o "há N min" fica fora da região viva. A nota do autopiloto fica numa linha, com o texto inteiro no tooltip.
- Arrastar um card logo depois de soltar outro parte da ordem que está na tela, não da ordem antiga.
- Em Modelos de IA, **Preencher o modelo sugerido automaticamente** aparece desligado quando não há regra de sugestão (antes ficava ligado e travado ao apagar a última regra).
- **Resumir a conversa** trava logo após o clique: dois cliques seguidos não disparam duas execuções.
- Só um formulário **+ Novo card** fica aberto por vez no board, e Esc o fecha mesmo com o foco fora do campo.

## 0.33.0

### Adicionado

- **Preços do Cursor.** O **Auto** passa a ter **preço variável**: o Cursor cobra o preço do modelo
  para o qual cada pedido foi roteado, então o board não estima o custo dele em vez de usar um
  número fixo enganoso. A chave **Preço variável** existe em todo modelo de **Modelos de IA** e no
  `upsert_model` (`variable_price`), e "Detectar modelos" a preserva.
- **Tarifa do Cursor (Cursor Token Rate).** Nova chave no cartão do Cursor, desligada por padrão:
  soma US$ 0,25 por milhão de tokens à estimativa dos modelos de terceiros, como o Cursor cobra nos
  planos Teams e Enterprise; Composer, Grok e Auto são isentos. Pelo MCP, `cursorTokenRate` no
  `update_rules`. Execuções já registradas não são recalculadas.

### Alterado

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
- A dica da tabela de preços e o README explicam o modo rápido (modelo à parte, com preço próprio),
  o contexto longo (não separado: o Cursor só informa o total de tokens) e como o id de
  `cursor-agent models`, o nome da tabela de preços e o modelo do board se correspondem.

## 0.32.0

### Adicionado

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
- **O Cursor aceita os níveis "só o board" e "board e arquivos".** Antes ele só rodava "sem
  restrições". Nos níveis menores, a sessão recebe só as ferramentas do nível, sem terminal.
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

### Alterado

- **Imagens do README refeitas** com a interface desta versão, em português e em inglês.
- **O "Chamar IA" virou dois botões, cada um com uma tarefa.**
  - **Trabalhar na fase** é o antigo Chamar IA, com o nome do que ele faz: o trabalho da coluna em
    que o card está (em Implementação, código), até passar a vez.
  - **Refinar com IA** é novo: reescreve título e descrição com clareza, revisa Tags, Esforço da
    atividade, Modelo e Skills e completa o checklist, sem trabalhar a fase, sem mover o card e sem
    mexer em arquivos (roda só com o board; no Kimi, que não tem esse nível, o pedido proíbe). O
    resumo do que mudou fica na conversa, com o texto anterior da descrição, e o card volta ao
    status que tinha, também quando a execução falha (a falha fica na conversa, sem bloquear o
    card). Refinar não conta como execução sem progresso para o modo autônomo.
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
- **A CLI do Cursor é procurada como `cursor-agent`.** O board também acha a CLI na pasta do
  instalador, antes de tentar o nome curto `agent` (que pode ser outro programa). O esforço do
  modelo vai como sufixo do id (`claude-opus-5-5-high`), como `cursor-agent models` lista as
  variantes; um modelo sem nível escolhido roda no nível padrão dele, também no chat do board e no
  modelo que o `get_card` informa.
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
- **Dividir um pedido grande em histórias agora as vincula de verdade.** Ao criar uma história com
  `autonomous_from`, ela ganha um vínculo **relativo** com a história de origem — antes, a origem só
  ficava registrada em texto, num comentário que nem a interface nem a IA liam como relação. Se já
  existir qualquer vínculo entre as duas (caso de uma história ligada à mão), a criação é pulada em
  silêncio, sem duplicar.

### Corrigido

- **Agentes, modelos e regras não perdem uma mudança feita logo depois de outra.** Escrever a
  intenção de um agente e logo clicar em **Só leitura** apagava a intenção: a segunda mudança partia
  da lista de antes da primeira. O mesmo valia para o catálogo de modelos e para as regras de
  sugestão. Agora cada mudança parte da última enviada.
- **Regras de sugestão em inglês:** o nome do campo "Esforço da atividade", as opções e o nome das
  regras criadas pelo board aparecem traduzidos ("Task effort = Low"), como no card.
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
- **Os botões de IA do card mostram o erro no próprio board.** Quando a execução nem começa (CLI não encontrada, por
  exemplo), o motivo aparece como aviso na tela do board e fica no canal Faz AI. Antes ele ia só
  para as notificações do editor, que o Cursor guarda na central sem mostrar: o clique parecia não
  fazer nada.
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
- **Windows: o prompt chega inteiro às CLIs instaladas pelo npm.** Aspas, `&` e `|` no texto eram
  interpretados pelo `cmd.exe`, e **Parar** deixava a CLI rodando. Agora os argumentos são escapados
  e Parar encerra a árvore de processos; se nem assim o processo fechar, a execução termina para o
  board em vez de deixar o card "Em execução". O login e a lista de modelos do Cursor também são
  lidos no Windows.
- **Avisos de configuração do Claude Code saíram do chat e da falha do card.** Linhas como
  "Permission allow rule …" apareciam no erro do chat e nas linhas de falha do card, empurrando o
  motivo real para fora. Agora ficam só no canal de log; o motivo do erro (login expirado, por
  exemplo) continua aparecendo.

## 0.31.1

### Corrigido

- **O card aberto voltou a funcionar.** Na 0.31.0 o card abria encostado à esquerda e fechava a
  qualquer clique: o fundo escuro ficava por cima dele. Agora ele abre como uma janela centralizada,
  só fecha ao clicar fora dela ou com Esc, e os seletores e menus do card abrem por cima. O Esc que
  fecha um seletor aberto não fecha mais o card junto.

## 0.31.0

### Adicionado

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
- **Triagem automática na primeira chamada da IA.** Num card sem Tags, Esforço da atividade, Modelo
  e Skills, a IA lê a descrição, escolhe e preenche os quatro campos e cria a checklist antes de
  começar o trabalho da fase. Se qualquer um deles já estiver preenchido, a triagem não acontece.
- **LED da IA no topo do card aberto.** O LED de atividade da IA aparece também no cabeçalho do card
  aberto e acende quando a IA está trabalhando no card ou numa de suas sub-tarefas.
- **O board detecta o merge do pull request e conclui a história.** Uma rotina periódica observa, a
  cada intervalo configurável, se um pull request de uma história entregue em modo autônomo foi
  mergeado: quando o merge é detectado, o board grava o commit do merge no card, registra na
  conversa, move a história para a coluna de conclusão e remove a pasta de trabalho. O aviso de PR
  fechado sem merge aparece uma única vez. O **recurso está ligado por padrão** (Configurações → Git,
  **Concluir a história quando o pull request for mergeado**), e o intervalo de consulta é
  configurável (**Verificar a cada (minutos)**, padrão 15, faixa 5 a 1440). O merge continua sendo
  feito pela pessoa (manualmente ou pelo merge automático); o board só observa.

### Alterado

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
- **Anexo abre numa janela do próprio board.** Clicar num anexo abre uma modal em vez de um editor
  ou aplicativo externo: texto e JSON podem ser lidos e editados ali, imagens são exibidas e os
  outros tipos avisam que não há pré-visualização. A modal traz **Salvar como** (o diálogo do
  editor ou, no navegador, o download) e **Copiar conteúdo**.
- **O card aberto não cobre mais o chat.** O card abre como uma janela centralizada na tela, e não
  mais como um painel preso à direita, que ficava por cima do chat com a IA.

### Corrigido

- **O pacote publicado sai com as notas da versão no topo do changelog, não mais com "Não
  lançado".** O `npm run release` agora abre o `.vsix` gerado e confere o README e o CHANGELOG (nos
  dois idiomas) antes de publicar: recusa se o changelog ainda tiver "Não lançado" sobrando, se a
  primeira seção não for a versão que está saindo, ou se faltar algum dos blocos de aviso do README
  (fase alpha e agradecimento). Antes, era possível publicar com o changelog desatualizado.
- **Release sem push direto na `main`.** O `npm run release` agora cria a branch `release/vX.Y.Z`
  a partir da main atualizada e ajusta nela a versão e os CHANGELOGs ("Não lançado" vira a versão).
  Depois de publicar nas lojas, envia a branch, abre o PR e, com o push concluído, faz o merge
  sozinho (squash), atualiza a main local, apaga a branch de release (local e remota) e cria a tag e
  a GitHub Release sobre o commit mergeado. Antes, o push direto era recusado pela `main` protegida
  e deixava uma tag solta no remoto. Se algo parar depois da publicação, `npm run release -- finish`
  retoma de onde parou, sem publicar de novo.

## 0.30.0

### Adicionado

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
- **Vínculos entre cards.** Qualquer card pode ser vinculado a outro, de qualquer workflow: **pai**,
  **filho** ou **relativo**, na seção **Vínculos** do card aberto, com busca por número ou título. O
  rodapé do card mostra o vínculo e o progresso dos filhos; vínculo repetido e ciclo são recusados.
  Quando o último filho em aberto entra numa coluna de conclusão, vale a regra "ao concluir todos os
  filhos" (perguntar, mover sozinho ou nada) também para o pai vinculado. A IA ganha `link_cards` e
  `unlink_cards`, e o `get_card` devolve os vínculos. As sub-tarefas seguem como estão.
- **Skills automáticas por tipo de card.** Em Tipos de card → Padrões por tipo, o campo Skills usa
  a janela de escolha (antes mostrava "Sem opções ainda" quando o projeto não tinha skills próprias)
  e todo card novo do tipo nasce com as skills escolhidas. Há teste de ponta a ponta.
- **Agentes configuráveis por intenção.** Cada agente tem o campo **O que este agente faz**; com
  ele, **Sugerir pela intenção** marca skills e servidores MCP que combinam (busca por palavras,
  sem chamar IA). As skills do agente usam a janela de escolha com busca, e as ferramentas têm
  conjuntos prontos: **Só leitura** e **Editar código**. A tabela do que o Claude Code aceita por
  parâmetro foi para uma seção recolhida.
- **Botão de tema no topo do board**: o ícone no canto superior direito alterna entre **Sistema**,
  **Claro** e **Escuro**. É a mesma preferência de Configurações > Aparência, então a escolha fica
  salva e vale no editor e no navegador.
- O contraste de textos, controles e foco do teclado é verificado por teste automático nos dois
  temas. As regras de cor estão em `DESIGN.md`.
- Interno: lint (ESLint) e formatação (Prettier) configurados, e testes de interação (cliques e
  teclado) do board. Nada muda para quem usa.
- O botão "⋯" dos menus avisa aos leitores de tela se o menu está aberto.
- Cards com pendência sua ganham a borda na cor do status, para achar de relance o que espera por
  você.
- Um LED pisca devagar na barra do card enquanto a IA trabalha nele (fica aceso, sem piscar, com
  movimento reduzido no sistema).
- O assistente de IA (MCP) ganhou `create_workflow` e `delete_workflow`; `set_workflow_layout` e o
  parâmetro `collapsed` de `update_column` foram removidos.
- **Ordem dos workflows**: cada workflow tem uma alça para arrastar e mudar a posição dele no
  board (com a alça em foco, ↑ e ↓ movem uma posição). O assistente de IA (MCP) ganhou
  `move_workflow`.
- **Coração do heartbeat** no topo direito do board: vermelho e batendo enquanto o heartbeat está
  rodando; cinza e parado quando ele está desligado ou não consegue rodar (sem ligação com o Faz
  AI ou sem a ferramenta do projeto, com o motivo no tooltip). Um clique no coração liga e desliga o
  heartbeat.

### Alterado

- **Controles do card aberto, do board e dos filtros no mesmo padrão.** Tipo, coluna, status, agente,
  filtros e escolha do diálogo agora são os seletores do Radix, assim como as caixas de seleção da
  checklist e dos filtros e os campos de busca, de adicionar item e de data. Ficaram como texto
  editável só o título, o item da checklist, o nome da coluna e o editor de markdown.
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
- **Cores próprias do board**: o board passa a usar a mesma paleta no editor e no navegador, em
  claro e escuro, em vez de herdar as cores do tema do VS Code. Com **Sistema**, ele acompanha só
  se o editor está em tema claro ou escuro. Temas de alto contraste usam o claro ou o escuro do
  board com bordas reforçadas.
- O botão principal é azul índigo nos dois temas (no escuro era verde).
- As barras de rolagem usam as cores do board, e a barra horizontal das colunas ganhou um espaço de
  respiro abaixo dos cards.
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
- Interno: as ferramentas MCP saem de um arquivo de 1147 linhas para `src/extension/mcp/tools/`,
  um arquivo por grupo. A lista que a IA vê (nomes, descrições, parâmetros) não muda.
- Interno: o roteador de mensagens do host (690 linhas) vira um despachante tipado com handlers
  por domínio em `src/extension/panel/handlers/`; a regra da história fica em `src/shared/story.ts`.
- Interno: a tela Configurações > Harness (483 linhas) vira composição de seções em
  `settings/harness/`, com testes de interação novos; regras sem React vão para `src/shared`.
- Interno: o painel do card (399 linhas) vira composição de partes em `components/card/`, com 21
  testes de interação novos; tipos, checklist e vaga da sub-tarefa entram em `src/shared/selectors.ts`.
- **Ícones novos**: emojis e símbolos soltos (✕ ⋯ ▾ ↗ 🗑 💬 📎) deram lugar a um conjunto único de
  ícones de traço ([Lucide](https://lucide.dev)) em todo o board: card, colunas, painel do card,
  editor de descrição, filtros e configurações.
- **Card novo no board**: uma barra na cor do tipo, como a de uma janela, com o ID, o tipo e os
  botões de abrir e de ações. O título fica numa linha (inteiro no tooltip), o status mostra com
  quem está a pendência por um ícone (robô para a IA, pessoa para você) e há quanto tempo está
  assim, e bloqueado mostra o motivo no tooltip. O modelo de IA ganha uma linha própria, com o
  esforço em português ("Sonnet 5.5 - baixo"), e o rodapé mostra a branch e o link do PR.
- **Configurações mais organizadas**: cada seção tem o título e a ação principal na mesma linha.
  Em **Tipos de card**, o botão **Novo tipo** no topo abre uma linha na tabela, alinhada com as
  outras, com a prévia do card (Enter adiciona, Esc cancela). As configurações e a Lixeira ocupam
  toda a largura da tela, e o menu lateral das configurações recolhe numa faixa só com ícones (a
  escolha fica lembrada).
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
- **LED da IA sempre no card**: o LED na barra do card agora existe o tempo todo. Pisca devagar
  enquanto a IA trabalha no card, e a história também acende quando a IA trabalha numa sub-tarefa
  dela. Quando a IA termina, o LED continua no card, apagado (só o contorno). A prévia dos tipos
  também mostra o LED apagado.
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

### Removido

- Os cards perderam a faixa colorida à esquerda: a cor do tipo fica na barra do card.

### Corrigido

- **Descrição em bloco do frontmatter**: skills e agentes com `description: |` ou `>` (em várias
  linhas) apareciam com a descrição vazia ou só com a barra; agora a descrição é lida inteira.
- O painel de **Filtros** da barra lateral usa o fundo do tema do board. Antes, com o VS Code
  escuro e o board claro, os filtros ficavam quase invisíveis.
- Os selos de status e de tipo de card ficam legíveis em qualquer cor escolhida: o texto vira preto
  ou branco conforme a cor de fundo.
- Corrigido: trocar de card com a descrição em edição salvava o rascunho no card aberto em seguida
  (por exemplo, na sub-tarefa); agora ele vai para o card em que foi escrito.
- **Texto legível na cor do tipo e do status**: a cor do texto (preto ou branco) passa a ser
  escolhida pelo contraste percebido, e não mais pela fórmula antiga, que punha texto preto sobre o
  azul da História e o vermelho do Bug. Em Configurações > Tipos de card, cada tipo mostra a prévia
  do card enquanto você escolhe a cor; se a cor deixar o texto difícil de ler, aparece um aviso com
  a mesma cor mais escura e mais clara para aplicar com um clique. O aviso também vale para as
  cores dos status em Aparência.
- Campos de texto, link e número do card não perdem mais letras quando você digita rápido. O
  valor é gravado ao sair do campo, com Enter ou ao fechar o card, em vez de a cada tecla.
- Os logs do navegador de teste (`.playwright-mcp`) entraram por engano em PRs anteriores e agora
  são ignorados pelo git.
- Em Configurações > Campos, o seletor "No board" (Selo, Selo vazado, Nome: valor, Oculto) não
  invade mais a coluna das opções quando a janela é estreita: as colunas do cartão do campo passam
  a quebrar de linha antes de ficarem menores que o seletor.

## 0.29.1

### Adicionado

- O README avisa que o projeto está em **fase alpha**: erros e mudanças entre versões podem acontecer.
- Nova seção **Preparar o ambiente de desenvolvimento**, com o que fica fora do git e precisa ser
  refeito num clone novo, e como publicar com a `main` aceitando só pull requests.

## 0.29.0

### Adicionado

- **Board no navegador, fora do editor**: **Abrir no navegador ↗** (ou o comando **Faz AI: Abrir
  board no navegador**) abre o mesmo board numa aba, sincronizado com o editor. Sem o editor, o
  comando `~/.faz-ai/bin/faz-ai` serve o board de uma pasta com o servidor MCP, a execução da IA e
  o heartbeat. A página só responde em `127.0.0.1` e exige o segredo do link.
- A IA é avisada do nível de permissão da execução e, quando ele não basta, bloqueia o card dizendo
  qual opção escolher. O nível aparece ao lado do botão **Chamar IA**, com atalho para mudar.
- Falhas da execução levam o fim da saída da ferramenta para o card, e o motivo do bloqueio é
  mostrado formatado.

### Alterado

- Com o Claude Code, o servidor do board vai na linha de comando de cada execução: chamar a IA não
  depende mais de **Conectar IA (MCP)** nem da aprovação do `.mcp.json`.
- **Usabilidade**: botão **Chamar IA** no cabeçalho do card; avisos e erros em caixas flutuantes
  que não empurram o board; contador **N com você** e indicador de IA trabalhando no topo; campo
  Skills recolhido, com busca; cabeçalho do card fixo; orientação no board vazio e na linha de
  sub-tarefas; abrir card com Enter; foco visível pelo teclado; abas do topo mais discretas.

### Corrigido

- **Chamar a IA funciona sem a CLI no PATH**: o board procura o executável nas pastas de instalação
  usuais e dentro das extensões do editor (Claude Code, Codex). Antes, quem só usava a extensão do
  Claude Code recebia "comando não encontrado".
- **Um banco por pasta**: janelas em projetos diferentes não gravam mais uma por cima da outra. O
  board parte de uma cópia do banco das versões anteriores, que fica intacto.

## 0.28.0

### Adicionado

- **Buscar e instalar skills**: a partir de uma pasta, de `dono/repositorio` do GitHub ou de um
  endereço git. O board lista as skills encontradas e copia as escolhidas para o projeto ou para a
  pasta do usuário. O repositório é clonado numa pasta temporária e nada dele é executado.
- A seção Plugins mostra os comandos de cada ferramenta para instalar e remover plugins.

## 0.27.0

### Adicionado

- **Modelos e referências nas skills**: os arquivos de apoio de cada skill (`references/`,
  `assets/`, `scripts/`) aparecem na tela, com abrir, criar (com o link no `SKILL.md`) e apagar.
- **Criar skill de modelos**: skill do projeto para modelos de classe e exemplos de código.
- `get_card` devolve os arquivos de apoio das skills do card; nova ferramenta MCP `write_skill_file`.

## 0.26.0

### Adicionado

- **Hooks**: listados um por comando, com o filtro; acrescentar e remover no formato de Claude
  Code, Codex, Cursor e Copilot. Os do Kimi Code são só listados.
- **Regras de permissão** (permitir, perguntar, negar) do Claude Code e da CLI do Cursor:
  listar, acrescentar e remover.

## 0.25.0

### Adicionado

- **Servidores MCP**: acrescentar e remover nos arquivos de cada ferramenta, do projeto e da pasta
  do usuário, incluindo o `config.toml` do Codex. O `~/.claude.json` é só leitura.

## 0.24.0

### Adicionado

- **Perfis de execução**: agente, skills, servidores MCP, ferramentas, modelo e sessão limpa, por
  fase, com troca por card e um padrão do board.
- MCP: `get_card` devolve `execution`; `get_board` lista os perfis; `update_column` aceita
  `exec_profile`; nova ferramenta `set_card_profile`.

### Alterado

- A execução pelo board passa o perfil à ferramenta por parâmetro onde ela aceita, e como instrução
  no prompt onde não aceita.
- O modelo e o esforço indicados no card passam a ser enviados à ferramenta na execução.

## 0.23.0

### Adicionado

- **Skills sob demanda**: cada skill pode ser Automática ou Só quando indicada, gravado no formato
  de cada ferramenta.

### Alterado

- O campo "Skills" dos cards oferece também as skills desligadas, e a execução pelo board recebe o
  caminho de cada skill do card.

## 0.22.0

### Adicionado

- **Harness**: criar, apagar e copiar skills, agentes, comandos e regras entre a pasta do usuário,
  os plugins e o projeto. Alterações na pasta do usuário pedem confirmação.

## 0.21.0

### Adicionado

- **Harness por ferramenta e por escopo**: uma aba por ferramenta, com o que ela carrega no
  projeto, na pasta do usuário e em plugins (instruções, skills, agentes, comandos, hooks,
  servidores MCP, plugins e configurações).

### Alterado

- O campo "Skills" dos cards oferece as skills globais e de plugins, com filtro por origem.
- Kimi Code: a pasta de skills do projeto passa a ser `.kimi-code/skills`. A pasta antiga,
  `.kimi/skills`, continua listada, mas skills novas vão para a atual.

## 0.20.0

### Alterado

- **Ordem das colunas**: arrastar a linha da coluna nas configurações, no lugar dos botões de seta.
- A coluna nova entra depois da coluna escolhida; por padrão, antes da primeira coluna de conclusão.

## 0.19.0

### Adicionado

- **Agentes no harness**: criar, editar e apagar agentes (subagentes) do projeto, no formato de
  cada ferramenta. Ferramentas MCP `get_agent`, `create_agent`, `update_agent` e `delete_agent`.

## 0.18.0

### Adicionado

- **Pull request na Homologação**: a IA abre o PR da história e registra o endereço no card.
- **Merge automático** (opcional, desligado por padrão): ao aprovar a homologação, o board faz o
  merge pelo GitHub CLI e conclui o card; se o merge falhar, o card fica Bloqueado.

## 0.17.0

### Adicionado

- **Branch e pasta de trabalho por história**: cada história tem uma branch própria, por padrão
  numa worktree separada. Nova aba Git nas configurações.

## 0.16.0

### Adicionado

- **Heartbeat**: o board chama a IA sozinho a cada intervalo, quando há pendência com ela.

## 0.15.0

### Adicionado

- **Chamar IA pela conversa**: roda a ferramenta do projeto em segundo plano para um card, com
  nível de permissão e tempo limite configuráveis.
- Imagens coladas na conversa viram anexos do card.

## 0.14.0

### Adicionado

- **Fila de pendências**: filtro "Com você", contador na barra lateral e aviso quando a IA passa a
  vez. Ferramenta MCP `get_pending_work`.
- **Skill do fluxo** (`faz-ai-fluxo`), que ensina a IA a conduzir os cards pelo board.

## 0.13.0

### Adicionado

- **Fases configuráveis**: cada coluna tem a instrução para a IA e o modelo do documento que a
  fase produz.
- Novas colunas **Discovery** e **Homologação** no board padrão.
- Os documentos das fases ficam anexados à história e aparecem como links nas sub-tarefas.

## 0.12.0

### Adicionado

- **Status do card**: Pronto, Em execução, Aguardando resposta, Aguardando revisão, Aprovado e
  Bloqueado, mostrando se a pendência está com você ou com a IA.
- **Revisão antes de avançar**: nas colunas que exigem aprovação, a IA só move o card depois que
  você aprova.
- **Atualização do board**: boards existentes são levados ao padrão novo, com confirmação e sem
  mover cards.

### Alterado

- A aba "Comentários" passa a se chamar **Conversa**.

## 0.11.1 e anteriores

Ver o histórico de commits do repositório.
