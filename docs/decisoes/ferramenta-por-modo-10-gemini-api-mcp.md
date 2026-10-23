# Ferramenta por modo, 10: Gemini pela API, parte 1 (o ciclo com MCP)

> História 10 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 9](ferramenta-por-modo-9-admissao-modo-api.md) (o
> transporte `api`, a evidência por construção e o vínculo sem executável), da
> [história 6](ferramenta-por-modo-6-contrato-execucao.md) (o `Executor`) e da
> [história 7](ferramenta-por-modo-7-conectar-gemini-acp.md) (o Conectar e a chave no cofre), que andou em
> paralelo e entrou antes: esta foi refeita sobre ela (seção "O Conectar do cartão API"). Desenho no
> [registro da épica](ferramenta-por-modo-gemini.md), seções "Admissão" e "Os três modos do Gemini".

## Contexto

A história 9 deixou a parte pura da admissão do modo API: o transporte `api`, os checks
`API_CAPABILITY_CHECKS`, a fonte de evidência `by-construction` assinada pelo host e o vínculo do modo
(endpoint, modelo, versão da extensão e o digest da chave). Faltava o laço que cumpre esses checks: sem
ele nenhum perfil rodava em `api`, e o Gemini só oferecia o ACP. Esta história escreve o driver
`gemini/api`, que faz o ciclo de chamadas de função do `generateContent` com as ferramentas MCP, e o
liga ao gateway, à admissão, ao runner e ao catálogo.

Fontes conferidas em 2026-10-23: a referência do `generateContent`
(ai.google.dev/api/generate-content: `contents`, `tools`, `toolConfig`, `systemInstruction`,
`usageMetadata` com `promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`,
`toolUsePromptTokenCount`, `thoughtsTokenCount` e `totalTokenCount`; os valores de `finishReason`, entre
eles `MALFORMED_FUNCTION_CALL`, `TOO_MANY_TOOL_CALLS` e `MISSING_THOUGHT_SIGNATURE`; `Part.thought` e
`Part.thoughtSignature`, "an opaque signature for the thought so it can be reused in subsequent
requests"; `Content.role` só `user` ou `model`), a de `ToolConfig` (ai.google.dev/api/caching: os modos
`AUTO`, `ANY`, `NONE`, `VALIDATED`; `allowedFunctionNames` só com `ANY` ou `VALIDATED`) e a da chave
(ai.google.dev/gemini-api/docs/api-key: o cabeçalho `x-goog-api-key`). A documentação nova da Google é
centrada na Interactions API; a referência do `generateContent` segue publicada. O limite do nome da
função diverge entre as páginas do Vertex (64) e a referência REST atual (128): vale o mais curto.

## Decisão

- **`drivers/gemini/api.ts`, `fetch` nativo, sem SDK.** Um `POST
  {endpoint}/models/{modelo}:generateContent` por turno, com `AbortController` próprio e tempo limite de
  2 minutos por pedido, `redirect: 'error'` (o cabeçalho com a chave nunca segue para outro endereço) e a
  chave só no `x-goog-api-key`. O pedido do board vai em `systemInstruction`, junto com as instruções que
  o servidor do board dá a todo cliente MCP (as que uma CLI recebe no `initialize`); a conversa inteira
  vai em cada pedido, sem sessão no servidor. A parte do modelo volta inalterada no pedido seguinte,
  com o `thoughtSignature` que vier nela, e as respostas das funções vão numa parte `user` com
  `functionResponse { id, name, response }` (`output`, ou `error` quando a ferramenta falhou). O ciclo
  acaba quando o modelo responde só com texto (`STOP` dá código 0, outro `finishReason` dá falha), no
  limite de 40 pedidos (falha, o par do `max_turn_requests` do ACP), num erro de HTTP ou ao Parar.
- **As funções declaradas são as da decisão, e a mesma decisão roda em cada chamada.** O board conecta
  os servidores da configuração MCP admitida (o do board e os do card), lista as ferramentas e declara
  ao modelo só as que `apiCallDecision` admite: a regra do ACP (`boardDecision`: servidor da execução,
  ferramentas negadas, delegação, nível) e, quando a execução traz o escopo de operações do contrato
  (`exec.mcpTools`, no runtime v1), só as operações dele. O nome é `mcp__<servidor>__<ferramenta>`,
  com um apelido quando não cabe nas regras do Gemini; o JSON Schema do MCP vai em
  `parametersJsonSchema`, sem o `$schema`. Uma chamada a função não declarada volta como erro, sem
  rodar, e não entra no inventário. É a garantia unitária da épica: o laço nunca declara uma ferramenta
  fora da decisão (`test/aiGatewayApi.test.ts`, com um servidor na configuração que o card não admitiu).
- **O board é cliente de si mesmo, pelo servidor que já atende a pasta.** No modo API não há
  ferramenta para iniciar a ponte. O cliente do servidor do board (`mcp/selfClient.ts`) fala com o
  socket de `socketPath(pasta)`, o mesmo que a ponte usa, pelo mesmo protocolo (uma mensagem JSON por
  linha e o token da execução na primeira, lido do `FAZAI_RUN_TOKEN` que a sessão MCP injeta na
  definição do `faz-ai`). Nada abre um segundo servidor: sem servidor na pasta, a execução falha com a
  causa, e o `startMcpServer` continua recusando o segundo. Os MCPs do card são conectados pela
  definição da biblioteca, com o transporte do `call_board_mcp_tool`, extraído para
  `libraryMcpTransport`; um MCP do card fora do ar só deixa as ferramentas dele de fora. O servidor do
  board vê o cliente como `faz-ai-gemini-api` e assina a conversa como **Gemini**.
- **`Measured` sem processo.** `onExit` uma vez, com 0 no fim, 1 na falha (com o erro) e 143 ao Parar;
  `kill()` aborta o pedido em curso (e a chamada MCP em curso, pelo mesmo sinal) e impede o próximo;
  `report()` soma o `usageMetadata` de cada pedido (`measure: 'tokens'` no driver, `full` no relatório:
  a entrada sem o cache, mais o pedido das ferramentas; o pensamento soma na saída; `turns` é o número
  de pedidos; custo nunca); o inventário são as chamadas executadas (`mcp_tool`). Sem nenhuma medição,
  `failure()` é `MeasureEndedError`.
- **A evidência por construção é afirmada pelo host, só para o que o laço garante.** O `Executor`
  ganhou `guarantees(input)`: os checks que o laço cumpre de fato (aqui, os cinco, com o comentário de
  onde cada um é cumprido). Na execução, `ExecutionAdmission.prepare` afirma e assina por
  `recordByConstruction` só esses, quando o vínculo de isolamento atual não tem prova em vigor (nunca
  afirmada, vencida); uma prova incompleta não é refeita. `constructionEvidence` ganhou a lista dos
  garantidos: um check fora dela fica sem recibo, e a capacidade sai parcial. A decisão pura não
  afirma nada, como a história 9 decidiu.
- **O validador da execução admitida do modo API.** `AdmittedExecution.api()` reconfere o vínculo
  admitido. O gateway entrega ao driver `ctx.beforeRequest`, que roda antes de cada pedido ao modelo e
  de cada chamada de função: a sessão MCP da execução não foi revogada, o snapshot dos artefatos segue
  válido e o vínculo não mudou. É o par das conferências que os `spawn` fazem na CLI e no ACP. O gateway
  recusa um executor `api` sem admissão.
- **O que o runner e o host passaram a saber do modo.** O plano (`executionPlan`) monta a configuração
  MCP no modo API, como no Claude e no ACP; a admissão põe o servidor do board na configuração admitida
  no modo API, como no ACP. A sonda do perfil (`probeProfiles`) dá o modo API como presente, sem
  procurar binário nem rodar versão ou login. O repositório lê o modo gravado de um perfil pronto quando
  a ferramenta o oferece (`readyMode`): é o "um perfil por ferramenta, com o modo trocável" da épica. O
  catálogo (`TOOLS`) passa o modo API do Gemini de planejado para oferecido, com a ficha e a imposição
  (`API_ENFORCEMENT`: MCP, ferramentas e modelo impostos; agente e skills pelo pedido), e o selo
  **Recomendado** acende nele pela regra da 7.
- **Até a história 11, só a permissão `board`.** O laço só tem as ferramentas MCP. Com `edits` ou
  `full`, o driver recusa antes do primeiro pedido, com a causa ("use o Gemini pelo ACP"), e a linha do
  log fecha como não suportada. A ficha do modo diz que ele serve a Refinar, Resumir e Trabalhar na fase
  com a permissão "Só o board".
- **A chave.** Nunca no log (o gateway mascara todo valor da configuração do perfil, e o driver tira a
  chave de toda mensagem que vem de fora, inclusive a do servidor que a repete), no `ai_runs`, na
  evidência (só o digest, dentro do hash do vínculo), na tela (a configuração pública é vazia),
  na exportação (a linha do pronto não tem `secret_ref` e a configuração não vai no arquivo) nem na
  URL. Os testes leem cada uma dessas superfícies. Toda mensagem é mascarada antes de cortada (um corte
  no meio da chave deixaria o começo dela passar), e `maskApiKey` (`toolKeys.ts`) também tira o começo da
  chave cortado por outra camada (no fim do texto ou antes de "…"), no laço, na conferência e no Conectar.
- **Revisão do #375.** Uma falha ao listar as ferramentas de um MCP do card é tratada como a da conexão
  (as ferramentas dele ficam de fora, com o motivo no log; a do servidor do board encerra a execução); a
  listagem recebe o sinal do Parar e confere o Parar entre as páginas; e o validador
  `AdmittedExecution.api()` relê, antes de cada pedido e de cada chamada, a prova por construção que
  admitiu a execução: removida, alterada ou vencida no meio do laço, o próximo pedido não sai.

## O Conectar do cartão API (sobre a história 7)

- **A chave é a da ferramenta, no cofre da 7.** O modo API lê a mesma chave que o ACP usa
  (`ToolKeys`, `LocalCredentials`, uma por máquina, dono `["tool-key", "gemini"]`), pelo ponto único
  `profileApiKey(keys, perfil)` (`ai/apiKey.ts`). O gateway a entrega ao driver
  (`ExecutorContext.apiKey`, a mesma porta da 7, mascarada em toda linha) e a admissão, ao
  `bindingContext` (`AdmissionOptions.apiKey`; o contexto do vínculo ganhou `apiKey`, só preenchido no
  transporte `api`). Na CLI e no ACP a chave continua fora do vínculo, como a 7 decidiu; no modo API o
  digest dela entra, como a 9 decidiu (a conta com que o board fala é parte do que a prova prende).
- **Um perfil por ferramenta, com o modo trocável.** O cartão API conecta o mesmo perfil pronto `gemini`:
  `connect(id, { mode })` (o campo `mode` na mensagem `settings.aiProfiles.connect`, na `ConnectInput` e no
  `ConnectState`), e o perfil só passa ao modo do cartão depois de o login dar certo (`setMode` do
  Conectar → `MessageRouter.setProfileMode` → `AiProfileRepo.setMode`, só a pessoa e só um modo que a
  ferramenta oferece). O repositório lê o modo gravado do perfil pronto quando a ferramenta o oferece
  (`readyMode`). Trocar de modo recomeça o Conectar do início; o cartão ACP volta o perfil ao ACP.
- **No modo API a chave é conferida na hora.** O driver tem `apiModels(chave)` (`GET {endpoint}/models`,
  com a chave no cabeçalho, só os modelos que fazem `generateContent`): é a conferência do passo do login
  (`ConnectorDeps.checkApiKey`, não gasta a conta) e a leitura dos modelos para o catálogo. O resumo grava
  `signIn: 'api-key-checked'` e a tela diz "chave de API conferida", e o texto do campo explica que a
  conferência é agora (no ACP, o texto da 7 segue: o agente aceita sem consultar a rede). O passo
  `locate` não procura binário e a versão fica vazia; o `verify` dá o exclusivo por construção, sem sonda
  (a prova é afirmada na primeira execução, para o modelo do card), e tira a ciência do ACP, se havia,
  como a 7 faz com todo perfil que passa a provar o exclusivo.
- **A sonda de login do modo API** é a presença da chave no cofre: sem ela, "sem login" (não há outro
  login possível, diferente do ACP, em que o agente pode ter o próprio), e a faixa leva ao Conectar.
- **Dois ajustes da revisão da 7.** (a) Trocar a chave só apaga a anterior depois que a nova é aceita:
  `ToolKeys.replace(ferramenta, chave, accept)` confere primeiro (no ACP, o `authenticate`; na API, a
  lista de modelos) e só então grava e apaga a cifrada antiga; recusada, nada muda. Como a chave
  recusada não chega ao cofre, a ocultação dele não a conhece: o Conectar a mascara no erro. (b) A revisão
  da ciência é monotônica: `BoardRepo.recordCompatibilityReview` guarda a última revisão dada a cada
  perfil na tabela `meta` (`compatibility_review_issued:<board>`, fora da exportação), e revogar e dar de
  novo dá a próxima, nunca 1.

## Pendências da história 9, resolvidas

- **A prévia com o modelo do card.** `ExecutionAdmission.preview` recebe o modelo; o host o tira do alvo
  do card (`admissionModelOf`, o par de `admissionProfileOf`). No modo API, sem prova em vigor, a prévia
  avalia a que o host afirmaria (a evidência por construção dos checks garantidos, em memória), sem
  gravar nada: a prévia continua só leitura, e mostra o que a execução decidiria.
- **`migrateDown` com perfil em `api`.** O caminho de volta da 48 (`DOWN_MIGRATIONS[48]`) passa o pronto
  em `api` de base `generic` (o Gemini) a `acp`, o único modo que o schema 47 conhece para ele; antes ele
  viraria `builtin`, uma CLI pronta que o 47 não tem com esse id. A escolha da API se perde com a coluna,
  a chave fica no cofre. Sem migração nova: as colunas da 48 são texto sem `CHECK`, e a 48 ainda não saiu
  numa versão (a última tag é a 0.46.0). A importação passou a aceitar o pronto num modo que a
  ferramenta oferece (o Gemini em `api`) e segue recusando `api` em cópia, personalizado e pronto que não
  o oferece.

## Onde a especificação não cabia no código

- **A chave fora do vínculo (7) × o digest da chave no vínculo (9).** Ficam as duas regras, por
  transporte: o `bindingContext` só recebe a chave no modo API. Trocar a chave invalida a prova do modo
  API, que o host refaz sem custo na execução seguinte; a do ACP não muda.
- **"`report()` soma `usageMetadata` (`measure: 'tokens'`)".** `measure: 'tokens'` é a promessa do
  driver (`AiMeasure`); o relatório sai `full`, com os quatro contadores, como o de qualquer leitor que
  trouxe os tokens.
- **O 429.** A execução falha com a mensagem da API, o `status` e o `retryDelay` quando vem, sem tentar
  de novo e sem ligar `usageLimitReached`: a classificação (cota diária ou pausa curta) e a pausa por
  perfil são a história 12, nos três modos de uma vez.
- **Modelo padrão.** O modo API não tem modelo escondido: o vínculo é de um modelo, e sem o do card a
  execução recusa com a causa ("escolha um modelo do Gemini no campo Modelo do card").
- **`locate` sempre presente.** O `ConnectionDriver` do modo API não tem comando (`command: ''`,
  `locate` nulo); quem diz que o modo está presente é a sonda do perfil, que nem procura binário.
- **`docs/mcp.md` em inglês.** O repositório não tem `docs/mcp_EN.md`; a seção nova ficou só no
  português, e o detalhe em inglês está em `docs/harness_EN.md`.

## Alternativas descartadas

- **Iniciar a ponte `mcp-bridge.js` como processo (`StdioClientTransport`)**: daria um processo por
  execução no host do editor (no Electron, com `ELECTRON_RUN_AS_NODE`) só para repassar linhas ao socket
  que a extensão já atende. O cliente do socket é o mesmo protocolo, sem processo.
- **Chamar as ferramentas do board direto no router, sem MCP**: pularia as conferências da sessão MCP
  (token, escopo do card, operações do contrato) e as instruções do servidor; o modo API precisa ver o
  board como qualquer cliente vê.
- **Declarar todas as ferramentas e só negar na chamada**: o modelo planejaria com o que não pode usar, e
  a garantia da épica (nunca declarar o que a decisão não admite) deixaria de valer.
- **`allowedFunctionNames` com o modo `ANY`**: obrigaria o modelo a chamar uma função sempre, e o ciclo
  não terminaria com texto.
- **Afirmar a evidência no driver (`run`)**: a admissão decide antes do `run`; afirmar depois deixaria a
  primeira execução bloqueada, e o driver passaria a ter a chave das provas. Quem assina é o host.
- **Tentar de novo no 429**: a história 12 classifica a cota; uma nova tentativa às cegas gastaria a
  conta e esconderia o limite.
- **Um modelo padrão do Gemini**: um nome fixo no código envelhece com o catálogo do Google, e a prova
  seria de um modelo que a pessoa não escolheu.

## Consequências

- O Gemini oferece o modo API, e ele é o recomendado (o selo acende sozinho no cartão API do Conectar).
  Conectado pelo cartão, o perfil em API roda Refinar, Resumir e Trabalhar na fase com a permissão
  "Só o board".
- Cenário novo em `test/scenarios/cardApi.scenario.test.ts`: o Conectar de verdade pelo cartão API (a
  chave no `ToolKeys` de verdade, conferida pela lista de modelos, o modo gravado, os modelos no catálogo)
  e o card por esse perfil, do `runner.start` à mensagem na conversa, com o servidor MCP do board de
  verdade (em memória) e só a API do Gemini falsa (servidor HTTP no próprio computador), admitido por
  construção e conferido sem desvio falso (A); a chave nova recusada, que deixa a guardada e o modo como
  estavam (B); e a recusa com a permissão `full` (C).
- Testes: `test/geminiApi.test.ts` (ciclo de duas chamadas, cancelamento no meio do pedido e da chamada
  MCP, 429, limite de pedidos, tempo limite, função não declarada, chave fora de tudo),
  `test/aiGatewayApi.test.ts` (a fronteira da decisão, a evidência afirmada uma vez, a chave),
  `test/boardSelfClient.test.ts` (o cliente do socket da pasta, o token na primeira linha, nenhum
  segundo servidor), e os de admissão, repositório, migração, sonda e catálogo.
- A história 11 acrescenta as ferramentas locais (arquivo e shell) ao mesmo laço e à mesma decisão; a 12,
  a classificação do 429 e a pausa por cota.
