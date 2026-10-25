🇧🇷 Português · [🇺🇸 English](configuracoes_EN.md)

# Configurações do board

Este é o manual detalhado da tela de **Configurações**: o que cada seção ajusta, como o board se conecta
aos agentes de IA (Claude Code, Cursor, Codex, Gemini e os outros), o catálogo de modelos de cada agente
com as regras de sugestão e as regras de fallback. O Harness e os agentes do board estão em
[Harness, agentes e ferramentas de IA](harness.md).

![Configurações › Conectar agentes: o agente padrão, a lista e a conexão do agente escolhido](images/settings.png)

## Seções da tela

| Seção                 | O que ajusta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows e colunas   | Quantos workflows quiser (cards independentes ou sub-tarefas), com nome editável e posição que você muda arrastando; **Nova coluna** em cada um; nomes, ordem (arrastando) e significado das colunas; em quais a IA atua e quais exigem aprovação; a fase de cada coluna (instrução para a IA e modelo do documento). Abrir e fechar workflows e colunas é feito no próprio board e fica lembrado                                                                                        |
| Tipos de card         | História, Bug, Sub-tarefa…, com cor e valores padrão de campos por tipo                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Campos personalizados | Os campos que você cria (texto, seleção, data, link…) e onde aparecem; opções de seleção que são tecnologias (Flutter, React, Python…) ganham o logo. Os campos do board (Fase, Tags, Modelo, Skills, Rules, MCPs e Esforço da atividade) ficam fora: as regras, a triagem e a IA dependem deles, então não se apagam nem se renomeiam, e um campo novo não usa o nome deles. No card aberto, os personalizados ficam na seção própria                                                 |
| Regras do board       | Bloqueios de conclusão e de avanço de fase, confirmações, preenchimento do modelo sugerido, trilha curta para histórias pequenas (esforço Baixo ou tipo Bug pula o PRD e a Spec)                                                                                                                                                                                                                                                                                                              |
| Conectar agentes      | Os agentes de IA que rodam os cards (todo agente ligado, ao mesmo tempo, e o padrão para os cards sem modelo); a conta de cada um (entrar e sair); o **Conectar** com o board e o modo (CLI, ACP ou API); os modelos de cada agente; o teste rápido, a sessão de teste e o log do protocolo; cópias e perfis personalizados; as regras de fallback                                                                                                                                 |
| Harness               | Biblioteca única de regras, skills, subagentes e MCPs, com importação por tipo, CRUD e assistentes; permissão, agente padrão do harness, heartbeat e as regras que sugerem o modelo de cada card (ver [Harness](harness.md#harness) e [Agentes](harness.md#agentes))                                                                                                                                                                                                                                                                     |
| Git                   | Modo, gitflow, nome e prefixos das branches, worktrees, merge automático e registros de decisão; editável no editor e no navegador. "Tocar histórias em paralelo" fica em Harness de IA › Ferramenta e execução                                                                                                                                                                                                                                                                              |
| Aparência             | **Idioma** (automático, Português (Brasil) ou English), tema, fonte e tamanho, por board, no editor e no navegador; status (nome e cor, na aba Fluxos; aqui só no modo navegador)                                                                                                                                                                                                                                                                                                           |
| Backup                | Exportar e importar o board, na aba Backup, no editor e no navegador (no editor, também pela paleta de comandos: `fazai.exportBoard`, `fazai.importBoard`)                                                                                                                                                                                                                                                                                                                                 |

## Conectar agentes

**Configurações → Conectar agentes** junta o que antes ficava em duas telas (Ferramentas de IA e Modelos de
IA). Todo agente ligado roda cards, ao mesmo tempo que os outros: cada card vai para o agente do modelo dele
(o do card, o do agente do harness ou o da regra de sugestão; veja [Qual CLI executa](#qual-cli-executa)),
sem trocar nada. O **agente padrão** roda os cards sem modelo e leva o selo **Padrão** na lista e no
painel dele, que já abre selecionado ao entrar na tela. À esquerda fica a lista dos agentes; à direita, o agente escolhido, com as abas **Conexão**, **Modelos**, **Testar** e **Detalhes**.
No fim da tela ficam as regras de fallback do agente escolhido na lista. As regras de sugestão de
modelo valem para o board inteiro e ficam em **Harness › Ferramenta e execução**.

### A lista

A lista junta os agentes que o board executa (os que a extensão traz e os seus perfis) com o
[registro oficial do ACP](https://agentclientprotocol.com/registry), de onde vêm o ícone, a descrição e a
versão publicada de cada um. O agente padrão vem primeiro, depois os ligados e os desligados; cada linha
diz o modo e a situação: conectado, ligado, desligado, não instalado, o Conectar em curso, à espera de
você ou parado com erro. Os agentes do registro que o board ainda não executa ficam à parte, em **Outros
agentes do registro do ACP**: dá para entrar na conta e conversar com eles na sessão de teste, mas não
usá-los nos cards. O registro é baixado uma vez e guardado por 6 horas na pasta de dados; sem rede, a
lista segue com a cópia anterior e diz de quando ela é. **Atualizar** baixa a lista de novo e confere outra
vez quais agentes estão instalados, a versão e o login de cada um (use depois de instalar um agente,
entrar na conta dele ou atualizá-lo com o board aberto). **Agente personalizado (CLI)** abre o formulário do perfil
personalizado ([abaixo](#perfil-personalizado-avançado)).

### A conta: entrar e sair

A aba Conexão começa por **Uso nos cards** (veja abaixo) e segue com a instalação, a conta e a conexão
com o board. A seção **Conta** diz se o agente tem login e qual conta ele usa ("Claude Max ·
pe…@exemplo.com"), quando a ferramenta informa; o e-mail aparece encurtado, porque a tela vai parar em
capturas e gravações, e o completo fica na dica ao passar o mouse. A verificação é curta e não deixa processo aberto: nas
CLIs prontas, o status da própria CLI (`claude auth status`, `cursor-agent status`); nos agentes pelo
ACP, o `initialize` e uma sessão nova sem pedido, que não gastam a conta. Ao abrir um agente ligado e
instalado, a tela confere a conta sozinha, e o **Atualizar** do topo confere de novo; sem login (ou sem
verificação), o botão **Verificar a conta** confere na hora.

Sem login, a seção mostra os jeitos de entrar que a ferramenta oferece:

- **Entrar no terminal**: o board abre o login da própria ferramenta num terminal do editor (o comando
  aparece na tela, como `claude auth login`) e espera o terminal fechar; com a saída sem erro, confere a
  conta de novo sozinho e, se o Conectar tinha parado por falta de login, retoma. No navegador, sem o
  editor, a tela mostra o comando para você rodar e conferir depois.
- **Entrar**: o próprio agente faz o login pelo protocolo (pode abrir o navegador), e o board espera você
  terminar.
- **Entrar com a chave**: a chave de API vai para a ferramenta e não volta para a tela nem para o log. No
  Gemini, ela passa pelo Conectar, que a confere e guarda no cofre deste computador.

**Sair da conta** aparece quando há login e a ferramenta sai pelo board (o `logout` do protocolo, ou o
comando da CLI no Claude Code e no Cursor). Ela pede confirmação, porque vale para a máquina inteira: o
terminal e o editor também ficam sem login até você entrar de novo.

### O Conectar: da ferramenta à conexão com o board

A seção **Conexão com o board** conduz o perfil do catálogo por estes passos, com o progresso na tela. Na
ferramenta com mais de um modo (o Gemini: CLI, ACP e API), o seletor de modo fica no topo da seção, com o
selo **Recomendado** e o motivo no modo recomendado, e **Como funciona o modo** abre a ficha do modo: o
que o board controla, o regime esperado, a precisão do que foi usado, o consumo, o que a ferramenta traz
por conta própria, como se entra, a cobrança e quando escolher. **Recomendado** é o modo em que o board
controla mais do que o agente acessa e mede o que ele gasta; empate se desfaz pelo que a ferramenta
carrega por conta própria (menos é melhor). É um perfil por ferramenta, com o modo trocável: o Conectar
noutro modo (**Conectar no modo API**) passa o perfil para aquele modo quando o login dá certo, com o
mesmo id, as mesmas políticas, o mesmo catálogo de modelos e a mesma chave.

1. **Achar a ferramenta**: o comando no PATH do terminal e a versão; sem ele, o link de instalação. No
   modo API não há o que achar: quem fala com a API é a extensão.
2. **Entrar na conta**: no Gemini, o campo da **chave de API** (de senha). A chave fica guardada no
   cofre deste computador, a mesma em todas as pastas e nos três modos; ela não volta para a tela e não
   entra no log, no registro das execuções nem na exportação do board. No **ACP** ela vai, a cada
   processo, para o login do agente pelo protocolo, e o Gemini CLI a aceita sem consultar a API: ela é
   conferida de fato na primeira execução, e uma chave errada aparece ali, com a mensagem do Gemini. Na
   **API** e na **CLI** ela é **conferida na hora**: o board lê a lista de modelos da conta com ela (não
   gasta a conta), e a tela diz "chave de API conferida". Nos três, a chave nova só substitui a guardada
   depois de aceita; recusada, a anterior continua. O perfil só é ligado (e só muda de modo) depois deste
   passo. Nas CLIs prontas, a sonda de login; sem login, o passo para com o comando, e **Entrar no
   terminal** leva ao login que o board acompanha.
3. **Verificar as capacidades**: as sondas do verificador gravam as provas do perfil, e o regime sai
   delas, sem pergunta: as cinco capacidades provadas dão o regime exclusivo; permissões, MCP e
   delegação provadas, o compatível. Um agente ACP é sempre compatível (os arquivos de contexto que
   ele lê sozinho não têm prova pelo protocolo). O modo API é exclusivo por construção, sem sonda.
4. **Ciência do contexto aberto** (só no regime compatível): o aviso diz o que a ferramenta carrega
   sozinha e o custo disso, e o botão **Usar assim mesmo** grava a sua ciência para aquele perfil. O regime vale por perfil: o Gemini pode rodar no compatível
   enquanto o Claude Code segue no exclusivo.
5. **Ler os modelos**: os modelos que a ferramenta anuncia entram no catálogo, em todo campo de modelo
   (na API, os modelos da conta que respondem ao `generateContent`).

No fim, uma linha só: **Pronto para rodar cards**, com a data em que o board conferiu. **Ver detalhes**
abre os passos, o resumo técnico (a versão, o login, o regime, quantos modelos) e a ficha do modo, com
**Parar de usar com o contexto aberto**; **Trocar a chave** fica à vista. Sem a sua ciência, a linha diz que ela falta e os
detalhes já abrem. Um erro fica preso ao passo em que ocorreu, com **Tentar de novo**, que
retoma desse passo (a ciência e os modelos não refazem o login nem as sondas); se o agente recusar a
chave no login, o campo volta com o que você colou. **Reconectar**, discreto porque é raro, refaz o
login, a verificação e a leitura dos modelos: use se algo parou de funcionar. A ciência é de cada perfil e pode sair: **Parar de usar com o contexto aberto** a tira (o perfil deixa
de rodar no compatível até você dar a ciência de novo); reconectar um perfil que passa a provar o regime
exclusivo a tira sozinho; e **importar um board não traz a ciência dos perfis**. Uma política de execução
não troca o perfil por outro com regime diferente (`constraints-changed`).

No topo da aba, **Uso nos cards**: **Ligado** diz se o board usa o agente; ligado, ele roda os cards com
um modelo dele, junto com os outros agentes, e o campo Modelo dos cards e o chat oferecem os modelos dele.
**Tornar padrão** o põe para rodar os cards sem modelo. O agente padrão não desliga (a dica da chave diz
isso): torne outro padrão antes. A verificação de capacidades não tem comando à parte: ela roda no Conectar e no Reconectar,
sozinha quando você liga um agente ACP, e, nos perfis verificáveis que não passam pelo Conectar (a cópia
do Claude Code e o personalizado ACP de uma versão anterior), pelo botão **Verificar capacidades** nos
Detalhes do perfil. Nenhuma das sondas gasta a sua conta. Quando uma prova perde a validade (a CLI, o
ambiente ou a extensão mudou), a faixa de requisitos diz onde refazer: **Abrir Conectar agentes** no
perfil do catálogo, **Abrir os detalhes do perfil** na cópia.

### Contexto do card: fechado ou aberto

Um card gasta menos e sai mais preciso quando a IA usa só o que o board entrega (a história, a fase, as
regras, skills e servidores MCP escolhidos). A seção **Contexto do card**, na aba Conexão, diz se é assim
com aquele agente:

- **Contexto fechado** (com um cadeado, também na lista de agentes): rodando pelo board, nada do que a
  ferramenta lê sozinha chegou ao modelo.
- **Contexto aberto**: algum arquivo entra sozinho em todo card, e a linha diz quais. Isso gasta mais e
  pode trazer instruções que não estão no card.
- **Não verificado**: o teste ainda não rodou, ou nenhum local teve prova.

O board descobre isso em tempo de execução, sem uma lista de locais guardada na extensão, então vale
também para um agente que surgir depois:

1. **Descoberta.** O board pergunta ao próprio agente de onde a ferramenta dele carrega instruções,
   regras, memória, skills, agentes, hooks, configurações e servidores MCP, no projeto e na pasta do
   usuário. O pedido traz um exemplo de uma ferramenta fictícia, para o agente não copiar nomes reais.
2. **Verificação.** O board roda o agente **como roda um card** (as mesmas travas, sem ferramentas e sem
   MCP) e pede que ele copie as linhas do contexto que começam com trechos escolhidos ao acaso nesses
   arquivos. Citar o resto da linha prova que o arquivo chegou ao modelo; ninguém acerta isso por acaso.
   Os arquivos de instrução do projeto que o agente não citou também são conferidos.
3. **Controle.** Uma linha vai no próprio pedido: se o agente não a citar, nenhum "fica de fora" vale.
   Se ele usar ferramentas durante o teste, nada vira prova, porque ele pode ter aberto o arquivo de
   propósito.

O que o agente declara aparece como **Padrão da ferramenta** ("carrega sempre", "carrega quando
combina"): é como ela se comporta rodando sozinha. O veredito de cada local vem só do teste. Um arquivo
que a ferramenta "carrega sempre" e que, pelo board, **fica de fora** só entra num card quando você o
incluir (como regra do card ou da fase, por exemplo).

- **Locais que ainda não existem no projeto** (um `AGENTS.md` que você ainda não criou) são testados com
  uma isca numa pasta descartável: você fica sabendo antes de criar o arquivo se ele entraria em todo
  card.
- **Os arquivos da sua pasta pessoal só são lidos**: o board nunca escreve neles. Um local declarado que
  não existe ali fica como não testado.
- **Configuração, hooks e servidores MCP** não entram no contexto como texto, então a citação não os
  confere; o verificador de capacidades do Conectar cuida deles.
- **Acrescentar um local** inclui no teste um caminho que o agente não declarou. Ele fica só nesta
  máquina, e uma nova descoberta não o apaga.

O teste roda sozinho depois de cada Conectar numa versão ainda não testada e, quando você quiser, por
**Testar agora** ou **Testar de novo**. Ele gasta alguns pedidos da conta do agente (a descoberta e uma
ou duas rodadas de citação). O resultado fica no banco do board, fora da exportação, e a tela avisa
quando o agente mudou de versão desde o último teste. O teste só informa: a admissão dos cards continua
decidida pelo regime de cada perfil.

### Os modelos de cada agente

A aba **Modelos** mostra o catálogo do agente: os modelos que o campo Modelo dos cards, o chat e as regras
de sugestão oferecem para ele, com os níveis de esforço de cada um. Cada modelo tem nome, identificador
na ferramenta, esforços aceitos e esforço padrão; **Novo modelo** cadastra à mão e a lixeira tira do
catálogo, sem confirmação.

**Detectar modelos** lê a lista da ferramenta: no Cursor, dos modelos da sua conta, pelo comando
`cursor-agent models`, lido ao abrir o board com a CLI autenticada, e a primeira lista lida
substitui a embutida uma vez só; no Claude Code, uma lista embutida que pode ser editada. Num agente pelo
ACP, o botão abre uma sessão com o agente (`initialize` e `session/new`, sem pedido, então sem gastar a
sua conta) e lê os modelos que ele anuncia: o seletor de modelo das opções da sessão, no esquema atual do
protocolo, ou o bloco `models` da forma anterior, que o Gemini CLI ainda usa. O modelo atual do agente
fica em primeiro. Um agente que não anuncia modelos deixa o catálogo como está, com o aviso; aí vale
**Novo modelo** ou **Outro modelo…** no card. Na execução, o modelo do card vai pelo seletor da sessão
(`session/set_config_option`) quando o agente o expõe, e pela linha de comando (`--model`) onde o agente
aceita; o agente que não aceita nenhum dos dois segue com o modelo dele, e o log da execução diz qual.

Cada modelo lido da ferramenta (pelo **Detectar modelos** ou pelo **Conectar**) guarda a data da
leitura, e a aba diz "lista lida da ferramenta em …" com a mais recente. Sem essa linha, a lista é a
embutida ou a que você montou à mão. Uma lista velha (a conta mudou de plano, a ferramenta tirou um
modelo) se corrige detectando de novo ou reconectando.

No Cursor, a lista traz uma linha por nível de cada modelo (`claude-opus-5-5-low`, `-medium`,
`-high`…); o board junta as variantes num modelo com os níveis dele. As versões rápidas (`-fast`,
respondem mais depressa e cobram mais pelos mesmos tokens) ficam de fora até você ligar **Incluir
os modos rápidos** na aba Modelos do Cursor: aí cada uma entra como um modelo à parte ("Claude Opus 5.5
1M Fast"), só para os modelos que estão no catálogo; desligar a chave as tira do catálogo. Pelo MCP,
é a regra `includeFastModels` do `update_rules`. No plano gratuito do Cursor só o **Auto** roda: os
outros modelos são recusados antes de começar (o card bloqueado explica como escolher Auto), e por
isso as regras de sugestão do Cursor começam todas em Auto.

### Testar: o teste rápido, a sessão de teste e o log do protocolo

A aba **Testar** tem três partes:

- **Teste rápido pelo caminho dos cards**: um pedido curto pelo mesmo caminho das execuções (a CLI, o
  ACP ou a API do perfil), depois da confirmação, porque usa a sua assinatura. Uma resposta OK não
  comprova isolamento, permissões nem MCP.
- **Sessão de teste pelo ACP**: abre o agente pelo SDK oficial do ACP e conversa com ele em tempo real: o
  texto, o raciocínio, as ferramentas, o plano e os pedidos de permissão, que você responde ali. O topo
  mostra o que o agente declarou (versão do protocolo, nome e versão do agente, a sessão, a conta e as
  capacidades) e as **opções da sessão** que ele anuncia (modelo, modo, esforço, modo rápido), que valem
  só para o teste: o modelo de um card vem do campo Modelo dele. A sessão usa o mesmo comando dos cards
  quando o board conhece o agente pelo ACP; o Claude Code, que roda os cards pela CLI, testa pelo
  adaptador `claude-agent-acp`. Uma sessão por tela: abrir outra fecha a anterior. Ela fecha sozinha
  depois de 10 minutos parada (nunca no meio de uma resposta), com **Encerrar sessão** ou ao fechar a
  tela, e a conversa diz quando fechou. Se o agente pedir login, entre na conta na aba Conexão e clique em
  **Abrir de novo**.
- **Log do protocolo ACP**: cada mensagem JSON-RPC das verificações de conta, dos logins e da sessão de
  teste, nos dois sentidos, com o tempo de cada pedido, o pedido mais lento, as linhas que o agente
  escreve fora do protocolo (`stderr`) e o início e a saída de cada processo. O arquivo do dia
  (`acp-AAAA-MM-DD.jsonl`, na pasta do rastreio do board) guarda tudo, com o JSON completo; **Abrir
  arquivo** o abre no editor. Chaves e tokens de acesso nunca entram; os contadores de consumo
  (`inputTokens`, `totalTokens`) entram.

### Detalhes: perfis de CLI, cópias e personalizados

Cada agente do board é um **perfil de CLI**: uma ferramenta que o board pode escolher para executar. Os
perfis prontos são Claude Code, Cursor e Kimi Code, pela CLI de uma passada, e os agentes ACP do
catálogo (Gemini CLI, Codex, OpenCode, GitHub Copilot CLI, Qwen Code, goose e Google Antigravity), que
vêm desligados. Uma **cópia** usa o catálogo de modelos e a medição de consumo da ferramenta de origem,
mas mantém comando, credenciais e verificação próprios. Um **personalizado** aceita outra CLI com saída
em texto; tokens e custo ficam desconhecidos. Importações ficam desligadas até revisão local.
Configuração e credenciais salvas não voltam à tela nem entram no export do board.

A aba **Detalhes** mostra o tipo do perfil ("Claude Code · CLI", "Cópia de Claude Code · CLI",
"Personalizado · CLI"), o selo de isolamento, a ciência do regime compatível e as **Capacidades e
evidências**, com **Duplicar** em todos e **Editar** e **Apagar** nas cópias e nos personalizados (o
perfil em uso não se apaga). Comandos, argumentos, ambiente e credenciais permanecem no cofre local:
exportação, tela e MCP mostram apenas referências e estado. Cópias não herdam provas de isolamento, e
um personalizado sem tradução verificada não executa.

### Qual CLI executa

O valor do campo **Modelo** (`<perfil>:<modelo>@<esforço>`) já diz o perfil de CLI. Para cada
execução o board usa o primeiro nível preenchido: o **Modelo do card**, o **modelo do agente**, a
**regra de modelo** (mesmo com "Preencher o modelo sugerido automaticamente" desligado) e, sem
nenhum, o **agente padrão** de Configurações → Conectar agentes. Assim, sub-tarefas da
mesma história podem rodar em CLIs diferentes, e as regras por esforço podem apontar para perfis
diferentes. Os cards de agentes diferentes rodam ao mesmo tempo, dentro dos limites de execução
paralela do Harness, sem trocar o padrão.

O primeiro nível preenchido é definitivo: se a escolha for inválida (perfil desligado, modelo fora
do catálogo ou esforço inexistente), o card fica **bloqueado** com o motivo, sem cair para o próximo
nível nem para o padrão. O campo Modelo, o chat e o editor de regras listam os modelos de **todos
os perfis ligados**, agrupados por perfil. Login vencido e CLI ausente valem por perfil: param só os
cards daquele perfil, e o aviso aparece só para os perfis em uso. O mesmo vale para o perfil que o board
não roda (o personalizado de CLI, ou a permissão que a ferramenta não aceita): o **Trabalhar na fase**
desliga só nos cards dele, o heartbeat e o autopiloto pulam só esses cards, e o board só para quando
nenhum perfil ligado roda. **Sugerir regras** age só no
perfil sugerido e preserva as faixas de outros perfis. Pelo MCP, o `get_card` mostra o alvo em
`model` (`tool`, `from` e, se inválido, `blocked`).

### Agente ACP pronto

Os agentes do catálogo ACP que não coincidem com uma CLI pronta vêm como perfis prontos do tipo
**Agente ACP**: Gemini CLI, Codex, OpenCode, GitHub Copilot CLI, Qwen Code, goose e Google
Antigravity. Eles aparecem desligados na lista; ligue o que você usa, de preferência pelo **Conectar**.
Como os outros prontos, não têm Editar nem Apagar: **Duplicar** cria um perfil personalizado com o mesmo
agente, para mudar o ambiente ou o nome. O id do perfil (`gemini`, `codex-acp`…) é a ferramenta do
catálogo de modelos. A situação diz se o comando do agente está no PATH e a versão, com o link de
instalação. Cursor e Kimi Code ficam nas CLIs prontas de uma passada, que medem tokens; o Claude Code
segue pela CLI `claude`.

### Perfil personalizado (Avançado)

O personalizado é o caminho avançado, para uma linha de comando que o catálogo não traz: os agentes do
catálogo entram pelo **Conectar**. O formulário abre pelo botão **Agente personalizado (CLI)**, abaixo
da lista. O personalizado novo é **só de CLI**: o board recusa transformar uma CLI personalizada em
agente ACP. Os personalizados ACP criados numa versão anterior (e a cópia de um agente ACP pronto)
**continuam rodando como estão**: os Detalhes mostram o aviso, com **Abrir o agente do catálogo** e
**Verificar capacidades**; editar mostra o mesmo aviso e mantém o agente salvo.

Para criar um personalizado, informe o comando e um argumento por linha. Os marcadores `{prompt}`,
`{model}`, `{effort}`, `{mcpConfig}` e `{addDir}` inserem, respectivamente, o pedido, o modelo, o
esforço, o arquivo MCP e uma pasta adicional quando estiverem disponíveis. Escolha **Entrada do
pedido** (argumento ou stdin) e **Servidor do board** (CLI, arquivo no projeto ou nenhum). No campo
**Modelo** de um card, cada perfil personalizado ligado (CLI própria ou agente ACP) forma um grupo,
mesmo sem modelo cadastrado, e o item **Outro modelo…** desse grupo aceita um identificador livre do
perfil sem cadastrá-lo no catálogo. O **Teste rápido** executa um pedido curto e usa a sua assinatura;
uma resposta OK não comprova isolamento, permissões nem restrições MCP. Capacidades sem evidência
permanecem desconhecidas e podem impedir a execução.

### Capacidades e evidências

Cada perfil mostra, em **Capacidades e evidências**, a data e a versão da documentação conferida e
um selo: **Contexto vazio** (só com capacidades verificadas pelo host), **Carrega por conta
própria** (há itens conhecidos, listados no balão) ou **Sem prova de isolamento** (lista vazia não é
prova). Em cópias e perfis personalizados, a seção **O que a CLI carrega por conta própria** do
formulário permite marcar, por tipo (regras, skills, agentes, hooks, MCP) e origem (projeto,
usuário), o que a CLI lê sozinha; é uma declaração, não uma verificação. O resumo de cada execução,
o card (**Próxima execução**) e `get_card`/`get_harness` (`execution.cliLoads`) usam essa mesma
decisão. O teste com CLIs reais fica fora do `npm test`: `npm run test:cli-real` (Claude Code
validado em ambiente local controlado; Cursor e Kimi Code **não validados**).

## Sugestão de modelo para cada card

Em **Harness › Ferramenta e execução**, as **regras de sugestão** combinam condições com E e OU, por exemplo
`Esforço da atividade = Alto E Tags = backend`, e sugerem o agente, o modelo e o esforço. O resultado é
sempre uma sugestão: no card, o modelo e o esforço podem ser trocados a qualquer momento. O editor de
regras tem só nome, condições e modelo sugerido. **Preencher o modelo sugerido automaticamente**, logo
acima das regras, preenche o campo Modelo ao criar ou mudar um card, se ele estiver vazio ou com a
sugestão anterior; um modelo escolhido à mão nunca é trocado.

## Regras de fallback

Quando um modelo esgota o limite de uso (a cota), o board segue o card em outro modelo, de qualquer
agente ligado. Sem regra, o card espera a cota renovar. O sinal vem do leitor da saída de cada
ferramenta: o `rate_limit_event` e o `result` de limite do Claude Code, o 429 do Gemini, o 403 de
cota do Kimi Code e a recusa `ActionRequiredError: You've hit your usage limit` do Cursor (no plano
Free, a cota do agente é separada da barra de uso do painel: ela pode acabar com a barra pela
metade). As **regras de fallback** ficam em
**Configurações → Conectar agentes**, abaixo do agente escolhido, e são do agente
escolhido na lista: cada regra parte de um modelo dele que falha, e a seção mostra só as regras dele
(as antigas sem agente aparecem em todos). Elas ficam numa lista: a
ordem é a prioridade (a primeira que casar vence), cada linha mostra **quando** ("Claude Code · CLI ·
Opus 5.5 esgota a cota"), o que o board **usa no lugar** ("Gemini · API · Pro, depois Cursor · CLI ·
Auto") e **como** (troca sozinho ou pergunta antes), com o interruptor para ligar e desligar, subir,
descer, editar e remover.

**Montar nova regra** abre o editor na própria tela, em três passos:

1. **Quando este modelo esgotar a cota**: o modelo que falha, entre os modelos do agente da tela.
   Uma origem por regra; para outro modelo, monte outra regra. A regra nova começa sem modelo.
2. **Usar no lugar, nesta ordem**: a lista de modelos que substituem o que falhou, de qualquer agente
   do board, inclusive outros modelos do mesmo agente. Cada linha oferece todos os modelos menos o que
   falha e os já escolhidos nas outras linhas, e trocar o modelo que falha volta a lista a uma linha
   vazia. Se o primeiro também falhar, o board tenta o seguinte. Sem o modelo que falha, com uma
   linha vazia ou com um destino igual ao modelo que falha, a regra não salva: o botão fica desligado
   com o motivo, e o host recusa a mesma gravação. Um destino num agente desligado aparece com aviso
   na lista e no editor: a regra salva, mas a troca só acontece depois que você ligar o agente em
   Conectar agentes.
3. **Como trocar**: **Troca sozinho** (o card segue no próximo modelo sem perguntar) ou **Pergunta
   antes** (o card fica com você, com as opções na conversa).

O nome sai da própria regra ("Opus 5.5 → Gemini · API · Pro") enquanto você não escrever um, e a
frase no fim do editor diz exatamente o que a regra faz. **Salvar regra** grava e já vale: salvar
pela tela é a revisão humana (a IA não grava nem liga regra). Se outra janela mudou a mesma regra
enquanto você editava, o editor avisa e oferece **Recarregar e salvar de novo**, mantendo o seu
rascunho.

**Avançado**, fechado por padrão, guarda o que o caminho simples não precisa: os tipos de falha (hoje
a execução só reporta a cota esgotada; os outros tipos ficam para quando ela os reportar), as ações
**Bloqueia o card** e **Espera e tenta de novo**, como tratar o modelo escolhido à mão no card (por
padrão a regra também troca quando a origem é exatamente esse modelo), as condições de situação (ação
da execução, agente do harness, fase, tipo de card, quem chamou; vazio vale para todas), os limites
(tentativas, prazo, intervalo e tetos de processos), **Simular** o rascunho, **Sugerir fallbacks** e
**Revisar conflitos** com a IA e as **versões anteriores** da regra (usar uma como rascunho).

Os perfis que as regras conhecem são os perfis do board (os da extensão, as cópias e os personalizados),
com o modo no nome ("Gemini · API", "Claude Code · CLI"), e os modelos de cada um são os do catálogo
do board. O modo não entra na regra: trocar o Gemini de modo no **Conectar** mantém as regras dele.

A cota do Gemini é **por modelo** (o Pro pode esgotar enquanto o Flash ainda tem cota), mas a pausa
pelo limite de uso é **por perfil**: sem regra, o perfil do Gemini inteiro espera a renovação. Para
seguir com outro modelo quando um esgota, monte a regra Pro → Flash: a troca acontece na hora, e o
perfil não fica pausado.

Runner, chat e assistentes ("Sugerir agentes, regras ou skills", "Indicar artefatos") decidem a troca
por esse mesmo avaliador: com regra ligada e aplicável a execução segue no destino dela; sem regra,
a falha bloqueia e nada roda noutro alvo. No fim da seção, **Testar as regras** simula a próxima
execução com a regra escolhida (do agente da tela), sem gastar tokens nem abrir a CLI, e diz
**Passou** quando foi ela que decidiu, do jeito que foi configurada, ou **Não passou** com o motivo
(outra regra antes na lista decidiu, a regra não se aplica ao cenário, ou se aplicou mas não deu para
seguir). Sem regra do agente, o teste e o **Revisar conflitos** não aparecem: o bloco oferece só
**Criar com ajuda de IA**. **Revisar conflitos** olha as regras do agente da tela: regras de agentes diferentes partem de
modelos diferentes e não empatam na mesma falha, mas o ciclo que passa por outro agente (Opus → Gemini
Pro numa regra, Gemini Pro → Opus noutra) aparece. Ligar a regra que fecha um ciclo não salva, e o erro
diz o nome e o agente da outra regra. **Criar com ajuda de
IA** pede à IA só uma proposta (rascunho com explicação, diferenças e exemplos simulados, sem
segredos): ela passa pelo validador do editor e nada é salvo até você abrir a proposta no editor e
salvar. A IA também consulta as regras pelo MCP (`get_execution_policies`, só leitura).

Por baixo, cada regra continua uma política de execução versionada (schema 41): toda gravação gera uma
versão, as versões anteriores ficam guardadas, e o host recusa duas regras ligadas empatadas na
prioridade ou um destino fora do catálogo.

### O modelo reserva antigo

O antigo **modelo reserva** das regras de sugestão não troca mais nada na execução: o fallback é
decidido só pelas regras de fallback. Ao abrir o board, ao salvar regras ou depois de importar um
backup, cada reserva legada vira uma **regra desligada e pendente de revisão** (id `legacy-<regra>`,
ação _pergunta antes_, falha _quota_, destino = o modelo reserva), com histórico na versão 1. A regra
não copia as condições da regra de sugestão (campos e tipo do card): ajuste-as em Avançado. A
conversão acontece uma vez; se você remover a regra, ela não volta.

Na lista, a regra pendente aparece com **Precisa da sua revisão** e o interruptor travado;
**Revisar e ligar** abre o editor, e salvar a grava revisada. No fim da seção, um aviso lista as
propostas e as reservas sem conversão (modelo ou esforço fora do catálogo). O editor de regras de
sugestão não tem mais campo de reserva. O MCP `set_model_rules` não tem o parâmetro `fallback` (a chave
é ignorada numa chamada) e `get_models` não devolve reserva. Ao exportar, credenciais e variáveis dos
perfis de CLI não vão no arquivo; ao importar, os perfis voltam desligados e as regras pendentes, e o
aviso lista ambos.

## Dependências entre opções e links cruzados

Várias opções de Configurações só fazem efeito por causa de outra. O board mostra uma linha
discreta sob as opções dependentes (por exemplo, "Depende de **uma regra de sugestão de modelo**
(agora: nenhuma)" abaixo de "Preencher o modelo sugerido automaticamente", ou "Depende de **agentes
marcados como disponíveis**" abaixo de "Agente padrão"); a opção fica desabilitada quando a
dependência não está satisfeita. Os links permitem navegar: clique em um para ir até a seção
correspondente do board, que rola e destaca por 2 segundos, ou clique em um link do Settings para
abrir o board na seção certa. No modo navegador, os links para o Settings aparecem só como texto.

**"Preencher o modelo sugerido automaticamente"** fica em Harness › Ferramenta e execução, junto das
regras de sugestão, não em Regras; um aviso simples em Regras indica a mudança de lugar. O campo Intervalo do
heartbeat fica desabilitado quando o heartbeat está desligado, sem um componente de dependência
adicional. Os cabeçalhos de Agentes, Rules e Skills mostram "Mostrando os X do [ferramenta] · trocar
ferramenta", permitindo mudar a ferramenta de qualquer uma dessas telas do board.

## Atualizar o board padrão

Quando uma versão nova da extensão muda o board padrão, o board pergunta se você quer atualizá-lo
(ou use **Faz AI: Atualizar board para o padrão atual**). A atualização só acrescenta o que falta:
nenhum card sai do lugar e o que você personalizou é mantido. Uma cópia do banco é gravada antes.
