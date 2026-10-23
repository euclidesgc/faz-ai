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
