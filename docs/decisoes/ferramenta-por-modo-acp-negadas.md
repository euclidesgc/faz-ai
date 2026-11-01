# Ferramenta por modo: ferramentas negadas pelo card impostas no ACP

> Correção da épica [Ferramenta por modo](epica-ferramenta-por-modo.md). Fecha a pendência registrada na
> [história 11](ferramenta-por-modo-11-gemini-api-arquivos-shell.md) ("`deniedTools` do card respeitado":
> corrigido só no modo API). 2026-10-23.

## Contexto

Na execução ACP admitida (regime compatível ou exclusivo), a admissão trocava as listas do card pelas da
decisão: `deniedTools` ficava só com a delegação (`Agent`, `Task`, `SendMessage`, `ListAgents`) e `tools`
vazio (o ACP não tem lista de allow). O `boardDecision` comparava as negadas com o começo do título do pedido,
no vocabulário do agente. Resultado, confirmado por um cenário que falhava: um card com `deniedTools: ['Bash']`
em `full` recebia "permitido" para um pedido de kind `execute`.

## Decisão

- **A admissão leva as listas do card ao ACP** (`admission.ts`, `transport === 'acp'`): as negadas do card
  somam às da delegação, e a lista `tools` do card vai inteira (no vocabulário do card), para o registro e a
  conferência. O registro da admissão mostra o que fica liberado, como no modo API.
- **O `boardDecision` traduz o pedido para o vocabulário do card** pela mesma tabela da conferência
  (`ACP_KIND_EQUIVALENTS`, em `src/shared/runCheck.ts`). A regra é uma função só, `equivalentsBreach`, que a
  conferência (`toolDeviates`) também usa. Em tempo real só a negação é imposta: recusa quando algum
  equivalente está em `deniedTools`, respondendo com a opção de rejeição (`reject_once`) do pedido. Kind sem
  equivalente (`think`, `switch_mode`, `other`) ou desconhecido segue o nível, como antes. `delete` e `move`
  têm `Bash` entre os equivalentes.
- **A lista `tools` do card é conferida, não imposta**, como no modo API (história 11) e coerente com
  `ACP_ENFORCEMENT.tools: 'advised'`. O pedido de um kind sem equivalente na lista é liberado pelo nível, e
  a conferência acusa o desvio na conversa do card (`runCheckNotice`).
- **O nome interno do Gemini CLI vale antes do kind.** O protocolo não tem campo com o nome da ferramenta
  (agentclientprotocol.com/protocol/tool-calls: `toolCallId`, `title`, `kind`, `rawInput`). No Gemini CLI
  0.65.0 (pacote instalado, lido em 2026-10-23) o `Turn` monta o id como `<nome>__<id>`
  (`handlePendingFunctionCall`, `bundle/chunk-DKZARV6U.js`) e o modo ACP manda esse id no
  `session/request_permission` (`runTool`, `bundle/gemini-GLQ4MVLB.js`). `AcpAgent.nativeToolOf` lê o nome
  só quando ele está em `GEMINI_TOOL_EQUIVALENTS`; os outros agentes não têm o campo e decidem pelo kind.
- **Ferramenta MCP pelo nome do card.** Reconhecida a chamada MCP (`mcpTitle`), `mcp__srv__x`,
  `mcp__srv__*` ou `mcp__srv` negados recusam a ferramenta (`deniesMcpTool`). O modo API pergunta pelo
  mesmo nome. A lista `tools` não se aplica a MCP: vale o servidor do card.
- **Um título não faz uma chamada virar MCP** (revisão de segurança). O título é texto do agente (no Gemini,
  o do shell é o comando que o modelo escreveu), e a chamada lida como MCP de um servidor do card pula as
  negadas e o nível. `acpMcpToolOf`, o mesmo na decisão e no leitor da conferência, segue esta ordem:
  - o nome interno no id não é MCP;
  - `execute`, `delete` e `move` nunca são MCP;
  - no agente que põe o nome MCP no id (`mcpToolOfId`, o Gemini: `mcp_<servidor>_<ferramenta>__<id>`,
    `DiscoveredMCPTool.getFullyQualifiedName`, pacote 0.65.0), só o id classifica; o título só confere;
  - pelo título, só o kind `other` ou ausente. Qualquer kind com significado (`read`, `edit`, `search`,
    `fetch`) ou desconhecido (inclusive com caractere invisível) é julgado pelo kind, nunca como MCP;
  - com `mcpTitle`, o título inteiro (`^…$`); sem ele, o servidor como palavra no começo do título
    (`^<servidor>([:/ ._-]|$)`, nome normalizado, o mais longo primeiro), nunca em qualquer lugar.
- **O id MCP do Gemini é ambíguo pelo `_`** (`mcp_github_enterprise_x`). Com o servidor no título
  (`(<servidor> MCP Server)`), o id precisa começar por ele, senão a chamada fica com um servidor ambíguo e é
  recusada. Sem ele, vale o servidor do card que é o prefixo mais longo, com `_` logo depois.
- **Nome MCP truncado pelo Gemini** (com `...`, acima de 64 caracteres): qualquer negada daquele servidor nega.
- **O ACP do Gemini não isola a home** (`~/.gemini`): a sessão pode ter servidores MCP de fora do card. Isso é
  coberto pela recusa do servidor fora do card e pela checagem de prefixo e do título acima.
- **Nome interno e kind divergentes.** Num pedido `execute`, `delete` ou `move`, os equivalentes do kind somam
  aos do nome interno.
- **Fecha na dúvida.** O kind é lido em minúsculas. Com negadas do card além da delegação, um pedido sem nome
  interno e com kind `other`, sem kind ou desconhecido é recusado, como o modo API recusa o nome que não
  reconhece. `think` e `switch_mode` seguem o nível.
- **Negada fora do vocabulário do card bloqueia a admissão** (`unsupported-native-restriction`, como no modo
  API): `Bash(rm:*)` ou `bash` não têm tradução para o pedido do agente. `isCardToolName` reusa a lista que o
  modo API aceita (`KNOWN_TOOL_NAMES`, com os nomes nativos de cada ferramenta, como o `FetchURL` do Kimi, e
  nomes como `KillShell`, `LS`, `NotebookRead`) e o formato MCP dele (`MCP_DENY_ENTRY`: `mcp__my.srv__x`,
  `mcp__srv__x*`), mas na grafia exata.
- **Nome MCP normalizado nos dois lados.** `deniesMcpTool` normaliza servidor e ferramenta (a entrada também)
  e não diferencia maiúsculas (`mcp__docs__search` nega `docs: Search`), errando para negar; `mcp__srv__x*`
  nega pelo prefixo.
- **Sem depender do yolo.** A execução admitida tem `toolSet: 'explicit'` e a delegação negada, então
  `acpSessionMode` nunca pede o modo sem perguntas e o board responde cada pedido (a admissão recusa se
  pedisse).

## Alternativa descartada

- **Impor também a lista `tools` no pedido** (recusar o kind sem equivalente nela). Seria parcial: o que o
  agente roda sem pedir permissão (a leitura, no modo padrão do Gemini) nem passa pelo board. E quebraria o
  condutor do board no Gemini, que não lista `Edit`/`Write` e não tem subagentes para quem delegar a
  edição. Ficaria também assimétrico com o modo API, onde a lista é só conferida.

## Consequências

- As negadas do card valem igual no ACP e no modo API; a lista `tools` é conferida nos dois.
- Um `activate_skill` do Gemini com `Skill` negado no card é recusado pelo nome, mesmo com o kind `other`.

## Limites conhecidos

- **O kind é declarado pelo agente.** Um agente que rode um comando declarando `read` é julgado como leitura: o
  board não vê a ferramenta real. No Gemini o nome interno no id fecha isso; nos outros, não.
- **Ferramenta MCP do board sem o servidor no começo do título** (`get_card (faz-ai)`, por exemplo) não é
  reconhecida como MCP fora do Gemini: com kind `other`, é recusada quando o card nega alguma ferramenta
  (fecha na dúvida), mesmo em `full`.
- **Servidor de fora do card com nome mais longo no Gemini** (`github_enterprise` na `~/.gemini`, com só o
  `github` no card): sem o servidor no título, o id é lido pelo prefixo do card. A sessão não informa a lista
  de servidores que carregou.
- **Pendência:** capturar títulos reais do Cursor e do Kimi (e dos outros agentes do catálogo) para calibrar
  um `mcpTitle` de cada um; até lá vale o servidor no começo do título.
