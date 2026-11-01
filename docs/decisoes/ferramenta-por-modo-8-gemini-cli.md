# Ferramenta por modo, 8: Gemini pela CLI

> História 8 da épica [Ferramenta por modo: o Gemini em CLI, ACP e API](epica-ferramenta-por-modo.md).
> Entregue em 2026-10-23, depois da [história 10](ferramenta-por-modo-10-gemini-api-mcp.md) (Gemini pela
> API), de quem reaproveita a troca de modo no Conectar e a leitura de modelos pela API. Desenho no
> [registro da épica](ferramenta-por-modo-gemini.md), seção "Os três modos do Gemini".

## Contexto

O Gemini já rodava pelo ACP (história 7) e pela API (10). Faltava o terceiro modo, a CLI de uma passada
(`gemini -p`), que a épica deixou como "candidato a exclusivo com evidência": a home isolada por
`GEMINI_CLI_HOME` decide o que a CLI carrega da conta da pessoa, e as sondas decidem se isso basta.

### O que foi conferido, e onde

Fontes oficiais lidas em 2026-10-23: geminicli.com/docs/cli/headless (eventos do `stream-json`, códigos
de saída), /docs/reference/configuration (precedência dos settings, `GEMINI_CLI_HOME`,
`GEMINI_CLI_SYSTEM_SETTINGS_PATH`, `context.*`, `tools.core`/`allowed`, `mcp.allowed`, `skills`,
`hooksConfig`, `experimental.enableAgents`, `GOOGLE_GEMINI_BASE_URL`), /docs/cli/trusted-folders,
/docs/get-started/installation e ai.google.dev/api/models (`models.list`).

Lido no pacote instalado (`@google/gemini-cli` 0.65.0, `bundle/`), rótulo **verificado**:

- `homedir()` é `GEMINI_CLI_HOME` quando definida; o settings do usuário é `<home>/.gemini/settings.json`;
  o do sistema (`/Library/Application Support/GeminiCli/settings.json` no macOS) vale por cima de todos;
- `setGeminiMdFilename` sempre mantém o `GEMINI.md`: `context.fileName` não desliga a memória do projeto;
- os nomes das ferramentas MCP são `mcp_<servidor>_<operação>` (`generateValidName`);
- `-e none` desliga as extensões; os tipos de erro de ferramenta (`tool_not_registered`, `policy_violation`…).

Rodado de verdade, com o binário 0.65.0 contra uma API do Gemini **local e falsa**
(`GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:…`, chave fictícia; nenhuma chamada paga), rótulo **verificado**:

- o `stream-json` (`init`, `message` com `delta`, `tool_use`, `tool_result` com `error.type`, `error`,
  `result` com `stats` e `models`), o erro de cota diária (`TerminalQuotaError`, sem repetição) e o de chave
  inválida (400 `API_KEY_INVALID`) saem como `result` com `status: "error"`; as fixtures
  `test/fixtures/gemini-stream-json*.jsonl` são essas saídas, gravadas com o comando exato do provider;
- `-p ""` junta o pedido vindo pela entrada padrão;
- no modo de uma passada, uma ferramenta só é declarada ao modelo quando está em `tools.allowed` (o `trust`
  do servidor e o `yolo` não bastam para as operações MCP); `tools.core: []` não registra nenhuma;
- `context.memoryBoundaryMarkers: []` corta o `GEMINI.md` dos ancestrais; o da pasta do projeto e o das
  `--include-directories` continuam sendo lidos;
- a sonda nova (`runGeminiProbes`) rodou com o binário real e deu: conversa nova, permissões, MCP (servidor
  permitido, servidor proibido, escopo da operação) e delegação **provados**; artefatos com
  `project-sentinel` e `additional-directory-sentinel` **falhos** (`user-sentinel`, `ancestor-sentinel` e
  `managed-settings` passaram). O regime que sai das provas é o **compatível**.

## Decisão

- **Driver `gemini/cli`** (`src/extension/ai/drivers/gemini/cli.ts`), registrado ao lado de `gemini/acp` e
  `gemini/api`; o catálogo `TOOLS` passa a oferecer o modo CLI do Gemini (com a ficha), sem modo planejado.
  A execução é o executor de CLI de sempre; o comando e o leitor são do provider novo
  (`ai/providers/gemini.ts`), que `providerFor` devolve para o Gemini pronto no modo CLI
  (`CATALOG_CLI_PROVIDERS`: o Gemini não entrou em `AiBase`, como decidiu a história 5).
- **O comando**: `gemini -p "" --output-format stream-json --approval-mode <nível> --skip-trust -e none
  --allowed-mcp-server-names <servidor>… --include-directories <pasta>… -m <modelo>`, com o pedido pela
  entrada padrão (nada de prompt no cmd.exe) e a lista de argumentos, nunca uma string de shell.
  `--approval-mode` por nível (`default`, `auto_edit`, `yolo`); a restrição de verdade é o registro.
- **A home isolada por execução**: `HeadlessCommand.tempHome { env, files }`. O transporte (`materialize`)
  cria a pasta dentro da pasta temporária da execução (`fazai-run-*`, 0700, arquivos 0600), põe o caminho na
  variável e apaga tudo no fim, com o que a CLI gravou nela; a limpeza das pastas antigas (`cleanStaleTemp`)
  já cobre o caso do editor fechado no meio. O `settings.json` leva: autenticação por chave, sem estatística
  de uso nem atualização automática, os servidores MCP do card (no formato do Gemini: `command`/`httpUrl`/`url`,
  com `includeTools` das operações admitidas), `mcp.allowed`, `tools.core` e `tools.allowed` (as ferramentas
  e as operações `mcp_<servidor>_<operação>`), skills e hooks desligados, `experimental.enableAgents: false`
  e `context.memoryBoundaryMarkers: []`. Fora da admissão (o runner legado, como o Claude pronto), as
  ferramentas são as do nível dentro das do card, traduzidas para os nomes do Gemini (`geminiToolsFor`).
- **A chave só no ambiente.** O provider declara só o nome (`apiKeyEnv: 'GEMINI_API_KEY'`); o driver põe o
  valor (`apiKey`) no comando na hora do `spawn`, depois de o gateway conferir o comando, e o `spawnHeadless`
  o aplica por cima do ambiente do processo. O validador da admissão compara o nome declarado e recusa uma
  chave em comando que não a declara. A chave não está nos argumentos, no `env` do comando, no settings, no
  vínculo (`bindingContext` não a usa), no log (o gateway mascara) nem no `ai_runs`.
- **O `.env` da pasta não redireciona a chave** (achado na revisão do #376, reproduzido com a 0.65.0). Com
  `--skip-trust` a CLI liga `GEMINI_CLI_TRUST_WORKSPACE` e o `loadEnvironment` carrega o primeiro `.gemini/.env`
  ou `.env` subindo da pasta (inclusive o `~/.gemini/.env` da pessoa acima do projeto), aplicando só as
  variáveis ainda não definidas: um `.env` com `GOOGLE_GEMINI_BASE_URL` mandava o `x-goog-api-key` com a chave
  do cofre para outro servidor. Agora as variáveis que a 0.65.0 lê para endpoint, credencial, autenticação,
  cabeçalhos, proxy, pedido de sistema e carga do Node (`GEMINI_PINNED_ENV`, lidas no pacote) vão fixadas no
  ambiente do comando: as que o host não define, vazias (a CLI as lê como ausentes e o `.env` não as
  sobrescreve); as que o host define, o processo já herda. O settings liga `advanced.ignoreLocalEnv` (o `.env`
  genérico das pastas sai; o `.gemini/.env` não tem chave que o desligue, por isso a fixação). A
  `GEMINI_API_KEY` não é fixada: com a chave no cofre, o `spawn` a define; sem ela, vale o login da pessoa.
  Não dá para tirar o `--skip-trust`: sem a pasta confiada, a CLI encerra no modo de uma passada
  (`FatalUntrustedWorkspaceError`) e não conecta os servidores MCP; desligar o `folderTrust` daria o mesmo
  efeito. As sondas ganharam um `.env` hostil no projeto e um `.gemini/.env` no ancestral (o lugar do
  `~/.gemini/.env` acima do projeto), cada um pedindo um cabeçalho sentinela (`GEMINI_CLI_CUSTOM_HEADERS`) que a
  API local enxerga; e o cenário F confere o ambiente final do processo falso com os dois arquivos.
- **O shell do modelo não vê a chave**: o settings liga `security.environmentVariableRedaction` (`enabled`,
  com `blocked: ['GEMINI_API_KEY', 'GOOGLE_API_KEY']`; a CLI também tira pelo nome `/KEY/`,
  `sanitizeEnvironment`). Sem isso o `run_shell_command` imprimia a chave (reproduzido com a 0.65.0). A sonda
  roda uma passada com o shell liberado que imprime as duas variáveis: a chave na resposta, ou o shell que não
  rodou, derruba o `forbidden-tool` (`ProbeRun.secretInShell`; a sonda do Claude não roda shell e não muda).
- **A admissão do comando com a home**: a variável da home fica fora da comparação do ambiente, e o conteúdo
  gravado nela é conferido arquivo a arquivo, como o dos `tempFiles`; trocar o settings depois da admissão ou
  apontar outra home é recusado.
- **O vínculo**: o de toda CLI (o comando com a saída estruturada, o settings incluído) mais o digest da
  configuração gerenciada do Gemini (`settings.json`, `system-defaults.json` e `policies/` do sistema, ou o
  que `GEMINI_CLI_SYSTEM_SETTINGS_PATH`/`GEMINI_CLI_SYSTEM_DEFAULTS_PATH` apontam), que vale por cima da home
  do board. Os vínculos do Claude e do ACP não mudaram (a régua `test/helpers/bindingReference.ts` segue
  verde, e o teste novo compara o ACP pronto do Gemini com ela); o modo é outro vínculo, então a prova do ACP
  não vale para a CLI.
- **A tabela de ferramentas da admissão** é a do Gemini (`AGENT_TOOLS.gemini`): `executorToolOf` dá
  `gemini` para o Gemini pronto no modo CLI, e `CLI_TOOL_MAPPING` passou a `['claude', 'gemini']`.
  `isAcpProfile` não diz ACP para o Gemini pronto no modo CLI (o agente do código continua na
  configuração), com a exceção explícita só dele.
- **As sondas** (`runGeminiProbes`): a mesma estrutura e os mesmos checks das do Claude (`evaluateProbes`
  com `GEMINI_PROBE_NAMES`), contra uma API do Gemini local e o servidor MCP de teste por HTTP. Sentinelas no
  `GEMINI.md` do projeto, do ancestral (até a pasta com `.git`), da pasta adicional e da home da pessoa (a
  `HOME` da fixture, com uma extensão que traz o próprio contexto e um servidor MCP proibido, também no
  settings do projeto). O controle roda sem as barreiras (sem a home do board, sem `-e none` e sem
  `--allowed-mcp-server-names`) e precisa enxergar cada sentinela. O regime vem de `regimeFromEvidence`.
- **O Conectar** (o de toda ferramenta, com a troca de modo da história 10): o cartão CLI troca o modo do
  mesmo perfil `gemini`; a chave é conferida pela API (`apiModels`, o mesmo leitor do modo API, que lista os
  modelos para o catálogo) e não pelo `authenticate` do ACP: a regra do Connector passou a "quem lista
  modelos pela API confere a chave por ela". Trocar de modo revoga a ciência do modo anterior (o ACP e a CLI
  carregam coisas diferentes).
- **O leitor `gemini-stream-json`** (`aiOutput/gemini.ts`): tokens somados por modelo do `result.stats`
  (entrada sem o cache, cache lido, saída com o raciocínio, que é o resto do total), sem custo; o inventário
  são as chamadas `tool_use` que rodaram; a recusa da CLI (`tool_not_registered`, `policy_violation`,
  parâmetros inválidos) não entra, porque nada rodou e contá-la seria um desvio falso; a chamada sem
  resultado conta (pode ter rodado). A cota esgotada liga `usageLimitReached`; a chave recusada vira login
  vencido pelos padrões do Gemini em `profileAuth` (só no modo CLI).
- **A conferência**: `GEMINI_TOOL_EQUIVALENTS` (`shared/agentTools.ts`) dá os equivalentes no vocabulário do
  card de cada nome do Gemini, como `ACP_KIND_EQUIVALENTS` faz para o ACP. A tabela só vale para o inventário
  do Gemini pela CLI (`checkRun(..., 'gemini')`, que o gateway passa pelo perfil): o Cursor também grava nomes
  minúsculos (`glob`, `read`, `shell`), e uma tabela global leria o `glob` dele como o do Gemini (achado na
  revisão do #376). Os kinds do ACP seguem valendo para todo inventário, como antes.
- **`isGeminiCli`** é `isReadyCli(perfil) && tool === 'gemini'`: só o perfil pronto, não um do catálogo com
  outra identidade. A cópia de um Gemini (pronto, ou cópia dele, em qualquer modo) é o personalizado com o
  agente, sempre em `acp`.

## Onde a especificação não cabia no código

- **"Exclusivo se as sondas passarem"**: com a 0.65.0 elas não passam. O `GEMINI.md` da pasta do projeto
  (e o das pastas adicionais) é lido mesmo com a home isolada, e nenhuma configuração do usuário o desliga
  (`setGeminiMdFilename` sempre mantém o `GEMINI.md`). Sobrepor as configurações do sistema
  (`GEMINI_CLI_SYSTEM_SETTINGS_PATH`) não resolveria o arquivo do projeto e ainda desligaria as políticas
  do administrador; ficou de fora. O perfil roda no compatível, com a ciência.
- **"`listModels` pela API com a mesma chave"**: virou `apiModels`, o método que a história 10 criou para o
  modo API, reaproveitando o leitor dela; `listModels` continua sendo o da lista por comando.
- **O runner legado** roda o Gemini pronto no modo CLI sem admissão (como o Claude pronto), com as
  ferramentas do nível dentro das do card; no `v1` vale a decisão da admissão.
- **O relatório de erro da CLI** (`/tmp/gemini-client-error-*.json`, gravado pela própria CLI no tmp do
  sistema) fica fora da home isolada; não leva a chave.

## Alternativas descartadas

- **Chave no `settings.json` temporário**: ficaria em claro no disco durante a execução; o ambiente basta.
- **Chave pela gateway por fora do driver**: o validador da admissão compara o comando inteiro; o nome
  declarado pelo provider e o valor posto pelo driver deixam a regra num lugar só.
- **Home fixa por perfil**: o vínculo seria estável sem a variável fora da comparação, mas a CLI grava
  sessões e histórico nela, e a home deixaria de ser descartável.
- **Contar as chamadas recusadas no inventário**: a conferência acusaria desvio onde nada rodou.
- **`trust: true` nos servidores para dispensar a aprovação**: conferido que não declara as operações no
  modo de uma passada; `tools.allowed` é o que vale.

## Consequências

- O cartão **CLI** do Gemini aparece em Conectar ferramenta; o perfil é o mesmo dos outros dois modos.
- Cenário novo `test/scenarios/cardGeminiCli.scenario.test.ts`: o card com o agente do board pelo Gemini
  CLI, com o processo falso emitindo o `stream-json` gravado: sem desvio falso (o shell recusado pela CLI),
  com o desvio real pego (o shell que rodou sem `Bash` no card), a home apagada, a chave só no ambiente, o
  login vencido e a cota. O verificador ganhou um teste com uma CLI falsa (`test/fakes/geminiCli.mjs`) que
  carrega o que a 0.65.0 carrega.
- Docs: `docs/harness.md` e `docs/harness_EN.md` ("O Gemini pela CLI"), README e CHANGELOGs.
