# Ferramenta por modo, 9: admissão do modo API

> História 9 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Depende da [história 6](ferramenta-por-modo-6-contrato-execucao.md) (o
> `Executor` e o `bindingContext`); andou em paralelo com a 7. Desenho no
> [registro da épica](ferramenta-por-modo-gemini.md), seção "Admissão: o regime é consequência do que o
> modo prova".

## Contexto

No modo API o board faz o laço de chamadas de função: monta cada pedido, declara as funções ao modelo,
decide cada chamada pelo card e a executa (história 10). Não há processo da ferramenta para sondar,
binário para conferir nem arquivo que o modelo leia por conta própria: o isolamento vale por construção.
A admissão, porém, só conhecia dois transportes (`cli` e `acp`), toda prova vinha de sonda
(`source: 'host-probe'`), o vínculo exigia um executável e o perfil só aceitava os modos `cli` e `acp`.
Esta história é a parte pura da admissão do modo API, testável sem rede; o laço é a 10.

## Decisão

- **`ExecutionTransport` ganha `'api'`, com os próprios checks.** `API_CAPABILITY_CHECKS` tem um check
  por capacidade, cada um a afirmação que o laço cumpre: `board-built-request` (o board monta a conversa
  inteira em cada pedido), `no-own-context-files` (o modelo só recebe o que o board manda),
  `declared-functions` (só as funções da decisão são declaradas e cada chamada passa por ela),
  `board-mcp-client` (o board é o cliente MCP, só dos servidores e operações admitidos) e
  `no-native-delegation`. Os ids não repetem os da CLI nem os do ACP, então um recibo de outro
  transporte nunca casa. `capabilityChecks('api')` os devolve.
- **O estado de evidência `by-construction` é a fonte da prova.** `CapabilityEvidence.source` passa a
  `'host-probe' | 'by-construction'`, e `evidenceSource(transport)` diz qual cada transporte aceita:
  `api` só a por construção, `cli` e `acp` só a de sonda. `assessCapability` ganhou o parâmetro da fonte
  (o padrão é a de sonda) e trata a fonte errada como `invalid`, nunca como parcial: uma evidência
  sintética nunca prova uma CLI, e uma sonda não prova o modo API. `admitExecution`,
  `evidenceCapabilities` e `evidenceCurrent` passam a fonte do transporte. O estado e o motivo da
  avaliação continuam `verified`/`verified`: a decisão gravada em `ai_runs.admission_json` não muda de
  formato, e uma versão anterior lê a de agora.
- **Assinada pelo host com o mesmo HMAC.** `constructionEvidence(binding, now)` monta um recibo por
  check, todos `passed`, com o recibo igual ao digest da afirmação (fonte, capacidade, check e vínculo),
  e `CapabilityEvidenceStore.recordByConstruction` grava e assina com a chave local das provas das
  sondas. Trocar a fonte no arquivo quebra a assinatura. A validade é a mesma das sondas (14 dias); como
  refazer não custa nada, vencer só obriga o host a afirmar de novo.
- **O vínculo do modo API não tem executável.** `BindingInvocation` virou `ProcessBinding | ApiBinding`;
  o do modo API é `{ api: { transport, endpoint, model, extensionVersion, keyDigest } }`, montado por
  `apiBinding` (`ai/apiBinding.ts`). `ExecutionAdmission.binding` canoniza e faz o hash com a identidade
  do host (plataforma, arquitetura, runtime), o perfil, a ferramenta e o escopo ou a pasta; fica fora o
  que só existe com um processo: executável, binário, ambiente e políticas gerenciadas. Sem políticas a
  conferir, o ambiente é completo por construção, e `executable` vem vazio (os dois validadores de
  comando recusam o modo API com "A admissão é do modo API, …"). Um driver cujo vínculo não bate com o
  transporte é recusado. A prova fica presa à versão da extensão (é o código dela que cumpre os checks),
  ao endpoint e ao modelo: outro modelo é outro vínculo.
- **O modelo entra no vínculo de isolamento só no modo API.** `isolationInput` e `isolationBinding`
  ganharam o modelo, opcional e nulo por padrão; o `prepare` o passa só quando o transporte é `api`. O
  vínculo da CLI e do ACP continua sem ele, mesmo com o modelo no card (teste com a régua).
- **O digest da chave, nunca a chave.** `apiKeyDigest` é um HMAC-SHA-256 com o rótulo fixo
  `faz-ai/api-key/v1` (não o SHA-256 puro, para o digest não servir de consulta a uma tabela de chaves
  vazadas). O endpoint só aceita HTTPS (HTTP só no próprio computador, para o servidor falso da 10), sem
  credencial nem parâmetros na URL (a API do Gemini aceita a chave em `?key=`), e nenhuma mensagem de
  erro repete a chave ou o endereço. A configuração do perfil, onde a chave mora no cofre, não entra no
  contexto do vínculo no modo API: dela só o digest entra, pelo driver. O teste lê todos os arquivos da
  pasta de evidências, a decisão gravada, a mensagem do bloqueio e tudo o que foi para o console, e
  confere que nem a chave nem o digest aparecem.
- **`PROFILE_MODES` aceita `api`, sem migração.** As colunas da 48 (`ai_profiles.mode`, `ai_runs.mode`)
  são `TEXT` sem `CHECK` (conferido no `schema.ts`), como a história 4 deixou de propósito. O log lê
  `api` como gravado e a importação aceita execuções em `api`. Nenhum perfil roda no modo ainda: a
  importação recusa `api` em qualquer linha de perfil (pronta, cópia ou personalizada, com ou sem a
  ferramenta gravada). A linha do pronto ainda sem ferramenta (legada ou não preenchida) também passou a
  ter o modo conferido: vale o modo do pronto ou o padrão da coluna (`cli`), então um pronto de CLI em
  `acp` é recusado; até aqui o modo só era comparado quando a ferramenta vinha gravada.
- **Sem driver da API, o perfil no modo API é recusado com a causa.** `admissionTransport` e o modo
  gravado pelo gateway leem o modo declarado (`api` antes do resto); `isAcpProfile` nunca diz ACP para
  um perfil em `api` (o Gemini pronto traz o agente ACP do código); `executorOf` só devolve o driver de
  transporte `api` e, sem ele, lança "O modo API de Gemini ainda não roda nesta versão da extensão." em
  vez de cair no executor de CLI ou no agente ACP. Na prévia isso vira `executor-unavailable`. Nenhum
  driver `api` foi registrado, e o Gemini continua oferecendo só o ACP, com a API "planejada" em `TOOLS`
  até a história 10.
- **`ExecutionAdmission` aceita o `executorOf` como opção**, com o registro como padrão. É a costura que
  deixa testar o vínculo e a admissão do modo API com um executor falso antes de existir o driver.

## Prova de que os vínculos de CLI e ACP não mudaram

- A régua da história 6 (`test/helpers/bindingReference.ts`) não mudou, e o teste "os mesmos vínculos
  com o contrato de execução" segue verde para todos os perfis e entradas dele.
- Novo, em `test/admissionBoundary.test.ts`: a execução admitida do Claude com um modelo no card fica
  presa ao vínculo de isolamento da régua (sem modelo), o do ACP também, e a admissão com o executor
  injetado dá o mesmo vínculo fora do modo API.

## Onde a especificação não cabia no código

- **"O estado de evidência `by-construction`"**: virou a fonte da evidência, não um terceiro valor de
  `CapabilityState` nem um motivo novo. Um motivo novo mudaria o formato da decisão de admissão gravada
  no log e exportada, e uma versão anterior recusaria o arquivo; a fonte já separa as duas provas onde
  importa, na leitura.
- **"`bindingContext` sem executável (endpoint, modelo, versão, digest da chave)"**: além desses quatro,
  o contexto leva a identidade do host, o perfil, a ferramenta e o escopo ou a pasta, como nos outros
  transportes; o que sai é só o que pertence a um processo.
- **Digest da chave × história 3.** A história 3 tirou do vínculo o valor das credenciais do ambiente
  (só a presença entra), para a rotação do token não derrubar a prova. Aqui a chave entra pelo digest:
  ela identifica a conta e o projeto com que o board fala, e a prova do modo API é refeita sem sonda, então
  trocar a chave não custa uma verificação.
- **Quem afirma a evidência.** Nenhum código de produção chama `recordByConstruction` nesta história:
  o laço não existe, e afirmar antes dele seria assinar uma promessa que ninguém cumpre. O driver da API
  (história 10) a afirma para o vínculo atual quando não achar prova em vigor.
- **A prévia sem modelo.** `preview` monta o vínculo de isolamento sem o modelo do card; no modo API isso
  dá `executor-unavailable`. A 10 passa o modelo do alvo do card à prévia.
- **O caminho de volta da 48** (`DOWN_MIGRATIONS[48]`) não sabe de perfil em `api`, que não existe no
  schema 47. Como nenhum perfil grava `api` nesta versão, a migração que já saiu não foi tocada; a 10,
  ao gravar o primeiro, decide se precisa de um formato novo (e de um caminho de volta).

## Alternativas descartadas

- **Afirmar a evidência por construção dentro de `admitExecution`** (o transporte `api` dispensaria
  evidência): a decisão pura deixaria de depender de algo que o host assinou, e um perfil marcado `api`
  por engano seria admitido sem nada gravado. A evidência assinada mantém uma só regra para os três
  transportes.
- **Aceitar a evidência de sonda no modo API**: não há o que sondar; a fonte errada é inválida nos dois
  sentidos.
- **SHA-256 puro da chave**: serve de consulta a uma lista de chaves vazadas; o HMAC com rótulo não.
- **Registrar um driver `gemini/api` que lança no `run`**: o teste de drivers exige que modo planejado
  não tenha driver, e o Conectar passaria a oferecer o modo. O executor falso fica no teste.
- **Nova migração para `api`**: as colunas já são texto sem `CHECK`.

## Consequências

- Nenhuma mudança visível nem de comportamento: nenhum perfil roda em `api`, os vínculos de CLI e ACP
  são os de antes (nenhuma prova perde a validade) e não há entrada no CHANGELOG. Nenhum cenário novo em
  `test/scenarios/`: o caminho do card até a conversa é o mesmo; o do modo API entra com o laço (10).
- A história 10 escreve o driver `gemini/api` (`transport: 'api'`, `bindingContext` com `apiBinding` e
  a chave do cofre), afirma a evidência por construção para o vínculo atual e cumpre, com teste
  unitário, cada check de `API_CAPABILITY_CHECKS`; também acrescenta o validador da execução admitida do
  modo API ao lado dos de comando.
- `CONTRIBUTING.md` e `CONTRIBUTING_EN.md` ("Como entra uma ferramenta de IA") descrevem o vínculo do
  modo API; `docs/dados.md` e `docs/dados_EN.md`, o modo `api` no formato.
