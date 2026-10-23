# Ferramenta por modo, 7: Conectar, o Gemini em ACP com a chave no cofre

> História 7 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23, em dois PRs empilhados: 7a (host, handlers, mensagens) e 7b (tela). Depende da
> [história 6](ferramenta-por-modo-6-contrato-execucao.md); entrou depois da história 9 (admissão do modo API),
> que andou em paralelo.

## Contexto

Até aqui, ligar o Gemini ao board pedia conhecer o terminal (`gemini` para entrar), o regime de admissão do
board (Harness › Ferramenta e execução) e o comando "Verificar o isolamento da CLI de IA". Desde 18/06/2026 o
Gemini CLI não entra mais com conta individual Google (ela foi para o Antigravity): para o Gemini, entrar na
conta é a chave de API.

O que o Gemini CLI 0.65.0 faz com a chave, lido no pacote instalado (`bundle/gemini-*.js`, `GeminiAgent`):

- `initialize` anuncia `authMethods` `oauth-personal`, `gemini-api-key` (com `_meta: { "api-key": { provider:
  "google" } }`), `vertex-ai` e `gateway`;
- `authenticate({ methodId: "gemini-api-key", _meta: { "api-key": "<chave>" } })` guarda a chave em
  `this.apiKey`, chama `refreshAuth` e grava só `security.auth.selectedType` nas configurações do usuário;
- `session/new` usa `getAuthDetails()` (a chave em memória) e recusa com `-32000` sem ela.

A chave vive só na memória do processo. Cada processo do agente (a execução de um card, cada handshake do
verificador, a leitura de modelos) precisa autenticar de novo.

## Decisão

### Host (7a)

- **Login por chave pelo protocolo, dado do agente.** `AcpAgent.apiKeyAuth = { methodId }` (só o Gemini no
  catálogo); o driver ACP o anuncia como `DriverAuth { kind: 'api-key', methodId, terminal }`. `acpAuthenticate`
  (`acp/connection.ts`) manda o `authenticate` logo depois do `initialize`, só quando o agente anuncia o método.
  O transporte (`spawnAcp`), a leitura de modelos (`acpSessionModels`), os handshakes do verificador e a
  sondagem de login do Conectar (`acp/signIn.ts`, só `initialize` e `authenticate`) usam o mesmo. Sem chave no
  cofre, nada muda: vale o login que o agente já tiver (`GEMINI_API_KEY`, o do terminal). Na execução, um agente
  que não anuncia o método segue sem a chave (o log diz); no Conectar, isso é erro do passo do login.
- **O cofre das chaves é por ferramenta, na máquina** (`ToolKeys`, `src/extension/toolKeys.ts`): o valor vai
  para o cofre local (`LocalCredentials`, AES-GCM, a mesma pasta e a mesma chave local dos perfis), com dono
  `["tool-key", ferramenta]`; o índice ferramenta → referência fica em `<dados da extensão>/tool-keys.json`
  (0600), fora do banco do board. A conta e a cota do Gemini são as mesmas em toda pasta e nos três modos; a
  história 8 (CLI) e a 10 (API) leem a mesma chave.
- **A chave nunca volta.** Ela entra pela mensagem `settings.aiProfiles.connect` (só pela HostBridge, nunca por
  `router.handle`, então não passa pelo log de eventos nem pelo MCP), vai ao cofre e, em cada processo, ao
  `_meta` do `authenticate`. O gateway recebe a chave por `apiKey(profile)`, entrega ao driver
  (`ExecutorContext.apiKey`) e a mascara em toda linha do log e mensagem de erro, sem depender de o cofre já a
  conhecer. O vínculo da admissão não a vê (`bindingContext` não recebe o contexto da execução): trocar a chave
  não invalida as provas. Os testes procuram a chave no log, no estado publicado, no snapshot, na conversa, no
  `ai_runs`, no banco inteiro, na exportação e nas provas gravadas, e conferem que no `stdin` do agente ela só
  aparece no `authenticate`.
- **`connect(profileId)`** (`src/extension/ai/connect.ts`, `Connector`): `locate` (executável e versão) →
  login pelo `auth` do driver (`api-key`: a chave colada vai ao cofre e ao `authenticate`; `login-command`: a
  sonda de login da CLI, com o comando quando falta; `acp-authenticate`: o terminal) → `verify` (o verificador
  do host grava as provas do perfil) → ciência → modelos (`settings.models.detect` junta ao catálogo) →
  "Conectada", com o resumo gravado (versão, login, regime, revisão, modelos, data) na tabela `meta`
  (`ai_connections`, fora da exportação). Um passo que espera a pessoa (a chave, a ciência) para com
  `waiting`; o erro fica no passo (`failed`), e "Tentar de novo" é o mesmo pedido. A ciência retoma de onde
  parou, sem refazer as sondas. Dois cliques seguidos viram uma conexão só. O fluxo é o mesmo para toda
  ferramenta do catálogo: Claude Code, Cursor e Kimi Code passam pelo mesmo `connect`, pelo `auth` do driver.
- **O regime sai das provas** (`regimeFromEvidence`, `src/shared/connect.ts`): as cinco capacidades provadas →
  exclusivo; permissões, MCP e delegação provadas (o mínimo da admissão) → compatível, com o passo de ciência;
  menos que isso → o passo `verify` falha com os pendentes. No ACP o resultado é sempre compatível
  (`own-context-files` fica `unavailable`). Perfil sem sonda (Cursor, Kimi Code): sem regime e sem ciência.
- **Ciência por perfil** (`RunnerConfig.compatibilityReviews`): o clique "Entendo o que a ferramenta carrega"
  sobe a revisão daquele perfil (`BoardRepo.recordCompatibilityReview`). Só o host grava: o patch do runner que a
  tela manda tem o campo descartado, como já era com `compatibilityReviewRevision`. `admissionRegimeOf(runner,
  profileId)` dá primeiro a ciência do perfil; sem ela, o regime do board (quem o ligou antes desta história
  continua com ele em todo perfil).
- **O gateway aplica o regime do perfil** (`AiGatewayDeps.regimeOf`), num lugar só: quem monta o pedido de
  admissão (o runner legado, o chat, o teste do perfil, o v1) nem sempre sabe o perfil final; o gateway sabe. A
  prévia de admissão do host e o Diagnóstico usam a mesma regra.
- **Login no Diagnóstico e na faixa.** A sonda de login do driver com chave responde `true` quando a chave está
  no cofre e `null` ("não verificado") sem ela, nunca `false`: o agente pode ter o login dele. A presença da
  chave entra no cache da sonda, para guardar a chave valer na hora. A mensagem de "pede login" do agente com
  chave aponta o Conectar; a dos outros segue no terminal.
- **Sem verificação por cima do Conectar.** A verificação automática da história 2 e 3 (ao ligar, ao conferir o
  ambiente) não roda enquanto o Conectar do perfil está em curso, e passa a autenticar com a chave do cofre: o
  Gemini deixa de ficar com a prova falha por `auth_required` quando a pessoa usa a chave do board.

## Onde a especificação não cabia no código

- **"Cofre (`SecretStorage`)"**: o host do board não depende do `vscode` (roda também no `faz-ai` pelo
  terminal e no navegador). O cofre é o `LocalCredentials` que o board já usa para os perfis, como pede o
  registro da épica ("cofre local, `LocalCredentials`, AES-GCM, sem `vscode`").
- **"Grava `compatibilityReview` por perfil"**: a revisão mora na configuração do runner (JSON do board), por
  perfil, e não numa coluna de `ai_profiles`: não pede migração e segue o lugar da revisão do board.
- **A chave não é validada na API.** O `authenticate` do Gemini 0.65.0 não chama a rede; a chave é "aceita pelo
  agente". Uma chave inválida só aparece na primeira chamada ao modelo (a execução falha com a mensagem do
  Gemini). A leitura de modelos pela API, com a mesma chave, entra na história 8.

## Alternativas descartadas

- **Chave em `GEMINI_API_KEY` no ambiente do agente**: o ambiente entra no vínculo (só a presença, para
  credenciais) e vazaria para os servidores MCP que o agente inicia; o protocolo já tem o lugar da chave.
- **Chave no cofre do perfil (`secret_ref` da linha)**: o perfil pronto não tem cofre (a importação recusa
  `secret_ref` nele), e a chave é da conta, não do board.
- **Regime do pedido trocado em cada chamador**: seis lugares para lembrar; um esquecido rodaria o perfil no
  regime errado.
- **Sonda de login que diz `false` sem a chave do board**: derrubaria quem já usa o Gemini pela variável de
  ambiente.

## Consequências

- Cenário novo `test/scenarios/connectGeminiAcp.scenario.test.ts`: o Conectar de ponta a ponta com o agente
  falso (um processo por spawn, que guarda a chave só na memória), do `locate` a "Conectada", e um card por esse
  perfil, admitido no regime compatível da ciência do perfil, com o regime do board em exclusivo.
- O agente falso (`test/fakes/acpAgent.ts`) ganhou o `authenticate`, o `initialize` do Gemini 0.65.0
  (`GEMINI_INITIALIZE`) e a fábrica `FakeGemini`, que inicia o servidor MCP de teste do verificador.
