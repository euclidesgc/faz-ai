# Ferramenta por modo, 5: contrato de conexão (`ConnectionDriver`)

> História 5 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23. Desenho do contrato no [registro da épica](ferramenta-por-modo-gemini.md),
> seção "Contrato por modo, em duas partes". Feita em paralelo com a história 4 (perfil = ferramenta ×
> modo), da qual depende na ordem da épica.

## Contexto

O que cada ferramenta de IA tem de próprio para a conexão (o comando, o instalador, a página, o login,
a sonda de status, a lista de modelos, o que o board impõe) estava espalhado em tabelas por `AiBase`:
`CLI_DOCS` e `INSTALL` (`environment.ts`), `LOGIN_COMMAND` lido por `baseValue` nos requisitos, o
`if` por base em `profileSignedIn` (`cliProbe.ts`), o `cursor | kimi` fixo da leitura de modelos
(`boardHost.ts`) e `EXEC_ENFORCEMENT` (`shared/execution.ts`). A épica quer que entrar com uma
ferramenta seja escrever um driver e uma linha num catálogo, sem tocar no board, nas telas nem na
admissão.

## Decisão

- **Catálogo `TOOLS`** (`src/shared/aiTools.ts`): Gemini primeiro, Claude Code, Cursor, Kimi Code e os
  agentes ACP prontos (`ACP_READY_AGENTS`: Codex, OpenCode, GitHub Copilot CLI, Qwen Code, goose,
  Google Antigravity). Cada entrada traz a página, a nota de cobrança, os modos oferecidos com a ficha
  de oito linhas e o que o board impõe (`enforcement`), os modos planejados e o recomendado com o
  motivo.
- **Drivers** (`src/extension/ai/drivers/`): `claude/cli`, `cursor/cli` e `kimi/cli` envolvem os
  providers atuais por `cliDriver` (a medição é a do provider); `gemini/acp` e os demais agentes de
  `ACP_AGENTS` passam por `acpDriver` (comando, página, `login` e `acpMeasure` do agente). O registro
  é `driverFor(tool, mode)`; `driverOf(perfil)` acha o driver de um perfil.
- **Quem consulta o driver**: `profileVersion` (argumentos de versão) e `profileSignedIn` (a sonda de
  login) em `cliProbe.ts`; o comando de login da faixa de requisitos; o instalador e a página do
  Diagnóstico (`CLI_DOCS` e as linhas das CLIs em `INSTALL` saíram de `environment.ts`); a leitura de
  modelos do host (a ferramenta lê modelos quando o driver tem `listModels`, e o executável vem de
  `locate`). As sondas por ferramenta (`claudeSignedIn`, `cursorModels`, `kimiSignedIn`...) foram para
  os drivers e seguem exportadas por `cliProbe.ts`; `runCli` foi para `cliRun.ts`, para os drivers não
  importarem `cliProbe`, que os importa.
- **`EXEC_ENFORCEMENT` vem do catálogo.** A webview lê `enforcementOf`, e `src/shared` não importa a
  extensão; por isso o que o board impõe por modo mora na linha de `TOOLS`, e o driver repete o valor
  dali (o teste confere que são iguais). `EXEC_ENFORCEMENT` virou a vista das CLIs prontas, com os
  mesmos valores; `enforcementOf` escolhe a linha pela ferramenta e pelo modo do perfil, com a linha
  do protocolo (`ACP_ENFORCEMENT`) para o agente ACP fora do catálogo da tela e tudo orientação na CLI
  personalizada, como antes.
- **Adaptador `toolModeOf(perfil)`**, isolado em `aiTools.ts`: enquanto a história 4 não dá ao perfil
  os campos `tool` e `mode`, eles saem dos campos atuais, com a mesma regra de `isAcpProfile` (que
  decide o transporte no gateway): perfil genérico com `acpAgent` → `(acpAgent, 'acp')`; CLI pronta e
  cópia → `(base, 'cli')`; CLI personalizada → sem driver. Quando a 4 entrar, a função passa a ler os
  campos e os chamadores (`driverOf`, `enforcementOf`) não mudam. No personalizado ACP a ferramenta é
  o agente do catálogo (é o driver dele que vale), não o id do perfil: conferir isso na troca.
- **Modos planejados, explícitos.** O Gemini oferece só o ACP; a CLI (história 8) e a API (10) entram
  em `planned`, com a história. O teste exige que um modo planejado não tenha driver: quando o driver
  entrar, o modo passa para `modes`, com a ficha. O Cursor e o Kimi Code têm entrada em `ACP_AGENTS`
  (e driver ACP, porque um perfil personalizado com `acpAgent` já os roda), mas o catálogo não oferece
  o modo ACP deles até o teste real.
- **`AGENT_TOOLS` conhece o Gemini, sem virar `AiBase`.** A tabela ganhou `gemini`, com os nomes
  internos da referência de ferramentas do Gemini CLI (geminicli.com/docs/reference/tools, de
  2026-09-01) conferidos no pacote 0.65.0 instalado (`read_file`, `read_many_files`, `list_directory`,
  `glob`, `grep_search`, `list_mcp_resources`, `read_mcp_resource`, `replace`, `write_file`,
  `run_shell_command`, `web_fetch`, `google_web_search`, `activate_skill`, `write_todos`); o
  subagente dele aceita a lista no `tools` do frontmatter (geminicli.com/docs/core/subagents). A
  delegação fica fora: os subagentes do Gemini viram ferramentas com o nome de cada agente. A lista de
  `native.tool` da admissão e a da validação do plano de contexto passaram a `NATIVE_AGENT_TOOLS`
  (`''` e as chaves de `AGENT_TOOLS`), e a admissão lê a tabela por `agentToolsOf`, que conhece o
  Gemini. O Gemini **não** entrou em `AiBase` nem em `isAiBase`/`baseValue`: são eles que decidem
  quem traduz as ferramentas de um agente (`agentOfArtifact`). O perfil ACP do Gemini segue mantendo
  as ferramentas do card no vocabulário do card, que é o que `ACP_KIND_EQUIVALENTS` espera, e entra na
  admissão como `generic`, sem ferramenta nativa traduzida, como antes (cenários D e E de
  `test/scenarios/cardAcp.scenario.test.ts` verdes).

## Onde a especificação não cabia no código

- **"O modo recomendado é um dos oferecidos"**: o registro da épica recomenda a API para o Gemini, e
  ela só é oferecida na história 10 ("na 10 ele acende sozinho, sem regra provisória"). Seguindo o
  espírito da épica, o recomendado pode ser um modo planejado; o teste confere que ele é um dos modos
  da ferramenta (oferecido ou planejado), e `recommendedOffered` devolve o modo só quando ele é
  oferecido, que é a regra do selo da tela.
- **"`EXEC_ENFORCEMENT` passa a consultar o driver"**: `src/shared` não pode importar a extensão. O
  valor mora no catálogo compartilhado, que é a metade do driver que a webview enxerga.
- **`verify` e `classifyFailure`** estão no desenho do `ConnectionDriver`, mas ninguém os chamaria
  nesta história sem mudar comportamento: entram com o Conectar (7) e com o limite de uso (12). O
  `auth` do ACP ainda é o login no terminal (`acp-authenticate` com o comando do agente); o `api-key`
  entra na 7.
- **A ficha não tem tradução ainda.** O texto de `TOOLS` é de interface, mas nenhuma tela o mostra
  nesta história; a tradução em `i18n/en/` e a entrada no teste de i18n vêm com a tela do Conectar
  (7), quando o texto for revisto lado a lado com os cartões. As duas dicas novas de `AGENT_TOOLS`
  (`read_many_files`, `list_directory`) já têm tradução, porque o teste de i18n lê a tabela inteira.
- **Feita antes da história 4.** Os campos `tool` e `mode` do perfil ainda não existem; o adaptador
  acima os substitui (ver Decisão).

## Alternativas descartadas

- **Pôr o Gemini em `AiBase`**: `baseValue(AGENT_TOOLS, 'gemini')` passaria a traduzir as ferramentas
  do card para o vocabulário do Gemini no perfil ACP, e a conferência (`ACP_KIND_EQUIVALENTS`, no
  vocabulário do card) acusaria desvio onde não há; além disso, `AiBase` é "CLI pronta" em dezenas de
  pontos (providers, pastas do harness, `AGENT_FORMAT`).
- **Tabela do Gemini vazia** (como a do Cursor): diria que o subagente do Gemini não aceita lista de
  ferramentas, o que a documentação dele contradiz.
- **`enforcement` só no driver, com a webview recebendo pelo estado**: mudaria a mensagem do host
  para a webview sem ganho nesta história; o catálogo compartilhado já é a fonte única.
- **Driver só para os modos que o catálogo oferece**: o Cursor e o Kimi Code pelo ACP já rodam por um
  perfil personalizado; sem driver, a sonda e o `enforcementOf` deles cairiam no caminho da CLI
  personalizada.

## Consequências

- Entrar com uma ferramenta é escrever `drivers/<ferramenta>/<modo>.ts`, registrá-lo em
  `drivers/index.ts` e pôr a linha em `TOOLS`; `CONTRIBUTING.md` ("Como entra uma ferramenta de IA")
  descreve o caminho e a regra da recomendação.
- Nenhuma mudança visível: os testes existentes seguem verdes e não há entrada no CHANGELOG. Nenhum
  cenário novo em `test/scenarios/`: a execução do card não muda; os cenários ACP seguem verdes.
- A história 4 troca o corpo de `toolModeOf`; a 6 acrescenta o `Executor` ao mesmo registro; a 7 lê
  `TOOLS` na tela e traduz as fichas; a 8 e a 10 movem os modos do Gemini de `planned` para `modes`.
