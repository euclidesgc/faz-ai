🇧🇷 Português · [🇺🇸 English](configuracoes_EN.md)

# Configurações do board

Este é o manual detalhado da tela de **Configurações**: o que cada seção ajusta, como funcionam os
perfis de CLI, o catálogo de modelos com as regras de sugestão e as políticas de execução e
fallback. O Harness, os agentes e a conexão da ferramenta de IA estão em
[Harness, agentes e ferramentas de IA](harness.md).

![Configurações: catálogo de modelos e regras de sugestão](images/settings.png)

## Seções da tela

| Seção                 | O que ajusta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows e colunas   | Quantos workflows quiser (cards independentes ou sub-tarefas), com nome editável e posição que você muda arrastando; **Nova coluna** em cada um; nomes, ordem (arrastando) e significado das colunas; em quais a IA atua e quais exigem aprovação; a fase de cada coluna (instrução para a IA e modelo do documento). Abrir e fechar workflows e colunas é feito no próprio board e fica lembrado                                                                                        |
| Tipos de card         | História, Bug, Sub-tarefa…, com cor e valores padrão de campos por tipo                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Campos personalizados | Os campos que você cria (texto, seleção, data, link…) e onde aparecem; opções de seleção que são tecnologias (Flutter, React, Python…) ganham o logo. Os campos do board (Fase, Tags, Modelo, Skills, Rules, MCPs e Esforço da atividade) ficam fora: as regras, a triagem e a IA dependem deles, então não se apagam nem se renomeiam, e um campo novo não usa o nome deles. No card aberto, os personalizados ficam na seção própria                                                 |
| Regras do board       | Bloqueios de conclusão e de avanço de fase, confirmações, preenchimento do modelo sugerido, trilha curta para histórias pequenas (esforço Baixo ou tipo Bug pula o PRD e a Spec)                                                                                                                                                                                                                                                                                                              |
| Harness               | Biblioteca única de regras, skills, subagentes e MCPs, com importação por tipo, CRUD e assistentes; ferramenta, permissão, agente padrão e heartbeat (ver [Harness](harness.md#harness) e [Agentes](harness.md#agentes))                                                                                                                                                                                                                                                                     |
| Ferramentas de IA     | **Conectar ferramenta** (escolher a ferramenta e o modo e conectar); perfis de CLI: ligar, escolher o padrão, duplicar, criar e testar                                                                                                                                                                                                                                                                                                                                                       |
| Modelos de IA         | Modelos e níveis de esforço por perfil; regras que sugerem o modelo de cada card                                                                                                                                                                                                                                                                                                                                                                                                             |
| Git                   | Modo, gitflow, nome e prefixos das branches, worktrees, merge automático e registros de decisão; editável no editor e no navegador. "Tocar histórias em paralelo" fica em Harness de IA › Ferramenta e execução                                                                                                                                                                                                                                                                              |
| Aparência             | **Idioma** (automático, Português (Brasil) ou English), tema, fonte e tamanho, por board, no editor e no navegador; status (nome e cor, na aba Fluxos; aqui só no modo navegador)                                                                                                                                                                                                                                                                                                           |
| Backup                | Exportar e importar o board, na aba Backup, no editor e no navegador (no editor, também pela paleta de comandos: `fazai.exportBoard`, `fazai.importBoard`)                                                                                                                                                                                                                                                                                                                                 |

## Ferramentas de IA: Conectar ferramenta

No topo de **Configurações → Ferramentas de IA**, **Conectar ferramenta** mostra a lista fixa das
ferramentas que a extensão traz (o Gemini primeiro, cada uma com a nota de cobrança). Escolhida a
ferramenta, cada modo que a extensão oferece para ela (CLI, ACP ou API; nunca um que não funciona)
vira um cartão com a mesma ficha, para comparar linha a linha: o que o board controla, o regime
esperado, a precisão do que foi usado, o consumo, o que a ferramenta traz por conta própria, como se
entra, a cobrança e quando escolher. Os modos ainda não oferecidos aparecem só pelo nome, sem cartão.

**Recomendado** é o modo em que o board controla mais do que o agente acessa e mede o que ele gasta;
empate se desfaz pelo que a ferramenta carrega por conta própria (menos é melhor). O selo aparece só
quando o modo recomendado é oferecido, com o motivo em uma frase. Para o Gemini, o recomendado é a
**API**, e o selo fica no cartão dela; o cartão **ACP** segue ao lado. O Claude Code
mostra a CLI com o selo e o porquê de ser a única (o ACP dele exige cobrança por API, fora da
assinatura).

O botão **Conectar** de um cartão leva o perfil do catálogo da ferramenta, naquele modo, por estes
passos, com o progresso na tela. É um perfil por ferramenta, com o modo trocável: no Gemini, os cartões
**ACP** e **API** conectam o mesmo perfil (o mesmo id, as mesmas políticas, o mesmo catálogo de modelos
e a mesma chave), e ele passa para o modo do cartão quando o login dá certo; o cartão do modo em que o
perfil roda mostra **Modo em uso**.

1. **Achar a ferramenta**: o comando no PATH do terminal e a versão; sem ele, o link **Instalar**. No
   modo API não há o que achar: quem fala com a API é a extensão.
2. **Entrar na conta**: no Gemini, o campo da **chave de API** (de senha). A chave fica guardada no
   cofre deste computador, a mesma em todas as pastas e nos dois modos; ela não volta para a tela e não
   entra no log, no registro das execuções nem na exportação do board. No **ACP** ela vai, a cada
   processo, para o login do agente pelo protocolo, e o Gemini CLI a aceita sem consultar a API: ela é
   conferida de fato na primeira execução, e uma chave errada aparece ali, com a mensagem do Gemini. Na
   **API** ela é **conferida na hora**: o board lê a lista de modelos da conta com ela (não gasta a
   conta), e a tela diz "chave de API conferida". Nos dois, a chave nova só substitui a guardada depois
   de aceita; recusada, a anterior continua. O perfil só é ligado (e só muda de modo) depois deste
   passo. Nas CLIs prontas, a sonda de login, com o comando para o terminal quando falta.
3. **Verificar as capacidades**: as sondas do verificador gravam as provas do perfil, e o regime sai
   delas, sem pergunta: as cinco capacidades provadas dão o regime exclusivo; permissões, MCP e
   delegação provadas, o compatível. Um agente ACP é sempre compatível (os arquivos de contexto que
   ele lê sozinho não têm prova pelo protocolo). O modo API é exclusivo por construção, sem sonda: o
   board afirma a prova na primeira execução, para o modelo do card; a ciência do ACP, se havia, sai.
4. **Ciência do regime** (só no compatível): um botão à parte, **Entendo o que a ferramenta carrega**,
   grava a sua ciência para aquele perfil. O regime vale por perfil: o Gemini pode rodar no compatível
   enquanto o Claude Code segue no exclusivo.
5. **Ler os modelos**: os modelos que a ferramenta anuncia entram no catálogo, em todo campo de modelo
   (na API, os modelos da conta que respondem ao `generateContent`).

No fim, **Conectada** com a versão, o login, o regime, quantos modelos e a data, e as ações **Trocar a
chave** e **Revogar ciência**. Um erro fica preso ao passo em que ocorreu, com **Tentar de novo**, que
retoma desse passo (a ciência e os modelos não refazem o login nem as sondas); se o agente recusar a
chave no login, o campo volta com o que você colou. Cada perfil do catálogo, na lista abaixo, mostra o
estado da conexão (inclusive quando o Conectar espera você) e **Reconectar**.

A verificação de capacidades não tem mais comando à parte: o comando da paleta **Faz AI: Verificar o
isolamento da CLI de IA** saiu. Ela roda no **Conectar** e no **Reconectar** (o Claude Code e o Gemini
pela CLI entram aqui), sozinha quando você liga um agente ACP, e, nos perfis verificáveis que não passam
pelo Conectar (a cópia do Claude Code e o personalizado ACP de uma versão anterior), pelo botão
**Verificar capacidades** do perfil na lista. Nenhuma das sondas gasta a sua conta. Quando uma prova
perde a validade (a CLI, o ambiente ou a extensão mudou), a faixa de requisitos diz onde refazer:
**Abrir o Conectar** no perfil do catálogo, **Abrir Ferramentas de IA** na cópia.

A ciência é de cada perfil e pode sair: **Revogar ciência** a tira (o perfil deixa de rodar no
compatível até você dar a ciência de novo); reconectar um perfil que passa a provar o regime exclusivo
a tira sozinho; e **importar um board não traz a ciência dos perfis**: quem importa dá a própria, na
máquina em que o perfil roda. Os perfis que não passam pelo Conectar (cópias e personalizados) dão e
revogam a ciência na lista, com **Dar ciência do regime compatível** e o mesmo texto do Conectar.
Uma política de execução não troca o perfil por outro com regime diferente (`constraints-changed`). A faixa de requisitos continua
conferindo a ferramenta e o login: no Gemini pelo ACP, sem a chave no cofre o login fica "não
verificado" (ele pode ter a sua `GEMINI_API_KEY`); pela API, sem a chave no cofre falta o login (não há
outro), e o aviso de login leva ao Conectar.

A opção **Regime de admissão** saiu de Harness › Ferramenta e execução. Quem tinha ligado o regime
compatível para o board inteiro numa versão anterior continua com ele (e vê o aviso com o botão
**Voltar ao exclusivo**); os perfis com ciência no Conectar seguem no compatível.

## Ferramentas de IA: perfis de CLI

Um **perfil de CLI** é uma ferramenta que o board pode escolher para executar. Os perfis prontos
são Claude Code, Cursor e Kimi Code. Uma **cópia** usa o catálogo de modelos e a medição de consumo
da ferramenta de origem, mas mantém comando, credenciais e verificação próprios. Um
**personalizado** aceita outra CLI com saída em texto; tokens e custo ficam desconhecidos. Em
**Configurações → Ferramentas de IA**, ligue um perfil revisado e escolha o padrão; só essa tela
cria, edita, duplica e testa perfis. Importações ficam desligadas até revisão local. Configuração e
credenciais salvas não voltam à tela nem entram no export do board.

Comandos, argumentos, ambiente e credenciais permanecem no cofre local: exportação, tela e MCP
mostram apenas referências e estado. Cópias não herdam provas de isolamento, e um personalizado sem
tradução verificada não executa. Sondas de versão/login e o botão **Testar** não comprovam
capacidades.

### Qual CLI executa

O valor do campo **Modelo** (`<perfil>:<modelo>@<esforço>`) já diz o perfil de CLI. Para cada
execução o board usa o primeiro nível preenchido: o **Modelo do card**, o **modelo do agente**, a
**regra de modelo** (mesmo com "Preencher o modelo sugerido automaticamente" desligado) e, sem
nenhum, o **perfil de CLI padrão** de Configurações → Ferramentas de IA. Assim, sub-tarefas da
mesma história podem rodar em CLIs diferentes, e as regras por esforço podem apontar para perfis
diferentes.

O primeiro nível preenchido é definitivo: se a escolha for inválida (perfil desligado, modelo fora
do catálogo ou esforço inexistente), o card fica **bloqueado** com o motivo, sem cair para o próximo
nível nem para o padrão. O campo Modelo, o chat e o editor de regras listam os modelos de **todos
os perfis ligados**, agrupados por perfil. Login vencido e CLI ausente valem por perfil: param só os
cards daquele perfil, e o aviso aparece só para os perfis em uso. **Sugerir regras** age só no
perfil sugerido e preserva as faixas de outros perfis. Pelo MCP, o `get_card` mostra o alvo em
`model` (`tool`, `from` e, se inválido, `blocked`).

### Agente ACP pronto

Os agentes do catálogo ACP que não coincidem com uma CLI pronta vêm como perfis prontos do tipo
**Agente ACP**: Gemini CLI, Codex, OpenCode, GitHub Copilot CLI, Qwen Code, goose e Google
Antigravity. Eles aparecem desligados em **Ferramentas de IA**; ligue o que você usa. Como os outros
prontos, não têm Editar nem Apagar: **Duplicar** cria um perfil personalizado com o mesmo agente, para
mudar o ambiente ou o nome. O id do perfil (`gemini`, `codex-acp`…) é a ferramenta do catálogo de
modelos, e **Detectar modelos** lê os modelos do agente nele. **Verificar situação** confere se o
comando do agente está no PATH e a versão; o login fica "não verificado" (no Gemini, "conectado"
com a chave no cofre, pelo [Conectar](#ferramentas-de-ia-conectar-ferramenta)), e o link **Instalar**
abre a página oficial do modo ACP do agente. Cursor e Kimi Code ficam nas CLIs
prontas de uma passada, que medem tokens; o Claude Code segue pela CLI `claude`.

### Perfil personalizado (Avançado)

O personalizado é o caminho avançado, para uma linha de comando que o catálogo não traz: as
ferramentas do catálogo entram pelo **Conectar ferramenta**. O formulário fica em **Avançado**, abaixo
da lista de perfis, no botão **Novo perfil de CLI personalizado**. O personalizado novo é **só de
CLI**: o campo **Agente ACP** saiu do formulário novo, e o board recusa transformar uma CLI
personalizada em agente ACP. Os personalizados ACP criados numa versão anterior (e a cópia de um agente
ACP pronto) **continuam rodando como estão**: a lista mostra o aviso, com **Abrir o Conectar** no
agente deles, e **Verificar capacidades**; editar mostra o mesmo aviso e mantém o agente salvo.

Para criar um personalizado, informe o comando e um argumento por linha. Os marcadores `{prompt}`,
`{model}`, `{effort}`, `{mcpConfig}` e `{addDir}` inserem, respectivamente, o pedido, o modelo, o
esforço, o arquivo MCP e uma pasta adicional quando estiverem disponíveis. Escolha **Entrada do
pedido** (argumento ou stdin) e **Servidor do board** (CLI, arquivo no projeto ou nenhum). No campo
**Modelo** de um card, cada perfil personalizado ligado (CLI própria ou agente ACP) forma um grupo,
mesmo sem modelo cadastrado, e o item **Outro modelo…** desse grupo aceita um identificador livre do
perfil sem cadastrá-lo no catálogo. **Testar** executa um pedido curto e usa a sua assinatura; uma resposta OK não comprova
isolamento, permissões nem restrições MCP. Capacidades sem evidência permanecem desconhecidas e
podem impedir a execução.

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

## Modelos de IA e regras de sugestão

**Detectar modelos** lê a lista da ferramenta: no Cursor, dos modelos da sua conta, pelo comando
`cursor-agent models`, lido ao abrir o board com a CLI autenticada, e a primeira lista lida
substitui a embutida uma vez só; no Claude Code, uma lista embutida que pode ser editada. Num perfil
com **Agente ACP**, o botão abre uma sessão com o agente (`initialize` e `session/new`, sem pedido,
então sem gastar a sua conta) e lê os modelos que ele anuncia: o seletor de modelo das opções da
sessão, no esquema atual do protocolo, ou o bloco `models` da forma anterior, que o Gemini CLI ainda
usa. O modelo atual do agente fica em primeiro. Um agente que não anuncia modelos deixa o catálogo
como está, com o aviso; aí vale **Novo modelo** ou **Outro modelo…** no card. Na execução, o modelo
do card vai pelo seletor da sessão (`session/set_config_option`) quando o agente o expõe, e pela
linha de comando (`--model`) onde o agente aceita; o agente que não aceita nenhum dos dois segue com
o modelo dele, e o log da execução diz qual.

Cada modelo lido da ferramenta (pelo **Detectar modelos** ou pelo **Conectar**) guarda a data da
leitura, e o bloco da ferramenta diz "lista lida da ferramenta em …" com a mais recente. Sem essa
linha, a lista é a embutida ou a que você montou à mão. Uma lista velha (a conta mudou de plano, a
ferramenta tirou um modelo) se corrige detectando de novo ou reconectando.

No Cursor, a lista traz uma linha por nível de cada modelo (`claude-opus-5-5-low`, `-medium`,
`-high`…); o board junta as variantes num modelo com os níveis dele. As versões rápidas (`-fast`,
respondem mais depressa e cobram mais pelos mesmos tokens) ficam de fora até você ligar **Incluir
os modos rápidos** no cartão do Cursor: aí cada uma entra como um modelo à parte ("Claude Opus 5.5
1M Fast"), só para os modelos que estão no catálogo; desligar a chave as tira do catálogo. Pelo MCP,
é a regra `includeFastModels` do `update_rules`. No plano gratuito do Cursor só o **Auto** roda: os
outros modelos são recusados antes de começar (o card bloqueado explica como escolher Auto), e por
isso as regras de sugestão do Cursor começam todas em Auto.

As regras de sugestão combinam condições com E e OU, por exemplo
`Esforço da atividade = Alto E Tags = backend`. O resultado é sempre uma sugestão: no card, o
modelo e o esforço podem ser trocados a qualquer momento. O editor de regras tem só nome, condições
e modelo sugerido.

## Políticas de execução e fallback

As **políticas de execução e fallback** separam definição versionada, revisão humana local e
histórico (schema 41). O resolvedor não troca uma escolha explícita inválida por um padrão nem
redireciona um prefixo para o perfil-cópia padrão. O avaliador e a simulação usam a mesma função,
com recusas explicadas, destinos ordenados, limites acumulados e exigência de reconciliação quando
há trabalho parcial ou desconhecido. Políticas importadas permanecem pendentes de revisão;
snapshots anteriores não mudam com a edição.

Em **Configurações → Ferramentas de IA → Políticas de execução e fallback → Gerenciar políticas**,
o editor manual permite condições, destinos ordenados, limites, duplicação, remoção e histórico
paginado. A comparação integral precede a confirmação de revisão humana; salvar como pendente não
autoriza execução. Conflitos de versão preservam o rascunho e permitem recarregar a base antes de
revisar novamente. O simulador do host usa o mesmo avaliador, sem IA, e identifica
credenciais/admissão como hipóteses do cenário. Mudanças nas políticas salvas ou no contexto
invalidam o resultado exibido.

Os perfis que as políticas e o simulador conhecem são os perfis do board (os da extensão, as cópias e
os personalizados), com o modo no nome ("Gemini · API", "Claude Code · CLI"), e os modelos de cada um
são os do catálogo do board. Assim um perfil do Gemini, em qualquer modo, pode ser origem e destino
de uma política: com a falha _quota_, a cota esgotada do Pro pode seguir no Flash, por exemplo. O
modo não entra na política: trocar o Gemini de modo no **Conectar** mantém as políticas dele.

A cota do Gemini é **por modelo** (o Pro pode esgotar enquanto o Flash ainda tem cota), mas a pausa pelo
limite de uso é **por perfil**: sem política, o perfil do Gemini inteiro espera a renovação. Para seguir
com outro modelo quando um esgota, crie uma política com a falha _quota_ e o destino no outro modelo
(Pro → Flash): a troca acontece na hora, e o perfil não fica pausado. Um destino num perfil desligado
aparece com um aviso no editor, no resumo e no simulador; a política salva, mas a execução só troca para
ele depois de você ligar o perfil.

Runner, chat e assistentes ("Sugerir agentes, regras ou skills", "Indicar artefatos") decidem a
troca de alvo por esse mesmo avaliador: com política ligada e aplicável a execução segue no destino
dela; sem política, a falha bloqueia e nada roda noutro alvo. Em **Próxima execução**, a simulação
avalia só as políticas salvas e ligadas, sem gastar tokens nem abrir a CLI. **Criar com ajuda de
IA**, **Sugerir fallbacks** e **Revisar conflitos** pedem à IA só uma proposta (rascunho com
explicação, diferenças e exemplos simulados, sem segredos): ela passa pelo validador do editor e
nada é salvo ou ligado até você revisar e confirmar. A IA também consulta as políticas pelo MCP
(`get_execution_policies`, só leitura); criar, revisar e ativar é sempre ação da pessoa.

### O modelo reserva antigo

O antigo **modelo reserva** das regras de sugestão não troca mais nada na execução: o fallback é
decidido só pelas políticas de execução e fallback. Ao abrir o board, ao salvar regras ou depois de
importar um backup, cada reserva legada vira uma **proposta de política desligada e pendente de
revisão** (id `legacy-<regra>`, ação _oferecer_, falha _quota_, destino = o modelo reserva), com
histórico na versão 1. A proposta não copia as condições da regra (campos e tipo do card):
ajuste-as no editor. A conversão acontece uma vez; se você remover a proposta, ela não volta.

Em **Políticas → Gerenciar políticas** um aviso lista as propostas e as reservas sem conversão
(modelo ou esforço fora do catálogo); nada troca de CLI até você comparar, simular, revisar e ligar
a política. O editor de regras não tem mais campo de reserva e não mostra a reserva antiga; a
conversão e o aviso ficam nas políticas. O MCP `set_model_rules` não tem o parâmetro `fallback` (a
chave é ignorada numa chamada) e `get_models` não devolve reserva. Ao exportar, credenciais e
variáveis dos perfis de CLI não vão no arquivo; ao importar, os perfis voltam desligados e as
políticas pendentes, e o aviso lista ambos.

## Dependências entre opções e links cruzados

Várias opções de Configurações só fazem efeito por causa de outra. O board mostra uma linha
discreta sob as opções dependentes (por exemplo, "Depende de **uma regra de sugestão de modelo**
(agora: nenhuma)" abaixo de "Preencher o modelo sugerido automaticamente", ou "Depende de **agentes
marcados como disponíveis**" abaixo de "Agente padrão"); a opção fica desabilitada quando a
dependência não está satisfeita. Os links permitem navegar: clique em um para ir até a seção
correspondente do board, que rola e destaca por 2 segundos, ou clique em um link do Settings para
abrir o board na seção certa. No modo navegador, os links para o Settings aparecem só como texto.

**"Preencher o modelo sugerido automaticamente"** fica em Modelos, não em Regras; um aviso simples
em Regras indica a mudança de lugar. O campo Intervalo do heartbeat fica desabilitado quando o
heartbeat está desligado, sem um componente de dependência adicional. Os cabeçalhos de Modelos,
Agentes, Rules e Skills mostram "Mostrando os X do [ferramenta] · trocar ferramenta", permitindo
mudar a ferramenta de qualquer uma dessas telas do board.

## Atualizar o board padrão

Quando uma versão nova da extensão muda o board padrão, o board pergunta se você quer atualizá-lo
(ou use **Faz AI: Atualizar board para o padrão atual**). A atualização só acrescenta o que falta:
nenhum card sai do lugar e o que você personalizou é mantido. Uma cópia do banco é gravada antes.
