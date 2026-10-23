# Ferramenta por modo, 12: limite de uso e consumo do Gemini nos três modos

> História 12 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23, depois da [história 8](ferramenta-por-modo-8-gemini-cli.md) (Gemini pela CLI) e da
> [história 10](ferramenta-por-modo-10-gemini-api-mcp.md) (Gemini pela API), que deixaram o 429 para esta.

## Contexto

O Gemini roda em três modos, e os três falam da mesma cota: a da API do Gemini, por chave. A CLI já ligava
`usageLimitReached` por uma expressão no texto do erro, sem dizer quando a cota renova; o ACP e a API não
ligavam nada (a história 10 deixou o 429 como falha comum, de propósito). Sem o sinal, o runner bloqueava o
card esperando a pessoa, a pausa por perfil não valia e a política com a falha `quota` nunca disparava. Do lado
das políticas havia um segundo bloqueio: o catálogo delas era a lista fixa das três CLIs prontas, e uma
política com o perfil `gemini` saía "Destino inválido" ao salvar.

### O que foi conferido, e onde

Fontes oficiais lidas em 2026-10-23, rótulo **verificado na documentação**:

- ai.google.dev/gemini-api/docs/rate-limits: o limite estourado volta como `429 RESOURCE_EXHAUSTED`, e
  "Requests per day (RPD) quotas reset at midnight Pacific time";
- ai.google.dev/gemini-api/docs/troubleshooting: o 429 é erro transitório, para nova tentativa com espera;
- o formato do erro é o `google.rpc.Status` (`code`, `status`, `message`, `details`), com
  `google.rpc.QuotaFailure` (violações com o `quotaId`) e `google.rpc.RetryInfo` (`retryDelay`, uma
  `google.protobuf.Duration` em JSON, como `"41s"`).

Lido no pacote instalado (`@google/gemini-cli` 0.65.0, `bundle/`), rótulo **verificado no código**:

- `classifyGoogleError` (`googleQuotaErrors.js`): violação com `PerDay` ou `Daily` no `quotaId` vira
  `TerminalQuotaError("You have exhausted your daily quota on this model.")`; sem detalhes, a mensagem com
  "Please retry in 41.5s" dá a espera; o `retryDelay` vira "Suggested retry after 41s."; os motivos
  `MODEL_CAPACITY_EXHAUSTED`, `INSUFFICIENT_G1_CREDITS_BALANCE`, `QUOTA_EXHAUSTED` e `RATE_LIMIT_EXCEEDED`
  são cota;
- `GeminiAgent.prompt` (o modo ACP): o erro do turno (`GeminiEventType.Error`, com o `status` do erro) volta no
  `session/prompt` como `RequestError(status, mensagem)`, isto é, um erro JSON-RPC com o status HTTP no `code`
  (429 na cota), e um 429 que escapou das tentativas da CLI volta como `RequestError(429, "Rate limit
  exceeded. Try again later.")`;
- na CLI de uma passada, o mesmo erro sai no `result` com `status: "error"` (a fixture
  `test/fixtures/gemini-stream-json-quota.jsonl`, gravada na história 8 com a 0.65.0 contra uma API local).

**Não validado ao vivo**: nenhuma chamada paga foi feita. Os corpos do 429 da API em
`test/fixtures/gemini-api-429-*.json` foram montados no formato do `google.rpc.Status` da documentação e dos
campos que a CLI lê, não gravados contra a API do Google; o erro JSON-RPC do ACP no cenário é o que o código
da 0.65.0 monta, não uma captura. A história 14 (teste real) confere os dois.

## Decisão

- **Uma classificação para os três modos**: `classifyGeminiFailure` (`ai/drivers/gemini/limit.ts`), que
  recebe a falha como o transporte a viu (`ToolFailure`: a mensagem, o código HTTP ou JSON-RPC, o status do
  `google.rpc.Status` e o corpo) e devolve `FailureClass` (`usageLimitReached` e `usageLimitHint`). É o limite
  quando o código é 429, o status é `RESOURCE_EXHAUSTED`, há `QuotaFailure`, um motivo de cota no `ErrorInfo`,
  ou o texto é um dos da CLI. O JSON do erro que a CLI escreve dentro da mensagem também é lido.
- **O contrato do driver ganhou `classifyFailure`** (`Executor`, opcional). Os três drivers do Gemini
  expõem a mesma função, e o leitor de cada modo a usa: o `gemini-stream-json` no erro do `result`, nos avisos
  e no `stderr`; o leitor do ACP no erro JSON-RPC do `session/prompt` (`AcpReader.fail`, chamado pelo
  transporte só com o `RpcError` do agente, nunca com um erro do próprio board); o laço da API na resposta
  HTTP de erro. A diferença entre as ferramentas fica explícita: o Claude Code e o Kimi Code continuam com o
  leitor deles; o Cursor e os demais agentes ACP não declaram `classifyFailure`, e um 429 deles segue sendo
  falha comum (o board não adivinha pelo texto de um agente que não conhece; no ACP o agente declara a
  função no catálogo, `AcpAgent.classifyFailure`).
- **A dica de renovação ganhou dois campos** (`UsageLimitHint`, `shared/usageLimit.ts`), resolvidos por
  `resetAtOf` com o relógio do host:
  - `dailyResetZone`: a cota diária renova à meia-noite desse fuso (`America/Los_Angeles` no Gemini); a
    pausa vai até lá, mais a folga de 3 minutos de sempre;
  - `retryAfterMs`: a espera que a API pediu (o `retryDelay`, ou o "Please retry in"), a partir do fim da
    execução: a pausa curta do limite por minuto. O leitor não tem relógio, por isso guarda a duração.
  A cota diária vence o `retryDelay`: nela a API pode mandar uma espera curta, e a fila voltaria a esbarrar no
  limite a cada poucos minutos até a meia-noite. Sem nenhum dos dois, a pausa usa o backoff (5 min, dobrando).
- **A pausa por perfil e a falha `quota` das políticas passam a valer para o Gemini** sem mudança no runner:
  ele já decide pelo sinal estrutural do relatório. O que faltava era o sinal (acima) e o catálogo das
  políticas.
- **O catálogo das políticas são os perfis do board** (`builtinPolicyCatalog`, `shared/policyManagement.ts`):
  todo perfil do board (os da extensão, as cópias e os personalizados), com a ferramenta do catálogo de
  modelos (`catalogTool`) e o rótulo com o modo ("Gemini · API"; a cópia e o personalizado pelo nome). Todo
  perfil entra como ligado: o catálogo não representa instalação, login nem admissão, e quem confere o destino
  na execução é `runTargetOfPolicy` (perfil ligado e modelo no catálogo dele). O simulador, o editor e o
  salvar usam o mesmo catálogo. A política grava o id do perfil, não o modo: trocar o Gemini de modo no
  Conectar mantém as políticas.
- **O Consumo mostra o modo**: o painel ganha o corte **Modo da ferramenta** (`mode`, `cli`/`acp`/`api`, a
  coluna `ai_runs.mode` da migração 48), no detalhe e no arquivo mensal (`log_months` com `dim='mode'`, sem
  migração: a tabela é longa). O `get_metrics` aceita `group_by: 'mode'`. A linha da ferramenta continua
  somando os três modos.
- **O Diagnóstico mostra o modo** no título do bloco de cada perfil.
- **O catálogo de modelos guarda a data da leitura**: `ModelOption.readAt`, posto por `rememberModels` em
  cada modelo lido da ferramenta (Detectar modelos, Conectar), e Configurações › Modelos de IA diz "lista lida
  da ferramenta em …" com a mais recente.

## Onde a especificação não cabia no código

- **"`retryDelay` → pausa curta"**: a pausa é o `retryDelay` mais a folga de 3 minutos que toda renovação
  ganha (`LIMIT_SLACK_MS`, do caso real #615). Para 41 s dá 3 min 41 s, ainda curta; tirar a folga só para o
  Gemini criaria uma regra a mais para um ganho de segundos.
- **A cota diária "→ próximo reset"**: o erro não traz o horário. O horário é a regra publicada da API (meia-
  noite do Pacífico), não um dado da resposta; se o Google mudar a regra, muda a constante
  `GEMINI_DAILY_RESET_ZONE`.
- **O `stderr` da CLI**: segue contando como cota quando a linha fala de cota, como na história 8. A linha do
  assistente que menciona "quota" deixou de ligar o limite (antes toda linha passava pela expressão, inclusive
  o texto do modelo).
- **Meses arquivados antes desta versão** não têm o corte por modo; as execuções deles não tinham modo
  gravado, e o corte as mostra como "não definido" só no detalhe.

## Alternativas descartadas

- **Classificar no gateway, por texto, para toda ferramenta**: o gateway não sabe ler o erro de cada uma, e
  uma expressão genérica ligaria a pausa no 429 de um agente que não é de cota.
- **Tentar de novo no 429 dentro do driver**: gastaria a conta e esconderia o limite; a fila volta depois da
  pausa, e a política decide a troca de modelo.
- **Guardar o instante da renovação no leitor**: o leitor não tem relógio (é o que deixa os testes
  determinísticos); a duração e o fuso são resolvidos pelo host, como o `resetsAt` do Claude Code.
- **Uma dimensão `tool·mode` no lugar de `tool`**: mudaria o significado do corte por ferramenta e dos meses
  já arquivados.
- **Catálogo das políticas só com os perfis ligados**: uma política salva com um perfil desligado viraria
  "conjunto inválido" e bloquearia todas as outras.

## Consequências

- Cenário novo `test/scenarios/cardGeminiLimit.scenario.test.ts`: o card no perfil `gemini` em cada modo, com
  a ponta externa devolvendo o limite: na API, o 429 por minuto (pausa curta, um pedido só) e o diário (meia-
  noite do Pacífico); no ACP, o 429 diário e o "Rate limit exceeded" (backoff); na CLI, a fixture gravada da
  cota diária. Em todos, o card volta para a IA, o perfil fica pausado até a hora certa e a conversa diz até
  quando. Mais um caso com política de quota (o Pro esgota e a execução segue no Flash, sem pausa) e o da chave
  recusada (bloqueio, sem pausa).
- Testes: `test/usageLimit.test.ts` (a classificação com as mensagens da CLI, do ACP e da API; `resetAtOf` com
  a meia-noite do Pacífico nos dois lados do horário de verão; os três drivers com a mesma função),
  `test/acpTransport.test.ts`, `test/aiOutputGemini.test.ts`, `test/geminiApi.test.ts`,
  `test/policyManagement.test.ts`, `test/environment.test.ts`, `test/panelSections.test.ts`,
  `test/metricsArchive.test.ts`, `test/cursorModels.test.ts` e as telas (`environment`, `metricsBreakdown`,
  `models`).
- Docs: `docs/metricas.md`, `docs/configuracoes.md`, `docs/automacao.md`, `docs/harness.md` (pt e en) e
  `docs/mcp.md`; CHANGELOGs.
