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
| Harness               | Biblioteca única de regras, skills, subagentes e MCPs, com importação por tipo, CRUD e assistentes; ferramenta, permissão, regime de admissão (exclusivo ou compatível), agente padrão e heartbeat (ver [Harness](harness.md#harness) e [Agentes](harness.md#agentes))                                                                                                                                                                                                                                                                     |
| Ferramentas de IA     | Perfis de CLI: ligar, escolher o padrão, duplicar, criar e testar                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Modelos de IA         | Modelos e níveis de esforço por perfil; regras que sugerem o modelo de cada card                                                                                                                                                                                                                                                                                                                                                                                                             |
| Git                   | Modo, gitflow, nome e prefixos das branches, worktrees, merge automático e registros de decisão; editável no editor e no navegador. "Tocar histórias em paralelo" fica em Harness de IA › Ferramenta e execução                                                                                                                                                                                                                                                                              |
| Aparência             | **Idioma** (automático, Português (Brasil) ou English), tema, fonte e tamanho, por board, no editor e no navegador; status (nome e cor, na aba Fluxos; aqui só no modo navegador)                                                                                                                                                                                                                                                                                                           |
| Backup                | Exportar e importar o board, na aba Backup, no editor e no navegador (no editor, também pela paleta de comandos: `fazai.exportBoard`, `fazai.importBoard`)                                                                                                                                                                                                                                                                                                                                 |

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

### Perfil personalizado

Para criar um personalizado, informe o comando e um argumento por linha. Os marcadores `{prompt}`,
`{model}`, `{effort}`, `{mcpConfig}` e `{addDir}` inserem, respectivamente, o pedido, o modelo, o
esforço, o arquivo MCP e uma pasta adicional quando estiverem disponíveis. Escolha **Entrada do
pedido** (argumento ou stdin) e **Servidor do board** (CLI, arquivo no projeto ou nenhum). No campo
**Modelo** de um card, **Outro modelo…** aceita um identificador livre desse perfil sem cadastrá-lo
no catálogo. **Testar** executa um pedido curto e usa a sua assinatura; uma resposta OK não comprova
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
substitui a embutida uma vez só; no Claude Code, uma lista embutida que pode ser editada.

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
